/**
 * api.js — GAS Web API クライアント
 *
 * 重要:
 *  - POST の Content-Type は "text/plain;charset=utf-8"。
 *    application/json にすると CORS プリフライト(OPTIONS)が発生し、
 *    Apps Script は OPTIONS に応答できないためリクエストが失敗する。
 *  - GAS は 302 で script.googleusercontent.com にリダイレクトするので
 *    redirect: 'follow'（既定）のままにすること。
 */

import { setLoading } from './ui.js';

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

class ApiError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

async function request(action, payload = {}, method = 'GET', { silent = false } = {}) {
  const { apiUrl, apiKey } = getConfig();
  if (!apiUrl || !apiKey) throw new ApiError('NOT_CONFIGURED', 'API URL と APIキーを設定画面で登録してください。');

  if (!silent) setLoading(true);
  try {
    let res;
    if (method === 'GET') {
      const url = new URL(apiUrl);
      url.searchParams.set('action', action);
      url.searchParams.set('key', apiKey);
      Object.entries(payload).forEach(([k, v]) => {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      });
      res = await fetch(url.toString(), { method: 'GET', redirect: 'follow' });
    } else {
      res = await fetch(apiUrl, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, key: apiKey, payload })
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
    if (!json.ok) throw new ApiError(json.error?.code || 'ERROR', json.error?.message || '不明なエラー');
    return json.data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError('NETWORK_ERROR', '通信に失敗しました: ' + err.message);
  } finally {
    if (!silent) setLoading(false);
  }
}

export const api = {
  ping:          (opts)     => request('ping', {}, 'GET', opts),
  bootstrap:     ()         => request('getBootstrap'),
  menus:         ()         => request('getMenus'),
  guides:        (refresh)  => request('getGuides', refresh ? { refresh: 'true' } : {}),
  suggestion:    (p)        => request('getSuggestion', p),
  history:       (p)        => request('getHistory', p),
  dashboard:     (month)    => request('getDashboard', month ? { month } : {}),
  startSession:  (p)        => request('startSession', p, 'POST'),
  finishSession: (p)        => request('finishSession', p, 'POST'),
  deleteSession: (id)       => request('deleteSession', { sessionId: id }, 'POST'),
  saveSetting:   (k, v)     => request('saveSetting', { key: k, value: v }, 'POST'),
  upsertMenu:    (p)        => request('upsertMenu', p, 'POST')
};
