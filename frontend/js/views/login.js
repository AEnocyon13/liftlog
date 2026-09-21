/** login.js — 苗字によるログイン / 新規登録 */
import { state, setUser, SURNAME_RE, normalizeSurname, clearDraft } from '../state.js';
import { api, isConfigured } from '../api.js';
import { esc, icon, snackbar, confirmDialog } from '../ui.js';
import { navigate } from '../router.js';
import { bootstrap } from '../app.js';

let knownUsers = [];

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

  // 登録済みの苗字は候補として出す（未取得でもログインはできる）
  try {
    const res = await api.listUsers();
    knownUsers = res.users || [];
    const box = root.querySelector('#knownUsers');
    if (box) box.innerHTML = knownUsersHtml();
  } catch { /* 候補が出せなくても支障はない */ }
}

function paint(root) {
  root.innerHTML = `
    <div class="ll-login">
      <div class="ll-login__mark">${icon('logo', 'icon--lg')}</div>
      <h2 class="md-headline-small" style="margin:0 0 4px">ようこそ</h2>
      <p class="md-body-medium on-surface-variant" style="margin:0 0 24px">
        苗字を入力してはじめてください。記録は苗字ごとに分けて保存されます。
      </p>

      <form id="loginForm" autocomplete="off">
        <div class="md-field">
          <input class="md-field__input" id="surname" type="text" inputmode="latin"
                 autocapitalize="none" autocorrect="off" spellcheck="false"
                 placeholder="yamada" maxlength="20">
          <label class="md-field__label" for="surname">苗字（小文字のローマ字）</label>
          <span class="md-field__support" id="surnameHelp">a〜z の小文字のみ・20文字以内（例: tanaka）</span>
        </div>
        <button class="md-button md-button--filled md-button--block md-button--tall md-state" id="loginBtn" type="submit">
          ${icon('check')}はじめる
        </button>
      </form>

      <div id="knownUsers">${knownUsersHtml()}</div>
    </div>`;

  const input = root.querySelector('#surname');
  const help = root.querySelector('#surnameHelp');

  input.addEventListener('input', () => {
    const v = normalizeSurname(input.value);
    if (input.value !== v) input.value = v;           // 大文字・空白はその場で直す
    const ok = v === '' || SURNAME_RE.test(v);
    help.textContent = ok
      ? 'a〜z の小文字のみ・20文字以内（例: tanaka）'
      : '使えるのは a〜z の小文字だけです。数字や記号は入力できません。';
    help.style.color = ok ? '' : 'var(--md-sys-color-error)';
  });

  root.querySelector('#loginForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    submit(root, input.value);
  });

  root.querySelector('#knownUsers').addEventListener('click', (ev) => {
    const chip = ev.target.closest('[data-surname]');
    if (chip) submit(root, chip.dataset.surname);
  });

  setTimeout(() => input.focus(), 50);
}

function knownUsersHtml() {
  if (!knownUsers.length) return '';
  return `
    <h3 class="md-section-header">登録済み</h3>
    <div class="md-chip-set">
      ${knownUsers.map((u) => `
        <button class="md-chip md-chip--assist md-state" data-surname="${esc(u)}">
          ${icon('person', 'icon--sm')}${esc(u)}
        </button>`).join('')}
    </div>`;
}

async function submit(root, raw) {
  const surname = normalizeSurname(raw);
  if (!SURNAME_RE.test(surname)) {
    snackbar('苗字は a〜z の小文字のみで入力してください', 'err');
    return;
  }

  try {
    let res = await api.login(surname);

    if (res.needsConfirm) {
      const ok = await confirmDialog({
        headline: `「${surname}」を新規登録しますか？`,
        body: 'この苗字はまだ登録されていません。登録すると、あなた専用の記録シートが作成されます。'
            + '入力ミスの場合は「キャンセル」を選んでください。',
        confirmLabel: '新規登録する',
        cancelLabel: '入力し直す'
      });
      if (!ok) return;
      res = await api.login(surname, true);
    }

    setUser(surname);
    clearDraft();
    state.user = res.user || null;
    await bootstrap();
    snackbar(res.created ? `${surname} を登録しました` : `${surname} としてログインしました`, 'ok');
    navigate('/home');
  } catch (err) {
    snackbar(err.message, 'err');
  }
}
