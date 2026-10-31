# デザイン仕様（ダーク × ネオン）

ジムは暗い。画面を明るくする理由がない。だから下地はほぼ黒にして、
**いま必要な数字だけをネオンで光らせる**という組み立てにしている。

実装は [Material Design 3](https://m3.material.io/) のトークン構造の上に載せている。
ライブラリは使わず、トークンを CSS カスタムプロパティとして定義し、コンポーネントは手書き
（ビルド不要・バンドル作業ゼロを維持するため）。
実装は [`frontend/css/style.css`](../frontend/css/style.css) の1ファイルに集約されている。

---

## 1. カラー

### 役割を1つずつ割り当てる

色の意味を固定すると、画面を見た瞬間に読める。

| 色 | 役割 | ダーク | ライト（線・文字） |
|---|---|---|---|
| ライム | **いま・達成** | `#C8FF3D` | `#4C7A00` |
| シアン | **過去・情報** | `#2EE6FF` | `#00647F` |
| マゼンタ | **自己ベスト・注意** | `#FF2E92` | `#B0005F` |
| アンバー | **休憩** | `#FFB02E` | `#7A5200` |

**塗りは両テーマで同じネオンを使い、線と文字だけ地に合わせて暗い対比色に置き換える。**
白地の上でネオンの線は読めないが、ネオンの塗りに暗い文字を乗せるのは読める。
この使い分けを `--ll-accent`（塗り）と `--ll-accent-line`（線・文字）の2系統で持っている。

### 下地

| ロール | ダーク | ライト |
|---|---|---|
| `surface` | `#06070A` | `#F3F5FA` |
| `on-surface` | `#E9EEF7` | `#11141B` |
| `surface-container` | `#11141B` | `#EEF1F7` |
| `outline` / `outline-variant` | `#5F6878` / `#272E3C` | `#7C8699` / `#CDD4DF` |

無彩色にはわずかに青を混ぜている（純粋な灰色は冷たさが出ない）。
ダークでは `body::after` に微細なノイズを重ねて、のっぺりした黒を避けている。

### 主ボタン

ライトでは `primary` を**ほぼ黒**、`on-primary` を**ネオンライム**にしている。
白地の上でも「黒い錠剤にネオンの文字」としてブランドの対が残る。
ダークではそのまま反転してライムの塗りに黒い文字。

### テーマの切り替え

`:root[data-theme]` に `light` / `dark` / `system` を入れて切り替える。
`system` は `prefers-color-scheme` に追従する。
初期値は `index.html` の先頭のインラインスクリプトで `localStorage` から復元し、ちらつきを防いでいる。

---

## 1.5 3D

Three.js を CDN から読み、4か所で使っている（[`frontend/js/scenes.js`](../frontend/js/scenes.js)）。
**モデルファイルも画像ファイルも使わず、すべてコードで形を作っている。**

| 場所 | 中身 | 役割 |
|---|---|---|
| ホームの背景 | ネオンのグリッドの上で振れるバーベル | 飾り。触らなくてよい |
| 部位選択 | 筋肉ごとに作った人体 | 道具。回して、鍛える部位をタップする |
| ワークアウト完了 | プレートが弾けて衝撃波が広がる | 3秒で消す。毎回見るものは長くしない |
| レポート | 直近6ヶ月を立体の棒で | 2Dの棒グラフの置き換え |

### 人体の作り方

箱や球の寄せ集めでは筋肉に見えない。
`loft()` で**断面（輪切り）を数枚重ねて面を張り**、大胸筋・広背筋・僧帽筋・三角筋・
上腕二頭／三頭・前腕・腹直筋・外腹斜筋・大腿四頭筋・ハムストリングス・腓腹筋・大臀筋を
それぞれ独立した形として置いている。断面の角ばり具合（`shape`）も指定でき、
板状の筋肉（胸・背中）は角を立て、筒状の筋肉（腕・脚）は楕円に近づけている。
比率は実際のトップビルダーのもので、肩幅は身長の約0.30。

### 電池への配慮

- 画面に映っていないシーンは `IntersectionObserver` で描画を止める
- 画面を離れるときはルーターの `teardown` で破棄する
- ピクセル比は 2 で頭打ち
- 端末が「動きを減らす」設定なら出さない（`prefers-reduced-motion`）
- 設定画面の「3Dの演出」で手動でも切れる。切ると2Dの表示に落ちる

---

---

## 2. タイポグラフィ

M3 のタイプスケールを土台に、2書体で組んでいる。

| 用途 | 書体 |
|---|---|
| 数字・見出し（`.num` / `.md-display-*` / `.md-headline-*` / `.ll-timer` など） | **Saira Condensed** 600・700 |
| 本文・ラベル | **Noto Sans JP** 400・500・700 |

数字を圧縮した書体にしているのは、重量計の表示に寄せるため。
Saira Condensed には日本語の字が無いので、かなと漢字は自動的に Noto Sans JP に落ちる。
Webフォントが落ちた場合はシステムのサンセリフにフォールバックする。

数値には `font-variant-numeric: tabular-nums` を当て、重量やレップが桁ごとにガタつかないようにしている。
小見出し（`.md-section-header`）は字間を `.2em` 開けたラベル扱い。

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
| Text field (ログイン) | `.ll-login` | 名前の選択と4桁PIN。PIN欄は字間を広げた専用スタイル |
| 休憩タイマー | `.ll-rest` | 実行中はトップアプリバー直下に sticky で固定。作動中は primary の枠線、終了時は primary-container に反転して点滅 |
| 今回のプラン | `.ll-plan` | セットごとの「重量 × レップ」。前回値を右端に添える |
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
