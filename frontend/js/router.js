/** router.js — ハッシュベースの簡易ルーター（ログインガード付き） */
import { getUser } from './state.js';

const routes = {};
let previous = null;

export function defineRoutes(map) { Object.assign(routes, map); }

export function currentPath() {
  return (location.hash || '').replace(/^#/, '') || '/home';
}

export function navigate(path) {
  if (currentPath() === path) handleRoute();
  else location.hash = '#' + path;
}

export async function handleRoute() {
  const path = currentPath();
  let route = routes[path] || routes['/home'];

  // ログインが必要な画面は、未ログインならログイン画面に置き換える
  if (route.requiresUser && !getUser()) {
    route = routes['/login'];
    if (location.hash !== '#/login') {
      location.replace('#/login');
      return;                       // hashchange で再度この関数が走る
    }
  }

  if (previous?.teardown) {
    try { previous.teardown(); } catch { /* noop */ }
  }
  previous = route;

  // ビュー要素を丸ごと差し替えることで、前の画面のイベントリスナーを確実に破棄する
  const old = document.querySelector('#view');
  const root = document.createElement('main');
  root.id = 'view';
  root.className = 'md-pane';
  old.replaceWith(root);

  document.querySelector('#screenTitle').textContent = route.title || 'LiftLog';
  document.querySelectorAll('.md-navigation-bar__item').forEach((t) => {
    const on = t.dataset.tab === route.tab;
    t.classList.toggle('is-active', on);
    if (on) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);

  try {
    await route.view(root);
  } catch (err) {
    root.innerHTML = `<div class="md-card md-card--filled">
      <div class="md-card__title" style="color:var(--md-sys-color-error)">表示エラー</div>
      <p class="md-body-medium on-surface-variant">${String(err && err.message || err)}</p></div>`;
    console.error(err);
  }
}

export function startRouter() {
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}
