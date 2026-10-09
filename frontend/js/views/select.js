/** select.js — 部位（Filter chip）とメニュー（List）の選択 */
import { state, partsOf, menusOfPart, newDraft } from '../state.js';
import * as db from '../db.js';
import { esc, icon, emptyState, snackbar, confirmDialog } from '../ui.js';
import { showGuide } from './guide.js';
import { openNewExerciseSheet } from './exercisePicker.js';
import { navigate } from '../router.js';
import { loadCatalog } from '../app.js';

let tidying = false;   // 「整理」モード中は、解説ボタンの代わりに非表示ボタンを出す

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

    <div class="ll-row ll-row--between" style="align-items:flex-end">
      <h2 class="md-section-header">メニュー（複数選択できます）</h2>
      <button class="md-button md-button--text md-button--compact md-state md-label-medium" id="tidyBtn">
        ${tidying ? icon('check', 'icon--sm') : icon('delete', 'icon--sm')}${tidying ? '整理をやめる' : '整理'}
      </button>
    </div>
    ${tidying ? `<div class="ll-peek-notice">${icon('info', 'icon--sm')}使わない種目を一覧から隠せます。記録は消えません。</div>` : ''}
    <div id="menuList">${menuListHtml()}</div>
    <button class="md-button md-button--outlined md-button--block md-state" id="addExercise" style="margin-top:8px">
      ${icon('add')}種目を追加する
    </button>

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

  root.querySelector('#menuList').addEventListener('click', async (e) => {
    const hide = e.target.closest('[data-hide]');
    if (hide) {
      e.stopPropagation();
      await hideExercise(hide.dataset.hide, hide.dataset.name, root);
      return;
    }
    const info = e.target.closest('[data-info]');
    if (info) {
      e.stopPropagation();
      showGuide(info.dataset.part, info.dataset.info);
      return;
    }
    const item = e.target.closest('[data-menu]');
    if (!item || tidying) return;
    toggle(item.dataset.part, item.dataset.menu);
    render(root);
  });

  root.querySelector('#tidyBtn').addEventListener('click', () => {
    tidying = !tidying;
    render(root);
  });

  root.querySelector('#addExercise').addEventListener('click', () => {
    openNewExerciseSheet({
      defaultPart: state.picking.part,
      onCreated: (added) => {
        if (!added) return;
        state.picking.part = added.part;
        // 追加した種目はそのまま選んだ状態にする
        if (!isSelected(added.part, added.menu)) {
          state.picking.selected.push({ part: added.part, menu: added.menu });
        }
        render(root);
      }
    });
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
        ${tidying
          ? `<button class="md-icon-button md-state" data-hide="${m.id}" data-name="${esc(m.menu)}"
                     aria-label="${esc(m.menu)}を一覧から隠す" style="color:var(--md-sys-color-error)">
               ${icon('delete')}
             </button>`
          : `<button class="md-icon-button md-state" data-info="${esc(m.menu)}" data-part="${esc(m.part)}" aria-label="${esc(m.menu)}の解説">
               ${icon('info')}
             </button>`}
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

/** 一覧から隠す（active=false）。過去の記録は残る。 */
async function hideExercise(id, name, root) {
  const ok = await confirmDialog({
    headline: `「${name}」を一覧から隠しますか？`,
    body: '選択肢から消えるだけで、これまでの記録は残ります。'
        + '同じ名前でもう一度「種目を追加する」から登録すれば元に戻せます。',
    confirmLabel: '隠す',
    danger: true
  });
  if (!ok) return;
  try {
    await db.hideExercise(Number(id));
    await loadCatalog(true);
    // 隠した種目が選択済みなら外す
    state.picking.selected = state.picking.selected.filter(
      (s) => state.exercises.some((e) => e.part === s.part && e.menu === s.menu));
    snackbar(`「${name}」を一覧から隠しました`, 'ok');
    render(root);
  } catch (err) {
    snackbar(err.message, 'err');
  }
}

export function resetPicking() {
  state.picking = { part: state.picking.part, selected: [] };
}
