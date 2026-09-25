# Web API リファレンス

エンドポイントは1つ（デプロイURL）。`action` で処理を振り分ける。

- **参照系**：`GET {exec}?action=...&key=API_KEY&user=tanaka&param=...`
- **更新系**：`POST {exec}` に JSON ボディ。**Content-Type は `text/plain;charset=utf-8`**
  （`application/json` にするとCORSプリフライトが発生し、Apps Scriptは応答できない）

認証は3段構え。

1. `key` … APIキー（共有シークレット）。全リクエストに必須
2. `user` … ログイン中の苗字。実績を扱う action に必須で、`Logs_<姓>` / `Sessions_<姓>` の切り分けに使う
3. `token` … PINログインで発行される書き込み権限。**書き込み系の action に必須**

`token` は `苗字.有効期限.HMAC署名` 形式の署名付き文字列で、サーバーには保存しない（ステートレス）。
受け取るたびに署名と有効期限を検証する。有効期間は30日。**覗き見モードでは発行されない**ので、
UI を迂回して API を直接叩いても書き込みは `TOKEN_REQUIRED` で拒否される。

```jsonc
// POST のボディ
{ "action": "finishSession", "key": "＜APIキー＞", "payload": { "user": "tanaka", ... } }
```

レスポンスは常に HTTP 200。成否は body で判定する。

```jsonc
{ "ok": true,  "data": { ... } }
{ "ok": false, "error": { "code": "UNAUTHORIZED", "message": "APIキーが一致しません。…" } }
```

---

## アクション一覧

`user` 列が ✓ の action は payload に `user`（苗字）が、`token` 列が ✓ の action は
さらに `token` が必要。

| action | メソッド | user | token | payload | 返り値 |
|---|---|:---:|:---:|---|---|
| `ping` | GET | | | — | `{pong, now, tz}` 疎通確認 |
| `listUsers` | GET | | | — | `{users:[{surname, displayName, hasPin}]}` ログイン画面の候補 |
| `login` | POST | | | 下の表を参照 | 下の表を参照 |
| `getBootstrap` | GET | ✓ | | — | `{user, menus, guides, settings, dashboard, openSession}` 起動時の一括取得 |
| `getMenus` | GET | | | — | `{menus}` |
| `getGuides` | GET | | | `refresh?` | `{guides}` `refresh=true` でDocキャッシュを破棄して再パース |
| `getSuggestion` | GET | ✓ | | `part, menu, manualWeight?, manualDelta?, increment?, sets?` | `{suggestion, menuConfig, history}` |
| `getHistory` | GET | ✓ | | `part, menu, limit?` | `{history}` セッション単位の履歴 |
| `getDashboard` | GET | ✓ | | `month?` (`YYYY-MM`) | 月間集計一式 |
| `startSession` | POST | ✓ | ✓ | `{parts[], menus[], restMinutes?, memo?}` | `{sessionId, startTime, date}` |
| `finishSession` | POST | ✓ | ✓ | `{sessionId, startTime, endTime, date, memo?, restMinutes?, entries[]}` | `{savedSets, totalVolume, durationMin, dashboard}` |
| `deleteSession` | POST | ✓ | ✓ | `{sessionId}` | `{deletedRows}` 該当ユーザーのシートから削除 |
| `saveUserSetting` | POST | ✓ | ✓ | `{key, value}` | `{user}` 個人設定（`displayName` / `monthlyTargetWorkouts` / `monthlyTargetVolume` / `weightIncrement` / `restMinutes` / `memo`） |
| `changePin` | POST | ✓ | ✓ | `{currentPin, newPin}` | `{ok:true}` |
| `saveSetting` | POST | ✓ | ✓ | `{key, value}` | `{settings}` 全員共通の既定値 |
| `upsertMenu` | POST | ✓ | ✓ | Menus 1行分 | `{menus}` |

### login の分岐

同じ action を payload の組み合わせで使い分ける。

| payload | 返り値 | 用途 |
|---|---|---|
| `{surname}` | `{needsConfirm:true}` | 未登録。アプリ側で登録の確認を出す |
| `{surname}` | `{needsPinSetup:true, user}` | 登録済みだがPIN未設定 |
| `{surname}` | `{needsPin:true, user}` | 登録済み。PIN入力へ |
| `{surname, mode:"peek"}` | `{mode:"peek", user}` **token なし** | 覗き見（閲覧のみ） |
| `{surname, pin}` | `{mode:"auth", token, expiresAt, user}` | 本人ログイン |
| `{surname, confirmCreate:true, displayName, pin}` | `{created:true, mode:"auth", token, user}` | 新規登録。専用シートを2枚作成 |
| `{surname, newPin, displayName?}` | `{pinSet:true, mode:"auth", token, user}` | PIN未設定ユーザーの初期設定 |

```
POST login {surname:"suzuki"}
  → {registered:false, needsConfirm:true}
POST login {surname:"suzuki", confirmCreate:true, displayName:"鈴木 花子", pin:"1234"}
  → {registered:true, created:true, mode:"auth", token:"suzuki.1795…", user:{...}}
```

PINは平文で保存せず、ユーザーごとのソルト付き SHA-256 ハッシュ（`pinHash` / `pinSalt`）で保存する。
`publicUser_()` がハッシュを落とすため、API のレスポンスに PIN 関連の値は一切含まれない。
総当たり対策として、10分間に5回失敗すると `PIN_LOCKED` で一時的に拒否する。

### `finishSession` の entries

```jsonc
{
  "sessionId": "a1b2c3d4e5f6g7h8",
  "startTime": "2026-09-06T10:02:11.000Z",
  "endTime":   "2026-09-06T11:05:40.000Z",
  "date": "2026-09-06",
  "memo": "睡眠不足だが調子は良い",
  "entries": [
    {
      "part": "胸",
      "menu": "ベンチプレス",
      "sets": [
        { "setNo": 0, "weight": 40,   "reps": 12, "rpe": "",  "isWarmup": true  },
        { "setNo": 1, "weight": 82.5, "reps": 10, "rpe": 8,   "isWarmup": false },
        { "setNo": 2, "weight": 82.5, "reps": 9,  "rpe": 8.5, "isWarmup": false },
        { "setNo": 3, "weight": 82.5, "reps": 8,  "rpe": 9,   "isWarmup": false }
      ]
    }
  ]
}
```

- `reps` が 0 または空のセットは書き込まれない（未実施として扱う）
- `isWarmup: true` のセットは volume・est1RM を空にし、提案計算からも除外される
- 書き込みは `LockService` で排他制御し、Logs へは1回の `setValues` でまとめて追記する

## エラーコード

| code | 意味 |
|---|---|
| `UNAUTHORIZED` | APIキー不一致 |
| `UNKNOWN_ACTION` | 未知の action |
| `METHOD_NOT_ALLOWED` | 更新系を GET で呼んだ |
| `BAD_REQUEST` | 必須パラメータ不足 |
| `INVALID_SURNAME` | 苗字が小文字ローマ字20文字以内でない |
| `NO_USER` | `user` が指定されていない（ログインが必要な action） |
| `UNKNOWN_USER` | 指定された苗字が Users シートに無い |
| `INVALID_PIN` | PINが数字4桁でない |
| `WRONG_PIN` | PINが一致しない（残り試行回数をメッセージに含む） |
| `PIN_LOCKED` | 10分間に5回失敗した。時間をおいて再試行 |
| `INVALID_NAME` | 氏名が空、または40文字超 |
| `TOKEN_REQUIRED` | 覗き見モードで書き込もうとした |
| `TOKEN_INVALID` | トークンの署名が不正、または有効期限切れ |
| `TOKEN_MISMATCH` | トークンの持ち主と操作対象のユーザーが違う |
| `BAD_JSON` | POSTボディのJSONが不正 |
| `SHEET_NOT_FOUND` | シート未作成（`setupSpreadsheet()` 未実行） |
| `INTERNAL_ERROR` | 上記以外。GASの実行ログにスタックトレースが出る |
| `NOT_CONFIGURED` | （フロント側）URL・キーが未設定 |
| `BAD_RESPONSE` | （フロント側）JSON以外が返った。デプロイのアクセス範囲を確認 |
| `NETWORK_ERROR` | （フロント側）通信失敗 |

## セキュリティ上の前提

- 4桁PINは「仲間内で、うっかり他人として記録してしまわない」程度の強度。総当たりは10,000通りしかないため、
  試行回数制限（10分で5回）と併用しているが、**第三者に対する本格的な認証ではない**。
- **覗き見は誰でもできる**（PIN不要）。同じURLとAPIキーを持つ人は、他人の記録を閲覧できる。
  書き込みだけがPINで守られている。
- `TOKEN_SECRET`（スクリプトプロパティ）を変更すると、発行済みトークンがすべて無効になり全員が再ログインになる。
- GASウェブアプリは「アクセスできるユーザー = 全員」で公開する必要がある。
  そのため **URLを知る第三者からのリクエストは届く**。共有シークレット `API_KEY` の照合で弾いている。
- キーはブラウザの localStorage に保存されるため、**URLとキーをセットで他人に渡さないこと**。
  漏れた場合は `generateApiKey()` を再実行すれば、既存のキーは即座に無効になる。
- より強い保護が必要なら、デプロイ設定を「Googleアカウントを持つ全員」に変更し、
  フロント側をGoogle OAuth（GIS）に対応させる拡張が考えられる。
