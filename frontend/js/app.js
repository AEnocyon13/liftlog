/** app.js — 起動・ルート定義・初期データ読み込み */
import { isConfigured } from './config.js';
import { sb } from './supabase.js';
import { currentUser } from './auth.js';
import * as db from './db.js';
import { state, getPeekTarget, setPeekTarget, canEdit, resetSession, loadDraft, adoptDraft } from './state.js';
import { initOverlayEvents, snackbar, $ } from './ui.js';
import { initTheme } from './theme.js';
import { defineRoutes, startRouter, navigate, currentPath } from './router.js';

import * as login from './views/login.js';
import * as home from './views/home.js';
import * as select from './views/select.js';
import * as confirmView from './views/confirm.js';
import * as session from './views/session.js';
import * as dashboard from './views/dashboard.js';
import * as guide from './views/guide.js';
import * as settings from './views/settings.js';

defineRoutes({
  '/login':     { title: 'ログイン',       tab: '',          view: login.render,       requiresUser: false },
  '/home':      { title: 'LiftLog',        tab: 'home',      view: home.render,        requiresUser: true },
  '/select':    { title: 'メニュー選択',    tab: 'home',      view: select.render,      requiresUser: true, requiresAuth: true },
  '/confirm':   { title: '今回のプラン',    tab: 'home',      view: confirmView.render, requiresUser: true, requiresAuth: true },
  '/session':   { title: 'ワークアウト中',  tab: 'home',      view: session.render,     requiresUser: true, requiresAuth: true, teardown: session.teardown },
  '/dashboard': { title: '月間レポート',    tab: 'dashboard', view: dashboard.render,   requiresUser: true },
  '/guides':    { title: '種目解説',        tab: 'guides',    view: guide.render,       requiresUser: false },
  '/settings':  { title: '設定',            tab: 'settings',  view: settings.render,    requiresUser: false }
});

/** 種目一覧は全員共通なので、ログインしていなくても読める */
export async function loadCatalog() {
  if (!state.exercises.length) state.exercises = await db.loadExercises();
  return state.exercises;
}

/** 表示対象のユーザーに合わせて、必要なものをまとめて読み込む */
export async function bootstrap() {
  await loadCatalog();
  if (!state.profile) return;
  state.dashboard = await db.dashboard(state.profile.id);
  if (canEdit()) {
    state.workout = await db.activeWorkout(state.profile.id);
    if (state.workout) adoptDraft(state.workout);
  } else {
    state.workout = null;
  }
  paintNetState();
}

export function paintNetState() {
  const el = $('#netState');
  if (!isConfigured()) { setChip(el, '未設定', 'err'); return; }
  if (!state.profile) { setChip(el, '未ログイン', ''); return; }
  const name = state.profile.display_name;
  if (canEdit()) setChip(el, name, 'ok');
  else setChip(el, '覗き見: ' + name, 'peek');
}

function setChip(el, text, kind) {
  el.textContent = text;
  el.className = 'md-chip md-label-medium '
    + (kind === 'ok' ? 'md-chip--tonal'
     : kind === 'peek' ? 'md-chip--peek'
     : kind === 'err' ? 'md-chip--error' : 'md-chip--static');
}

/** 保存済みのセッション（本人）か、覗き見対象を復元する */
async function restoreSession() {
  const user = await currentUser();
  if (user) {
    const { data } = await sb().auth.getSession();
    state.session = data?.session || null;
    state.profile = await db.getProfile(user.id);
    if (!state.profile) {        // 認証だけ残ってプロフィールが無い異常系
      await sb().auth.signOut();
      state.session = null;
      return false;
    }
    setPeekTarget(null);
    return true;
  }
  const peekId = getPeekTarget();
  if (peekId) {
    state.profile = await db.getProfile(peekId);
    if (state.profile) return true;
    setPeekTarget(null);
  }
  return false;
}

async function init() {
  initTheme();
  initOverlayEvents();

  if (!isConfigured()) {
    paintNetState();
    startRouter();
    if (currentPath() !== '/settings') navigate('/settings');
    return;
  }

  // セッションが切れたり更新されたときに画面を合わせる
  sb().auth.onAuthStateChange((event, session) => {
    state.session = session || null;
    if (event === 'SIGNED_OUT') {
      resetSession();
      paintNetState();
      navigate('/login');
    } else {
      paintNetState();
    }
  });

  // ルーターを動かす前にセッションを復元する。
  // 先にルーティングすると、復元が終わる前に「未ログイン」と判定されて
  // /login に書き換わり、リロード時に元の画面へ戻れなくなる。
  let restored = false;
  let failure = null;
  try {
    restored = await restoreSession();
    if (restored) {
      loadDraft();
      await bootstrap();
    }
  } catch (err) {
    failure = err;
  }
  paintNetState();
  startRouter();

  if (failure) {
    snackbar(failure.message, 'err');
    navigate(currentPath() === '/settings' ? '/settings' : '/login');
    return;
  }
  if (!restored) {
    // すでに /login を表示しているときに navigate すると二重描画になる
    if (currentPath() !== '/settings' && currentPath() !== '/login') navigate('/login');
    return;
  }
  if (currentPath() === '/login') navigate('/home');
  if (state.workout && state.draft?.entries?.length) {
    snackbar('実施中のワークアウトを復元しました');
  }
}

init();
