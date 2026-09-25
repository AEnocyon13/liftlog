/**
 * Setup.gs — 初期セットアップ用のユーティリティ
 *
 * ★ GASエディタの実行プルダウンには「いま開いているファイルの関数」しか出ません。
 *   ここの関数を実行するときは、左のファイル一覧で Setup.gs を開いてください。
 *
 * 使い方（GASエディタから1回ずつ実行）:
 *   0. runUpgrade()         … v1 から更新する場合はこれ1つで移行が完了する
 *                             （下の MY_SURNAME を自分の苗字に書き換えてから実行）
 *   1. generateApiKey()     … APIキーを生成してスクリプトプロパティに保存＋ログ表示
 *   2. setupSpreadsheet()   … Users / Menus / Settings を作成し、種目46件を投入
 *   3. seedGuideDoc()       … 解説ドキュメントに Notion 由来の内容を書き込む
 *   4. selfTest()           … 一通りの読み書きが通るか確認
 *
 * 個別に実行したい場合:
 *   migrateLegacyData('yamada') … 旧 Logs / Sessions を指定ユーザーのシートへ移すだけ
 */

/* ==================================================================
   ▼▼▼ v1 から更新する人はここだけ書き換えて runUpgrade を実行 ▼▼▼
   ================================================================== */

/** 既存データの持ち主の苗字（小文字ローマ字）。新規に作る場合は空のままでよい。 */
var MY_SURNAME = '';

/**
 * v1 → v2 の移行をまとめて実行する。
 * GASエディタでは関数に引数を渡せないため、上の MY_SURNAME を使う入口を用意している。
 */
function runUpgrade() {
  return upgradeToV2(MY_SURNAME);
}

/* ================================================================== */

function generateApiKey() {
  var key = Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('API_KEY', key);
  Logger.log('API_KEY を設定しました:\n' + key + '\n\nフロントエンドの設定画面にこの値を貼り付けてください。');
  return key;
}

function setupSpreadsheet() {
  var ss = getSpreadsheet_();
  ensureSheet_(ss, SHEETS.USERS, USER_COLUMNS);
  ensureSheet_(ss, SHEETS.MENUS, MENU_COLUMNS);
  ensureSheet_(ss, SHEETS.SETTINGS, ['key', 'value', 'description']);

  seedSettings_(ss);
  seedMenus_(ss);

  _settingsCache = null;
  _menuCache = null;
  Logger.log('セットアップ完了: ' + ss.getName() + '\n' + ss.getUrl() +
    '\n\n実績シート（Logs_<姓> / Sessions_<姓>）は、アプリで苗字を登録したときに自動生成されます。');
}

function ensureSheet_(ss, name, columns) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  var existing = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0]
    .map(function (v) { return String(v).trim(); }).filter(String);
  if (existing.length === 0) sh.getRange(1, 1, 1, columns.length).setValues([columns]);
  sh.getRange(1, 1, 1, columns.length)
    .setFontWeight('bold').setBackground('#013E37').setFontColor('#FFEFB3');
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, columns.length);
  return sh;
}

/**
 * 既存シートのヘッダに、不足している列だけを末尾に追記する。
 * 既存データを動かさずに列を増やせる（Users シートの拡張に使う）。
 * @return {string[]} 追記した列名
 */
function ensureHeaderColumns_(ss, name, columns) {
  var sh = ss.getSheetByName(name);
  if (!sh) return [];
  var width = Math.max(1, sh.getLastColumn());
  var header = sh.getRange(1, 1, 1, width).getValues()[0].map(function (v) { return String(v).trim(); });
  var missing = columns.filter(function (c) { return header.indexOf(c) < 0; });
  if (!missing.length) return [];
  sh.getRange(1, header.filter(String).length + 1, 1, missing.length).setValues([missing]);
  sh.getRange(1, 1, 1, header.filter(String).length + missing.length)
    .setFontWeight('bold').setBackground('#013E37').setFontColor('#FFEFB3');
  return missing;
}

function formatDateColumnAsText_(sh, colIndex) {
  if (!sh || colIndex < 1) return;
  sh.getRange(2, colIndex, Math.max(1, sh.getMaxRows() - 1), 1).setNumberFormat('@');
}

var SETTING_DESCRIPTIONS = {
  defaultRepMin: '履歴が無い種目で表示する目標レップ下限',
  defaultRepMax: '同上・上限',
  defaultWeightIncrement: '前回比で自動的に足す重量(kg)。個人設定で上書きできる',
  defaultRestMinutes: '休憩タイマーの既定値(分)。個人設定で上書きできる',
  defaultMonthlyTarget: '月間目標ワークアウト回数の既定。個人設定で上書きできる',
  timezone: 'タイムゾーン'
};

function seedSettings_(ss) {
  var sh = ss.getSheetByName(SHEETS.SETTINGS);
  if (sh.getLastRow() > 1) return;
  var rows = Object.keys(DEFAULT_SETTINGS).map(function (k) {
    return [k, DEFAULT_SETTINGS[k], SETTING_DESCRIPTIONS[k] || ''];
  });
  sh.getRange(2, 1, rows.length, 3).setValues(rows);
}

/**
 * 既存の Settings シートに、v2 で増えたキーだけを追記する（既存の値は書き換えない）。
 * @return {{added: string[], stale: string[]}} 追記したキーと、v2 では使われていない残存キー
 */
function refreshSettingsKeys_(ss) {
  var sh = ss.getSheetByName(SHEETS.SETTINGS);
  var have = {};
  readTable_(SHEETS.SETTINGS).forEach(function (r) {
    var k = String(r.key || '').trim();
    if (k) have[k] = true;
  });
  var added = [];
  Object.keys(DEFAULT_SETTINGS).forEach(function (k) {
    if (have[k]) return;
    sh.appendRow([k, DEFAULT_SETTINGS[k], SETTING_DESCRIPTIONS[k] || '']);
    added.push(k);
  });
  var stale = Object.keys(have).filter(function (k) { return DEFAULT_SETTINGS[k] === undefined; });
  _settingsCache = null;
  return { added: added, stale: stale };
}

/** 種目マスター（SeedData.gs / Notion「筋トre」由来の46種目） */
function seedMenus_(ss) {
  var sh = ss.getSheetByName(SHEETS.MENUS);
  if (sh.getLastRow() > 1) {
    Logger.log('Menus シートに既にデータがあるため、種目の投入をスキップしました。' +
      '入れ直す場合は Menus シートの2行目以降を削除してから再実行してください。');
    return;
  }
  sh.getRange(2, 1, SEED_MENUS.length, MENU_COLUMNS.length).setValues(SEED_MENUS);
  Logger.log('種目を ' + SEED_MENUS.length + ' 件投入しました。');
}

/**
 * 解説ドキュメントに SEED_GUIDE の内容を書き込む。
 * 既に本文があるときは何もしない（手で書いた内容を消さないため）。
 */
function seedGuideDoc() {
  var doc = getDoc_();
  var body = doc.getBody();
  if (body.getText().trim().length > 0) {
    Logger.log('ドキュメントに既に内容があるため、書き込みをスキップしました。\n' +
      '入れ直す場合はドキュメントの中身を全て削除してから再実行してください。');
    return;
  }

  writeGuideDoc_(body);
  doc.saveAndClose();
  clearGuideCache_();
  Logger.log('解説を書き込みました。' + guideStats_() + '\n' + doc.getUrl());
}

/** SEED_GUIDE を本文に流し込む（seedGuideDoc / rewriteGuideDoc の共通処理） */
function writeGuideDoc_(body) {
  body.appendParagraph('筋トレ メニュー解説マスター')
      .setHeading(DocumentApp.ParagraphHeading.TITLE);
  body.appendParagraph('見出し1 = 部位 / 見出し2 = 種目名 / 本文 = 「ラベル: 内容」の形式で記述します。' +
    '書き方は docs/DOC_FORMAT.md を参照してください。');

  var currentPart = '';
  SEED_GUIDE.forEach(function (g) {
    if (g.part !== currentPart) {
      currentPart = g.part;
      body.appendParagraph(currentPart).setHeading(DocumentApp.ParagraphHeading.HEADING1);
    }
    body.appendParagraph(g.menu).setHeading(DocumentApp.ParagraphHeading.HEADING2);
    g.lines.forEach(function (line) {
      body.appendParagraph(line).setHeading(DocumentApp.ParagraphHeading.NORMAL);
    });
  });
}

/**
 * v1 から v2 への移行をまとめて行う。**更新時はこれを1回実行すれば足りる。**
 *
 *   1. 列構成が変わった Menus / Settings を作り直す（旧シートは *_v1backup にリネームして保全）
 *   2. Users シートを作る
 *   3. 旧 Logs / Sessions があれば、指定された苗字のシートへ移す
 *
 * @param {string} surname 既存データの持ち主の苗字（小文字ローマ字）。
 *                         旧データが無い場合は省略できる。
 */
function upgradeToV2(surname) {
  var ss = getSpreadsheet_();
  var stamp = Utilities.formatDate(new Date(), getTimezone_(), 'yyyyMMdd');
  var log = [];

  // --- 1. 列構成が変わったシートを作り直す ---
  var menusSh = ss.getSheetByName(SHEETS.MENUS);
  if (!menusSh) {
    log.push('Menus: 新規作成');
  } else {
    var header = menusSh.getRange(1, 1, 1, Math.max(1, menusSh.getLastColumn())).getValues()[0]
      .map(function (v) { return String(v).trim(); }).filter(String);
    if (header.join('|') === MENU_COLUMNS.join('|')) {
      log.push('Menus: 列構成は最新（そのまま）');
    } else {
      var backup = SHEETS.MENUS + '_v1backup_' + stamp;
      if (ss.getSheetByName(backup)) ss.deleteSheet(ss.getSheetByName(backup));
      menusSh.setName(backup);
      log.push('Menus: 旧シートを ' + backup + ' にリネームして作り直し');
    }
  }

  ensureSheet_(ss, SHEETS.USERS, USER_COLUMNS);
  ensureSheet_(ss, SHEETS.MENUS, MENU_COLUMNS);
  ensureSheet_(ss, SHEETS.SETTINGS, ['key', 'value', 'description']);
  _settingsCache = null;
  _menuCache = null;

  // Users は列が増えることがあるので、不足分だけ末尾に足す（既存の行は動かさない）
  var addedCols = ensureHeaderColumns_(ss, SHEETS.USERS, USER_COLUMNS);
  if (addedCols.length) log.push('Users: 列を追加 → ' + addedCols.join(', '));

  seedSettings_(ss);
  seedMenus_(ss);
  log.push('種目: ' + readMenus_(true).length + '件');

  // Settings は列構成が v1 と同じなので、増えたキーだけを追記する（既存の値は保持）
  var keys = refreshSettingsKeys_(ss);
  if (keys.added.length) log.push('Settings: キーを追加 → ' + keys.added.join(', '));
  if (keys.stale.length) {
    log.push('Settings: v2 では使わない行が残っています（消して構いません） → ' + keys.stale.join(', '));
  }

  // --- 2. 旧 Logs / Sessions の移行 ---
  var hasLegacy = ['Logs', 'Sessions'].some(function (n) {
    var sh = ss.getSheetByName(n);
    return sh && sh.getLastRow() > 1;
  });
  if (hasLegacy) {
    if (!surname) {
      log.push('⚠ 旧 Logs / Sessions に記録が残っています。' +
        'Setup.gs 冒頭の MY_SURNAME に自分の苗字を書いてから runUpgrade を実行すると、そのユーザーのシートへ移します。');
    } else {
      log.push('旧データの移行 → ' + migrateLegacyData(surname).join(' / '));
    }
  } else if (surname) {
    var s = assertSurname_(normalizeSurname_(surname));
    if (!findUser_(s)) { createUser_(s); log.push('ユーザー ' + s + ' を登録しました'); }
  }

  var noPin = listUsersPublic_().filter(function (u) { return !u.hasPin; }).map(function (u) { return u.surname; });
  log.push('登録ユーザー: ' + JSON.stringify(listUserNames_()));
  if (noPin.length) {
    log.push('PIN未設定: ' + noPin.join(', ') + ' → 次回ログイン時にアプリ上で設定できます');
  }
  log.push('\n完了しました。次は GASエディタの「デプロイ」→「デプロイを管理」→ 鉛筆 →' +
    ' バージョンを「新バージョン」にして再デプロイしてください。');
  Logger.log(log.join('\n'));
  return log.join('\n');
}

/**
 * 解説ドキュメントの中身を、SEED_GUIDE の内容で**丸ごと置き換える**。
 *
 * seedGuideDoc() は本文が空のときしか書き込まないので、
 * すでに古い内容が入っているドキュメントを Notion の最新の取り込み結果に
 * 更新したいときはこちらを使う。
 *
 * ⚠ ドキュメントに手で書き足した解説は失われる。実行前に、必要なら
 *   ファイル > 版履歴 でコピーを残しておくこと（版履歴からは元に戻せる）。
 */
function rewriteGuideDoc() {
  var doc = getDoc_();
  var body = doc.getBody();
  var had = body.getText().trim().length;
  body.clear();
  writeGuideDoc_(body);
  doc.saveAndClose();
  clearGuideCache_();
  Logger.log((had ? '既存の本文を置き換えました。' : '書き込みました。') +
    '\n' + guideStats_() + '\n' + doc.getUrl() +
    '\n\nアプリの 設定 →「解説ドキュメントを再読込」を押すと反映されます。');
}

function guideStats_() {
  var withText = SEED_GUIDE.filter(function (g) { return g.lines.length; }).length;
  var withDesc = SEED_GUIDE.filter(function (g) {
    return g.lines.some(function (l) { return l.indexOf('解説:') === 0; });
  }).length;
  var withVideo = SEED_GUIDE.filter(function (g) {
    return g.lines.some(function (l) { return l.indexOf('YouTube:') === 0; });
  }).length;
  return SEED_GUIDE.length + '種目（解説 ' + withDesc + '件 / 筋肉の情報 ' + withText +
    '件 / 動画 ' + withVideo + '件）';
}

/**
 * 旧バージョンの Logs / Sessions を、指定ユーザーのシートへ移す。
 * 移行後、旧シートは Logs_legacy / Sessions_legacy にリネームして残す。
 */
function migrateLegacyData(surname) {
  var s = assertSurname_(normalizeSurname_(surname));
  if (!findUser_(s)) createUser_(s);
  var ss = getSpreadsheet_();
  var moved = [];
  [['Logs', logsSheetName_(s), LOG_COLUMNS], ['Sessions', sessionsSheetName_(s), SESSION_COLUMNS]]
    .forEach(function (pair) {
      var oldSh = ss.getSheetByName(pair[0]);
      if (!oldSh || oldSh.getLastRow() < 2) return;
      var rows = readTable_(pair[0], false);
      var target = getSheet_(pair[1], true);
      var values = rows.map(function (r) { return toRow_(pair[2], r); });
      if (values.length) {
        target.getRange(target.getLastRow() + 1, 1, values.length, pair[2].length).setValues(values);
      }
      oldSh.setName(pair[0] + '_legacy');
      moved.push(pair[0] + ': ' + values.length + '行');
    });
  Logger.log(moved.length ? ('移行しました → ' + s + '\n' + moved.join('\n')) : '移行対象の旧シートはありませんでした。');
  return moved;
}

/** 動作確認 */
function selfTest() {
  var out = [];
  out.push('SPREADSHEET_ID: ' + getProp_('SPREADSHEET_ID'));
  out.push('DOC_ID: ' + getProp_('DOC_ID'));
  out.push('API_KEY: ' + getProp_('API_KEY').slice(0, 6) + '…');
  out.push('menus: ' + readMenus_(true).length + '件');
  out.push('guides: ' + readGuides_().length + '件');
  out.push('settings: ' + JSON.stringify(getSettings_(true)));
  out.push('users: ' + JSON.stringify(listUsersPublic_()));
  out.push('トークン検証: ' + (readToken_(issueToken_('testuser').token) === 'testuser' ? 'OK' : 'NG'));

  var s = normalizeSurname_('TestUser');
  out.push('苗字の正規化 "TestUser" → "' + s + '" (有効: ' + SURNAME_RE.test(s) + ')');

  var names = listUserNames_();
  if (names.length) {
    var u = findUser_(names[0]);
    var menus = readMenus_();
    if (menus.length) {
      var hist = readMenuHistory_(u, menus[0].part, menus[0].menu, 6);
      var sug = suggestNextLoad_(hist, menus[0], getSettings_(), u, {});
      out.push('提案(' + names[0] + ' / ' + menus[0].menu + '): ' + sug.status + ' / ' +
        sug.recommendedWeight + 'kg / plan ' + JSON.stringify(sug.plan));
    }
    out.push('dashboard(' + names[0] + '): ' + JSON.stringify(buildDashboard_(u, null).goal));
  } else {
    out.push('※ まだユーザーが登録されていません。アプリのログイン画面から苗字を登録してください。');
  }
  Logger.log(out.join('\n'));
  return out.join('\n');
}

/** 提案ロジックの単体テスト（シート不要） */
function testProgression() {
  var settings = {};
  Object.keys(DEFAULT_SETTINGS).forEach(function (k) { settings[k] = DEFAULT_SETTINGS[k]; });
  var conf = { part: '胸', menu: 'ベンチプレス', repMin: 8, repMax: 12, defaultSets: 3 };
  var user = { surname: 'test', weightIncrement: 2.5, restMinutes: 3 };

  var cases = [
    { name: '前回 60kg 10/9/8 → 62.5kg で同じレップ', hist: [mkSession_('2026-09-01', 60, [10, 9, 8])] },
    { name: 'セット数4 → 4セットのまま引き継ぐ',       hist: [mkSession_('2026-09-01', 40, [12, 12, 11, 10])] },
    { name: 'ドロップセット混在 → 各セットに +2.5kg',  hist: [{
        date: '2026-09-01', sessionId: 't', workSets: [
          { setNo: 1, weight: 60, reps: 8, rpe: null, isWarmup: false },
          { setNo: 2, weight: 60, reps: 7, rpe: null, isWarmup: false },
          { setNo: 3, weight: 50, reps: 10, rpe: null, isWarmup: false }],
        totalVolume: 1400, est1RM: 76 } ] },
    { name: '履歴なし → 手入力を促す',                 hist: [] }
  ];

  var log = cases.map(function (c) {
    var r = suggestNextLoad_(c.hist, conf, settings, user, {});
    return c.name + '\n  → ' + r.status + ' / ' + r.recommendedWeight + 'kg\n  plan: ' +
      JSON.stringify(r.plan) + '\n  ' + r.reason;
  }).join('\n\n');
  Logger.log(log);
  return log;
}

function mkSession_(date, weight, repsArr) {
  var sets = repsArr.map(function (r, i) {
    return { setNo: i + 1, weight: weight, reps: r, rpe: null, isWarmup: false };
  });
  return {
    date: date, sessionId: 'test', sets: sets, workSets: sets,
    topWeight: weight,
    maxReps: Math.max.apply(null, repsArr),
    totalVolume: sets.reduce(function (a, s) { return a + s.weight * s.reps; }, 0),
    avgRpe: null,
    est1RM: epley1RM_(weight, Math.max.apply(null, repsArr))
  };
}
