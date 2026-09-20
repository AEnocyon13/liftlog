/** select.js — 部位（Filter chip）とメニュー（List）の選択 */
import { state, partsOf, menusOfPart, newDraft } from '../state.js';
import { esc, icon, emptyState } from '../ui.js';
import { showGuide } from './guide.js';
import { navigate } from '../router.js';

export function render(root) {
  const parts = partsOf();
  if (!state.picking.part && parts.length) state.picking.part = parts[0];
  const n = state.picking.selected.length;

  root.innerHTML = `
    <h2 class="md-section-header">部位</h2>
    <div class="md-chip-set" id="partRow">
      ${parts.map((p) => {
        const on = p === state.picking.part;
        return `<button class="md-chip md-state ${on ? 'is-selected' : ''}" data-part="${esc(p)}" aria-pressed="${on}">
          ${on ? icon('check', 'icon--sm') : ''}${esc(p)}
        </button>`;
      }).join('')}
    </div>

    <h2 class="md-section-header">メニュー（複数選択できます）</h2>
    <div id="menuList">${menuListHtml()}</div>

    <div class="ll-sticky-actions">
      <button class="md-button md-button--filled md-button--block md-button--tall md-state" id="nextBtn" ${n ? '' : 'disabled'}>
        ${n ? `${icon('scale')}${n}種目で重量を確認` : 'メニューを選択してください'}
      </button>
    </div>
  `;

  root.querySelector('#partRow').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-part]');
    if (!btn) return;
    state.picking.part = btn.dataset.part;
    render(root);
  });

  root.querySelector('#menuList').addEventListener('click', (e) => {
    const info = e.target.closest('[data-info]');
    if (info) {
      e.stopPropagation();
      showGuide(info.dataset.part, info.dataset.info);
      return;
    }
    const item = e.target.closest('[data-menu]');
    if (!item) return;
    toggle(item.dataset.part, item.dataset.menu);
    render(root);
  });

  root.querySelector('#nextBtn').addEventListener('click', () => {
    if (!state.picking.selected.length) return;
    newDraft(state.picking.selected.map((s) => ({ ...s })));
    navigate('/confirm');
  });
}

function menuListHtml() {
  const menus = menusOfPart(state.picking.part);
  if (!menus.length) {
    return emptyState('inbox', 'この部位のメニューがありません。スプレッドシートの Menus シートに追加してください。');
  }
  return `<div class="md-list">${menus.map((m) => {
    const on = isSelected(m.part, m.menu);
    return `
      <div class="md-list-item md-state ${on ? 'is-selected' : ''}" data-part="${esc(m.part)}" data-menu="${esc(m.menu)}"
           role="checkbox" aria-checked="${on}" tabindex="0">
        <span class="md-list-item__leading">${icon(on ? 'check' : 'scale')}</span>
        <div class="md-list-item__content">
          <div class="md-list-item__headline">${esc(m.menu)}</div>
          <div class="md-list-item__supporting">
            ${esc(m.equipment || '—')} · 目標 ${esc(m.repMin)}〜${esc(m.repMax)}レップ × ${esc(m.defaultSets)}セット
          </div>
        </div>
        <button class="md-icon-button md-state" data-info="${esc(m.menu)}" data-part="${esc(m.part)}" aria-label="${esc(m.menu)}の解説">
          ${icon('info')}
        </button>
      </div>`;
  }).join('')}</div>`;
}

const isSelected = (part, menu) =>
  state.picking.selected.some((s) => s.part === part && s.menu === menu);

function toggle(part, menu) {
  const i = state.picking.selected.findIndex((s) => s.part === part && s.menu === menu);
  if (i >= 0) state.picking.selected.splice(i, 1);
  else state.picking.selected.push({ part, menu });
}

export function resetPicking() {
  state.picking = { part: state.picking.part, selected: [] };
}
