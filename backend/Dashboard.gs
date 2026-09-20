/**
 * Dashboard.gs — 月間レポートの集計
 */

/**
 * @param {string|null} month 'YYYY-MM'。null なら今月。
 */
function buildDashboard_(month) {
  var tz = getTimezone_();
  var now = new Date();
  var targetMonth = month || Utilities.formatDate(now, tz, 'yyyy-MM');
  var settings = getSettings_();

  var sessions = readTable_(SHEETS.SESSIONS)
    .map(function (r) {
      return {
        sessionId: String(r.sessionId || ''),
        date: normDate_(r.date),
        durationMin: num_(r.durationMin, 0) || 0,
        parts: String(r.parts || ''),
        menus: String(r.menus || ''),
        totalSets: num_(r.totalSets, 0) || 0,
        totalVolume: num_(r.totalVolume, 0) || 0,
        finished: !!r.endTime
      };
    })
    .filter(function (s) { return s.date && s.finished; });

  var logs = readTable_(SHEETS.LOGS).map(function (r) {
    return {
      date: normDate_(r.date),
      part: String(r.part || '').trim(),
      menu: String(r.menu || '').trim(),
      weight: num_(r.weight, 0) || 0,
      reps: num_(r.reps, 0) || 0,
      isWarmup: bool_(r.isWarmup),
      volume: num_(r.volume, 0) || 0,
      est1RM: num_(r.est1RM, 0) || 0
    };
  }).filter(function (r) { return r.date && !r.isWarmup; });

  var inMonth = function (d) { return d.slice(0, 7) === targetMonth; };
  var monthSessions = sessions.filter(function (s) { return inMonth(s.date); });
  var monthLogs = logs.filter(function (r) { return inMonth(r.date); });

  /* --- 達成度 --- */
  var target = num_(settings.monthlyTargetWorkouts, 12) || 12;
  var done = uniq_(monthSessions.map(function (s) { return s.date + '|' + s.sessionId; })).length;
  var rate = target > 0 ? Math.round((done / target) * 1000) / 10 : 0;

  var y = Number(targetMonth.slice(0, 4)), mo = Number(targetMonth.slice(5, 7));
  var daysInMonth = new Date(y, mo, 0).getDate();
  var todayStr = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  var isCurrentMonth = todayStr.slice(0, 7) === targetMonth;
  var elapsedDays = isCurrentMonth ? Number(todayStr.slice(8, 10)) : daysInMonth;
  var expected = Math.round((target * (elapsedDays / daysInMonth)) * 10) / 10;
  var pace = expected > 0 ? Math.round((done / expected) * 1000) / 10 : 0;

  /* --- ボリューム/セット --- */
  var totalVolume = round1_(monthLogs.reduce(function (a, r) { return a + r.volume; }, 0));
  var totalSets = monthLogs.length;
  var totalReps = monthLogs.reduce(function (a, r) { return a + r.reps; }, 0);
  var totalMinutes = monthSessions.reduce(function (a, s) { return a + s.durationMin; }, 0);

  /* --- 部位別 --- */
  var partMap = {};
  monthLogs.forEach(function (r) {
    if (!partMap[r.part]) partMap[r.part] = { part: r.part, sets: 0, volume: 0, dates: {} };
    partMap[r.part].sets++;
    partMap[r.part].volume += r.volume;
    partMap[r.part].dates[r.date] = true;
  });
  var byPart = Object.keys(partMap).map(function (k) {
    var p = partMap[k];
    return {
      part: p.part,
      sets: p.sets,
      volume: round1_(p.volume),
      sessions: Object.keys(p.dates).length,
      ratio: totalVolume > 0 ? Math.round((p.volume / totalVolume) * 1000) / 10 : 0
    };
  }).sort(function (a, b) { return b.volume - a.volume; });

  /* --- 日別（カレンダー/ヒートマップ用） --- */
  var dayMap = {};
  monthLogs.forEach(function (r) {
    if (!dayMap[r.date]) dayMap[r.date] = { date: r.date, volume: 0, sets: 0, parts: {} };
    dayMap[r.date].volume += r.volume;
    dayMap[r.date].sets++;
    dayMap[r.date].parts[r.part] = true;
  });
  var calendar = [];
  for (var d = 1; d <= daysInMonth; d++) {
    var ds = targetMonth + '-' + ('0' + d).slice(-2);
    var hit = dayMap[ds];
    calendar.push({
      date: ds,
      day: d,
      dow: new Date(y, mo - 1, d).getDay(),
      volume: hit ? round1_(hit.volume) : 0,
      sets: hit ? hit.sets : 0,
      parts: hit ? Object.keys(hit.parts) : [],
      isFuture: isCurrentMonth && d > elapsedDays
    });
  }

  /* --- 自己ベスト（今月の更新数） --- */
  var bestBefore = {}, bestInMonth = {};
  logs.forEach(function (r) {
    var k = r.part + '::' + r.menu;
    if (r.date.slice(0, 7) < targetMonth) {
      bestBefore[k] = Math.max(bestBefore[k] || 0, r.est1RM);
    } else if (inMonth(r.date)) {
      if (!bestInMonth[k] || r.est1RM > bestInMonth[k].est1RM) {
        bestInMonth[k] = { part: r.part, menu: r.menu, est1RM: r.est1RM, weight: r.weight, reps: r.reps, date: r.date };
      }
    }
  });
  var prs = Object.keys(bestInMonth)
    .filter(function (k) { return bestInMonth[k].est1RM > (bestBefore[k] || 0); })
    .map(function (k) {
      var b = bestInMonth[k];
      b.previous = round1_(bestBefore[k] || 0);
      b.gain = round1_(b.est1RM - (bestBefore[k] || 0));
      return b;
    })
    .sort(function (a, b) { return b.gain - a.gain; });

  /* --- 種目別トップ（推定1RM） --- */
  var topLifts = Object.keys(bestInMonth)
    .map(function (k) { return bestInMonth[k]; })
    .sort(function (a, b) { return b.est1RM - a.est1RM; })
    .slice(0, 5);

  /* --- 直近6ヶ月トレンド --- */
  var trend = [];
  for (var i = 5; i >= 0; i--) {
    var dt = new Date(y, mo - 1 - i, 1);
    var key = Utilities.formatDate(dt, tz, 'yyyy-MM');
    var ss = sessions.filter(function (s) { return s.date.slice(0, 7) === key; });
    var ll = logs.filter(function (r) { return r.date.slice(0, 7) === key; });
    trend.push({
      month: key,
      workouts: ss.length,
      volume: round1_(ll.reduce(function (a, r) { return a + r.volume; }, 0))
    });
  }

  /* --- 最終トレーニングからの経過 --- */
  var allDates = sessions.map(function (s) { return s.date; }).sort();
  var lastDate = allDates.length ? allDates[allDates.length - 1] : null;
  var restDays = lastDate ? Math.floor((dateOf_(todayStr) - dateOf_(lastDate)) / 86400000) : null;

  return {
    month: targetMonth,
    monthLabel: y + '年' + mo + '月',
    generatedAt: now.toISOString(),
    goal: {
      targetWorkouts: target,
      doneWorkouts: done,
      achievementRate: rate,
      remaining: Math.max(0, target - done),
      expectedByToday: expected,
      pace: pace,
      onTrack: done >= expected,
      elapsedDays: elapsedDays,
      daysInMonth: daysInMonth,
      targetVolume: num_(settings.monthlyTargetVolume, 0) || 0,
      volumeRate: (settings.monthlyTargetVolume > 0)
        ? Math.round((totalVolume / settings.monthlyTargetVolume) * 1000) / 10 : null
    },
    totals: {
      volume: totalVolume,
      sets: totalSets,
      reps: totalReps,
      minutes: totalMinutes,
      avgVolumePerSession: done > 0 ? round1_(totalVolume / done) : 0,
      avgMinutesPerSession: done > 0 ? Math.round(totalMinutes / done) : 0
    },
    byPart: byPart,
    calendar: calendar,
    prs: prs,
    topLifts: topLifts,
    trend: trend,
    lastWorkoutDate: lastDate,
    restDays: restDays
  };
}

function uniq_(arr) {
  var seen = {}, out = [];
  arr.forEach(function (v) { if (!seen[v]) { seen[v] = 1; out.push(v); } });
  return out;
}

function round1_(v) { return Math.round(v * 10) / 10; }

function dateOf_(ymd) {
  var p = String(ymd).split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).getTime();
}
