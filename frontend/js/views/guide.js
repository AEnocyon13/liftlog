/** guide.js — メニュー解説（ボトムシート & 一覧画面） */
import { state, guideFor } from '../state.js';
import { esc, icon, openSheet, emptyState } from '../ui.js';

export function showGuide(part, menu) {
  const g = guideFor(part, menu);
  if (!g) {
    openSheet(`
      <h2 class="md-dialog__headline" id="sheetTitle">${esc(menu)}</h2>
      <p class="md-body-medium on-surface-variant">${esc(part)}</p>
      ${emptyState('book', 'この種目の解説がドキュメントにまだありません。Googleドキュメントに「見出し2 = 種目名」で追加してください。')}
    `);
    return;
  }
  openSheet(guideHtml(g));
}

export function guideHtml(g) {
  return `
    <h2 class="md-dialog__headline" id="sheetTitle">${esc(g.menu)}</h2>
    <div class="md-chip-set" style="margin-bottom:8px">
      ${g.part ? `<span class="md-chip md-chip--static">${esc(g.part)}</span>` : ''}
      ${g.equipment ? `<span class="md-chip md-chip--static">${esc(g.equipment)}</span>` : ''}
      ${g.repRange ? `<span class="md-chip md-chip--tonal">${esc(g.repRange)}レップ</span>` : ''}
      ${(g.tags || []).map((t) => `<span class="md-chip md-chip--static">#${esc(t)}</span>`).join('')}
    </div>

    ${(g.muscles || []).length ? `
      <h3 class="md-section-header">主働筋</h3>
      <p class="md-body-large" style="margin:0">${g.muscles.map(esc).join(' · ')}</p>` : ''}

    ${g.description ? `
      <h3 class="md-section-header">解説</h3>
      <p class="md-body-large" style="margin:0;white-space:pre-wrap;line-height:1.85">${esc(g.description)}</p>` : ''}

    ${(g.points || []).length ? `
      <h3 class="md-section-header">ポイント</h3>
      <ul class="md-body-medium" style="margin:0;padding-left:20px">
        ${g.points.map((p) => `<li style="margin-bottom:6px">${esc(p)}</li>`).join('')}
      </ul>` : ''}

    ${(g.cautions || []).length ? `
      <h3 class="md-section-header" style="color:var(--md-sys-color-error)">注意点</h3>
      <ul class="md-body-medium" style="margin:0;padding-left:20px">
        ${g.cautions.map((p) => `<li style="margin-bottom:6px">${esc(p)}</li>`).join('')}
      </ul>` : ''}

    ${(g.videos || []).length ? `
      <h3 class="md-section-header">参考動画</h3>
      <div class="md-list">
        ${g.videos.map((v) => `
          <a class="md-list-item md-state" href="${esc(v.url)}" target="_blank" rel="noopener noreferrer">
            <span class="md-list-item__leading">${icon('play')}</span>
            <div class="md-list-item__content">
              <div class="md-list-item__headline">${esc(v.title)}</div>
              <div class="md-list-item__supporting">YouTubeで開く</div>
            </div>
            <span class="md-list-item__trailing">${icon('open')}</span>
          </a>`).join('')}
      </div>` : ''}
  `;
}

/** 種目解説の一覧画面 */
export function render(root) {
  const guides = state.guides || [];
  if (!guides.length) {
    root.innerHTML = emptyState('book',
      '解説データがありません。Googleドキュメントに種目を追加し、設定画面から「解説を再読込」してください。',
      '<a class="md-button md-button--filled md-state" href="#/settings">設定を開く</a>');
    return;
  }
  const byPart = guides.reduce((acc, g) => {
    (acc[g.part || 'その他'] ||= []).push(g);
    return acc;
  }, {});

  root.innerHTML = Object.entries(byPart).map(([part, items]) => `
    <h2 class="md-section-header">${esc(part)}</h2>
    <div class="md-list">
      ${items.map((g) => `
        <div class="md-list-item md-state" data-key="${esc(g.key)}" role="button" tabindex="0">
          <span class="md-list-item__leading">${icon('book')}</span>
          <div class="md-list-item__content">
            <div class="md-list-item__headline">${esc(g.menu)}</div>
            <div class="md-list-item__supporting">${esc((g.description || '解説なし').slice(0, 44))}${(g.description || '').length > 44 ? '…' : ''}</div>
          </div>
          <span class="md-list-item__trailing ll-row ll-row--center" style="gap:4px">
            ${(g.videos || []).length ? `<span class="md-chip md-chip--static" style="height:24px;padding:0 8px">${icon('play', 'icon--sm')}${g.videos.length}</span>` : ''}
            ${icon('chevron')}
          </span>
        </div>`).join('')}
    </div>
  `).join('');

  root.addEventListener('click', (e) => {
    const item = e.target.closest('[data-key]');
    if (!item) return;
    const g = guides.find((x) => x.key === item.dataset.key);
    if (g) openSheet(guideHtml(g));
  });
}
