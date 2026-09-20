# LiftLog — 筋トレ記録・サポートアプリ

静的SPA（GitHub Pages）＋ Google Apps Script（API）＋ スプレッドシート／ドキュメント（DB）で動く、
サーバーレスの筋トレ記録アプリ。

**公開URL: https://aenocyon13.github.io/liftlog/**

初回は設定画面が開きます。ご自身の GAS ウェブアプリ URL と API キーを入力すると使えるようになります
（入力値はそのブラウザの localStorage にのみ保存され、どこにも送信されません）。手順は [docs/SETUP.md](docs/SETUP.md)。

- **UI**：Material Design 3 準拠。背景 `#FFEFB3` / 文字 `#013E37` をシードにしたトーナルパレットで、ライト・ダーク両対応
- **記録**：開始ボタン → 部位・メニュー選択 → 推奨重量を確認 → 実施 → 終了ボタンでスプレッドシートに書き込み
- **重量提案**：前回実績から「ダブルプログレッション + RPE補正」で今回の推奨重量を自動算出（手動上書き可）
- **月間レポート**：目標回数に対する達成度、部位別ボリューム、カレンダー、自己ベスト更新を可視化
- **種目解説**：Googleドキュメントに書いた解説とYouTubeリンクをモーダル表示

---

## システム構成

```
┌─────────────────────────────┐
│  ブラウザ（GitHub Pages）      │
│  静的SPA / バニラJS ES Modules │
│  · localStorage に接続設定と    │
│    実施中ワークアウトを保持      │
└──────────┬──────────────────┘
           │ fetch（GET: 参照 / POST: 更新）
           │ ・POSTは Content-Type: text/plain（CORSプリフライト回避）
           │ ・全リクエストに共有シークレット key を付与
           ▼
┌─────────────────────────────┐
│  Google Apps Script Web アプリ │
│  doGet / doPost → ルーティング  │
│  · 認証（APIキー照合）          │
│  · 重量提案アルゴリズム         │
│  · 月間集計                    │
└────┬───────────────┬────────┘
     │               │
     ▼               ▼
┌──────────┐   ┌──────────────┐
│ スプレッド  │   │ ドキュメント    │
│ シート     │   │ （解説マスター） │
│ Logs      │   │ 見出し1=部位    │
│ Sessions  │   │ 見出し2=種目    │
│ Menus     │   │ 本文=ラベル行   │
│ Settings  │   └──────────────┘
└──────────┘
```

## ディレクトリ構成

```
workout-app/
├── README.md                    このファイル
├── .github/workflows/pages.yml  frontend/ を GitHub Pages に自動デプロイ
├── frontend/                    ← GitHub Pages にそのまま置く静的サイト
│   ├── index.html               SPAのシェル（Top app bar・Navigation bar・
│   │                            ボトムシート・スナックバー・SVGアイコンスプライト）
│   ├── css/
│   │   └── style.css            Material Design 3 のトークンとコンポーネント
│   └── js/
│       ├── app.js               起動・ルート定義・初期データ読み込み
│       ├── router.js            ハッシュルーター（画面遷移とリスナー破棄）
│       ├── api.js               GAS Web API クライアント（設定はlocalStorage）
│       ├── state.js             アプリ状態 + 実施中ワークアウトの下書き保存
│       ├── theme.js             ライト / ダーク / 端末追従の切り替え
│       ├── ui.js                M3コンポーネント生成 / スナックバー / シート / 書式
│       └── views/
│           ├── home.js          ホーム（開始ボタン + 今月サマリ）
│           ├── select.js        部位・メニュー選択
│           ├── confirm.js       推奨重量の提示と確定（± 手動上書き）
│           ├── session.js       ワークアウト実行中の記録（タイマー/セット入力）
│           ├── dashboard.js     月間レポート
│           ├── guide.js         種目解説（モーダル & 一覧）
│           └── settings.js      接続設定・トレーニング設定
│
├── backend/                     ← Apps Script プロジェクトに貼り付ける
│   ├── appsscript.json          マニフェスト（スコープ / Webアプリ設定）
│   ├── Config.gs                プロパティ・シート定義・既定設定
│   ├── Code.gs                  doGet/doPost・ルーティング・認証
│   ├── SheetRepo.gs             スプレッドシート読み書き
│   ├── DocRepo.gs               解説ドキュメントのパース
│   ├── Progression.gs           重量提案アルゴリズム
│   ├── Dashboard.gs             月間集計
│   └── Setup.gs                 初期セットアップ / セルフテスト
│
└── docs/
    ├── SETUP.md                 セットアップとデプロイ手順（ここから読む）
    ├── DESIGN.md                デザイン仕様（Material Design 3 / カラートークン）
    ├── SPREADSHEET_SCHEMA.md    シート定義
    ├── DOC_FORMAT.md            解説ドキュメントのフォーマット定義
    ├── ALGORITHM.md             重量提案アルゴリズムの仕様
    └── API.md                   Web API リファレンス
```

## セットアップ

[docs/SETUP.md](docs/SETUP.md) の手順に沿って、
① スプレッドシートとドキュメントを作る → ② GASにコードを貼ってデプロイ → ③ フロントの設定画面にURLとキーを入力、
の3ステップで動きます。

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
| 配色 | 背景 `#FFEFB3` / 文字 `#013E37` の2色からトーナルパレットを生成 | ダークは両者を入れ替えるだけ。端末設定にも追従する |
| アイコン | SVGスプライトを内蔵 | アイコンフォントのCDN依存を避け、電波の弱いジムでも欠けない |
| 認証 | 共有シークレットキー | GASのWebアプリは「全員」公開が前提。URLが漏れても叩かれないようにする |
| POSTのContent-Type | `text/plain` | `application/json` だとCORSプリフライトが飛び、GASは応答できない |
| 日付 | `yyyy-MM-dd` の文字列で保存 | シートのロケール・タイムゾーンによる日付ズレを防ぐ |
| 進行中の記録 | localStorage に自動保存 | ジムで画面を閉じても復帰できる |
| 解説マスター | Googleドキュメント（見出し構造） | Docs上で人間が読み書きしやすく、JSONのような構文崩れが起きない |
