/**
 * exercisePicker.js — 種目の追加登録と、ワークアウト中の種目選択
 *
 * メニュー選択画面とワークアウト中の画面の両方から使う共通のボトムシート。
 *   openNewExerciseSheet … 部位と種目名を入れて種目マスターに1件足す
 *   openExercisePicker   … 既存の種目から選ぶ（ここからも新規登録に進める）
 */
import { state, partsOf, menusOfPart } from '../state.js';
import * as db from '../db.js';
import { esc, icon, openSheet, closeSheet, snackbar } from '../ui.js';
import { loadCatalog } from '../app.js';

/* ---------- 新しい種目を登録する ---------- */

/**
 * @param {string}   defaultPart 最初に選んでおく部位
 * @param {Function} onCreated   登録後に呼ばれる（引数は追加された種目オブジェクト）
 */
export function openNewExerciseSheet({ defaultPart = '', onCreated } = {}) {
  let part = defaultPart || partsOf()[0] || '';
  let newPart = false;

  const paint = () => {
    openSheet(`
      <h2 class="md-dialog__headline" id="sheetTitle">種目を追加</h2>
      <p class="md-dialog__body" style="margin-top:-8px">
        追加した種目は全員の一覧に出ます。器具や目標レップは既定値で始まります。
      </p>

      <h3 class="md-section-header">部位</h3>
      <div class="md-chip-set" id="partChips">
        ${partsOf().map((p) => `
          <button class="md-chip md-state ${!newPart && p === part ? 'is-selected' : ''}" data-part="${esc(p)}">
            ${!newPart && p === part ? icon('check', 'icon--sm') : ''}${esc(p)}
          </button>`).join('')}
        <button class="md-chip md-chip--suggestion md-state ${newPart ? 'is-selected' : ''}" data-part="__new">
          ${icon('add', 'icon--sm')}新しい部位
        </button>
      </div>

      ${newPart ? `
        <div class="md-field" style="margin-top:20px">
          <input class="md-field__input" id="newPartName" type="text" maxlength="12"
                 placeholder="前腕" value="${esc(partsOf().includes(part) ? '' : part)}">
          <label class="md-field__label" for="newPartName">新しい部位の名前</label>
        </div>` : ''}

      <div class="md-field" style="margin-top:20px">
        <input class="md-field__input" id="exerciseName" type="text" maxlength="40" placeholder="ケーブルフライ">
        <label class="md-field__label" for="exerciseName">種目名</label>
      </div>

      <div class="md-dialog__actions">
        <button class="md-button md-button--text md-state" data-close="1">キャンセル</button>
        <button class="md-button md-button--filled md-state" id="createExercise">${icon('check')}追加する</button>
      </div>`);

    document.querySelector('#partChips').addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-part]');
      if (!btn) return;
      if (btn.dataset.part === '__new') { newPart = true; part = ''; }
      else { newPart = false; part = btn.dataset.part; }
      const keep = document.querySelector('#exerciseName')?.value || '';
      paint();
      document.querySelector('#exerciseName').value = keep;
      (newPart ? document.querySelector('#newPartName') : document.querySelector('#exerciseName'))?.focus();
    });

    document.querySelector('#createExercise').addEventListener('click', async () => {
      const chosenPart = newPart ? document.querySelector('#newPartName').value.trim() : part;
      const name = document.querySelector('#exerciseName').value.trim();
      try {
        const created = await db.createExercise({
          part: chosenPart, name, userId: state.profile?.id
        });
        await loadCatalog(true);
        closeSheet();
        snackbar(created.restored
          ? `「${created.name}」を一覧に戻しました`
          : `「${created.name}」を追加しました`, 'ok');
        const added = state.exercises.find((e) => e.id === created.id);
        onCreated?.(added || { id: created.id, part: created.part, menu: created.name });
      } catch (err) {
        snackbar(err.message, 'err');
      }
    });

    setTimeout(() => document.querySelector(newPart ? '#newPartName' : '#exerciseName')?.focus(), 60);
  };

  paint();
}

/* ---------- 既存の種目から選ぶ ---------- */

/**
 * @param {Array}    exclude  すでに選んである種目（[{part, menu}]）。一覧から外す
 * @param {Function} onPick   選ばれた種目オブジェクトを受け取る
 */
export function openExercisePicker({ exclude = [], onPick } = {}) {
  let part = exclude[0]?.part || partsOf()[0] || '';
  const isExcluded = (e) => exclude.some((x) => x.part === e.part && x.menu === e.menu);

  const paint = () => {
    const list = menusOfPart(part).filter((e) => !isExcluded(e));
    openSheet(`
      <h2 class="md-dialog__headline" id="sheetTitle">種目を追加</h2>

      <div class="md-chip-set">
        ${partsOf().map((p) => `
          <button class="md-chip md-state ${p === part ? 'is-selected' : ''}" data-part="${esc(p)}">
            ${p === part ? icon('check', 'icon--sm') : ''}${esc(p)}
          </button>`).join('')}
      </div>

      <div class="md-list" style="margin-top:16px">
        ${list.length ? list.map((e) => `
          <div class="md-list-item md-state" data-id="${e.id}" role="button" tabindex="0">
            <span class="md-list-item__leading">${icon('scale')}</span>
            <div class="md-list-item__content">
              <div class="md-list-item__headline">${esc(e.menu)}</div>
              <div class="md-list-item__supporting">${esc(e.equipment || '—')}</div>
            </div>
            <span class="md-list-item__trailing">${icon('chevron')}</span>
          </div>`).join('')
        : `<p class="md-body-medium on-surface-variant" style="padding:8px 4px">
             この部位で追加できる種目がありません。
           </p>`}
      </div>

      <button class="md-button md-button--outlined md-button--block md-state" id="newExercise" style="margin-top:8px">
        ${icon('add')}新しい種目を登録する
      </button>`);

    document.querySelector('.md-chip-set').addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-part]');
      if (!btn) return;
      part = btn.dataset.part;
      paint();
    });

    document.querySelector('.md-list').addEventListener('click', (ev) => {
      const item = ev.target.closest('[data-id]');
      if (!item) return;
      const picked = state.exercises.find((e) => String(e.id) === item.dataset.id);
      if (!picked) return;
      closeSheet();
      onPick?.(picked);
    });

    document.querySelector('#newExercise').addEventListener('click', () => {
      openNewExerciseSheet({
        defaultPart: part,
        onCreated: (added) => { closeSheet(); onPick?.(added); }
      });
    });
  };

  paint();
}
