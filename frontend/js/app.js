/** app.js — 起動・ルート定義・初期データ読み込み */
import { api, isConfigured } from './api.js';
import { state, loadDraft } from './state.js';
import { initOverlayEvents, snackbar, $ } from './ui.js';
import { initTheme } from './theme.js';
import { defineRoutes, startRouter, navigate, handleRoute } from './router.js';

import * as home from './views/home.js';
import * as select from './views/select.js';
import * as confirmView from './views/confirm.js';
import * as session from './views/session.js';
import * as dashboard from './views/dashboard.js';
import * as guide from './views/guide.js';
import * as settings from './views/settings.js';

defineRoutes({
  '/home':      { title: 'LiftLog',        tab: 'home',      view: home.render },
  '/select':    { title: 'メニュー選択',    tab: 'home',      view: select.render },
  '/confirm':   { title: '重量の確認',      tab: 'home',      view: confirmView.render },
  '/session':   { title: 'ワークアウト中',  tab: 'home',      view: session.render, teardown: session.teardown },
  '/dashboard': { title: '月間レポート',    tab: 'dashboard', view: dashboard.render },
  '/guides':    { title: '種目解説',        tab: 'guides',    view: guide.render },
  '/settings':  { title: '設定',            tab: 'settings',  view: settings.render }
});

/** サーバーから初期データを取得して state に反映する */
export async function bootstrap() {
  const data = await api.bootstrap();
  state.menus = data.menus || [];
  state.guides = data.guides || [];
  state.settings = data.settings || {};
  state.dashboard = data.dashboard || null;
  state.serverOpenSession = data.openSession || null;
  setNetState('接続済み', 'ok');
  return data;
}

function setNetState(text, kind) {
  const el = $('#netState');
  el.textContent = text;
  el.className = 'md-chip md-label-medium '
    + (kind === 'ok' ? 'md-chip--tonal' : kind === 'err' ? 'md-chip--error' : 'md-chip--static');
}

async function init() {
  initTheme();
  initOverlayEvents();
  loadDraft();

  if (!isConfigured()) {
    setNetState('未設定', 'err');
    startRouter();
    if (location.hash !== '#/settings') navigate('/settings');
    return;
  }

  setNetState('接続中…', '');
  startRouter();

  try {
    await bootstrap();
    // 進行中の下書きがあれば復帰を促す
    if (state.draft?.status === 'active' && location.hash === '#/home') {
      snackbar('実施中のワークアウトがあります');
    }
    await handleRoute();
  } catch (err) {
    setNetState('接続エラー', 'err');
    snackbar(err.message, 'err');
    navigate('/settings');
  }
}

init();
