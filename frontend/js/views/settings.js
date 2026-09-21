/** settings.js — ユーザー / 表示テーマ / 接続設定 / トレーニング設定 */
import { state, logout, getUser, rememberRestMinutes } from '../state.js';
import { api, getConfig, setConfig } from '../api.js';
import { esc, icon, snackbar, confirmDialog, fmtNum } from '../ui.js';
import { getTheme, setTheme, THEMES } from '../theme.js';
import { navigate } from '../router.js';
import { bootstrap } from '../app.js';

export function render(root) {
  const c = getConfig();
  const s = state.settings || {};
  const u = state.user || {};
  const theme = getTheme();
  const surname = getUser();

  root.innerHTML = `
    ${surname ? `
      <h2 class="md-section-header">ユーザー</h2>
      <div class="md-card md-card--elevated">
        <div class="md-list-item md-list-item--static" style="margin:0;background:transparent;padding:0">
          <span class="md-list-item__leading">${icon('person')}</span>
          <div class="md-list-item__content">
            <div class="md-list-item__headline">${esc(surname)}</div>
            <div class="md-list-item__supporting">記録は Logs_${esc(surname)} に保存されています</div>
          </div>
        </div>
        <button class="md-button md-button--outlined md-button--block md-state" id="switchUser" style="margin-top:12px">
          ${icon('logout')}別の苗字に切り替える
        </button>
      </div>

      <h2 class="md-section-header">トレーニング設定（${esc(surname)} さん）</h2>
      <div class="md-card md-card--elevated">
        ${userField('weightIncrement', '自動で足す重量 (kg)', u.weightIncrement, 0.25, 20, 0.25,
                    '前回と同じセット数・レップのまま、この分だけ重量を上げて提案します')}
        ${userField('restMinutes', '休憩タイマーの既定 (分)', u.restMinutes, 1, 15, 1,
                    'ワークアウト中に変更すると、その値が次回に引き継がれます')}
        ${userField('monthlyTargetWorkouts', '月間目標ワークアウト回数', u.monthlyTargetWorkouts, 1, 31, 1)}
        ${userField('monthlyTargetVolume', '月間目標総ボリューム (kg)', u.monthlyTargetVolume, 0, 1000000, 1000,
                    '0 にすると非表示になります')}
      </div>
    ` : `
      <div class="md-card md-card--filled">
        <div class="md-card__title">ログインしていません</div>
        <p class="md-body-medium on-surface-variant">苗字を入力すると記録を始められます。</p>
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
      <p class="md-body-small on-surface-variant" style="margin:12px 0 0">
        「自動」は端末のダークモード設定に追従します。ダークでは背景 #013E37 ／ 文字 #FFEFB3 と、ライトの配色をそのまま入れ替えます。
      </p>
    </div>

    <h2 class="md-section-header">接続設定</h2>
    <div class="md-card md-card--elevated">
      <div class="md-field">
        <input class="md-field__input" id="apiUrl" type="url" placeholder="https://script.google.com/macros/s/AKfy.../exec" value="${esc(c.apiUrl)}">
        <label class="md-field__label" for="apiUrl">GAS ウェブアプリ URL</label>
        <span class="md-field__support">/exec で終わるURLを貼り付けてください</span>
      </div>
      <div class="md-field">
        <input class="md-field__input" id="apiKey" type="password" placeholder="generateApiKey() で発行した値" value="${esc(c.apiKey)}">
        <label class="md-field__label" for="apiKey">API キー</label>
      </div>
      <div class="ll-row">
        <button class="md-button md-button--filled md-state ll-grow" id="saveConn">${icon('check')}保存して接続</button>
        <button class="md-button md-button--outlined md-state" id="testConn">接続テスト</button>
      </div>
      <p class="md-body-small on-surface-variant" style="margin-bottom:0">
        この2つはお使いのブラウザ（localStorage）にのみ保存されます。共有端末では使用後に「設定を消去」してください。
      </p>
    </div>

    <h2 class="md-section-header">全員共通の既定値</h2>
    <div class="md-card md-card--elevated">
      ${globalField('defaultRepMin', '履歴が無い種目の目標レップ下限', s.defaultRepMin, 1, 30, 1)}
      ${globalField('defaultRepMax', '同上・上限', s.defaultRepMax, 1, 30, 1)}
      <p class="md-body-small on-surface-variant" style="margin-bottom:0">
        ここを変えると全ユーザーに影響します。個人の設定は上の「トレーニング設定」が優先されます。
      </p>
    </div>

    <h2 class="md-section-header">データ</h2>
    <div class="md-card md-card--elevated">
      <button class="md-button md-button--tonal md-button--block md-state" id="reloadGuides" style="margin-bottom:8px">
        ${icon('refresh')}解説ドキュメントを再読込
      </button>
      <button class="md-button md-button--tonal md-button--block md-state" id="reloadAll" style="margin-bottom:8px">
        ${icon('refresh')}メニュー・設定を再読込
      </button>
      <button class="md-button md-button--outlined md-button--danger md-button--block md-state" id="wipe">
        ${icon('delete')}この端末の設定を消去
      </button>
    </div>

    <div class="md-card md-card--filled">
      <p class="md-body-small on-surface-variant" style="margin:0">
        メニュー ${state.menus.length} 件 ／ 解説 ${state.guides.length} 件 読み込み済み<br>
        重量提案: 前回のセット数・レップを引き継ぎ、重量のみ +${fmtNum(u.weightIncrement ?? 2.5)}kg
      </p>
    </div>
  `;

  bind(root);
}

function bind(root) {
  root.querySelector('#themeSwitch').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-theme]');
    if (!btn) return;
    setTheme(btn.dataset.theme);
    render(root);
  });

  root.querySelector('#switchUser')?.addEventListener('click', async () => {
    const hasDraft = state.draft?.status === 'active';
    const ok = await confirmDialog({
      headline: '別の苗字に切り替えますか？',
      body: hasDraft
        ? '実施中のワークアウトがあります。切り替えると、この端末に残っている入力内容は破棄されます（記録済みのデータは残ります）。'
        : 'ログイン画面に戻ります。スプレッドシートのデータは消えません。',
      confirmLabel: '切り替える',
      danger: hasDraft
    });
    if (!ok) return;
    logout();
    navigate('/login');
  });

  root.querySelector('#saveConn').addEventListener('click', async () => {
    const apiUrl = root.querySelector('#apiUrl').value.trim();
    const apiKey = root.querySelector('#apiKey').value.trim();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(apiUrl)) {
      snackbar('URLの形式が正しくありません（/exec で終わる必要があります）', 'err');
      return;
    }
    setConfig({ apiUrl, apiKey });
    try {
      if (getUser()) { await bootstrap(); snackbar('接続しました', 'ok'); render(root); }
      else { await api.ping(); snackbar('接続しました。ログイン画面へ進んでください', 'ok'); navigate('/login'); }
    } catch (err) { snackbar(err.message, 'err'); }
  });

  root.querySelector('#testConn').addEventListener('click', async () => {
    setConfig({
      apiUrl: root.querySelector('#apiUrl').value.trim(),
      apiKey: root.querySelector('#apiKey').value.trim()
    });
    try {
      const r = await api.ping();
      snackbar('接続OK: サーバー時刻 ' + new Date(r.now).toLocaleString('ja-JP'), 'ok');
    } catch (err) { snackbar(err.message, 'err'); }
  });

  root.addEventListener('change', async (ev) => {
    const el = ev.target.closest('[data-user-setting], [data-setting]');
    if (!el) return;
    const value = Number(el.value);
    try {
      if (el.dataset.userSetting) {
        const res = await api.saveUserSetting(el.dataset.userSetting, value);
        if (res?.user) state.user = res.user;
        if (el.dataset.userSetting === 'restMinutes') rememberRestMinutes(value);
        if (el.dataset.userSetting.startsWith('monthlyTarget')) {
          state.dashboard = await api.dashboard();
        }
        snackbar('更新しました', 'ok');
      } else {
        const res = await api.saveSetting(el.dataset.setting, value);
        state.settings = res.settings;
        snackbar(`${el.dataset.setting} を ${fmtNum(value, 2)} に更新しました`, 'ok');
      }
    } catch (err) { snackbar(err.message, 'err'); }
  });

  root.querySelector('#reloadGuides').addEventListener('click', async () => {
    try {
      const r = await api.guides(true);
      state.guides = r.guides;
      snackbar(`解説 ${r.guides.length} 件を再読込しました`, 'ok');
      render(root);
    } catch (err) { snackbar(err.message, 'err'); }
  });

  root.querySelector('#reloadAll').addEventListener('click', async () => {
    try { await bootstrap(); snackbar('再読込しました', 'ok'); render(root); }
    catch (err) { snackbar(err.message, 'err'); }
  });

  root.querySelector('#wipe').addEventListener('click', async () => {
    const ok = await confirmDialog({
      headline: 'この端末の設定を消去しますか？',
      body: '接続設定・ログイン中の苗字・入力中の記録が削除されます。スプレッドシートのデータは消えません。',
      confirmLabel: '消去する',
      danger: true
    });
    if (!ok) return;
    localStorage.clear();
    location.reload();
  });
}

const numField = (attr, key, label, value, min, max, step, support) => {
  const id = `set-${key}`;
  return `
    <div class="md-field">
      <input class="md-field__input num" type="number" id="${id}" ${attr}="${esc(key)}"
             min="${min}" max="${max}" step="${step}" value="${value ?? ''}">
      <label class="md-field__label" for="${id}">${esc(label)}</label>
      ${support ? `<span class="md-field__support">${esc(support)}</span>` : ''}
    </div>`;
};

const userField   = (k, l, v, min, max, step, support = '') => numField('data-user-setting', k, l, v, min, max, step, support);
const globalField = (k, l, v, min, max, step, support = '') => numField('data-setting', k, l, v, min, max, step, support);
