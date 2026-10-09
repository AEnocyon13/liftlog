/**
 * db.js — Supabase へのデータアクセス
 *
 * 閲覧はログイン不要（覗き見）。書き込みは RLS により本人のみ。
 * UIを迂回して直接呼んでも、他人のデータは書き換えられない。
 */
import { sb, throwIf } from './supabase.js';
import { suggestNextLoad, epley1RM } from './progression.js';

const ymd = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
export const today = () => ymd(new Date());
const monthStart = (m) => `${m}-01`;
const monthEnd = (m) => {
  const [y, mo] = m.split('-').map(Number);
  return ymd(new Date(y, mo, 0));
};
export const thisMonth = () => today().slice(0, 7);

/* ---------- 種目と解説 ---------- */

export async function loadExercises() {
  const { data, error } = await sb()
    .from('exercises')
    .select('id, part, name, equipment, rep_min, rep_max, default_sets, sort_order, part_order,'
          + ' exercise_guides ( description, muscles, assist_muscles, points, cautions, videos, tags )')
    .eq('active', true)
    .order('part_order').order('sort_order');
  throwIf(error, '種目の読み込み');

  return (data || []).map((e) => ({
    id: e.id,
    part: e.part,
    menu: e.name,
    equipment: e.equipment || '',
    repMin: e.rep_min,
    repMax: e.rep_max,
    defaultSets: e.default_sets,
    guide: e.exercise_guides ? {
      part: e.part,
      menu: e.name,
      key: `${e.part}::${e.name}`,
      description: e.exercise_guides.description || '',
      muscles: e.exercise_guides.muscles || [],
      assistMuscles: e.exercise_guides.assist_muscles || [],
      points: e.exercise_guides.points || [],
      cautions: e.exercise_guides.cautions || [],
      videos: e.exercise_guides.videos || [],
      tags: e.exercise_guides.tags || []
    } : null
  }));
}

/* ---------- プロフィール ---------- */

export async function getProfile(userId) {
  const { data, error } = await sb().from('profiles').select('*').eq('id', userId).maybeSingle();
  throwIf(error, 'プロフィールの読み込み');
  return data;
}

export async function updateProfile(userId, patch) {
  const { data, error } = await sb().from('profiles').update(patch).eq('id', userId).select().single();
  throwIf(error, '設定の保存');
  return data;
}

/* ---------- 履歴と重量提案 ---------- */

/** 指定種目の直近セッションを新しい順に返す */
export async function exerciseHistory(userId, part, exercise, limitSessions = 6) {
  const { data, error } = await sb()
    .from('workout_sets')
    .select('date, set_no, weight, reps, rpe, is_warmup, workout_id')
    .eq('user_id', userId).eq('part', part).eq('exercise', exercise)
    .order('date', { ascending: false }).order('set_no')
    .limit(limitSessions * 12);
  throwIf(error, '履歴の読み込み');

  const byDate = new Map();
  (data || []).forEach((r) => {
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date).push({
      setNo: r.set_no, weight: Number(r.weight), reps: r.reps,
      rpe: r.rpe == null ? null : Number(r.rpe), isWarmup: r.is_warmup
    });
  });
  return [...byDate.entries()]
    .slice(0, limitSessions)
    .map(([date, sets]) => ({
      date,
      sets: sets.sort((a, b) => a.setNo - b.setNo),
      workSets: sets.filter((s) => !s.isWarmup)
    }));
}

export async function suggestion(userId, exercise, increment) {
  const history = await exerciseHistory(userId, exercise.part, exercise.menu, 6);
  return {
    suggestion: suggestNextLoad(history, {
      part: exercise.part, name: exercise.menu,
      repMin: exercise.repMin, repMax: exercise.repMax, defaultSets: exercise.defaultSets
    }, increment),
    history
  };
}

/* ---------- ワークアウト ---------- */

/** 実施中のワークアウト（端末をまたいで再開するために使う） */
export async function activeWorkout(userId) {
  const { data, error } = await sb()
    .from('workouts').select('*')
    .eq('user_id', userId).eq('status', 'active')
    .order('started_at', { ascending: false }).limit(1).maybeSingle();
  throwIf(error, '実施中ワークアウトの確認');
  return data;
}

export async function startWorkout(userId, { date, restMinutes, draft } = {}) {
  // started_at は DB の既定値に任せず明示的に送る。
  // 返り値に入っていなかったときに経過時間が NaN になるのを防ぐため。
  const { data, error } = await sb().from('workouts')
    .insert({
      user_id: userId, date: date || today(), status: 'active',
      started_at: new Date().toISOString(),
      rest_minutes: restMinutes ?? null, draft: draft ?? null
    })
    .select().single();
  throwIf(error, 'ワークアウトの開始');
  return data;
}

/** 入力途中の内容を丸ごと保存する（自動保存の実体） */
export async function saveDraft(workoutId, draft, extra = {}) {
  const { error } = await sb().from('workouts')
    .update({ draft, ...extra }).eq('id', workoutId);
  throwIf(error, '自動保存');
}

/**
 * ワークアウトを終了して、セットを書き込む。
 * 途中で失敗しても二重登録にならないよう、既存のセットを消してから入れ直す。
 */
export async function finishWorkout(workout, entries, { memo, restMinutes, startedAt } = {}) {
  const client = sb();
  const rows = [];
  const parts = new Set();
  let totalVolume = 0, totalSets = 0;

  entries.forEach((entry) => {
    parts.add(entry.part);
    entry.sets.forEach((s, i) => {
      const reps = Number(s.reps) || 0;
      if (!reps) return;
      const weight = Number(s.weight) || 0;
      if (!s.isWarmup) { totalVolume += weight * reps; totalSets += 1; }
      rows.push({
        workout_id: workout.id, user_id: workout.user_id, date: workout.date,
        part: entry.part, exercise: entry.menu,
        set_no: Number(s.setNo) || i + 1,
        weight, reps,
        rpe: s.rpe === '' || s.rpe == null ? null : Number(s.rpe),
        is_warmup: Boolean(s.isWarmup),
        memo: s.memo || null
      });
    });
  });
  if (!rows.length) throw new Error('レップ数が入力されたセットがありません。');

  const { error: delError } = await client.from('workout_sets').delete().eq('workout_id', workout.id);
  throwIf(delError, '記録の保存');

  const { error: insError } = await client.from('workout_sets').insert(rows);
  throwIf(insError, '記録の保存');

  const ended = new Date();
  const started = new Date(startedAt || workout.started_at);
  const { error: upError } = await client.from('workouts').update({
    status: 'finished',
    ended_at: ended.toISOString(),
    duration_min: Math.max(0, Math.round((ended - started) / 60000)),
    total_sets: totalSets,
    total_volume: Math.round(totalVolume * 10) / 10,
    rest_minutes: restMinutes ?? workout.rest_minutes,
    memo: memo || null,
    draft: null
  }).eq('id', workout.id);
  throwIf(upError, 'ワークアウトの終了');

  return { savedSets: rows.length, totalVolume: Math.round(totalVolume * 10) / 10, totalSets };
}

export async function deleteWorkout(workoutId) {
  const { error } = await sb().from('workouts').delete().eq('id', workoutId);
  throwIf(error, 'ワークアウトの削除');
}

/* ---------- 月間レポート ---------- */

export async function dashboard(userId, month) {
  const m = month || thisMonth();
  const from = monthStart(m), to = monthEnd(m);
  const client = sb();

  const sixAgo = (() => {
    const [y, mo] = m.split('-').map(Number);
    const d = new Date(y, mo - 6, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  })();

  const [setsRes, workoutsRes, dailyRes, bestRes, profileRes] = await Promise.all([
    client.from('workout_sets')
      .select('date, part, exercise, weight, reps, est_1rm, volume')
      .eq('user_id', userId).eq('is_warmup', false).gte('date', from).lte('date', to),
    client.from('workouts')
      .select('id, date, duration_min, total_volume, total_sets')
      .eq('user_id', userId).eq('status', 'finished').gte('date', sixAgo).lte('date', to),
    client.from('v_daily_volume')
      .select('date, volume, sets, parts')
      .eq('user_id', userId).gte('date', sixAgo).lte('date', to),
    client.from('v_exercise_monthly_best')
      .select('part, exercise, month, best_est_1rm, best_weight')
      .eq('user_id', userId),
    client.from('profiles')
      .select('monthly_target_workouts, monthly_target_volume').eq('id', userId).maybeSingle()
  ]);
  [setsRes, workoutsRes, dailyRes, bestRes, profileRes]
    .forEach((r) => throwIf(r.error, '月間レポートの集計'));

  const sets = setsRes.data || [];
  const allWorkouts = workoutsRes.data || [];
  const monthWorkouts = allWorkouts.filter((w) => w.date >= from && w.date <= to);
  const daily = dailyRes.data || [];
  const target = profileRes.data?.monthly_target_workouts ?? 12;
  const targetVolume = Number(profileRes.data?.monthly_target_volume ?? 0);

  const totalVolume = round1(sets.reduce((a, s) => a + Number(s.volume || 0), 0));
  const totalReps = sets.reduce((a, s) => a + (s.reps || 0), 0);
  const totalMinutes = monthWorkouts.reduce((a, w) => a + (w.duration_min || 0), 0);
  const done = monthWorkouts.length;

  /* 経過日数から「今日時点の目安」を出す */
  const [y, mo] = m.split('-').map(Number);
  const daysInMonth = new Date(y, mo, 0).getDate();
  const t = today();
  const isCurrent = t.slice(0, 7) === m;
  const elapsed = isCurrent ? Number(t.slice(8, 10)) : daysInMonth;
  const expected = Math.round(target * (elapsed / daysInMonth) * 10) / 10;

  /* 部位別 */
  const partMap = new Map();
  sets.forEach((s) => {
    const p = partMap.get(s.part) || { part: s.part, sets: 0, volume: 0, dates: new Set() };
    p.sets++; p.volume += Number(s.volume || 0); p.dates.add(s.date);
    partMap.set(s.part, p);
  });
  const byPart = [...partMap.values()].map((p) => ({
    part: p.part, sets: p.sets, volume: round1(p.volume), sessions: p.dates.size,
    ratio: totalVolume > 0 ? Math.round((p.volume / totalVolume) * 1000) / 10 : 0
  })).sort((a, b) => b.volume - a.volume);

  /* カレンダー */
  const dayMap = new Map(daily.filter((d) => d.date >= from && d.date <= to).map((d) => [d.date, d]));
  const calendar = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${m}-${String(d).padStart(2, '0')}`;
    const hit = dayMap.get(ds);
    calendar.push({
      date: ds, day: d, dow: new Date(y, mo - 1, d).getDay(),
      volume: hit ? round1(Number(hit.volume)) : 0,
      sets: hit ? hit.sets : 0,
      parts: hit ? (hit.parts || []) : [],
      isFuture: isCurrent && d > elapsed
    });
  }

  /* 自己ベスト更新: 今月のベスト > 今月より前のベスト */
  const best = bestRes.data || [];
  const prevBest = new Map();
  const curBest = new Map();
  best.forEach((b) => {
    const key = `${b.part}::${b.exercise}`;
    if (b.month < from) {
      prevBest.set(key, Math.max(prevBest.get(key) || 0, Number(b.best_est_1rm || 0)));
    } else if (b.month === from) {
      curBest.set(key, Number(b.best_est_1rm || 0));
    }
  });
  const prs = [];
  curBest.forEach((v, key) => {
    const before = prevBest.get(key) || 0;
    if (v <= before) return;
    const [part, exercise] = key.split('::');
    const hit = sets.filter((s) => s.part === part && s.exercise === exercise)
      .sort((a, b) => Number(b.est_1rm) - Number(a.est_1rm))[0];
    prs.push({
      part, menu: exercise, est1RM: round1(v), previous: round1(before), gain: round1(v - before),
      weight: hit ? Number(hit.weight) : 0, reps: hit ? hit.reps : 0, date: hit ? hit.date : ''
    });
  });
  prs.sort((a, b) => b.gain - a.gain);

  const topLifts = [...curBest.entries()]
    .map(([key, v]) => {
      const [part, exercise] = key.split('::');
      return { part, menu: exercise, est1RM: round1(v) };
    })
    .sort((a, b) => b.est1RM - a.est1RM).slice(0, 5);

  /* 直近6ヶ月 */
  const trend = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(y, mo - 1 - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    trend.push({
      month: key,
      workouts: allWorkouts.filter((w) => w.date.slice(0, 7) === key).length,
      volume: round1(daily.filter((x) => x.date.slice(0, 7) === key)
        .reduce((a, x) => a + Number(x.volume || 0), 0))
    });
  }

  const lastDate = daily.map((d) => d.date).sort().pop() || null;

  return {
    month: m,
    monthLabel: `${y}年${mo}月`,
    goal: {
      targetWorkouts: target, doneWorkouts: done,
      achievementRate: target > 0 ? Math.round((done / target) * 1000) / 10 : 0,
      remaining: Math.max(0, target - done),
      expectedByToday: expected,
      pace: expected > 0 ? Math.round((done / expected) * 1000) / 10 : 0,
      onTrack: done >= expected,
      elapsedDays: elapsed, daysInMonth,
      targetVolume,
      volumeRate: targetVolume > 0 ? Math.round((totalVolume / targetVolume) * 1000) / 10 : null
    },
    totals: {
      volume: totalVolume, sets: sets.length, reps: totalReps, minutes: totalMinutes,
      avgVolumePerSession: done > 0 ? round1(totalVolume / done) : 0,
      avgMinutesPerSession: done > 0 ? Math.round(totalMinutes / done) : 0
    },
    byPart, calendar, prs, topLifts, trend,
    lastWorkoutDate: lastDate,
    restDays: lastDate ? Math.floor((dateOf(t) - dateOf(lastDate)) / 86400000) : null
  };
}

const round1 = (v) => Math.round(v * 10) / 10;
const dateOf = (s) => {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
};

export { epley1RM };
