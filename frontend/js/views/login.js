/**
 * login.js — 名前を選んでログイン / 覗き見 / 新規登録
 *
 *   list     … 登録者の名前を並べる。はじめての人は「新規登録」
 *   pin      … PINを入れて本人としてログイン、または覗き見（PIN不要）
 *   register … 氏名 + メールアドレス + 4桁PIN
 *
 * メールアドレスは、今後の Google カレンダー連携のために登録時に預かる。
 * 本人しか読めない場所（user_private）に入るので、名前の一覧には出ない。
 */
import { state, setPeekTarget, clearDraft } from '../state.js';
import { isConfigured } from '../config.js';
import * as auth from '../auth.js';
import * as db from '../db.js';
import { esc, icon, snackbar } from '../ui.js';
import { navigate } from '../router.js';
import { bootstrap, paintNetState } from '../app.js';

let step = 'list';
let profiles = [];
let picked = null;
let loading = false;

/**
 * いま画面に出ている #view を返す。
 * ルーターは画面遷移のたびに #view ごと差し替えるため、await のあとに
 * 最初の root へ描き込むと、切り離された要素に書いて画面が固まる。
 */
const liveRoot = () => document.querySelector('#view');

export async function render(root) {
  if (!isConfigured()) {
    root.innerHTML = `
      <div class="md-card md-card--filled">
        <div class="md-card__title">先に Supabase の設定が必要です</div>
        <p class="md-body-medium on-surface-variant">
          プロジェクトURLと anon キーを登録してください。手順は docs/SUPABASE.md にあります。
        </p>
        <a class="md-button md-button--filled md-button--block md-state" href="#/settings">
          ${icon('settings')}設定を開く
        </a>
      </div>`;
    return;
  }

  paint(root);
  if (step === 'list' && !profiles.length && !loading) {
    loading = true;
    try {
      profiles = await auth.listProfiles();
    } catch (err) {
      snackbar(err.message, 'err');
    } finally {
      loading = false;
      if (step === 'list' && liveRoot()) paint(liveRoot());
    }
  } else if (loading && step === 'list') {
    // 読み込み中に再描画された場合、完了を待ってこちらの要素に描き直す
    await waitForProfiles();
    if (step === 'list' && liveRoot()) paint(liveRoot());
  }
}

/** 進行中の読み込みが終わるまで待つ */
function waitForProfiles() {
  return new Promise((resolve) => {
    const tick = () => (loading ? setTimeout(tick, 80) : resolve());
    tick();
  });
}

function paint(root) {
  root.innerHTML = `<div class="ll-login">${
    step === 'list' ? listStep() : step === 'pin' ? pinStep() : registerStep()
  }</div>`;
  bind(root);
}

const header = (title, sub) => `
  <div class="ll-login__mark">${icon('logo', 'icon--lg')}</div>
  <h2 class="md-headline-small" style="margin:0 0 4px">${esc(title)}</h2>
  <p class="md-body-medium on-surface-variant" style="margin:0 0 24px">${sub}</p>`;

/* ---------- 1. 名前を選ぶ ---------- */

function listStep() {
  return `
    ${header('ようこそ', '名前を選んでください。記録は人ごとに分かれています。')}
    ${profiles.length ? `
      <div class="md-list" style="text-align:left">
        ${profiles.map((p) => `
          <div class="md-list-item md-state" data-profile="${esc(p.id)}" role="button" tabindex="0">
            <span class="md-list-item__leading">${icon('person')}</span>
            <div class="md-list-item__content">
              <div class="md-list-item__headline">${esc(p.display_name)}</div>
              <div class="md-list-item__supporting">${p.last_login_at ? '最終ログイン ' + new Date(p.last_login_at).toLocaleDateString('ja-JP') : '未ログイン'}</div>
            </div>
            <span class="md-list-item__trailing">${icon('chevron')}</span>
          </div>`).join('')}
      </div>` : `
      <p class="md-body-medium on-surface-variant">${loading ? '読み込み中…' : 'まだ誰も登録されていません。'}</p>`}

    <div class="ll-login__divider"><span>または</span></div>
    <button class="md-button md-button--filled md-button--block md-button--tall md-state" id="toRegister">
      ${icon('add')}新規登録する
    </button>`;
}

/* ---------- 2. PIN or 覗き見 ---------- */

function pinStep() {
  return `
    ${header(`${esc(picked.display_name)} さん`,
      'PINを入力すると記録できます。<br>見るだけなら PIN なしで「覗き見」を選んでください。')}
    <form id="pinForm" autocomplete="off">
      ${pinField('pin', 'PIN（数字4桁）')}
      <button class="md-button md-button--filled md-button--block md-button--tall md-state" type="submit">
        ${icon('lock')}本人としてログイン
      </button>
    </form>
    <div class="ll-login__divider"><span>または</span></div>
    <button class="md-button md-button--outlined md-button--block md-state" id="peekBtn">
      ${icon('eye')}覗き見する（閲覧のみ）
    </button>
    <p class="md-body-small on-surface-variant" style="margin:12px 0 0">
      覗き見では記録の閲覧だけができます。ワークアウトの開始・記録・設定の変更はできません。
    </p>
    <button class="md-button md-button--text md-button--block md-state" id="backBtn" style="margin-top:16px">
      ${icon('back')}名前を選び直す
    </button>`;
}

/* ---------- 3. 新規登録 ---------- */

function registerStep() {
  return `
    ${header('新規登録', '氏名・メールアドレス・4桁PINを登録してください。')}
    <form id="registerForm" autocomplete="off">
      <div class="md-field">
        <input class="md-field__input" id="displayName" type="text" maxlength="40" placeholder="山田 太郎">
        <label class="md-field__label" for="displayName">氏名</label>
        <span class="md-field__support">ログイン画面に表示される名前です</span>
      </div>
      <div class="md-field">
        <input class="md-field__input" id="email" type="email" inputmode="email"
               autocapitalize="none" autocorrect="off" placeholder="you@example.com">
        <label class="md-field__label" for="email">メールアドレス</label>
        <span class="md-field__support">今後のGoogleカレンダー連携に使います。他の人には表示されません</span>
      </div>
      ${pinField('pin', 'PIN（数字4桁）')}
      ${pinField('pin2', 'PIN（確認のためもう一度）')}
      <button class="md-button md-button--filled md-button--block md-button--tall md-state" type="submit">
        ${icon('check')}登録してはじめる
      </button>
    </form>
    <button class="md-button md-button--text md-button--block md-state" id="backBtn" style="margin-top:16px">
      ${icon('back')}名前の一覧に戻る
    </button>`;
}

const pinField = (id, label) => `
  <div class="md-field">
    <input class="md-field__input ll-pin" id="${id}" type="password" inputmode="numeric"
           autocomplete="off" maxlength="4" placeholder="••••">
    <label class="md-field__label" for="${id}">${esc(label)}</label>
  </div>`;

/* ---------- イベント ---------- */

function bind(root) {
  root.querySelectorAll('.ll-pin').forEach((el) => {
    el.addEventListener('input', () => { el.value = auth.normalizePin(el.value); });
  });

  root.querySelector('#backBtn')?.addEventListener('click', () => { step = 'list'; paint(root); });
  root.querySelector('#toRegister')?.addEventListener('click', () => { step = 'register'; paint(root); });

  root.querySelector('.md-list')?.addEventListener('click', (ev) => {
    const item = ev.target.closest('[data-profile]');
    if (!item) return;
    picked = profiles.find((p) => p.id === item.dataset.profile);
    if (picked) { step = 'pin'; paint(root); }
  });

  root.querySelector('#pinForm')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const pin = root.querySelector('#pin').value;
    try {
      await auth.login(picked, pin);
      await enter(picked, `${picked.display_name} としてログインしました`, 'ok', '/home');
    } catch (err) {
      snackbar(err.message, 'err');
      root.querySelector('#pin').value = '';
    }
  });

  root.querySelector('#peekBtn')?.addEventListener('click', async () => {
    setPeekTarget(picked.id);
    await enter(picked, `${picked.display_name} さんの記録を閲覧しています（編集はできません）`, '', '/dashboard');
  });

  root.querySelector('#registerForm')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const displayName = root.querySelector('#displayName').value.trim();
    const email = root.querySelector('#email').value.trim();
    const pin = root.querySelector('#pin').value;
    const pin2 = root.querySelector('#pin2').value;
    if (pin !== pin2) { snackbar('確認用のPINが一致しません', 'err'); return; }
    try {
      const created = await auth.register({ displayName, email, pin });
      const profile = await db.getProfile(created.id);
      await enter(profile, `${displayName} を登録しました`, 'ok', '/home');
    } catch (err) {
      snackbar(err.message, 'err');
    }
  });

  setTimeout(() => root.querySelector('#pin, #displayName')?.focus(), 50);
}

/** プロフィールを現在の表示対象にして、アプリ本体へ進む */
async function enter(profile, message, tone, path) {
  state.profile = profile;
  clearDraft();
  try {
    await bootstrap();
  } catch (err) {
    snackbar(err.message, 'err');
  }
  paintNetState();
  snackbar(message, tone);
  reset();
  navigate(path);
}

export function reset() {
  step = 'list';
  picked = null;
  profiles = [];
}
