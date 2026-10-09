/**
 * config.js — Supabase への接続設定
 *
 * この2つは**公開してよい値**です。anon キーはブラウザに配る前提の鍵で、
 * 「誰が何をできるか」は Supabase 側の RLS ポリシーだけで決まります
 * （supabase/schema.sql を参照）。GitHub に入れても問題ありません。
 *
 * ここを空のままにしておくと、アプリの設定画面から入力でき、
 * その値は端末の localStorage に保存されます（localStorage が優先）。
 */
export const DEFAULT_SUPABASE = {
  url: '',        // 例: 'https://abcdefghijklmnop.supabase.co'
  anonKey: ''     // 例: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
};

const LS_KEY = 'liftlog.supabase';

export function getSupabaseConfig() {
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { /* noop */ }
  return {
    url: (stored.url || DEFAULT_SUPABASE.url || '').trim().replace(/\/+$/, ''),
    anonKey: (stored.anonKey || DEFAULT_SUPABASE.anonKey || '').trim()
  };
}

export function setSupabaseConfig(patch) {
  const next = { ...getSupabaseConfig(), ...patch };
  localStorage.setItem(LS_KEY, JSON.stringify(next));
  return next;
}

export const isConfigured = () => {
  const c = getSupabaseConfig();
  return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(c.url) && c.anonKey.length > 20;
};
