/**
 * Progression.gs — 次回の重量とセット構成の決定
 *
 * 方式: 前回実績のキャリーオーバー + 固定増量
 *
 *   前回と同じ 部位×種目 の実績を読み、
 *     ・セット数     … 前回と同じ
 *     ・各セットのレップ … 前回と同じ（セット単位でそのまま引き継ぐ）
 *     ・重量         … 前回の重量 + 増量幅（既定 2.5kg / 個人設定で変更可）
 *   を今回のプランとして返す。ワークアウト開始時点で重量とレップが
 *   入力済みの状態になるため、実施後は変わった箇所だけ直せばよい。
 *
 *   履歴が無い種目は重量を手入力してもらう（status = 'no_history'）。
 */

/** 指定した刻みに丸める。mode: 'nearest' | 'floor' | 'ceil' */
function roundToStep_(value, step, mode) {
  if (!step || step <= 0) step = 0.25;
  var q = value / step;
  var r;
  if (mode === 'floor') r = Math.floor(q + 1e-9);
  else if (mode === 'ceil') r = Math.ceil(q - 1e-9);
  else r = Math.round(q);
  return Math.round(r * step * 100) / 100;
}

/**
 * @param {Array}  history  readMenuHistory_ の戻り値（新しい順）
 * @param {Object} conf     findMenuConfig_ の戻り値
 * @param {Object} settings getSettings_ の戻り値
 * @param {Object} user     ログイン中のユーザー（weightIncrement を使う）
 * @param {Object} opts     { manualWeight, manualDelta, sets }
 */
function suggestNextLoad_(history, conf, settings, user, opts) {
  opts = opts || {};
  var inc = num_(opts.increment, null);
  if (inc === null) inc = num_(user && user.weightIncrement, num_(settings.defaultWeightIncrement, 2.5));
  var repMin = num_(conf.repMin, settings.defaultRepMin) || 8;
  var repMax = num_(conf.repMax, settings.defaultRepMax) || 12;

  var result = {
    part: conf.part,
    menu: conf.menu,
    increment: inc,
    weightStep: inc,
    targetRepMin: repMin,
    targetRepMax: repMax,
    algorithm: 'carry-over+fixed-increment'
  };

  var last = (history && history.length) ? history[0] : null;
  var lastWork = last ? last.workSets : null;

  if (!lastWork || !lastWork.length) {
    var n = num_(opts.sets, conf.defaultSets) || 3;
    result.status = 'no_history';
    result.headline = '初回';
    result.baseWeight = null;
    result.recommendedWeight = null;
    result.delta = 0;
    result.lastSummary = null;
    result.plan = [];
    for (var i = 0; i < n; i++) {
      result.plan.push({ setNo: i + 1, weight: null, reps: repMin });
    }
    result.reason = 'この種目の履歴がまだありません。' + repMin + '〜' + repMax +
      'レップを全セットこなせる重量を入力してください。次回からは前回の実績をそのまま引き継ぎ、重量だけ +' +
      inc + 'kg して提案します。';
    result.finalWeight = num_(opts.manualWeight, null);
    return result;
  }

  // --- 前回のメインセット重量 ---
  var W = detectWorkingWeight_(lastWork);
  var newWeight = Math.round((W + inc) * 100) / 100;

  result.status = 'carry_over';
  result.headline = '前回 +' + fmtKg_(inc) + 'kg';
  result.baseWeight = W;
  result.recommendedWeight = newWeight;
  result.delta = inc;

  var repsArr = lastWork.map(function (s) { return s.reps; });
  var rpes = lastWork.map(function (s) { return s.rpe; }).filter(function (r) { return r !== null && r > 0; });
  var avgRpe = rpes.length ? Math.round((rpes.reduce(function (a, b) { return a + b; }, 0) / rpes.length) * 10) / 10 : null;

  result.lastSummary = {
    date: last.date,
    weight: W,
    sets: lastWork.length,
    reps: repsArr,
    avgRpe: avgRpe,
    totalVolume: Math.round(last.totalVolume * 10) / 10,
    est1RM: last.est1RM
  };

  // --- 前回の構成をそのまま引き継ぎ、重量だけ上げる ---
  result.plan = lastWork.map(function (s, i) {
    return {
      setNo: i + 1,
      weight: Math.round((s.weight + inc) * 100) / 100,   // 重量の違うセットもそれぞれ +inc
      reps: s.reps,
      prevWeight: s.weight,
      prevReps: s.reps
    };
  });

  result.reason = '前回 ' + last.date + ' は ' + fmtKg_(W) + 'kg × ' + repsArr.join('/') +
    'レップ（' + lastWork.length + 'セット）でした。セット数とレップはそのまま引き継ぎ、重量だけ +' +
    fmtKg_(inc) + 'kg した ' + fmtKg_(newWeight) + 'kg を今回のプランにしています。' +
    'きつい場合はこの画面で重量を下げてから開始してください。';

  result.deltaOptions = [-2 * inc, -inc, inc, 2 * inc].map(function (v) {
    return Math.round(v * 100) / 100;
  });

  // --- 手動上書き ---
  var manualWeight = num_(opts.manualWeight, null);
  var manualDelta = num_(opts.manualDelta, 0) || 0;
  if (manualWeight !== null) {
    result.finalWeight = roundToStep_(manualWeight, 0.25, 'nearest');
    result.overridden = true;
  } else if (manualDelta !== 0) {
    result.finalWeight = Math.round((newWeight + manualDelta) * 100) / 100;
    result.overridden = true;
  } else {
    result.finalWeight = newWeight;
    result.overridden = false;
  }

  result.est1RMAtTarget = epley1RM_(result.finalWeight, repsArr[0] || repMin);
  result.projectedVolume = Math.round(
    result.plan.reduce(function (a, p) { return a + (result.finalWeight) * p.reps; }, 0) * 10) / 10;
  return result;
}

/** 作業セットから「メインセット重量」を決める（最頻値、同数なら重い方） */
function detectWorkingWeight_(workSets) {
  if (!workSets || !workSets.length) return 0;
  var count = {};
  workSets.forEach(function (s) {
    var k = String(s.weight);
    count[k] = (count[k] || 0) + 1;
  });
  var best = null, bestCount = -1;
  Object.keys(count).forEach(function (k) {
    var w = Number(k);
    if (count[k] > bestCount || (count[k] === bestCount && w > best)) {
      best = w; bestCount = count[k];
    }
  });
  return best;
}

/** 表示用: 小数点以下が 0 なら整数で返す */
function fmtKg_(v) {
  var n = Number(v);
  return (Math.round(n * 100) % 100 === 0) ? String(Math.round(n)) : String(Math.round(n * 100) / 100);
}
