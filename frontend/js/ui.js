/** ui.js — M3 コンポーネントの生成ヘルパー / スナックバー / ボトムシート / 書式 */

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** HTMLエスケープ（テンプレートに値を差し込むときは必ず通す） */
export function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** SVGスプライトのアイコン。name は index.html の symbol id から `i-` を除いたもの */
export const icon = (name, cls = '') =>
  `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

/* ---------- ローディング ---------- */
let loadingCount = 0;
export function setLoading(on) {
  loadingCount = Math.max(0, loadingCount + (on ? 1 : -1));
  $('#loading').hidden = loadingCount === 0;
}

/* ---------- Snackbar（M3） ---------- */
export function snackbar(message, type = '') {
  const host = $('#snackbarHost');
  const el = document.createElement('div');
  el.className = 'md-snackbar' + (type === 'err' ? ' md-snackbar--error' : '');
  const ico = type === 'err' ? 'error' : type === 'ok' ? 'check-circle' : 'info';
  el.innerHTML = `${icon(ico, 'icon--sm md-snackbar__icon')}<span class="ll-grow">${esc(message)}</span>`;
  host.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; }, 3200);
  setTimeout(() => el.remove(), 3600);
}
/** 旧名の互換エイリアス */
export const toast = snackbar;

/* ---------- Bottom sheet / Dialog ---------- */
export function openSheet(html) {
  $('#sheetBody').innerHTML = html;
  $('#scrim').hidden = false;
  document.body.style.overflow = 'hidden';
}
export function closeSheet() {
  $('#scrim').hidden = true;
  $('#sheetBody').innerHTML = '';
  document.body.style.overflow = '';
}
export const openModal = openSheet;
export const closeModal = closeSheet;

/** 確認ダイアログ。Promise<boolean> を返す（window.confirm の M3 版） */
export function confirmDialog({ headline, body, confirmLabel = 'OK', cancelLabel = 'キャンセル', danger = false }) {
  return new Promise((resolve) => {
    openSheet(`
      <h2 class="md-dialog__headline" id="sheetTitle">${esc(headline)}</h2>
      ${body ? `<p class="md-dialog__body">${esc(body)}</p>` : ''}
      <div class="md-dialog__actions">
        <button class="md-button md-button--text md-state" data-dlg="cancel">${esc(cancelLabel)}</button>
        <button class="md-button md-button--filled md-state${danger ? ' md-button--danger' : ''}" data-dlg="ok">${esc(confirmLabel)}</button>
      </div>`);
    const handler = (ev) => {
      const btn = ev.target.closest('[data-dlg]');
      const backdrop = ev.target.id === 'scrim';
      if (!btn && !backdrop) return;
      $('#scrim').removeEventListener('click', handler);
      closeSheet();
      resolve(Boolean(btn && btn.dataset.dlg === 'ok'));
    };
    $('#scrim').addEventListener('click', handler);
  });
}

export function initOverlayEvents() {
  $('#scrim').addEventListener('click', (e) => {
    if (e.target.id === 'scrim' || e.target.closest('[data-close]')) closeSheet();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#scrim').hidden) closeSheet();
  });
  // Top app bar を M3 の on-scroll 状態に切り替える
  const bar = $('#topBar');
  const onScroll = () => bar.classList.toggle('is-scrolled', window.scrollY > 4);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* ---------- フォーマッタ ---------- */

export const fmtNum = (v, digits = 1) => {
  if (v === null || v === undefined || v === '' || !isFinite(v)) return '—';
  const n = Number(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(digits).replace(/\.0$/, '');
};

export const fmtVolume = (kg) => {
  const n = Number(kg) || 0;
  return n >= 10000 ? (n / 1000).toFixed(1) + 't' : Math.round(n).toLocaleString('ja-JP') + 'kg';
};

export const fmtDuration = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
};

export const fmtDateJP = (ymd) => {
  if (!ymd) return '—';
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dow = ['日', '月', '火', '水', '木', '金', '土'][new Date(y, m - 1, d).getDay()];
  return `${m}/${d}(${dow})`;
};

export const todayYMD = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/* ---------- M3 Progress indicators ---------- */

/** 円形の確定プログレス（M3 Circular progress indicator） */
export function circularProgress(percent, caption = '', variant = '') {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  const r = 56, c = 2 * Math.PI * r;
  return `
    <div class="md-circular-progress" role="progressbar" aria-valuenow="${Math.round(p)}" aria-valuemin="0" aria-valuemax="100">
      <svg width="132" height="132" viewBox="0 0 132 132">
        <circle class="md-circular-progress__track" cx="66" cy="66" r="${r}" fill="none" stroke-width="10"></circle>
        <circle class="md-circular-progress__indicator ${variant}" cx="66" cy="66" r="${r}" fill="none" stroke-width="10"
                stroke-dasharray="${(p / 100) * c} ${c}"></circle>
      </svg>
      <div class="md-circular-progress__label">
        <div class="md-circular-progress__value num">${Math.round(p)}<sup>%</sup></div>
        <div class="md-circular-progress__caption">${esc(caption)}</div>
      </div>
    </div>`;
}
/** 旧名の互換エイリアス */
export const ring = circularProgress;

/** 線形の確定プログレス（M3 Linear progress indicator） */
export const linearProgress = (percent, variant = '') => `
  <div class="md-linear-progress" role="progressbar" aria-valuenow="${Math.round(percent) || 0}" aria-valuemin="0" aria-valuemax="100">
    <div class="md-linear-progress__indicator ${variant}" style="width:${Math.max(0, Math.min(100, Number(percent) || 0))}%"></div>
  </div>`;

/* ---------- 空状態 ---------- */
export function emptyState(iconName, text, actionHtml = '') {
  return `<div class="md-empty">
    ${icon(iconName)}
    <p class="md-body-medium" style="margin:0">${esc(text)}</p>
    ${actionHtml}
  </div>`;
}
