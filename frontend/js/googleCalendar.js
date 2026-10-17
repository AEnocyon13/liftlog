/**
 * googleCalendar.js — 行ったワークアウトを Google カレンダーに書き込む
 *
 * 【方式】
 *   Google Identity Services（GIS）のトークンクライアントをブラウザで使う。
 *   サーバーも秘密鍵も要らず、必要なのは公開してよい OAuth クライアントIDだけ。
 *   取得できるのは有効期間1時間ほどのアクセストークンで、更新トークンは発行されない。
 *   期限が切れたら prompt:'' の黙示的な再取得を試み、それも駄目なときだけ同意画面を出す。
 *
 * 【方針】
 *   カレンダーへの書き込みは**記録の保存を邪魔しない**。
 *   失敗しても記録はすでに Supabase に入っているので、知らせるだけで先に進む。
 */
import { getGoogleConfig, isGoogleConfigured } from './config.js';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',              // 予定の作成・削除
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly' // カレンダー一覧の取得
].join(' ');
const LS_TOKEN = 'liftlog.gtoken';
const API = 'https://www.googleapis.com/calendar/v3';

export { isGoogleConfigured };

/* ---------- トークン ---------- */

const readToken = () => {
  try {
    const t = JSON.parse(localStorage.getItem(LS_TOKEN) || 'null');
    return (t && t.expiresAt > Date.now() + 60_000) ? t : null;   // 1分の余裕を見る
  } catch { return null; }
};
const writeToken = (accessToken, expiresInSec) => {
  try {
    localStorage.setItem(LS_TOKEN, JSON.stringify({
      accessToken, expiresAt: Date.now() + (Number(expiresInSec) || 3600) * 1000
    }));
  } catch { /* noop */ }
};
export const forgetToken = () => { try { localStorage.removeItem(LS_TOKEN); } catch { /* noop */ } };
export const hasToken = () => Boolean(readToken());

let gisPromise = null;
function loadGis() {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const el = document.createElement('script');
    el.src = GIS_SRC;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error('Google のスクリプトを読み込めませんでした。通信を確認してください。'));
    document.head.appendChild(el);
  });
  return gisPromise;
}

let tokenClient = null;
async function getTokenClient() {
  if (tokenClient) return tokenClient;
  await loadGis();
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: getGoogleConfig().clientId,
    scope: SCOPES,
    callback: () => {}        // requestToken 側で都度差し替える
  });
  return tokenClient;
}

/**
 * アクセストークンを得る。
 * @param {boolean} interactive true なら必要に応じて同意画面を出す（ユーザー操作の中から呼ぶこと）
 */
export async function getAccessToken({ interactive = false } = {}) {
  if (!isGoogleConfigured()) {
    throw new Error('Google のクライアントIDが未設定です。設定画面から登録してください。');
  }
  const cached = readToken();
  if (cached) return cached.accessToken;

  const client = await getTokenClient();
  const request = (prompt) => new Promise((resolve, reject) => {
    client.callback = (res) => {
      if (res.error) return reject(new Error(describeError(res.error)));
      writeToken(res.access_token, res.expires_in);
      resolve(res.access_token);
    };
    client.error_callback = (err) => reject(new Error(describeError(err?.type || 'unknown')));
    try { client.requestAccessToken({ prompt }); }
    catch (e) { reject(e); }
  });

  try {
    return await request('');              // まず黙って取り直す
  } catch (err) {
    if (!interactive) throw err;
    return await request('consent');       // 駄目なら同意画面
  }
}

function describeError(code) {
  const map = {
    popup_closed: '同意画面が閉じられました。',
    popup_failed_to_open: 'ポップアップがブロックされました。ブラウザの設定で許可してください。',
    access_denied: 'Google 側で許可されませんでした。',
    interaction_required: 'Google の再ログインが必要です。設定画面から連携し直してください。',
    consent_required: 'Google の再同意が必要です。設定画面から連携し直してください。',
    invalid_client: 'クライアントIDが正しくないか、承認済みのオリジンにこのサイトが入っていません。'
  };
  return map[code] || `Google との連携に失敗しました（${code}）。`;
}

/* ---------- Calendar API ---------- */

async function call(token, path, { method = 'GET', body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 401 || res.status === 403) {
    forgetToken();
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.error?.message?.includes('insufficientPermissions')
      ? 'カレンダーへの権限が足りません。設定画面から連携し直してください。'
      : 'Google の認証が切れました。設定画面から連携し直してください。');
  }
  if (res.status === 204) return null;
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error?.message || `カレンダーの操作に失敗しました（${res.status}）`);
  return json;
}

/** 書き込めるカレンダーだけを返す */
export async function listCalendars(token) {
  const json = await call(token, '/users/me/calendarList?minAccessRole=writer&maxResults=250');
  return (json.items || [])
    .map((c) => ({
      id: c.id,
      summary: c.summaryOverride || c.summary,
      primary: Boolean(c.primary),
      backgroundColor: c.backgroundColor || null
    }))
    .sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0));
}

/** 「筋トレ」のような専用カレンダーを作る */
export async function createCalendar(token, summary) {
  const json = await call(token, '/calendars', {
    method: 'POST',
    body: { summary, timeZone: timeZone() }
  });
  return { id: json.id, summary: json.summary, primary: false };
}

export const timeZone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tokyo';

/* ---------- 予定の組み立て ---------- */

const fmtKg = (v) => {
  const n = Number(v) || 0;
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
};

/**
 * ワークアウトから予定の中身を作る。
 * タイトルに部位、説明に種目ごとの「重量 × レップ」と合計を入れる。
 */
export function buildEvent({ workout, entries, startedAt, endedAt }) {
  const parts = [...new Set(entries.map((e) => e.part))];
  const lines = [];
  let totalVolume = 0, totalSets = 0;

  entries.forEach((entry) => {
    const work = entry.sets.filter((s) => !s.isWarmup && Number(s.reps) > 0);
    if (!work.length) return;
    const weights = [...new Set(work.map((s) => Number(s.weight) || 0))];
    const weightLabel = weights.length === 1
      ? `${fmtKg(weights[0])}kg`
      : work.map((s) => `${fmtKg(s.weight)}kg`).join('/');
    lines.push(`${entry.menu}　${weightLabel} × ${work.map((s) => s.reps).join('/')}`);
    work.forEach((s) => { totalVolume += (Number(s.weight) || 0) * Number(s.reps); totalSets++; });
  });

  const start = new Date(startedAt);
  const end = new Date(endedAt);
  const minutes = Math.max(1, Math.round((end - start) / 60000));
  const volume = Math.round(totalVolume);

  const description = [
    ...lines,
    '',
    `合計 ${totalSets}セット・${volume.toLocaleString('ja-JP')}kg・${minutes}分`,
    workout?.memo ? `メモ: ${workout.memo}` : null,
    '',
    'LiftLog で記録'
  ].filter((x) => x !== null).join('\n');

  return {
    summary: parts.length ? `筋トレ（${parts.join('・')}）` : '筋トレ',
    description,
    start: { dateTime: start.toISOString(), timeZone: timeZone() },
    end: { dateTime: end.toISOString(), timeZone: timeZone() },
    source: { title: 'LiftLog', url: location.origin + location.pathname },
    reminders: { useDefault: false, overrides: [] }   // 終わった予定なので通知はしない
  };
}

/* ---------- 書き込み ---------- */

/**
 * 予定を作る。失敗しても例外は投げるが、呼び出し側で握りつぶして
 * 記録の保存は成功したものとして扱うこと。
 * @return {string} 作成された予定のID
 */
export async function createEvent({ calendarId, workout, entries, startedAt, endedAt }) {
  const token = await getAccessToken({ interactive: false });
  const event = buildEvent({ workout, entries, startedAt, endedAt });
  const json = await call(token, `/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST', body: event
  });
  return json.id;
}

/** 予定を消す。すでに無い場合は黙って成功扱いにする。 */
export async function deleteEvent({ calendarId, eventId }) {
  if (!calendarId || !eventId) return;
  const token = await getAccessToken({ interactive: false });
  try {
    await call(token, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { method: 'DELETE' });
  } catch (err) {
    if (/410|404|Not Found|deleted/i.test(err.message)) return;   // すでに消えている
    throw err;
  }
}

/** アプリ起動時などに、黙ってトークンを温めておく */
export async function warmUpToken() {
  if (!isGoogleConfigured() || hasToken()) return;
  try { await getAccessToken({ interactive: false }); } catch { /* 後で対話的に取り直す */ }
}
