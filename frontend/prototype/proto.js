/**
 * proto.js — プロトタイプの配線
 * 3Dシーンを各 canvas に取り付け、画面の中の小さな動き（タイマー・選択・演出）を動かします。
 */
import { mountHero, mountBody, mountBurst, mountBars, BODY_PARTS } from './scenes.js';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/* ------------------------------------------------------------ 3Dの設置 -- */

mountHero($('[data-scene="hero"]'));

const burst = mountBurst($('[data-scene="burst"]'));
$('#finishBtn')?.addEventListener('click', () => burst.fire());

/* ------------------------------------------------ 部位選択（人体と札） -- */

const MENUS = {
  肩:  ['サイドレイズ', 'ショルダープレス', 'リアレイズ'],
  胸:  ['ベンチプレス', 'インクラインダンベルプレス', 'ケーブルフライ'],
  背中: ['ラットプルダウン', 'ベントオーバーロウ', 'デッドリフト'],
  腕:  ['バーベルカール', 'ケーブルプレスダウン', 'ハンマーカール'],
  腹:  ['アブローラー', 'ハンギングレッグレイズ', 'ケーブルクランチ'],
  脚:  ['スクワット', 'レッグプレス', 'ルーマニアンデッドリフト']
};

const chipsEl   = $('#partChips');
const summaryEl = $('#pickSummary');
const menusEl   = $('#pickMenus');

BODY_PARTS.forEach((p) => {
  const b = document.createElement('button');
  b.className = 'chip';
  b.textContent = p;
  b.dataset.part = p;
  chipsEl.appendChild(b);
});

let body = null;

function paintSelection(list) {
  $$('.chip', chipsEl).forEach((c) => c.classList.toggle('is-on', list.includes(c.dataset.part)));
  summaryEl.textContent = list.length ? list.join(' / ') : '未選択';

  const menus = list.flatMap((p) => MENUS[p].slice(0, list.length > 2 ? 1 : 2).map((m) => [p, m]));
  menusEl.innerHTML = menus.length
    ? menus.map(([p, m]) => `
        <li class="row row--lime" style="padding:10px 13px">
          <span class="row__bar"></span>
          <span class="row__main">
            <span class="row__t" style="font-size:13px">${m}</span>
            <span class="row__s">${p}　3セット</span>
          </span>
        </li>`).join('')
    : `<li style="color:var(--text-3);font-size:13px;padding:6px 0">人体をタップして部位を選んでください</li>`;
}

body = mountBody($('[data-scene="body"]'), paintSelection);

chipsEl.addEventListener('click', (ev) => {
  const chip = ev.target.closest('.chip');
  if (!chip) return;
  const next = $$('.chip', chipsEl)
    .filter((c) => (c === chip ? !c.classList.contains('is-on') : c.classList.contains('is-on')))
    .map((c) => c.dataset.part);
  body.setSelection(next);
  paintSelection(next);
});

/* ------------------------------------------- ワークアウト中の小さな動き -- */

const pad = (n) => String(n).padStart(2, '0');

// 経過時間
let sec = 42 * 60 + 18;
const elapsedEl = $('#elapsed');
setInterval(() => {
  sec++;
  elapsedEl.textContent = `${pad(Math.floor(sec / 3600))}:${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)}`;
}, 1000);

// 休憩タイマー（2分で一周し、そのまま繰り返す）
const REST = 120, CIRC = 150.8;
let rest = 72;
const ringEl = $('#restRing'), restVEl = $('#restV');
setInterval(() => {
  rest = rest > 0 ? rest - 1 : REST;
  restVEl.textContent = `${Math.floor(rest / 60)}:${pad(rest % 60)}`;
  ringEl.setAttribute('stroke-dashoffset', String(CIRC * (1 - rest / REST)));
}, 1000);

// 重量とレップのステッパー
$$('.stepper').forEach((st) => {
  const isW = st.dataset.step === 'w';
  let v = isW ? 82.5 : 8;
  const out = $('.stepper__v', st);
  st.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    v = Math.max(isW ? 0 : 1, v + Number(b.dataset.d) * (isW ? 2.5 : 1));
    out.innerHTML = `${isW ? v.toFixed(1).replace(/\.0$/, '') : v}<small>${isW ? 'kg' : '回'}</small>`;
  });
});

/* ----------------------------------------------------------- レポート -- */

const MONTHS  = ['5月', '6月', '7月', '8月', '9月', '10月'];
const VOLUMES = [14.2, 11.8, 18.6, 16.1, 21.4, 23.8];

const axisEl = $('#barAxis');
axisEl.innerHTML = MONTHS.map((m, i) =>
  `<span style="${i === MONTHS.length - 1 ? 'color:var(--magenta)' : ''}">${m}</span>`).join('');
mountBars($('[data-scene="bars"]'), VOLUMES, axisEl);

// トレーニング日のヒートマップ（10月のダミー）
const LEVELS = [0,0,1,0,2,0,0, 0,3,0,1,0,4,0, 0,2,0,3,0,0,1, 0,4,0,2,0,3,0, 0,1,4];
$('#heat').innerHTML = LEVELS.map((l, i) =>
  `<i data-l="${l}" title="10/${i + 1}">${i + 1}</i>`).join('');
