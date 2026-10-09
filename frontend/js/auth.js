/**
 * auth.js — 登録 / ログイン / 覗き見
 *
 * 【方式】
 *   登録   … 氏名 + メールアドレス + 4桁PIN
 *   ログイン … 名前を選ぶ → PIN を入力
 *   覗き見 … PIN なしで閲覧のみ（Supabase にサインインしない）
 *
 * Supabase Auth はメール+パスワードで動くので、
 *   ・認証用アドレス … `u<ランダム>@liftlog.app` という合成アドレス（実在しない）
 *   ・パスワード     … PIN から決まる文字列（Supabase の最小文字数を満たすため連結している）
 * として扱い、**本物のメールアドレスは user_private テーブル**（本人しか読めない）に保存する。
 * profiles は誰でも読める公開テーブルなので、そこにメールを置かないための作りわけ。
 *
 * 本物のメールを集めているのは、今後 Google カレンダー連携を足すときに使うため。
 */
import { sb, throwIf } from './supabase.js';

const AUTH_DOMAIN = 'liftlog.app';
export const PIN_RE = /^\d{4}$/;

const randomAuthEmail = () =>
  'u' + crypto.randomUUID().replace(/-/g, '').slice(0, 20) + '@' + AUTH_DOMAIN;

/** PIN から実際のパスワードを決める。4桁のままでは Supabase の最小文字数に足りないため。 */
const derivePassword = (pin, authEmail) => `${pin}::${authEmail}`;

export function normalizePin(raw) {
  return String(raw ?? '')
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/\D/g, '')
    .slice(0, 4);
}

export const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());

/* ---------- 一覧 ---------- */

/** ログイン画面に出す名前の一覧（公開情報のみ） */
export async function listProfiles() {
  const { data, error } = await sb()
    .from('profiles')
    .select('id, display_name, auth_email, created_at, last_login_at')
    .order('display_name');
  throwIf(error, '登録者の読み込み');
  return data || [];
}

/* ---------- 登録 ---------- */

export async function register({ displayName, email, pin }) {
  const name = String(displayName || '').trim().replace(/\s+/g, ' ');
  if (!name) throw new Error('氏名を入力してください。');
  if (name.length > 40) throw new Error('氏名は40文字以内で入力してください。');
  if (!isValidEmail(email)) throw new Error('メールアドレスの形式が正しくありません。');
  if (!PIN_RE.test(pin)) throw new Error('PINは数字4桁で入力してください。');

  const client = sb();
  const authEmail = randomAuthEmail();

  const { data: signUp, error: signUpError } =
    await client.auth.signUp({ email: authEmail, password: derivePassword(pin, authEmail) });
  throwIf(signUpError, '登録');
  if (!signUp.session) {
    throw new Error('登録はできましたが、サインインできませんでした。'
      + 'Supabase の Authentication → Sign In / Providers で「Confirm email」をオフにしてください。');
  }

  const id = signUp.user.id;
  const { error: profileError } = await client.from('profiles')
    .insert({ id, display_name: name, auth_email: authEmail, last_login_at: new Date().toISOString() });
  if (profileError) {
    // プロフィールを作れないと一覧に出ず二度とログインできないので、認証だけ残さない
    await client.auth.signOut();
    throwIf(profileError, '登録');
  }

  const { error: privateError } = await client.from('user_private')
    .insert({ id, email: String(email).trim() });
  throwIf(privateError, 'メールアドレスの保存');

  return { id, displayName: name, authEmail };
}

/* ---------- ログイン ---------- */

export async function login(profile, pin) {
  if (!PIN_RE.test(pin)) throw new Error('PINは数字4桁で入力してください。');
  const client = sb();
  const { data, error } = await client.auth.signInWithPassword({
    email: profile.auth_email,
    password: derivePassword(pin, profile.auth_email)
  });
  throwIf(error, 'ログイン');
  client.from('profiles').update({ last_login_at: new Date().toISOString() })
    .eq('id', data.user.id).then(() => {}, () => {});   // 失敗してもログインは続行
  return data.user;
}

export async function logout() {
  try { await sb().auth.signOut(); } catch { /* 未設定でも落とさない */ }
}

/** 現在サインインしているユーザー（覗き見なら null） */
export async function currentUser() {
  try {
    const { data } = await sb().auth.getUser();
    return data?.user || null;
  } catch {
    return null;
  }
}

/* ---------- PIN 変更 ---------- */

export async function changePin(profile, currentPin, newPin) {
  if (!PIN_RE.test(newPin)) throw new Error('新しいPINは数字4桁で入力してください。');
  const client = sb();
  // 現在のPINを確かめるため、いったん同じ資格情報でサインインし直す
  const { error: reauth } = await client.auth.signInWithPassword({
    email: profile.auth_email,
    password: derivePassword(currentPin, profile.auth_email)
  });
  if (reauth) throw new Error('現在のPINが違います。');
  const { error } = await client.auth.updateUser({
    password: derivePassword(newPin, profile.auth_email)
  });
  throwIf(error, 'PINの変更');
}

/** 本人のメールアドレス（本人しか読めない） */
export async function myEmail() {
  const { data, error } = await sb().from('user_private').select('email').maybeSingle();
  if (error) return null;
  return data?.email || null;
}

export async function saveMyEmail(email) {
  if (!isValidEmail(email)) throw new Error('メールアドレスの形式が正しくありません。');
  const user = await currentUser();
  if (!user) throw new Error('ログインしてください。');
  const { error } = await sb().from('user_private')
    .upsert({ id: user.id, email: String(email).trim() });
  throwIf(error, 'メールアドレスの保存');
}
