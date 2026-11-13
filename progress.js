// Progress stats, charts, race prediction, and /progress page (extracted from app.js).
function fmtSportDist(cat, dist) {
  const n = Number(dist) || 0;
  if (cat === "swim") {
    return n >= 1000 ? fmtDistWithUnit(n / 1000, 1) : `${Math.round(n)} m`;
  }
  return fmtDistWithUnit(n, 1);
}

function yearActs(acts, year) {
  return (acts || []).filter((a) => a.date && a.date.startsWith(String(year)));
}

const YEAR_SPORTS = ["run", "swim", "bike", "ebike", "walk", "ski"];

function yearSportStats(acts, year) {
  const rows = yearActs(acts, year);
  const totals = Object.fromEntries(YEAR_SPORTS.map((cat) => [cat, { dist: 0, count: 0 }]));
  rows.forEach((a) => {
    if (!totals[a.cat]) return;
    totals[a.cat].dist += a.dist || 0;
    totals[a.cat].count += 1;
  });
  return { year, rows, totals, count: rows.length };
}
function YEAR_SPORT_LABEL(cat) {
  const key = `sport.${cat}`;
  const value = tt(key);
  return value === key ? String(cat || "") : value;
}

function selectedYearSport() {
  const sport = routeExtra();
  return YEAR_SPORTS.includes(sport) ? sport : "run";
}

function chartDist(cat, dist) {
  const n = Number(dist) || 0;
  if (cat === "swim" && n > 100) return n / 1000;
  return n;
}

function activityVolume(rows, filter) {
  if (filter === "swim") {
    const dist = (rows || []).reduce((s, a) => s + (Number(a.dist) || 0), 0);
    if (dist >= 1000) return { value: fmtDist(dist / 1000, 1), unit: distUnit() };
    return { value: String(Math.round(dist)), unit: "m" };
  }
  const km = (rows || []).reduce((s, a) => s + chartDist(a.cat, a.dist || 0), 0);
  return { value: fmtDist(km, 1), unit: distUnit() };
}

function activityVolumeLabel(rows, filter) {
  const { value, unit } = activityVolume(rows, filter);
  return `${value} ${unit}`;
}

function yearMonthStats(acts, year, cat) {
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i, dist: 0, count: 0 }));
  yearActs(acts, year).forEach((a) => {
    if (a.cat !== cat || !a.date) return;
    const month = Number(a.date.slice(5, 7)) - 1;
    if (month < 0 || month > 11) return;
    months[month].dist += a.dist || 0;
    months[month].count += 1;
  });
  return months;
}

function chartAxis(peak) {
  const value = Math.max(0, Number(peak) || 0);
  if (!(value > 0)) return { max: 4, step: 1 };
  const step0 = value / 4;
  let step = 10 ** Math.floor(Math.log10(step0));
  const error = step0 / step;
  if (error >= Math.sqrt(50)) step *= 10;
  else if (error >= Math.sqrt(10)) step *= 5;
  else if (error >= Math.sqrt(2)) step *= 2;
  const max = Math.round(Math.ceil(value / step - 1e-9) * step * 1e6) / 1e6;
  return { max, step };
}

function formatChartTick(v) {
  const rounded = Math.round(v * 10) / 10;
  if (Math.abs(rounded - Math.round(rounded)) < 0.05) return String(Math.round(rounded));
  return rounded.toFixed(1);
}

function renderYearMonthChart(acts, now, cat) {
  const year = now.getFullYear();
  const months = yearMonthStats(acts, year, cat);
  const values = months.map((m) => chartDist(cat, m.dist));
  const { max: maxVal, step } = chartAxis(Math.max(0, ...values));
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const curMonth = now.getMonth();
  const W = 720, H = 220, padL = 36, padR = 10, padT = 22, padB = 28;
  const bw = (W - padL - padR) / 12;
  const y = (v) => H - padB - (v / maxVal) * (H - padT - padB);
  const ticks = [];
  for (let i = 1; i * step <= maxVal + step * 1e-6; i += 1) ticks.push(Math.round(i * step * 1e6) / 1e6);
  const grid = `<text class="axis" x="${padL}" y="12">km</text>` + ticks.map((v) => {
    return `<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"></line><text class="axis" x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${formatChartTick(v)}</text>`;
  }).join("");
  const bars = months.map((m, i) => {
    const val = values[i];
    const x = padL + i * bw;
    const future = i > curMonth;
    const cur = i === curMonth;
    const top = val ? y(val) : H - padB;
    const height = val ? Math.max(3, H - padB - top) : 0;
    const short = val ? (val >= 10 ? val.toFixed(0) : val.toFixed(1)) : "";
    const title = `${names[i]} ${year}: ${m.count ? `${fmtSportDist(cat, m.dist)} · ${m.count} session${m.count === 1 ? "" : "s"}` : "No sessions"}`;
    return `
      <g class="mbar-wrap${cur ? " cur" : ""}${future ? " future" : ""}${val ? "" : " empty"}">
        ${height ? `<rect class="mbar" x="${x + 6}" y="${top}" width="${bw - 12}" height="${height}" rx="4"></rect>` : ""}
        ${short && !future ? `<text class="mval" x="${x + bw / 2}" y="${top - 6}" text-anchor="middle">${short}</text>` : ""}
        <text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${names[i]}</text>
        <title>${esc(title)}</title>
      </g>`;
  }).join("");
  const done = months.filter((m, i) => i <= curMonth && m.count);
  const totalDist = done.reduce((s, m) => s + m.dist, 0);
  const totalCount = done.reduce((s, m) => s + m.count, 0);
  const from = done[0] ? names[months.indexOf(done[0])] : names[0];
  const to = names[curMonth];
  const summary = totalCount
    ? `${from}–${to} · ${fmtSportDist(cat, totalDist)} · ${totalCount} session${totalCount === 1 ? "" : "s"}`
    : `No ${YEAR_SPORT_LABEL(cat).toLowerCase()} sessions yet this year`;
  return `
    <div class="year-month" id="year-month-chart">
      <div class="year-month-head">
        <h3>${YEAR_SPORT_LABEL(cat)} by month</h3>
        <span class="muted">${summary}</span>
      </div>
      <div class="chart-scroll">
        <svg class="month-chart k-${cat}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${YEAR_SPORT_LABEL(cat)} volume by month in ${year}`)}">${grid}${bars}</svg>
      </div>
    </div>`;
}

function yearWeekStarts(year) {
  const first = mondayOf(new Date(year, 0, 1));
  const last = mondayOf(new Date(year, 11, 31));
  const weeks = [];
  for (let d = new Date(first); d <= last; d = addDays(d, 7)) weeks.push(new Date(d));
  return weeks;
}

function weekSportStats(acts, start) {
  const from = ymd(start);
  const to = ymd(addDays(start, 6));
  const weekActs = (acts || []).filter((a) => a.date >= from && a.date <= to);
  const byCat = Object.fromEntries(YEAR_SPORTS.map((cat) => [cat, 0]));
  weekActs.forEach((a) => {
    if (byCat[a.cat] != null) byCat[a.cat] += 1;
  });
  return { from, to, count: weekActs.length, byCat };
}

function weeklyStreaks(acts, now) {
  const year = now.getFullYear();
  const weeks = yearWeekStarts(year);
  const flags = weeks.map((start) => weekSportStats(acts, start).count > 0);
  const nowMon = mondayOf(now);
  let idx = weeks.findIndex((w) => ymd(w) === ymd(nowMon));
  if (idx < 0) idx = flags.length - 1;
  let cursor = idx;
  if (cursor >= 0 && !flags[cursor] && ymd(weeks[cursor]) === ymd(nowMon)) cursor -= 1;
  let current = 0;
  for (let i = cursor; i >= 0 && flags[i]; i -= 1) current += 1;
  let longest = 0, run = 0;
  flags.forEach((on) => {
    if (on) { run += 1; longest = Math.max(longest, run); }
    else run = 0;
  });
  return { current, longest, weeks, flags };
}

function planProgressStats(acts, now) {
  if (!hasPlan()) return null;
  const totalWeeks = WEEKS.length;
  const wk = Math.max(0, Math.min(totalWeeks, now < START ? 0 : weekOf(now)));
  const phase = wk ? phaseOf(wk) : PHASES[0] || { name: "", focus: "" };
  const totalDays = Math.max(1, daysBetween(START, RACE));
  const elapsed = Math.max(0, Math.min(totalDays, daysBetween(START, now)));
  const pct = Math.round((elapsed / totalDays) * 100);
  let planned = 0, done = 0, plannedKm = 0, loggedKm = 0;
  WEEKS.forEach((week) => {
    week.days.forEach((day, i) => {
      const date = addDays(weekStart(week.wk), i);
      const ds = ymd(date);
      const [kind, label, km] = day;
      const wanted = plannedSportCats(kind);
      if (!wanted.length || BUSY[ds]) return;
      if (date > now) return;
      planned += 1;
      if (km) plannedKm += km;
      const dayActs = acts.filter((a) => a.date === ds);
      const plan = { week, i, kind, label: fmtPlanLabel(label), km };
      if (planDayDone(plan, dayActs)) done += 1;
      loggedKm += dayActs.filter((a) => a.cat === "run").reduce((s, a) => s + (a.dist || 0), 0);
    });
  });
  return {
    wk, totalWeeks, phase, pct, elapsed, totalDays,
    planned, done, plannedKm, loggedKm,
    daysToRace: daysBetween(now, RACE),
    started: now >= START,
    finished: now > RACE,
  };
}

function renderPlanProgress(acts, now) {
  const stats = planProgressStats(acts, now);
  if (!stats) {
    return `
      <section class="card">
        <div class="card-head">
          <div>
            <div class="eyebrow">Your plan</div>
            <h2>No plan yet</h2>
          </div>
        </div>
        <p class="muted">Start a plan to see week progress, remaining sessions and how close you are to race day.</p>
        <button class="button" type="button" data-action="start-plan">Start plan</button>
      </section>`;
  }
  const sessionPct = stats.planned ? Math.round((stats.done / stats.planned) * 100) : 0;
  const status = stats.finished
    ? `Race week is done. ${esc(eventLabel())} was ${fmt(RACE, { day: "numeric", month: "short", year: "numeric" })}.`
    : stats.started
      ? `Week ${stats.wk} of ${stats.totalWeeks} · ${esc(stats.phase.name)}`
      : `Starts in ${daysBetween(now, START)} days · ${esc(stats.phase.name)}`;
  return `
    <section class="card">
      <div class="card-head">
        <div>
          <div class="eyebrow">Plan progress</div>
          <h2>${esc(eventLabel())}</h2>
          <p class="muted" style="margin:6px 0 0">${status}</p>
        </div>
        <button type="button" class="countdown" data-action="open-day" data-date="${ymd(RACE)}" title="View ${esc(eventLabel())}">
          <strong>${stats.finished ? 0 : Math.max(0, stats.daysToRace)}</strong>
          <span>days to race</span>
        </button>
      </div>
      ${PHASES.length ? `
        <div class="timeline">
          ${PHASES.map((p) => `<div class="seg p-${p.name} ${p === stats.phase ? "active" : ""}" style="flex:${p.to - p.from + 1}"><span>${p.name}</span></div>`).join("")}
          <div class="marker" style="left:${Math.max(0, Math.min(100, stats.pct))}%"></div>
        </div>` : ""}
      <div class="progress">
        <div class="progress-label">Through the block: <strong>${stats.pct}%</strong> · ${stats.elapsed} of ${stats.totalDays} days</div>
        <div class="bar"><div style="width:${stats.pct}%"></div></div>
      </div>
      <div class="profile-metrics">
        <div><span>Sessions done</span><strong>${stats.done}<em> / ${stats.planned}</em></strong><div class="bar"><div style="width:${sessionPct}%"></div></div></div>
        <div><span>Run ${distUnit()} logged</span><strong>${fmtDist(stats.loggedKm, 1)}<em> / ${fmtDist(stats.plannedKm, 0)}</em></strong></div>
        <div><span>Phase</span><strong>${esc(stats.phase.name || "—")}</strong></div>
        <div><span>Race</span><strong>${fmt(RACE, { day: "numeric", month: "short" })}</strong></div>
      </div>
      <div class="plan-actions">
        <p class="muted small-text">Want a different event? Remove this plan and create a new one. Activities stay on your account.</p>
        <button class="button ghost small" type="button" data-action="remove-plan">Remove plan</button>
      </div>
    </section>`;
}

function renderYearStats(acts, now) {
  const year = now.getFullYear();
  const stats = yearSportStats(acts, year);
  const selected = selectedYearSport();
  const cards = YEAR_SPORTS.map((cat) => {
    const row = stats.totals[cat];
    const on = cat === selected;
    return `
      <a class="year-stat k-${cat}${on ? " active" : ""}" href="/profile/${cat}"${on ? ' aria-current="true"' : ""}>
        <span>${YEAR_SPORT_LABEL(cat)}</span>
        <strong>${row.count ? fmtSportDist(cat, row.dist) : "—"}</strong>
        <em>${row.count ? `${row.count} session${row.count === 1 ? "" : "s"}` : "No sessions yet"}</em>
      </a>`;
  }).join("");
  return `
    <section class="card">
      <div class="card-head">
        <div>
          <div class="eyebrow">This year</div>
          <h2>${year} volume</h2>
        </div>
        ${stats.count
          ? `<a class="button small" href="/activities">See all ${stats.count} activities</a>`
          : `<span class="muted">Import a CSV to fill this in</span>`}
      </div>
      <div class="year-stats">${cards}</div>
      ${renderYearMonthChart(acts, now, selected)}
    </section>`;
}

function renderStreak(acts, now) {
  const year = now.getFullYear();
  const { current, longest, weeks } = weeklyStreaks(acts, now);
  const nowMon = mondayOf(now);
  const months = [];
  weeks.forEach((start) => {
    const info = weekSportStats(acts, start);
    const future = start > nowMon;
    const cur = ymd(start) === ymd(nowMon);
    const level = future || !info.count ? 0 : info.count >= 4 ? 3 : info.count >= 2 ? 2 : 1;
    const sports = YEAR_SPORTS.filter((c) => info.byCat[c]).join(", ");
    const title = `${short(start)} – ${short(addDays(start, 6))}${info.count ? ` · ${info.count} activit${info.count === 1 ? "y" : "ies"}${sports ? ` (${sports})` : ""}` : " · rest week"}`;
    const labelDate = start.getFullYear() < year ? new Date(year, 0, 1) : start;
    const key = `${year}-${labelDate.getMonth()}`;
    let month = months.find((m) => m.key === key);
    if (!month) {
      month = { key, name: labelDate.toLocaleDateString(typeof window.localeTag === "function" ? window.localeTag() : "en-GB", { month: "short" }), cells: [] };
      months.push(month);
    }
    month.cells.push(`<span class="streak-cell lvl-${level}${cur ? " cur" : ""}${future ? " future" : ""}" title="${esc(title)}"></span>`);
  });
  const headline = current
    ? `${current} week${current === 1 ? "" : "s"} in a row`
    : "No active streak";
  return `
    <section class="card">
      <div class="card-head">
        <div>
          <div class="eyebrow">Weekly streak</div>
          <h2>${headline}</h2>
          <p class="muted" style="margin:6px 0 0">Longest this year: ${longest} week${longest === 1 ? "" : "s"}. A week counts when you log any run, swim, bike, e-bike or walk.</p>
        </div>
      </div>
      <div class="streak-year">
        ${months.map((m) => `
          <div class="streak-month">
            <span class="streak-month-label">${m.name}</span>
            <div class="streak-weeks">${m.cells.join("")}</div>
          </div>`).join("")}
      </div>
      <div class="legend streak-legend">
        <span>Less</span>
        <i class="streak-cell lvl-0"></i><i class="streak-cell lvl-1"></i><i class="streak-cell lvl-2"></i><i class="streak-cell lvl-3"></i>
        <span>More</span>
      </div>
    </section>`;
}

function renderChart(acts, now) {
  const W = 900, H = 220, pad = 28, n = WEEKS.length;
  const max = Math.max(55, ...WEEKS.map((w) => w.km + 5));
  const bw = (W - pad * 2) / n;
  const y = (v) => H - pad - (v / max) * (H - pad * 2);
  const curWk = weekOf(now);
  const bars = [];
  const hovers = [];
  WEEKS.forEach((w, i) => {
    const x = pad + i * bw;
    const s = weekStart(w.wk), e = addDays(s, 6);
    const dates = `${short(s)} – ${short(e)}`;
    const longKm = Math.min(w.long, w.km);
    const actual = s <= now ? weekRunKm(w, acts) : null;
    const progress = actual !== null ? fmtDistWithUnit(actual, 1) : "—";
    const aria = `Week ${w.wk}, ${dates}: ${fmtDistWithUnit(w.km, 0)}, long ${fmtDistWithUnit(w.long, 0)}, progress ${actual !== null ? fmtDistWithUnit(actual, 1) : "not started"}`;
    const tipSide = i < 2 ? " tip-start" : i >= n - 2 ? " tip-end" : "";
    bars.push(`
      <g class="wkbar ${w.wk === curWk ? "cur" : ""}">
        <rect class="b-total p-${w.phase}" x="${x + 3}" y="${y(w.km)}" width="${bw - 6}" height="${H - pad - y(w.km)}" rx="3"></rect>
        <rect class="b-long" x="${x + 3}" y="${y(longKm)}" width="${bw - 6}" height="${H - pad - y(longKm)}" rx="3"></rect>
        ${actual !== null ? `<circle class="b-actual" cx="${x + bw / 2}" cy="${y(actual)}" r="4"></circle>` : ""}
        <text x="${x + bw / 2}" y="${H - 10}" text-anchor="middle">${w.wk}</text>
      </g>`);
    hovers.push(`
      <a class="chart-hover${tipSide}${w.wk === curWk ? " cur" : ""}" href="/plan/${w.wk}" style="left:${(x / W) * 100}%;width:${(bw / W) * 100}%" aria-label="${esc(aria)}">
        <span class="chart-tip">
          <em>${tt("plan.weekN", { week: w.wk })}</em>
          <em class="chart-tip-dates">${esc(dates)}</em>
          <span>${tt("plan.weekly")} <strong>${fmtDistWithUnit(w.km, 0)}</strong></span>
          <span>${tt("plan.long")} <strong>${fmtDistWithUnit(w.long, 0)}</strong></span>
          <span>${tt("plan.progress")} <strong>${esc(progress)}</strong></span>
        </span>
      </a>`);
  });
  const ticks = [];
  for (let v = 10; v < max; v += 10) ticks.push(v);
  const grid = ticks.map((v) => `<line x1="${pad}" x2="${W - pad}" y1="${y(v)}" y2="${y(v)}"></line><text class="axis" x="${pad - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join("");
  return `<div class="chart-scroll"><div class="chart-inner">
      <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weekly run ${distUnit()}">${grid}${bars.join("")}</svg>
      <div class="chart-hovers">${hovers.join("")}</div>
    </div></div>
    <div class="legend"><span><i class="lg-total"></i>Weekly run ${distUnit()}</span><span><i class="lg-long"></i>Long run</span><span><i class="lg-actual"></i>Logged</span></div>`;
}

function localProgressReport(acts, now) {
  const stats = planProgressStats(acts, now);
  const pred = typeof window.racePrediction === "function" ? window.racePrediction(acts, now) : null;
  if (!stats) return "Start the plan to get a progress report.";
  const paras = [];
  if (!stats.started) {
    paras.push(`${eventLabel()} starts in ${daysBetween(now, START)} days. The report will track from week 1.`);
  } else if (stats.finished) {
    paras.push(`${eventLabel()} is done. You logged ${fmtDistWithUnit(stats.loggedKm, 1)} across ${stats.done} sessions in this block.`);
  } else {
    const sessionPct = stats.planned ? Math.round((stats.done / stats.planned) * 100) : 0;
    paras.push(`Week ${stats.wk} of ${stats.totalWeeks}, ${stats.phase.name || "build"}, ${Math.max(0, stats.daysToRace)} days to ${eventLabel()}. ${stats.done} of ${stats.planned} planned sessions are done (${sessionPct}%), with ${fmtDist(stats.loggedKm, 1)} of ${fmtDist(stats.plannedKm, 0)} ${distUnit()} logged.`);
  }
  if (pred && !pred.empty) {
    const cur = fmtRaceClock(pred.currentSec);
    const proj = fmtRaceClock(pred.projectedSec);
    if (pred.pacingBands?.length && pred.spec?.sport === "triathlon") {
      const legs = pred.pacingBands
        .filter((b) => b.leg !== "T1+T2")
        .map((b) => `${b.leg} ${b.time} (${b.goal})`)
        .join("; ");
      paras.push(`Current predicted finish is ${cur} (projection ${proj}). Per-leg bands: ${legs}.`);
    } else {
      paras.push(`Current predicted finish is ${cur}. If you follow the rest of the plan, the projection is ${proj}.`);
    }
  } else {
    paras.push("Log or import timed sessions so the race prediction can fill in.");
  }
  const week = WEEKS[Math.max(0, stats.wk - 1)];
  if (week && stats.started && !stats.finished) paras.push(`This week: ${weekFeedback(week, acts, now)}`);
  return paras.join("\n\n");
}

function hashText(raw) {
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function progressFingerprint(acts = ACTS, now = today()) {
  const stats = planProgressStats(acts, now);
  const start = START ? ymd(START) : "";
  const race = RACE ? ymd(RACE) : "";
  const rows = (acts || [])
    .filter((a) => !start || a.date >= start)
    .map((a) => `${a.datetime}|${a.cat}|${a.dist ?? ""}|${a.time || ""}|${a.pace || ""}|${a.hr || ""}`)
    .sort();
  const busy = Object.keys(BUSY || {}).sort().join(",");
  const raw = [
    eventLabel(),
    start,
    race,
    stats?.wk ?? "",
    stats?.done ?? "",
    Math.round((stats?.loggedKm || 0) * 10),
    busy,
    ...rows,
  ].join("\n");
  return hashText(raw);
}

function progressReportIsCurrent(fp = progressFingerprint()) {
  return !!(PROGRESS_REPORT?.text && PROGRESS_REPORT.fingerprint === fp);
}

function progressCacheKey() {
  return `progress-report:${CURRENT_USER_ID || "anon"}`;
}

function persistProgressReport() {
  if (!PROGRESS_REPORT?.text) return;
  try { localStorage.setItem(progressCacheKey(), JSON.stringify(PROGRESS_REPORT)); } catch { /* ignore */ }
}

function readCachedProgressReport() {
  try {
    const row = JSON.parse(localStorage.getItem(progressCacheKey()) || "null");
    if (!row || typeof row.text !== "string" || !row.text.trim()) return null;
    return row;
  } catch {
    return null;
  }
}

function stampProgressFingerprint(fp = progressFingerprint()) {
  if (!PROGRESS_REPORT) return;
  PROGRESS_REPORT.fingerprint = fp;
  persistProgressReport();
}

function progressSnapshot(acts, now) {
  const stats = planProgressStats(acts, now);
  const pred = typeof window.racePrediction === "function" ? window.racePrediction(acts, now) : null;
  const week = stats ? WEEKS[Math.max(0, stats.wk - 1)] : null;
  return {
    event: eventLabel(),
    eventDate: window.MARATHON_DATE,
    week: stats?.wk || null,
    totalWeeks: stats?.totalWeeks || null,
    phase: stats?.phase?.name || null,
    daysToRace: stats?.daysToRace ?? null,
    sessionsDone: stats?.done ?? null,
    sessionsPlanned: stats?.planned ?? null,
    kmLogged: stats ? Math.round(stats.loggedKm * 10) / 10 : null,
    kmPlanned: stats ? Math.round(stats.plannedKm) : null,
    thisWeek: week && stats?.started ? weekFeedback(week, acts, now) : null,
    prediction: pred && !pred.empty ? {
      current: fmtRaceClock(pred.currentSec),
      projected: fmtRaceClock(pred.projectedSec),
      dist: pred.distLabel,
    } : null,
    fingerprint: progressFingerprint(acts, now),
  };
}

function progressReportText() {
  if (PROGRESS_REPORT?.text) return PROGRESS_REPORT.text;
  return localProgressReport(ACTS, today());
}

function renderProgress(acts, now) {
  const stats = planProgressStats(acts, now);
  const running = PROGRESS_STATUS === "running";
  const hasAi = !!(PROGRESS_REPORT?.text && PROGRESS_REPORT.source === "ai");
  const paragraphs = progressReportText().split(/\n\n+/).filter(Boolean)
    .map((p) => `<p class="coach-text">${esc(p)}</p>`).join("");
  const when = PROGRESS_REPORT?.at ? fmt(new Date(PROGRESS_REPORT.at), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
  const stale = hasAi && PROGRESS_REPORT.week && stats?.wk !== PROGRESS_REPORT.week;
  const status = !stats
    ? tt("progress.noPlan")
    : stats.finished
      ? tt("progress.eventDone", { event: eventLabel() })
      : stats.started
        ? tt("progress.weekOf", { week: stats.wk, total: stats.totalWeeks, phase: stats.phase.name || "" })
        : tt("progress.startsIn", { days: daysBetween(now, START) });
  return `
    <section class="hero compact">
      <div>
        <div class="eyebrow">${esc(status)}</div>
        <h1>${tt("progress.title")}</h1>
        <p class="muted">${esc(eventLabel())}${stats && !stats.finished ? tt("progress.daysToRace", { days: Math.max(0, stats.daysToRace) }) : ""}</p>
      </div>
      <div class="hero-actions">
        <a class="button ghost small" href="/plan">${tt("progress.back")}</a>
        <button type="button" class="button ghost small" data-action="refresh-progress" ${running ? "disabled" : ""}>
          ${running ? tt("progress.writing") : tt("progress.askAgain")}
        </button>
      </div>
    </section>
    <section class="card" id="progress-report">
      ${running ? `<p class="muted small-text">${hasAi ? tt("progress.updating") : tt("progress.writingFresh")}</p>` : ""}
      ${stale ? `<p class="muted small-text">${tt("progress.stale", { week: PROGRESS_REPORT.week })}</p>` : ""}
      <div class="progress-copy">${paragraphs}</div>
      ${when && hasAi ? `<p class="muted small-text">${tt("progress.coachNote", { when })}</p>` : ""}
    </section>
    ${renderRacePrediction(acts, now)}`;
}

let PREDICT_MODE = "time";
let PROGRESS_STATUS = "idle";
let PROGRESS_REPORT = null;
let PROGRESS_POLL = null;

function displayPredictValue(sec, paceSec, spec, mode) {
  if (mode === "pace") {
    const use = paceSec || sec;
    if (!(use > 0)) return "—";
    if (spec.sport === "bike" && spec.bikeKm) {
      const kph = spec.bikeKm / (use / 3600);
      return isImperial() ? `${fmtNum(kph / KM_PER_MILE, 1)} mph` : `${kph.toFixed(1)} km/h`;
    }
    if (spec.sport === "swim" && spec.swimM) return `${fmtPace(use / (spec.swimM / 100))}/100m`;
    const km = spec.targetRunKm || spec.runKm;
    if (km) {
      const secPerKm = use / km;
      return isImperial() ? `${fmtPaceSec(secPerKm * KM_PER_MILE)}/mi` : `${fmtPace(secPerKm)}/km`;
    }
    return "—";
  }
  return fmtRaceClock(sec);
}

function axisPredictLabel(sec, paceSec, spec, mode) {
  if (mode === "pace") {
    const use = paceSec || sec;
    if (!(use > 0)) return "";
    if (spec.sport === "bike" && spec.bikeKm) return (spec.bikeKm / (use / 3600)).toFixed(1);
    if (spec.sport === "swim" && spec.swimM) return fmtPace(use / (spec.swimM / 100));
    const km = spec.targetRunKm || spec.runKm;
    if (km) return fmtPace(use / km);
    return "";
  }
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h) return `${h}:${String(m).padStart(2, "0")}`;
  const mins = Math.floor(s / 60);
  const r = s % 60;
  return `${mins}:${String(r).padStart(2, "0")}`;
}

function nicePredictTicks(minSec, maxSec) {
  const span = Math.max(30, maxSec - minSec);
  const steps = [15, 30, 60, 120, 180, 240, 300, 600, 900, 1200];
  let step = steps.find((s) => span / s <= 5) || 1800;
  const niceMin = Math.floor(minSec / step) * step;
  const ticks = [];
  for (let v = niceMin; v <= maxSec + step * 0.05; v += step) {
    if (v >= minSec - step * 0.15 && v <= maxSec + step * 0.15) ticks.push(v);
  }
  return ticks.length ? ticks : [minSec, maxSec];
}

function renderRacePrediction(acts, now, nested = false) {
  const pred = typeof window.racePrediction === "function" ? window.racePrediction(acts, now) : null;
  if (!pred) return "";
  const mode = PREDICT_MODE === "pace" ? "pace" : "time";
  const spec = pred.spec;
  const title = mode === "pace" ? "Race pace prediction" : "Race time prediction";
  const heading = nested ? "h3" : "h2";
  const openTag = nested ? `<div class="predict-embed">` : `<section class="card predict-card">`;
  const closeTag = nested ? `</div>` : `</section>`;
  const toggle = `
    <div class="predict-toggle" role="group" aria-label="Show time or pace">
      <button type="button" class="choice-btn${mode === "time" ? " active" : ""}" data-action="predict-mode" data-mode="time" aria-pressed="${mode === "time"}">Time</button>
      <button type="button" class="choice-btn${mode === "pace" ? " active" : ""}" data-action="predict-mode" data-mode="pace" aria-pressed="${mode === "pace"}">Pace</button>
    </div>`;

  if (pred.empty) {
    return `
      ${openTag}
        <div class="card-head">
          <div>
            <div class="eyebrow">${esc(pred.spec.name)}</div>
            <${heading}>${title}</${heading}>
          </div>
          ${toggle}
        </div>
        <p class="muted" style="margin:0">Log or import timed ${spec.primary === "swim" ? "swims" : spec.primary === "bike" ? "rides" : "runs"} to see a current prediction and a projected range for race day.</p>
      ${closeTag}`;
  }

  const raceDate = parseDate(pred.race);
  const fromDate = parseDate(pred.from);
  const nowDate = parseDate(pred.now);
  const finished = nowDate >= raceDate;
  const hist = pred.history;
  const values = hist.map((p) => p.timeSec);
  if (!finished) {
    values.push(pred.projectedSec, pred.optimisticSec, pred.pessimisticSec);
  }
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const padY = Math.max(40, (rawMax - rawMin) * 0.16);
  const minSec = Math.max(60, rawMin - padY);
  const maxSec = rawMax + padY;

  const W = 900, H = 248, padL = 52, padR = 16, padT = 18, padB = 36;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const t0 = fromDate.getTime(), t1 = Math.max(t0 + 864e5, raceDate.getTime());
  const xAt = (ds) => padL + ((parseDate(ds).getTime() - t0) / (t1 - t0)) * plotW;
  const yAt = (sec) => padT + ((maxSec - sec) / (maxSec - minSec)) * plotH;

  const ticks = nicePredictTicks(minSec, maxSec);
  const grid = ticks.map((v) => {
    const y = yAt(v);
    if (y > H - padB - 10 || y < padT + 6) return "";
    return `<line x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}"></line><text class="axis" x="${padL - 8}" y="${y + 4}" text-anchor="end">${axisPredictLabel(v, v * ((pred.currentPaceSec || pred.currentSec) / pred.currentSec), spec, mode)}</text>`;
  }).join("");

  const spanDays = Math.max(1, daysBetween(fromDate, raceDate));
  const markEvery = spanDays > 70 ? 7 : spanDays > 40 ? 2 : 1;
  const dots = [];
  for (let d = addDays(fromDate, markEvery); d <= addDays(raceDate, -1); d = addDays(d, markEvery)) {
    const x = xAt(ymd(d));
    if (x < padL + 18 || x > W - padR - 10) continue;
    dots.push(`<circle class="predict-xdot" cx="${x}" cy="${H - padB + 4}" r="1.6"></circle>`);
  }

  const step = hist.length > 80 ? Math.ceil(hist.length / 70) : 1;
  const linePts = hist.filter((_, i) => i % step === 0 || i === hist.length - 1)
    .map((p) => `${xAt(p.date).toFixed(1)},${yAt(p.timeSec).toFixed(1)}`);
  const cur = hist[hist.length - 1];
  const cx = xAt(cur.date), cy = yAt(cur.timeSec);

  let fan = "";
  let projLine = "";
  if (!finished) {
    const n = 14;
    const hi = [], lo = [], mid = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const e = t * t * (3 - 2 * t);
      const date = ymd(addDays(nowDate, Math.round(daysBetween(nowDate, raceDate) * t)));
      const x = xAt(date);
      hi.push(`${x.toFixed(1)},${yAt(cur.timeSec + (pred.pessimisticSec - cur.timeSec) * e).toFixed(1)}`);
      lo.push(`${x.toFixed(1)},${yAt(cur.timeSec + (pred.optimisticSec - cur.timeSec) * e).toFixed(1)}`);
      mid.push(`${x.toFixed(1)},${yAt(cur.timeSec + (pred.projectedSec - cur.timeSec) * e).toFixed(1)}`);
    }
    fan = `<polygon class="predict-fan" points="${hi.join(" ")} ${lo.reverse().join(" ")}"></polygon>`;
    projLine = `<polyline class="predict-proj" points="${mid.join(" ")}" fill="none"></polyline>`;
  }

  const xLabels = [];
  xLabels.push([pred.from, short(fromDate)]);
  if (daysBetween(fromDate, nowDate) > 10 && daysBetween(nowDate, raceDate) > 10) {
    xLabels.push([pred.now, short(nowDate)]);
  }
  xLabels.push([pred.race, short(raceDate)]);
  const labels = xLabels.map(([ds, text], i) => {
    const x = xAt(ds);
    const anchor = i === 0 ? "start" : i === xLabels.length - 1 ? "end" : "middle";
    return `<text class="axis" x="${x}" y="${H - 10}" text-anchor="${anchor}">${esc(text)}</text>`;
  }).join("");

  const hover = hist.filter((_, i) => i % Math.max(1, Math.ceil(hist.length / 24)) === 0 || i === hist.length - 1).map((p) => {
    const val = displayPredictValue(p.timeSec, p.paceSec, spec, mode);
    return `<circle class="predict-hit" cx="${xAt(p.date)}" cy="${yAt(p.timeSec)}" r="8"><title>${esc(short(parseDate(p.date)))}: ${esc(val)}</title></circle>`;
  }).join("");

  const currentVal = displayPredictValue(pred.currentSec, pred.currentPaceSec, spec, mode);
  const projVal = finished ? currentVal : displayPredictValue(pred.projectedSec, pred.projectedPaceSec, spec, mode);
  const deltaSec = pred.currentSec - pred.projectedSec;
  let delta = "";
  if (!finished && deltaSec > 30) {
    if (mode === "pace") {
      if (spec.sport === "bike" && spec.bikeKm) {
        const gain = spec.bikeKm / (pred.projectedSec / 3600) - spec.bikeKm / (pred.currentSec / 3600);
        if (gain > 0.15) delta = isImperial()
          ? `${fmtNum(gain / KM_PER_MILE, 1)} mph faster`
          : `${gain.toFixed(1)} km/h faster`;
      } else {
        const unitDist = spec.sport === "swim" && spec.swimM ? spec.swimM / 100 : (spec.targetRunKm || spec.runKm);
        const per = unitDist ? deltaSec / unitDist : 0;
        if (spec.sport === "swim") {
          if (per >= 1) delta = per < 60 ? `${Math.round(per)}s/100m faster` : `${fmtPace(per)}/100m faster`;
        } else if (isImperial()) {
          const perMi = per * KM_PER_MILE;
          if (perMi >= 1) delta = perMi < 60 ? `${Math.round(perMi)}s/mi faster` : `${fmtPaceSec(perMi)}/mi faster`;
        } else if (per >= 1) {
          delta = per < 60 ? `${Math.round(per)}s/km faster` : `${fmtPace(per)}/km faster`;
        }
      }
    } else {
      delta = `${fmtRaceClock(deltaSec)} faster`;
    }
  }

  return `
    ${openTag}
      <div class="card-head">
        <div>
          <div class="eyebrow">${esc(spec.name)}${pred.distLabel ? ` · ${esc(pred.distLabel)}` : ""}</div>
          <${heading}>${title}</${heading}>
        </div>
        ${toggle}
      </div>
      <div class="chart-scroll">
        <svg class="chart predict-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${title} for ${spec.name}. Current ${currentVal}, projection ${projVal}`)}">
          ${grid}
          ${dots.join("")}
          ${fan}
          ${projLine}
          <polyline class="predict-prev" points="${linePts.join(" ")}" fill="none"></polyline>
          <circle class="predict-cur" cx="${cx}" cy="${cy}" r="4.5"></circle>
          ${hover}
          ${labels}
        </svg>
      </div>
      <div class="legend predict-legend">
        <span><i class="lg-predict-prev"></i>Previous</span>
        <span><i class="lg-predict-cur"></i>Current</span>
        <span><i class="lg-predict-proj"></i>Projection</span>
      </div>
      <div class="predict-stats">
        <div>
          <span><i class="lg-predict-cur"></i>Current</span>
          <strong>${esc(currentVal)}</strong>
        </div>
        <div>
          <span><i class="lg-predict-proj"></i>${finished ? "Race day" : "Projection"}</span>
          <strong>${esc(projVal)}</strong>
          ${delta ? `<em>${esc(delta)}</em>` : ""}
        </div>
      </div>
      ${renderPredictLegs(pred, mode)}
      <p class="muted small-text predict-note">${esc(pred.note)}</p>
    ${closeTag}`;
}

function renderPredictLegs(pred, mode) {
  const bands = pred?.pacingBands;
  if (!Array.isArray(bands) || !bands.length) return "";
  if (pred.spec?.sport !== "triathlon" && bands.length < 2) return "";
  return `
    <div class="predict-legs" aria-label="Per-leg pacing bands">
      ${bands.map((b) => {
        const primary = mode === "pace" ? b.goal : b.time;
        const secondary = mode === "pace" ? b.time : b.goal;
        return `
          <div>
            <span>${esc(b.leg)}</span>
            <strong>${esc(primary)}</strong>
            <em>${esc(b.solid)}${secondary && secondary !== primary ? ` · ${esc(secondary)}` : ""}</em>
          </div>`;
      }).join("")}
    </div>`;
}

function storeProgressReport(data, source = "ai") {
  const text = String(data?.report || data?.summary || "").trim();
  if (!text) return;
  PROGRESS_REPORT = {
    text,
    summary: data.summary || "",
    at: data.at || new Date().toISOString(),
    week: data.week || planProgressStats(ACTS, today())?.wk || null,
    source,
    fingerprint: data.fingerprint || progressFingerprint(),
  };
  PROGRESS_STATUS = "idle";
  persistProgressReport();
}

async function loadProgressReport() {
  const cached = readCachedProgressReport();
  if (cached?.text) {
    PROGRESS_REPORT = cached;
    if (!PROGRESS_REPORT.fingerprint) stampProgressFingerprint();
  }
  if (!CURRENT_USER_ID) return;
  const { data } = await sb.from("coach_jobs")
    .select("id, status, summary, result, updated_at, stage")
    .eq("user_id", CURRENT_USER_ID)
    .eq("stage", "progress-report")
    .eq("status", "applied")
    .order("updated_at", { ascending: false })
    .limit(1);
  const row = data?.[0];
  if (!row) return;
  const result = row.result && typeof row.result === "object" ? row.result : {};
  const text = String(result.report || row.summary || "").trim();
  if (!text) return;
  PROGRESS_REPORT = {
    text,
    summary: row.summary || "",
    at: row.updated_at,
    week: result.week || null,
    source: "ai",
    fingerprint: result.fingerprint || cached?.fingerprint || null,
  };
  if (!PROGRESS_REPORT.fingerprint) stampProgressFingerprint();
  else persistProgressReport();
}

async function requestProgressReport(opts = {}) {
  const visible = actsForCoach();
  const fp = progressFingerprint(visible);
  if (!opts.force && progressReportIsCurrent(fp)) {
    if (opts.manual) toast("Nothing new to report — no new sessions since the last write-up.");
    return;
  }
  if (!CURRENT_USER_ID) {
    storeProgressReport({ report: localProgressReport(ACTS, today()), fingerprint: fp }, "local");
    render(true);
    return;
  }
  if (PROGRESS_STATUS === "running") return;
  PROGRESS_STATUS = "running";
  render(true);
  try {
    const data = await invokeCoach({ action: "progress", snapshot: progressSnapshot(visible, today()) });
    if (data.status === "applied" && (data.report || data.summary)) {
      storeProgressReport({ ...data, fingerprint: data.fingerprint || fp }, "ai");
      if (!data.unchanged) toastCoachResult(data, "Progress report ready.");
      render(true);
      return;
    }
    if (data.jobId) pollProgressJob(data.jobId);
  } catch (err) {
    PROGRESS_STATUS = "idle";
    if (!PROGRESS_REPORT) storeProgressReport({ report: localProgressReport(ACTS, today()), fingerprint: fp }, "local");
    else stampProgressFingerprint(fp);
    toast(err.message || "Could not ask the coach. Showing a local read instead.", true);
    render(true);
  }
}

async function pollProgressJob(jobId) {
  clearTimeout(PROGRESS_POLL);
  try {
    const data = await invokeCoach({ action: "status", jobId });
    if (data.status === "applied") {
      storeProgressReport(data, "ai");
      if (!data.unchanged) toastCoachResult(data, "Progress report ready.");
      render(true);
      return;
    }
    if (data.status === "error") {
      PROGRESS_STATUS = "idle";
      if (!PROGRESS_REPORT) storeProgressReport({ report: localProgressReport(ACTS, today()) }, "local");
      else stampProgressFingerprint();
      toast(data.error || "Progress report failed.", true);
      render(true);
      return;
    }
    PROGRESS_POLL = setTimeout(() => pollProgressJob(jobId), 4000);
  } catch (err) {
    PROGRESS_STATUS = "idle";
    toast(err.message, true);
    render(true);
  }
}

async function resumeProgressJob() {
  if (!CURRENT_USER_ID) return;
  const { data } = await sb.from("coach_jobs")
    .select("id, status")
    .eq("user_id", CURRENT_USER_ID)
    .eq("stage", "progress-report")
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (data?.[0]) {
    PROGRESS_STATUS = "running";
    pollProgressJob(data[0].id);
  }
}
