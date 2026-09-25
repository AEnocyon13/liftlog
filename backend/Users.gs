/**
 * Users.gs — 苗字によるログインと、ユーザーごとのシート管理
 *
 * ログインは「苗字（小文字ローマ字）＋4桁PIN」。PINを入れずに『覗き見』を選ぶと、
 * その人の記録を閲覧だけできる（書き込みは Auth.gs の assertCanWrite_ が拒否する）。
 * ユーザーを新規登録すると Logs_<姓> / Sessions_<姓> の2シートが作られる。
 */

var SURNAME_RE = /^[a-z]{1,20}$/;

/** 入力された苗字を正規化する。全角英字と空白は許容して変換する。 */
function normalizeSurname_(raw) {
  return String(raw == null ? '' : raw)
    .replace(/[Ａ-Ｚａ-ｚ]/g, function (c) {           // 全角英字 → 半角
      return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    })
    .replace(/[\s　]/g, '')
    .toLowerCase();
}

function assertSurname_(surname) {
  if (!SURNAME_RE.test(surname)) {
    throw apiError_('INVALID_SURNAME',
      '苗字は小文字のローマ字（a〜z）のみ、20文字以内で入力してください。');
  }
  return surname;
}

function assertDisplayName_(raw) {
  var s = String(raw == null ? '' : raw).trim().replace(/\s+/g, ' ');
  if (!s) throw apiError_('INVALID_NAME', '氏名を入力してください。');
  if (s.length > 40) throw apiError_('INVALID_NAME', '氏名は40文字以内で入力してください。');
  return s;
}

/* ---------- シートのヘッダに合わせた読み書き ---------- */

function usersSheet_() {
  return getSheet_(SHEETS.USERS, true);
}

/** シートの実際のヘッダを返す（列を後から足しても壊れないようにするため） */
function sheetHeader_(sheetName) {
  var sh = getSheet_(sheetName, true);
  var width = Math.max(1, sh.getLastColumn());
  return sh.getRange(1, 1, 1, width).getValues()[0].map(function (v) { return String(v).trim(); });
}

/** ヘッダ名を指定して1セルだけ書き換える */
function setUserCell_(row, key, value) {
  var col = sheetHeader_(SHEETS.USERS).indexOf(key) + 1;
  if (col < 1) throw apiError_('INTERNAL_ERROR', 'Users シートに ' + key + ' 列がありません。upgradeToV2() を実行してください。');
  usersSheet_().getRange(row, col).setValue(value);
}

/* ---------- 参照 ---------- */

function findUser_(surname) {
  var rows = readTable_(SHEETS.USERS);
  for (var i = 0; i < rows.length; i++) {
    if (normalizeSurname_(rows[i].surname) === surname) return toUser_(rows[i]);
  }
  return null;
}

function toUser_(row) {
  var d = defaultUserSettings_();
  var surname = normalizeSurname_(row.surname);
  return {
    surname: surname,
    displayName: String(row.displayName || '').trim() || surname,
    pinHash: String(row.pinHash || '').trim(),
    pinSalt: String(row.pinSalt || '').trim(),
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

/** ログイン画面の候補表示用。PINの有無も返す（ハッシュ自体は出さない） */
function listUsersPublic_() {
  return readTable_(SHEETS.USERS)
    .map(function (r) { return toUser_(r); })
    .filter(function (u) { return SURNAME_RE.test(u.surname); })
    .map(function (u) {
      return { surname: u.surname, displayName: u.displayName, hasPin: userHasPin_(u) };
    });
}

/** 苗字だけの一覧（Setup のログ表示などに使う） */
function listUserNames_() {
  return listUsersPublic_().map(function (u) { return u.surname; });
}

/* ---------- 作成・更新 ---------- */

/** 新規ユーザーを登録し、専用シートを作成する */
function createUser_(surname, displayName, pin) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (findUser_(surname)) return findUser_(surname);

    var ss = getSpreadsheet_();
    ensureSheet_(ss, logsSheetName_(surname), LOG_COLUMNS);
    ensureSheet_(ss, sessionsSheetName_(surname), SESSION_COLUMNS);
    formatDateColumnAsText_(ss.getSheetByName(logsSheetName_(surname)), LOG_COLUMNS.indexOf('date') + 1);
    formatDateColumnAsText_(ss.getSheetByName(sessionsSheetName_(surname)), SESSION_COLUMNS.indexOf('date') + 1);

    var now = new Date().toISOString();
    var d = defaultUserSettings_();
    var rec = {
      surname: surname,
      displayName: displayName ? assertDisplayName_(displayName) : surname,
      createdAt: now,
      lastLoginAt: now,
      monthlyTargetWorkouts: d.monthlyTargetWorkouts,
      monthlyTargetVolume: d.monthlyTargetVolume,
      weightIncrement: d.weightIncrement,
      restMinutes: d.restMinutes,
      memo: ''
    };
    if (pin) {
      var f = buildPinFields_(pin);
      rec.pinHash = f.pinHash;
      rec.pinSalt = f.pinSalt;
    }
    usersSheet_().appendRow(toRow_(sheetHeader_(SHEETS.USERS), rec));
    return findUser_(surname);
  } finally {
    lock.releaseLock();
  }
}

function touchUser_(user) {
  try { setUserCell_(user._row, 'lastLoginAt', new Date().toISOString()); }
  catch (e) { /* 記録できなくてもログインは通す */ }
}

/** PIN を設定・変更する */
function setUserPin_(user, pin) {
  var f = buildPinFields_(pin);
  setUserCell_(user._row, 'pinSalt', f.pinSalt);
  setUserCell_(user._row, 'pinHash', f.pinHash);
  return findUser_(user.surname);
}

/** 個人設定を1件更新する */
function saveUserSetting_(user, key, value) {
  var allowed = ['displayName', 'monthlyTargetWorkouts', 'monthlyTargetVolume',
                 'weightIncrement', 'restMinutes', 'memo'];
  if (allowed.indexOf(key) < 0) throw apiError_('BAD_REQUEST', '変更できない設定です: ' + key);
  setUserCell_(user._row, key, key === 'displayName' ? assertDisplayName_(value) : value);
  return findUser_(user.surname);
}

/**
 * リクエストの payload からユーザーを解決する。
 * 覗き見モードでもここは通る（書き込みの可否は assertCanWrite_ が判定する）。
 */
function resolveUser_(payload) {
  var surname = normalizeSurname_(payload && payload.user);
  if (!surname) throw apiError_('NO_USER', 'ログインしてください。');
  assertSurname_(surname);
  var user = findUser_(surname);
  if (!user) throw apiError_('UNKNOWN_USER', surname + ' は登録されていません。ログイン画面から登録してください。');
  return user;
}
