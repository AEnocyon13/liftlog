/** state.js — アプリ状態と、進行中ワークアウトの下書き保存 */

const LS_DRAFT = 'liftlog.draft';

export const state = {
  menus: [],
  guides: [],
  settings: {},
  dashboard: null,
  serverOpenSession: null,
  /** 部位選択画面の一時選択 */
  picking: { part: null, selected: [] },
  /** 進行中のワークアウト（localStorage に自動保存） */
  draft: null
};

export function loadDraft() {
  try {
    const raw = localStorage.getItem(LS_DRAFT);
    state.draft = raw ? JSON.parse(raw) : null;
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
    sessionId: null,
    startTime: null,
    date: null,
    status: 'planning',           // planning -> confirming -> active
    selection,                    // [{part, menu}]
    entries: [],                  // 確定後に作られる
    condition: '',
    memo: ''
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

/** 解説ドキュメントから該当種目を探す（部位一致 → 種目名/別名の正規化一致） */
export function guideFor(part, menu) {
  const nm = norm(menu), np = norm(part);
  return (
    state.guides.find((g) => norm(g.menu) === nm && norm(g.part) === np) ||
    state.guides.find((g) => norm(g.menu) === nm) ||
    state.guides.find((g) => (g.aliases || []).some((a) => norm(a) === nm)) ||
    null
  );
}
