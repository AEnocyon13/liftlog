/**
 * Code.gs — Web API エントリポイント / ルーティング / 認証
 *
 * 呼び出し規約:
 *   GET  : {exec}?action=xxx&key=API_KEY&user=surname&param=...
 *   POST : {exec}  body に JSON  {"action":"xxx","key":"API_KEY","payload":{"user":"surname",...}}
 *          Content-Type は必ず "text/plain;charset=utf-8" にすること。
 *          （application/json にすると CORS プリフライトが飛び、GAS が対応できず失敗する）
 *
 * 認証は3段構え:
 *   1. API_KEY … クライアントの識別（共有シークレット）。全 action に必須
 *   2. user    … 苗字によるデータの切り分け。requiresUser の action に必須
 *   3. token   … PINログインで発行される書き込み権限。requiresAuth の action に必須。
 *                覗き見モードではトークンが無いので、書き込み系はここで弾かれる。
 *
 * レスポンスは常に 200 で返し、成否は body の ok フラグで表す。
 */

function getRoutes_() {
  // write        … POST 専用
  // requiresUser … payload に苗字が必要
  // requiresAuth … PINログインで得たトークンが必要（＝覗き見では実行できない）
  return {
    ping:            { fn: api_ping_,            write: false, requiresUser: false, requiresAuth: false },
    login:           { fn: api_login_,           write: true,  requiresUser: false, requiresAuth: false },
    listUsers:       { fn: api_listUsers_,       write: false, requiresUser: false, requiresAuth: false },
    getBootstrap:    { fn: api_getBootstrap_,    write: false, requiresUser: true,  requiresAuth: false },
    getMenus:        { fn: api_getMenus_,        write: false, requiresUser: false, requiresAuth: false },
    getGuides:       { fn: api_getGuides_,       write: false, requiresUser: false, requiresAuth: false },
    getSuggestion:   { fn: api_getSuggestion_,   write: false, requiresUser: true,  requiresAuth: false },
    getHistory:      { fn: api_getHistory_,      write: false, requiresUser: true,  requiresAuth: false },
    getDashboard:    { fn: api_getDashboard_,    write: false, requiresUser: true,  requiresAuth: false },
    startSession:    { fn: api_startSession_,    write: true,  requiresUser: true,  requiresAuth: true  },
    finishSession:   { fn: api_finishSession_,   write: true,  requiresUser: true,  requiresAuth: true  },
    deleteSession:   { fn: api_deleteSession_,   write: true,  requiresUser: true,  requiresAuth: true  },
    saveUserSetting: { fn: api_saveUserSetting_, write: true,  requiresUser: true,  requiresAuth: true  },
    changePin:       { fn: api_changePin_,       write: true,  requiresUser: true,  requiresAuth: true  },
    saveSetting:     { fn: api_saveSetting_,     write: true,  requiresUser: true,  requiresAuth: true  },
    upsertMenu:      { fn: api_upsertMenu_,      write: true,  requiresUser: true,  requiresAuth: true  }
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
    if (route.requiresAuth) assertCanWrite_(payload, user);
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
 * ログイン / 新規登録 / PIN設定
 *
 * payload の組み合わせで分岐する。
 *   { surname }                                 … 状態を問い合わせる（未登録か、PIN未設定か）
 *   { surname, mode:'peek' }                    … 覗き見（閲覧のみ）。トークンは発行しない
 *   { surname, pin }                            … 本人としてログイン。トークンを発行する
 *   { surname, confirmCreate:true, displayName, pin } … 新規登録してログイン
 *   { surname, newPin }                         … PIN未設定の既存ユーザーがPINを決めてログイン
 */
function api_login_(payload) {
  requireFields_(payload, ['surname']);
  var surname = assertSurname_(normalizeSurname_(payload.surname));
  var user = findUser_(surname);
  var peek = String(payload.mode || '') === 'peek';

  /* --- 未登録 --- */
  if (!user) {
    if (!payload.confirmCreate) {
      return { surname: surname, registered: false, needsConfirm: true };
    }
    requireFields_(payload, ['displayName', 'pin']);
    user = createUser_(surname, payload.displayName, payload.pin);
    return loginResult_(user, true, false);
  }

  /* --- 覗き見（PIN不要・閲覧のみ） --- */
  if (peek) {
    return {
      surname: surname, registered: true, created: false, mode: 'peek',
      user: publicUser_(user)
    };
  }

  /* --- PIN未設定の既存ユーザー --- */
  if (!userHasPin_(user)) {
    if (!payload.newPin) {
      return { surname: surname, registered: true, needsPinSetup: true, user: publicUser_(user) };
    }
    user = setUserPin_(user, payload.newPin);
    if (payload.displayName) user = saveUserSetting_(user, 'displayName', payload.displayName);
    return loginResult_(user, false, true);
  }

  /* --- 通常のPINログイン --- */
  if (!payload.pin) {
    return { surname: surname, registered: true, needsPin: true, user: publicUser_(user) };
  }
  verifyPin_(user, payload.pin);
  return loginResult_(user, false, false);
}

function loginResult_(user, created, pinSet) {
  touchUser_(user);
  var t = issueToken_(user.surname);
  return {
    surname: user.surname,
    registered: true,
    created: Boolean(created),
    pinSet: Boolean(pinSet),
    mode: 'auth',
    token: t.token,
    expiresAt: t.expiresAt,
    user: publicUser_(user)
  };
}

/** payload: { user, token, currentPin, newPin } */
function api_changePin_(payload, user) {
  requireFields_(payload, ['currentPin', 'newPin']);
  verifyPin_(user, payload.currentPin);
  setUserPin_(user, payload.newPin);
  return { ok: true };
}

/** 内部フィールド（_row）を落として返す */
function publicUser_(user) {
  return {
    surname: user.surname,
    displayName: user.displayName,
    hasPin: userHasPin_(user),
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    monthlyTargetWorkouts: user.monthlyTargetWorkouts,
    monthlyTargetVolume: user.monthlyTargetVolume,
    weightIncrement: user.weightIncrement,
    restMinutes: user.restMinutes
  };
}

/** ログイン画面の候補表示用（苗字・氏名・PINの有無） */
function api_listUsers_() {
  return { users: listUsersPublic_() };
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

/** payload: { user, token, key, value } — 個人設定（氏名・月間目標・増量幅・休憩時間） */
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
