/** settings.js — ユーザー / PIN / 表示テーマ / Supabase接続 / トレーニング設定 */
import { state, canEdit, getMode, resetSession, rememberRestMinutes } from '../state.js';
import { getSupabaseConfig, setSupabaseConfig, isConfigured,
         getGoogleConfig, setGoogleConfig, isGoogleConfigured } from '../config.js';
import * as gcal from '../googleCalendar.js';
import { openSheet, closeSheet } from '../ui.js';
import * as auth from '../auth.js';
import * as db from '../db.js';
import { esc, icon, snackbar, confirmDialog, fmtNum } from '../ui.js';
import { getTheme, setTheme, THEMES } from '../theme.js';
import { navigate } from '../router.js';
import { bootstrap, paintNetState, loadCatalog } from '../app.js';
import { reset as resetLogin } from './login.js';

/** 3Dの演出を出す設定か。既定は入（scenes.js の effectsOn と同じ鍵を見る） */
function effectsPref() {
  try { return localStorage.getItem('liftlog.effects') !== 'off'; } catch { return true; }
}

let myEmail = null;

export async function render(root) {
  paint(root);
  if (canEdit() && myEmail === null) {
    myEmail = (await auth.myEmail()) || '';
    paint(root);
  }
}

function paint(root) {
  const c = getSupabaseConfig();
  const p = state.profile;
  const editable = canEdit();
  const peeking = Boolean(p) && getMode() === 'peek';
  const theme = getTheme();

  root.innerHTML = `
    ${p ? `
      <h2 class="md-section-header">ユーザー</h2>
      <div class="md-card md-card--elevated">
        <div class="md-list-item md-list-item--static" style="margin:0;background:transparent;padding:0">
          <span class="md-list-item__leading">${icon('person')}</span>
          <div class="md-list-item__content">
            <div class="md-list-item__headline">${esc(p.display_name)}</div>
            <div class="md-list-item__supporting">${editable ? '本人としてログイン中' : '閲覧のみ'}</div>
          </div>
          ${peeking ? `<span class="md-chip md-chip--peek">${icon('eye', 'icon--sm')}覗き見中</span>` : ''}
        </div>
        ${peeking ? `
          <a class="md-button md-button--filled md-button--block md-state" href="#/login" style="margin-top:12px">
            ${icon('lock')}PINを入力して本人としてログイン
          </a>` : ''}
        <button class="md-button md-button--outlined md-button--block md-state" id="switchUser" style="margin-top:8px">
          ${icon('logout')}${editable ? 'ログアウト' : '別の人に切り替える'}
        </button>
      </div>

      ${editable ? `
        <h2 class="md-section-header">アカウント</h2>
        <div class="md-card md-card--elevated">
          ${textField('displayName', '氏名', p.display_name)}
          <div class="md-field">
            <input class="md-field__input" id="email" type="email" inputmode="email"
                   autocapitalize="none" value="${esc(myEmail ?? '')}" placeholder="you@example.com">
            <label class="md-field__label" for="email">メールアドレス</label>
            <span class="md-field__support">今後のGoogleカレンダー連携に使います。他の人には表示されません</span>
          </div>
          <button class="md-button md-button--tonal md-button--block md-state" id="saveAccount">
            ${icon('check')}氏名とメールを保存
          </button>
          <hr class="md-divider">
          <div class="md-card__title" style="margin-bottom:12px">PINの変更</div>
          <div class="md-field">
            <input class="md-field__input ll-pin" id="curPin" type="password" inputmode="numeric" maxlength="4" placeholder="••••">
            <label class="md-field__label" for="curPin">現在のPIN</label>
          </div>
          <div class="md-field">
            <input class="md-field__input ll-pin" id="newPin" type="password" inputmode="numeric" maxlength="4" placeholder="••••">
            <label class="md-field__label" for="newPin">新しいPIN</label>
          </div>
          <button class="md-button md-button--tonal md-button--block md-state" id="changePin">
            ${icon('lock')}PINを変更する
          </button>
        </div>` : ''}

      ${editable ? googleSection(p) : ''}

      <h2 class="md-section-header">トレーニング設定</h2>
      <div class="md-card md-card--elevated">
        ${peeking ? `<div class="ll-peek-notice">${icon('eye', 'icon--sm')}覗き見中は変更できません</div>` : ''}
        ${numField('weight_increment', '自動で足す重量 (kg)', p.weight_increment, 0.25, 20, 0.25,
                   '前回と同じセット数・レップのまま、この分だけ重量を上げて提案します')}
        ${numField('rest_minutes', '休憩タイマーの既定 (分)', p.rest_minutes, 1, 15, 1,
                   'ワークアウト中に変更すると、その値が次回に引き継がれます')}
        ${numField('monthly_target_workouts', '月間目標ワークアウト回数', p.monthly_target_workouts, 1, 31, 1)}
        ${numField('monthly_target_volume', '月間目標総ボリューム (kg)', p.monthly_target_volume, 0, 1000000, 1000,
                   '0 にすると非表示になります')}
      </div>
    ` : `
      <div class="md-card md-card--filled">
        <div class="md-card__title">ログインしていません</div>
        <p class="md-body-medium on-surface-variant">名前を選ぶと記録を始められます。</p>
        <a class="md-button md-button--filled md-button--block md-state" href="#/login">${icon('person')}ログイン画面へ</a>
      </div>
    `}

    <h2 class="md-section-header">表示</h2>
    <div class="md-card md-card--elevated">
      <div class="md-card__title" style="margin-bottom:12px">テーマ</div>
      <div class="md-segmented" id="themeSwitch">
        ${THEMES.map((t) => `
          <button class="md-segmented__item md-state ${t.value === theme ? 'is-selected' : ''}" data-theme="${t.value}">
            ${icon(t.icon, 'icon--sm')}${esc(t.label)}
          </button>`).join('')}
      </div>

      <div class="md-divider" style="margin:16px 0"></div>
      <div class="ll-row ll-row--between">
        <div class="ll-grow">
          <div class="md-title-small">3Dの演出</div>
          <p class="md-body-small on-surface-variant" style="margin:2px 0 0">
            ホームの背景、部位選択の人体、完了時の演出、レポートの立体グラフ。
            電池が気になるときは切ってください。
          </p>
        </div>
        <label class="md-switch">
          <input type="checkbox" id="fxSwitch" ${effectsPref() ? 'checked' : ''}>
          <span class="md-switch__track"><span class="md-switch__thumb"></span></span>
        </label>
      </div>
    </div>

    <h2 class="md-section-header">Supabase 接続</h2>
    <div class="md-card md-card--elevated">
      <div class="md-field">
        <input class="md-field__input" id="sbUrl" type="url" placeholder="https://xxxxxxxx.supabase.co" value="${esc(c.url)}">
        <label class="md-field__label" for="sbUrl">プロジェクト URL</label>
      </div>
      <div class="md-field">
        <input class="md-field__input" id="sbKey" type="password" placeholder="eyJhbGciOi..." value="${esc(c.anonKey)}">
        <label class="md-field__label" for="sbKey">anon public キー</label>
        <span class="md-field__support">公開前提の鍵です。権限は Supabase 側の RLS で守られています</span>
      </div>
      <button class="md-button md-button--filled md-button--block md-state" id="saveConn">
        ${icon('check')}保存して接続
      </button>
      <p class="md-body-small on-surface-variant" style="margin-bottom:0">
        ${isConfigured() ? '接続先は設定済みです。' : 'Supabase ダッシュボードの Project Settings → API からコピーできます。'}
        手順は docs/SUPABASE.md。
      </p>
    </div>

    <h2 class="md-section-header">データ</h2>
    <div class="md-card md-card--elevated">
      <button class="md-button md-button--tonal md-button--block md-state" id="reloadAll" style="margin-bottom:8px">
        ${icon('refresh')}種目・解説を再読込
      </button>
      <button class="md-button md-button--outlined md-button--danger md-button--block md-state" id="wipe">
        ${icon('delete')}この端末の設定を消去
      </button>
    </div>

    <div class="md-card md-card--filled">
      <p class="md-body-small on-surface-variant" style="margin:0">
        種目 ${state.exercises.length} 件（解説 ${state.exercises.filter((e) => e.guide?.description).length} 件）<br>
        重量提案: 前回のセット数・レップを引き継ぎ、重量のみ +${fmtNum(p?.weight_increment ?? 2.5)}kg<br>
        実施中のワークアウトは10分ごとに自動保存されます
      </p>
    </div>
  `;
  bind(root);
}

/** Google カレンダー連携の節 */
function googleSection(p) {
  const g = getGoogleConfig();
  const linked = Boolean(p.calendar_id);
  return `
    <h2 class="md-section-header">Googleカレンダー</h2>
    <div class="md-card md-card--elevated">
      ${isGoogleConfigured() ? `
        ${linked ? `
          <div class="md-list-item md-list-item--static" style="margin:0;background:transparent;padding:0">
            <span class="md-list-item__leading">${icon('calendar')}</span>
            <div class="md-list-item__content">
              <div class="md-list-item__headline">${esc(p.calendar_summary || p.calendar_id)}</div>
              <div class="md-list-item__supporting">ワークアウト終了時に自動で追加されます</div>
            </div>
            <span class="md-chip md-chip--tonal">${icon('check', 'icon--sm')}連携中</span>
          </div>
          <div class="ll-row" style="margin-top:12px">
            <button class="md-button md-button--outlined md-state ll-grow" id="pickCalendar">
              ${icon('calendar')}カレンダーを変更
            </button>
            <button class="md-button md-button--text md-button--danger md-state" id="unlinkCalendar">連携を解除</button>
          </div>
        ` : `
          <p class="md-body-medium on-surface-variant" style="margin-top:0">
            連携すると、ワークアウトを終了したときに「筋トレ（胸・背中）」のような予定が
            自動で作られます。説明欄には種目ごとの重量とレップが入ります。
          </p>
          <button class="md-button md-button--filled md-button--block md-state" id="pickCalendar">
            ${icon('calendar')}Googleカレンダーと連携する
          </button>
        `}
      ` : `
        <p class="md-body-medium on-surface-variant" style="margin-top:0">
          連携するには Google の OAuth クライアントIDが必要です。作り方は docs/GOOGLE_CALENDAR.md。
        </p>
        <div class="md-field">
          <input class="md-field__input" id="gClientId" type="text"
                 placeholder="1234567890-abcdefg.apps.googleusercontent.com" value="${esc(g.clientId)}">
          <label class="md-field__label" for="gClientId">OAuth クライアントID</label>
          <span class="md-field__support">公開してよい識別子です（秘密鍵ではありません）</span>
        </div>
        <button class="md-button md-button--filled md-button--block md-state" id="saveClientId">
          ${icon('check')}保存
        </button>
      `}
    </div>`;
}

/** カレンダー一覧を出して選ばせる */
async function openCalendarPicker(root) {
  let calendars = [];
  try {
    const token = await gcal.getAccessToken({ interactive: true });
    calendars = await gcal.listCalendars(token);
  } catch (err) {
    snackbar(err.message, 'err');
    return;
  }

  const paint = () => {
    openSheet(`
      <h2 class="md-dialog__headline" id="sheetTitle">カレンダーを選ぶ</h2>
      <p class="md-dialog__body" style="margin-top:-8px">
        ワークアウトの記録を書き込むカレンダーです。あとから変更できます。
      </p>
      <div class="md-list">
        ${calendars.map((c) => `
          <div class="md-list-item md-state" data-cal="${esc(c.id)}" role="button" tabindex="0">
            <span class="md-list-item__leading" ${c.backgroundColor ? `style="background:${esc(c.backgroundColor)};color:#fff"` : ''}>
              ${icon('calendar')}
            </span>
            <div class="md-list-item__content">
              <div class="md-list-item__headline">${esc(c.summary)}</div>
              <div class="md-list-item__supporting">${c.primary ? 'メインのカレンダー' : esc(c.id)}</div>
            </div>
            <span class="md-list-item__trailing">${icon('chevron')}</span>
          </div>`).join('')}
      </div>
      <button class="md-button md-button--outlined md-button--block md-state" id="newCalendar" style="margin-top:8px">
        ${icon('add')}「筋トレ」カレンダーを新しく作る
      </button>`);

    document.querySelector('.md-list').addEventListener('click', (ev) => {
      const item = ev.target.closest('[data-cal]');
      if (!item) return;
      const picked = calendars.find((c) => c.id === item.dataset.cal);
      saveCalendar(root, picked);
    });

    document.querySelector('#newCalendar').addEventListener('click', async () => {
      try {
        const token = await gcal.getAccessToken({ interactive: true });
        const created = await gcal.createCalendar(token, '筋トレ');
        saveCalendar(root, created);
      } catch (err) { snackbar(err.message, 'err'); }
    });
  };
  paint();
}

async function saveCalendar(root, calendar) {
  if (!calendar) return;
  try {
    state.profile = await db.updateProfile(state.profile.id, {
      calendar_id: calendar.id, calendar_summary: calendar.summary
    });
    closeSheet();
    snackbar(`「${calendar.summary}」に書き込みます`, 'ok');
    paint(root);
  } catch (err) { snackbar(err.message, 'err'); }
}

const textField = (id, label, value) => `
  <div class="md-field">
    <input class="md-field__input" type="text" id="${id}" maxlength="40" value="${esc(value ?? '')}">
    <label class="md-field__label" for="${id}">${esc(label)}</label>
  </div>`;

const numField = (key, label, value, min, max, step, support = '') => `
  <div class="md-field">
    <input class="md-field__input num" type="number" id="set-${key}" data-setting="${esc(key)}"
           min="${min}" max="${max}" step="${step}" value="${value ?? ''}" ${canEdit() ? '' : 'disabled'}>
    <label class="md-field__label" for="set-${key}">${esc(label)}</label>
    ${support ? `<span class="md-field__support">${esc(support)}</span>` : ''}
  </div>`;

function bind(root) {
  root.querySelectorAll('.ll-pin').forEach((el) => {
    el.addEventListener('input', () => { el.value = auth.normalizePin(el.value); });
  });

  root.querySelector('#fxSwitch').addEventListener('change', (ev) => {
    try { localStorage.setItem('liftlog.effects', ev.target.checked ? 'on' : 'off'); } catch { /* noop */ }
    snackbar(ev.target.checked ? '3Dの演出を入れました' : '3Dの演出を切りました', 'ok');
  });

  root.querySelector('#themeSwitch').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-theme]');
    if (!btn) return;
    setTheme(btn.dataset.theme);
    paint(root);
  });

  root.querySelector('#switchUser')?.addEventListener('click', async () => {
    const active = Boolean(state.workout);
    const ok = await confirmDialog({
      headline: canEdit() ? 'ログアウトしますか？' : '別の人に切り替えますか？',
      body: active
        ? '実施中のワークアウトはサーバーに保存済みです。次に同じ名前でログインすれば続きから再開できます。'
        : 'ログイン画面に戻ります。記録は残ります。',
      confirmLabel: canEdit() ? 'ログアウト' : '切り替える'
    });
    if (!ok) return;
    await auth.logout();
    resetSession();
    resetLogin();
    paintNetState();
    navigate('/login');
  });

  root.querySelector('#saveAccount')?.addEventListener('click', async () => {
    const name = root.querySelector('#displayName').value.trim();
    const email = root.querySelector('#email').value.trim();
    try {
      if (!name) throw new Error('氏名を入力してください。');
      state.profile = await db.updateProfile(state.profile.id, { display_name: name });
      if (email) { await auth.saveMyEmail(email); myEmail = email; }
      paintNetState();
      snackbar('保存しました', 'ok');
      paint(root);
    } catch (err) { snackbar(err.message, 'err'); }
  });

  root.querySelector('#changePin')?.addEventListener('click', async () => {
    const cur = root.querySelector('#curPin').value;
    const next = root.querySelector('#newPin').value;
    try {
      await auth.changePin(state.profile, cur, next);
      root.querySelector('#curPin').value = '';
      root.querySelector('#newPin').value = '';
      snackbar('PINを変更しました', 'ok');
    } catch (err) { snackbar(err.message, 'err'); }
  });

  root.addEventListener('change', async (ev) => {
    const el = ev.target.closest('[data-setting]');
    if (!el || !canEdit()) return;
    const key = el.dataset.setting;
    const value = Number(el.value);
    try {
      state.profile = await db.updateProfile(state.profile.id, { [key]: value });
      if (key === 'rest_minutes') rememberRestMinutes(value);
      if (key.startsWith('monthly_target')) state.dashboard = await db.dashboard(state.profile.id);
      snackbar('更新しました', 'ok');
    } catch (err) { snackbar(err.message, 'err'); }
  });

  root.querySelector('#saveClientId')?.addEventListener('click', () => {
    const clientId = root.querySelector('#gClientId').value.trim();
    if (!/\.apps\.googleusercontent\.com$/.test(clientId)) {
      snackbar('クライアントIDの形式が正しくありません（…apps.googleusercontent.com）', 'err');
      return;
    }
    setGoogleConfig({ clientId });
    snackbar('保存しました。続けて連携してください', 'ok');
    paint(root);
  });

  root.querySelector('#pickCalendar')?.addEventListener('click', () => openCalendarPicker(root));

  root.querySelector('#unlinkCalendar')?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      headline: 'Googleカレンダーの連携を解除しますか？',
      body: 'これから先の記録はカレンダーに追加されなくなります。すでに作られた予定は残ります。',
      confirmLabel: '解除する',
      danger: true
    });
    if (!ok) return;
    try {
      state.profile = await db.updateProfile(state.profile.id,
        { calendar_id: null, calendar_summary: null });
      gcal.forgetToken();
      snackbar('連携を解除しました', 'ok');
      paint(root);
    } catch (err) { snackbar(err.message, 'err'); }
  });

  root.querySelector('#saveConn').addEventListener('click', async () => {
    const url = root.querySelector('#sbUrl').value.trim().replace(/\/+$/, '');
    const anonKey = root.querySelector('#sbKey').value.trim();
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) {
      snackbar('URLの形式が正しくありません（https://xxxx.supabase.co）', 'err');
      return;
    }
    if (anonKey.length < 20) { snackbar('anon キーが短すぎます', 'err'); return; }
    setSupabaseConfig({ url, anonKey });
    try {
      state.exercises = [];
      await loadCatalog();
      snackbar(`接続しました（種目 ${state.exercises.length} 件）`, 'ok');
      navigate('/login');
    } catch (err) { snackbar(err.message, 'err'); }
  });

  root.querySelector('#reloadAll').addEventListener('click', async () => {
    try {
      state.exercises = [];
      await bootstrap();
      snackbar('再読込しました', 'ok');
      paint(root);
    } catch (err) { snackbar(err.message, 'err'); }
  });

  root.querySelector('#wipe').addEventListener('click', async () => {
    const ok = await confirmDialog({
      headline: 'この端末の設定を消去しますか？',
      body: '接続設定・ログイン状態・入力中の控えが削除されます。Supabase のデータは消えません。',
      confirmLabel: '消去する',
      danger: true
    });
    if (!ok) return;
    await auth.logout();
    localStorage.clear();
    location.reload();
  });
}
