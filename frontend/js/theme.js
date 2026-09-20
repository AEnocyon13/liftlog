/**
 * theme.js — ライト / ダーク / システム追従の切り替え
 *
 * ユーザー指定により、ダークは「背景 #FFEFB3 と文字 #013E37 を入れ替えるだけ」。
 * 実際の色は CSS の :root[data-theme="dark"] 側で定義し、ここでは属性の付け替えだけを行う。
 */

const LS_THEME = 'liftlog.theme';
export const THEMES = [
  { value: 'light',  label: 'ライト', icon: 'light' },
  { value: 'dark',   label: 'ダーク', icon: 'dark' },
  { value: 'system', label: '自動', icon: 'auto' }
];

export function getTheme() {
  try {
    const t = localStorage.getItem(LS_THEME);
    return THEMES.some((x) => x.value === t) ? t : 'system';
  } catch {
    return 'system';
  }
}

export function setTheme(value) {
  const t = THEMES.some((x) => x.value === value) ? value : 'system';
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem(LS_THEME, t); } catch { /* プライベートモード等 */ }
  syncMetaThemeColor();
  return t;
}

/** ブラウザのURLバー色を現在の surface に合わせる */
function syncMetaThemeColor() {
  const surface = getComputedStyle(document.documentElement)
    .getPropertyValue('--md-sys-color-surface').trim();
  if (!surface) return;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m, i) => {
    if (i === 0) m.setAttribute('content', surface);
    else m.remove();
  });
}

export function initTheme() {
  setTheme(getTheme());
  // system のときだけ OS 側の変更に追従する
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getTheme() === 'system') syncMetaThemeColor();
  });
}
