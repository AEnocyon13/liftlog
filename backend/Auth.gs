/**
 * Auth.gs — 4桁PINによる本人確認と、書き込み権限を表すセッショントークン
 *
 * 【方針】
 *  ・PIN は平文で保存せず、ユーザーごとのソルト付き SHA-256 ハッシュで保存する。
 *  ・ログインに成功すると「署名付きトークン」を発行する。トークンは保存せず、
 *    受け取るたびに署名を検証する（ステートレス）。端末を選ばず、キャッシュ消失でも失効しない。
 *  ・**覗き見モードではトークンを発行しない。** 書き込み系の action は
 *    トークンが無ければサーバー側で拒否するので、UIを迂回して API を直接叩いても書き込めない。
 *
 * 【限界】
 *  4桁PINは総当たりに弱いので、試行回数の制限（10分間に5回まで）を併用している。
 *  それでも「同じAPIキーを共有する仲間内で、うっかり他人として記録しない」程度の強度であり、
 *  第三者に対する本格的な認証ではない。
 */

var PIN_RE = /^\d{4}$/;
var PIN_MAX_ATTEMPTS = 5;
var PIN_LOCK_SECONDS = 600;

/* ---------- PIN ---------- */

function assertPin_(pin) {
  var s = String(pin == null ? '' : pin).replace(/[０-９]/g, function (c) {   // 全角数字 → 半角
    return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
  }).trim();
  if (!PIN_RE.test(s)) throw apiError_('INVALID_PIN', 'PINは数字4桁で入力してください。');
  return s;
}

function toHex_(bytes) {
  return bytes.map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function hashPin_(pin, salt) {
  return toHex_(Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, salt + ':' + pin, Utilities.Charset.UTF_8));
}

function newSalt_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 16);
}

/** PIN を設定（または変更）して、ハッシュとソルトを返す */
function buildPinFields_(pin) {
  var salt = newSalt_();
  return { pinSalt: salt, pinHash: hashPin_(assertPin_(pin), salt) };
}

function userHasPin_(user) {
  return Boolean(user && user.pinHash && user.pinSalt);
}

/** PIN 照合。試行回数の上限を超えていたら例外。 */
function verifyPin_(user, pin) {
  var key = 'pinfail_' + user.surname;
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get(key) || 0);
  if (fails >= PIN_MAX_ATTEMPTS) {
    throw apiError_('PIN_LOCKED',
      'PINの入力を' + PIN_MAX_ATTEMPTS + '回まちがえました。10分ほど待ってからやり直してください。');
  }
  var ok = userHasPin_(user) && hashPin_(assertPin_(pin), user.pinSalt) === user.pinHash;
  if (!ok) {
    cache.put(key, String(fails + 1), PIN_LOCK_SECONDS);
    throw apiError_('WRONG_PIN', 'PINが違います。（あと' + (PIN_MAX_ATTEMPTS - fails - 1) + '回）');
  }
  cache.remove(key);
  return true;
}

/* ---------- セッショントークン ---------- */

function sign_(value) {
  return toHex_(Utilities.computeHmacSha256Signature(value, getTokenSecret_()));
}

/** `surname.expiryMs.署名` 形式のトークンを発行する */
function issueToken_(surname) {
  var exp = Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
  var body = surname + '.' + exp;
  return { token: body + '.' + sign_(body), expiresAt: new Date(exp).toISOString() };
}

/**
 * トークンを検証する。有効なら苗字を返し、無効なら null。
 * 署名・有効期限のどちらかが不正なら弾く。
 */
function readToken_(token) {
  var parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  var surname = parts[0], exp = Number(parts[1]), sig = parts[2];
  if (!SURNAME_RE.test(surname) || !isFinite(exp) || exp < Date.now()) return null;
  if (sign_(surname + '.' + exp) !== sig) return null;
  return surname;
}

/**
 * 書き込み系 action の入口。トークンが無い・無効・別人のものなら例外を投げる。
 * @param {Object} payload リクエストの payload
 * @param {Object} user    resolveUser_ で解決済みのユーザー
 */
function assertCanWrite_(payload, user) {
  var token = payload && payload.token;
  if (!token) {
    throw apiError_('TOKEN_REQUIRED',
      '覗き見モードでは変更できません。記録するには PIN を入力してログインしてください。');
  }
  var surname = readToken_(token);
  if (!surname) {
    throw apiError_('TOKEN_INVALID', 'ログインの有効期限が切れました。PINを入力し直してください。');
  }
  if (user && surname !== user.surname) {
    throw apiError_('TOKEN_MISMATCH', 'ログイン中のユーザーと操作対象が一致しません。ログインし直してください。');
  }
  return surname;
}
