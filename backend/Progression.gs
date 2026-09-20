/**
 * Progression.gs — 漸進性過負荷（Progressive Overload）による重量提案アルゴリズム
 *
 * 方式: ダブルプログレッション + RPE補正
 *
 *  1. 前回同一 部位×種目 の「メインセット重量 W」を特定する
 *     （ウォームアップを除いた作業セットのうち、最も多く使われた重量。同数なら重い方）
 *  2. W のセットが全て目標レップ上限(repMax)に到達しているか判定する
 *  3. 到達 → 重量を上げる:  増加量 = baseIncrement × rpeFactor  を weightStep に丸める
 *              レップ目標は repMin にリセット（= ダブルプログレッションの折返し）
 *     未到達だが repMin は全セットクリア → 重量据え置き、レップを +1 伸ばす
 *     repMin 未達 → 据え置き。ただし deloadAfterFails 回連続で未達なら deloadRate 分ディロード
 *  4. rpeFactor（前回の主観的きつさで増加幅を調整）
 *        avgRPE <= 7.0            → 1.5   まだ余裕がある。大きめに伸ばす
 *        7.0 <  avgRPE <= 8.5     → 1.0   適正。標準の刻み
 *        8.5 <  avgRPE <= 9.5     → 0.5   きつい。刻みを半分に
 *        9.5 <  avgRPE            → 0.0   限界。重量は据え置きでフォーム/レップ優先
 *        RPE 未記録               → 1.0
 *  5. ユーザーは manualDelta（±kg）または manualWeight（絶対値）で提案を上書きできる
 */

/** 指定した刻み(step)に丸める。mode: 'nearest' | 'floor' | 'ceil' */
function roundToStep_(value, step, mode) {
  if (!step || step <= 0) step = 2.5;
  var q = value / step;
  var r;
  if (mode === 'floor') r = Math.floor(q + 1e-9);
  else if (mode === 'ceil') r = Math.ceil(q - 1e-9);
  else r = Math.round(q);
  return Math.round(r * step * 100) / 100;
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

/** avgRpe から増加係数を求める */
function rpeFactor_(avgRpe, settings) {
  if (avgRpe === null || avgRpe === undefined || !isFinite(avgRpe) || avgRpe <= 0) {
    return { factor: 1.0, label: 'RPE未記録', note: 'RPEの記録が無いため標準の刻みで提案します。' };
  }
  if (avgRpe <= settings.rpeEasyThreshold) {
    return { factor: 1.5, label: 'まだ余裕あり', note: '前回のRPE ' + avgRpe + ' は軽めなので増加幅を1.5倍にしました。' };
  }
  if (avgRpe <= settings.rpeNormalThreshold) {
    return { factor: 1.0, label: '適正', note: '前回のRPE ' + avgRpe + ' は適正範囲です。標準の刻みで増量します。' };
  }
  if (avgRpe <= settings.rpeHardThreshold) {
    return { factor: 0.5, label: 'かなりきつい', note: '前回のRPE ' + avgRpe + ' が高めなので増加幅を半分に抑えました。' };
  }
  return { factor: 0.0, label: '限界', note: '前回のRPE ' + avgRpe + ' は限界域です。重量は据え置き、フォームとレップを優先してください。' };
}

/** そのセッションが repMin を全セットでクリアできたか */
function sessionCleared_(session, repMin) {
  var w = detectWorkingWeight_(session.workSets);
  var atW = session.workSets.filter(function (s) { return s.weight === w; });
  if (!atW.length) return true;
  return atW.every(function (s) { return s.reps >= repMin; });
}

/**
 * メインの提案関数
 * @param {Array}  history   readMenuHistory_ の戻り値（新しい順）
 * @param {Object} conf      findMenuConfig_ の戻り値
 * @param {Object} settings  getSettings_ の戻り値
 * @param {Object} opts      { manualDelta, manualWeight, targetRepMin, targetRepMax }
 */
function suggestNextLoad_(history, conf, settings, opts) {
  opts = opts || {};
  var repMin = num_(opts.targetRepMin, conf.repMin) || settings.defaultRepMin;
  var repMax = num_(opts.targetRepMax, conf.repMax) || settings.defaultRepMax;
  var step = conf.weightStep || settings.defaultWeightStep;
  var baseInc = conf.baseIncrement || step;

  var result = {
    part: conf.part,
    menu: conf.menu,
    weightStep: step,
    baseIncrement: baseInc,
    targetRepMin: repMin,
    targetRepMax: repMax,
    recommendedSets: conf.defaultSets || 3,
    algorithm: 'double-progression+rpe'
  };

  var last = (history && history.length) ? history[0] : null;
  if (!last || !last.workSets || !last.workSets.length) {
    result.status = 'no_history';
    result.baseWeight = null;
    result.recommendedWeight = null;
    result.delta = 0;
    result.targetReps = repMin + '〜' + repMax;
    result.rpeFactor = 1.0;
    result.avgRpe = null;
    result.headline = '初回記録';
    result.reason = 'この種目の履歴がまだありません。' + repMin + '〜' + repMax + 'レップを全セット丁寧にこなせる重量から始めてください。次回からこの実績を基に自動提案します。';
    result.lastSummary = null;
    result.deltaOptions = buildDeltaOptions_(step);
    result.finalWeight = num_(opts.manualWeight, null);
    return result;
  }

  var W = detectWorkingWeight_(last.workSets);
  var setsAtW = last.workSets.filter(function (s) { return s.weight === W; });
  var repsAtW = setsAtW.map(function (s) { return s.reps; });
  var minRepsAtW = Math.min.apply(null, repsAtW);
  var maxRepsAtW = Math.max.apply(null, repsAtW);

  var rpes = setsAtW.map(function (s) { return s.rpe; }).filter(function (r) { return r !== null && r > 0; });
  var avgRpe = rpes.length ? Math.round((rpes.reduce(function (a, b) { return a + b; }, 0) / rpes.length) * 10) / 10 : null;
  var rf = rpeFactor_(avgRpe, settings);

  result.baseWeight = W;
  result.avgRpe = avgRpe;
  result.rpeFactor = rf.factor;
  result.rpeLabel = rf.label;
  result.lastSummary = {
    date: last.date,
    weight: W,
    sets: setsAtW.length,
    reps: repsAtW,
    minReps: minRepsAtW,
    maxReps: maxRepsAtW,
    avgRpe: avgRpe,
    totalVolume: Math.round(last.totalVolume * 10) / 10,
    est1RM: last.est1RM
  };

  var achievedTop = setsAtW.every(function (s) { return s.reps >= repMax; });
  var clearedMin = setsAtW.every(function (s) { return s.reps >= repMin; });

  if (achievedTop) {
    var rawInc = baseInc * rf.factor;
    var inc = roundToStep_(rawInc, step, 'nearest');
    if (rf.factor > 0 && inc <= 0) inc = step;   // 係数が小さすぎて0になった場合は最小刻み
    if (rf.factor === 0) inc = 0;

    if (inc > 0) {
      result.status = 'increase';
      result.delta = inc;
      result.recommendedWeight = Math.round((W + inc) * 100) / 100;
      result.targetReps = repMin + '〜' + repMax;
      result.headline = '増量';
      result.reason = '前回 ' + last.date + ' に ' + W + 'kg × ' + setsAtW.length + 'セットすべてで上限 ' + repMax +
        'レップを達成しました。' + rf.note + ' 増加量 = ' + baseInc + 'kg × ' + rf.factor + ' → ' + inc + 'kg（' + step + 'kg刻みに丸め）。' +
        '重量を上げるのでレップは ' + repMin + ' から積み直します。';
    } else {
      result.status = 'hold';
      result.delta = 0;
      result.recommendedWeight = W;
      result.targetReps = repMax + '（維持）';
      result.headline = '据え置き';
      result.reason = '上限レップは達成していますが、' + rf.note + ' 同じ ' + W + 'kg でフォームを固め、RPEが下がってから増量します。';
    }

  } else if (clearedMin) {
    var nextTarget = Math.min(maxRepsAtW + 1, repMax);
    result.status = 'add_reps';
    result.delta = 0;
    result.recommendedWeight = W;
    result.targetReps = nextTarget + '（前回最大 ' + maxRepsAtW + '）';
    result.headline = 'レップ +1';
    result.reason = '前回 ' + W + 'kg で ' + repsAtW.join('/') + 'レップ。目標下限 ' + repMin + 'は超えていますが上限 ' + repMax +
      'に未達のため、重量は据え置きでレップを伸ばします（ダブルプログレッションの前半）。全セット ' + repMax + 'レップに乗ったら次回自動で増量します。';

  } else {
    var failStreak = 0;
    for (var i = 0; i < history.length; i++) {
      if (!sessionCleared_(history[i], repMin)) failStreak++;
      else break;
    }
    result.failStreak = failStreak;

    if (failStreak >= settings.deloadAfterFails) {
      var deloaded = roundToStep_(W * (1 - settings.deloadRate), step, 'floor');
      if (deloaded >= W) deloaded = Math.max(step, W - step);
      result.status = 'deload';
      result.delta = Math.round((deloaded - W) * 100) / 100;
      result.recommendedWeight = deloaded;
      result.targetReps = repMin + '〜' + repMax;
      result.headline = 'ディロード';
      result.reason = failStreak + '回連続で下限 ' + repMin + 'レップに届いていません（前回 ' + repsAtW.join('/') + '）。' +
        Math.round(settings.deloadRate * 100) + '%落として ' + deloaded + 'kg から組み直し、フォームと可動域を優先してください。';
    } else {
      result.status = 'hold';
      result.delta = 0;
      result.recommendedWeight = W;
      result.targetReps = repMin + '〜' + repMax;
      result.headline = '据え置き';
      result.reason = '前回 ' + W + 'kg で ' + repsAtW.join('/') + 'レップ。下限 ' + repMin + 'に未達のため同じ重量で再挑戦します。' +
        'あと ' + (settings.deloadAfterFails - failStreak) + '回未達が続くとディロードを提案します。';
    }
  }

  result.deltaOptions = buildDeltaOptions_(step);

  // --- 手動上書き ---
  var manualWeight = num_(opts.manualWeight, null);
  var manualDelta = num_(opts.manualDelta, 0) || 0;
  if (manualWeight !== null) {
    result.finalWeight = roundToStep_(manualWeight, 0.25, 'nearest');
    result.overridden = true;
  } else if (manualDelta !== 0) {
    result.finalWeight = Math.round((result.recommendedWeight + manualDelta) * 100) / 100;
    result.overridden = true;
  } else {
    result.finalWeight = result.recommendedWeight;
    result.overridden = false;
  }
  result.manualDelta = manualDelta;

  if (result.finalWeight) {
    result.projectedVolume = Math.round(result.finalWeight * repMin * (result.recommendedSets || 3) * 10) / 10;
    result.est1RMAtTarget = epley1RM_(result.finalWeight, repMin);
  }

  return result;
}

function buildDeltaOptions_(step) {
  return [-2 * step, -step, 0, step, 2 * step].map(function (v) {
    return Math.round(v * 100) / 100;
  });
}
