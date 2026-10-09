/**
 * progression.js — 次回の重量とセット構成の決定
 *
 * 方式: 前回実績のキャリーオーバー + 固定増量
 *   セット数とレップ数は前回のまま、重量だけ一定量（既定 2.5kg）上げる。
 *   ワークアウト開始時点で重量もレップも入力済みになるので、
 *   実施後は変わった箇所だけ直せばよい。
 *
 * GAS から移した純粋な関数。副作用が無いので Node でそのままテストできる。
 */

export const round2 = (v) => Math.round(v * 100) / 100;

/** 作業セットから「メインセット重量」を決める（最頻値、同数なら重い方） */
export function detectWorkingWeight(workSets) {
  if (!workSets || !workSets.length) return 0;
  const count = new Map();
  workSets.forEach((s) => count.set(s.weight, (count.get(s.weight) || 0) + 1));
  let best = null, bestCount = -1;
  for (const [w, c] of count) {
    if (c > bestCount || (c === bestCount && w > best)) { best = w; bestCount = c; }
  }
  return best;
}

export const epley1RM = (weight, reps) =>
  (!weight || !reps) ? 0 : Math.round(weight * (1 + reps / 30) * 10) / 10;

const fmtKg = (v) => (Math.round(v * 100) % 100 === 0) ? String(Math.round(v)) : String(round2(v));

/**
 * @param {Array}  history   新しい順のセッション配列 [{date, workSets:[{setNo,weight,reps,rpe}]}]
 * @param {Object} conf      { part, name, repMin, repMax, defaultSets }
 * @param {number} increment 前回比で足す重量(kg)
 */
export function suggestNextLoad(history, conf, increment) {
  const inc = Number(increment) > 0 ? Number(increment) : 2.5;
  const repMin = Number(conf.repMin) || 8;
  const repMax = Number(conf.repMax) || 12;

  const base = {
    part: conf.part, menu: conf.name,
    increment: inc, weightStep: inc,
    targetRepMin: repMin, targetRepMax: repMax,
    algorithm: 'carry-over+fixed-increment'
  };

  const last = history && history.length ? history[0] : null;
  const work = last ? last.workSets : null;

  if (!work || !work.length) {
    const n = Number(conf.defaultSets) || 3;
    return {
      ...base,
      status: 'no_history',
      headline: '初回',
      baseWeight: null,
      recommendedWeight: null,
      finalWeight: null,
      delta: 0,
      lastSummary: null,
      plan: Array.from({ length: n }, (_, i) => ({ setNo: i + 1, weight: null, reps: repMin })),
      reason: `この種目の履歴がまだありません。${repMin}〜${repMax}レップを全セットこなせる重量を`
            + `入力してください。次回からは前回の実績をそのまま引き継ぎ、重量だけ +${fmtKg(inc)}kg して提案します。`
    };
  }

  const W = detectWorkingWeight(work);
  const newWeight = round2(W + inc);
  const reps = work.map((s) => s.reps);
  const rpes = work.map((s) => s.rpe).filter((r) => r != null && r > 0);
  const avgRpe = rpes.length
    ? Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10 : null;
  const totalVolume = work.reduce((a, s) => a + s.weight * s.reps, 0);

  return {
    ...base,
    status: 'carry_over',
    headline: `前回 +${fmtKg(inc)}kg`,
    baseWeight: W,
    recommendedWeight: newWeight,
    finalWeight: newWeight,
    delta: inc,
    lastSummary: {
      date: last.date, weight: W, sets: work.length, reps, avgRpe,
      totalVolume: Math.round(totalVolume * 10) / 10,
      est1RM: Math.max(...work.map((s) => epley1RM(s.weight, s.reps)))
    },
    // セットごとに加算するので、ドロップセットのような構成もそのまま保たれる
    plan: work.map((s, i) => ({
      setNo: i + 1,
      weight: round2(s.weight + inc),
      reps: s.reps,
      prevWeight: s.weight,
      prevReps: s.reps
    })),
    reason: `前回 ${last.date} は ${fmtKg(W)}kg × ${reps.join('/')}レップ（${work.length}セット）でした。`
          + `セット数とレップはそのまま引き継ぎ、重量だけ +${fmtKg(inc)}kg した ${fmtKg(newWeight)}kg を`
          + `今回のプランにしています。きつい場合はこの画面で重量を下げてから開始してください。`
  };
}
