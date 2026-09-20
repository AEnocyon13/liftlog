/** confirm.js — 推奨重量の提示と確定 */
import { state, saveDraft } from '../state.js';
import { api } from '../api.js';
import { esc, icon, snackbar, fmtNum, fmtDateJP, emptyState } from '../ui.js';
import { showGuide } from './guide.js';
import { navigate } from '../router.js';

const STATUS_META = {
  increase:   { cls: 'll-suggestion',                     chip: 'md-chip--tonal',  label: '増量',      ico: 'trending-up' },
  add_reps:   { cls: 'll-suggestion ll-suggestion--addreps', chip: 'md-chip--static', label: 'レップ +1', ico: 'add' },
  hold:       { cls: 'll-suggestion ll-suggestion--hold',  chip: 'md-chip--static', label: '据え置き',  ico: 'remove' },
  deload:     { cls: 'll-suggestion ll-suggestion--deload', chip: 'md-chip--error',  label: 'ディロード', ico: 'error' },
  no_history: { cls: 'll-suggestion ll-suggestion--none',  chip: 'md-chip--static', label: '初回',      ico: 'info' }
};

export async function render(root) {
  const draft = state.draft;
  if (!draft || !draft.selection?.length) {
    root.innerHTML = emptyState('inbox', 'メニューが選択されていません。',
      '<a class="md-button md-button--filled md-state" href="#/select">メニュー選択へ</a>');
    return;
  }

  if (!draft.entries?.length) {
    root.innerHTML = `<div class="md-card md-card--filled">
      <p class="md-body-medium on-surface-variant" style="margin:0">前回の実績を読み込んで重量を計算しています…</p></div>`;
    try {
      const results = await Promise.all(
        draft.selection.map((s) => api.suggestion({ part: s.part, menu: s.menu }))
      );
      draft.entries = results.map((r, i) => buildEntry(draft.selection[i], r));
      draft.status = 'confirming';
      saveDraft();
    } catch (err) {
      root.innerHTML = `<div class="md-card md-card--filled">
        <div class="md-card__title" style="color:var(--md-sys-color-error)">読み込みエラー</div>
        <p class="md-body-medium on-surface-variant">${esc(err.message)}</p>
        <a class="md-button md-button--outlined md-button--block md-state" href="#/select">戻る</a></div>`;
      return;
    }
  }

  paint(root);
}

function buildEntry(sel, res) {
  const s = res.suggestion;
  const conf = res.menuConfig;
  return {
    part: sel.part,
    menu: sel.menu,
    suggestion: s,
    config: conf,
    weight: s.finalWeight ?? s.recommendedWeight ?? null,
    manualDelta: 0,
    plannedSets: s.recommendedSets || conf.defaultSets || 3,
    sets: []
  };
}

function paint(root) {
  const draft = state.draft;
  root.innerHTML = `
    <div class="md-card md-card--filled">
      <p class="md-body-medium on-surface-variant" style="margin:0">
        前回の実績から漸進性過負荷（ダブルプログレッション + RPE補正）で算出しています。
        提案は <b>＋ / −</b> ボタンと数値入力でいつでも上書きできます。
      </p>
    </div>

    ${draft.entries.map((e, i) => suggestionCard(e, i)).join('')}

    <div class="ll-sticky-actions">
      <button class="md-button md-button--filled md-button--block md-button--tall md-state" id="startBtn">
        ${icon('play')}この重量で開始する
      </button>
      <a class="md-button md-button--text md-button--block md-state" href="#/select">メニューを選び直す</a>
    </div>
  `;

  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
}

function suggestionCard(e, i) {
  const s = e.suggestion;
  const meta = STATUS_META[s.status] || STATUS_META.hold;
  const step = s.weightStep || 2.5;
  const delta = (e.weight !== null && s.baseWeight !== null) ? e.weight - s.baseWeight : null;
  const last = s.lastSummary;

  return `
    <div class="md-card md-card--elevated ${meta.cls}" data-idx="${i}">
      <div class="md-card__header">
        <div class="ll-grow">
          <div class="md-card__title">${esc(e.menu)}</div>
          <div class="md-card__subhead">${esc(e.part)} · 目標 ${esc(s.targetReps)} レップ</div>
        </div>
        <div class="ll-row" style="gap:4px;align-items:center">
          <span class="md-chip ${meta.chip}">${icon(meta.ico, 'icon--sm')}${esc(meta.label)}</span>
          <button class="md-icon-button md-state" data-act="guide" aria-label="解説">${icon('info')}</button>
        </div>
      </div>

      <div class="ll-row ll-row--between" style="align-items:flex-end;margin-bottom:16px">
        <div>
          <div class="ll-suggestion__weight num">${e.weight === null ? '—' : fmtNum(e.weight)}<span> kg</span></div>
          ${delta !== null && delta !== 0
            ? `<div class="ll-suggestion__delta ll-suggestion__delta--${delta > 0 ? 'up' : 'down'}">
                 前回比 ${delta > 0 ? '+' : ''}${fmtNum(delta)} kg</div>`
            : `<div class="ll-suggestion__delta on-surface-variant">${s.baseWeight === null ? '履歴なし・手動で入力' : '前回と同じ重量'}</div>`}
        </div>
        <div class="md-field md-field--compact" style="width:96px;margin-bottom:0">
          <input class="md-field__input" type="number" min="1" max="12" data-act="sets" value="${esc(e.plannedSets)}" id="sets-${i}">
          <label class="md-field__label" for="sets-${i}">セット数</label>
        </div>
      </div>

      <div class="md-stepper" style="margin-bottom:12px">
        <button class="md-stepper__btn md-state" data-act="dec" data-step="${step}" aria-label="${step}kg 減らす">${icon('remove')}</button>
        <input class="md-stepper__value" type="number" inputmode="decimal" step="0.25"
               data-act="weight" value="${e.weight ?? ''}" placeholder="重量" aria-label="重量 kg">
        <button class="md-stepper__btn md-state" data-act="inc" data-step="${step}" aria-label="${step}kg 増やす">${icon('add')}</button>
      </div>

      <div class="md-chip-set" style="margin-bottom:16px">
        ${(s.deltaOptions || []).filter((d) => d !== 0).map((d) => `
          <button class="md-chip md-state" data-act="quick" data-delta="${d}">${d > 0 ? '+' : ''}${fmtNum(d)}</button>`).join('')}
        ${s.recommendedWeight !== null
          ? `<button class="md-chip md-state" data-act="reset">${icon('refresh', 'icon--sm')}提案値に戻す</button>` : ''}
      </div>

      <div class="ll-suggestion__reason">${esc(s.reason)}</div>

      ${last ? `
        <hr class="md-divider">
        <div class="ll-row ll-row--between md-body-small on-surface-variant">
          <span>前回 ${fmtDateJP(last.date)}</span>
          <span class="num">${fmtNum(last.weight)}kg × ${last.reps.join('/')}回${last.avgRpe ? ` · RPE ${last.avgRpe}` : ''}</span>
        </div>` : ''}
    </div>`;
}

function entryFromEvent(el) {
  const card = el.closest('[data-idx]');
  if (!card) return {};
  const idx = Number(card.dataset.idx);
  return { idx, entry: state.draft.entries[idx], card };
}

function onClick(ev) {
  const root = ev.currentTarget;
  if (ev.target.closest('#startBtn')) return start(root);

  const btn = ev.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;
  const { entry } = entryFromEvent(btn);
  if (!entry) return;

  if (act === 'guide') return showGuide(entry.part, entry.menu);

  const step = Number(btn.dataset.step || entry.suggestion.weightStep || 2.5);
  if (act === 'inc' || act === 'dec' || act === 'quick') {
    const d = act === 'quick' ? Number(btn.dataset.delta) : (act === 'inc' ? step : -step);
    entry.weight = Math.max(0, Math.round(((entry.weight || 0) + d) * 100) / 100);
  } else if (act === 'reset') {
    entry.weight = entry.suggestion.recommendedWeight;
  } else {
    return;
  }
  saveDraft();
  repaint(root);
}

function onChange(ev) {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  const { entry } = entryFromEvent(el);
  if (!entry) return;
  if (el.dataset.act === 'weight') {
    const v = el.value === '' ? null : Number(el.value);
    entry.weight = (v !== null && isFinite(v)) ? v : null;
  } else if (el.dataset.act === 'sets') {
    entry.plannedSets = Math.max(1, Math.min(12, Number(el.value) || 1));
  }
  saveDraft();
  repaint(ev.currentTarget);
}

function repaint(root) {
  root.removeEventListener('click', onClick);
  root.removeEventListener('change', onChange);
  paint(root);
}

async function start(root) {
  const draft = state.draft;
  const missing = draft.entries.filter((e) => e.weight === null || !isFinite(e.weight));
  if (missing.length) {
    snackbar(`${missing[0].menu} の重量を入力してください`, 'err');
    return;
  }

  try {
    const res = await api.startSession({
      parts: [...new Set(draft.entries.map((e) => e.part))],
      menus: draft.entries.map((e) => e.menu)
    });
    draft.sessionId = res.sessionId;
    draft.startTime = res.startTime;
    draft.date = res.date;
    draft.status = 'active';
    draft.entries.forEach((e) => {
      e.sets = Array.from({ length: e.plannedSets }, (_, i) => ({
        setNo: i + 1, weight: e.weight, reps: '', rpe: '', isWarmup: false, done: false
      }));
    });
    saveDraft();
    snackbar('ワークアウトを開始しました', 'ok');
    navigate('/session');
  } catch (err) {
    snackbar(err.message, 'err');
  }
}
