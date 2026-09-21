/** confirm.js — 今回のプラン（前回のセット・レップ + 重量アップ）の確認と確定 */
import { state, saveDraft } from '../state.js';
import { api } from '../api.js';
import { esc, icon, snackbar, fmtNum, fmtDateJP, emptyState } from '../ui.js';
import { showGuide } from './guide.js';
import { navigate } from '../router.js';

const META = {
  carry_over: { cls: 'll-suggestion',                    chip: 'md-chip--tonal',  ico: 'trending-up' },
  no_history: { cls: 'll-suggestion ll-suggestion--none', chip: 'md-chip--static', ico: 'info' }
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
      <p class="md-body-medium on-surface-variant" style="margin:0">前回の実績を読み込んでいます…</p></div>`;
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
  return {
    part: sel.part,
    menu: sel.menu,
    suggestion: s,
    config: res.menuConfig,
    weight: s.finalWeight ?? s.recommendedWeight ?? null,
    increment: s.increment ?? 2.5,
    plan: (s.plan || []).map((p) => ({ ...p })),
    sets: []
  };
}

function paint(root) {
  const draft = state.draft;
  root.innerHTML = `
    <div class="md-card md-card--filled">
      <p class="md-body-medium on-surface-variant" style="margin:0">
        前回のセット数とレップ数をそのまま引き継ぎ、重量だけ自動で上げています。
        きつい／軽いと感じたら、ここで重量とセット数を調整してから開始してください。
      </p>
    </div>

    ${draft.entries.map((e, i) => planCard(e, i)).join('')}

    <div class="ll-sticky-actions">
      <button class="md-button md-button--filled md-button--block md-button--tall md-state" id="startBtn">
        ${icon('play')}この内容で開始する
      </button>
      <a class="md-button md-button--text md-button--block md-state" href="#/select">メニューを選び直す</a>
    </div>
  `;
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
}

function planCard(e, i) {
  const s = e.suggestion;
  const meta = META[s.status] || META.carry_over;
  const step = e.increment || 2.5;
  const last = s.lastSummary;
  const newHistory = s.status === 'no_history';

  return `
    <div class="md-card md-card--elevated ${meta.cls}" data-idx="${i}">
      <div class="md-card__header">
        <div class="ll-grow">
          <div class="md-card__title">${esc(e.menu)}</div>
          <div class="md-card__subhead">${esc(e.part)}${last ? ` · 前回 ${fmtDateJP(last.date)}` : ''}</div>
        </div>
        <div class="ll-row" style="gap:4px;align-items:center">
          <span class="md-chip ${meta.chip}">${icon(meta.ico, 'icon--sm')}${esc(s.headline)}</span>
          <button class="md-icon-button md-state" data-act="guide" aria-label="解説">${icon('info')}</button>
        </div>
      </div>

      <div class="ll-row ll-row--between" style="align-items:flex-end;margin-bottom:16px">
        <div>
          <div class="ll-suggestion__weight num">${e.weight === null ? '—' : fmtNum(e.weight)}<span> kg</span></div>
          ${last
            ? `<div class="ll-suggestion__delta ll-suggestion__delta--up">前回 ${fmtNum(last.weight)}kg から +${fmtNum(e.weight - last.weight)}kg</div>`
            : `<div class="ll-suggestion__delta on-surface-variant">履歴なし・重量を入力してください</div>`}
        </div>
        <div style="text-align:right">
          <div class="md-label-medium on-surface-variant" style="margin-bottom:4px">セット数</div>
          <div class="ll-row" style="gap:4px;align-items:center;justify-content:flex-end">
            <button class="md-icon-button md-state" data-act="setminus" aria-label="セットを減らす"
                    style="width:36px;height:36px" ${e.plan.length <= 1 ? 'disabled' : ''}>${icon('remove', 'icon--sm')}</button>
            <span class="num md-title-large" style="min-width:20px;text-align:center">${e.plan.length}</span>
            <button class="md-icon-button md-state" data-act="setplus" aria-label="セットを増やす"
                    style="width:36px;height:36px" ${e.plan.length >= 12 ? 'disabled' : ''}>${icon('add', 'icon--sm')}</button>
          </div>
        </div>
      </div>

      <div class="md-stepper" style="margin-bottom:12px">
        <button class="md-stepper__btn md-state" data-act="dec" aria-label="${step}kg 減らす">${icon('remove')}</button>
        <input class="md-stepper__value" type="number" inputmode="decimal" step="0.25"
               data-act="weight" value="${e.weight ?? ''}" placeholder="重量" aria-label="重量 kg">
        <button class="md-stepper__btn md-state" data-act="inc" aria-label="${step}kg 増やす">${icon('add')}</button>
      </div>

      <div class="ll-plan">
        ${e.plan.map((p, pi) => `
          <div class="ll-plan__row">
            <span class="ll-plan__no num">${pi + 1}</span>
            <span class="ll-plan__weight num">${p.weight === null ? '—' : fmtNum(p.weight)}<small>kg</small></span>
            <span class="on-surface-variant">×</span>
            <input class="ll-plan__reps num" type="number" inputmode="numeric" min="1" max="99"
                   data-act="reps" data-set="${pi}" value="${p.reps ?? ''}" aria-label="${pi + 1}セット目のレップ">
            <span class="ll-plan__unit md-body-small on-surface-variant">レップ</span>
            ${p.prevReps !== undefined && p.prevWeight !== undefined
              ? `<span class="ll-plan__prev md-body-small">前回 ${fmtNum(p.prevWeight)}kg × ${p.prevReps}</span>` : ''}
          </div>`).join('')}
      </div>

      <div class="ll-suggestion__reason" style="margin-top:12px">${esc(s.reason)}</div>
      ${newHistory ? '' : `
        <hr class="md-divider">
        <div class="ll-row ll-row--between md-body-small on-surface-variant">
          <span>前回の合計</span>
          <span class="num">${fmtNum(last.totalVolume)}kg${last.avgRpe ? ` · RPE ${last.avgRpe}` : ''}</span>
        </div>`}
    </div>`;
}

function entryFromEvent(el) {
  const card = el.closest('[data-idx]');
  if (!card) return {};
  return { entry: state.draft.entries[Number(card.dataset.idx)] };
}

/** メイン重量を変更したら、プランの各セットにも同じ差分を反映する */
function applyWeight(entry, next) {
  const before = entry.weight;
  entry.weight = next;
  if (next === null) return;
  const delta = (before === null) ? null : next - before;
  entry.plan.forEach((p) => {
    p.weight = (delta === null || p.weight === null)
      ? next
      : Math.round((p.weight + delta) * 100) / 100;
  });
}

function onClick(ev) {
  const root = ev.currentTarget;
  if (ev.target.closest('#startBtn')) return start(root);

  const btn = ev.target.closest('[data-act]');
  if (!btn) return;
  const { entry } = entryFromEvent(btn);
  if (!entry) return;
  const act = btn.dataset.act;
  const step = entry.increment || 2.5;

  if (act === 'guide') return showGuide(entry.part, entry.menu);

  if (act === 'inc' || act === 'dec') {
    const d = act === 'inc' ? step : -step;
    applyWeight(entry, Math.max(0, Math.round(((entry.weight || 0) + d) * 100) / 100));
  } else if (act === 'setplus') {
    const lastRow = entry.plan[entry.plan.length - 1];
    entry.plan.push({ setNo: entry.plan.length + 1, weight: lastRow?.weight ?? entry.weight, reps: lastRow?.reps ?? '' });
  } else if (act === 'setminus') {
    if (entry.plan.length > 1) entry.plan.pop();
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
    applyWeight(entry, (v !== null && isFinite(v)) ? v : null);
  } else if (el.dataset.act === 'reps') {
    const row = entry.plan[Number(el.dataset.set)];
    if (row) row.reps = el.value === '' ? '' : Math.max(1, Math.min(99, Number(el.value) || 1));
  } else {
    return;
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
      menus: draft.entries.map((e) => e.menu),
      restMinutes: draft.rest?.minutes
    });
    draft.sessionId = res.sessionId;
    draft.startTime = res.startTime;
    draft.date = res.date;
    draft.status = 'active';
    // 重量もレップも入力済みの状態でセット行を作る
    draft.entries.forEach((e) => {
      e.sets = e.plan.map((p, i) => ({
        setNo: i + 1,
        weight: p.weight ?? e.weight,
        reps: p.reps === '' || p.reps === null || p.reps === undefined ? '' : p.reps,
        rpe: '',
        isWarmup: false
      }));
    });
    saveDraft();
    snackbar('ワークアウトを開始しました', 'ok');
    navigate('/session');
  } catch (err) {
    snackbar(err.message, 'err');
  }
}
