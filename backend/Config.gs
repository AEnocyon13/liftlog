/**
 * Config.gs
 * スクリプトプロパティ（ファイル > プロジェクトの設定 > スクリプト プロパティ）で設定する値:
 *   SPREADSHEET_ID : 実績記録用スプレッドシートのID
 *   DOC_ID         : メニュー解説マスターのGoogleドキュメントID
 *   API_KEY        : フロントエンドと共有するシークレットキー（英数32文字程度）
 */
var FALLBACK = {
  SPREADSHEET_ID: '',
  DOC_ID: '',
  API_KEY: ''
};

/** 全員で共有するシート */
var SHEETS = {
  USERS: 'Users',
  MENUS: 'Menus',
  SETTINGS: 'Settings'
};

/** ユーザーごとに作られるシートの名前 */
function logsSheetName_(surname)     { return 'Logs_' + surname; }
function sessionsSheetName_(surname) { return 'Sessions_' + surname; }

/** Users シート（登録ユーザーと個人設定） */
var USER_COLUMNS = [
  'surname', 'createdAt', 'lastLoginAt',
  'monthlyTargetWorkouts', 'monthlyTargetVolume', 'weightIncrement', 'restMinutes', 'memo'
];

/** Logs_<姓> シートの列定義（1行 = 1セット） */
var LOG_COLUMNS = [
  'logId', 'sessionId', 'date', 'part', 'menu', 'setNo',
  'weight', 'reps', 'rpe', 'isWarmup', 'volume', 'est1RM', 'memo', 'createdAt'
];

/** Sessions_<姓> シートの列定義（1行 = 1ワークアウト） */
var SESSION_COLUMNS = [
  'sessionId', 'date', 'startTime', 'endTime', 'durationMin',
  'parts', 'menus', 'totalSets', 'totalVolume', 'restMinutes', 'memo', 'createdAt'
];

/** Menus シートの列定義（種目マスター・全員共通） */
var MENU_COLUMNS = [
  'part', 'menu', 'equipment', 'repMin', 'repMax', 'defaultSets', 'order', 'active'
];

/** Settings シートの既定値（全員共通の既定。個人設定は Users シートが優先） */
var DEFAULT_SETTINGS = {
  defaultRepMin: 8,               // 履歴が無いときに表示する目標レップ下限
  defaultRepMax: 12,              // 同上・上限
  defaultWeightIncrement: 2.5,    // 前回比で自動的に足す重量(kg)
  defaultRestMinutes: 3,          // 休憩タイマーの既定値(分)
  defaultMonthlyTarget: 12,       // 月間目標ワークアウト回数の既定
  timezone: 'Asia/Tokyo'
};

/** 個人設定（Users シート）の既定値 */
function defaultUserSettings_() {
  var s = getSettings_();
  return {
    monthlyTargetWorkouts: num_(s.defaultMonthlyTarget, 12),
    monthlyTargetVolume: 0,
    weightIncrement: num_(s.defaultWeightIncrement, 2.5),
    restMinutes: num_(s.defaultRestMinutes, 3)
  };
}

function getProp_(key) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  if (v === null || v === '') v = FALLBACK[key] || '';
  if (!v) throw new Error('スクリプトプロパティ ' + key + ' が未設定です。');
  return v;
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(getProp_('SPREADSHEET_ID'));
}

function getDoc_() {
  return DocumentApp.openById(getProp_('DOC_ID'));
}

function getTimezone_() {
  try {
    return getSettings_().timezone || DEFAULT_SETTINGS.timezone;
  } catch (e) {
    return DEFAULT_SETTINGS.timezone;
  }
}
