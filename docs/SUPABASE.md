# Supabase セットアップ手順

データの置き場所を Google スプレッドシート + Apps Script から **Supabase（Postgres）** に移しました。
Apps Script・スプレッドシート・解説用 Google ドキュメントはもう使いません。

所要 15分ほど。無料プランの範囲で収まります。

---

## 0. 先に知っておくこと

| 項目 | 内容 |
|---|---|
| 無料プランの制限 | DB 500MB・プロジェクト2つまで。筋トレ記録なら10年分でも数MB程度です |
| **7日間の自動停止** | **アクセスが1週間ないとプロジェクトが一時停止します。**データは消えません。ダッシュボードから手動で再開できます |
| anon キーは公開してよい | ブラウザに配る前提の鍵です。権限は RLS（行単位の権限制御）で守られています |
| 覗き見は誰でもできる | 閲覧は認証不要の仕様です。守られているのは**書き込みだけ**です |

---

## 1. プロジェクトを作る

1. [supabase.com](https://supabase.com/dashboard) にGitHubアカウントでログイン
2. **New project** を押す
3. 入力する項目
   - Name: `liftlog`（任意）
   - Database Password: 自動生成でよい（**どこかに控える**。DBに直接つなぐとき以外は使いません）
   - Region: `Northeast Asia (Tokyo)`
   - Plan: **Free**
4. 作成完了まで1〜2分待つ

## 2. テーブルを作る

1. 左メニューの **SQL Editor** → **New query**
2. [`supabase/schema.sql`](../supabase/schema.sql) の中身を全部貼り付けて **Run**
3. `Success. No rows returned` と出れば成功

もう一度 **New query** を開き、[`supabase/seed.sql`](../supabase/seed.sql) を貼って **Run**。
Notion から取り込んだ**48種目と解説**が入ります。

### 確認

左メニューの **Table Editor** に次が並んでいれば大丈夫です。

```
profiles  user_private  exercises  exercise_guides  workouts  workout_sets
```

`exercises` を開いて48行、`exercise_guides` に22行あればOKです。

## 3. メール確認をオフにする ★重要

このアプリは「名前を選んで4桁PIN」でログインします。内部では Supabase Auth を
合成アドレス（`u...@liftlog.app`、実在しません）で使っているため、
**確認メールが有効のままだと登録できません。**

1. 左メニュー **Authentication** → **Sign In / Providers** → **Email**
2. **Confirm email** を **オフ** にして保存

同じ画面に **Minimum password length** があります。**6 のまま**にしてください
（PINは内部で6文字以上の文字列に変換してから渡しています）。

## 4. URL と anon キーを控える

左メニュー **Project Settings** → **API**（または **API Keys**）

| 項目 | 例 |
|---|---|
| Project URL | `https://abcdefghijklmnop.supabase.co` |
| anon public | `eyJhbGciOiJIUzI1NiIs...`（長い文字列） |

> `service_role` キーは**絶対にアプリに貼らないでください**。RLS を無視できる管理用の鍵です。

## 5. アプリに登録する

1. [アプリ](https://aenocyon13.github.io/liftlog/) を開く
2. 自動で設定画面が出るので、**Supabase 接続**に URL と anon キーを貼り付けて「保存して接続」
3. 「接続しました（種目 48 件）」と出れば成功

**このリポジトリでは `frontend/js/config.js` に設定済み**なので、通常は何も入力せずに使えます。
設定画面での入力は、別のプロジェクトに向けたいときの上書き用です（localStorage が優先されます）。

> **URL はプロジェクトURLだけ**を入れてください。ダッシュボードには `.../rest/v1/` 付きで
> 表示される箇所もありますが、supabase-js にはパスを含めずに渡す必要があります
> （貼り間違えても自動で落とすようにしてあります）。
>
> **`service_role` キーは絶対に貼らないでください。** config.js に入れてよいのは
> `anon`（`"role":"anon"` を含むJWT）だけです。

## 6. 最初のユーザーを登録する

1. ログイン画面で **新規登録する**
2. **氏名**・**メールアドレス**・**4桁PIN**（確認用にもう一度）を入力
3. 登録するとそのままログインされます

2人目以降も同じURLから登録できます。以降は**ログイン画面で名前を選んでPINを入れる**だけです。

> メールアドレスは `user_private` テーブルに入り、**本人しか読めません**。
> ログイン画面の名前一覧には出ません。今後の Google カレンダー連携のために預かっています。

---

## 運用

### 種目を増やす・解説を書く

Table Editor で `exercises` に行を足し、`exercise_guides` に `exercise_id` を合わせて解説を入れます。
アプリの 設定 →「種目・解説を再読込」で反映されます。

解説の原文は [notion-guide-source.md](notion-guide-source.md) にあります。
入れ直したいときは `supabase/seed.sql` をもう一度流せば上書きされます
（手で書いた解説も上書きされるので注意）。

### PINを忘れたとき

SQL Editor で、その人の認証用アドレスを調べてからパスワードを入れ替えます。

```sql
-- 1. 認証用アドレスを調べる
select display_name, auth_email from public.profiles;

-- 2. PIN を 1234 に戻す（auth_email は上で調べた値に置き換える）
update auth.users
set encrypted_password = crypt('1234::u××××@liftlog.app', gen_salt('bf'))
where email = 'u××××@liftlog.app';
```

パスワードは `PIN::認証用アドレス` という形です。上の例なら、その人は PIN `1234` でログインできます。

### プロジェクトが停止したとき

1週間使わないと停止します。ダッシュボードを開いて **Restore project** を押すと数分で戻ります。
データは失われません。

### バックアップ

Table Editor の各テーブル右上 **⋯ → Export to CSV** で書き出せます。
無料プランには自動バックアップが付かないので、気になるなら時々 `workout_sets` を書き出しておくと安心です。

---

## うまくいかないとき

| 症状 | 原因と対処 |
|---|---|
| 「Supabase の URL と anon キーが設定されていません」 | 手順5が済んでいません |
| 登録時に「Confirm email をオフに」と出る | 手順3が済んでいません |
| `violates row-level security policy` | 覗き見モードのまま書き込もうとしています。PINを入れてログインしてください |
| ログイン画面に名前が出ない | `profiles` が空です。新規登録から始めてください |
| 種目が0件 | `seed.sql` を流していません |
| `relation "public.xxx" does not exist` | `schema.sql` を流していません |
| 急に全部つながらなくなった | プロジェクトが7日間の無操作で停止している可能性があります。ダッシュボードで再開してください |
| 「PINが違います」が続く | PINを忘れた場合は上の「PINを忘れたとき」を実行してください |

---

## 以前の構成からの変更点

| v2（〜2026-09） | v3（現在） |
|---|---|
| Google Apps Script がAPI | ブラウザから Supabase に直接接続 |
| スプレッドシート（Logs_姓 / Sessions_姓） | Postgres（workouts / workout_sets） |
| Googleドキュメント（解説） | `exercise_guides` テーブル |
| 自作のPIN認証＋署名トークン | Supabase Auth（JWT・自動更新） |
| 書き込み権限を自前で判定 | RLS が DB 側で判定 |
| 終了ボタンを押すまで未保存 | **10分ごと・入力の数秒後・画面を離れるときに自動保存** |

Apps Script のコードは削除しましたが、Git の履歴（`backend/` ディレクトリ）に残っています。
スプレッドシートと Google ドキュメントもそのまま残っているので、必要なら中身を見返せます。
