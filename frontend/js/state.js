/** state.js — アプリ状態、表示中のユーザー、実施中ワークアウトの下書き */

const LS_DRAFT = 'liftlog.draft';
const LS_PEEK  = 'liftlog.peek';
const LS_REST  = 'liftlog.restMinutes';

export const state = {
  profile: null,       // 表示中のユーザーの profiles 行（本人 or 覗き見対象）
  session: null,       // Supabase のセッション（覗き見なら null）
  exercises: [],       // 種目＋解説
  dashboard: null,
  workout: null,       // 実施中の workouts 行
  picking: { part: null, selected: [] },
  draft: null          // 入力中の内容（サーバーにも自動保存される）
};

/* ---------- 表示中のユーザーとモード ---------- */

export const getUserId = () => state.profile?.id || null;

export const getMode = () => (state.session ? 'auth' : 'peek');

/** 編集できるか。自分のプロフィールを本人として見ているときだけ true。 */
export const canEdit = () =>
  Boolean(state.session && state.profile && state.session.user.id === state.profile.id);

/** 覗き見対象を端末に覚えておく（リロードしても続く） */
export function setPeekTarget(profileId) {
  try {
    if (profileId) localStorage.setItem(LS_PEEK, profileId);
    else localStorage.removeItem(LS_PEEK);
  } catch { /* プライベートモード等 */ }
}
export function getPeekTarget() {
  try { return localStorage.getItem(LS_PEEK) || null; } catch { return null; }
}

export function resetSession() {
  state.profile = null;
  state.session = null;
  state.dashboard = null;
  state.workout = null;
  state.picking = { part: null, selected: [] };
  setPeekTarget(null);
  clearDraft();
}

/* ---------- 休憩時間の引き継ぎ ---------- */

export function getRestMinutes() {
  const fromProfile = Number(state.profile?.rest_minutes);
  if (isFinite(fromProfile) && fromProfile > 0) return fromProfile;
  const stored = Number(localStorage.getItem(LS_REST));
  return isFinite(stored) && stored > 0 ? stored : 3;
}

export function rememberRestMinutes(min) {
  try { localStorage.setItem(LS_REST, String(min)); } catch { /* noop */ }
  if (state.profile) state.profile.rest_minutes = min;
}

/* ---------- 下書き ---------- */
/* 端末内の控え。正本はサーバー（workouts.draft）で、こちらは通信できないときの保険。 */

export function loadDraft() {
  try {
    const raw = localStorage.getItem(LS_DRAFT);
    const d = raw ? JSON.parse(raw) : null;
    state.draft = (d && d.owner && d.owner !== getUserId()) ? null : d;
  } catch {
    state.draft = null;
  }
  return state.draft;
}

export function saveDraft() {
  try {
    if (state.draft) localStorage.setItem(LS_DRAFT, JSON.stringify(state.draft));
    else localStorage.removeItem(LS_DRAFT);
  } catch { /* 容量超過などは無視（正本はサーバー） */ }
}

export function clearDraft() {
  state.draft = null;
  try { localStorage.removeItem(LS_DRAFT); } catch { /* noop */ }
}

export function newDraft(selection) {
  state.draft = {
    owner: getUserId(),
    status: 'planning',          // planning -> confirming -> active
    startTime: null,
    date: null,
    selection,
    entries: [],
    memo: '',
    rest: { minutes: getRestMinutes(), endsAt: null }
  };
  saveDraft();
  return state.draft;
}

/** サーバーに保存されていた下書きを復元する */
export function adoptDraft(workout) {
  if (!workout?.draft) return null;
  state.draft = { ...workout.draft, owner: workout.user_id, status: 'active' };
  saveDraft();
  return state.draft;
}

/* ---------- 参照ヘルパー ---------- */

export const partsOf = () => [...new Set(state.exercises.map((m) => m.part))];
export const menusOfPart = (part) => state.exercises.filter((m) => m.part === part);
export const menuConfig = (part, menu) =>
  state.exercises.find((m) => m.part === part && m.menu === menu) || null;

const norm = (s) => String(s || '').replace(/[\s　（）()]/g, '').toLowerCase();

export function guideFor(part, menu) {
  const nm = norm(menu), np = norm(part);
  const hit = state.exercises.find((e) => norm(e.menu) === nm && norm(e.part) === np)
           || state.exercises.find((e) => norm(e.menu) === nm);
  return hit?.guide || null;
}
