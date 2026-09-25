/** home.js — ホーム（Extended FAB + 今月サマリ） */
import { state, loadDraft, getUser, canEdit } from '../state.js';
import { isConfigured } from '../api.js';
import { esc, icon, circularProgress, linearProgress, fmtVolume, fmtDateJP, emptyState } from '../ui.js';

export function render(root) {
  if (!isConfigured()) {
    root.innerHTML = `
      <div class="md-card md-card--filled">
        <div class="md-card__header">
          <div>
            <div class="md-card__title">はじめに接続設定が必要です</div>
            <div class="md-card__subhead">GASのWebアプリURLとAPIキーを登録してください</div>
          </div>
        </div>
        <p class="md-body-medium on-surface-variant" style="margin-top:0">
          入力した内容はこの端末のブラウザにのみ保存されます。
        </p>
        <a class="md-button md-button--filled md-button--block md-state" href="#/settings">
          ${icon('settings')}設定を開く
        </a>
      </div>`;
    return;
  }

  const draft = loadDraft();
  const active = draft && draft.status === 'active';
  const d = state.dashboard;

  root.innerHTML = `
    <div class="ll-row ll-row--between" style="margin:4px 4px 12px">
      <span class="md-title-medium">${esc(state.user?.displayName || getUser() || '')} さんの記録</span>
      <a class="md-chip md-chip--assist md-state" href="#/settings">${icon('person', 'icon--sm')}切り替え</a>
    </div>

    ${canEdit() ? (active ? resumeFab(draft) : startFab()) : peekBanner()}

    ${d ? `
      <h2 class="md-section-header">${esc(d.monthLabel)}の進捗</h2>
      <div class="md-card md-card--elevated">
        <div class="ll-row ll-row--center" style="gap:20px">
          ${circularProgress(d.goal.achievementRate, `${d.goal.doneWorkouts} / ${d.goal.targetWorkouts} 回`,
                             d.goal.onTrack ? '' : 'md-circular-progress__indicator--tertiary')}
          <div class="ll-grow">
            <div class="ll-row ll-row--between" style="margin-bottom:8px">
              <span class="md-label-large on-surface-variant">ペース</span>
              <span class="md-chip ${d.goal.onTrack ? 'md-chip--tonal' : 'md-chip--static'}" style="height:28px;padding:0 12px">
                ${icon(d.goal.onTrack ? 'trending-up' : 'timer', 'icon--sm')}
                ${d.goal.onTrack ? '順調' : '遅れ'} ${esc(d.goal.pace)}%
              </span>
            </div>
            <p class="md-body-small on-surface-variant" style="margin:0 0 12px">
              今日時点の目安 ${esc(d.goal.expectedByToday)} 回 ／ 残り ${esc(d.goal.remaining)} 回
            </p>
            ${linearProgress(d.goal.achievementRate)}
          </div>
        </div>
      </div>

      <div class="ll-stat-grid">
        ${stat(fmtVolume(d.totals.volume), '総ボリューム')}
        ${stat(d.totals.sets, '総セット')}
        ${stat(d.restDays === null ? '—' : d.restDays, '最終から', '日')}
      </div>

      ${d.prs && d.prs.length ? `
        <h2 class="md-section-header">今月の自己ベスト更新</h2>
        <div class="md-list">
          ${d.prs.slice(0, 3).map((p) => `
            <div class="md-list-item md-list-item--static">
              <span class="md-list-item__leading">${icon('trending-up')}</span>
              <div class="md-list-item__content">
                <div class="md-list-item__headline">${esc(p.menu)}</div>
                <div class="md-list-item__supporting">${esc(p.weight)}kg × ${esc(p.reps)}回 · ${fmtDateJP(p.date)}</div>
              </div>
              <span class="md-chip md-chip--tonal">+${esc(p.gain)}kg</span>
            </div>`).join('')}
        </div>` : ''}

      <h2 class="md-section-header">直近の記録</h2>
      ${recentList(d)}
    ` : emptyState('inbox', 'データを読み込めませんでした。設定を確認して再読み込みしてください。')}
  `;
}

const stat = (value, label, unit = '') => `
  <div class="ll-stat">
    <div class="ll-stat__value num">${esc(value)}${unit ? `<small>${esc(unit)}</small>` : ''}</div>
    <div class="ll-stat__label">${esc(label)}</div>
  </div>`;

const startFab = () => `
  <a class="md-fab-extended md-state" href="#/select">
    ${icon('play', 'icon--lg')}
    <span>ワークアウト開始
      <span class="md-fab-extended__sub">部位とメニューを選ぶ</span>
    </span>
  </a>`;

const peekBanner = () => `
  <div class="ll-peek-banner">
    <span class="ll-peek-banner__icon">${icon('eye')}</span>
    <div>
      <div class="md-title-medium">覗き見モード</div>
      <p class="md-body-small" style="margin:2px 0 0">
        記録の閲覧だけができます。ワークアウトの開始・記録・設定の変更はできません。
      </p>
    </div>
  </div>
  <a class="md-button md-button--outlined md-button--block md-state" href="#/login" style="margin-bottom:12px">
    ${icon('lock')}PINを入力して本人としてログイン
  </a>`;

const resumeFab = (draft) => `
  <a class="md-fab-extended md-fab-extended--tertiary md-state" href="#/session">
    ${icon('timer', 'icon--lg')}
    <span>実施中のワークアウトを再開
      <span class="md-fab-extended__sub">${esc((draft.entries || []).map((e) => e.menu).join(' / ') || '記録を続ける')}</span>
    </span>
  </a>`;

function recentList(d) {
  const days = (d.calendar || []).filter((c) => c.sets > 0).slice(-5).reverse();
  if (!days.length) return emptyState('calendar', '今月の記録はまだありません。');
  return `<div class="md-list">${days.map((c) => `
    <div class="md-list-item md-list-item--static">
      <span class="md-list-item__leading">${icon('calendar')}</span>
      <div class="md-list-item__content">
        <div class="md-list-item__headline">${fmtDateJP(c.date)}</div>
        <div class="md-list-item__supporting">${esc(c.parts.join(' / ') || '—')}</div>
      </div>
      <div class="md-list-item__trailing">
        <div class="md-label-large num" style="color:var(--md-sys-color-on-surface)">${fmtVolume(c.volume)}</div>
        <div class="md-body-small">${esc(c.sets)} セット</div>
      </div>
    </div>`).join('')}</div>`;
}
