/** dashboard.js — 月間レポート */
import { state, canEdit } from '../state.js';
import * as db from '../db.js';
import * as gcal from '../googleCalendar.js';
import { esc, icon, circularProgress, linearProgress, fmtVolume, fmtNum, fmtDateJP,
         snackbar, emptyState, confirmDialog, openSheet } from '../ui.js';

let viewMonth = null;

export async function render(root) {
  const now = new Date();
  if (!viewMonth) viewMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  let d = state.dashboard;
  if (!d || d.month !== viewMonth) {
    root.innerHTML = `<div class="md-card md-card--filled">
      <p class="md-body-medium on-surface-variant" style="margin:0">集計中…</p></div>`;
    try {
      d = await db.dashboard(state.profile.id, viewMonth);
      if (d.month === state.dashboard?.month || !state.dashboard) state.dashboard = d;
    } catch (err) {
      root.innerHTML = `<div class="md-card md-card--filled">
        <div class="md-card__title" style="color:var(--md-sys-color-error)">読み込みエラー</div>
        <p class="md-body-medium on-surface-variant">${esc(err.message)}</p></div>`;
      return;
    }
  }

  paint(root, d);
}

function paint(root, d) {
  const g = d.goal, t = d.totals;
  const maxVol = Math.max(1, ...d.calendar.map((c) => c.volume));
  const maxPart = Math.max(1, ...d.byPart.map((p) => p.volume));
  const maxTrend = Math.max(1, ...d.trend.map((m) => m.volume));

  root.innerHTML = `
    <div class="md-segmented" style="margin:8px 0 16px">
      <button class="md-segmented__item md-state" data-nav="-1">${icon('back', 'icon--sm')}前月</button>
      <button class="md-segmented__item md-state is-selected" disabled>${esc(d.monthLabel)}</button>
      <button class="md-segmented__item md-state" data-nav="1" ${isCurrentOrFuture(d.month) ? 'disabled' : ''}>翌月${icon('chevron', 'icon--sm')}</button>
    </div>

    <div class="md-card md-card--elevated">
      <div class="ll-row ll-row--center" style="gap:20px">
        ${circularProgress(g.achievementRate, `${g.doneWorkouts} / ${g.targetWorkouts} 回`,
                           g.onTrack ? '' : 'md-circular-progress__indicator--tertiary')}
        <div class="ll-grow">
          <div class="md-card__title" style="margin-bottom:12px">月間目標の達成度</div>
          ${kv('実施', `${g.doneWorkouts} 回`)}
          ${kv('残り', `${g.remaining} 回`)}
          ${kv('今日時点の目安', `${fmtNum(g.expectedByToday)} 回`)}
          <span class="md-chip ${g.onTrack ? 'md-chip--tonal' : 'md-chip--static'}" style="margin-top:8px">
            ${icon(g.onTrack ? 'trending-up' : 'timer', 'icon--sm')}${g.onTrack ? '順調' : '遅れ'} ${fmtNum(g.pace)}%
          </span>
        </div>
      </div>
      ${g.targetVolume > 0 ? `
        <hr class="md-divider">
        <div class="ll-row ll-row--between md-body-medium" style="margin-bottom:8px">
          <span class="on-surface-variant">総ボリューム目標</span>
          <span class="num" style="font-weight:500">${fmtVolume(t.volume)} / ${fmtVolume(g.targetVolume)}（${fmtNum(g.volumeRate)}%）</span>
        </div>
        ${linearProgress(g.volumeRate, 'md-linear-progress__indicator--tertiary')}` : ''}
    </div>

    <div class="ll-stat-grid">
      ${stat(fmtVolume(t.volume), '総ボリューム')}
      ${stat(t.sets, '総セット')}
      ${stat(t.reps, '総レップ')}
      ${stat(t.minutes, '総時間', '分')}
      ${stat(fmtVolume(t.avgVolumePerSession), '1回平均')}
      ${stat(t.avgMinutesPerSession, '平均時間', '分')}
    </div>

    <h2 class="md-section-header">トレーニング日</h2>
    <div class="md-card md-card--elevated">
      <div class="ll-calendar">
        ${['日', '月', '火', '水', '木', '金', '土'].map((w) => `<div class="ll-calendar__dow">${w}</div>`).join('')}
        ${Array.from({ length: d.calendar[0].dow }, () => '<div></div>').join('')}
        ${d.calendar.map((c) => {
          const lv = c.volume === 0 ? 0 : Math.min(4, Math.ceil((c.volume / maxVol) * 4));
          const clickable = c.sets > 0;
          return `<div class="ll-calendar__day ${lv ? `ll-calendar__day--l${lv}` : ''} ${isToday(c.date) ? 'll-calendar__day--today' : ''} ${clickable ? 'll-calendar__day--open md-state' : ''}"
                       ${clickable ? `data-day="${esc(c.date)}" role="button" tabindex="0"` : ''}
                       title="${esc(c.date)} ${fmtVolume(c.volume)} ${esc(c.parts.join(','))}">${c.day}</div>`;
        }).join('')}
      </div>
      <div class="ll-calendar__legend">
        <span class="md-body-small on-surface-variant">少</span>
        ${[0, 1, 2, 3, 4].map((l) => `<span class="ll-calendar__day ${l ? `ll-calendar__day--l${l}` : ''}"></span>`).join('')}
        <span class="md-body-small on-surface-variant">多</span>
      </div>
      <p class="md-body-small on-surface-variant" style="margin:8px 0 0;text-align:center">
        色の付いた日をタップすると、その日の内容が見られます
      </p>
    </div>

    <h2 class="md-section-header">部位別ボリューム</h2>
    <div class="md-card md-card--elevated">
      ${d.byPart.length ? `<div class="ll-bars">${d.byPart.map((p) => `
        <div class="ll-bars__row">
          <div class="ll-bars__label">${esc(p.part)}</div>
          ${linearProgress((p.volume / maxPart) * 100)}
          <div class="ll-bars__value">${fmtNum(p.ratio)}%</div>
        </div>`).join('')}</div>` : emptyState('inbox', '記録がありません')}
    </div>

    ${d.prs.length ? `
      <h2 class="md-section-header">自己ベスト更新（推定1RM）</h2>
      <div class="md-list">
        ${d.prs.map((p) => `
          <div class="md-list-item md-list-item--static">
            <span class="md-list-item__leading">${icon('trending-up')}</span>
            <div class="md-list-item__content">
              <div class="md-list-item__headline">${esc(p.menu)}</div>
              <div class="md-list-item__supporting">${esc(p.part)} · ${fmtNum(p.weight)}kg × ${p.reps}回 · ${fmtDateJP(p.date)}</div>
            </div>
            <div class="md-list-item__trailing">
              <div class="md-label-large num" style="color:var(--md-sys-color-on-surface)">${fmtNum(p.est1RM)}kg</div>
              <div class="md-body-small" style="color:var(--md-sys-color-primary)">+${fmtNum(p.gain)}kg</div>
            </div>
          </div>`).join('')}
      </div>` : ''}

    ${d.topLifts.length ? `
      <h2 class="md-section-header">今月の最大挙上（推定1RM上位）</h2>
      <div class="md-card md-card--elevated">
        <div class="ll-bars">
          ${d.topLifts.map((l) => `
            <div class="ll-bars__row" style="grid-template-columns:1fr auto">
              <div class="ll-bars__label" style="width:auto">${esc(l.menu)}</div>
              <div class="ll-bars__value">${fmtNum(l.est1RM)}kg</div>
            </div>`).join('')}
        </div>
      </div>` : ''}

    ${(d.recentWorkouts || []).length ? `
      <h2 class="md-section-header">${esc(d.monthLabel)}のワークアウト</h2>
      <div class="md-list">
        ${d.recentWorkouts.map((w) => `
          <div class="md-list-item md-state" data-day="${esc(w.date)}" role="button" tabindex="0">
            <span class="md-list-item__leading">${icon('calendar')}</span>
            <div class="md-list-item__content">
              <div class="md-list-item__headline">${fmtDateJP(w.date)}　${esc(w.parts.join(' / ') || '—')}</div>
              <div class="md-list-item__supporting">
                ${w.sets}セット · ${fmtVolume(w.volume)} · ${w.durationMin}分${w.calendarEventId ? ' · カレンダー登録済み' : ''}
              </div>
            </div>
            ${canEdit() ? `
              <button class="md-icon-button md-state" data-del="${esc(w.id)}" data-date="${esc(w.date)}"
                      aria-label="この記録を削除" style="color:var(--md-sys-color-error)">${icon('delete')}</button>` : ''}
          </div>`).join('')}
      </div>` : ''}

    <h2 class="md-section-header">直近6ヶ月の推移</h2>
    <div class="md-card md-card--elevated">
      <div class="ll-bars">
        ${d.trend.map((m) => `
          <div class="ll-bars__row">
            <div class="ll-bars__label">${esc(m.month.replace('-', '/'))}</div>
            ${linearProgress((m.volume / maxTrend) * 100, m.month === d.month ? '' : 'md-linear-progress__indicator--tertiary')}
            <div class="ll-bars__value">${m.workouts}回</div>
          </div>`).join('')}
      </div>
    </div>

    <button class="md-button md-button--outlined md-button--block md-state" id="reloadDash" style="margin-top:16px">
      ${icon('refresh')}再集計する
    </button>
  `;

  // キーボード操作でも日付を開けるようにする
  root.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const day = ev.target.closest?.('[data-day]');
    if (!day) return;
    ev.preventDefault();
    openDayDetail(day.dataset.day);
  });

  root.addEventListener('click', async (ev) => {
    const del = ev.target.closest('[data-del]');
    if (del) { ev.stopPropagation(); return deleteWorkout(root, d, del.dataset.del, del.dataset.date); }

    const day = ev.target.closest('[data-day]');
    if (day) return openDayDetail(day.dataset.day);

    const nav = ev.target.closest('[data-nav]');
    if (nav) {
      viewMonth = shiftMonth(d.month, Number(nav.dataset.nav));
      render(root);
      return;
    }
    if (ev.target.closest('#reloadDash')) {
      try {
        const fresh = await db.dashboard(state.profile.id, viewMonth);
        state.dashboard = fresh;
        paint(root, fresh);
        snackbar('再集計しました', 'ok');
      } catch (err) { snackbar(err.message, 'err'); }
    }
  });
}

/** その日の内容をボトムシートで見せる */
async function openDayDetail(date) {
  openSheet(`<h2 class="md-dialog__headline" id="sheetTitle">${fmtDateJP(date)}</h2>
    <p class="md-dialog__body">読み込み中…</p>`);
  try {
    const d = await db.workoutDetail(state.profile.id, date);
    openSheet(dayDetailHtml(d));
  } catch (err) {
    openSheet(`<h2 class="md-dialog__headline" id="sheetTitle">${fmtDateJP(date)}</h2>
      <p class="md-dialog__body" style="color:var(--md-sys-color-error)">${esc(err.message)}</p>`);
  }
}

function dayDetailHtml(d) {
  const w = d.workout;
  const time = (w && w.started_at && w.ended_at)
    ? `${hhmm(w.started_at)} 〜 ${hhmm(w.ended_at)}`
    : null;
  const parts = [...new Set(d.entries.map((e) => e.part))];

  return `
    <h2 class="md-dialog__headline" id="sheetTitle">${fmtDateJP(d.date)}</h2>
    <div class="md-chip-set" style="margin-bottom:16px">
      ${parts.map((p) => `<span class="md-chip md-chip--tonal">${esc(p)}</span>`).join('')}
      ${time ? `<span class="md-chip md-chip--static">${icon('timer', 'icon--sm')}${esc(time)}</span>` : ''}
      ${w?.duration_min ? `<span class="md-chip md-chip--static">${w.duration_min}分</span>` : ''}
    </div>

    <div class="ll-stat-grid" style="margin-bottom:16px">
      <div class="ll-stat"><div class="ll-stat__value num">${fmtVolume(d.totals.volume)}</div><div class="ll-stat__label">ボリューム</div></div>
      <div class="ll-stat"><div class="ll-stat__value num">${d.totals.sets}</div><div class="ll-stat__label">セット</div></div>
      <div class="ll-stat"><div class="ll-stat__value num">${d.totals.reps}</div><div class="ll-stat__label">レップ</div></div>
    </div>

    ${d.entries.length ? d.entries.map((e) => `
      <div class="md-card md-card--filled" style="margin-bottom:8px">
        <div class="ll-row ll-row--between" style="margin-bottom:8px">
          <span class="md-title-small">${esc(e.menu)}</span>
          <span class="md-body-small on-surface-variant">${esc(e.part)}</span>
        </div>
        <div class="ll-stack" style="gap:4px">
          ${e.sets.map((s2) => `
            <div class="ll-row ll-row--between md-body-medium">
              <span class="on-surface-variant">${s2.isWarmup ? 'W' : s2.setNo}</span>
              <span class="num">${fmtNum(s2.weight)}kg × ${s2.reps}${s2.rpe ? `　RPE ${s2.rpe}` : ''}</span>
            </div>`).join('')}
        </div>
      </div>`).join('')
    : `<p class="md-body-medium on-surface-variant">この日の記録は見つかりませんでした。</p>`}

    ${w?.memo ? `
      <h3 class="md-section-header">メモ</h3>
      <p class="md-body-medium" style="margin:0;white-space:pre-wrap">${esc(w.memo)}</p>` : ''}
    ${w?.calendar_event_id ? `
      <p class="md-body-small on-surface-variant" style="margin:16px 0 0">
        ${icon('calendar', 'icon--sm')} Googleカレンダーに登録済み
      </p>` : ''}`;
}

const hhmm = (iso) => new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

/** 記録を削除する。カレンダーに予定を作っていれば、そちらも消す。 */
async function deleteWorkout(root, d, id, date) {
  const target = (d.recentWorkouts || []).find((w) => String(w.id) === String(id));
  const linked = target?.calendarEventId && state.profile?.calendar_id;
  const ok = await confirmDialog({
    headline: `${fmtDateJP(date)} の記録を削除しますか？`,
    body: 'この日のセットがすべて消えます。元に戻せません。'
        + (linked ? 'Googleカレンダーの予定も一緒に削除します。' : ''),
    confirmLabel: '削除する',
    danger: true
  });
  if (!ok) return;

  try {
    if (linked) {
      try {
        await gcal.deleteEvent({
          calendarId: state.profile.calendar_id, eventId: target.calendarEventId
        });
      } catch (err) {
        snackbar('カレンダーの予定を消せませんでした。' + err.message, 'err');
      }
    }
    await db.deleteWorkout(id);
    const fresh = await db.dashboard(state.profile.id, d.month);
    state.dashboard = fresh;
    snackbar('記録を削除しました', 'ok');
    paint(root, fresh);
  } catch (err) {
    snackbar(err.message, 'err');
  }
}

const kv = (label, value) => `
  <div class="ll-row ll-row--between md-body-medium" style="margin-bottom:4px">
    <span class="on-surface-variant">${esc(label)}</span>
    <span class="num" style="font-weight:500">${esc(value)}</span>
  </div>`;

const stat = (value, label, unit = '') => `
  <div class="ll-stat">
    <div class="ll-stat__value num">${esc(value)}${unit ? `<small>${esc(unit)}</small>` : ''}</div>
    <div class="ll-stat__label">${esc(label)}</div>
  </div>`;

function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function isCurrentOrFuture(month) {
  const now = new Date();
  return month >= `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function isToday(ymd) {
  const n = new Date();
  return ymd === `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

export function resetMonth() { viewMonth = null; }
