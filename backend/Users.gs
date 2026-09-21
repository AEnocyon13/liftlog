/**
 * Users.gs — 苗字によるログインと、ユーザーごとのシート管理
 *
 * ログインは苗字（小文字ローマ字のみ）1つで行う。パスワードは無く、
 * API キーを知っているクライアントだけが到達できる前提の簡易識別。
 * ユーザーを新規登録すると Logs_<姓> / Sessions_<姓> の2シートが作られる。
 */

var SURNAME_RE = /^[a-z]{1,20}$/;

/** 入力された苗字を正規化する。全角英字と空白は許容して変換する。 */
function normalizeSurname_(raw) {
  var s = String(raw == null ? '' : raw)
    .replace(/[Ａ-Ｚａ-ｚ]/g, function (c) {           // 全角英字 → 半角
      return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    })
    .replace(/[\s　]/g, '')
    .toLowerCase();
  return s;
}

/** 正規化済みの苗字を検証する。不正なら例外。 */
function assertSurname_(surname) {
  if (!SURNAME_RE.test(surname)) {
    throw apiError_('INVALID_SURNAME',
      '苗字は小文字のローマ字（a〜z）のみ、20文字以内で入力してください。');
  }
  return surname;
}

function usersSheet_() {
  return getSheet_(SHEETS.USERS, true);
}

/** 登録済みユーザーを1件返す（未登録なら null） */
function findUser_(surname) {
  var rows = readTable_(SHEETS.USERS);
  for (var i = 0; i < rows.length; i++) {
    if (normalizeSurname_(rows[i].surname) === surname) return toUser_(rows[i]);
  }
  return null;
}

function toUser_(row) {
  var d = defaultUserSettings_();
  return {
    surname: normalizeSurname_(row.surname),
    createdAt: String(row.createdAt || ''),
    lastLoginAt: String(row.lastLoginAt || ''),
    monthlyTargetWorkouts: num_(row.monthlyTargetWorkouts, d.monthlyTargetWorkouts),
    monthlyTargetVolume: num_(row.monthlyTargetVolume, d.monthlyTargetVolume),
    weightIncrement: num_(row.weightIncrement, d.weightIncrement),
    restMinutes: num_(row.restMinutes, d.restMinutes),
    memo: String(row.memo || ''),
    _row: row._row
  };
}

/** 登録済みの苗字一覧（ログイン画面の候補表示用） */
function listUserNames_() {
  return readTable_(SHEETS.USERS)
    .map(function (r) { return normalizeSurname_(r.surname); })
    .filter(function (s) { return SURNAME_RE.test(s); });
}

/** 新規ユーザーを登録し、専用シートを作成する */
function createUser_(surname) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var existing = findUser_(surname);
    if (existing) return existing;

    var ss = getSpreadsheet_();
    ensureSheet_(ss, logsSheetName_(surname), LOG_COLUMNS);
    ensureSheet_(ss, sessionsSheetName_(surname), SESSION_COLUMNS);
    formatDateColumnAsText_(ss.getSheetByName(logsSheetName_(surname)), LOG_COLUMNS.indexOf('date') + 1);
    formatDateColumnAsText_(ss.getSheetByName(sessionsSheetName_(surname)), SESSION_COLUMNS.indexOf('date') + 1);

    var now = new Date().toISOString();
    var d = defaultUserSettings_();
    usersSheet_().appendRow(toRow_(USER_COLUMNS, {
      surname: surname,
      createdAt: now,
      lastLoginAt: now,
      monthlyTargetWorkouts: d.monthlyTargetWorkouts,
      monthlyTargetVolume: d.monthlyTargetVolume,
      weightIncrement: d.weightIncrement,
      restMinutes: d.restMinutes,
      memo: ''
    }));
    return findUser_(surname);
  } finally {
    lock.releaseLock();
  }
}

/** 最終ログイン時刻を更新する */
function touchUser_(user) {
  try {
    var col = USER_COLUMNS.indexOf('lastLoginAt') + 1;
    usersSheet_().getRange(user._row, col).setValue(new Date().toISOString());
  } catch (e) { /* 記録できなくてもログインは通す */ }
}

/** 個人設定を1件更新する */
function saveUserSetting_(user, key, value) {
  var allowed = ['monthlyTargetWorkouts', 'monthlyTargetVolume', 'weightIncrement', 'restMinutes', 'memo'];
  if (allowed.indexOf(key) < 0) {
    throw apiError_('BAD_REQUEST', '変更できない設定です: ' + key);
  }
  var col = USER_COLUMNS.indexOf(key) + 1;
  usersSheet_().getRange(user._row, col).setValue(value);
  return findUser_(user.surname);
}

/**
 * リクエストの payload からログイン中のユーザーを解決する。
 * 未登録・未指定ならエラーにして、フロント側でログイン画面に戻す。
 */
function resolveUser_(payload) {
  var surname = normalizeSurname_(payload && payload.user);
  if (!surname) throw apiError_('NO_USER', 'ログインしてください。');
  assertSurname_(surname);
  var user = findUser_(surname);
  if (!user) throw apiError_('UNKNOWN_USER', surname + ' は登録されていません。ログイン画面から登録してください。');
  return user;
}
