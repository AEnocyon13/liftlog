/**
 * Config.gs
 * スクリプトプロパティ（ファイル > プロジェクトの設定 > スクリプト プロパティ）で設定する値:
 *   SPREADSHEET_ID : 実績記録用スプレッドシートのID
 *   DOC_ID         : メニュー解説マスターのGoogleドキュメントID
 *   API_KEY        : フロントエンドと共有するシークレットキー（英数32文字程度）
 *
 * 直接ハードコードしたい場合は下の FALLBACK に書いても動くが、
 * リポジトリに push すると漏洩するのでプロパティ利用を強く推奨。
 */
var FALLBACK = {
  SPREADSHEET_ID: '',
  DOC_ID: '',
  API_KEY: ''
};

var SHEETS = {
  LOGS: 'Logs',
  SESSIONS: 'Sessions',
  MENUS: 'Menus',
  SETTINGS: 'Settings'
};

/** Logs シートの列定義（順序がそのまま列順） */
var LOG_COLUMNS = [
  'logId', 'sessionId', 'date', 'part', 'menu', 'setNo',
  'weight', 'reps', 'rpe', 'isWarmup', 'volume', 'est1RM', 'memo', 'createdAt'
];

/** Sessions シートの列定義 */
var SESSION_COLUMNS = [
  'sessionId', 'date', 'startTime', 'endTime', 'durationMin',
  'parts', 'menus', 'totalSets', 'totalVolume', 'condition', 'memo', 'createdAt'
];

/** Menus シートの列定義 */
var MENU_COLUMNS = [
  'part', 'menu', 'equipment', 'repMin', 'repMax',
  'baseIncrement', 'weightStep', 'defaultSets', 'order', 'active'
];

/** Settings シートの既定値（キーが無い場合に使われる） */
var DEFAULT_SETTINGS = {
  monthlyTargetWorkouts: 12,      // 月間目標ワークアウト回数
  monthlyTargetVolume: 0,         // 月間目標総ボリューム(kg)。0なら非表示
  deloadRate: 0.10,               // 連続失敗時のディロード率
  deloadAfterFails: 2,            // 何回連続で失敗したらディロードするか
  defaultRepMin: 8,
  defaultRepMax: 12,
  defaultWeightStep: 2.5,
  rpeEasyThreshold: 7.0,          // これ以下 = まだ余裕 → 増加幅 x1.5
  rpeNormalThreshold: 8.5,        // これ以下 = 適正   → 増加幅 x1.0
  rpeHardThreshold: 9.5,          // これ以下 = きつい → 増加幅 x0.5 / 超過は据え置き
  timezone: 'Asia/Tokyo'
};

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
