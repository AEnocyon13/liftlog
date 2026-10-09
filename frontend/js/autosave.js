/**
 * autosave.js — 実施中ワークアウトの自動保存
 *
 * 記録が消えた原因は、入力内容が端末の localStorage にしか無く、
 * 終了ボタンを押すまでサーバーへ送られていなかったこと。
 * ここでは3つの引き金で Supabase に書き戻す。
 *
 *   1. 10分ごと（ご指定の間隔）
 *   2. セットを入力した数秒後（まとめて1回）
 *   3. 画面を離れるとき（タブを閉じる・バックグラウンドに回る）
 *
 * 保存先は workouts.draft。端末が変わっても、実施中のワークアウトとして
 * 同じ内容を読み戻せる。
 */
import { saveDraft } from './db.js';

const INTERVAL_MS = 10 * 60 * 1000;   // 10分
const DEBOUNCE_MS = 4000;             // 入力が落ち着いてから

let timerId = null;
let debounceId = null;
let listeners = null;
let ctx = null;                        // { workoutId, getDraft, onState }
let saving = false;
let dirty = false;
let lastSavedAt = null;
let lastError = null;

export const autosaveState = () => ({ saving, dirty, lastSavedAt, lastError });

async function flush(reason) {
  if (!ctx || saving) { dirty = true; return; }
  const draft = ctx.getDraft();
  if (!draft) return;
  saving = true;
  ctx.onState?.(autosaveState());
  try {
    await saveDraft(ctx.workoutId, { ...draft, savedAt: new Date().toISOString(), reason });
    lastSavedAt = new Date();
    lastError = null;
    dirty = false;
  } catch (err) {
    lastError = err.message || String(err);
    dirty = true;                      // 次の機会にもう一度試す
  } finally {
    saving = false;
    ctx.onState?.(autosaveState());
  }
}

/** 入力があったことを知らせる。数秒まとめてから1回保存する。 */
export function touch() {
  if (!ctx) return;
  dirty = true;
  ctx.onState?.(autosaveState());
  clearTimeout(debounceId);
  debounceId = setTimeout(() => flush('edit'), DEBOUNCE_MS);
}

/** いますぐ保存する（終了直前など） */
export const flushNow = () => flush('manual');

export function startAutosave({ workoutId, getDraft, onState }) {
  stopAutosave();
  ctx = { workoutId, getDraft, onState };
  dirty = false;
  lastError = null;
  timerId = setInterval(() => flush('interval'), INTERVAL_MS);

  const onHide = () => { if (document.visibilityState === 'hidden') flush('hidden'); };
  const onPageHide = () => flush('pagehide');
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onPageHide);
  listeners = () => {
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', onPageHide);
  };
}

export function stopAutosave() {
  clearInterval(timerId); timerId = null;
  clearTimeout(debounceId); debounceId = null;
  listeners?.(); listeners = null;
  ctx = null;
  dirty = false;
}
