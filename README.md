# LiftLog — 筋トレ記録・サポートアプリ

静的SPA（GitHub Pages）＋ Supabase（Postgres）で動く、サーバーレスの筋トレ記録アプリ。

**公開URL: https://aenocyon13.github.io/liftlog/**

初回は設定画面が開きます。ご自身の Supabase プロジェクトURLと anon キーを入力し、
氏名・メールアドレス・4桁PINで登録すると使えるようになります。
手順は [docs/SUPABASE.md](docs/SUPABASE.md)。

- **複数ユーザー**：登録は氏名＋メールアドレス＋4桁PIN。以降は名前を選んでPINを入れるだけ
- **覗き見モード**：PINなしで他の人の記録を閲覧できる。書き込みは DB の RLS が拒否する
- **自動保存**：実施中の記録を10分ごと・入力の数秒後・画面を離れるときに保存。端末が変わっても続きから再開できる
- **UI**：Material Design 3 準拠。背景 `#FFEFB3` / 文字 `#013E37` をシードにしたトーナルパレットで、ライト・ダーク両対応
- **記録**：開始ボタン → 部位・メニュー選択 → 今回のプランを確認 → 実施 → 終了ボタンで保存
- **重量提案**：前回のセット数とレップをそのまま引き継ぎ、重量だけ自動で +2.5kg（増量幅は個人ごとに変更可）
- **休憩タイマー**：分単位で設定し、終了時にバイブと音で通知。設定値は次回に引き継がれる
- **月間レポート**：目標回数に対する達成度、部位別ボリューム、カレンダー、自己ベスト更新を可視化
- **種目解説**：Notion から取り込んだ48種目。解説・主働筋/補助筋・YouTubeリンクをボトムシートで表示

---

## システム構成

```
┌──────────────────────────────────┐
│  ブラウザ（GitHub Pages）             │
│  静的SPA / バニラJS ES Modules        │
│  · supabase-js が JWT セッションを     │
│    localStorage に保持し自動更新       │
│  · 実施中の記録は10分ごとに自動保存     │
└────────────┬─────────────────────┘
             │ supabase-js（anon キー）
             │ 認証 = Supabase Auth
             │ 権限 = RLS（行単位でDBが判定）
             ▼
┌──────────────────────────────────┐
│  Supabase（Postgres）                │
│  profiles        公開プロフィール      │
│  user_private    本人のみ（メール）     │
│  exercises       種目マスター48件       │
│  exercise_guides 解説・筋肉・動画       │
│  workouts        1行=1セッション+下書き  │
│  workout_sets    1行=1セット           │
└──────────────────────────────────┘
```

サーバーを自前で持たない構成はそのままで、データの置き場所だけ
スプレッドシート + Apps Script から Supabase に移しています。

## ディレクトリ構成

```
workout-app/
├── README.md                    このファイル
├── .github/workflows/pages.yml  frontend/ を GitHub Pages に自動デプロイ
├── supabase/
│   ├── schema.sql               テーブル・インデックス・RLSポリシー・集計ビュー
│   └── seed.sql                 種目48件と解説（Notion から取り込み）
├── frontend/                    ← GitHub Pages にそのまま置く静的サイト
│   ├── index.html               SPAのシェル（Top app bar・Navigation bar・
│   │                            ボトムシート・スナックバー・SVGアイコンスプライト）
│   ├── css/
│   │   └── style.css            Material Design 3 のトークンとコンポーネント
│   └── js/
│       ├── app.js               起動・ルート定義・セッション復元
│       ├── config.js            Supabase の URL と anon キー
│       ├── supabase.js          クライアント生成とエラーの日本語化
│       ├── auth.js              登録 / ログイン / 覗き見 / PIN変更
│       ├── db.js                データアクセスと月間レポートの集計
│       ├── progression.js       重量提案（前回引き継ぎ + 固定増量）
│       ├── autosave.js          10分ごと・入力後・離脱時の自動保存
│       ├── restTimer.js         休憩タイマー（分設定・バイブ・ビープ）
│       ├── router.js            ハッシュルーター（ログイン/権限ガード）
│       ├── state.js             アプリ状態と下書きの控え
│       ├── theme.js             ライト / ダーク / 端末追従の切り替え
│       ├── ui.js                M3コンポーネント生成 / スナックバー / シート / 書式
│       └── views/
│           ├── login.js         名前を選んでログイン / 覗き見 / 新規登録
│           ├── home.js          ホーム（開始ボタン + 今月サマリ）
│           ├── select.js        部位・メニュー選択
│           ├── confirm.js       今回のプラン（重量・セット・レップ）の確認と上書き
│           ├── session.js       実行中の記録（経過時間 / 休憩タイマー / 自動保存）
│           ├── dashboard.js     月間レポート
│           ├── guide.js         種目解説（ボトムシート & 一覧）
│           └── settings.js      アカウント・PIN・テーマ・接続設定
│
└── docs/
    ├── SUPABASE.md              セットアップ手順（ここから読む）
    ├── ALGORITHM.md             重量提案アルゴリズムの仕様
    ├── DESIGN.md                デザイン仕様（Material Design 3 / カラートークン）
    └── notion-guide-source.md   Notion から取り込んだ種目マスターの原文
```

## セットアップ

[docs/SUPABASE.md](docs/SUPABASE.md) の手順に沿って、
① Supabase プロジェクトを作る → ② `schema.sql` と `seed.sql` を流す → ③ 確認メールをオフにする
→ ④ アプリに URL と anon キーを入れる → ⑤ 氏名・メール・PINで登録、の5ステップです。

## ローカルで動かす

ES Modules を使っているため `file://` では動きません。静的サーバー経由で開いてください。

```bash
cd workout-app/frontend && python3 -m http.server 4399
```

## 設計上のポイント

| 項目 | 選択 | 理由 |
|---|---|---|
| フロント | バニラJS（ES Modules） | ビルド不要。GitHub Pages にそのまま置ける |
| デザイン | Material Design 3（トークンを手書きCSSで実装） | ライブラリ非依存のままM3の整合性を得る。詳細は [docs/DESIGN.md](docs/DESIGN.md) |
| データベース | Supabase（Postgres） | 行単位の権限制御・JWTセッション・集計SQLが使える。無料プランで収まる規模 |
| 認証 | Supabase Auth（合成アドレス＋PIN由来のパスワード） | 「名前を選んでPIN」の操作感を保ったまま、セッション管理と自動更新を任せられる |
| メールアドレス | 本人しか読めない `user_private` に分離 | anon キーは公開されるので、公開テーブルに個人を特定できる情報を置かない |
| 書き込み権限 | RLS（`auth.uid() = user_id`） | UIを迂回して直接APIを叩いても、DB が拒否する |
| 自動保存 | `workouts.draft` に丸ごと保存 | 端末のデータが消えても、別の端末からでも続きから再開できる |
| 重量提案 | 前回のセット・レップを引き継ぎ、重量のみ加算 | 迷いどころを1つ（重量）に絞る。開始時点で全セット入力済みなので、実施後は変わった所だけ直せばよい |
| 配色 | 背景 `#FFEFB3` / 文字 `#013E37` の2色からトーナルパレットを生成 | ダークは両者を入れ替えるだけ。端末設定にも追従する |
| アイコン | SVGスプライトを内蔵 | アイコンフォントのCDN依存を避け、電波の弱いジムでも欠けない |
| 進行中の記録 | サーバーに自動保存（控えは localStorage） | 端末のデータが消えても、別の端末からでも続きから再開できる |
| 解説マスター | `exercise_guides` テーブル | Notion から取り込み、Supabase の表画面で編集できる |
