/** dashboard.js — 月間レポート */
import { state } from '../state.js';
import { api } from '../api.js';
import { esc, icon, circularProgress, linearProgress, fmtVolume, fmtNum, fmtDateJP, snackbar, emptyState } from '../ui.js';

let viewMonth = null;

export async function render(root) {
  const now = new Date();
  if (!viewMonth) viewMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  let d = state.dashboard;
  if (!d || d.month !== viewMonth) {
    root.innerHTML = `<div class="md-card md-card--filled">
      <p class="md-body-medium on-surface-variant" style="margin:0">集計中…</p></div>`;
    try {
      d = await api.dashboard(viewMonth);
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
          return `<div class="ll-calendar__day ${lv ? `ll-calendar__day--l${lv}` : ''} ${isToday(c.date) ? 'll-calendar__day--today' : ''}"
                       title="${esc(c.date)} ${fmtVolume(c.volume)} ${esc(c.parts.join(','))}">${c.day}</div>`;
        }).join('')}
      </div>
      <div class="ll-calendar__legend">
        <span class="md-body-small on-surface-variant">少</span>
        ${[0, 1, 2, 3, 4].map((l) => `<span class="ll-calendar__day ${l ? `ll-calendar__day--l${l}` : ''}"></span>`).join('')}
        <span class="md-body-small on-surface-variant">多</span>
      </div>
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

  root.addEventListener('click', async (ev) => {
    const nav = ev.target.closest('[data-nav]');
    if (nav) {
      viewMonth = shiftMonth(d.month, Number(nav.dataset.nav));
      render(root);
      return;
    }
    if (ev.target.closest('#reloadDash')) {
      try {
        const fresh = await api.dashboard(viewMonth);
        state.dashboard = fresh;
        paint(root, fresh);
        snackbar('再集計しました', 'ok');
      } catch (err) { snackbar(err.message, 'err'); }
    }
  });
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
