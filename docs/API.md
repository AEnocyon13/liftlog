# Web API リファレンス

エンドポイントは1つ（デプロイURL）。`action` で処理を振り分ける。

- **参照系**：`GET {exec}?action=...&key=API_KEY&param=...`
- **更新系**：`POST {exec}` に JSON ボディ。**Content-Type は `text/plain;charset=utf-8`**
  （`application/json` にするとCORSプリフライトが発生し、Apps Scriptは応答できない）

```jsonc
// POST のボディ
{ "action": "finishSession", "key": "＜APIキー＞", "payload": { ... } }
```

レスポンスは常に HTTP 200。成否は body で判定する。

```jsonc
{ "ok": true,  "data": { ... } }
{ "ok": false, "error": { "code": "UNAUTHORIZED", "message": "APIキーが一致しません。…" } }
```

---

## アクション一覧

| action | メソッド | payload | 返り値 |
|---|---|---|---|
| `ping` | GET | — | `{pong, now, tz}` 疎通確認 |
| `getBootstrap` | GET | — | `{menus, guides, settings, dashboard, openSession}` 起動時に必要なものを一括取得 |
| `getMenus` | GET | — | `{menus}` |
| `getGuides` | GET | `refresh?` | `{guides}` `refresh=true` でDocキャッシュを破棄して再パース |
| `getSuggestion` | GET | `part, menu, manualDelta?, manualWeight?, targetRepMin?, targetRepMax?` | `{suggestion, menuConfig, history}` |
| `getHistory` | GET | `part, menu, limit?` | `{history}` セッション単位の履歴 |
| `getDashboard` | GET | `month?` (`YYYY-MM`) | 月間集計一式 |
| `startSession` | POST | `{parts[], menus[], condition?, memo?}` | `{sessionId, startTime, date}` |
| `finishSession` | POST | `{sessionId, startTime, endTime, date, memo?, entries[]}` | `{savedSets, totalVolume, durationMin, dashboard}` |
| `deleteSession` | POST | `{sessionId}` | `{deletedRows}` Logs/Sessions から該当行を削除 |
| `saveSetting` | POST | `{key, value}` | `{settings}` |
| `upsertMenu` | POST | Menus 1行分 | `{menus}` |

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
| `BAD_JSON` | POSTボディのJSONが不正 |
| `SHEET_NOT_FOUND` | シート未作成（`setupSpreadsheet()` 未実行） |
| `INTERNAL_ERROR` | 上記以外。GASの実行ログにスタックトレースが出る |
| `NOT_CONFIGURED` | （フロント側）URL・キーが未設定 |
| `BAD_RESPONSE` | （フロント側）JSON以外が返った。デプロイのアクセス範囲を確認 |
| `NETWORK_ERROR` | （フロント側）通信失敗 |

## セキュリティ上の前提

- GASウェブアプリは「アクセスできるユーザー = 全員」で公開する必要がある。
  そのため **URLを知る第三者からのリクエストは届く**。共有シークレット `API_KEY` の照合で弾いている。
- キーはブラウザの localStorage に保存されるため、**URLとキーをセットで他人に渡さないこと**。
  漏れた場合は `generateApiKey()` を再実行すれば、既存のキーは即座に無効になる。
- より強い保護が必要なら、デプロイ設定を「Googleアカウントを持つ全員」に変更し、
  フロント側をGoogle OAuth（GIS）に対応させる拡張が考えられる。
