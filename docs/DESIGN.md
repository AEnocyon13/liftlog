# デザイン仕様（Material Design 3）

UI は [Material Design 3](https://m3.material.io/) に準拠している。
Material Web components などのライブラリは使わず、**M3 のデザイントークンを CSS カスタムプロパティとして定義し、
コンポーネントを手書きで実装**している（ビルド不要・CDN依存ゼロを維持するため）。

実装は [`frontend/css/style.css`](../frontend/css/style.css) の1ファイルに集約されている。

---

## 1. カラー

### シード色

| 役割 | 値 | M3トーン |
|---|---|---|
| 背景 | `#FFEFB3` | CREAM パレットの **T94** |
| 文字 | `#013E37` | TEAL パレットの **T22** |

この2色をシードとして CIELAB 空間で明度を振り、色相と彩度を保ったままトーナルパレットを生成した
（ガマット外になるトーンは彩度を落として収めている）。生成結果は `:root` の `--md-ref-teal-*` /
`--md-ref-cream-*` として定義されている。

```
TEAL   T10 #00201C  T22 #013E37(seed)  T30 #184F47  T35 #265B53  T50 #4C8078  T80 #9AD1C7
CREAM  T20 #373100  T50 #837741  T80 #D5C68C  T85 #E4D49A  T94 #FFEFB3(seed)  T98 #FFF9E8
```

### ライト / ダークの対応

ダークは **背景と文字の役割をそのまま入れ替える**方針で組んでいる。

| ロール | ライト | ダーク |
|---|---|---|
| `surface` / `on-surface` | CREAM T94 `#FFEFB3` / TEAL T22 `#013E37` | TEAL T22 `#013E37` / CREAM T94 `#FFEFB3` |
| `primary` / `on-primary` | TEAL T22 / CREAM T94 | CREAM T94 / TEAL T22 |
| `primary-container` | CREAM T80 | TEAL T30 |
| `secondary-container` | CREAM T85 | TEAL T35 |
| `surface-container-low` → `-highest` | CREAM T96 → T88 | TEAL T17 → T35 |
| `outline` / `outline-variant` | CREAM T50 / T80 | TEAL T50 / T30 |
| `inverse-surface` | TEAL T22 | CREAM T94 |

テキストは常に TEAL 系のトーン、面・境界線は CREAM 系のトーンに割り当てており、
2色以外の色を使うのは `error` ロールのみ（M3標準の赤を semantics のために残している）。

`secondary-container` は Navigation bar の選択インジケーターに使われるため、
バー自体の背景（`surface-container`）と明度差が出るトーンを選んでいる。

### テーマの切り替え

`<html data-theme="light | dark | system">` で切り替える（[`frontend/js/theme.js`](../frontend/js/theme.js)）。

- 既定は `system`（`prefers-color-scheme` に追従）
- 選択は localStorage に保存し、`<head>` のインラインスクリプトで CSS 適用前に反映してちらつきを防ぐ
- 切り替え時に `<meta name="theme-color">` も現在の `surface` に同期する

---

## 2. タイポグラフィ

M3 のタイプスケールをそのまま実装している（`.md-display-*` / `.md-headline-*` / `.md-title-*` /
`.md-body-*` / `.md-label-*`）。書体は M3 標準の **Roboto** に日本語用の **Noto Sans JP** を重ねている。
Webフォントが落ちた場合はシステムのサンセリフにフォールバックする。

数値表示には `font-variant-numeric: tabular-nums`（`.num`）を当て、重量やレップが桁ごとにガタつかないようにしている。

---

## 3. 形状・エレベーション・状態

| トークン | 値 | 主な用途 |
|---|---|---|
| `--md-sys-shape-corner-extra-small` | 4px | テキストフィールド、スナックバー |
| `--md-sys-shape-corner-small` | 8px | チップ、カレンダーのセル |
| `--md-sys-shape-corner-medium` | 12px | カード、リストアイテム |
| `--md-sys-shape-corner-large` | 16px | Extended FAB |
| `--md-sys-shape-corner-extra-large` | 28px | ボトムシート |
| `--md-sys-shape-corner-full` | 9999px | ボタン、ナビゲーションのインジケーター |

エレベーションは M3 の Level 0〜5 の2段重ねシャドウを `--md-sys-elevation-*` として定義。

状態レイヤーは M3 規定の不透明度（hover 8% / focus 10% / pressed 10%）を `.md-state` クラスで適用する。
`::after` に `currentColor` を重ねる方式なので、どのコンテナ色の上でも自然に効く。

モーションは `--md-sys-motion-easing-standard` / `-emphasized` と short4/medium2/long2 のデュレーションを使用。
`prefers-reduced-motion: reduce` の環境ではすべてのアニメーションを無効化している。

---

## 4. 実装しているコンポーネント

| M3 コンポーネント | クラス | 使用箇所 |
|---|---|---|
| Top app bar (small) | `.md-top-app-bar` | 全画面。スクロールで `surface-container` に持ち上がる |
| Navigation bar | `.md-navigation-bar` | 下部4タブ。選択項目にピル型インジケーター |
| Extended FAB | `.md-fab-extended` | ホームの「ワークアウト開始 / 再開」 |
| Common buttons | `.md-button--filled / --tonal / --outlined / --elevated / --text` | 全画面 |
| Icon button | `.md-icon-button` | 解説を開く、セット削除 |
| Segmented button | `.md-segmented` | テーマ切替、月の前後移動 |
| Cards (elevated / filled / outlined) | `.md-card--elevated / --filled / --outlined` | 全画面 |
| Chips (filter / assist) | `.md-chip` | 部位選択、ステータス表示、±クイック調整 |
| Text fields (outlined) | `.md-field` | 設定、セット入力、メモ |
| Lists | `.md-list-item` | メニュー選択、解説一覧、記録一覧 |
| Progress indicators | `.md-circular-progress` / `.md-linear-progress` | 達成度リング、部位別ボリューム |
| Switch | `.md-switch` | （予備） |
| Bottom sheet / Dialog | `.md-sheet` / `.md-dialog__*` | 種目解説、確認ダイアログ |
| Snackbar | `.md-snackbar` | 保存完了・エラー通知 |
| Divider | `.md-divider` | カード内の区切り |

アプリ固有の組み合わせ（統計タイル、提案カード、セット入力グリッド、カレンダー）は
`.ll-` 接頭辞で分けており、M3 のトークンのみを参照している。

---

## 5. アイコン

Material Symbols のフォントは読み込まず、**必要なアイコンだけを SVG スプライトとして
[`frontend/index.html`](../frontend/index.html) に内蔵**している。

```html
<svg style="display:none"><symbol id="i-play" viewBox="0 0 24 24"><path d="…"/></symbol>…</svg>
```

JS 側からは `icon('play')` ヘルパーで `<use href="#i-play">` を出力する。
ジムなど電波の弱い環境でアイコンが欠けたり、ligature のテキストがそのまま表示されたりするのを避けるため。

---

## 6. アクセシビリティ

- タップ領域は M3 の最小 48×48dp を満たす（ボタン高40px + 状態レイヤー、アイコンボタンは48px）
- `:focus-visible` に `secondary` 色の3pxアウトラインを付与
- ナビゲーションの現在地に `aria-current="page"`、進捗に `role="progressbar"` と `aria-valuenow`
- スナックバーは `role="status" aria-live="polite"`
- 主要な配色のコントラスト比（実測値）。すべて WCAG AA（4.5:1）以上、本文は AAA（7:1）以上。

| 組み合わせ | 比 |
|---|---|
| 本文 TEAL T22 on CREAM T94（ライト／ダークとも同値） | 10.46:1 |
| `on-surface-variant` — ライト / ダーク | 6.75:1 / 7.04:1 |
| Extended FAB のラベル — ライト / ダーク | 8.85:1 / 7.21:1 |
| Navigation bar の選択インジケーター — ライト / ダーク | 9.74:1 / 6.00:1 |
| `error` — ライト / ダーク | 5.61:1 / 7.09:1 |
