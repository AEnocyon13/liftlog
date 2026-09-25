/**
 * api.js — GAS Web API クライアント
 *
 * 重要:
 *  - POST の Content-Type は "text/plain;charset=utf-8"。
 *    application/json にすると CORS プリフライト(OPTIONS)が発生し、
 *    Apps Script は OPTIONS に応答できないためリクエストが失敗する。
 *  - GAS は 302 で script.googleusercontent.com にリダイレクトするので
 *    redirect: 'follow'（既定）のままにすること。
 *  - 実績系の action にはログイン中の苗字（user）を自動で付与する。
 *  - 書き込み系の action には、PINログインで得たトークンを自動で付与する。
 *    覗き見モードではトークンが無いため、サーバー側で TOKEN_REQUIRED として拒否される。
 */

import { setLoading } from './ui.js';
import { getUser, getToken, demoteToPeek } from './state.js';

const LS_CONFIG = 'liftlog.config';

export function getConfig() {
  try {
    return { apiUrl: '', apiKey: '', ...JSON.parse(localStorage.getItem(LS_CONFIG) || '{}') };
  } catch {
    return { apiUrl: '', apiKey: '' };
  }
}

export function setConfig(patch) {
  const next = { ...getConfig(), ...patch };
  localStorage.setItem(LS_CONFIG, JSON.stringify(next));
  return next;
}

export function isConfigured() {
  const c = getConfig();
  return Boolean(c.apiUrl && c.apiKey);
}

export class ApiError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/** 書き込み系（トークンが必要な）action */
const AUTHED_ACTIONS = new Set([
  'startSession', 'finishSession', 'deleteSession', 'saveUserSetting',
  'changePin', 'saveSetting', 'upsertMenu'
]);

async function request(action, payload = {}, method = 'GET', { silent = false, withUser = true } = {}) {
  const { apiUrl, apiKey } = getConfig();
  if (!apiUrl || !apiKey) throw new ApiError('NOT_CONFIGURED', 'API URL と APIキーを設定画面で登録してください。');

  const body = { ...payload };
  if (withUser && body.user === undefined) {
    const u = getUser();
    if (u) body.user = u;
  }
  if (AUTHED_ACTIONS.has(action) && body.token === undefined) {
    const t = getToken();
    if (t) body.token = t;
  }

  if (!silent) setLoading(true);
  try {
    let res;
    if (method === 'GET') {
      const url = new URL(apiUrl);
      url.searchParams.set('action', action);
      url.searchParams.set('key', apiKey);
      Object.entries(body).forEach(([k, v]) => {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      });
      res = await fetch(url.toString(), { method: 'GET', redirect: 'follow' });
    } else {
      res = await fetch(apiUrl, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, key: apiKey, payload: body })
      });
    }

    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new ApiError('BAD_RESPONSE',
        'APIから予期しない応答が返りました。デプロイ設定（アクセスできるユーザー = 全員）を確認してください。');
    }
    if (!json.ok) {
      const code = json.error?.code || 'ERROR';
      // トークンが失効していたら、閲覧だけできる状態に落としてから知らせる
      if (code === 'TOKEN_INVALID' || code === 'TOKEN_MISMATCH') demoteToPeek();
      throw new ApiError(code, json.error?.message || '不明なエラー');
    }
    return json.data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError('NETWORK_ERROR', '通信に失敗しました: ' + err.message);
  } finally {
    if (!silent) setLoading(false);
  }
}

export const api = {
  ping:            (opts)            => request('ping', {}, 'GET', { ...opts, withUser: false }),
  listUsers:       ()                => request('listUsers', {}, 'GET', { withUser: false }),
  /** 未登録なら {registered:false, needsConfirm:true} が返る。confirmCreate:true で新規作成。 */
  /**
   * ログイン。payload の組み合わせで分岐する（docs/API.md 参照）。
   *   {surname}                                   … 状態の問い合わせ
   *   {surname, mode:'peek'}                      … 覗き見
   *   {surname, pin}                              … 本人ログイン
   *   {surname, confirmCreate:true, displayName, pin} … 新規登録
   *   {surname, newPin, displayName?}             … PIN未設定ユーザーの初期設定
   */
  login:           (p)               => request('login', p, 'POST', { withUser: false }),
  changePin:       (currentPin, newPin) => request('changePin', { currentPin, newPin }, 'POST'),
  bootstrap:       ()                => request('getBootstrap'),
  menus:           ()                => request('getMenus', {}, 'GET', { withUser: false }),
  guides:          (refresh)         => request('getGuides', refresh ? { refresh: 'true' } : {}, 'GET', { withUser: false }),
  suggestion:      (p)               => request('getSuggestion', p),
  history:         (p)               => request('getHistory', p),
  dashboard:       (month)           => request('getDashboard', month ? { month } : {}),
  startSession:    (p)               => request('startSession', p, 'POST'),
  finishSession:   (p)               => request('finishSession', p, 'POST'),
  deleteSession:   (id)              => request('deleteSession', { sessionId: id }, 'POST'),
  saveUserSetting: (k, v)            => request('saveUserSetting', { key: k, value: v }, 'POST'),
  saveSetting:     (k, v)            => request('saveSetting', { key: k, value: v }, 'POST', { withUser: false }),
  upsertMenu:      (p)               => request('upsertMenu', p, 'POST', { withUser: false })
};
