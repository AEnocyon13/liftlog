/** session.js — ワークアウト実行中の記録画面（経過時間 + 休憩タイマー + セット記録） */
import { state, saveDraft, clearDraft } from '../state.js';
import * as db from '../db.js';
import { startAutosave, stopAutosave, touch, flushNow, autosaveState } from '../autosave.js';
import { esc, icon, snackbar, confirmDialog, fmtNum, fmtDuration, fmtVolume, emptyState } from '../ui.js';
import { showGuide } from './guide.js';
import { openExercisePicker } from './exercisePicker.js';
import { navigate } from '../router.js';
import { resetPicking } from './select.js';
import { restTimerHtml, startTicking, stopTicking, handleRestClick } from '../restTimer.js';

let elapsedId = null;

export function render(root) {
  const draft = state.draft;
  if (!draft || draft.status !== 'active') {
    root.innerHTML = emptyState('timer', '実施中のワークアウトはありません。',
      '<a class="md-button md-button--filled md-state" href="#/select">ワークアウトを開始</a>');
    return;
  }

  paint(root);
  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);
  startElapsed();
  startTicking(() => paintAndRebind(root));

  // 10分ごと・入力の数秒後・画面を離れるときに Supabase へ自動保存する
  if (state.workout) {
    startAutosave({
      workoutId: state.workout.id,
      getDraft: () => state.draft,
      onState: paintAutosave
    });
  }
}

export function teardown() {
  if (elapsedId) { clearInterval(elapsedId); elapsedId = null; }
  stopTicking();
  stopAutosave();
}

/** 自動保存の状態表示だけを差し替える（全体を再描画しない） */
function paintAutosave() {
  const el = document.querySelector('#autosave');
  if (el) el.outerHTML = autosaveHtml();
}

function autosaveHtml() {
  const { saving, dirty, lastSavedAt, lastError } = autosaveState();
  const label = lastError ? '保存できていません'
    : saving ? '保存中…'
    : lastSavedAt ? `${lastSavedAt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} に自動保存`
    : dirty ? '未保存の入力があります'
    : '自動保存は有効です';
  const tone = lastError ? 'md-chip--error' : 'md-chip--static';
  return `<span class="md-chip ${tone} md-label-medium" id="autosave" title="10分ごと・入力の数秒後・画面を離れるときに保存します">
    ${icon(lastError ? 'error' : 'check', 'icon--sm')}${esc(label)}
  </span>`;
}

function startElapsed() {
  if (elapsedId) clearInterval(elapsedId);
  const startedAt = (() => {
    const t = new Date(state.draft?.startTime ?? state.workout?.started_at ?? Date.now()).getTime();
    return Number.isFinite(t) ? t : Date.now();
  })();
  const tick = () => {
    const el = document.querySelector('#elapsed');
    if (!el) { clearInterval(elapsedId); elapsedId = null; return; }
    el.textContent = fmtDuration(Date.now() - startedAt);
  };
  tick();
  elapsedId = setInterval(tick, 1000);
}

function paint(root) {
  const draft = state.draft;
  const totals = calcTotals(draft);

  root.innerHTML = `
    <div class="md-card md-card--elevated">
      <div class="ll-row ll-row--between">
        <div>
          <div class="md-label-medium on-surface-variant">経過時間</div>
          <div class="ll-timer num" id="elapsed">00:00</div>
        </div>
        <div style="text-align:right">
          <div class="md-label-medium on-surface-variant">記録済みボリューム</div>
          <div class="md-headline-small num" id="totVolume">${fmtVolume(totals.volume)}</div>
          <div class="md-body-small on-surface-variant" id="totSets">${totals.sets} セット完了</div>
        </div>
      </div>
      <div style="margin-top:12px">${autosaveHtml()}</div>
    </div>

    ${restTimerHtml()}

    ${draft.entries.map((e, ei) => entryCard(e, ei)).join('')}

    <button class="md-button md-button--outlined md-button--block md-state" id="addExerciseBtn" style="margin-top:4px">
      ${icon('add')}種目を追加する
    </button>

    <div class="md-field" style="margin-top:24px">
      <textarea class="md-field__input" rows="2" data-act="memo" id="sessionMemo"
                placeholder="例：睡眠不足だが調子は良い">${esc(draft.memo || '')}</textarea>
      <label class="md-field__label" for="sessionMemo">今日のメモ（体調・気づき）</label>
    </div>

    <div class="ll-sticky-actions">
      <button class="md-button md-button--filled md-button--block md-button--tall md-state" id="finishBtn">
        ${icon('stop')}ワークアウト終了して記録
      </button>
      <button class="md-button md-button--text md-button--danger md-button--block md-state" id="abortBtn">
        記録せずに中止
      </button>
    </div>
  `;
}

/** 再描画してイベントを貼り直す（休憩タイマーの状態変化などで呼ぶ） */
function paintAndRebind(root) {
  root.removeEventListener('click', onClick);
  root.removeEventListener('input', onInput);
  paint(root);
  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);
  startElapsed();
  startTicking(() => paintAndRebind(root));
}

function entryCard(e, ei) {
  const carried = e.suggestion?.status === 'carry_over';
  return `
    <div class="md-card md-card--elevated" data-entry="${ei}">
      <div class="md-card__header">
        <div class="ll-grow">
          <div class="md-card__title">${esc(e.menu)}</div>
          <div class="md-card__subhead">
            ${esc(e.part)}${carried ? ` · 前回 ${fmtNum(e.suggestion.baseWeight)}kg → 今回 ${fmtNum(e.weight)}kg` : ` · ${fmtNum(e.weight)}kg`}
          </div>
        </div>
        <button class="md-icon-button md-state" data-act="guide" aria-label="解説">${icon('info')}</button>
      </div>

      <div class="ll-set-head"><span>#</span><span>重量 kg</span><span>レップ</span><span>RPE</span><span></span></div>
      ${e.sets.map((s, si) => setRow(s, si)).join('')}

      <div class="ll-row" style="margin-top:12px">
        <button class="md-button md-button--tonal md-button--compact md-state ll-grow" data-act="addset">${icon('add')}セット追加</button>
        <button class="md-button md-button--outlined md-button--compact md-state ll-grow" data-act="addwarm">${icon('add')}ウォームアップ</button>
      </div>
    </div>`;
}

function setRow(s, si) {
  return `
    <div class="ll-set-row ${s.isWarmup ? 'll-set-row--warmup' : ''}" data-set="${si}">
      <div class="ll-set-row__no">${s.isWarmup ? 'W' : s.setNo}</div>
      <div class="md-field md-field--compact" style="margin:0">
        <input class="md-field__input" type="number" inputmode="decimal" step="0.25" data-f="weight"
               value="${s.weight ?? ''}" aria-label="重量">
      </div>
      <div class="md-field md-field--compact" style="margin:0">
        <input class="md-field__input" type="number" inputmode="numeric" data-f="reps"
               value="${s.reps ?? ''}" placeholder="—" aria-label="レップ">
      </div>
      <div class="md-field md-field--compact" style="margin:0">
        <select class="md-field__input" data-f="rpe" aria-label="RPE">
          <option value="">—</option>
          ${[6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10].map((v) =>
            `<option value="${v}" ${String(s.rpe) === String(v) ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </div>
      <button class="md-icon-button md-state" data-act="delset" aria-label="このセットを削除"
              style="width:40px;height:40px">${icon('close', 'icon--sm')}</button>
    </div>`;
}

function calcTotals(draft) {
  let volume = 0, sets = 0;
  draft.entries.forEach((e) => e.sets.forEach((s) => {
    const w = Number(s.weight) || 0, r = Number(s.reps) || 0;
    if (!r || s.isWarmup) return;
    volume += w * r; sets++;
  }));
  return { volume, sets };
}

function locate(el) {
  const card = el.closest('[data-entry]');
  const row = el.closest('[data-set]');
  const entry = card ? state.draft.entries[Number(card.dataset.entry)] : null;
  const set = (entry && row) ? entry.sets[Number(row.dataset.set)] : null;
  return { entry, set, setIndex: row ? Number(row.dataset.set) : -1 };
}

function onInput(ev) {
  const el = ev.target;
  if (el.dataset.act === 'memo') {
    state.draft.memo = el.value;
    saveDraft();
    touch();
    return;
  }
  if (!el.dataset.f) return;
  const { set } = locate(el);
  if (!set) return;
  set[el.dataset.f] = el.value === '' ? '' : Number(el.value);
  saveDraft();
  touch();
  const totals = calcTotals(state.draft);
  const volEl = ev.currentTarget.querySelector('#totVolume');
  const setEl = ev.currentTarget.querySelector('#totSets');
  if (volEl) volEl.textContent = fmtVolume(totals.volume);
  if (setEl) setEl.textContent = `${totals.sets} セット完了`;
}

function onClick(ev) {
  const root = ev.currentTarget;
  if (handleRestClick(ev.target)) return paintAndRebind(root);
  if (ev.target.closest('#finishBtn')) return finish(root);
  if (ev.target.closest('#abortBtn')) return abort();
  if (ev.target.closest('#addExerciseBtn')) return addExercise(root);

  const btn = ev.target.closest('[data-act]');
  if (!btn) return;
  const { entry, setIndex } = locate(btn);
  const act = btn.dataset.act;

  if (act === 'guide' && entry) return showGuide(entry.part, entry.menu);
  if (!entry) return;

  if (act === 'addset' || act === 'addwarm') {
    const isWarm = act === 'addwarm';
    const workSets = entry.sets.filter((s) => !s.isWarmup);
    const lastWork = workSets[workSets.length - 1];
    entry.sets.push({
      setNo: isWarm ? 0 : workSets.length + 1,
      weight: isWarm ? Math.round(((entry.weight || 0) * 0.5) / 2.5) * 2.5 : (lastWork?.weight ?? entry.weight),
      reps: isWarm ? '' : (lastWork?.reps ?? ''),
      rpe: '', isWarmup: isWarm
    });
  } else if (act === 'delset' && setIndex >= 0) {
    entry.sets.splice(setIndex, 1);
    renumber(entry);
  } else {
    return;
  }
  saveDraft();
  touch();
  paintAndRebind(root);
}

/**
 * ワークアウト中に種目を足す。
 * 履歴があれば通常の開始時と同じく、前回のセット数・レップを引き継いで重量だけ上げた状態で入る。
 */
function addExercise(root) {
  openExercisePicker({
    exclude: state.draft.entries.map((e) => ({ part: e.part, menu: e.menu })),
    onPick: async (picked) => {
      try {
        const increment = Number(state.profile?.weight_increment) || 2.5;
        const { suggestion } = await db.suggestion(state.profile.id, picked, increment);
        state.draft.entries.push({
          part: picked.part,
          menu: picked.menu,
          suggestion,
          config: picked,
          weight: suggestion.finalWeight ?? null,
          increment: suggestion.increment ?? increment,
          plan: (suggestion.plan || []).map((p) => ({ ...p })),
          sets: (suggestion.plan || []).map((p, i) => ({
            setNo: i + 1,
            weight: p.weight ?? null,
            reps: p.reps === '' || p.reps == null ? '' : p.reps,
            rpe: '',
            isWarmup: false
          }))
        });
        saveDraft();
        touch();
        paintAndRebind(root);
        snackbar(suggestion.status === 'carry_over'
          ? `${picked.menu} を追加しました（前回 ${fmtNum(suggestion.baseWeight)}kg → ${fmtNum(suggestion.finalWeight)}kg）`
          : `${picked.menu} を追加しました（履歴が無いので重量を入力してください）`, 'ok');
        // 追加した種目までスクロールする
        requestAnimationFrame(() => {
          const cards = root.querySelectorAll('[data-entry]');
          cards[cards.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      } catch (err) {
        snackbar(err.message, 'err');
      }
    }
  });
}

function renumber(entry) {
  let n = 1;
  entry.sets.forEach((s) => { if (!s.isWarmup) s.setNo = n++; });
}

async function finish(root) {
  const draft = state.draft;
  const entries = draft.entries.map((e) => ({
    part: e.part,
    menu: e.menu,
    sets: e.sets
      .filter((s) => Number(s.reps) > 0)
      .map((s) => ({
        setNo: s.setNo, weight: Number(s.weight) || 0, reps: Number(s.reps),
        rpe: s.rpe === '' ? '' : Number(s.rpe), isWarmup: !!s.isWarmup
      }))
  })).filter((e) => e.sets.length);

  if (!entries.length) {
    snackbar('レップ数が入力されたセットがありません', 'err');
    return;
  }
  const ok = await confirmDialog({
    headline: 'ワークアウトを終了しますか？',
    body: '入力済みのセットを記録として保存します。',
    confirmLabel: '記録する'
  });
  if (!ok) return;
  await flushNow();

  try {
    const res = await db.finishWorkout(state.workout, entries, {
      memo: draft.memo || '',
      restMinutes: draft.rest?.minutes,
      startedAt: draft.startTime
    });
    teardown();
    clearDraft();
    resetPicking();
    state.workout = null;
    state.dashboard = await db.dashboard(state.profile.id);
    snackbar(`${res.savedSets}セット / ${fmtVolume(res.totalVolume)} を記録しました`, 'ok');
    navigate('/dashboard');
  } catch (err) {
    snackbar(err.message, 'err');
  }
}

async function abort() {
  const ok = await confirmDialog({
    headline: 'ワークアウトを中止しますか？',
    body: '入力した内容は破棄され、記録されません。',
    confirmLabel: '破棄する',
    danger: true
  });
  if (!ok) return;
  const workout = state.workout;
  teardown();
  clearDraft();
  resetPicking();
  state.workout = null;
  if (workout) { try { await db.deleteWorkout(workout.id); } catch { /* 既に無ければ無視 */ } }
  snackbar('ワークアウトを中止しました');
  navigate('/home');
}
