/**
 * plates.js — バーベルに付けるプレートを計算して描く
 *
 * 重量だけ見せられても、ジムでは「で、何を付ければいいの？」が残る。
 * 国際規格のプレートは色が決まっていて、ジムに通う人は色で量を読む。
 * だから重量の横に、実際に付ける枚数をその色で並べる。
 *
 *   85.0kg → 片側 32.5kg → 赤25 + 白5 + 赤2.5
 *
 * 装飾ではなく、バーベルに向かう前に必要な情報そのもの。
 */

/** ジムに置いてある一般的なプレート。色は国際規格（IWF）に合わせる */
const PLATES = [
  { kg: 25,   color: '#D7263D', size: 1.00 },   // 赤
  { kg: 20,   color: '#1E5FBE', size: 1.00 },   // 青
  { kg: 15,   color: '#F0C000', size: .88 },    // 黄
  { kg: 10,   color: '#1C9E4B', size: .72 },    // 緑
  { kg: 5,    color: '#E9EDF4', size: .52 },    // 白
  { kg: 2.5,  color: '#D7263D', size: .42 },    // 赤（小）
  { kg: 1.25, color: '#A9B3C4', size: .34 }     // クロム
];

/** 標準のバーは20kg。女子バーや固定式を使う場合はここを変える */
export const DEFAULT_BAR = 20;

/**
 * 片側に付けるプレートを、重い順に貪欲に選ぶ。
 * 返り値の state は 'ok' / 'bar-only' / 'under' / 'partial'。
 */
export function platesFor(weight, bar = DEFAULT_BAR) {
  const total = Number(weight);
  if (!Number.isFinite(total)) return { state: 'under', bar, perSide: [], rest: 0 };
  if (total < bar) return { state: 'under', bar, perSide: [], rest: 0 };
  if (total === bar) return { state: 'bar-only', bar, perSide: [], rest: 0 };

  let rest = Math.round(((total - bar) / 2) * 100) / 100;
  const perSide = [];
  PLATES.forEach((p) => {
    while (rest >= p.kg - 1e-9 && perSide.length < 12) {
      perSide.push(p);
      rest = Math.round((rest - p.kg) * 100) / 100;
    }
  });
  return { state: rest > 1e-9 ? 'partial' : 'ok', bar, perSide, rest };
}

/** 読み上げと注記のための文字列。「赤25 ×2・白5」 */
export function platesText(weight, bar = DEFAULT_BAR) {
  const r = platesFor(weight, bar);
  if (r.state === 'under') return `バー（${bar}kg）より軽い重量です`;
  if (r.state === 'bar-only') return `バーのみ（${bar}kg）`;
  const counted = [];
  r.perSide.forEach((p) => {
    const last = counted[counted.length - 1];
    if (last && last.kg === p.kg) last.n++;
    else counted.push({ kg: p.kg, n: 1 });
  });
  const list = counted.map((c) => `${c.kg}kg${c.n > 1 ? `×${c.n}` : ''}`).join(' + ');
  return `片側 ${list}${r.rest > 0 ? `（${r.rest}kg 足りません）` : ''}`;
}

/**
 * バーベルの絵を SVG で返す。左右にプレートを鏡像で並べる。
 * 小さく出しても色で読めるよう、プレートは縦の棒として描く。
 */
export function platesSvg(weight, bar = DEFAULT_BAR) {
  const r = platesFor(weight, bar);
  if (r.state === 'under') return '';

  const H = 30, W = 7, GAP = 1.6, SLEEVE = 13, BAR_H = 2.6;
  const side = r.perSide.length * (W + GAP);
  const half = side + SLEEVE;
  const total = half * 2;

  const plateAt = (i, dir) => {
    const p = r.perSide[i];
    const h = H * p.size;
    // 中心から外へ、重い順に並べる（実際の積み方と同じ）
    const x = dir > 0
      ? half + SLEEVE + i * (W + GAP)
      : half - SLEEVE - (i + 1) * (W + GAP);
    const light = p.color === '#E9EDF4' || p.color === '#A9B3C4';
    return `<rect x="${x.toFixed(2)}" y="${((H - h) / 2).toFixed(2)}" width="${W}" height="${h.toFixed(2)}"
             rx="2" fill="${p.color}" ${light ? 'stroke="#6F7A8C" stroke-width=".5"' : ''}/>`;
  };

  const plates = r.perSide.map((_, i) => plateAt(i, 1) + plateAt(i, -1)).join('');

  return `<svg class="ll-plates__svg" viewBox="0 0 ${total.toFixed(2)} ${H}"
               height="${H}" role="img" aria-label="${platesText(weight, bar)}">
    <rect x="0" y="${(H / 2 - BAR_H / 2).toFixed(2)}" width="${total.toFixed(2)}" height="${BAR_H}"
          rx="${(BAR_H / 2).toFixed(2)}" fill="#8A94A6"/>
    <rect x="${(half - SLEEVE).toFixed(2)}" y="${(H / 2 - 4).toFixed(2)}" width="${(SLEEVE * 2).toFixed(2)}" height="8"
          rx="2" fill="#5A6475"/>
    ${plates}
  </svg>`;
}

/**
 * 重量の下に添える一行。バーベル以外では何も出さない。
 * equipment に「バーベル」が入っている種目だけが対象。
 */
export function plateStrip(weight, equipment) {
  if (!/バーベル/.test(String(equipment || ''))) return '';
  const w = Number(weight);
  if (!Number.isFinite(w) || w < DEFAULT_BAR) return '';
  return `<div class="ll-plates">
    ${platesSvg(w)}
    <span class="ll-plates__text">${platesText(w)}</span>
  </div>`;
}
