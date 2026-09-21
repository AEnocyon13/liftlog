/**
 * restTimer.js — セット間の休憩タイマー
 *
 * ・分単位で設定（1〜15分）。設定値は端末（localStorage）と Users シートの両方に保存し、
 *   次回以降そのまま引き継ぐ。ワークアウト中はいつでも変更できる。
 * ・状態（終了時刻）は下書きに持たせるので、画面が再描画されても走り続ける。
 * ・終了時はバイブレーション（対応端末）と短いビープで知らせる。
 */

import { state, saveDraft, getRestMinutes, rememberRestMinutes } from './state.js';
import { api } from './api.js';
import { esc, icon } from './ui.js';

export const MIN_MINUTES = 1;
export const MAX_MINUTES = 15;

let audioCtx = null;
let tickId = null;
let alerted = false;
let saveTimer = null;

/* ---------- 状態 ---------- */

const rest = () => {
  if (!state.draft) return null;
  if (!state.draft.rest) state.draft.rest = { minutes: getRestMinutes(), endsAt: null };
  return state.draft.rest;
};

export const remainingMs = () => {
  const r = rest();
  return (r && r.endsAt) ? Math.max(0, r.endsAt - Date.now()) : 0;
};

export const isRunning = () => {
  const r = rest();
  return Boolean(r && r.endsAt && r.endsAt > Date.now());
};

export function startRest() {
  const r = rest();
  if (!r) return;
  primeAudio();
  alerted = false;
  r.endsAt = Date.now() + r.minutes * 60000;
  saveDraft();
}

export function stopRest() {
  const r = rest();
  if (!r) return;
  r.endsAt = null;
  alerted = false;
  saveDraft();
}

export function setMinutes(min) {
  const r = rest();
  if (!r) return;
  const m = Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, Math.round(Number(min) || 0)));
  r.minutes = m;
  if (r.endsAt) r.endsAt = Date.now() + m * 60000;   // 作動中なら新しい長さで測り直す
  saveDraft();
  rememberRestMinutes(m);
  queueServerSave(m);
}

/** 設定値のサーバー保存は連打をまとめてから1回だけ送る */
function queueServerSave(min) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    api.saveUserSetting('restMinutes', min)
      .then((res) => { if (res?.user) state.user = res.user; })
      .catch(() => { /* オフラインでも端末側には残るので致命的ではない */ });
  }, 1500);
}

/* ---------- 通知 ---------- */

/** iOS/Android の自動再生制限を避けるため、ユーザー操作の中で AudioContext を作る */
function primeAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch { audioCtx = null; }
}

function beep() {
  try {
    if (!audioCtx) return;
    [0, 0.28, 0.56].forEach((offset) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const t = audioCtx.currentTime + offset;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.24);
    });
  } catch { /* 音が出せなくてもタイマー自体は成立する */ }
}

function notifyDone() {
  if (alerted) return;
  alerted = true;
  beep();
  try { navigator.vibrate?.([250, 120, 250, 120, 450]); } catch { /* 非対応端末 */ }
}

/* ---------- 描画 ---------- */

export function restTimerHtml() {
  const r = rest();
  if (!r) return '';
  const running = isRunning();
  const ms = remainingMs();
  const done = Boolean(r.endsAt) && ms === 0;
  return `
    <div class="ll-rest ${running ? 'll-rest--running' : ''} ${done ? 'll-rest--done' : ''}" id="restTimer">
      <div class="ll-rest__main">
        <div class="md-label-medium on-surface-variant">休憩タイマー</div>
        <div class="ll-rest__clock num" id="restClock">${fmtClock(running || done ? ms : r.minutes * 60000)}</div>
        <div class="md-body-small on-surface-variant" id="restCaption">
          ${done ? '休憩終了！次のセットへ' : running ? `${r.minutes}分で計測中` : `設定 ${r.minutes}分`}
        </div>
      </div>
      <div class="ll-rest__controls">
        <div class="ll-rest__minutes">
          <button class="md-icon-button md-state" data-rest="minus" aria-label="1分減らす"
                  ${r.minutes <= MIN_MINUTES ? 'disabled' : ''}>${icon('remove', 'icon--sm')}</button>
          <span class="ll-rest__min num" id="restMinutes">${esc(r.minutes)}<small>分</small></span>
          <button class="md-icon-button md-state" data-rest="plus" aria-label="1分増やす"
                  ${r.minutes >= MAX_MINUTES ? 'disabled' : ''}>${icon('add', 'icon--sm')}</button>
        </div>
        <button class="md-button ${running ? 'md-button--outlined' : 'md-button--filled'} md-button--compact md-state"
                data-rest="${running ? 'stop' : 'start'}">
          ${icon(running ? 'stop' : 'play')}${running ? '停止' : '休憩開始'}
        </button>
      </div>
    </div>`;
}

export const fmtClock = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * 表示の更新ループを開始する。DOMが消えていたら自動で止まる。
 * @param {Function} onFinish 0になった瞬間に1度だけ呼ばれる（再描画用）
 */
export function startTicking(onFinish) {
  stopTicking();
  const tick = () => {
    const clock = document.querySelector('#restClock');
    if (!clock) return stopTicking();
    const r = rest();
    if (!r) return stopTicking();
    if (!r.endsAt) return;
    const ms = remainingMs();
    clock.textContent = fmtClock(ms);
    if (ms === 0 && !alerted) {
      notifyDone();
      onFinish?.();
    }
  };
  tick();
  tickId = setInterval(tick, 250);
}

export function stopTicking() {
  if (tickId) { clearInterval(tickId); tickId = null; }
}

/** セッション画面のクリックを処理する。処理したら true。 */
export function handleRestClick(target) {
  const btn = target.closest('[data-rest]');
  if (!btn) return false;
  const r = rest();
  if (!r) return false;
  switch (btn.dataset.rest) {
    case 'start': startRest(); break;
    case 'stop':  stopRest(); break;
    case 'plus':  setMinutes(r.minutes + 1); break;
    case 'minus': setMinutes(r.minutes - 1); break;
    default: return false;
  }
  return true;
}
