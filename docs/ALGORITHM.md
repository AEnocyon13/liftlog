# 重量提案アルゴリズム仕様

実装: [`backend/Progression.gs`](../backend/Progression.gs) の `suggestNextLoad_()`

方式は **前回実績のキャリーオーバー + 固定増量**。

> 前回と同じ 部位×種目 の実績を読み、**セット数とレップ数はそのまま引き継ぎ、重量だけ一定量（既定 2.5kg）上げる**。
> ワークアウト開始時点で重量もレップも入力済みの状態になるので、実施後は変わった箇所だけ直せばよい。

---

## 入力

| 記号 | 取得元 | 説明 |
|---|---|---|
| `history` | `Logs_<姓>` シート | 同一 部位×種目 の直近6セッション（新しい順、セッション単位に集約済み） |
| `increment` | Users シートの `weightIncrement` | 前回比で足す重量(kg)。既定 2.5、ユーザーごとに変更可 |
| `repMin` / `repMax` | Menus シート | 履歴が無い種目で表示する目標レップ範囲 |
| `defaultSets` | Menus シート | 履歴が無い種目の初期セット数 |
| `manualWeight` / `manualDelta` | ユーザー操作 | 手動上書き |

## 処理

```
last = history[0]（前回セッション）

履歴が無い場合 → status = 'no_history'
  ・重量は null（手入力を促す）
  ・plan は defaultSets 本、レップは repMin

履歴がある場合 → status = 'carry_over'
  W = 前回のメインセット重量（作業セットの最頻値。同数なら重い方）
  推奨重量 = W + increment

  plan[i] = {
    weight : 前回セット i の重量 + increment,   ← セットごとに個別に加算
    reps   : 前回セット i のレップ（そのまま）,
    prevWeight, prevReps                        ← UI に「前回 80kg × 10」と表示するため
  }
```

セットごとに `+increment` しているのは、ドロップセットのように重量が揃っていない構成でも
前回の形をそのまま維持するため。全セット同じ重量なら、結果は「全部 +2.5kg」と同じになる。

ウォームアップ（`isWarmup = TRUE`）のセットは履歴から除外され、引き継ぎの対象にならない。

## 手動上書き

アルゴリズムの結果は `recommendedWeight`、ユーザー確定値は `finalWeight` として分けて保持する。

| 入力 | 結果 |
|---|---|
| `manualWeight` 指定 | `finalWeight = round(manualWeight, 0.25)` |
| `manualDelta` 指定 | `finalWeight = recommendedWeight + manualDelta` |
| どちらも無し | `finalWeight = recommendedWeight` |

確認画面（今回のプラン）では次の操作で上書きできる。

- **± ボタン / 数値入力** … メイン重量を変更する。差分は plan の各セットにも同じだけ反映される
- **セット数 ± ** … plan の行を増減する（増やすと最後の行を複製）
- **各行のレップ入力** … そのセットだけレップを変える

## 出力

```json
{
  "status": "carry_over | no_history",
  "headline": "前回 +2.5kg",
  "increment": 2.5,
  "baseWeight": 80,
  "recommendedWeight": 82.5,
  "finalWeight": 82.5,
  "plan": [
    { "setNo": 1, "weight": 82.5, "reps": 10, "prevWeight": 80, "prevReps": 10 },
    { "setNo": 2, "weight": 82.5, "reps": 9,  "prevWeight": 80, "prevReps": 9 },
    { "setNo": 3, "weight": 82.5, "reps": 8,  "prevWeight": 80, "prevReps": 8 }
  ],
  "lastSummary": { "date": "2026-09-17", "weight": 80, "sets": 3, "reps": [10,9,8], "avgRpe": 8 },
  "reason": "前回 2026-09-17 は 80kg × 10/9/8レップ（3セット）でした。…",
  "est1RMAtTarget": 110,
  "projectedVolume": 2227.5
}
```

`reason` には根拠を日本語で組み立てて入れており、UI では常に表示する。

## 動作確認

GASエディタで `testProgression()` を実行すると、シート無しで4ケースを確認できる。
実行結果（increment = 2.5kg）:

| ケース | 結果 |
|---|---|
| 前回 60kg 10/9/8 | 62.5kg / plan 62.5×10, 62.5×9, 62.5×8 |
| 前回 40kg 12/12/11/10（4セット） | 42.5kg / 4セットのまま引き継ぎ |
| 前回 60,60,50kg（ドロップ） | 62.5 / 62.5 / 52.5kg に各 +2.5kg |
| 履歴なし | `no_history`（重量は手入力） |

## 以前の方式について

v1 ではダブルプログレッション（レップが上限に達したら増量）+ RPE 補正 + ディロード判定を実装していたが、
「前回のセット数・レップのまま重量だけ上げる」という運用に合わせて v2 で置き換えた。
RPE は引き続きセット単位で記録でき、`Logs_<姓>` シートに残るが、提案の計算には使っていない。
