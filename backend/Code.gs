/**
 * Code.gs — Web API エントリポイント / ルーティング / 認証
 *
 * 呼び出し規約:
 *   GET  : {exec}?action=xxx&key=API_KEY&user=surname&param=...
 *   POST : {exec}  body に JSON  {"action":"xxx","key":"API_KEY","payload":{"user":"surname",...}}
 *          Content-Type は必ず "text/plain;charset=utf-8" にすること。
 *          （application/json にすると CORS プリフライトが飛び、GAS が対応できず失敗する）
 *
 * 認証は2段構え:
 *   1. API_KEY … クライアントの識別（共有シークレット）
 *   2. user    … 苗字によるデータの切り分け。requiresUser の action では必須。
 *
 * レスポンスは常に 200 で返し、成否は body の ok フラグで表す。
 */

function getRoutes_() {
  return {
    ping:            { fn: api_ping_,            write: false, requiresUser: false },
    login:           { fn: api_login_,           write: true,  requiresUser: false },
    listUsers:       { fn: api_listUsers_,       write: false, requiresUser: false },
    getBootstrap:    { fn: api_getBootstrap_,    write: false, requiresUser: true  },
    getMenus:        { fn: api_getMenus_,        write: false, requiresUser: false },
    getGuides:       { fn: api_getGuides_,       write: false, requiresUser: false },
    getSuggestion:   { fn: api_getSuggestion_,   write: false, requiresUser: true  },
    getHistory:      { fn: api_getHistory_,      write: false, requiresUser: true  },
    getDashboard:    { fn: api_getDashboard_,    write: false, requiresUser: true  },
    startSession:    { fn: api_startSession_,    write: true,  requiresUser: true  },
    finishSession:   { fn: api_finishSession_,   write: true,  requiresUser: true  },
    deleteSession:   { fn: api_deleteSession_,   write: true,  requiresUser: true  },
    saveUserSetting: { fn: api_saveUserSetting_, write: true,  requiresUser: true  },
    saveSetting:     { fn: api_saveSetting_,     write: true,  requiresUser: false },
    upsertMenu:      { fn: api_upsertMenu_,      write: true,  requiresUser: false }
  };
}

function doGet(e)  { return handleRequest_(e, 'GET'); }
function doPost(e) { return handleRequest_(e, 'POST'); }

function handleRequest_(e, method) {
  try {
    var req = parseRequest_(e, method);
    authorize_(req);

    var route = getRoutes_()[req.action];
    if (!route) throw apiError_('UNKNOWN_ACTION', '未知のaction: ' + req.action);
    if (route.write && method !== 'POST') {
      throw apiError_('METHOD_NOT_ALLOWED', req.action + ' は POST で呼び出してください。');
    }

    var payload = req.payload || {};
    var user = route.requiresUser ? resolveUser_(payload) : null;
    var data = route.fn(payload, user);
    return jsonOut_({ ok: true, data: data });

  } catch (err) {
    var code = (err && err.apiCode) ? err.apiCode : 'INTERNAL_ERROR';
    console.error(method + ' ' + (e && e.parameter ? e.parameter.action : '?') + ' : ' + (err && err.stack));
    return jsonOut_({ ok: false, error: { code: code, message: String(err && err.message || err) } });
  }
}

function parseRequest_(e, method) {
  var params = (e && e.parameter) ? e.parameter : {};
  var body = {};
  if (method === 'POST' && e && e.postData && e.postData.contents) {
    try {
      body = JSON.parse(e.postData.contents);
    } catch (err) {
      throw apiError_('BAD_JSON', 'リクエストボディのJSONが不正です。');
    }
  }
  var payload = body.payload || {};
  Object.keys(params).forEach(function (k) {
    if (k === 'action' || k === 'key') return;
    if (payload[k] === undefined) payload[k] = params[k];
  });
  return {
    action: body.action || params.action || '',
    key: body.key || params.key || '',
    payload: payload
  };
}

function authorize_(req) {
  if (req.key !== getProp_('API_KEY')) {
    throw apiError_('UNAUTHORIZED', 'APIキーが一致しません。設定画面のキーを確認してください。');
  }
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function apiError_(code, message) {
  var e = new Error(message);
  e.apiCode = code;
  return e;
}

function requireFields_(payload, fields) {
  fields.forEach(function (f) {
    if (payload == null || payload[f] === undefined || payload[f] === '') {
      throw apiError_('BAD_REQUEST', '必須パラメータ ' + f + ' がありません。');
    }
  });
}

/* ------------------------------------------------------------------ */
/* API ハンドラ                                                        */
/* ------------------------------------------------------------------ */

function api_ping_() {
  return { pong: true, now: new Date().toISOString(), tz: getTimezone_() };
}

/**
 * ログイン / 新規登録
 * payload: { surname, confirmCreate? }
 *   未登録の苗字で confirmCreate が無いときは registered:false を返すだけで、
 *   シートは作らない。フロントで「新規登録しますか？」を確認してから
 *   confirmCreate:true で再送する。
 */
function api_login_(payload) {
  requireFields_(payload, ['surname']);
  var surname = assertSurname_(normalizeSurname_(payload.surname));
  var user = findUser_(surname);

  if (!user) {
    if (!payload.confirmCreate) {
      return { surname: surname, registered: false, created: false, needsConfirm: true };
    }
    user = createUser_(surname);
    return { surname: surname, registered: true, created: true, user: publicUser_(user) };
  }

  touchUser_(user);
  return { surname: surname, registered: true, created: false, user: publicUser_(user) };
}

/** 内部フィールド（_row）を落として返す */
function publicUser_(user) {
  return {
    surname: user.surname,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    monthlyTargetWorkouts: user.monthlyTargetWorkouts,
    monthlyTargetVolume: user.monthlyTargetVolume,
    weightIncrement: user.weightIncrement,
    restMinutes: user.restMinutes
  };
}

/** ログイン画面の候補表示用（苗字のみ） */
function api_listUsers_() {
  return { users: listUserNames_() };
}

/** 起動時に必要なものを1回でまとめて返す */
function api_getBootstrap_(payload, user) {
  return {
    user: publicUser_(user),
    menus: readMenus_(),
    guides: readGuides_(),
    settings: getSettings_(),
    dashboard: buildDashboard_(user, null),
    openSession: findOpenSession_(user)
  };
}

function api_getMenus_() {
  return { menus: readMenus_() };
}

function api_getGuides_(payload) {
  if (payload && String(payload.refresh) === 'true') clearGuideCache_();
  return { guides: readGuides_() };
}

/** payload: { user, part, menu, manualWeight?, manualDelta?, increment?, sets? } */
function api_getSuggestion_(payload, user) {
  requireFields_(payload, ['part', 'menu']);
  var conf = findMenuConfig_(payload.part, payload.menu);
  var history = readMenuHistory_(user, payload.part, payload.menu, 6);
  return {
    suggestion: suggestNextLoad_(history, conf, getSettings_(), user, payload),
    menuConfig: conf,
    history: history
  };
}

/** payload: { user, part, menu, limit? } */
function api_getHistory_(payload, user) {
  requireFields_(payload, ['part', 'menu']);
  return { history: readMenuHistory_(user, payload.part, payload.menu, Number(payload.limit || 10)) };
}

/** payload: { user, month? } */
function api_getDashboard_(payload, user) {
  return buildDashboard_(user, payload && payload.month ? String(payload.month) : null);
}

/** payload: { user, parts?, menus?, restMinutes?, memo? } */
function api_startSession_(payload, user) {
  return startSession_(user, payload || {});
}

/** payload: { user, sessionId, startTime, endTime, date, memo?, restMinutes?, entries[] } */
function api_finishSession_(payload, user) {
  requireFields_(payload, ['sessionId', 'entries']);
  return finishSession_(user, payload);
}

/** payload: { user, sessionId } */
function api_deleteSession_(payload, user) {
  requireFields_(payload, ['sessionId']);
  return deleteSession_(user, String(payload.sessionId));
}

/** payload: { user, key, value } — 個人設定（月間目標・増量幅・休憩時間） */
function api_saveUserSetting_(payload, user) {
  requireFields_(payload, ['key']);
  var updated = saveUserSetting_(user, String(payload.key), payload.value);
  return { user: publicUser_(updated) };
}

/** payload: { key, value } — 全員共通の既定値 */
function api_saveSetting_(payload) {
  requireFields_(payload, ['key', 'value']);
  writeSetting_(String(payload.key), payload.value);
  return { settings: getSettings_(true) };
}

/** payload: Menus シート1行分 */
function api_upsertMenu_(payload) {
  requireFields_(payload, ['part', 'menu']);
  upsertMenu_(payload);
  return { menus: readMenus_(true) };
}
