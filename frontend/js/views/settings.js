/** settings.js — 接続設定・トレーニング設定・表示テーマ */
import { state } from '../state.js';
import { api, getConfig, setConfig } from '../api.js';
import { esc, icon, snackbar, confirmDialog, fmtNum } from '../ui.js';
import { getTheme, setTheme, THEMES } from '../theme.js';
import { bootstrap } from '../app.js';

export function render(root) {
  const c = getConfig();
  const s = state.settings || {};
  const theme = getTheme();

  root.innerHTML = `
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

    <h2 class="md-section-header">トレーニング設定</h2>
    <div class="md-card md-card--elevated">
      ${field('monthlyTargetWorkouts', '月間目標ワークアウト回数', s.monthlyTargetWorkouts, 1, 31, 1)}
      ${field('monthlyTargetVolume', '月間目標総ボリューム (kg)', s.monthlyTargetVolume, 0, 1000000, 1000, '0 にすると非表示になります')}
      ${field('deloadRate', 'ディロード率', s.deloadRate, 0, 0.5, 0.01, '0.10 = 10%減')}
      ${field('deloadAfterFails', 'ディロードまでの連続未達回数', s.deloadAfterFails, 1, 5, 1)}
      ${field('defaultRepMin', '既定の目標レップ下限', s.defaultRepMin, 1, 30, 1)}
      ${field('defaultRepMax', '既定の目標レップ上限', s.defaultRepMax, 1, 30, 1)}
      ${field('defaultWeightStep', '既定の重量刻み (kg)', s.defaultWeightStep, 0.25, 20, 0.25)}
      <hr class="md-divider">
      <div class="md-card__title" style="margin-bottom:12px">RPE補正のしきい値</div>
      ${field('rpeEasyThreshold', '「余裕」の上限 → 増加幅 ×1.5', s.rpeEasyThreshold, 5, 10, 0.5)}
      ${field('rpeNormalThreshold', '「適正」の上限 → 増加幅 ×1.0', s.rpeNormalThreshold, 5, 10, 0.5)}
      ${field('rpeHardThreshold', '「きつい」の上限 → 増加幅 ×0.5', s.rpeHardThreshold, 5, 10, 0.5, 'これを超えると重量は据え置きになります')}
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
        重量提案アルゴリズム: ダブルプログレッション + RPE補正
      </p>
    </div>
  `;

  root.querySelector('#themeSwitch').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-theme]');
    if (!btn) return;
    setTheme(btn.dataset.theme);
    render(root);
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
      await bootstrap();
      snackbar('接続しました', 'ok');
      render(root);
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
    const el = ev.target.closest('[data-setting]');
    if (!el) return;
    const key = el.dataset.setting;
    const value = Number(el.value);
    try {
      const res = await api.saveSetting(key, value);
      state.settings = res.settings;
      snackbar(`${key} を ${fmtNum(value, 2)} に更新しました`, 'ok');
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
      body: '接続設定と入力中の記録が削除されます。スプレッドシートのデータは消えません。',
      confirmLabel: '消去する',
      danger: true
    });
    if (!ok) return;
    localStorage.clear();
    location.reload();
  });
}

function field(key, label, value, min, max, step, support = '') {
  const id = `set-${key}`;
  return `
    <div class="md-field">
      <input class="md-field__input num" type="number" id="${id}" data-setting="${esc(key)}"
             min="${min}" max="${max}" step="${step}" value="${value ?? ''}">
      <label class="md-field__label" for="${id}">${esc(label)}</label>
      ${support ? `<span class="md-field__support">${esc(support)}</span>` : ''}
    </div>`;
}
