/**
 * keyboard.js — スマホでキーボードが出たときに入力欄を隠さないようにする
 *
 * 【起きていたこと】
 *   キーボードが出ると表示領域が縮み、ブラウザが自動で画面を送る。
 *   そのとき、上に貼り付いている要素（アプリバー・休憩タイマー）と
 *   下に貼り付いている要素（終了ボタン）が入力欄を覆い、
 *   いま打っているところが見えなくなっていた。
 *
 * 【対処】
 *   1. 入力中は、貼り付いている要素のうち邪魔になるものを外す（CSS の body.is-typing）
 *   2. それでも隠れている場合だけ、入力欄を画面の中ほどへ送る
 *   3. visualViewport が使える端末では、キーボードの高さを測って判定に使う
 */

const EDITABLE = 'input, select, textarea';
const SETTLE_MS = 260;          // キーボードが出きるまで待つ
const KEYBOARD_MIN = 120;       // これ以上縮んだらキーボードが出たとみなす
let scrollTimer = null;
let blurTimer = null;
let typing = false;

const isEditable = (el) =>
  Boolean(el && el.matches?.(EDITABLE) && el.type !== 'hidden' && !el.disabled && !el.readOnly);

/** キーボードが占めている高さ（px）。測れない環境では 0 */
function keyboardPx() {
  const vv = window.visualViewport;
  if (!vv) return 0;
  return Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
}

/**
 * キーボードが出ているか。
 * visualViewport が無い端末では「指で触る画面か」で代用する。
 * PC では常に false になり、入力しても下のナビは消えない。
 */
const keyboardOpen = () =>
  window.visualViewport
    ? keyboardPx() > KEYBOARD_MIN
    : window.matchMedia?.('(pointer: coarse)').matches === true;

/** 貼り付き要素を外すかどうかを、いまの状態に合わせる */
function syncTypingClass() {
  const on = typing && keyboardOpen();
  document.body.classList.toggle('is-typing', on);
  if (!on) document.documentElement.style.removeProperty('--ll-keyboard');
}

/** いま入力欄を置いてよい範囲（上下の貼り付き要素を避けた帯） */
function safeBand() {
  const vv = window.visualViewport;
  const top = (document.querySelector('.md-top-app-bar')?.getBoundingClientRect().bottom || 0) + 8;
  let bottom = vv ? vv.height : window.innerHeight;
  // ナビが出たままのとき（PCなど）は、その分を避ける
  const nav = document.querySelector('.md-navigation-bar');
  if (nav && !document.body.classList.contains('is-typing')) {
    const r = nav.getBoundingClientRect();
    if (r.height) bottom = Math.min(bottom, r.top);
  }
  return { top, bottom: bottom - 8 };
}

function bringIntoView(el) {
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => {
    if (document.activeElement !== el) return;
    const r = el.getBoundingClientRect();
    const band = safeBand();
    // すでに見えているなら動かさない（入力のたびに画面が跳ねるのを防ぐ）
    if (r.top >= band.top && r.bottom <= band.bottom) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, SETTLE_MS);
}

function onFocusIn(ev) {
  if (!isEditable(ev.target)) return;
  clearTimeout(blurTimer);
  typing = true;
  syncTypingClass();
  bringIntoView(ev.target);
}

function onFocusOut(ev) {
  if (!isEditable(ev.target)) return;
  // 次の入力欄へ移るだけのときは、貼り付き要素を戻さない
  clearTimeout(blurTimer);
  blurTimer = setTimeout(() => {
    if (isEditable(document.activeElement)) return;
    typing = false;
    syncTypingClass();
  }, 150);
}

function onViewportResize() {
  if (!window.visualViewport) return;
  document.documentElement.style.setProperty('--ll-keyboard', keyboardPx() + 'px');
  syncTypingClass();
  if (isEditable(document.activeElement)) bringIntoView(document.activeElement);
}

export function initKeyboardHandling() {
  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('focusout', onFocusOut);
  window.visualViewport?.addEventListener('resize', onViewportResize);
  window.visualViewport?.addEventListener('scroll', onViewportResize);
}
