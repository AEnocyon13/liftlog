/**
 * SheetRepo.gs — スプレッドシートの読み書き
 *
 * 実績（Logs_<姓> / Sessions_<姓>）はユーザーごとにシートが分かれているため、
 * 実績系の関数はすべて第1引数に user（resolveUser_ の戻り値）を取る。
 */

/* ---------- 低レベルユーティリティ ---------- */

function getSheet_(name, createIfMissing) {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    if (!createIfMissing) {
      throw apiError_('SHEET_NOT_FOUND', 'シート「' + name + '」がありません。setupSpreadsheet() を実行してください。');
    }
    sh = ss.insertSheet(name);
  }
  return sh;
}

/** シート全体をヘッダ行基準でオブジェクト配列にして返す */
function readTable_(sheetName, createIfMissing) {
  var sh = getSheet_(sheetName, createIfMissing !== false);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var header = values[0].map(function (h) { return String(h).trim(); });
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (row.every(function (c) { return c === '' || c === null; })) continue;
    var obj = { _row: i + 1 };
    for (var j = 0; j < header.length; j++) {
      if (!header[j]) continue;
      obj[header[j]] = row[j];
    }
    rows.push(obj);
  }
  return rows;
}

/** ヘッダ順に合わせて1行分の配列を作る */
function toRow_(columns, obj) {
  return columns.map(function (c) {
    var v = obj[c];
    return (v === undefined || v === null) ? '' : v;
  });
}

function uuid_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 16);
}

function fmtDate_(d) {
  return Utilities.formatDate(d, getTimezone_(), 'yyyy-MM-dd');
}

/** シート上の値（文字列 or Date）を 'yyyy-MM-dd' に正規化 */
function normDate_(v) {
  if (v instanceof Date) return fmtDate_(v);
  var s = String(v || '').trim();
  var m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!m) return s;
  return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
}

function num_(v, fallback) {
  var n = Number(v);
  return (isFinite(n) && v !== '' && v !== null && v !== undefined)
    ? n : (fallback === undefined ? null : fallback);
}

function bool_(v) {
  var s = String(v).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'y' || s === '○';
}

function epley1RM_(weight, reps) {
  if (!weight || !reps) return 0;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

/* ---------- Settings（全員共通） ---------- */

var _settingsCache = null;

function getSettings_(force) {
  if (_settingsCache && !force) return _settingsCache;
  var out = {};
  Object.keys(DEFAULT_SETTINGS).forEach(function (k) { out[k] = DEFAULT_SETTINGS[k]; });
  var rows;
  try {
    rows = readTable_(SHEETS.SETTINGS);
  } catch (e) {
    rows = [];
  }
  rows.forEach(function (r) {
    var k = String(r.key || '').trim();
    if (!k) return;
    var raw = r.value;
    var n = Number(raw);
    out[k] = (raw !== '' && isFinite(n)) ? n : raw;
  });
  _settingsCache = out;
  return out;
}

function writeSetting_(key, value) {
  var sh = getSheet_(SHEETS.SETTINGS, true);
  var rows = readTable_(SHEETS.SETTINGS);
  var hit = rows.filter(function (r) { return String(r.key).trim() === key; })[0];
  if (hit) sh.getRange(hit._row, 2).setValue(value);
  else sh.appendRow([key, value, '']);
  _settingsCache = null;
}

/* ---------- Menus（種目マスター・全員共通） ---------- */

var _menuCache = null;

function readMenus_(force) {
  if (_menuCache && !force) return _menuCache;
  var s = getSettings_();
  var rows = readTable_(SHEETS.MENUS);
  var menus = rows
    .filter(function (r) {
      return String(r.menu || '').trim() !== '' &&
        (r.active === '' || r.active === undefined || bool_(r.active));
    })
    .map(function (r) {
      return {
        part: String(r.part || '').trim(),
        menu: String(r.menu || '').trim(),
        equipment: String(r.equipment || '').trim(),
        repMin: num_(r.repMin, s.defaultRepMin),
        repMax: num_(r.repMax, s.defaultRepMax),
        defaultSets: num_(r.defaultSets, 3),
        order: num_(r.order, 999)
      };
    });
  // 部位は Menus シートの出現順を保つ（胸→背中→脚→肩→腕→腹）
  var partOrder = {};
  rows.forEach(function (r, i) {
    var p = String(r.part || '').trim();
    if (p && partOrder[p] === undefined) partOrder[p] = i;
  });
  menus.sort(function (a, b) {
    if (a.part !== b.part) return (partOrder[a.part] || 0) - (partOrder[b.part] || 0);
    return a.order - b.order;
  });
  _menuCache = menus;
  return menus;
}

function findMenuConfig_(part, menu) {
  var s = getSettings_();
  var hit = readMenus_().filter(function (m) {
    return m.part === String(part).trim() && m.menu === String(menu).trim();
  })[0];
  if (hit) return hit;
  return {
    part: String(part), menu: String(menu), equipment: '',
    repMin: s.defaultRepMin, repMax: s.defaultRepMax,
    defaultSets: 3, order: 999, _fallback: true
  };
}

function upsertMenu_(obj) {
  var sh = getSheet_(SHEETS.MENUS, true);
  var rows = readTable_(SHEETS.MENUS);
  var hit = rows.filter(function (r) {
    return String(r.part).trim() === String(obj.part).trim() &&
           String(r.menu).trim() === String(obj.menu).trim();
  })[0];
  var merged = {};
  MENU_COLUMNS.forEach(function (c) {
    merged[c] = (obj[c] !== undefined && obj[c] !== '') ? obj[c] : (hit ? hit[c] : '');
  });
  if (merged.active === '') merged.active = true;
  if (hit) sh.getRange(hit._row, 1, 1, MENU_COLUMNS.length).setValues([toRow_(MENU_COLUMNS, merged)]);
  else sh.appendRow(toRow_(MENU_COLUMNS, merged));
  _menuCache = null;
}

/* ---------- Logs（実績・ユーザー別） ---------- */

/**
 * 指定 部位×種目 の履歴をセッション単位でまとめて新しい順に返す。
 */
function readMenuHistory_(user, part, menu, limitSessions) {
  var logs = readTable_(logsSheetName_(user.surname), true);
  var p = String(part).trim(), m = String(menu).trim();
  var filtered = logs.filter(function (r) {
    return String(r.part).trim() === p && String(r.menu).trim() === m;
  });

  var bySession = {};
  filtered.forEach(function (r) {
    var sid = String(r.sessionId || ('nosid-' + normDate_(r.date)));
    if (!bySession[sid]) bySession[sid] = { sessionId: sid, date: normDate_(r.date), sets: [] };
    bySession[sid].sets.push({
      setNo: num_(r.setNo, 0),
      weight: num_(r.weight, 0),
      reps: num_(r.reps, 0),
      rpe: num_(r.rpe, null),
      isWarmup: bool_(r.isWarmup),
      memo: String(r.memo || '')
    });
  });

  var sessions = Object.keys(bySession).map(function (k) {
    var s = bySession[k];
    s.sets.sort(function (a, b) { return a.setNo - b.setNo; });
    var work = s.sets.filter(function (x) { return !x.isWarmup; });
    s.workSets = work;
    s.topWeight = work.length ? Math.max.apply(null, work.map(function (x) { return x.weight; })) : 0;
    s.maxReps = work.length ? Math.max.apply(null, work.map(function (x) { return x.reps; })) : 0;
    s.totalVolume = work.reduce(function (a, x) { return a + x.weight * x.reps; }, 0);
    var rpes = work.map(function (x) { return x.rpe; }).filter(function (x) { return x !== null && x > 0; });
    s.avgRpe = rpes.length ? Math.round((rpes.reduce(function (a, b) { return a + b; }, 0) / rpes.length) * 10) / 10 : null;
    s.est1RM = work.length ? Math.max.apply(null, work.map(function (x) { return epley1RM_(x.weight, x.reps); })) : 0;
    return s;
  });

  sessions.sort(function (a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0); });
  return sessions.slice(0, limitSessions || 6);
}

/* ---------- Sessions（ユーザー別） ---------- */

function findOpenSession_(user) {
  var rows = readTable_(sessionsSheetName_(user.surname), true);
  for (var i = rows.length - 1; i >= 0; i--) {
    if (!rows[i].endTime) {
      return {
        sessionId: String(rows[i].sessionId),
        date: normDate_(rows[i].date),
        startTime: rows[i].startTime instanceof Date ? rows[i].startTime.toISOString() : String(rows[i].startTime),
        parts: String(rows[i].parts || ''),
        menus: String(rows[i].menus || '')
      };
    }
  }
  return null;
}

function startSession_(user, payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sh = getSheet_(sessionsSheetName_(user.surname), true);
    var now = new Date();
    var sessionId = payload.sessionId || uuid_();
    var startTime = payload.startTime || now.toISOString();
    sh.appendRow(toRow_(SESSION_COLUMNS, {
      sessionId: sessionId,
      date: payload.date || fmtDate_(now),
      startTime: startTime,
      endTime: '',
      durationMin: '',
      parts: (payload.parts || []).join(' / '),
      menus: (payload.menus || []).join(' / '),
      totalSets: '',
      totalVolume: '',
      restMinutes: num_(payload.restMinutes, user.restMinutes),
      memo: payload.memo || '',
      createdAt: now.toISOString()
    }));
    return { sessionId: sessionId, startTime: startTime, date: payload.date || fmtDate_(now) };
  } finally {
    lock.releaseLock();
  }
}

/** セッション終了。entries の全セットを Logs_<姓> に追記し、Sessions_<姓> を更新する。 */
function finishSession_(user, payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var now = new Date();
    var sessionId = String(payload.sessionId);
    var endTime = payload.endTime || now.toISOString();
    var startTime = payload.startTime || endTime;
    var date = payload.date || fmtDate_(new Date(startTime));

    var logSh = getSheet_(logsSheetName_(user.surname), true);
    var rows = [];
    var totalVolume = 0, totalSets = 0;
    var parts = [], menus = [];

    (payload.entries || []).forEach(function (entry) {
      var part = String(entry.part || '').trim();
      var menu = String(entry.menu || '').trim();
      if (parts.indexOf(part) < 0) parts.push(part);
      if (menus.indexOf(menu) < 0) menus.push(menu);

      (entry.sets || []).forEach(function (set, idx) {
        var weight = num_(set.weight, 0);
        var reps = num_(set.reps, 0);
        if (!reps) return;                       // レップ0のセットは記録しない
        var warm = !!set.isWarmup;
        var volume = warm ? 0 : weight * reps;
        if (!warm) { totalVolume += volume; totalSets += 1; }
        rows.push(toRow_(LOG_COLUMNS, {
          logId: uuid_(),
          sessionId: sessionId,
          date: date,
          part: part,
          menu: menu,
          setNo: num_(set.setNo, idx + 1),
          weight: weight,
          reps: reps,
          rpe: (set.rpe === '' || set.rpe === null || set.rpe === undefined) ? '' : num_(set.rpe, ''),
          isWarmup: warm,
          volume: volume,
          est1RM: warm ? '' : epley1RM_(weight, reps),
          memo: String(set.memo || ''),
          createdAt: now.toISOString()
        }));
      });
    });

    if (rows.length) {
      logSh.getRange(logSh.getLastRow() + 1, 1, rows.length, LOG_COLUMNS.length).setValues(rows);
    }

    var sesSh = getSheet_(sessionsSheetName_(user.surname), true);
    var sessions = readTable_(sessionsSheetName_(user.surname), true);
    var hit = sessions.filter(function (r) { return String(r.sessionId) === sessionId; })[0];
    var durationMin = Math.max(0, Math.round((new Date(endTime) - new Date(startTime)) / 60000));
    var rec = {
      sessionId: sessionId,
      date: date,
      startTime: startTime,
      endTime: endTime,
      durationMin: durationMin,
      parts: parts.join(' / '),
      menus: menus.join(' / '),
      totalSets: totalSets,
      totalVolume: Math.round(totalVolume * 10) / 10,
      restMinutes: num_(payload.restMinutes, hit ? num_(hit.restMinutes, user.restMinutes) : user.restMinutes),
      memo: payload.memo || (hit ? hit.memo : ''),
      createdAt: hit ? hit.createdAt : now.toISOString()
    };
    if (hit) sesSh.getRange(hit._row, 1, 1, SESSION_COLUMNS.length).setValues([toRow_(SESSION_COLUMNS, rec)]);
    else sesSh.appendRow(toRow_(SESSION_COLUMNS, rec));

    return {
      sessionId: sessionId,
      savedSets: rows.length,
      totalVolume: rec.totalVolume,
      durationMin: durationMin,
      dashboard: buildDashboard_(user, date.slice(0, 7))
    };
  } finally {
    lock.releaseLock();
  }
}

function deleteSession_(user, sessionId) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var deleted = 0;
    [logsSheetName_(user.surname), sessionsSheetName_(user.surname)].forEach(function (name) {
      var sh = getSheet_(name, true);
      readTable_(name, true)
        .filter(function (r) { return String(r.sessionId) === sessionId; })
        .map(function (r) { return r._row; })
        .sort(function (a, b) { return b - a; })      // 下から消す
        .forEach(function (rowIdx) { sh.deleteRow(rowIdx); deleted++; });
    });
    return { deletedRows: deleted };
  } finally {
    lock.releaseLock();
  }
}
