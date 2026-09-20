/**
 * Setup.gs — 初期セットアップ用のユーティリティ
 *
 * 使い方（GASエディタから1回ずつ実行）:
 *   1. generateApiKey()        … APIキーを生成してスクリプトプロパティに保存＋ログ表示
 *   2. setupSpreadsheet()      … 4つのシートとヘッダ、初期メニュー、初期設定を作成
 *   3. seedGuideDocTemplate()  … 解説用ドキュメントに雛形を書き込む（空のときのみ）
 *   4. selfTest()              … 一通りの読み書きが通るか確認
 */

function generateApiKey() {
  var key = Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('API_KEY', key);
  Logger.log('API_KEY を設定しました:\n' + key + '\n\nフロントエンドの設定画面にこの値を貼り付けてください。');
  return key;
}

function setupSpreadsheet() {
  var ss = getSpreadsheet_();
  ensureSheet_(ss, SHEETS.LOGS, LOG_COLUMNS);
  ensureSheet_(ss, SHEETS.SESSIONS, SESSION_COLUMNS);
  ensureSheet_(ss, SHEETS.MENUS, MENU_COLUMNS);
  ensureSheet_(ss, SHEETS.SETTINGS, ['key', 'value', 'description']);

  seedSettings_(ss);
  seedMenus_(ss);

  // 日付列をテキスト扱いにして 'yyyy-MM-dd' が壊れないようにする
  formatDateColumnAsText_(ss.getSheetByName(SHEETS.LOGS), LOG_COLUMNS.indexOf('date') + 1);
  formatDateColumnAsText_(ss.getSheetByName(SHEETS.SESSIONS), SESSION_COLUMNS.indexOf('date') + 1);

  _settingsCache = null;
  _menuCache = null;
  Logger.log('セットアップ完了: ' + ss.getName() + '\n' + ss.getUrl());
}

function ensureSheet_(ss, name, columns) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  var existing = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0]
    .map(function (v) { return String(v).trim(); }).filter(String);
  if (existing.length === 0) {
    sh.getRange(1, 1, 1, columns.length).setValues([columns]);
  }
  sh.getRange(1, 1, 1, columns.length)
    .setFontWeight('bold')
    .setBackground('#1f2937')
    .setFontColor('#ffffff');
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, columns.length);
  return sh;
}

function formatDateColumnAsText_(sh, colIndex) {
  if (!sh || colIndex < 1) return;
  sh.getRange(2, colIndex, Math.max(1, sh.getMaxRows() - 1), 1).setNumberFormat('@');
}

function seedSettings_(ss) {
  var sh = ss.getSheetByName(SHEETS.SETTINGS);
  if (sh.getLastRow() > 1) return;
  var descriptions = {
    monthlyTargetWorkouts: '月間の目標ワークアウト回数（ダッシュボードの達成率の分母）',
    monthlyTargetVolume: '月間の目標総ボリューム(kg)。0なら非表示',
    deloadRate: '連続失敗時に落とす割合（0.10 = 10%減）',
    deloadAfterFails: '何回連続で下限レップ未達ならディロードするか',
    defaultRepMin: 'Menus に指定が無い場合の目標レップ下限',
    defaultRepMax: 'Menus に指定が無い場合の目標レップ上限',
    defaultWeightStep: 'Menus に指定が無い場合の重量刻み(kg)',
    rpeEasyThreshold: 'この値以下のRPEなら増加幅 x1.5',
    rpeNormalThreshold: 'この値以下のRPEなら増加幅 x1.0',
    rpeHardThreshold: 'この値以下のRPEなら増加幅 x0.5 / 超えたら据え置き',
    timezone: 'タイムゾーン'
  };
  var rows = Object.keys(DEFAULT_SETTINGS).map(function (k) {
    return [k, DEFAULT_SETTINGS[k], descriptions[k] || ''];
  });
  sh.getRange(2, 1, rows.length, 3).setValues(rows);
}

/** 初期メニュー（山岸秀匡選手の分割を意識した基本種目セット） */
function seedMenus_(ss) {
  var sh = ss.getSheetByName(SHEETS.MENUS);
  if (sh.getLastRow() > 1) return;
  // part, menu, equipment, repMin, repMax, baseIncrement, weightStep, defaultSets, order, active
  var rows = [
    ['胸', 'ベンチプレス', 'バーベル', 8, 12, 2.5, 2.5, 4, 1, true],
    ['胸', 'インクラインダンベルプレス', 'ダンベル', 8, 12, 2, 2, 3, 2, true],
    ['胸', 'ケーブルフライ', 'ケーブル', 12, 15, 2.5, 2.5, 3, 3, true],
    ['背中', 'デッドリフト', 'バーベル', 5, 8, 5, 2.5, 3, 1, true],
    ['背中', 'ラットプルダウン', 'マシン', 8, 12, 2.5, 2.5, 4, 2, true],
    ['背中', 'ベントオーバーロウ', 'バーベル', 8, 12, 2.5, 2.5, 3, 3, true],
    ['脚', 'バーベルスクワット', 'バーベル', 8, 12, 5, 2.5, 4, 1, true],
    ['脚', 'レッグプレス', 'マシン', 10, 15, 10, 5, 3, 2, true],
    ['脚', 'レッグエクステンション', 'マシン', 12, 15, 5, 2.5, 3, 3, true],
    ['脚', 'ライイングレッグカール', 'マシン', 10, 15, 5, 2.5, 3, 4, true],
    ['肩', 'ショルダープレス', 'ダンベル', 8, 12, 2, 2, 4, 1, true],
    ['肩', 'サイドレイズ', 'ダンベル', 12, 15, 1, 1, 4, 2, true],
    ['肩', 'リアデルトフライ', 'マシン', 12, 15, 2.5, 2.5, 3, 3, true],
    ['腕', 'バーベルカール', 'バーベル', 8, 12, 2.5, 1.25, 3, 1, true],
    ['腕', 'ケーブルプレスダウン', 'ケーブル', 10, 15, 2.5, 2.5, 3, 2, true],
    ['腕', 'インクラインダンベルカール', 'ダンベル', 10, 12, 1, 1, 3, 3, true]
  ];
  sh.getRange(2, 1, rows.length, MENU_COLUMNS.length).setValues(rows);
}

/** 解説ドキュメントの雛形を書き込む（本文が空のときのみ） */
function seedGuideDocTemplate() {
  var doc = getDoc_();
  var body = doc.getBody();
  if (body.getText().trim().length > 0) {
    Logger.log('ドキュメントに既に内容があるため、雛形の書き込みをスキップしました。');
    return;
  }

  var title = body.appendParagraph('筋トレ メニュー解説マスター');
  title.setHeading(DocumentApp.ParagraphHeading.TITLE);
  body.appendParagraph('見出し1 = 部位 / 見出し2 = 種目名 / 本文 = 「ラベル: 内容」の形式で記述してください。');

  var samples = [
    {
      part: '胸',
      items: [{
        menu: 'ベンチプレス',
        lines: [
          '別名: ベンプレ, BP',
          '器具: バーベル',
          '主働筋: 大胸筋 / 三角筋前部 / 上腕三頭筋',
          '推奨レップ: 8〜12',
          '解説: 肩甲骨を寄せて下制し、みぞおち〜乳頭下のラインにバーを下ろす。胸郭を張ったまま、肘を軽く畳んだ軌道で押し切る。ボトムで胸のストレッチを感じ、トップでは肘を完全にロックせず張力を維持する。',
          'ポイント: 足で床を押し、下半身の力を体幹経由でバーに伝える',
          'ポイント: 手首を寝かせず、前腕をバーの真下に垂直に保つ',
          '注意: 肩がすくむと大胸筋から負荷が抜け、肩を痛めやすい',
          'YouTube: ベンチプレス解説 | https://www.youtube.com/watch?v=REPLACE_ME',
          'タグ: コンパウンド, 高重量'
        ]
      }]
    },
    {
      part: '背中',
      items: [{
        menu: 'ラットプルダウン',
        lines: [
          '器具: マシン',
          '主働筋: 広背筋 / 大円筋 / 僧帽筋下部',
          '推奨レップ: 8〜12',
          '解説: 胸を張り、肘を体側に引き下ろす意識でバーを鎖骨に向けて引く。腕で引かず、肩甲骨の下制と内転で動かす。',
          'ポイント: 上体は10〜20度だけ後傾させ、そこから固定する',
          '注意: 反動で体を大きく振ると広背筋への刺激が逃げる',
          'YouTube: ラットプルダウン解説 | https://www.youtube.com/watch?v=REPLACE_ME',
          'タグ: コンパウンド'
        ]
      }]
    }
  ];

  samples.forEach(function (s) {
    body.appendParagraph(s.part).setHeading(DocumentApp.ParagraphHeading.HEADING1);
    s.items.forEach(function (it) {
      body.appendParagraph(it.menu).setHeading(DocumentApp.ParagraphHeading.HEADING2);
      it.lines.forEach(function (l) {
        body.appendParagraph(l).setHeading(DocumentApp.ParagraphHeading.NORMAL);
      });
    });
  });

  doc.saveAndClose();
  clearGuideCache_();
  Logger.log('雛形を書き込みました: ' + doc.getUrl());
}

/** 動作確認 */
function selfTest() {
  var out = [];
  out.push('SPREADSHEET_ID: ' + getProp_('SPREADSHEET_ID'));
  out.push('DOC_ID: ' + getProp_('DOC_ID'));
  out.push('API_KEY: ' + getProp_('API_KEY').slice(0, 6) + '…');
  var menus = readMenus_(true);
  out.push('menus: ' + menus.length + '件');
  var guides = readGuides_();
  out.push('guides: ' + guides.length + '件 ' + JSON.stringify(guides.map(function (g) { return g.part + '/' + g.menu; })));
  var settings = getSettings_(true);
  out.push('settings: ' + JSON.stringify(settings));
  if (menus.length) {
    var s = suggestNextLoad_(readMenuHistory_(menus[0].part, menus[0].menu, 6), menus[0], settings, {});
    out.push('suggestion(' + menus[0].menu + '): ' + JSON.stringify(s));
  }
  out.push('dashboard: ' + JSON.stringify(buildDashboard_(null).goal));
  Logger.log(out.join('\n'));
  return out.join('\n');
}

/** 提案アルゴリズムの単体テスト（シート不要） */
function testProgression() {
  var settings = {};
  Object.keys(DEFAULT_SETTINGS).forEach(function (k) { settings[k] = DEFAULT_SETTINGS[k]; });
  var conf = { part: '胸', menu: 'ベンチプレス', repMin: 8, repMax: 12, baseIncrement: 2.5, weightStep: 2.5, defaultSets: 4 };

  var cases = [
    { name: '全セット上限達成 / RPE8 → +2.5kg', hist: [mkSession_('2026-09-01', 60, [12, 12, 12], 8)] },
    { name: '全セット上限達成 / RPE6.5 → +2.5〜5kg', hist: [mkSession_('2026-09-01', 60, [12, 12, 12], 6.5)] },
    { name: '全セット上限達成 / RPE9.8 → 据え置き', hist: [mkSession_('2026-09-01', 60, [12, 12, 12], 9.8)] },
    { name: 'レンジ内 → レップ+1', hist: [mkSession_('2026-09-01', 60, [10, 9, 9], 8)] },
    { name: '下限未達1回 → 据え置き', hist: [mkSession_('2026-09-01', 60, [7, 6, 5], 9)] },
    { name: '下限未達2回連続 → ディロード', hist: [mkSession_('2026-09-01', 60, [7, 6, 5], 9), mkSession_('2026-08-28', 60, [7, 7, 6], 9)] },
    { name: '履歴なし', hist: [] }
  ];

  var log = cases.map(function (c) {
    var r = suggestNextLoad_(c.hist, conf, settings, {});
    return c.name + '\n  → ' + r.status + ' / ' + r.recommendedWeight + 'kg (delta ' + r.delta + ') / target ' + r.targetReps + '\n  ' + r.reason;
  }).join('\n\n');
  Logger.log(log);
  return log;
}

function mkSession_(date, weight, repsArr, rpe) {
  var sets = repsArr.map(function (r, i) {
    return { setNo: i + 1, weight: weight, reps: r, rpe: rpe, isWarmup: false };
  });
  return {
    date: date, sessionId: 'test', sets: sets, workSets: sets,
    topWeight: weight,
    maxReps: Math.max.apply(null, repsArr),
    totalVolume: sets.reduce(function (a, s) { return a + s.weight * s.reps; }, 0),
    avgRpe: rpe,
    est1RM: epley1RM_(weight, Math.max.apply(null, repsArr))
  };
}
