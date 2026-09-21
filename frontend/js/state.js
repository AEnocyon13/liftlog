/** state.js — アプリ状態、ログイン中ユーザー、進行中ワークアウトの下書き保存 */

const LS_DRAFT = 'liftlog.draft';
const LS_USER  = 'liftlog.user';
const LS_REST  = 'liftlog.restMinutes';

export const state = {
  user: null,          // { surname, monthlyTargetWorkouts, weightIncrement, restMinutes, ... }
  menus: [],
  guides: [],
  settings: {},
  dashboard: null,
  serverOpenSession: null,
  picking: { part: null, selected: [] },
  draft: null
};

/* ---------- ログイン中の苗字 ---------- */

export function getUser() {
  try { return localStorage.getItem(LS_USER) || null; } catch { return null; }
}

export function setUser(surname) {
  try {
    if (surname) localStorage.setItem(LS_USER, surname);
    else localStorage.removeItem(LS_USER);
  } catch { /* プライベートモード等 */ }
}

/** ログアウト。下書きも破棄する（別ユーザーの記録に混ざらないように） */
export function logout() {
  setUser(null);
  state.user = null;
  state.dashboard = null;
  clearDraft();
  state.picking = { part: null, selected: [] };
}

/** 苗字のバリデーション（サーバー側 SURNAME_RE と同じ規則） */
export const SURNAME_RE = /^[a-z]{1,20}$/;

export function normalizeSurname(raw) {
  return String(raw ?? '')
    .replace(/[Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[\s　]/g, '')
    .toLowerCase();
}

/* ---------- 休憩時間（分）の引き継ぎ ---------- */

export function getRestMinutes() {
  const fromUser = Number(state.user?.restMinutes);
  if (isFinite(fromUser) && fromUser > 0) return fromUser;
  const stored = Number(localStorage.getItem(LS_REST));
  return isFinite(stored) && stored > 0 ? stored : 3;
}

export function rememberRestMinutes(min) {
  try { localStorage.setItem(LS_REST, String(min)); } catch { /* noop */ }
  if (state.user) state.user.restMinutes = min;
}

/* ---------- 進行中ワークアウト ---------- */

export function loadDraft() {
  try {
    const raw = localStorage.getItem(LS_DRAFT);
    const d = raw ? JSON.parse(raw) : null;
    // 別のユーザーでログインし直したときの取り違えを防ぐ
    state.draft = (d && d.owner && d.owner !== getUser()) ? null : d;
  } catch {
    state.draft = null;
  }
  return state.draft;
}

export function saveDraft() {
  if (state.draft) localStorage.setItem(LS_DRAFT, JSON.stringify(state.draft));
  else localStorage.removeItem(LS_DRAFT);
}

export function clearDraft() {
  state.draft = null;
  localStorage.removeItem(LS_DRAFT);
}

export function newDraft(selection) {
  state.draft = {
    owner: getUser(),
    sessionId: null,
    startTime: null,
    date: null,
    status: 'planning',           // planning -> confirming -> active
    selection,
    entries: [],
    memo: '',
    rest: { minutes: getRestMinutes(), endsAt: null }
  };
  saveDraft();
  return state.draft;
}

/* ---------- 参照ヘルパー ---------- */

export const partsOf = () => [...new Set(state.menus.map((m) => m.part))];

export const menusOfPart = (part) => state.menus.filter((m) => m.part === part);

export const menuConfig = (part, menu) =>
  state.menus.find((m) => m.part === part && m.menu === menu) || null;

const norm = (s) => String(s || '').replace(/[\s　（）()]/g, '').toLowerCase();

export function guideFor(part, menu) {
  const nm = norm(menu), np = norm(part);
  return (
    state.guides.find((g) => norm(g.menu) === nm && norm(g.part) === np) ||
    state.guides.find((g) => norm(g.menu) === nm) ||
    state.guides.find((g) => (g.aliases || []).some((a) => norm(a) === nm)) ||
    null
  );
}
