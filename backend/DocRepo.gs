/**
 * DocRepo.gs — Googleドキュメント（メニュー解説マスター）の読み取り
 *
 * 想定フォーマット（docs/DOC_FORMAT.md 参照）:
 *
 *   [見出し1] 胸                        ← 部位
 *   [見出し2] ベンチプレス               ← 種目名
 *   別名: ベンプレ, BP
 *   器具: バーベル
 *   主働筋: 大胸筋 / 三角筋前部 / 上腕三頭筋
 *   解説: 肩甲骨を寄せて下制し、みぞおちに落とす。…（複数行OK。行を分けると段落として連結）
 *   ポイント: 肘は45度。手首を寝かせない。
 *   ポイント: ボトムで力を抜かない。
 *   注意: 肩がすくむと前部三角筋に逃げる。
 *   YouTube: 山岸秀匡のベンチプレス解説 | https://www.youtube.com/watch?v=xxxx
 *   タグ: コンパウンド, 高重量
 *
 * ラベルは全角/半角コロンどちらでも可。ラベルの無い行は直前のラベルの続きとして扱う。
 */

var GUIDE_CACHE_KEY = 'guides_v1';
var GUIDE_CACHE_SEC = 600;

var LABEL_MAP = {
  '解説': 'description',
  '説明': 'description',
  'ポイント': 'points',
  'コツ': 'points',
  '注意': 'cautions',
  'NG': 'cautions',
  'YouTube': 'videos',
  '動画': 'videos',
  'タグ': 'tags',
  '別名': 'aliases',
  '器具': 'equipment',
  '主働筋': 'muscles',
  '対象筋': 'muscles',
  'レップ': 'repRange',
  '推奨レップ': 'repRange'
};

function clearGuideCache_() {
  try { CacheService.getScriptCache().remove(GUIDE_CACHE_KEY); } catch (e) {}
}

function readGuides_() {
  var cache = CacheService.getScriptCache();
  var cached = null;
  try { cached = cache.get(GUIDE_CACHE_KEY); } catch (e) {}
  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }
  var guides = parseGuideDoc_();
  try { cache.put(GUIDE_CACHE_KEY, JSON.stringify(guides), GUIDE_CACHE_SEC); } catch (e) {}
  return guides;
}

function parseGuideDoc_() {
  var body = getDoc_().getBody();
  var n = body.getNumChildren();
  var guides = [];
  var currentPart = '';
  var current = null;
  var lastKey = null;

  for (var i = 0; i < n; i++) {
    var child = body.getChild(i);
    if (child.getType() !== DocumentApp.ElementType.PARAGRAPH) continue;
    var para = child.asParagraph();
    var text = para.getText().replace(/ /g, ' ').trim();
    var heading = para.getHeading();

    if (heading === DocumentApp.ParagraphHeading.HEADING1 || heading === DocumentApp.ParagraphHeading.TITLE) {
      currentPart = text;
      current = null;
      lastKey = null;
      continue;
    }

    if (heading === DocumentApp.ParagraphHeading.HEADING2) {
      if (!text) continue;
      current = newGuide_(currentPart, text);
      guides.push(current);
      lastKey = null;
      continue;
    }

    if (!current || !text) continue;

    var m = text.match(/^([^:：]{1,10})[:：]\s*(.*)$/);
    var key = m ? LABEL_MAP[m[1].trim()] : null;

    if (key) {
      lastKey = key;
      applyGuideField_(current, key, m[2].trim(), para);
    } else if (lastKey) {
      // ラベル無し行は直前ラベルの続き
      applyGuideField_(current, lastKey, text, para);
    } else {
      current.description = current.description ? current.description + '\n' + text : text;
    }
  }

  return guides.filter(function (g) { return g.menu; });
}

function newGuide_(part, menu) {
  return {
    part: part,
    menu: menu,
    key: guideKey_(part, menu),
    aliases: [],
    equipment: '',
    muscles: [],
    repRange: '',
    description: '',
    points: [],
    cautions: [],
    videos: [],
    tags: []
  };
}

function guideKey_(part, menu) {
  return normalizeName_(part) + '::' + normalizeName_(menu);
}

function normalizeName_(s) {
  return String(s || '')
    .replace(/[\s　]/g, '')
    .replace(/[（）()]/g, '')
    .toLowerCase();
}

function applyGuideField_(guide, key, value, para) {
  if (!value) return;
  switch (key) {
    case 'description':
      guide.description = guide.description ? guide.description + '\n' + value : value;
      break;
    case 'points':
      splitList_(value).forEach(function (v) { guide.points.push(v); });
      break;
    case 'cautions':
      splitList_(value).forEach(function (v) { guide.cautions.push(v); });
      break;
    case 'tags':
      splitList_(value).forEach(function (v) { guide.tags.push(v); });
      break;
    case 'aliases':
      splitList_(value).forEach(function (v) { guide.aliases.push(v); });
      break;
    case 'muscles':
      splitList_(value).forEach(function (v) { guide.muscles.push(v); });
      break;
    case 'equipment':
      guide.equipment = value;
      break;
    case 'repRange':
      guide.repRange = value;
      break;
    case 'videos':
      var v = parseVideoLine_(value, para);
      if (v) guide.videos.push(v);
      break;
  }
}

function splitList_(value) {
  return value.split(/[,、\/｜|]/)
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return s.length > 0; });
}

/** 「タイトル | URL」/「URL」/ ハイパーリンク付きテキスト のいずれにも対応 */
function parseVideoLine_(value, para) {
  var url = '';
  var title = '';

  var parts = value.split(/\s*[|｜]\s*/);
  var urlMatch = value.match(/https?:\/\/[^\s|｜]+/);
  if (urlMatch) {
    url = urlMatch[0];
    title = parts.length > 1 ? parts[0].trim() : '';
    if (title === url) title = '';
  } else if (para) {
    // 本文がリンク化されているケース（表示テキストにURLが無い）
    try {
      var t = para.editAsText();
      var len = t.getText().length;
      for (var i = 0; i < len; i++) {
        var link = t.getLinkUrl(i);
        if (link) { url = link; break; }
      }
    } catch (e) {}
    title = value;
  }

  if (!url) return null;
  if (!title) title = guessVideoTitle_(url);
  return { title: title, url: url, videoId: extractYouTubeId_(url) };
}

function guessVideoTitle_(url) {
  var id = extractYouTubeId_(url);
  return id ? ('YouTube動画 (' + id + ')') : 'リンク';
}

function extractYouTubeId_(url) {
  var m = String(url).match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : '';
}
