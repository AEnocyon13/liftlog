/**
 * supabase.js — Supabase クライアント
 *
 * supabase-js がセッションを localStorage に保存し、アクセストークンを
 * 自動で更新します。これが「しばらく経つとログアウトしてしまう」問題への対策です。
 */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { getSupabaseConfig, isConfigured } from './config.js';

let client = null;
let signature = '';

/** 設定が変わったら作り直す */
export function sb() {
  if (!isConfigured()) throw new Error('Supabase の URL と anon キーが設定されていません。');
  const { url, anonKey } = getSupabaseConfig();
  const sig = url + '|' + anonKey;
  if (!client || sig !== signature) {
    signature = sig;
    client = createClient(url, anonKey, {
      auth: {
        persistSession: true,      // localStorage にセッションを保持
        autoRefreshToken: true,    // 期限が切れる前に自動更新
        detectSessionInUrl: false
      },
      global: { headers: { 'x-client-info': 'liftlog' } }
    });
  }
  return client;
}

/** Supabase のエラーを日本語に寄せて投げ直す */
export function throwIf(error, context) {
  if (!error) return;
  const msg = String(error.message || error);
  const map = [
    [/Invalid login credentials/i, 'PINが違います。'],
    [/Email not confirmed/i, 'Supabase の Authentication → Sign In / Providers で「Confirm email」をオフにしてください。'],
    [/User already registered/i, 'この登録はすでに使われています。'],
    [/duplicate key value.*display_name/i, 'その名前はすでに登録されています。別の表記にしてください。'],
    [/violates row-level security/i, '覗き見モードでは変更できません。PINを入力してログインしてください。'],
    [/Password should be at least/i, 'Supabase のパスワード最小文字数の設定が厳しすぎます。6文字に戻してください。'],
    [/Failed to fetch|NetworkError/i, '通信に失敗しました。電波と Supabase の稼働状況を確認してください。']
  ];
  const hit = map.find(([re]) => re.test(msg));
  const e = new Error(hit ? hit[1] : `${context || '処理'}に失敗しました: ${msg}`);
  e.code = error.code || '';
  e.raw = msg;
  throw e;
}
