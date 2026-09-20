/**
 * Code.gs — Web API エントリポイント / ルーティング / 認証
 *
 * 呼び出し規約:
 *   GET  : {exec}?action=xxx&key=API_KEY&param1=...
 *   POST : {exec}?  body に JSON  {"action":"xxx","key":"API_KEY","payload":{...}}
 *          Content-Type は必ず "text/plain;charset=utf-8" にすること。
 *          （application/json にすると CORS プリフライトが飛び、GAS が対応できず失敗する）
 *
 * レスポンスは常に 200 で返し、成否は body の ok フラグで表す。
 *   成功: {"ok":true,  "data": ...}
 *   失敗: {"ok":false, "error":{"code":"...","message":"..."}}
 */

/**
 * action 名 -> ハンドラ関数。write:true のものは POST 専用。
 * 関数参照は遅延解決（getRoutes_）することで、ファイル分割順に依存しないようにする。
 */
function getRoutes_() {
  return {
    ping:          { fn: api_ping_,          write: false },
    getBootstrap:  { fn: api_getBootstrap_,  write: false },
    getMenus:      { fn: api_getMenus_,      write: false },
    getGuides:     { fn: api_getGuides_,     write: false },
    getSuggestion: { fn: api_getSuggestion_, write: false },
    getHistory:    { fn: api_getHistory_,    write: false },
    getDashboard:  { fn: api_getDashboard_,  write: false },
    startSession:  { fn: api_startSession_,  write: true  },
    finishSession: { fn: api_finishSession_, write: true  },
    deleteSession: { fn: api_deleteSession_, write: true  },
    saveSetting:   { fn: api_saveSetting_,   write: true  },
    upsertMenu:    { fn: api_upsertMenu_,    write: true  }
  };
}

function doGet(e) {
  return handleRequest_(e, 'GET');
}

function doPost(e) {
  return handleRequest_(e, 'POST');
}

function handleRequest_(e, method) {
  try {
    var req = parseRequest_(e, method);
    authorize_(req);

    var route = getRoutes_()[req.action];
    if (!route) throw apiError_('UNKNOWN_ACTION', '未知のaction: ' + req.action);
    if (route.write && method !== 'POST') {
      throw apiError_('METHOD_NOT_ALLOWED', req.action + ' は POST で呼び出してください。');
    }

    var data = route.fn(req.payload || {});
    return jsonOut_({ ok: true, data: data });

  } catch (err) {
    var code = (err && err.apiCode) ? err.apiCode : 'INTERNAL_ERROR';
    console.error(method + ' ' + (e && e.parameter ? e.parameter.action : '?') + ' : ' + err.stack);
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
  // GET のクエリパラメータも payload としてマージ（action/key を除く）
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
  var expected = getProp_('API_KEY');
  if (req.key !== expected) {
    throw apiError_('UNAUTHORIZED', 'APIキーが一致しません。設定画面のキーを確認してください。');
  }
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function apiError_(code, message) {
  var e = new Error(message);
  e.apiCode = code;
  return e;
}

/* ------------------------------------------------------------------ */
/* API ハンドラ                                                        */
/* ------------------------------------------------------------------ */

function api_ping_() {
  return { pong: true, now: new Date().toISOString(), tz: getTimezone_() };
}

/** 起動時に必要なものを1回でまとめて返す（往復を減らす） */
function api_getBootstrap_() {
  return {
    menus: readMenus_(),
    guides: readGuides_(),
    settings: getSettings_(),
    dashboard: buildDashboard_(null),
    openSession: findOpenSession_()
  };
}

function api_getMenus_() {
  return { menus: readMenus_() };
}

function api_getGuides_(payload) {
  if (payload && String(payload.refresh) === 'true') clearGuideCache_();
  return { guides: readGuides_() };
}

/**
 * payload: { part, menu, manualDelta?, manualWeight?, targetRepMin?, targetRepMax? }
 */
function api_getSuggestion_(payload) {
  requireFields_(payload, ['part', 'menu']);
  var menuConf = findMenuConfig_(payload.part, payload.menu);
  var history = readMenuHistory_(payload.part, payload.menu, 6);
  var suggestion = suggestNextLoad_(history, menuConf, getSettings_(), payload);
  return {
    suggestion: suggestion,
    menuConfig: menuConf,
    history: history
  };
}

/** payload: { part, menu, limit? } */
function api_getHistory_(payload) {
  requireFields_(payload, ['part', 'menu']);
  var limit = Number(payload.limit || 10);
  return { history: readMenuHistory_(payload.part, payload.menu, limit) };
}

/** payload: { month? "YYYY-MM" } */
function api_getDashboard_(payload) {
  return buildDashboard_(payload && payload.month ? String(payload.month) : null);
}

/**
 * payload: { sessionId?, startTime?, parts?:[], menus?:[], condition?, memo? }
 * セッション開始を Sessions シートに「進行中」として1行入れる。
 */
function api_startSession_(payload) {
  return startSession_(payload || {});
}

/**
 * payload: {
 *   sessionId, startTime, endTime, condition?, memo?,
 *   entries: [{ part, menu, sets:[{ weight, reps, rpe?, isWarmup?, memo? }] }]
 * }
 */
function api_finishSession_(payload) {
  requireFields_(payload, ['sessionId', 'entries']);
  return finishSession_(payload);
}

/** payload: { sessionId } */
function api_deleteSession_(payload) {
  requireFields_(payload, ['sessionId']);
  return deleteSession_(String(payload.sessionId));
}

/** payload: { key, value } */
function api_saveSetting_(payload) {
  requireFields_(payload, ['key', 'value']);
  writeSetting_(String(payload.key), payload.value);
  return { settings: getSettings_(true) };
}

/** payload: Menus シート1行分のオブジェクト */
function api_upsertMenu_(payload) {
  requireFields_(payload, ['part', 'menu']);
  upsertMenu_(payload);
  return { menus: readMenus_(true) };
}

function requireFields_(payload, fields) {
  fields.forEach(function (f) {
    if (payload === null || payload === undefined || payload[f] === undefined || payload[f] === '') {
      throw apiError_('BAD_REQUEST', '必須パラメータ ' + f + ' がありません。');
    }
  });
}
