/** home.js — ホーム（Extended FAB + 今月サマリ） */
import { state, loadDraft, canEdit } from '../state.js';
import { isConfigured } from '../config.js';
import { esc, icon, circularProgress, linearProgress, fmtVolume, fmtNum, fmtDateJP, emptyState } from '../ui.js';
import { mountHero, effectsOn } from '../scenes.js';
import { plateStrip } from '../plates.js';

/* 画面を離れるときに3Dを止める。放置すると電池を食う */
let disposeHero = null;

export function teardown() {
  disposeHero?.();
  disposeHero = null;
}

export function render(root) {
  disposeHero?.();
  disposeHero = null;

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
          手順は docs/SUPABASE.md にまとめてあります。
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
    <div class="ll-hero">
      ${effectsOn() ? '<canvas class="ll-scene" data-scene="hero"></canvas><div class="ll-scene-scrim"></div>' : ''}
      <div class="ll-row" style="justify-content:flex-end;margin:0 0 2px">
        <a class="md-chip md-chip--assist md-state" href="#/settings">${icon('person', 'icon--sm')}切り替え</a>
      </div>

      ${nextLift(d)}

      ${canEdit() ? (active ? resumeFab(draft) : startFab()) : peekBanner()}
    </div>

    ${d ? `
      <h2 class="md-section-header">${esc(d.monthLabel)}の進捗</h2>
      <div class="md-card md-card--elevated">
        <div class="ll-row ll-row--center" style="gap:20px">
          ${circularProgress(d.goal.achievementRate, `${d.goal.doneWorkouts} / ${d.goal.targetWorkouts} 回`,
                             d.goal.onTrack ? '' : 'md-circular-progress__indicator--tertiary')}
          <div class="ll-grow">
            <div class="md-title-small" style="margin-bottom:6px">月間目標</div>
            <p class="md-body-small on-surface-variant" style="margin:0 0 12px">
              ${d.goal.onTrack
                ? `今日時点の目安は ${esc(d.goal.expectedByToday)} 回。先行しています。`
                : `今日時点の目安は ${esc(d.goal.expectedByToday)} 回。あと ${esc(Math.max(0, Math.ceil(d.goal.expectedByToday - d.goal.doneWorkouts)))} 回で追いつきます。`}
            </p>
            ${linearProgress(d.goal.achievementRate)}
          </div>
        </div>
      </div>

      <div class="ll-sheet">
        <div class="ll-sheet__row"><span class="ll-sheet__k">総ボリューム</span><span class="ll-sheet__v">${fmtVolume(d.totals.volume)}</span></div>
        <div class="ll-sheet__row"><span class="ll-sheet__k">総セット</span><span class="ll-sheet__v">${esc(d.totals.sets)}</span></div>
        <div class="ll-sheet__row"><span class="ll-sheet__k">最後に鍛えてから</span><span class="ll-sheet__v">${d.restDays === null ? '—' : esc(d.restDays) + '<small>日</small>'}</span></div>
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

  const hero = root.querySelector('[data-scene="hero"]');
  if (hero) disposeHero = mountHero(hero);
}

/**
 * 次に持つ重さ。このアプリが存在する理由そのものなので、画面の頭に置く。
 * 前回いちばん重かった種目に、設定の増分を足した重量を出す。
 */
function nextLift(d) {
  const last = d?.lastMain;
  if (!last || !last.weight) return '';
  const step = Number(state.profile?.weight_increment) || 2.5;
  const next = Math.round((last.weight + step) * 100) / 100;
  const gear = state.exercises.find((e) => e.part === last.part && e.menu === last.menu);
  const reps = (last.reps || []).filter((r) => r).join('/');

  return `
    <section class="ll-next">
      <p class="ll-next__eyebrow">次に持つ重さ</p>
      <p class="ll-next__menu">${esc(last.menu)}<span class="on-surface-variant" style="font-weight:400"> ／ ${esc(last.part)}</span></p>
      <div class="ll-next__load">${fmtNum(next)}<small>kg</small></div>
      ${plateStrip(next, gear?.equipment)}
      <p class="ll-next__prev">
        前回 ${fmtDateJP(last.date)}　${fmtNum(last.weight)}kg${reps ? ` × ${esc(reps)}` : ''}
      </p>
    </section>`;
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
