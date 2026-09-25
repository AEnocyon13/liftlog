/**
 * login.js — 苗字 → PIN / 覗き見 / 新規登録
 *
 * 画面は4段階。
 *   surname  … 苗字を入れる（登録済みなら候補チップから選べる）
 *   pin      … 本人としてログイン（PIN入力）か、覗き見（閲覧のみ）かを選ぶ
 *   register … 未登録の苗字。氏名と4桁PINを決めて登録する
 *   setPin   … 登録済みだがPIN未設定の人。氏名とPINを決める
 */
import { state, setSession, SURNAME_RE, normalizeSurname, clearDraft } from '../state.js';
import { api, isConfigured } from '../api.js';
import { esc, icon, snackbar, confirmDialog } from '../ui.js';
import { navigate } from '../router.js';
import { bootstrap } from '../app.js';

let knownUsers = [];
let step = 'surname';
let ctx = { surname: '', displayName: '' };

export async function render(root) {
  if (!isConfigured()) {
    root.innerHTML = `
      <div class="md-card md-card--filled">
        <div class="md-card__title">先に接続設定が必要です</div>
        <p class="md-body-medium on-surface-variant">GASのWebアプリURLとAPIキーを登録してください。</p>
        <a class="md-button md-button--filled md-button--block md-state" href="#/settings">
          ${icon('settings')}設定を開く
        </a>
      </div>`;
    return;
  }

  paint(root);

  if (step === 'surname' && !knownUsers.length) {
    try {
      knownUsers = (await api.listUsers()).users || [];
      if (step === 'surname') paint(root);
    } catch { /* 候補が出せなくても支障はない */ }
  }
}

function paint(root) {
  root.innerHTML = `<div class="ll-login">${
    step === 'surname'  ? surnameStep()
    : step === 'pin'    ? pinStep()
    : step === 'register' ? registerStep()
    : setPinStep()
  }</div>`;
  bind(root);
}

const header = (title, sub) => `
  <div class="ll-login__mark">${icon('logo', 'icon--lg')}</div>
  <h2 class="md-headline-small" style="margin:0 0 4px">${esc(title)}</h2>
  <p class="md-body-medium on-surface-variant" style="margin:0 0 24px">${sub}</p>`;

/* ---------- 1. 苗字 ---------- */

function surnameStep() {
  return `
    ${header('ようこそ', '苗字を入力してはじめてください。記録は苗字ごとに分けて保存されます。')}
    <form id="surnameForm" autocomplete="off">
      <div class="md-field">
        <input class="md-field__input" id="surname" type="text" inputmode="latin"
               autocapitalize="none" autocorrect="off" spellcheck="false"
               placeholder="yamada" maxlength="20" value="${esc(ctx.surname)}">
        <label class="md-field__label" for="surname">苗字（小文字のローマ字）</label>
        <span class="md-field__support" id="surnameHelp">a〜z の小文字のみ・20文字以内（例: tanaka）</span>
      </div>
      <button class="md-button md-button--filled md-button--block md-button--tall md-state" type="submit">
        ${icon('chevron')}次へ
      </button>
    </form>
    ${knownUsers.length ? `
      <h3 class="md-section-header">登録済み</h3>
      <div class="md-chip-set">
        ${knownUsers.map((u) => `
          <button class="md-chip md-chip--assist md-state" data-surname="${esc(u.surname)}">
            ${icon('person', 'icon--sm')}${esc(u.displayName || u.surname)}
          </button>`).join('')}
      </div>` : ''}`;
}

/* ---------- 2. PIN or 覗き見 ---------- */

function pinStep() {
  return `
    ${header(`${esc(ctx.displayName)} さん`, `PINを入力すると記録できます。<br>見るだけなら PIN なしで「覗き見」を選んでください。`)}
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
      ${icon('back')}苗字を入れ直す
    </button>`;
}

/* ---------- 3. 新規登録 ---------- */

function registerStep() {
  return `
    ${header('新規登録', `苗字「<b>${esc(ctx.surname)}</b>」で登録します。<br>氏名と、ログイン用の4桁PINを決めてください。`)}
    <form id="registerForm" autocomplete="off">
      <div class="md-field">
        <input class="md-field__input" id="displayName" type="text" maxlength="40" placeholder="山田 太郎">
        <label class="md-field__label" for="displayName">氏名</label>
        <span class="md-field__support">画面に表示される名前です。日本語でかまいません</span>
      </div>
      ${pinField('pin', 'PIN（数字4桁）')}
      ${pinField('pin2', 'PIN（確認のためもう一度）')}
      <button class="md-button md-button--filled md-button--block md-button--tall md-state" type="submit">
        ${icon('check')}登録してはじめる
      </button>
    </form>
    <p class="md-body-small on-surface-variant" style="margin:12px 0 0">
      PINを忘れた場合は、スプレッドシートの Users シートで該当行の pinHash / pinSalt を空にすると再設定できます。
    </p>
    <button class="md-button md-button--text md-button--block md-state" id="backBtn" style="margin-top:16px">
      ${icon('back')}苗字を入れ直す
    </button>`;
}

/* ---------- 4. PIN未設定ユーザーの初期設定 ---------- */

function setPinStep() {
  return `
    ${header('PINを設定してください', `「<b>${esc(ctx.surname)}</b>」はPINが未設定です。<br>これから使うPINを決めてください。記録はそのまま残ります。`)}
    <form id="setPinForm" autocomplete="off">
      <div class="md-field">
        <input class="md-field__input" id="displayName" type="text" maxlength="40"
               placeholder="山田 太郎" value="${esc(ctx.displayName === ctx.surname ? '' : ctx.displayName)}">
        <label class="md-field__label" for="displayName">氏名</label>
        <span class="md-field__support">未入力なら苗字がそのまま表示名になります</span>
      </div>
      ${pinField('pin', 'PIN（数字4桁）')}
      ${pinField('pin2', 'PIN（確認のためもう一度）')}
      <button class="md-button md-button--filled md-button--block md-button--tall md-state" type="submit">
        ${icon('lock')}設定してログイン
      </button>
    </form>
    <button class="md-button md-button--text md-button--block md-state" id="backBtn" style="margin-top:16px">
      ${icon('back')}苗字を入れ直す
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
    el.addEventListener('input', () => {
      el.value = el.value.replace(/[^0-9]/g, '').slice(0, 4);
    });
  });

  root.querySelector('#backBtn')?.addEventListener('click', () => {
    step = 'surname';
    paint(root);
  });

  const surnameInput = root.querySelector('#surname');
  if (surnameInput) {
    const help = root.querySelector('#surnameHelp');
    surnameInput.addEventListener('input', () => {
      const v = normalizeSurname(surnameInput.value);
      if (surnameInput.value !== v) surnameInput.value = v;
      const ok = v === '' || SURNAME_RE.test(v);
      help.textContent = ok
        ? 'a〜z の小文字のみ・20文字以内（例: tanaka）'
        : '使えるのは a〜z の小文字だけです。数字や記号は入力できません。';
      help.style.color = ok ? '' : 'var(--md-sys-color-error)';
    });
    setTimeout(() => surnameInput.focus(), 50);
  } else {
    setTimeout(() => root.querySelector('#pin, #displayName')?.focus(), 50);
  }

  root.querySelector('#surnameForm')?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    lookup(root, surnameInput.value);
  });
  root.querySelector('.md-chip-set')?.addEventListener('click', (ev) => {
    const chip = ev.target.closest('[data-surname]');
    if (chip) lookup(root, chip.dataset.surname);
  });

  root.querySelector('#pinForm')?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    finish(root, { surname: ctx.surname, pin: root.querySelector('#pin').value });
  });
  root.querySelector('#peekBtn')?.addEventListener('click', () => {
    finish(root, { surname: ctx.surname, mode: 'peek' });
  });

  root.querySelector('#registerForm')?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const displayName = root.querySelector('#displayName').value.trim();
    const pin = root.querySelector('#pin').value;
    if (!displayName) return snackbar('氏名を入力してください', 'err');
    if (!checkPinPair(root)) return;
    finish(root, { surname: ctx.surname, confirmCreate: true, displayName, pin });
  });

  root.querySelector('#setPinForm')?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (!checkPinPair(root)) return;
    const displayName = root.querySelector('#displayName').value.trim();
    finish(root, { surname: ctx.surname, newPin: root.querySelector('#pin').value, displayName });
  });
}

function checkPinPair(root) {
  const pin = root.querySelector('#pin').value;
  const pin2 = root.querySelector('#pin2').value;
  if (!/^\d{4}$/.test(pin)) { snackbar('PINは数字4桁で入力してください', 'err'); return false; }
  if (pin !== pin2) { snackbar('確認用のPINが一致しません', 'err'); return false; }
  return true;
}

/** 苗字を問い合わせて、次のステップを決める */
async function lookup(root, raw) {
  const surname = normalizeSurname(raw);
  if (!SURNAME_RE.test(surname)) {
    snackbar('苗字は a〜z の小文字のみで入力してください', 'err');
    return;
  }
  ctx.surname = surname;

  try {
    const res = await api.login({ surname });

    if (res.needsConfirm) {
      const ok = await confirmDialog({
        headline: `「${surname}」を新規登録しますか？`,
        body: 'この苗字はまだ登録されていません。登録すると、あなた専用の記録シートが作成されます。'
            + '入力ミスの場合は「キャンセル」を選んでください。',
        confirmLabel: '新規登録する',
        cancelLabel: '入力し直す'
      });
      if (!ok) return;
      step = 'register';
    } else if (res.needsPinSetup) {
      ctx.displayName = res.user?.displayName || surname;
      step = 'setPin';
    } else {
      ctx.displayName = res.user?.displayName || surname;
      step = 'pin';
    }
    paint(root);
  } catch (err) {
    snackbar(err.message, 'err');
  }
}

/** ログイン（本人・覗き見・登録）を確定して、アプリ本体へ進む */
async function finish(root, payload) {
  try {
    const res = await api.login(payload);
    setSession({ surname: res.surname, mode: res.mode, token: res.token });
    clearDraft();
    state.user = res.user || null;
    await bootstrap();

    const name = res.user?.displayName || res.surname;
    snackbar(
      res.created ? `${name} を登録しました`
      : res.mode === 'peek' ? `${name} さんの記録を閲覧しています（編集はできません）`
      : res.pinSet ? `PINを設定しました。${name} としてログインしました`
      : `${name} としてログインしました`,
      res.mode === 'peek' ? '' : 'ok');

    step = 'surname';
    knownUsers = [];
    navigate(res.mode === 'peek' ? '/dashboard' : '/home');
  } catch (err) {
    snackbar(err.message, 'err');
    if (err.code === 'WRONG_PIN' || err.code === 'PIN_LOCKED') {
      root.querySelector('#pin') && (root.querySelector('#pin').value = '');
    }
  }
}

/** 他の画面からログイン画面に戻るときに状態を初期化する */
export function resetLogin() {
  step = 'surname';
  ctx = { surname: '', displayName: '' };
  knownUsers = [];
}
