# 重量提案アルゴリズム仕様

実装：[`backend/Progression.gs`](../backend/Progression.gs) の `suggestNextLoad_()`

方式は **ダブルプログレッション（重量とレップの二段階漸進） + RPE補正**。
「レップが目標レンジの上限に届くまでは重量を据え置いてレップを伸ばし、
上限に届いたら重量を上げてレップをリセットする」という古典的で破綻しにくい進め方に、
主観的強度（RPE）による増加幅の調整を足したもの。

---

## 入力

| 記号 | 取得元 | 説明 |
|---|---|---|
| `history` | Logs シート | 同一 部位×種目 の直近6セッション（新しい順、セッション単位に集約済み） |
| `repMin` / `repMax` | Menus シート | 目標レップ下限・上限 |
| `baseIncrement` | Menus シート | 増量時の基準増加量 kg |
| `weightStep` | Menus シート | 実際に扱える最小刻み kg |
| `deloadRate` / `deloadAfterFails` | Settings シート | ディロード率・発動回数 |
| `manualDelta` / `manualWeight` | ユーザー操作 | 手動上書き |

## 前処理

1. `last = history[0]`（前回セッション）。無ければ **`no_history`** を返して終了。
2. `isWarmup = TRUE` のセットを除外して作業セットを取る。
3. **メインセット重量 `W`** を決める＝作業セット中で最も多く使われた重量（同数なら重い方）。
   これにより、ドロップセットや1本だけ重い試技があっても基準がぶれない。
4. `W` と同じ重量のセット群 `setsAtW` を評価対象とする。
5. `avgRPE` = `setsAtW` に記録されたRPEの平均（記録が無ければ `null`）。

## RPE係数

```
avgRPE ≤ 7.0            → factor = 1.5   まだ余裕がある。大きめに伸ばす
7.0 < avgRPE ≤ 8.5      → factor = 1.0   適正。標準の刻み
8.5 < avgRPE ≤ 9.5      → factor = 0.5   きつい。刻みを半分に
9.5 < avgRPE            → factor = 0.0   限界。重量は据え置き
avgRPE が未記録          → factor = 1.0
```

しきい値は Settings シートの `rpeEasyThreshold` / `rpeNormalThreshold` / `rpeHardThreshold` で変更可能。

## 分岐

```
判定A: setsAtW の全セットが repMax 以上か？
├─ YES ──→ factor > 0 ?
│           ├─ YES → status = increase
│           │        増加量 = round(baseIncrement × factor, weightStep)
│           │        （0 に丸められた場合は最小刻み weightStep を採用）
│           │        推奨重量 = W + 増加量
│           │        目標レップ = repMin（リセット）
│           └─ NO  → status = hold        （RPEが限界域。重量据え置き）
│
└─ NO ───→ 判定B: setsAtW の全セットが repMin 以上か？
            ├─ YES → status = add_reps
            │        推奨重量 = W（据え置き）
            │        目標レップ = min(前回最大レップ + 1, repMax)
            │
            └─ NO  → 判定C: repMin 未達が何セッション連続しているか（failStreak）
                     ├─ failStreak ≥ deloadAfterFails → status = deload
                     │        推奨重量 = floor(W × (1 − deloadRate), weightStep)
                     │        目標レップ = repMin
                     └─ それ以外                      → status = hold
                              推奨重量 = W（同じ重量で再挑戦）
```

`failStreak` は `history` を新しい順に辿り、「そのセッションのメインセット重量で `repMin` を全セットクリアできていない」
が続いた回数。1回でもクリアした時点で打ち切る。

## 丸め

```
roundToStep(v, step, mode) = ( mode==='floor' ? floor(v/step)
                             : mode==='ceil'  ? ceil(v/step)
                             :                  round(v/step) ) × step
```

- 増量時は `nearest`（最も近い刻み）
- ディロード時は `floor`（切り下げ＝安全側）。切り下げた結果 `W` 以上になる異常時は `W − step` を採用

## 手動上書き

アルゴリズムの結果は `recommendedWeight`、ユーザー確定値は `finalWeight` として分けて保持する。

| 入力 | 結果 |
|---|---|
| `manualWeight` 指定 | `finalWeight = round(manualWeight, 0.25)` |
| `manualDelta` 指定 | `finalWeight = recommendedWeight + manualDelta` |
| どちらも無し | `finalWeight = recommendedWeight` |

UI では `±weightStep` ボタン、`±2×weightStep` のクイックチップ、数値直接入力、
「提案値に戻す」の4通りで上書きできる。上書きしても提案の根拠文は残るため、判断の材料が消えない。

## 出力

```json
{
  "status": "increase | add_reps | hold | deload | no_history",
  "headline": "増量",
  "baseWeight": 80,
  "recommendedWeight": 82.5,
  "finalWeight": 82.5,
  "delta": 2.5,
  "targetReps": "8〜12",
  "targetRepMin": 8, "targetRepMax": 12,
  "recommendedSets": 4,
  "weightStep": 2.5, "baseIncrement": 2.5,
  "avgRpe": 8, "rpeFactor": 1, "rpeLabel": "適正",
  "reason": "前回 2026-09-03 に 80kg × 4セットすべてで上限 12レップを達成しました。…",
  "lastSummary": { "date": "2026-09-03", "weight": 80, "sets": 4, "reps": [12,12,12,12], "avgRpe": 8, "est1RM": 112 },
  "deltaOptions": [-5, -2.5, 0, 2.5, 5],
  "est1RMAtTarget": 104.5,
  "projectedVolume": 2640
}
```

`reason` には「何を根拠に、どう計算して、なぜその数字になったか」を日本語で組み立てて入れている。
提案をそのまま飲むかどうかをユーザーが判断できるようにするため、UIでは常にこの文を表示する。

## 動作確認

GASエディタで `testProgression()` を実行すると、シート無しで7ケースの分岐を確認できる。
実行結果（`baseIncrement=2.5, weightStep=2.5, repMin=8, repMax=12, W=60kg` の場合）：

| ケース | 結果 |
|---|---|
| 全セット12レップ / RPE 8 | `increase` 62.5kg（+2.5） |
| 全セット12レップ / RPE 6.5 | `increase` 65kg（+5、係数1.5） |
| 全セット12レップ / RPE 9.8 | `hold` 60kg（限界域のため据え置き） |
| 10/9/9レップ / RPE 8 | `add_reps` 60kg・目標11レップ |
| 7/6/5レップ（1回目） | `hold` 60kg |
| 7/6/5レップ（2回連続） | `deload` 52.5kg（−10%を切り下げ） |
| 履歴なし | `no_history`（手動入力を促す） |

## 意図的に採用しなかった方式

| 方式 | 不採用の理由 |
|---|---|
| 推定1RMの◯%を提示 | レップ数の記録精度に結果が強く依存する。特に高レップ域でEpley式の誤差が大きい |
| 毎回固定量アップ（線形） | 中級者以降ですぐ頭打ちになり、失敗の連続でモチベーションを削る |
| 前回比の自動％増 | 種目ごとの絶対重量差を無視するため、小さい種目で刻みが非現実的になる |

なお `Progression.gs` は入出力が閉じた純粋な関数として実装してあるため、
別方式を試したい場合は `suggestNextLoad_()` を差し替えるだけで済む。
