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
  url: 'https://tdvlcwewswwinqqgahex.supabase.co',        // 例: 'https://abcdefghijklmnop.supabase.co'
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkdmxjd2V3c3d3aW5xcWdhaGV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1Mzk5MTcsImV4cCI6MjEwNzExNTkxN30.Gj54RvELBgfsm-6BnXIlduB5k5wpLzSlJDQaKiT90Is'     // 例: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
};

const LS_KEY = 'liftlog.supabase';

/**
 * supabase-js に渡すのは「プロジェクトURL」だけ。
 * ダッシュボードには `.../rest/v1/` のような末尾付きで出ている箇所もあるので、
 * パスが混ざっていても動くように落としてから使う。
 */
function normalizeUrl(raw) {
  const v = String(raw || '').trim();
  if (!v) return '';
  const m = v.match(/^(https:\/\/[a-z0-9-]+\.supabase\.co)/i);
  return m ? m[1] : v.replace(/\/+$/, '');
}

export function getSupabaseConfig() {
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { /* noop */ }
  return {
    url: normalizeUrl(stored.url || DEFAULT_SUPABASE.url),
    anonKey: (stored.anonKey || DEFAULT_SUPABASE.anonKey || '').trim()
  };
}

export function setSupabaseConfig(patch) {
  const next = { ...getSupabaseConfig(), ...patch };
  if (next.url) next.url = normalizeUrl(next.url);
  localStorage.setItem(LS_KEY, JSON.stringify(next));
  return next;
}

export const isConfigured = () => {
  const c = getSupabaseConfig();
  return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(c.url) && c.anonKey.length > 20;
};
