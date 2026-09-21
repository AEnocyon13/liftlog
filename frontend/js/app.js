/** app.js — 起動・ルート定義・初期データ読み込み */
import { api, isConfigured } from './api.js';
import { state, loadDraft, getUser, setUser } from './state.js';
import { initOverlayEvents, snackbar, $ } from './ui.js';
import { initTheme } from './theme.js';
import { defineRoutes, startRouter, navigate, handleRoute, currentPath } from './router.js';

import * as login from './views/login.js';
import * as home from './views/home.js';
import * as select from './views/select.js';
import * as confirmView from './views/confirm.js';
import * as session from './views/session.js';
import * as dashboard from './views/dashboard.js';
import * as guide from './views/guide.js';
import * as settings from './views/settings.js';

/** requiresUser のルートは、ログインしていなければ /login に飛ばす */
defineRoutes({
  '/login':     { title: 'ログイン',       tab: '',          view: login.render,      requiresUser: false },
  '/home':      { title: 'LiftLog',        tab: 'home',      view: home.render,       requiresUser: true },
  '/select':    { title: 'メニュー選択',    tab: 'home',      view: select.render,     requiresUser: true },
  '/confirm':   { title: '今回のプラン',    tab: 'home',      view: confirmView.render, requiresUser: true },
  '/session':   { title: 'ワークアウト中',  tab: 'home',      view: session.render,    requiresUser: true, teardown: session.teardown },
  '/dashboard': { title: '月間レポート',    tab: 'dashboard', view: dashboard.render,  requiresUser: true },
  '/guides':    { title: '種目解説',        tab: 'guides',    view: guide.render,      requiresUser: false },
  '/settings':  { title: '設定',            tab: 'settings',  view: settings.render,   requiresUser: false }
});

/** サーバーから初期データを取得して state に反映する */
export async function bootstrap() {
  const data = await api.bootstrap();
  state.user = data.user || null;
  state.menus = data.menus || [];
  state.guides = data.guides || [];
  state.settings = data.settings || {};
  state.dashboard = data.dashboard || null;
  state.serverOpenSession = data.openSession || null;
  setNetState(data.user ? data.user.surname : '接続済み', 'ok');
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

  if (!isConfigured()) {
    setNetState('未設定', 'err');
    startRouter();
    if (currentPath() !== '/settings') navigate('/settings');
    return;
  }

  if (!getUser()) {
    setNetState('未ログイン', '');
    startRouter();
    if (currentPath() !== '/settings') navigate('/login');
    return;
  }

  setNetState('接続中…', '');
  loadDraft();
  startRouter();

  try {
    await bootstrap();
    if (state.draft?.status === 'active' && currentPath() === '/home') {
      snackbar('実施中のワークアウトがあります');
    }
    await handleRoute();
  } catch (err) {
    setNetState('接続エラー', 'err');
    snackbar(err.message, 'err');
    // 登録が消えている場合はログインからやり直す
    if (err.code === 'UNKNOWN_USER' || err.code === 'NO_USER') {
      setUser(null);
      navigate('/login');
    } else {
      navigate('/settings');
    }
  }
}

init();
