// Training Pal app core (router, events, API, boot). Feature UI lives in:
// gear.js, connections.js, progress.js, home.js — loaded after this file.
function DAY_NAMES() {
  return typeof window.dayNames === "function"
    ? window.dayNames()
    : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
}
function KIND_LABEL(kind) {
  if (typeof window.kindLabel === "function") return window.kindLabel(kind);
  const fallback = {
    run: "Easy run", quality: "Quality", long: "Long run", event: "Event", race: "Race",
    walk: "Walk", ski: "Ski", swim: "Swim", walkswim: "Walk + swim", bike: "Bike", ebike: "E-bike", brick: "Brick",
    rest: "Rest", travel: "Travel",
  };
  return fallback[kind] || kind || "";
}
function tt(key, vars) {
  return typeof window.t === "function" ? window.t(key, vars) : key;
}
const KIND_MATCH = {
  run: ["run"], quality: ["run"], long: ["run", "walk"], event: ["run", "walk", "bike", "swim", "ski"],
  race: ["run", "walk", "bike", "swim", "ski"],
  walk: ["walk"], ski: ["ski"], swim: ["swim"], walkswim: ["swim"], bike: ["bike"],
  brick: ["bike", "run"],
};
const AGENDA_EVENT_SPORTS = () => (window.EVENT_SPORTS || ["run", "swim", "bike", "triathlon", "walk", "ski"]);
const LEG_SPORTS = () => AGENDA_EVENT_SPORTS().filter((s) => s !== "triathlon");

// Activity ↔ planned session matching (sport + distance + soft time-of-day).
const MATCH_SPORT_SCORE = 40;
const MATCH_DIST_MAX = 50;
const MATCH_TIME_MAX = 12;

function plannedSportCats(kind) {
  return KIND_MATCH[kind] || [];
}

function parsePlannedDistance(plan) {
  if (!plan) return null;
  const cat = plannedLogSport(plan);
  let n = Number(plan.km);
  const label = String(plan.label || "");

  if (!(n > 0)) {
    const swimM = label.match(/(\d+(?:\.\d+)?)\s*m\b/i);
    if (cat === "swim" && swimM) {
      return { value: Number(swimM[1]), unit: "m", cat };
    }
    const range = label.match(/(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)/);
    if (range) n = (Number(range[1]) + Number(range[2])) / 2;
    else {
      const km = label.match(/(\d+(?:\.\d+)?)\s*km\b/i);
      if (km) n = Number(km[1]);
    }
  }
  if (!(n > 0)) return null;

  // Swim activities store metres; plan day[2] / "X km" labels are kilometres.
  if (cat === "swim") {
    if (n >= 50) return { value: n, unit: "m", cat }; // already metres (race labels)
    return { value: Math.round(n * 1000), unit: "m", cat };
  }
  return { value: n, unit: "km", cat };
}

function activityHour(a) {
  const raw = String(a?.datetime || "");
  const h = Number(raw.slice(11, 13));
  return Number.isFinite(h) ? h : null;
}

function matchTimeBonus(plan, act) {
  const hour = activityHour(act);
  if (hour == null || !plan) return 0;
  const kind = plan.kind;
  if (kind === "long" || kind === "event" || kind === "race" || kind === "brick") {
    if (hour >= 5 && hour <= 11) return MATCH_TIME_MAX;
    if (hour >= 12 && hour <= 15) return 4;
    return 0;
  }
  if (kind === "quality") {
    if ((hour >= 6 && hour <= 9) || (hour >= 16 && hour <= 20)) return 10;
    return 0;
  }
  return 0;
}

function matchDistanceScore(planned, act) {
  if (!planned || !(planned.value > 0) || !(Number(act?.dist) > 0)) {
    return { points: 0, relErr: null };
  }
  const relErr = Math.abs(1 - (Number(act.dist) / planned.value));
  let points = 0;
  if (relErr <= 0.12) points = MATCH_DIST_MAX;
  else if (relErr <= 0.25) points = 38;
  else if (relErr <= 0.4) points = 25;
  else if (relErr <= 0.6) points = 12;
  else points = 4;
  return { points, relErr };
}

function scoreActivityAgainstPlan(act, plan) {
  if (!act || !plan) return null;
  const wanted = plannedSportCats(plan.kind);
  if (!wanted.length || !wanted.includes(act.cat)) return null;
  const planned = parsePlannedDistance(plan);
  const dist = matchDistanceScore(planned, act);
  const time = matchTimeBonus(plan, act);
  const score = Math.min(100, MATCH_SPORT_SCORE + dist.points + time);
  const confidence = score >= 78 ? "high" : score >= 55 ? "medium" : "low";
  return {
    score,
    confidence,
    sportOk: true,
    relErr: dist.relErr,
    plannedDist: planned,
  };
}

function matchPlanDay(plan, dayActs) {
  const acts = Array.isArray(dayActs) ? dayActs : [];
  const wanted = plan ? plannedSportCats(plan.kind) : [];
  if (!plan || !wanted.length) {
    return {
      trainable: false,
      done: false,
      matched: null,
      match: null,
      unmatched: acts.slice(),
      byDatetime: {},
    };
  }

  // Bricks need both bike and run legs when possible.
  if (plan.kind === "brick") {
    const byCat = { bike: null, run: null };
    const byDatetime = {};
    for (const cat of ["bike", "run"]) {
      const scored = acts
        .filter((a) => a.cat === cat)
        .map((a) => ({ a, m: scoreActivityAgainstPlan(a, { ...plan, kind: cat === "bike" ? "bike" : "run" }) }))
        .filter((row) => row.m)
        .sort((x, y) => y.m.score - x.m.score);
      if (scored[0]) {
        byCat[cat] = scored[0];
        byDatetime[scored[0].a.datetime] = { ...scored[0].m, leg: cat };
      }
    }
    const parts = [byCat.bike, byCat.run].filter(Boolean);
    const done = parts.length >= 2;
    const partial = parts.length === 1;
    const primary = byCat.bike || byCat.run;
    const unmatched = acts.filter((a) => !byDatetime[a.datetime]);
    const confidence = done
      ? (parts.every((p) => p.m.confidence === "high") ? "high" : "medium")
      : (partial ? "low" : null);
    return {
      trainable: true,
      done,
      partial,
      matched: primary?.a || null,
      match: primary
        ? { ...primary.m, confidence: confidence || primary.m.confidence, brickLegs: parts.length }
        : null,
      unmatched,
      byDatetime,
    };
  }

  const scored = acts
    .map((a) => ({ a, m: scoreActivityAgainstPlan(a, plan) }))
    .filter((row) => row.m);
  scored.sort((x, y) => {
    if (y.m.score !== x.m.score) return y.m.score - x.m.score;
    return String(x.a.datetime).localeCompare(String(y.a.datetime));
  });

  const best = scored[0] || null;
  const matched = best?.a || null;
  const match = best?.m || null;
  const byDatetime = {};
  if (matched) byDatetime[matched.datetime] = match;
  const unmatched = acts.filter((a) => a.datetime !== matched?.datetime);

  return {
    trainable: true,
    done: !!matched,
    matched,
    match,
    unmatched,
    byDatetime,
  };
}

function planDayDone(plan, dayActs) {
  return matchPlanDay(plan, dayActs).done;
}

function matchConfidenceLabel(confidence) {
  if (confidence === "high") return tt("day.matchHigh");
  if (confidence === "medium") return tt("day.matchMedium");
  if (confidence === "low") return tt("day.matchLow");
  return tt("day.matched");
}

const pad = (n) => String(n).padStart(2, "0");
const parseDate = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const daysBetween = (a, b) => Math.round((b - a) / 864e5);
const fmt = (d, opts) => d.toLocaleDateString(
  typeof window.localeTag === "function" ? window.localeTag() : "en-GB",
  opts
);
const short = (d) => fmt(d, { day: "numeric", month: "short" });
const KM_PER_MILE = 1.609344;
const LB_PER_KG = 2.2046226218;
const IMPERIAL_REGIONS = new Set(["US", "LR", "MM"]);

function guessUnitsFromLocale() {
  try {
    const loc = new Intl.Locale(navigator.language || "en").maximize();
    const region = String(loc.region || "").toUpperCase();
    if (IMPERIAL_REGIONS.has(region)) return "imperial";
  } catch { /* ignore */ }
  return "metric";
}

function normalizeUnits(raw) {
  return raw === "imperial" ? "imperial" : "metric";
}

function profileUnits() {
  return normalizeUnits(window.CURRENT_PROFILE?.units);
}

function isImperial() {
  return profileUnits() === "imperial";
}

function distUnit() {
  return isImperial() ? "mi" : "km";
}

function weightUnit() {
  return isImperial() ? "lb" : "kg";
}

function fmtNum(n, digits = 2) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "";
  return String(Number(x.toFixed(digits)));
}

// Raw km number formatting (storage units). Prefer fmtDist for UI.
const fmtKm = (n) => fmtNum(n, 2);

function fmtDist(km, digits = 2) {
  const x = Number(km);
  if (!Number.isFinite(x)) return "";
  return isImperial() ? fmtNum(x / KM_PER_MILE, digits) : fmtNum(x, digits);
}

function fmtDistWithUnit(km, digits = 2) {
  const n = fmtDist(km, digits);
  return n ? `${n} ${distUnit()}` : "";
}

function parseDistInput(value) {
  const x = Number(value);
  if (!Number.isFinite(x)) return NaN;
  return isImperial() ? x * KM_PER_MILE : x;
}

function displayDistValue(km, digits = 2) {
  const n = fmtDist(km, digits);
  return n;
}

function fmtWeight(kg, digits = 1) {
  const x = Number(kg);
  if (!Number.isFinite(x) || x <= 0) return "";
  return isImperial() ? fmtNum(x * LB_PER_KG, digits) : fmtNum(x, digits);
}

function fmtWeightWithUnit(kg, digits = 1) {
  const n = fmtWeight(kg, digits);
  return n ? `${n} ${weightUnit()}` : "";
}

function parseWeightInput(value) {
  const x = Number(value);
  if (!Number.isFinite(x) || x <= 0) return null;
  return isImperial() ? x / LB_PER_KG : x;
}

function parsePaceToSec(str) {
  const m = String(str || "").trim().match(/^(\d+):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function fmtPaceSec(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

function fmtRunPace(paceStr) {
  if (!paceStr) return "";
  if (!isImperial()) return `${paceStr}/km`;
  const sec = parsePaceToSec(paceStr);
  if (sec == null) return `${paceStr}/km`;
  return `${fmtPaceSec(sec * KM_PER_MILE)}/mi`;
}

function fmtBikeSpeed(paceStr) {
  const x = Number(paceStr);
  if (!Number.isFinite(x)) return paceStr ? `${paceStr} km/h` : "";
  if (!isImperial()) return `${fmtNum(x, 1)} km/h`;
  return `${fmtNum(x / KM_PER_MILE, 1)} mph`;
}

function paceSuffix(sport) {
  if (sport === "swim") return " /100m";
  if (sport === "bike" || sport === "ebike") return isImperial() ? " mph" : " km/h";
  return isImperial() ? " /mi" : " /km";
}

function distSuffix(sport) {
  if (sport === "swim") return " m";
  return ` ${distUnit()}`;
}

function logDistUnit(sport) {
  return sport === "swim" ? "m" : distUnit();
}

const fmtPlanLabel = (label) => String(label ?? "").replace(/-?\d+\.\d+/g, (m) => fmtDist(m));
window.fmtKm = fmtKm;
window.fmtDist = fmtDist;
window.fmtDistWithUnit = fmtDistWithUnit;
window.fmtPlanLabel = fmtPlanLabel;
window.fmtWeight = fmtWeight;
window.fmtWeightWithUnit = fmtWeightWithUnit;
window.parseDistInput = parseDistInput;
window.parseWeightInput = parseWeightInput;
window.distUnit = distUnit;
window.weightUnit = weightUnit;
window.isImperial = isImperial;
window.profileUnits = profileUnits;
window.guessUnitsFromLocale = guessUnitsFromLocale;
window.normalizeUnits = normalizeUnits;
window.displayDistValue = displayDistValue;
window.logDistUnit = logDistUnit;

let START, RACE;
window.syncPlanDates = function syncPlanDates() {
  START = parseDate(PLAN_START);
  RACE = parseDate(MARATHON_DATE);
};
const eventLabel = () => (window.CURRENT_PLAN && window.CURRENT_PLAN.event_name) || "race";

function today() {
  const override = new URLSearchParams(location.search).get("date");
  if (override) return parseDate(override);
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}

const weekStart = (wk) => addDays(START, (wk - 1) * 7);
const weekOf = (date) => Math.floor(daysBetween(START, date) / 7) + 1;
const phaseOf = (wk) => PHASES.find((p) => wk >= p.from && wk <= p.to) || PHASES[0] || { name: "", focus: "" };

// ---------- Activities CSV ----------

function parseCSV(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

function categorize(type) {
  const t = String(type || "").toLowerCase();
  if (t.includes("run")) return "run";
  if (t.includes("swim")) return "swim";
  // E-bike before bike: "ebike" / "e_bike" also match the generic "bik" check.
  if (/e[\s_-]*bike|electric[\s_-]*bike|ebiking/.test(t)) return "ebike";
  // Strava uses "Ride" / "Gravel Ride" / "VirtualRide"; Garmin often "cycling".
  if (
    t.includes("cycl") || t.includes("bik") || t.includes("ride") ||
    t.includes("gravel")
  ) return "bike";
  if (t.includes("ski") || t.includes("snowboard") || t.includes("piste")) return "ski";
  if (t.includes("walk") || t.includes("hik")) return "walk";
  return null;
}

function mapCsvRows(rows) {
  return rows.map((r) => {
    const cat = categorize(r["Activity Type"] || "");
    if (!cat) return null;
    const dist = parseFloat((r["Distance"] || "").replace(/,/g, ""));
    const when = r["Date"] || "";
    if (!when) return null;
    return {
      datetime: when,
      date: when.slice(0, 10),
      raw: r,
      cat,
      title: r["Title"],
      dist: isNaN(dist) ? null : dist,
      time: r["Time"],
      hr: r["Avg HR"] !== "--" ? r["Avg HR"] : null,
      pace: r["Avg Pace"] !== "--" ? r["Avg Pace"] : null,
    };
  }).filter(Boolean);
}

function formatStarted(value) {
  if (!value) return "";
  return String(value).replace("T", " ").slice(0, 19);
}

function mapDbActivity(row) {
  const raw = row.raw && typeof row.raw === "object" && Object.keys(row.raw).length
    ? row.raw
    : {
      "Activity Type": row.activity_type,
      Date: formatStarted(row.started_at),
      Title: row.title,
      Distance: row.distance != null
        ? String(/swim/i.test(String(row.activity_type || "")) ? Math.round(Number(row.distance)) : Number(Number(row.distance).toFixed(2)))
        : "--",
      Time: row.duration || "--",
      "Avg HR": row.avg_hr != null ? String(row.avg_hr) : "--",
      "Avg Pace": row.avg_pace || "--",
    };
  if (!raw.Date) raw.Date = formatStarted(row.started_at);
  if (!raw["Activity Type"]) raw["Activity Type"] = row.activity_type;
  return mapCsvRows([raw])[0] || null;
}

function csvToDbRow(r, userId) {
  const type = String(r["Activity Type"] || "").trim();
  const started = String(r.Date || "").trim();
  if (!type || !started) return null;
  const dist = parseFloat(String(r.Distance || "").replace(/,/g, ""));
  const avgHr = parseInt(String(r["Avg HR"] || "").replace(/,/g, ""), 10);
  const maxHr = parseInt(String(r["Max HR"] || "").replace(/,/g, ""), 10);
  return {
    user_id: userId,
    activity_type: type,
    started_at: started,
    title: r.Title && r.Title !== "--" ? r.Title : null,
    distance: Number.isFinite(dist) ? dist : null,
    duration: r.Time && r.Time !== "--" ? r.Time : null,
    avg_hr: Number.isFinite(avgHr) ? avgHr : null,
    max_hr: Number.isFinite(maxHr) ? maxHr : null,
    avg_pace: r["Avg Pace"] && r["Avg Pace"] !== "--" ? r["Avg Pace"] : null,
    raw: {
      "Activity Type": type,
      Date: started,
      Title: r.Title && r.Title !== "--" ? r.Title : "",
      Distance: r.Distance || "",
      Time: r.Time || "",
      "Avg HR": r["Avg HR"] || "",
      "Max HR": r["Max HR"] || "",
      "Avg Pace": r["Avg Pace"] || "",
    },
  };
}

function skipActsKey() {
  return `skip-acts:${CURRENT_USER_ID || "anon"}`;
}

function loadLocalActivities() {
  try {
    const raw = localStorage.getItem(skipActsKey());
    if (!raw) return [];
    const rows = JSON.parse(raw);
    return Array.isArray(rows) ? mapCsvRows(rows) : [];
  } catch {
    return [];
  }
}

function saveLocalActivities(rows) {
  localStorage.setItem(skipActsKey(), JSON.stringify(rows));
}

window.typicalWeeklyKm = function typicalWeeklyKm(acts, sport) {
  const cat = sport === "swim" ? "swim" : sport === "bike" ? "bike" : "run";
  const now = today();
  const from = ymd(addDays(now, -28));
  const pool = (acts || []).filter((a) => a.cat === cat && a.dist > 0 && a.date >= from);
  const fallback = (acts || []).filter((a) => a.cat === cat && a.dist > 0).slice(-16);
  const use = pool.length ? pool : fallback;
  if (!use.length) return null;
  const weeks = {};
  use.forEach((a) => {
    const d = parseDate(a.date);
    const mon = ymd(addDays(d, -((d.getDay() + 6) % 7)));
    weeks[mon] = (weeks[mon] || 0) + (a.dist || 0);
  });
  const vals = Object.values(weeks).filter((v) => v > 0).sort((a, b) => a - b);
  if (!vals.length) return null;
  let km = vals[Math.floor(vals.length / 2)];
  if (cat === "swim" && km > 30) km = km / 1000;
  return Math.max(1, Math.round(km * 10) / 10);
};

window.peekActivities = () => {
  if (typeof ACTS !== "undefined" && Array.isArray(ACTS) && ACTS.length) return ACTS;
  if (Array.isArray(window._setupActs) && window._setupActs.length) return window._setupActs;
  if (typeof ACTS !== "undefined" && Array.isArray(ACTS)) return ACTS;
  return [];
};

window.searchPublicEvents = async function searchPublicEvents(q) {
  const safe = String(q || "").trim().replace(/[%_,]/g, "").slice(0, 80);
  if (safe.length < 2) return [];
  const todayStr = ymd(today());
  const runQuery = async (columns) => {
    const { data, error } = await sb.from("race_catalog")
      .select(columns)
      .gte("date", todayStr)
      .ilike("name", `%${safe}%`)
      .order("date")
      .limit(30);
    return { data, error };
  };
  let { data, error } = await runQuery("id,name,date,km,sport,swim_m,bike_km");
  if (error) ({ data, error } = await runQuery("id,name,date,km"));
  if (error || !data) return [];
  const seen = new Set();
  return data.filter((ev) => {
    const key = `${(ev.name || "").toLowerCase()}|${ev.date}|${ev.km}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((ev) => ({
    ...ev,
    sport: typeof window.inferSportFromEvent === "function" ? window.inferSportFromEvent(ev) : (ev.sport || "run"),
  }));
};

async function loadActivities() {
  if (!CURRENT_USER_ID) return [];
  const { data, error } = await sb.from("activities")
    .select("activity_type,started_at,title,distance,duration,avg_hr,max_hr,avg_pace,raw")
    .eq("user_id", CURRENT_USER_ID)
    .order("started_at", { ascending: false });
  if (!error && data) return data.map(mapDbActivity).filter(Boolean);
  return loadLocalActivities();
}
window.loadActivities = loadActivities;


function gearFor(a) {
  const id = GEAR.assignments[a.datetime];
  return id ? GEAR.items.find((g) => g.id === id) : null;
}

function gearTypesFor(cat) {
  if (cat === "bike" || cat === "ebike") return ["bike"];
  if (cat === "run" || cat === "walk") return ["shoes"];
  if (cat === "swim") return ["swimsuit", "wetsuit"];
  return [];
}

function activityLine(a) {
  const dur = a.time && a.time.startsWith("00:") ? a.time.slice(3) : a.time;
  const gear = gearFor(a);
  const bits = [];
  if (a.cat === "swim") bits.push(`Swim ${Math.round(Number(a.dist) || 0)} m`);
  else if (a.cat === "ebike") bits.push(`E-bike ${fmtDistWithUnit(a.dist)}`);
  else if (a.cat === "bike") bits.push(`Bike ${fmtDistWithUnit(a.dist)}`);
  else if (a.cat === "walk") bits.push(`Walk ${fmtDistWithUnit(a.dist)}`);
  else if (a.cat === "ski") bits.push(`Ski ${fmtDistWithUnit(a.dist)}`);
  else bits.push(`Run ${fmtDistWithUnit(a.dist)}`);
  if (dur && a.cat !== "walk") bits.push(dur);
  if (a.pace && a.cat === "run") bits.push(fmtRunPace(a.pace));
  else if (a.pace && a.cat === "swim") bits.push(`${a.pace}/100m`);
  else if (a.pace && (a.cat === "bike" || a.cat === "ebike")) bits.push(fmtBikeSpeed(a.pace));
  if (a.hr) bits.push(`HR ${a.hr}`);
  if (gear) bits.push(esc(gear.name));
  return bits.join(" · ");
}

const LOG_TYPES = {
  run: { type: "Running", title: "Run", unitKey: "dist" },
  bike: { type: "Cycling", title: "Ride", unitKey: "dist" },
  ebike: { type: "E-Bike", title: "E-bike ride", unitKey: "dist" },
  swim: { type: "Pool Swim", title: "Swim", unitKey: "m" },
  walk: { type: "Walking", title: "Walk", unitKey: "dist" },
  ski: { type: "Ski", title: "Ski", unitKey: "dist" },
};

function isManualActivity(a) {
  return String(a?.raw?.Source || "").toLowerCase() === "manual";
}

function stravaActivityId(a) {
  const id = Number(a?.raw?.stravaActivityId);
  return Number.isFinite(id) && id > 0 ? id : 0;
}

function isStravaActivity(a) {
  return String(a?.raw?.Source || "") === "strava-api" || stravaActivityId(a) > 0;
}

function actsForCoach(acts = ACTS) {
  if (STRAVA.shareWithCoach) return acts || [];
  return (acts || []).filter((a) => !isStravaActivity(a));
}

function stravaViewLink(a) {
  const id = stravaActivityId(a);
  if (!id) return "";
  return `<a class="strava-view" href="https://www.strava.com/activities/${id}" target="_blank" rel="noopener">View on Strava</a>`;
}

function plannedLogSport(plan) {
  if (!plan) return "run";
  if (plan.kind === "ski" || plan.kind === "walk" || plan.kind === "swim" || plan.kind === "bike") {
    return plan.kind;
  }
  const label = String(plan.label || "").toLowerCase();
  if (/\bski|skiing\b/.test(label)) return "ski";
  if (/\bwalk|walking\b/.test(label)) return "walk";
  if (/\bswim\b/.test(label)) return "swim";
  if (/\bbike|cycl|ride\b/.test(label)) return "bike";
  const wanted = KIND_MATCH[plan.kind] || [];
  return wanted[0] || "run";
}

function formatHms(sec) {
  const total = Math.max(0, Math.round(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function parseDurationInput(raw) {
  const text = String(raw || "").trim();
  if (!text) return { text: null, sec: null };
  if (/^\d{1,3}$/.test(text)) {
    const mins = Number(text);
    if (!(mins > 0 && mins < 24 * 60)) throw new Error("Time should be minutes, mm:ss or hh:mm:ss.");
    return { text: formatHms(mins * 60), sec: mins * 60 };
  }
  const parts = text.split(":").map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) throw new Error("Time should be minutes, mm:ss or hh:mm:ss.");
  let sec = 0;
  if (parts.length === 2) {
    if (parts[1] >= 60) throw new Error("Seconds must be under 60.");
    sec = parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    if (parts[1] >= 60 || parts[2] >= 60) throw new Error("Minutes and seconds must be under 60.");
    sec = parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else {
    throw new Error("Time should be minutes, mm:ss or hh:mm:ss.");
  }
  if (!(sec > 0 && sec < 24 * 3600)) throw new Error("Enter a session time under 24 hours.");
  return { text: formatHms(sec), sec };
}

function computeAvgPace(cat, dist, sec) {
  if (!(dist > 0) || !(sec > 0) || typeof fmtPace !== "function") return null;
  if (cat === "run" || cat === "walk") return fmtPace(sec / dist);
  if (cat === "swim") return fmtPace(sec / (dist / 100));
  if (cat === "bike" || cat === "ebike") return (dist / (sec / 3600)).toFixed(1);
  return null;
}

function uniqueStartedAt(ds) {
  const now = new Date();
  let t = ds === ymd(today())
    ? `${ds} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
    : `${ds} 12:00:00`;
  const taken = new Set(ACTS.map((a) => a.datetime));
  while (taken.has(t)) {
    const [date, time] = t.split(" ");
    const [h, m, s] = time.split(":").map(Number);
    const next = parseDate(date);
    next.setHours(h, m, s + 1);
    t = `${ymd(next)} ${pad(next.getHours())}:${pad(next.getMinutes())}:${pad(next.getSeconds())}`;
  }
  return t;
}

function logSessionFields(sport, { distance = "", duration = "", hr = "", date = "", showDate = false } = {}) {
  const spec = LOG_TYPES[sport] || LOG_TYPES.run;
  const swim = spec === LOG_TYPES.swim;
  const unit = logDistUnit(sport);
  const displayDist = distance === "" || distance == null
    ? ""
    : (swim ? String(distance) : displayDistValue(distance));
  const option = (value, label) => `<option value="${value}" ${sport === value ? "selected" : ""}>${label}</option>`;
  return `
    ${showDate ? `
      <label>Date
        <input type="date" name="date" required max="${ymd(today())}" value="${esc(date || ymd(today()))}" />
      </label>` : ""}
    <label>Type
      <select name="type">
        ${option("run", "Run")}
        ${option("bike", "Bike")}
        ${option("ebike", "E-bike")}
        ${option("swim", "Swim")}
        ${option("walk", "Walk")}
        ${option("ski", "Ski")}
      </select>
    </label>
    <label>Distance (<span data-unit>${unit}</span>)
      <input type="number" name="distance" required min="${swim ? "25" : "0.1"}" step="${swim ? "25" : "0.01"}" value="${esc(displayDist)}" />
    </label>
    <label>Time <span class="opt">(optional)</span>
      <input type="text" name="duration" placeholder="45:00" inputmode="numeric" autocomplete="off" value="${esc(duration)}" />
    </label>
    <label>Avg HR <span class="opt">(optional)</span>
      <input type="number" name="hr" min="40" max="220" step="1" placeholder="bpm" value="${esc(hr)}" />
    </label>`;
}

function logSessionForm(ds, plan, dayActs) {
  if (parseDate(ds) > today()) return "";
  const sport = plannedLogSport(plan);
  const dayMatch = matchPlanDay(plan, dayActs);
  const matched = dayMatch.done;
  const trainable = dayMatch.trainable;
  const prefill = plan && sport !== "swim" && Number(plan.km) > 0 ? plan.km : "";
  return `
    <section class="log-session">
      <details class="log-details" ${matched ? "" : "open"}>
        <summary>${trainable && !matched ? "Mark as done" : "Log a session"}</summary>
        <form class="log-form" data-date="${esc(ds)}">
          <p class="muted small-text">For today or an older day. Distance is enough; time and heart rate help the coach comments.</p>
          <div class="log-fields">
            ${logSessionFields(sport, { distance: prefill })}
          </div>
          <div class="form-actions">
            <span class="form-error"></span>
            <button class="button small" type="submit">Save session</button>
          </div>
        </form>
      </details>
    </section>`;
}

let activityLogOpen = false;
let activityLogDraft = null;

function captureActivityLogDraft() {
  if (!activityLogOpen) return;
  const form = document.querySelector("#app .log-form-page");
  if (!form) return;
  activityLogDraft = Object.fromEntries(new FormData(form));
}

function activityPageLogForm() {
  const draft = activityLogDraft || {};
  const filter = selectedActivityFilter();
  const sport = LOG_TYPES[draft.type] ? draft.type : (LOG_TYPES[filter] ? filter : "run");
  return `
    <form class="log-form log-form-page">
      <p class="muted small-text">For today or an older day. Distance is enough; time and heart rate help the coach comments.</p>
      <div class="log-fields log-fields-dated">
        ${logSessionFields(sport, {
          showDate: true,
          date: draft.date || ymd(today()),
          distance: draft.distance || "",
          duration: draft.duration || "",
          hr: draft.hr || "",
        })}
      </div>
      <div class="form-actions">
        <span class="form-error"></span>
        <button class="button ghost small" type="button" data-action="toggle-activity-log">Cancel</button>
        <button class="button small" type="submit">Save session</button>
      </div>
    </form>`;
}

// ---------- Rendering helpers ----------

let EVENTS = [];
let eventFormDraft = null;
let eventFollowUpId = null;
let eventEditingId = null;
let eventPersonalDraft = null;

function captureEventFormDraft(formEl) {
  const form = formEl || document.querySelector("#app .event-form");
  if (!form) return;
  if (form.hidden) {
    if (!eventEditingId) eventFormDraft = null;
    return;
  }
  syncLegsJson(form);
  const fields = Object.fromEntries(new FormData(form));
  if (fields.legs_json) {
    try { fields.legs = JSON.parse(fields.legs_json); } catch { /* keep string */ }
  }
  eventFormDraft = {
    open: true,
    locked: form.classList.contains("from-public"),
    editId: form.dataset.editId || eventEditingId || null,
    fields,
  };
  if (form.dataset.editId) eventEditingId = form.dataset.editId;
}
function rememberEventForm(form) {
  captureEventFormDraft(form);
}

function captureEventPersonalDraft(formEl) {
  const form = formEl || document.querySelector("#app .event-personal.is-followup");
  if (!form) return;
  const id = form.dataset.id;
  if (!id || (eventFollowUpId && String(id) !== String(eventFollowUpId))) return;
  eventPersonalDraft = {
    id: String(id),
    effort: form.effort?.value || "",
    note: form.querySelector("[name=note]")?.value || "",
  };
}
function rememberEventPersonal(form) {
  captureEventPersonalDraft(form);
}

function restoreEventFormDraft(root) {
  const form = root.querySelector(".event-form");
  if (!form || !eventFormDraft?.open) return;
  if (eventFormDraft.editId) form.dataset.editId = eventFormDraft.editId;
  if (eventFormDraft.locked) setAgendaEventLocked(form, true);
  const search = form.querySelector("input[name=event_search]");
  if (search && !eventFormDraft.locked && search.value.trim().length >= 2) {
    search.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function agendaFieldsFromEvent(ev) {
  if (!ev) return {};
  const legs = Array.isArray(ev.legs) ? ev.legs : [];
  return {
    date: String(ev.date || "").slice(0, 10),
    end_date: String(ev.end_date || ev.date || "").slice(0, 10),
    name: ev.name || "",
    location: ev.location || "",
    kind: ev.kind || "race",
    sport: ev.sport || "run",
    km: ev.km != null ? String(ev.km) : "",
    event_note: ev.event_note || "",
    is_public: ev.is_public ? "yes" : "no",
    legs,
    legs_json: JSON.stringify(legs),
    swim_m: ev.swim_m != null ? String(ev.swim_m) : "",
    bike_km: ev.bike_km != null ? String(ev.bike_km) : "",
    source_id: ev.source_id || "",
    preset: "custom",
  };
}

function eventSharesPublicly(ev) {
  return !!(ev && (ev.is_public || ev.source_id));
}

function openEventFormForEdit(ev) {
  if (!ev?.id) return;
  captureEventPersonalDraft();
  eventFollowUpId = null;
  eventEditingId = String(ev.id);
  eventFormDraft = {
    open: true,
    locked: !!ev.source_id,
    editId: String(ev.id),
    fields: agendaFieldsFromEvent(ev),
  };
  render(true);
  document.getElementById("events")?.scrollIntoView({ block: "start" });
}
const EFFORT_LABEL = { easy: "easy", steady: "steady", race: "race pace", other: "something else" };

function effortLabel(effort) {
  return EFFORT_LABEL[effort] || "easy";
}

function clipText(value, max) {
  return String(value || "").trim().slice(0, max);
}

function columnMissing(error, column) {
  const msg = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`;
  return error?.code === "PGRST204" || error?.code === "42703" || msg.includes(column);
}
const LONG_KINDS = ["long", "event", "race"];

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

async function loadEvents() {
  if (!CURRENT_USER_ID) return [];
  const { data, error } = await sb.from("events").select("*").eq("user_id", CURRENT_USER_ID).order("date");
  if (error) return [];
  return data || [];
}
window.loadEvents = loadEvents;
window.peekEvents = () => EVENTS;

function ownsEvent(ev) {
  return !!(ev && !ev.source_id);
}

const eventsOn = (dateStr) => {
  const ds = String(dateStr || "").slice(0, 10);
  return EVENTS.filter((e) => (
    typeof window.eventCoversDate === "function"
      ? window.eventCoversDate(e, ds)
      : eventDay(e) === ds
  ));
};

function isGoalRace(ev) {
  if (!ev) return false;
  if (ev.race) return true;
  const plan = window.CURRENT_PLAN;
  if (!plan) return false;
  const sameName = !plan.event_name || plan.event_name === ev.name;
  if (plan.event_date === ev.date && sameName) return true;
  if (plan.event_end_date && sameName) {
    const start = String(ev.date || "").slice(0, 10);
    const end = typeof window.eventEndYmd === "function" ? window.eventEndYmd(ev) : start;
    return plan.event_date === start && plan.event_end_date === end;
  }
  return false;
}

// An added event that the plan doesn't account for yet: flag when the same week already has a long run.
function eventConflict(week, dayIndex, ev) {
  if (ev.km < 8) return "";
  const otherLong = week.days.findIndex((d, i) => i !== dayIndex && LONG_KINDS.includes(d[0]));
  if (otherLong === -1) return "";
  const [, label] = week.days[otherLong];
  return `This week also has a long run on ${DAY_NAMES()[otherLong]} (${esc(fmtPlanLabel(label))}). Consider letting the event replace it so you don't stack two longs.`;
}

function eventLines(week, dayIndex, ds) {
  const [kind, label = ""] = week.days[dayIndex] || [];
  return eventsOn(ds).map((ev) => {
    const name = String(ev?.name || "");
    // Day/session already names this event (or is the woven event day) — week ★ badge is enough.
    if (kind === "event" || kind === "race") return "";
    if (name && String(label).includes(name)) return "";
    const conflict = eventConflict(week, dayIndex, ev);
    const multi = !!(ev.end_date && ev.end_date > ev.date);
    const distBit = multi || !(Number(ev.km) >= 1) ? "" : ` · ${fmtDistWithUnit(ev.km)}`;
    return `
      <div class="event-note">★ ${esc(ev.name)}${distBit} · ${effortLabel(ev.effort)}${ev.note ? ` — ${esc(ev.note)}` : ""}</div>
      ${conflict ? `<div class="event-warn">${conflict}</div>` : ""}`;
  }).join("");
}

// ---------- Feedback & day details ----------

let FEEDBACK = { weeks: {}, activities: {} };
let BUSY = {};
let CHANGES = [];
let GEAR = { items: [], assignments: {} };

async function loadBusy() {
  if (!CURRENT_USER_ID) return {};
  const { data, error } = await sb.from("busy_days").select("*").eq("user_id", CURRENT_USER_ID);
  if (error) return {};
  return Object.fromEntries((data || []).map((r) => [r.date, { reason: r.reason, session: r.session }]));
}
async function loadChanges() {
  if (!CURRENT_USER_ID) return [];
  const { data, error } = await sb.from("changes").select("*").eq("user_id", CURRENT_USER_ID).order("created_at", { ascending: false });
  if (error) return [];
  return (data || []).map((c) => ({ ...c, createdAt: c.created_at }));
}

async function loadFeedback() {
  if (!CURRENT_USER_ID) return { weeks: {}, activities: {} };
  const [{ data: weeks }, { data: acts }] = await Promise.all([
    sb.from("week_feedback").select("week,text").eq("user_id", CURRENT_USER_ID),
    sb.from("activity_feedback").select("started_at,text").eq("user_id", CURRENT_USER_ID),
  ]);
  const weekMap = {};
  for (const row of weeks || []) weekMap[String(row.week)] = row.text;
  const actMap = {};
  for (const row of acts || []) actMap[formatStarted(row.started_at)] = row.text;
  return { weeks: weekMap, activities: actMap };
}

function hasPlan() {
  return !!(window.CURRENT_PLAN && Array.isArray(window.WEEKS) && window.WEEKS.length && window.PLAN_START);
}

function weekRunKm(week, acts) {
  const from = ymd(weekStart(week.wk)), to = ymd(addDays(weekStart(week.wk), 6));
  return acts.filter((a) => a.cat === "run" && a.date >= from && a.date <= to).reduce((s, a) => s + (a.dist || 0), 0);
}

function mondayOf(date) {
  return addDays(date, -((date.getDay() + 6) % 7));
}

function planFor(ds) {
  if (!hasPlan()) return null;
  const date = parseDate(ds);
  if (Number.isNaN(date.getTime())) return null;
  const wk = weekOf(date);
  const week = WEEKS[wk - 1];
  if (!week || date < START) return null;
  const i = daysBetween(weekStart(wk), date);
  const day = week.days?.[i];
  if (!day) return null;
  const [kind, label, km] = day;
  return { week, i, kind, label: fmtPlanLabel(label), km };
}

// The week to review: this week once something is logged in it, otherwise last week.
function reviewWeek(acts, now) {
  const wk = weekOf(now);
  const cur = WEEKS[wk - 1];
  if (!cur) return null;
  const s = ymd(weekStart(wk));
  const hasActs = acts.some((a) => a.date >= s && a.date <= ymd(now) && a.cat !== "walk");
  return hasActs || wk === 1 ? cur : WEEKS[wk - 2];
}

function reviewWeekActs(week, acts) {
  if (!week) return [];
  const from = ymd(weekStart(week.wk));
  const to = ymd(addDays(weekStart(week.wk), 6));
  return (acts || []).filter((a) => a.date >= from && a.date <= to && a.cat !== "walk");
}

function feedbackFingerprint(week, acts = ACTS) {
  const rows = reviewWeekActs(week, acts)
    .map((a) => `${a.datetime}|${a.cat}|${a.dist ?? ""}|${a.time || ""}|${a.pace || ""}|${a.hr || ""}`)
    .sort();
  return hashText([week.wk, ...rows].join("\n"));
}

function feedbackIsCurrent(week, acts = ACTS) {
  if (!week || !WEEK_FEEDBACK_STAMP) return false;
  return WEEK_FEEDBACK_STAMP.week === week.wk
    && WEEK_FEEDBACK_STAMP.fingerprint === feedbackFingerprint(week, acts);
}

function reviewBlock(week, acts, now) {
  const note = FEEDBACK.weeks[String(week.wk)];
  return `
    ${note ? `<p class="coach-text">${esc(note)}</p>` : ""}
    <p class="auto-text">${esc(weekFeedback(week, acts, now))}</p>`;
}

function reviewCard(acts, now, opts = {}) {
  const week = reviewWeek(acts, now);
  if (!week) return "";
  const isCurrent = week.wk === weekOf(now);
  const sessions = reviewWeekActs(week, acts);
  const aiActs = actsForCoach(acts);
  const aiSessions = reviewWeekActs(week, aiActs);
  const writing = FEEDBACK_STATUS === "writing";
  const hasNote = !!FEEDBACK.weeks[String(week.wk)];
  const planNote = opts.includePlanNote ? String(week.note || "").trim() : "";
  const current = aiSessions.length > 0 && feedbackIsCurrent(week, aiActs);
  const showButton = writing || (aiSessions.length > 0 && !current);
  const label = writing ? "Writing…" : hasNote ? "Update feedback" : "Request feedback";
  const stamped = WEEK_FEEDBACK_STAMP?.week === week.wk && !!WEEK_FEEDBACK_STAMP.fingerprint;
  const hiddenStrava = sessions.length > aiSessions.length;
  const hintParts = [];
  if (writing) hintParts.push("Writing feedback from this week's sessions.");
  else if (hasNote && stamped && !current) hintParts.push("New sessions since this coach note.");
  if (hiddenStrava) hintParts.push("Strava sessions stay in your log. Allow AI coach sharing on Connections to include them.");
  const hint = hintParts.join(" ");
  return `
    <section class="card review">
      <div class="card-head">
        <div>
          <div class="eyebrow">${isCurrent ? tt("home.thisWeekReview") : tt("home.lastWeekReview")}</div>
          <h2>${tt("home.weekFeedbackTitle", { week: week.wk })}</h2>
        </div>
        ${showButton ? `<button type="button" class="button ghost small" data-action="request-feedback"${writing ? " disabled" : ""}>${label}</button>` : ""}
      </div>
      ${reviewBlock(week, acts, now)}
      ${planNote ? `<p class="week-review-note">${esc(planNote)}</p>` : ""}
      ${hint ? `<p class="muted small-text">${hint}</p>` : ""}
    </section>`;
}

const STAT_FIELDS = {
  run: [
    ["Distance", "Distance", distSuffix("run")], ["Time", "Time"], ["Moving time", "Moving Time"], ["Avg pace", "Avg Pace", paceSuffix("run")],
    ["Best pace", "Best Pace", paceSuffix("run")], ["Grade-adj. pace", "Avg GAP", paceSuffix("run")], ["Avg HR", "Avg HR", " bpm"], ["Max HR", "Max HR", " bpm"],
    ["Aerobic TE", "Aerobic TE"], ["Effect", "TE Label"], ["Cadence", "Avg Run Cadence", " spm"], ["Stride length", "Avg Stride Length", " m"],
    ["Ground contact", "Avg Ground Contact Time", " ms"], ["Vertical ratio", "Avg Vertical Ratio", " %"], ["Vertical osc.", "Avg Vertical Oscillation", " cm"],
    ["Avg power", "Avg Power", " W"], ["Ascent", "Total Ascent", " m"], ["Calories", "Calories", " kcal"], ["Steps", "Steps"],
    ["Laps", "Number of Laps"], ["Body Battery", "Body Battery Drain"],
  ],
  swim: [
    ["Distance", "Distance", " m"], ["Time", "Time"], ["Moving time", "Moving Time"], ["Avg pace", "Avg Pace", " /100m"],
    ["Best pace", "Best Pace", " /100m"], ["Avg HR", "Avg HR", " bpm"], ["Max HR", "Max HR", " bpm"], ["Aerobic TE", "Aerobic TE"],
    ["Total strokes", "Total Strokes"], ["Swolf", "Avg. Swolf"], ["Stroke rate", "Avg Stroke Rate", " /min"], ["Lengths", "Number of Laps"],
    ["Calories", "Calories", " kcal"],
  ],
  bike: [
    ["Distance", "Distance", distSuffix("bike")], ["Time", "Time"], ["Moving time", "Moving Time"], ["Avg speed", "Avg Pace", paceSuffix("bike")],
    ["Max speed", "Best Pace", paceSuffix("bike")], ["Avg HR", "Avg HR", " bpm"], ["Max HR", "Max HR", " bpm"], ["Aerobic TE", "Aerobic TE"],
    ["Ascent", "Total Ascent", " m"], ["Calories", "Calories", " kcal"], ["Body Battery", "Body Battery Drain"],
  ],
  ebike: [
    ["Distance", "Distance", distSuffix("ebike")], ["Time", "Time"], ["Moving time", "Moving Time"], ["Avg speed", "Avg Pace", paceSuffix("ebike")],
    ["Max speed", "Best Pace", paceSuffix("ebike")], ["Avg HR", "Avg HR", " bpm"], ["Max HR", "Max HR", " bpm"], ["Aerobic TE", "Aerobic TE"],
    ["Ascent", "Total Ascent", " m"], ["Calories", "Calories", " kcal"], ["Body Battery", "Body Battery Drain"],
  ],
  walk: [
    ["Distance", "Distance", distSuffix("walk")], ["Time", "Time"], ["Avg HR", "Avg HR", " bpm"], ["Steps", "Steps"], ["Calories", "Calories", " kcal"],
  ],
};

function formatStatValue(a, key, raw) {
  let v = String(raw || "").replace(/^'/, "");
  if (/^\d\d:\d\d:\d\d$/.test(v) && v.startsWith("00:")) v = v.slice(3);
  if (!isImperial() || a.cat === "swim") return v;
  if (key === "Distance") {
    const n = Number(v);
    if (Number.isFinite(n)) return fmtDist(n);
  }
  if (a.cat === "run" && (key === "Avg Pace" || key === "Best Pace" || key === "Avg GAP")) {
    const sec = parsePaceToSec(v);
    if (sec != null) return fmtPaceSec(sec * KM_PER_MILE);
  }
  if ((a.cat === "bike" || a.cat === "ebike") && (key === "Avg Pace" || key === "Best Pace")) {
    const n = Number(v);
    if (Number.isFinite(n)) return fmtNum(n / KM_PER_MILE, 1);
  }
  return v;
}

function statGrid(a) {
  const cells = STAT_FIELDS[a.cat]
    .map(([label, key, unit = ""]) => {
      let v = a.raw[key];
      if (!v || v === "--" || v === "0.0") return "";
      v = formatStatValue(a, key, v);
      return `<div><span>${label}</span><strong>${esc(v)}${unit}</strong></div>`;
    })
    .join("");
  return `<div class="stats">${cells}</div>`;
}

function guideBlock(g) {
  const sets = Array.isArray(g.sets) && g.sets.length
    ? `<div class="set-structure">${g.sets.map(([name, detail]) => `
        <div><span>${esc(name)}</span><strong>${esc(detail)}</strong></div>`).join("")}</div>`
    : "";
  return `
    <section class="guide">
      <h3>${esc(g.title)}</h3>
      <p>${esc(g.why)}</p>
      ${sets}
      ${g.how.length ? `<ol>${g.how.map((h) => `<li>${esc(h)}</li>`).join("")}</ol>` : ""}
      ${g.targets.length ? `<div class="stats compact">${g.targets.map(([k, v]) => `<div><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join("")}</div>` : ""}
    </section>`;
}

function effortChoices(selected) {
  return [["easy", "Easy"], ["race", "Race pace"], ["other", "Something else"]].map(([value, label]) =>
    `<button class="choice-btn${selected === value ? " active" : ""}" type="button" data-action="pick-effort" data-effort="${value}" aria-pressed="${selected === value ? "true" : "false"}">${label}</button>`
  ).join("");
}

function eventPersonalForm(ev, { lead = false } = {}) {
  const goal = isGoalRace(ev);
  const shared = eventSharesPublicly(ev);
  // Private create already has a note on step 1 — don't ask again on follow-up.
  const showNote = !lead || shared;
  const draft = lead && eventPersonalDraft && String(eventPersonalDraft.id) === String(ev.id)
    ? eventPersonalDraft
    : null;
  const selectedRaw = draft?.effort
    || (lead ? "" : (ev.effort === "steady" ? "other" : (ev.effort || "")));
  const selected = selectedRaw === "steady" ? "other" : selectedRaw;
  const known = selected === "easy" || selected === "race" || selected === "other";
  const noteValue = draft?.note != null ? draft.note : (lead ? "" : (ev.note || ""));
  const privacyLine = shared
    ? `<p class="muted small-text">Your effort${showNote ? " and note" : ""} stay private — they aren’t shared with the public listing.</p>`
    : "";
  return `
    <form class="event-personal${lead ? " is-followup" : " in-dialog"}" data-id="${esc(ev.id)}">
      ${lead ? `<p class="personal-lead">How hard is ${esc(ev.name)} for you?</p>` : `<div class="eyebrow">Just for you</div>`}
      ${privacyLine}
      <fieldset class="effort-field">
        <legend>Your effort</legend>
        <div class="choice-row">${effortChoices(known ? selected : "")}</div>
      </fieldset>
      <input type="hidden" name="effort" value="${known ? esc(selected) : ""}" />
      ${showNote ? `
      <label class="full">Personal note <span class="muted">(optional, only you)</span>
        <input type="text" name="note" maxlength="140" placeholder="${selected === "other" ? "What kind of effort? Only you see this." : "e.g. wave B, jog it with friends"}" value="${esc(noteValue)}" />
      </label>` : ""}
      <div class="plan-offer">
        ${goal
          ? `<p class="muted small-text">This event is already your plan.</p>`
          : `<p>Want a plan that builds toward this event?</p>
             <button class="button" type="button" data-action="plan-for-event">Create a plan for this event</button>`}
      </div>
      <div class="form-actions">
        <span class="form-error"></span>
        ${lead ? `<button class="button ghost" type="button" data-action="back-event-personal">Back</button>` : ""}
        ${lead ? `<button class="button ghost" type="button" data-action="skip-event-personal">Not now</button>` : ""}
        <button class="button${lead ? "" : " small"}" type="submit">Save</button>
      </div>
    </form>`;
}

function eventDetailBlock(ev) {
  const meta = `${fmtDistWithUnit(ev.km)}${ev.sport ? ` · ${ev.sport}` : ""}`;
  if (ownsEvent(ev)) {
    return `
      <form class="event-edit-form" data-id="${esc(ev.id)}">
        <div class="eyebrow">Event</div>
        <p class="muted small-text">Name, distance and the event note can be public.</p>
        <div class="event-edit-fields">
          <label>Name<input type="text" name="name" required value="${esc(ev.name)}" /></label>
          <label>Distance (${distUnit()})<input type="number" name="km" required min="0.1" step="0.1" value="${esc(displayDistValue(ev.km))}" /></label>
        </div>
        <label class="full">Event note <span class="muted">(optional, public if you share this event)</span>
          <input type="text" name="event_note" maxlength="140" placeholder="e.g. chip start 9:30, city centre" value="${esc(ev.event_note || "")}" />
        </label>
        <div class="form-actions">
          <span class="form-error"></span>
          <button class="button small" type="submit">Save event</button>
          <button class="button ghost small" type="button" data-action="delete-event" data-id="${esc(ev.id)}">Remove</button>
        </div>
      </form>
      ${eventPersonalForm(ev)}`;
  }
  return `
    <div class="event-readonly">
      <div class="eyebrow">Public event</div>
      <p class="event-note">★ ${esc(ev.name)} · ${esc(meta)}</p>
      ${ev.event_note ? `<p class="muted small-text">${esc(ev.event_note)}</p>` : ""}
      <p class="muted small-text">Details come from the original listing, so name and distance stay as they are.</p>
      <button class="button ghost small" type="button" data-action="delete-event" data-id="${esc(ev.id)}">Remove from my agenda</button>
    </div>
    ${eventPersonalForm(ev)}`;
}

window.WELLNESS = window.WELLNESS || {};
window.TRAINING_METRICS = window.TRAINING_METRICS || null;

function metricsKey() {
  return `training-metrics:${CURRENT_USER_ID || "anon"}`;
}
function wellnessKey() {
  return `wellness-days:${CURRENT_USER_ID || "anon"}`;
}

function readStoredContext() {
  try {
    const metrics = JSON.parse(localStorage.getItem(metricsKey()) || "null");
    const days = JSON.parse(localStorage.getItem(wellnessKey()) || "{}");
    if (metrics) window.TRAINING_METRICS = metrics;
    if (days && typeof days === "object") window.WELLNESS = days;
  } catch {
    window.WELLNESS = window.WELLNESS || {};
  }
}

function applyGarminContext(data) {
  if (!data) return;
  if (data.metrics) {
    window.TRAINING_METRICS = data.metrics;
    try { localStorage.setItem(metricsKey(), JSON.stringify(data.metrics)); } catch { /* ignore */ }
  }
  if (Array.isArray(data.wellness) && data.wellness.length) {
    const map = { ...(window.WELLNESS || {}) };
    data.wellness.forEach((row) => { if (row && row.day) map[row.day] = row; });
    window.WELLNESS = map;
    try { localStorage.setItem(wellnessKey(), JSON.stringify(map)); } catch { /* ignore */ }
  }
}

async function loadWellness() {
  readStoredContext();
  if (!CURRENT_USER_ID) return;
  const from = ymd(addDays(today(), -21));
  try {
    const [days, metrics] = await Promise.all([
      sb.from("wellness_days").select("*").eq("user_id", CURRENT_USER_ID).gte("day", from),
      sb.from("training_metrics").select("*").eq("user_id", CURRENT_USER_ID).maybeSingle(),
    ]);
    if (!days.error && Array.isArray(days.data)) {
      const map = { ...(window.WELLNESS || {}) };
      days.data.forEach((row) => { if (row.day) map[row.day] = row; });
      window.WELLNESS = map;
    }
    if (!metrics.error && metrics.data) window.TRAINING_METRICS = metrics.data;
  } catch { /* table may not exist until the migration is applied */ }
}

function wellnessRow(ds) {
  return (window.WELLNESS || {})[ds] || null;
}

const RECOVERY_HARD_KINDS = new Set(["quality", "long", "brick", "race", "event"]);

function recoveryBand(score) {
  if (score >= 80) return "green";
  if (score >= 60) return "amber";
  return "red";
}

function recoveryFor(ds) {
  const todayRow = wellnessRow(ds);
  const yday = wellnessRow(ymd(addDays(parseDate(ds), -1)));
  // Sleep and HRV are overnight. Garmin sometimes stamps them on wake day, sometimes on the prior date.
  const sleepRow = (todayRow?.sleep_score > 0 || todayRow?.sleep_sec > 0) ? todayRow
    : (yday?.sleep_score > 0 || yday?.sleep_sec > 0) ? yday
      : todayRow;
  const hrvRow = todayRow?.hrv_night > 0 ? todayRow : (yday?.hrv_night > 0 ? yday : todayRow);
  const liveRow = todayRow || yday;
  if (!sleepRow && !hrvRow && !liveRow) return null;
  const parts = [];
  const metrics = { sleep: null, battery: null, stress: null, hrv: null };
  if (sleepRow?.sleep_score > 0) {
    const value = Math.round(sleepRow.sleep_score);
    metrics.sleep = { value, text: String(value), score: Number(sleepRow.sleep_score) };
    parts.push({ key: "Sleep", text: metrics.sleep.text, score: metrics.sleep.score, weight: 0.34 });
  } else if (sleepRow?.sleep_sec > 0) {
    const hours = sleepRow.sleep_sec / 3600;
    const score = Math.max(0, Math.min(100, (hours / 8) * 100));
    metrics.sleep = { value: Math.round(score), text: `${hours.toFixed(1)} h`, score };
    parts.push({ key: "Sleep", text: metrics.sleep.text, score, weight: 0.34 });
  }
  if (hrvRow?.hrv_night > 0) {
    let score = 85;
    if (hrvRow.hrv_low > 0 && hrvRow.hrv_high > hrvRow.hrv_low) {
      if (hrvRow.hrv_night < hrvRow.hrv_low) score = Math.max(20, 100 * (hrvRow.hrv_night / hrvRow.hrv_low));
      else if (hrvRow.hrv_night > hrvRow.hrv_high) score = 88;
      else score = 100;
    }
    const band = hrvRow.hrv_low && hrvRow.hrv_high ? ` · band ${Math.round(hrvRow.hrv_low)}–${Math.round(hrvRow.hrv_high)}` : "";
    const text = `${Math.round(hrvRow.hrv_night)} ms${band}`;
    metrics.hrv = { value: Math.round(hrvRow.hrv_night), text, score };
    parts.push({ key: "HRV", text, score, weight: 0.3 });
  }
  const battery = liveRow?.battery_morning != null ? liveRow.battery_morning : liveRow?.battery_latest;
  if (battery != null && battery >= 0 && battery <= 100) {
    const value = Math.round(battery);
    metrics.battery = { value, text: String(value), score: Number(battery) };
    parts.push({ key: "Body Battery", text: metrics.battery.text, score: metrics.battery.score, weight: 0.24 });
  }
  if (liveRow?.stress_avg != null && liveRow.stress_avg >= 0 && liveRow.stress_avg <= 100) {
    const value = Math.round(liveRow.stress_avg);
    const score = Math.max(0, 100 - Number(liveRow.stress_avg));
    metrics.stress = { value, text: String(value), score };
    parts.push({ key: "Stress", text: metrics.stress.text, score, weight: 0.12 });
  }
  if (!parts.length) return null;
  const weight = parts.reduce((sum, part) => sum + part.weight, 0);
  const score = Math.round(parts.reduce((sum, part) => sum + part.score * part.weight, 0) / weight);
  return { score, band: recoveryBand(score), parts, metrics };
}
window.recoveryFor = recoveryFor;
window.recoveryBand = recoveryBand;

function recoveryDayLabel(band) {
  if (band === "green") return tt("rec.dayGreen");
  if (band === "amber") return tt("rec.dayAmber");
  return tt("rec.dayRed");
}

function recoveryActionLabel(band) {
  if (band === "green") return tt("rec.actionGo");
  if (band === "amber") return tt("rec.actionCaution");
  return tt("rec.actionEase");
}
window.recoveryDayLabel = recoveryDayLabel;
window.recoveryActionLabel = recoveryActionLabel;

function recoveryAdvice(rec, plan) {
  const kind = plan?.kind || "";
  const name = plan?.label || tt("rec.todaysSession");
  const band = typeof rec === "object" ? rec.band : recoveryBand(rec);
  if (band === "green") {
    if (kind === "quality") return tt("rec.adviceGreenQuality", { name });
    if (kind === "long") return tt("rec.adviceGreenLong", { name });
    if (kind === "brick") return tt("rec.adviceGreenBrick", { name });
    return tt("rec.adviceGreenEasy", { name });
  }
  if (band === "amber") {
    if (kind === "quality") return tt("rec.adviceAmberQuality", { name });
    if (kind === "long" || kind === "brick") return tt("rec.adviceAmberKey", { name });
    return tt("rec.adviceAmberEasy", { name });
  }
  if (kind === "quality") return tt("rec.adviceRedQuality", { name });
  if (kind === "long" || kind === "brick") return tt("rec.adviceRedKey", { name });
  return tt("rec.adviceRedEasy", { name });
}

function recoverySleepPoor(rec) {
  if (!rec?.metrics?.sleep) return false;
  return rec.metrics.sleep.score < 60;
}

function recoveryTrend(ds, rec) {
  const base = parseDate(ds);
  let hardDays = 0;
  let scoredDays = 0;
  let scoreSum = 0;
  for (let i = 1; i <= 3; i++) {
    const past = ymd(addDays(base, -i));
    const plan = typeof planFor === "function" ? planFor(past) : null;
    if (plan && RECOVERY_HARD_KINDS.has(plan.kind)) hardDays += 1;
    const pastRec = recoveryFor(past);
    if (!pastRec) continue;
    scoredDays += 1;
    scoreSum += pastRec.score;
  }
  const tomorrow = typeof planFor === "function" ? planFor(ymd(addDays(base, 1))) : null;
  const tomorrowHard = !!(tomorrow && RECOVERY_HARD_KINDS.has(tomorrow.kind));
  const sleepPoor = recoverySleepPoor(rec) || rec.band === "red";
  const avgRecent = scoredDays ? scoreSum / scoredDays : null;

  if (hardDays >= 2 && sleepPoor) {
    return tomorrowHard ? tt("rec.trendHardSleepEaseTomorrow") : tt("rec.trendHardSleepEase");
  }
  if (hardDays >= 2 && tomorrowHard && (rec.band === "amber" || (avgRecent != null && avgRecent < 70))) {
    return tt("rec.trendHardStackEaseTomorrow");
  }
  if (sleepPoor && tomorrowHard) return tt("rec.trendBadSleepEaseTomorrow");
  if (rec.band === "green" && hardDays >= 2) return tt("rec.trendHoldingAfterHard");
  if (rec.band === "green") return tt("rec.trendSupportive");
  if (rec.band === "amber") return tt("rec.trendMixed");
  return tt("rec.trendProtect");
}

function recoveryMetricCells(rec) {
  const cells = [
    { key: "sleep", label: tt("rec.metricSleep"), metric: rec.metrics.sleep },
    { key: "battery", label: tt("rec.metricBattery"), metric: rec.metrics.battery },
    { key: "stress", label: tt("rec.metricStress"), metric: rec.metrics.stress },
  ].filter((cell) => cell.metric);
  if (!cells.length) return "";
  return `<div class="recovery-metrics">${cells.map((cell) => `
    <div class="recovery-metric" data-metric="${cell.key}">
      <em>${esc(cell.label)}</em>
      <strong>${esc(cell.metric.text)}</strong>
    </div>`).join("")}</div>`;
}

function recoveryBlock(ds, plan) {
  const rec = recoveryFor(ds);
  if (!rec) {
    if (!GARMIN.connected || ds !== ymd(today())) return "";
    return `
      <section class="recovery is-empty">
        <div class="eyebrow">${esc(tt("day.recovery"))}</div>
        <p class="muted recovery-empty">${esc(tt("rec.syncGarmin"))}</p>
      </section>`;
  }
  const band = rec.band;
  const trend = recoveryTrend(ds, rec);
  const hrv = rec.metrics.hrv
    ? `<div class="recovery-bits"><span><em>${esc(tt("rec.metricHrv"))}</em> ${esc(rec.metrics.hrv.text)}</span></div>`
    : "";
  return `
    <section class="recovery lvl-${band}" data-band="${band}">
      <div class="recovery-top">
        <div>
          <div class="eyebrow">${esc(tt("day.recovery"))} · ${esc(recoveryDayLabel(band))}</div>
          <p class="recovery-advice">${esc(recoveryAdvice(rec, plan))}</p>
          <p class="recovery-trend">${esc(trend)}</p>
        </div>
        <div class="recovery-signal" aria-label="${esc(tt("rec.signalAria", { day: recoveryDayLabel(band), score: rec.score }))}">
          <span class="recovery-dot" aria-hidden="true"></span>
          <strong>${esc(recoveryActionLabel(band))}</strong>
          <span class="recovery-score">${rec.score}</span>
        </div>
      </div>
      <div class="recovery-bar" role="meter" aria-valuenow="${rec.score}" aria-valuemin="0" aria-valuemax="100"><span style="width:${Math.max(0, Math.min(100, rec.score))}%"></span></div>
      ${recoveryMetricCells(rec)}
      ${hrv}
    </section>`;
}
window.recoveryBlock = recoveryBlock;


function paceGraph(plan) {
  const profile = typeof sessionProfile === "function" ? sessionProfile(plan.kind, plan.label, plan.km) : null;
  if (!profile) return "";
  const segs = profile.segments;
  const zones = [...new Set(segs.map((s) => s.zone))];
  if (zones.length < 2) return "";
  const pace = typeof paceZones === "function" ? paceZones() : {};
  if (zones.some((z) => !pace[z])) return "";

  const totalKm = segs.reduce((s, x) => s + x.km, 0);
  if (!(totalKm > 0)) return "";
  const W = 640, H = 176, padL = 46, padR = 10, padT = 18, padB = 28;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const minPace = 270, maxPace = 460;
  const xAt = (km) => padL + (km / totalKm) * plotW;
  const yAt = (sec) => padT + ((sec - minPace) / (maxPace - minPace)) * plotH;
  const ticks = [300, 360, 390, 420, 450];

  let km = 0;
  const points = [];
  const areas = [];
  segs.forEach((s) => {
    const y = yAt(pace[s.zone].sec);
    const x0 = xAt(km), x1 = xAt(km + s.km);
    points.push(`${x0},${y}`, `${x1},${y}`);
    areas.push(`<rect class="z-${s.zone}" x="${x0}" y="${y}" width="${Math.max(0.8, x1 - x0)}" height="${H - padB - y}"></rect>`);
    km += s.km;
  });

  const grid = ticks.map((sec) => {
    const y = yAt(sec);
    return `<line x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}"></line><text class="axis" x="${padL - 6}" y="${y + 4}" text-anchor="end">${fmtPace(sec)}</text>`;
  }).join("");

  let markKm = 0;
  const xLabels = segs.map((s) => {
    const label = s.name && s.km / totalKm > 0.1 ? `<text x="${xAt(markKm + s.km / 2)}" y="${H - 8}" text-anchor="middle">${esc(s.name)}</text>` : "";
    markKm += s.km;
    return label;
  }).join("");

  const strip = segs.map((s) => {
    const show = s.name && s.km / totalKm > 0.07;
    return `<span class="z-${s.zone}" style="flex:${s.km}">${show ? esc(s.name) : ""}</span>`;
  }).join("");

  const legend = zones.map((z) => {
    const zone = pace[z];
    return `<span><i class="z-${z}"></i>${zone.label} · ${zone.range}</span>`;
  }).join("");

  return `
    <section class="pace-card">
      <div class="pace-head">
        <h3>${esc(profile.title)}</h3>
        <p class="muted">How the paces change through the session</p>
      </div>
      <div class="pace-chart-wrap">
        <svg class="pace-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(profile.title)}">
          ${grid}
          ${areas.join("")}
          <polyline class="pace-line" points="${points.join(" ")}" fill="none"></polyline>
          ${xLabels}
        </svg>
      </div>
      <div class="pace-strip">${strip}</div>
      <div class="legend pace-legend">${legend}</div>
    </section>`;
}

function normalizeUsername(raw) {
  return String(raw || "").trim().replace(/\s+/g, " ");
}
window.normalizeUsername = normalizeUsername;

function usernameError(name) {
  if (!name) return tt("username.enter");
  if (name.length < 2 || name.length > 40) return tt("username.length");
  // Display name: letters, spaces, hyphens, apostrophes, periods.
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ](?:[A-Za-zÀ-ÖØ-öø-ÿ'’.\- ]*[A-Za-zÀ-ÖØ-öø-ÿ])?$/.test(name) || name.length < 2) {
    return tt("username.chars");
  }
  return "";
}
window.usernameError = usernameError;

function profileLanguage() {
  const normalize = window.I18N?.normalizeLang || ((v) => (v === "nl" ? "nl" : "en"));
  return normalize(window.CURRENT_PROFILE?.language || window.I18N?.language || "en");
}

function profilePrefsPayload(extra = {}) {
  return {
    user_id: CURRENT_USER_ID,
    username: window.CURRENT_PROFILE?.username || null,
    units: normalizeUnits(window.CURRENT_PROFILE?.units || guessUnitsFromLocale()),
    language: profileLanguage(),
    updated_at: new Date().toISOString(),
    ...extra,
  };
}

async function saveUsernameQuiet(username) {
  const normalized = normalizeUsername(username);
  const current = window.CURRENT_PROFILE?.username || "";
  if (normalized === current) return normalized;
  const invalid = usernameError(normalized);
  if (invalid) throw new Error(invalid);
  const { error } = await sb.from("profiles").upsert(profilePrefsPayload({ username: normalized }));
  if (error) {
    if (error.code === "23505") throw new Error(tt("username.taken"));
    if (error.code === "23514") throw new Error(tt("username.chars"));
    throw error;
  }
  window.CURRENT_PROFILE = { ...(window.CURRENT_PROFILE || {}), username: normalized };
  if (typeof window.showUser === "function") {
    const { data: { user } } = await sb.auth.getUser();
    window.showUser(user);
  }
  return normalized;
}
window.saveUsernameQuiet = saveUsernameQuiet;

async function saveUnitsQuiet(unitsRaw) {
  const units = normalizeUnits(unitsRaw);
  const current = normalizeUnits(window.CURRENT_PROFILE?.units);
  if (units === current && window.CURRENT_PROFILE?.units) {
    window.CURRENT_PROFILE = { ...(window.CURRENT_PROFILE || {}), units };
    return units;
  }
  const { error } = await sb.from("profiles").upsert(profilePrefsPayload({ units }));
  if (error) throw error;
  window.CURRENT_PROFILE = { ...(window.CURRENT_PROFILE || {}), units };
  return units;
}
window.saveUnitsQuiet = saveUnitsQuiet;

async function saveLanguageQuiet(langRaw) {
  const normalize = window.I18N?.normalizeLang || ((v) => (v === "nl" ? "nl" : "en"));
  const language = normalize(langRaw);
  const current = profileLanguage();
  if (typeof window.setLanguage === "function") {
    window.setLanguage(language, { persist: true, silent: true });
  }
  if (language === current && window.CURRENT_PROFILE?.language) {
    window.CURRENT_PROFILE = { ...(window.CURRENT_PROFILE || {}), language };
    return language;
  }
  if (!CURRENT_USER_ID) {
    window.CURRENT_PROFILE = { ...(window.CURRENT_PROFILE || {}), language };
    return language;
  }
  const { error } = await sb.from("profiles").upsert(profilePrefsPayload({ language }));
  if (error) throw error;
  window.CURRENT_PROFILE = { ...(window.CURRENT_PROFILE || {}), language };
  return language;
}
window.saveLanguageQuiet = saveLanguageQuiet;

function unitsChoiceRow(selected = profileUnits()) {
  const metricOn = selected === "metric" ? " is-on" : "";
  const imperialOn = selected === "imperial" ? " is-on" : "";
  return `
    <div class="choice-row units-choice">
      <button class="choice-btn${metricOn}" type="button" data-units="metric">${tt("settings.unitsMetric")}</button>
      <button class="choice-btn${imperialOn}" type="button" data-units="imperial">${tt("settings.unitsImperial")}</button>
    </div>
    <input type="hidden" name="units" value="${esc(selected)}" />`;
}
window.unitsChoiceRow = unitsChoiceRow;


let GARMIN = { connected: false, lastSyncAt: null, lastSyncStatus: null, lastError: null, loaded: false };
let STRAVA = { connected: false, shareWithCoach: false, lastSyncAt: null, lastSyncStatus: null, lastError: null, needsReconnectForZones: false, loaded: false };
let STRAVA_CALLBACK_HANDLED = false;


function closeAccountMenu() {
  const menu = document.querySelector(".account-menu");
  const panel = document.getElementById("account-menu-panel");
  const btn = document.querySelector("[data-action=account-menu]");
  if (menu) menu.classList.remove("open");
  if (panel) panel.hidden = true;
  if (btn) btn.setAttribute("aria-expanded", "false");
}

function toggleAccountMenu() {
  const menu = document.querySelector(".account-menu");
  const panel = document.getElementById("account-menu-panel");
  const btn = document.querySelector("[data-action=account-menu]");
  if (!menu || !panel || !btn) return;
  closeNavMoreMenu();
  const open = panel.hidden;
  panel.hidden = !open;
  menu.classList.toggle("open", open);
  btn.setAttribute("aria-expanded", open ? "true" : "false");
}

function closeNavMoreMenu() {
  const menu = document.querySelector(".nav-more");
  const panel = document.getElementById("nav-more-panel");
  const btn = document.querySelector("[data-action=nav-more]");
  if (menu) menu.classList.remove("open");
  if (panel) panel.hidden = true;
  if (btn) btn.setAttribute("aria-expanded", "false");
}

function toggleNavMoreMenu() {
  const menu = document.querySelector(".nav-more");
  const panel = document.getElementById("nav-more-panel");
  const btn = document.querySelector("[data-action=nav-more]");
  if (!menu || !panel || !btn) return;
  closeAccountMenu();
  const open = panel.hidden;
  panel.hidden = !open;
  menu.classList.toggle("open", open);
  btn.setAttribute("aria-expanded", open ? "true" : "false");
}


function isStandaloneDisplay() {
  try {
    if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
    if (window.matchMedia?.("(display-mode: fullscreen)").matches) return true;
    if (typeof navigator !== "undefined" && navigator.standalone) return true;
  } catch { /* ignore */ }
  return false;
}

function isIosDevice() {
  const ua = String(navigator.userAgent || "");
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function syncStandaloneClass() {
  document.documentElement.classList.toggle("standalone", isStandaloneDisplay());
  document.body.classList.toggle("is-standalone", isStandaloneDisplay());
}

let DEFERRED_INSTALL_PROMPT = null;

function installHintDismissed() {
  try { return localStorage.getItem("tp-install-hint") === "1"; } catch { return false; }
}

function dismissInstallHint() {
  try { localStorage.setItem("tp-install-hint", "1"); } catch { /* ignore */ }
}

function installPromptBanner() {
  if (isStandaloneDisplay() || installHintDismissed()) return "";
  const canInstall = !!DEFERRED_INSTALL_PROMPT;
  const ios = isIosDevice();
  if (!canInstall && !ios) return "";
  const lead = canInstall
    ? tt("install.bannerLead")
    : tt("install.bannerIos");
  const action = canInstall
    ? `<button class="button small" type="button" data-action="install-app">${tt("install.action")}</button>`
    : "";
  return `
    <aside class="install-banner" role="note">
      <div>
        <strong>${tt("install.bannerTitle")}</strong>
        <p class="muted small-text">${lead}</p>
      </div>
      <div class="install-banner-actions">
        ${action}
        <button class="button ghost small" type="button" data-action="dismiss-install">${tt("install.dismiss")}</button>
      </div>
    </aside>`;
}

function installSettingsCard() {
  if (isStandaloneDisplay()) {
    return `
      <section class="card">
        <div class="card-head">
          <div>
            <div class="eyebrow">${tt("install.eyebrow")}</div>
            <h2>${tt("install.installedTitle")}</h2>
            <p class="muted" style="margin:6px 0 0">${tt("install.installedHelp")}</p>
          </div>
        </div>
      </section>`;
  }
  const canInstall = !!DEFERRED_INSTALL_PROMPT;
  const body = canInstall
    ? `<p class="muted" style="margin:0 0 12px">${tt("install.settingsLead")}</p>
       <button class="button" type="button" data-action="install-app">${tt("install.action")}</button>`
    : isIosDevice()
      ? `<p class="muted" style="margin:0">${tt("install.settingsIos")}</p>`
      : `<p class="muted" style="margin:0">${tt("install.settingsBrowser")}</p>`;
  return `
    <section class="card">
      <div class="card-head">
        <div>
          <div class="eyebrow">${tt("install.eyebrow")}</div>
          <h2>${tt("install.settingsTitle")}</h2>
        </div>
      </div>
      ${body}
    </section>`;
}

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  DEFERRED_INSTALL_PROMPT = e;
  syncStandaloneClass();
  if (APP_READY && (currentRoute() === "home" || currentRoute() === "settings")) render(true);
});

window.addEventListener("appinstalled", () => {
  DEFERRED_INSTALL_PROMPT = null;
  dismissInstallHint();
  syncStandaloneClass();
  toast(tt("install.done"));
  if (APP_READY) render(true);
});

syncStandaloneClass();

function renderSettings() {
  const username = window.CURRENT_PROFILE?.username || "";
  const email = window.CURRENT_USER_EMAIL || "";
  const units = profileUnits();
  const language = profileLanguage();
  const langRow = typeof window.languageChoiceRow === "function"
    ? window.languageChoiceRow(language)
    : "";
  const rules = typeof window.passwordRulesHtml === "function"
    ? window.passwordRulesHtml({ hidden: false, id: "settings-password-rules" })
    : "";
  return `
    <section class="hero compact">
      <div>
        <div class="eyebrow">${tt("settings.eyebrow")}</div>
        <h1>${tt("settings.title")}</h1>
        <p class="muted">${tt("settings.lead")}</p>
      </div>
    </section>
    <div class="settings-stack">
      ${installSettingsCard()}
      <section class="card">
        <div class="card-head">
          <div>
            <div class="eyebrow">${tt("settings.profileEyebrow")}</div>
            <h2>${tt("settings.nameTitle")}</h2>
            <p class="muted" style="margin:6px 0 0">${tt("settings.nameHelp")}</p>
          </div>
        </div>
        <form class="settings-form" data-settings="username" novalidate>
          <label>${tt("settings.nameLabel")}
            <input type="text" name="username" maxlength="40" autocomplete="name" spellcheck="false" value="${esc(username)}" placeholder="${esc(tt("settings.namePlaceholder"))}" required />
          </label>
          ${email ? `<p class="muted small-text">${esc(email)}</p>` : ""}
          <p class="form-error" role="alert"></p>
          <p class="form-note" role="status"></p>
          <button class="button" type="submit">${tt("settings.saveName")}</button>
        </form>
      </section>
      <section class="card">
        <div class="card-head">
          <div>
            <div class="eyebrow">${tt("settings.prefsEyebrow")}</div>
            <h2>${tt("settings.languageTitle")}</h2>
            <p class="muted" style="margin:6px 0 0">${tt("settings.languageHelp")}</p>
          </div>
        </div>
        <form class="settings-form" data-settings="language" novalidate>
          ${langRow}
          <p class="form-error" role="alert"></p>
          <p class="form-note" role="status"></p>
          <button class="button" type="submit">${tt("settings.saveLanguage")}</button>
        </form>
      </section>
      <section class="card">
        <div class="card-head">
          <div>
            <div class="eyebrow">${tt("settings.prefsEyebrow")}</div>
            <h2>${tt("settings.unitsTitle")}</h2>
            <p class="muted" style="margin:6px 0 0">${tt("settings.unitsHelp")}</p>
          </div>
        </div>
        <form class="settings-form" data-settings="units" novalidate>
          ${unitsChoiceRow(units)}
          <p class="form-error" role="alert"></p>
          <p class="form-note" role="status"></p>
          <button class="button" type="submit">${tt("settings.saveUnits")}</button>
        </form>
      </section>
      <section class="card">
        <div class="card-head">
          <div>
            <div class="eyebrow">${tt("settings.securityEyebrow")}</div>
            <h2>${tt("settings.passwordTitle")}</h2>
            <p class="muted" style="margin:6px 0 0">${tt("settings.passwordHelp")}</p>
          </div>
        </div>
        <form class="settings-form" data-settings="password" novalidate>
          <label>${tt("settings.currentPassword")}
            <input type="password" name="current" required autocomplete="current-password" />
          </label>
          <label>${tt("settings.newPassword")}
            <input type="password" name="password" required autocomplete="new-password" aria-describedby="settings-password-rules" />
          </label>
          <label>${tt("settings.confirmNewPassword")}
            <input type="password" name="confirm" required autocomplete="new-password" />
          </label>
          ${rules}
          <p class="form-error" role="alert"></p>
          <p class="form-note" role="status"></p>
          <button class="button" type="submit">${tt("settings.changePassword")}</button>
        </form>
      </section>
    </div>`;
}
window.renderSettings = renderSettings;

function renderProfile(acts, now) {
  const userEmail = window.CURRENT_USER_EMAIL || "";
  const username = window.CURRENT_PROFILE?.username || "";
  const units = profileUnits();
  const unitsLabel = units === "imperial" ? tt("settings.unitsImperial") : tt("settings.unitsMetric");
  const letter = (username || userEmail || "?").slice(0, 1).toUpperCase();
  return `
    <section class="hero compact profile-hero">
      <div class="profile-ident">
        <span class="profile-avatar" aria-hidden="true">${esc(letter)}</span>
        <div>
          <div class="eyebrow">${tt("profile.eyebrow")}</div>
          <h1>${esc(username || tt("profile.title"))}</h1>
          <p class="muted">${userEmail ? esc(userEmail) : tt("settings.nameHelp")}</p>
        </div>
      </div>
    </section>
    <section class="card">
      <div class="card-head">
        <div>
          <div class="eyebrow">${tt("settings.prefsEyebrow")}</div>
          <h2>${tt("settings.unitsTitle")}</h2>
          <p class="muted" style="margin:6px 0 0">${tt("profile.unitsBefore", { units: unitsLabel })} <a href="/settings">${tt("profile.settingsLink")}</a>.</p>
        </div>
      </div>
      <form class="settings-form" data-settings="units" novalidate>
        ${unitsChoiceRow(units)}
        <p class="form-error" role="alert"></p>
        <p class="form-note" role="status"></p>
        <button class="button" type="submit">${tt("settings.saveUnits")}</button>
      </form>
    </section>
    ${renderPlanProgress(acts, now)}
    ${renderYearStats(acts, now)}
    ${renderStreak(acts, now)}
    <p class="footnote">${acts.length ? "Year stats come from sessions you log here, Garmin sync, and CSV imports." : "Log a session from a day, sync Garmin from Connections, or import a Garmin Connect Activities.csv."}</p>`;
}
window.renderProfile = renderProfile;


// ---------- Views ----------


function eventSportCats(ev) {
  const sport = String(ev?.sport || "run").toLowerCase();
  if (sport === "triathlon" || sport === "tri") return ["run", "swim", "bike"];
  if (["swim", "bike", "run", "walk", "ski"].includes(sport)) return [sport];
  if (Array.isArray(ev?.legs)) {
    const cats = new Set();
    ev.legs.forEach((leg) => (leg.items || []).forEach((it) => {
      if (["swim", "bike", "run", "walk", "ski"].includes(it.sport)) cats.add(it.sport);
    }));
    if (cats.size) return [...cats];
  }
  return ["run"];
}

function eventIsDone(ev, acts = ACTS) {
  const start = eventDay(ev);
  if (!start) return false;
  const end = typeof window.eventEndYmd === "function" ? window.eventEndYmd(ev) : start;
  const wanted = eventSportCats(ev);
  // Multi-day: done when every active leg day has a matching activity (rest days ignored).
  const days = typeof window.expandEventToDayEntries === "function"
    ? window.expandEventToDayEntries(ev)
    : [{ date: start, items: [{ sport: ev.sport, km: ev.km }] }];
  const active = days.filter((d) => (d.items || []).length);
  if (!active.length) {
    return acts.some((a) => a.date >= start && a.date <= end && wanted.includes(a.cat));
  }
  return active.every((d) => {
    const want = (d.items || []).map((it) => it.sport);
    return acts.some((a) => a.date === d.date && want.includes(a.cat));
  });
}

function eventIsPast(ev, now, acts = ACTS) {
  const endStr = typeof window.eventEndYmd === "function" ? window.eventEndYmd(ev) : eventDay(ev);
  const d = parseDate(endStr);
  if (Number.isNaN(d.getTime())) return false;
  if (d < now) return true;
  return d.getTime() === now.getTime() && eventIsDone(ev, acts);
}

function pastEventsList(now, acts = ACTS) {
  return EVENTS
    .filter((e) => eventIsPast(e, now, acts))
    .sort((a, b) => eventDay(b).localeCompare(eventDay(a)));
}

function upcomingEventsList(now, acts = ACTS) {
  return EVENTS.filter((e) => !eventIsPast(e, now, acts));
}

function eventListItem(e, now, { past = false } = {}) {
  const ds = eventDay(e);
  const d = parseDate(ds);
  const endStr = typeof window.eventEndYmd === "function" ? window.eventEndYmd(e) : ds;
  const multi = endStr && endStr !== ds;
  const wk = hasPlan() ? weekOf(d) : 0;
  const weekBit = wk >= 1 && wk <= WEEKS.length ? ` · week ${wk}` : "";
  const anchor = past ? parseDate(endStr) : d;
  const n = past ? daysBetween(anchor, now) : daysBetween(now, d);
  const when = past
    ? (n === 0 ? "today" : `${n} day${n === 1 ? "" : "s"} ago`)
    : (n === 0 ? "today" : `in ${n} days`);
  const rangeBit = multi && typeof window.eventRangeSummary === "function"
    ? window.eventRangeSummary(e)
    : "";
  const distBit = multi && rangeBit
    ? rangeBit
    : fmtDistWithUnit(e.km);
  const dateLabel = multi
    ? `<strong>${fmt(d, { day: "numeric" })}–${fmt(parseDate(endStr), { day: "numeric" })}</strong><span>${fmt(d, { month: "short" })}</span>`
    : `<strong>${fmt(d, { day: "numeric" })}</strong><span>${fmt(d, { month: "short" })}</span>`;
  return `<li class="event-item ${e.race ? "race" : ""}${past ? " past" : ""}${multi ? " multi-day" : ""}">
    <button type="button" class="ev-open" data-action="open-day" data-date="${esc(ds)}" title="View ${esc(e.name)}">
      <span class="ev-date">${dateLabel}</span>
      <span class="ev-main">
        <span class="ev-name">${esc(e.name)} · ${esc(distBit)} <span class="muted">· ${effortLabel(e.effort)}${e.kind && e.kind !== "race" ? ` · ${esc(e.kind)}` : ""}${weekBit} · ${when}${e.location ? ` · ${esc(e.location)}` : ""}${e.is_public ? " · public" : ""}</span></span>
        ${e.note ? `<span class="ev-personal">${esc(e.note)}</span>` : ""}
      </span>
      <span class="day-open" aria-hidden="true">›</span>
    </button>
    <button class="button ghost small" type="button" data-action="delete-event" data-id="${esc(e.id)}">Remove</button>
  </li>`;
}

function followUpEvent() {
  if (!eventFollowUpId) return null;
  return EVENTS.find((e) => String(e.id) === String(eventFollowUpId)) || null;
}


function parseJsonSafe(raw, fallback) {
  try {
    const v = JSON.parse(raw || "");
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

function agendaLegsFromFields(fields = {}) {
  const start = String(fields.date || "").slice(0, 10);
  const end = String(fields.end_date || start).slice(0, 10);
  const legs = Array.isArray(fields.legs) ? fields.legs : parseJsonSafe(fields.legs_json, []);
  if (!start) return [];
  return typeof window.normalizeEventLegs === "function"
    ? window.normalizeEventLegs(start, end || start, legs)
    : [{ date: start, items: [] }];
}

function eventKindChoicesHtml(selected = "race") {
  const kinds = window.EVENT_KINDS || ["race", "stage", "camp", "holiday"];
  const label = {
    race: tt("events.kindRace"),
    stage: tt("events.kindStage"),
    camp: tt("events.kindCamp"),
    holiday: tt("events.kindHoliday"),
  };
  return kinds.map((k) => `
    <button class="choice-btn${k === selected ? " active" : ""}" type="button" data-event-kind="${k}">${esc(label[k] || k)}</button>`).join("");
}

function legDistUnit(sport) {
  return sport === "swim" ? "m" : distUnit();
}

function legDistDisplay(sport, km) {
  const n = Number(km);
  if (!(n > 0)) return "";
  if (sport === "swim") return String(Math.round(n * 1000));
  return displayDistValue(n, 1);
}

function legDistParse(sport, raw) {
  if (sport === "swim") {
    const m = Number(raw);
    return m > 0 ? m / 1000 : 0;
  }
  return typeof parseDistInput === "function" ? parseDistInput(raw) : Number(raw);
}

function defaultLegItem(form) {
  return { sport: defaultLegSport(form) };
}

function legDayHeading(dateStr) {
  const d = typeof parseDate === "function" ? parseDate(dateStr) : new Date(`${dateStr}T12:00:00`);
  if (!d || Number.isNaN(d.getTime())) return String(dateStr || "");
  return fmt(d, { weekday: "long", day: "numeric", month: "long" });
}

window.eventLegsEditorHtml = function eventLegsEditorHtml(legs, { locked = false } = {}) {
  if (!legs.length || legs.length < 2) return "";
  const sports = LEG_SPORTS();
  const rows = legs.map((leg, idx) => {
    const items = Array.isArray(leg.items) ? leg.items : [];
    const rest = !items.length;
    const itemRows = (rest ? [] : items).map((it, j) => {
      const sport = it.sport || "run";
      const swim = sport === "swim";
      return `
      <div class="event-leg-item" data-leg="${idx}" data-item="${j}" data-sport="${esc(sport)}">
        <select name="leg_sport_${idx}_${j}" ${locked ? "disabled" : ""}>
          ${sports.map((s) => `<option value="${s}"${s === sport ? " selected" : ""}>${esc(typeof window.sportLabel === "function" ? window.sportLabel(s) : s)}</option>`).join("")}
        </select>
        <input type="number" name="leg_km_${idx}_${j}" min="${swim ? "25" : "0.1"}" step="${swim ? "25" : "0.1"}" value="${esc(legDistDisplay(sport, it.km))}" placeholder="${esc(tt("events.distanceOptional"))}" ${locked ? "readonly" : ""} aria-label="${esc(tt("events.distanceOptional"))}" />
        <span class="event-leg-unit" data-leg-unit>${esc(legDistUnit(sport))}</span>
        ${locked ? "" : `<button class="button ghost small" type="button" data-action="leg-remove-sport" data-leg="${idx}" data-item="${j}">×</button>`}
      </div>`;
    }).join("");
    return `
      <div class="event-leg-day" data-leg="${idx}" data-date="${esc(leg.date)}">
        <div class="event-leg-day-head">
          <strong>${esc(legDayHeading(leg.date))}</strong>
          <label class="event-leg-rest"><input type="checkbox" data-action="leg-rest" data-leg="${idx}" ${rest ? "checked" : ""} ${locked ? "disabled" : ""} /> ${esc(tt("events.restDay"))}</label>
          ${locked || idx === 0 ? "" : `<button class="button ghost small" type="button" data-action="leg-copy-prev" data-leg="${idx}">${esc(tt("events.copyPrevDay"))}</button>`}
        </div>
        <div class="event-leg-items"${rest ? " hidden" : ""}>${itemRows}</div>
        ${locked || rest ? "" : `<button class="button ghost small" type="button" data-action="leg-add-sport" data-leg="${idx}">${esc(tt("events.addSport"))}</button>`}
      </div>`;
  }).join("");
  return `
    <fieldset class="full event-legs-field">
      <legend>${esc(tt("events.dayLegs"))}</legend>
      <div class="event-legs-editor">${rows}</div>
      <input type="hidden" name="legs_json" value="${esc(JSON.stringify(legs))}" />
    </fieldset>`;
}

function eventFormRange(form) {
  const start = form?.date?.value
    || form?.querySelector?.("[name=date], [name=event_date]")?.value
    || "";
  const end = form?.end_date?.value
    || form?.querySelector?.("[name=end_date], [name=event_end_date]")?.value
    || start;
  return { start, end };
}

function legsJsonInput(form) {
  return form?.querySelector?.("[name=legs_json], [name=event_legs_json]") || null;
}

function defaultLegSport(form) {
  const sport = form?.sport?.value || form?.querySelector?.("[name=sport]")?.value || "run";
  return sport && sport !== "triathlon" ? sport : "run";
}

window.readLegsFromEditor = function readLegsFromEditor(form) {
  const { start, end } = eventFormRange(form);
  if (!start) return [];
  const days = [];
  form.querySelectorAll(".event-leg-day").forEach((row) => {
    const date = row.dataset.date || "";
    const rest = row.querySelector("[data-action=leg-rest]")?.checked;
    const items = [];
    if (!rest) {
      row.querySelectorAll(".event-leg-item").forEach((item) => {
        const sport = item.querySelector("select")?.value || "run";
        const raw = item.querySelector("input[type=number]")?.value;
        const km = legDistParse(sport, raw);
        if (km > 0) items.push({ sport, km });
        else items.push({ sport });
      });
    }
    days.push({ date, items });
  });
  if (!days.length) {
    return typeof window.normalizeEventLegs === "function"
      ? window.normalizeEventLegs(start, end, [])
      : [];
  }
  return typeof window.normalizeEventLegs === "function"
    ? window.normalizeEventLegs(start, end, days)
    : days;
}

function syncLegsJson(form) {
  const hidden = legsJsonInput(form);
  if (!hidden) return;
  const legs = readLegsFromEditor(form);
  hidden.value = JSON.stringify(legs);
  if (form.classList.contains("setup-form")) form.dataset.eventLegsJson = hidden.value;
  return legs;
}

function syncEventKmConstraint(form, multi) {
  const kmInput = form?.km;
  if (!kmInput) return;
  const preset = form.preset?.value || "";
  const isCustom = !preset || preset === "custom";
  // Hidden required fields block submit with no visible browser error.
  kmInput.required = !multi && isCustom;
  kmInput.disabled = !!multi;
}

function rebuildEventLegsEditor(form, legsOverride = null) {
  if (!form || form.classList.contains("from-public")) return;
  if (form.classList.contains("setup-form")) {
    if (legsOverride) {
      form.dataset.eventLegsJson = JSON.stringify(legsOverride);
      const hidden = legsJsonInput(form);
      if (hidden) hidden.value = JSON.stringify(legsOverride);
    } else {
      syncLegsJson(form);
    }
    if (typeof window.paintSetupEventLegs === "function") window.paintSetupEventLegs(form);
    return;
  }
  const { start, end } = eventFormRange(form);
  let host = form.querySelector(".event-legs-field");
  const multi = !!(start && end && end > start);
  form.querySelector(".event-single-distance")?.toggleAttribute("hidden", multi);
  syncEventKmConstraint(form, multi);
  if (!multi) {
    if (host) host.remove();
    const legsInput = legsJsonInput(form);
    if (legsInput) legsInput.value = "[]";
    return;
  }
  // Prefer an explicit override (just-mutated legs). Do not re-read the DOM first —
  // that would wipe add-sport / uncheck-rest updates that only live in legs_json yet.
  const existing = Array.isArray(legsOverride)
    ? legsOverride
    : parseJsonSafe(legsJsonInput(form)?.value, []);
  let legs = typeof window.normalizeEventLegs === "function"
    ? window.normalizeEventLegs(start, end, existing)
    : existing;
  // Auto end-date makes multi-day the default; seed day 1 so Save isn't blocked by all-rest.
  if (!Array.isArray(legsOverride) && legs.length > 1 && !legs.some((leg) => (leg.items || []).length)) {
    legs = legs.map((leg, i) => (i === 0 ? { date: leg.date, items: [defaultLegItem(form)] } : leg));
  }
  const html = eventLegsEditorHtml(legs, { locked: false });
  if (host) host.outerHTML = html;
  else {
    const note = form.querySelector(".event-note-field");
    note?.insertAdjacentHTML("beforebegin", html);
  }
  const legsInput = legsJsonInput(form);
  if (legsInput) legsInput.value = JSON.stringify(legs);
}

function deriveEventSummaryFromForm(form, data) {
  const start = data.date;
  const end = data.end_date || start;
  const multi = end && start && end > start;
  if (!multi) return data;
  const legs = Array.isArray(data.legs) ? data.legs : parseJsonSafe(data.legs_json, []);
  const normalized = typeof window.normalizeEventLegs === "function"
    ? window.normalizeEventLegs(start, end, legs)
    : legs;
  const sum = typeof window.summarizeEventLegs === "function"
    ? window.summarizeEventLegs(normalized)
    : { sport: data.sport || "run", km: Number(data.km) || 0.1, swim_m: null, bike_km: null };
  data.legs = normalized;
  data.sport = sum.sport || data.sport || "run";
  data.km = sum.km || 0.1;
  data.swim_m = sum.swim_m;
  data.bike_km = sum.bike_km;
  return data;
}


function eventDistanceChoicesHtml(sport, selectedPreset = "") {
  const presets = (window.EVENT_PRESETS && window.EVENT_PRESETS[sport]) || [];
  if (!presets.length) return `<p class="muted">Pick an event type first.</p>`;
  return presets.map((p) => `
    <button class="choice-btn${p.id === selectedPreset ? " active" : ""}" type="button" data-event-preset="${esc(p.id)}">${esc(p.label)}</button>`).join("");
}

function eventsCard(now, upcoming, opts = {}) {
  const past = pastEventsList(now, opts.acts || ACTS);
  const latestPast = past[0];
  const follow = followUpEvent();
  const fields = eventFormDraft?.fields || {};
  const open = !!eventFormDraft?.open && !follow;
  const locked = !!eventFormDraft?.locked;
  const editId = eventFormDraft?.editId || eventEditingId || "";
  const sport = fields.sport || "run";
  const kind = (window.EVENT_KINDS || []).includes(fields.kind) ? fields.kind : (fields.kind || "race");
  const isPublic = fields.is_public === "yes" ? "yes" : "no";
  const preset = fields.preset || "";
  const field = (name) => esc(fields[name] || "");
  const customOpen = preset === "custom" || (!preset && !!fields.km);
  const endDate = fields.end_date || fields.date || "";
  const multiDay = !!(fields.date && endDate && endDate > fields.date);
  const draftLegs = agendaLegsFromFields(fields);
  const noteLabel = isPublic === "yes"
    ? `Event note <span class="muted">(optional, public if you share)</span>`
    : `Note <span class="muted">(optional)</span>`;
  const nextStepHint = isPublic === "yes"
    ? `Next: your effort and a private note — those stay only on your agenda.`
    : `Next: how hard this is for you.`;
  return `
    <section class="card" id="events">
      <div class="card-head">
        <h2>${tt("home.upcomingEvents")}</h2>
        <button class="button small" type="button" data-action="toggle-form">${tt("home.addEvent")}</button>
      </div>
      <form class="event-form${locked ? " from-public" : ""}"${open ? "" : " hidden"}${editId ? ` data-edit-id="${esc(editId)}"` : ""}>
        <label class="full">Search public events
          <input type="search" name="event_search" placeholder="e.g. Gent Marathon, Samson 10K" autocomplete="off" value="${field("event_search")}" />
        </label>
        <ul class="search-results full" hidden></ul>
        <label>Date<input type="date" name="date" required value="${field("date")}" /></label>
        <label>${tt("events.endDate")}<input type="date" name="end_date" value="${esc(endDate)}" /></label>
        <label class="grow">Name<input type="text" name="name" required placeholder="e.g. Kerstcorrida Gent" value="${field("name")}" /></label>
        <label class="full">Location
          <input type="text" name="location" maxlength="80" placeholder="e.g. Gent, Belgium" value="${field("location")}" />
        </label>
        <fieldset class="full event-kind-field">
          <legend>${tt("events.kind")}</legend>
          <div class="choice-row">${eventKindChoicesHtml(kind)}</div>
          <input type="hidden" name="kind" value="${esc(kind)}" />
        </fieldset>
        <fieldset class="full event-sport-field">
          <legend>${tt("setup.eventType")}</legend>
          <div class="choice-row" id="event-sport-choices">
            ${AGENDA_EVENT_SPORTS().map((s) => `
              <button class="choice-btn${sport === s ? " active" : ""}" type="button" data-event-sport="${s}">${esc((typeof window.sportLabel === "function" ? window.sportLabel(s) : (window.SPORT_LABEL && window.SPORT_LABEL[s]) || s))}</button>`).join("")}
          </div>
          <input type="hidden" name="sport" value="${esc(sport)}" />
        </fieldset>
        <div class="event-single-distance"${multiDay ? " hidden" : ""}>
          <fieldset class="full event-distance-field">
            <legend>Distance</legend>
            <div class="choice-row" id="event-distance-choices">${eventDistanceChoicesHtml(sport, preset)}</div>
            <input type="hidden" name="preset" value="${esc(preset)}" />
          </fieldset>
          <label class="full event-custom-km"${customOpen ? "" : " hidden"}>Distance (${distUnit()})
            <input type="number" name="km" ${customOpen && !multiDay ? "required" : ""} min="0.1" step="0.1" placeholder="${isImperial() ? "6.2" : "10"}" value="${field("km") ? esc(displayDistValue(field("km"))) : ""}" />
          </label>
        </div>
        ${multiDay ? eventLegsEditorHtml(draftLegs, { locked }) : `<input type="hidden" name="legs_json" value="${esc(JSON.stringify(draftLegs))}" />`}
        <label class="full event-note-field">${noteLabel}
          <input type="text" name="event_note" maxlength="140" placeholder="e.g. chip start 9:30, city centre" value="${field("event_note")}" />
        </label>
        <fieldset class="full">
          <legend>Share this event</legend>
          <div class="choice-row">
            <button class="choice-btn${isPublic === "no" ? " active" : ""}" type="button" data-event-public="no">Private</button>
            <button class="choice-btn${isPublic === "yes" ? " active" : ""}" type="button" data-event-public="yes">Public</button>
          </div>
          <input type="hidden" name="is_public" value="${isPublic}" />
          <p class="muted small-text">Public shares name, date, distance and location only.</p>
        </fieldset>
        <div class="similar-event full" hidden></div>
        <p class="muted small-text full event-next-hint">${nextStepHint}</p>
        <input type="hidden" name="source_id" value="${field("source_id")}" />
        <input type="hidden" name="swim_m" value="${field("swim_m")}" />
        <input type="hidden" name="bike_km" value="${field("bike_km")}" />
        <div class="form-actions full">
          <span class="form-error"></span>
          <button class="button ghost" type="button" data-action="toggle-form">Cancel</button>
          <button class="button" type="submit">Save and continue</button>
        </div>
      </form>
      ${follow ? eventPersonalForm(follow, { lead: true }) : ""}
      <ul class="events">
        ${upcoming.map((e) => eventListItem(e, now)).join("") || `<li class="muted">No upcoming events. Search a public one or add your own.</li>`}
      </ul>
      ${latestPast ? `
        <div class="past-events">
          <div class="card-head past-events-head">
            <h2>Past events</h2>
            ${past.length > 1 ? `<a class="button ghost small" href="/events">All past events →</a>` : ""}
          </div>
          <ul class="events">
            ${eventListItem(latestPast, now, { past: true })}
          </ul>
        </div>` : ""}
    </section>`;
}

function renderPastEvents(now) {
  const upcoming = upcomingEventsList(now, ACTS);
  const past = pastEventsList(now, ACTS);
  return `
    <section class="hero compact">
      <div>
        <div class="eyebrow"><a href="/home">${tt("nav.home")}</a> · ${tt("nav.events")}</div>
        <h1>${tt("home.upcomingEvents")}</h1>
        <p class="muted">${upcoming.length
          ? tt("events.upcomingCount", { count: upcoming.length })
          : past.length
            ? tt("events.noneUpcoming")
            : tt("events.emptyLead")}</p>
      </div>
    </section>
    ${eventsCard(now, upcoming, { acts: ACTS })}
  `;
}

function eventPresetKm(sport, presetId) {
  const preset = ((window.EVENT_PRESETS || {})[sport] || []).find((p) => p.id === presetId);
  if (!preset || presetId === "custom") return null;
  if (sport === "swim") return (preset.swim || 0) / 1000;
  if (sport === "bike" || sport === "ski") return preset.bike || null;
  if (sport === "triathlon") return preset.run || null;
  return preset.run || null;
}

function paintAgendaDistances(form, sport, keepPreset = false) {
  const box = form.querySelector("#event-distance-choices");
  if (!box) return;
  const presetEl = form.querySelector("[name=preset]");
  const current = keepPreset ? (presetEl?.value || "") : "";
  box.innerHTML = eventDistanceChoicesHtml(sport, current);
  if (!keepPreset && presetEl) presetEl.value = "";
  applyAgendaPreset(form, keepPreset ? current : "");
}

function applyAgendaPreset(form, presetId) {
  const sport = form.sport?.value || "run";
  const presetEl = form.querySelector("[name=preset]");
  if (presetEl) presetEl.value = presetId || "";
  form.querySelectorAll("#event-distance-choices .choice-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.eventPreset === presetId);
  });
  const customWrap = form.querySelector(".event-custom-km");
  const kmInput = form.km;
  const preset = ((window.EVENT_PRESETS || {})[sport] || []).find((p) => p.id === presetId);
  const isCustom = !presetId || presetId === "custom";
  const { start, end } = eventFormRange(form);
  const multi = !!(start && end && end > start);
  if (customWrap) customWrap.hidden = !isCustom;
  if (kmInput) {
    syncEventKmConstraint(form, multi);
    if (!isCustom && preset) {
      const km = eventPresetKm(sport, presetId);
      kmInput.value = km != null ? displayDistValue(km) : "";
      if (form.swim_m) form.swim_m.value = preset.swim || "";
      if (form.bike_km) form.bike_km.value = preset.bike || "";
    } else if (isCustom) {
      if (form.swim_m) form.swim_m.value = "";
      if (form.bike_km) form.bike_km.value = "";
    }
  }
}

function setAgendaPublic(form, value) {
  const next = value === "yes" ? "yes" : "no";
  if (form.is_public) form.is_public.value = next;
  form.querySelectorAll("[data-event-public]").forEach((b) => {
    b.classList.toggle("active", b.dataset.eventPublic === next);
  });
  const noteField = form.querySelector(".event-note-field");
  if (noteField) {
    const input = noteField.querySelector("input");
    noteField.innerHTML = next === "yes"
      ? `Event note <span class="muted">(optional, public if you share)</span>`
      : `Note <span class="muted">(optional)</span>`;
    if (input) noteField.appendChild(input);
  }
  const hint = form.querySelector(".event-next-hint");
  if (hint) {
    hint.textContent = next === "yes"
      ? "Next: your effort and a private note — those stay only on your agenda."
      : "Next: how hard this is for you.";
  }
  rememberEventForm(form);
}

window.applyPublicEventToAgenda = function applyPublicEventToAgenda(form, ev) {
  form.date.value = ev.date || "";
  form.name.value = ev.name || "";
  if (form.location) form.location.value = ev.location || "";
  const sport = ev.sport || (typeof window.inferSportFromEvent === "function" ? window.inferSportFromEvent(ev) : "run");
  if (form.sport) form.sport.value = sport;
  form.querySelectorAll("[data-event-sport]").forEach((b) => {
    b.classList.toggle("active", b.dataset.eventSport === sport);
  });
  paintAgendaDistances(form, sport, false);
  if (form.preset) form.preset.value = "custom";
  applyAgendaPreset(form, "custom");
  form.km.value = ev.km != null ? displayDistValue(ev.km) : "";
  if (form.effort) form.effort.value = "easy";
  if (form.source_id) form.source_id.value = ev.id || "";
  if (form.swim_m) form.swim_m.value = ev.swim_m || "";
  if (form.bike_km) form.bike_km.value = ev.bike_km || "";
  if (form.note) form.note.value = "";
  if (form.event_note) form.event_note.value = "";
  setAgendaPublic(form, "no");
  hideSimilarEventPrompt(form);
  setAgendaEventLocked(form, true);
};

function setAgendaEventLocked(form, locked) {
  form.classList.toggle("from-public", locked);
  ["date", "name", "km", "location"].forEach((n) => {
    if (form[n]) form[n].readOnly = locked;
  });
  form.querySelectorAll("[data-event-sport], [data-event-preset]").forEach((b) => {
    b.disabled = locked;
  });
  let hint = form.querySelector(".picked-readonly");
  if (locked) {
    if (!hint) {
      hint = document.createElement("p");
      hint.className = "muted small-text picked-readonly full";
      hint.textContent = "This is a public event, so name, date, distance and location stay as listed.";
      form.querySelector("label.full")?.after(hint);
    }
    hint.hidden = false;
  } else if (hint) hint.hidden = true;
}

function normLocation(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function distanceNear(a, b) {
  const left = Number(a);
  const right = Number(b);
  if (!Number.isFinite(left) || !Number.isFinite(right) || left <= 0 || right <= 0) return false;
  const delta = Math.abs(left - right);
  return delta <= 0.3 || delta / Math.max(left, right) <= 0.03;
}

async function findSimilarPublicEvents({ date, km, location, sport }) {
  if (!date || !(Number(km) > 0)) return [];
  const loc = normLocation(location);
  const out = [];
  const seen = new Set();
  const push = (ev, source) => {
    if (!ev?.id || !distanceNear(ev.km, km)) return;
    if (String(ev.date) !== String(date)) return;
    if (loc) {
      const other = normLocation(ev.location);
      if (other && other !== loc && !other.includes(loc) && !loc.includes(other)) return;
    }
    const key = `${source}|${ev.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ...ev, _source: source });
  };

  try {
    let query = sb.from("events")
      .select("id,name,date,km,location,sport,swim_m,bike_km,event_note")
      .eq("is_public", true)
      .eq("date", date)
      .limit(20);
    const { data, error } = await query;
    if (!error) (data || []).forEach((ev) => push(ev, "events"));
  } catch { /* ignore */ }

  try {
    const { data, error } = await sb.from("race_catalog")
      .select("id,name,date,km")
      .eq("date", date)
      .limit(20);
    if (!error) (data || []).forEach((ev) => push({ ...ev, location: "", sport: sport || "run" }, "catalog"));
  } catch { /* ignore */ }

  return out.slice(0, 5);
}

function hideSimilarEventPrompt(form) {
  const box = form?.querySelector(".similar-event");
  if (!box) return;
  box.hidden = true;
  box.innerHTML = "";
  delete form.dataset.skipSimilar;
}

function showSimilarEventPrompt(form, matches) {
  const box = form.querySelector(".similar-event");
  if (!box || !matches.length) return;
  const first = matches[0];
  const sportLabel = (window.SPORT_LABEL && window.SPORT_LABEL[first.sport]) || first.sport || "";
  const loc = first.location ? ` · ${esc(first.location)}` : "";
  box.hidden = false;
  box.innerHTML = `
    <div class="similar-event-card">
      <p><strong>Found a similar public event.</strong> Did you mean this one?</p>
      <p>${esc(first.name)} · ${esc(first.date)}${first.km != null ? ` · ${esc(fmtDistWithUnit(first.km))}` : ""}${sportLabel ? ` · ${esc(sportLabel)}` : ""}${loc}</p>
      <div class="form-actions">
        <button class="button" type="button" data-action="use-similar-event" data-similar-event="${esc(JSON.stringify({
          id: first.id,
          name: first.name,
          date: first.date,
          km: first.km,
          location: first.location || "",
          sport: first.sport || "run",
          swim_m: first.swim_m,
          bike_km: first.bike_km,
        }))}">Use this event</button>
        <button class="button ghost" type="button" data-action="keep-own-event">Keep mine</button>
      </div>
    </div>`;
}


function renderVolumeCard(acts, now) {
  return `
    <section class="card volume-card">
      <div class="card-head">
        <div>
          <div class="eyebrow">${tt("plan.load")}</div>
          <h2>${tt("plan.weeklyRun", { unit: distUnit() })}</h2>
        </div>
        <a class="button ghost small" href="/progress">${tt("plan.progressReport")}</a>
      </div>
      ${renderChart(acts, now)}
    </section>`;
}

function weekKmSummary(w, acts, now) {
  const s = weekStart(w.wk);
  if (s > now) return `<span class="km"><strong>${fmtDist(w.km, 0)}</strong> ${distUnit()} planned · long ${fmtDist(w.long, 0)}</span>`;
  const logged = weekRunKm(w, acts);
  const pct = Math.round((logged / w.km) * 100);
  const inProgress = w.wk === weekOf(now) && ymd(now) !== ymd(addDays(s, 6));
  const level = inProgress ? "live" : pct >= 90 ? "good" : pct >= 60 ? "ok" : "low";
  return `
    <span class="km logged lvl-${level}" title="${fmtDist(logged, 1)} of ${fmtDist(w.km, 0)} ${distUnit()} run${inProgress ? " (week in progress)" : ""}">
      <span class="km-nums"><strong>${fmtDist(logged, 1)}</strong> / ${fmtDist(w.km, 0)} ${distUnit()} <em>${pct}%</em></span>
      <span class="km-bar"><span style="width:${Math.min(100, pct)}%"></span></span>
    </span>`;
}

function roadmapHeading() {
  const goal = eventLabel();
  const blob = JSON.stringify(ROADMAP_703);
  if (/70\.3/.test(blob)) return `After ${esc(goal)} → 70.3`;
  const last = ROADMAP_703.at(-1)?.[1] || "";
  const name = last.split(" · ")[0].replace(/\.$/, "").trim();
  if (name && name.length < 48 && !/recovery|build toward|taper/i.test(name)) return `After ${esc(goal)} → ${esc(name)}`;
  return `After ${esc(goal)}`;
}

let PLAN_OPEN_WEEKS = null;
let PLAN_FOCUS_WEEK = null;

function routePlanWeek() {
  if (currentRoute() !== "plan") return null;
  const wk = Number(String(routeExtra() || "").replace(/^w/i, ""));
  return Number.isFinite(wk) && wk > 0 ? wk : null;
}

function readOpenPlanWeeks() {
  const open = new Set();
  document.querySelectorAll("details.week[open]").forEach((el) => {
    const wk = Number((el.id.match(/^plan-w(\d+)$/) || [])[1]);
    if (wk) open.add(wk);
  });
  return open;
}

function rememberPlanWeek(wk, open = true) {
  if (!Number.isFinite(wk) || wk < 1) return;
  if (!PLAN_OPEN_WEEKS) PLAN_OPEN_WEEKS = new Set();
  if (open) {
    PLAN_OPEN_WEEKS.add(wk);
    PLAN_FOCUS_WEEK = wk;
  } else {
    PLAN_OPEN_WEEKS.delete(wk);
    if (PLAN_FOCUS_WEEK === wk) PLAN_FOCUS_WEEK = [...PLAN_OPEN_WEEKS].at(-1) || null;
  }
}

function syncPlanWeekPath(wk) {
  const next = wk ? `/plan/${wk}` : "/plan";
  if (location.pathname === next) return;
  history.replaceState(null, "", next + location.search);
}

function isPlanWeekOpen(wk, curWk) {
  if (routePlanWeek() === wk || PLAN_FOCUS_WEEK === wk) return true;
  if (PLAN_OPEN_WEEKS) return PLAN_OPEN_WEEKS.has(wk);
  return wk === curWk || wk === curWk + 1;
}

function eventsOverlappingWeek(weekStartDate, weekEndDate) {
  const ws = ymd(weekStartDate);
  const we = ymd(weekEndDate);
  return EVENTS.filter((ev) => {
    const start = String(ev?.date || "").slice(0, 10);
    if (!start) return false;
    const end = typeof window.eventEndYmd === "function" ? window.eventEndYmd(ev) : start;
    return start <= we && end >= ws;
  });
}

function renderPlan(acts, now) {
  const curWk = weekOf(now);
  const weeks = WEEKS.map((w) => {
    const s = weekStart(w.wk), e = addDays(s, 6);
    const evs = eventsOverlappingWeek(s, e);
    return `
      <details id="plan-w${w.wk}" class="week ${w.wk === curWk ? "cur" : ""} ${e < now ? "done" : ""}" ${isPlanWeekOpen(w.wk, curWk) ? "open" : ""}>
        <summary>
          <span class="wk">W${w.wk}</span>
          <span class="dates">${short(s)} – ${short(e)}</span>
          <span class="pill p-${w.phase}">${w.phase}</span>
          ${weekKmSummary(w, acts, now)}
          <span class="focus">${w.focus}</span>
          ${evs.map((ev) => `<span class="ev-badge ${ev.race ? "race" : ""}">★ ${esc(ev.name)}</span>`).join("")}
          ${w.wk === curWk ? `<span class="you">${tt("plan.youAreHere")}</span>` : ""}
        </summary>
        <div class="week-body">
          ${hasSportTarget(w, "swim") || hasSportTarget(w, "bike") ? `
          <div class="targets small">
            ${extraSportTargets(w)}
          </div>` : ""}
          ${s <= now ? `<div class="review inline"><div class="eyebrow">${tt("plan.weekFeedback")}</div>${reviewBlock(w, acts, now)}</div>` : ""}
          ${w.note ? `<p class="note">${w.note}</p>` : ""}
          <ul class="days">${w.days.map((_, i) => dayRow(w, i, acts, now)).join("")}</ul>
        </div>
      </details>`;
  }).join("");

  const planLead = window.CURRENT_PLAN?.sport === "run"
    ? tt("plan.leadRun")
    : window.CURRENT_PLAN?.sport === "triathlon"
      ? tt("plan.leadTri")
      : tt("plan.leadOther");
  return `
    <section class="hero compact">
      <div>
        <div class="eyebrow">${tt("plan.weeksRange", { weeks: WEEKS.length, start: short(START), end: fmt(RACE, { day: "numeric", month: "short", year: "numeric" }) })}</div>
        <h1>${tt("plan.fullTitle", { event: esc(eventLabel()) })}</h1>
        <p class="muted">${planLead}</p>
        ${window.CURRENT_PLAN?.notes ? `<p class="plan-notes">${esc(window.CURRENT_PLAN.notes)}</p>` : ""}
      </div>
      <button class="button ghost small" type="button" data-action="remove-plan">${tt("plan.remove")}</button>
    </section>

    ${renderVolumeCard(acts, now)}

    <div class="weeks">${weeks}</div>

    <div class="grid">
      <section class="card">
        <div class="card-head"><h2>${tt("plan.paceGuide")}</h2></div>
        <table class="table">
          <thead><tr><th>${tt("plan.effort")}</th><th>${tt("plan.pace", { unit: distUnit() === "mi" ? "mi" : "km" })}</th><th>${tt("plan.use")}</th></tr></thead>
          <tbody>${(typeof displayPlanPaces === "function" ? displayPlanPaces(PACES, ACTS) : PACES).map((p) => {
            const pace = typeof displayPaceRange === "function" ? displayPaceRange(p[1]) : p[1];
            return `<tr><td>${p[0]}</td><td><strong>${pace}</strong></td><td class="muted">${p[2]}</td></tr>`;
          }).join("")}</tbody>
        </table>
        <p class="muted small-text">${tt("plan.paceNote").replace(tt("plan.paceNoteLink"), `<a href="/gear">${tt("plan.paceNoteLink")}</a>`)}</p>
      </section>
      ${ROADMAP_703.length ? `
      <section class="card">
        <div class="card-head"><h2>${roadmapHeading()}</h2></div>
        <ul class="roadmap">${ROADMAP_703.map((r) => `<li><strong>${esc(r[0])}</strong><span>${esc(r[1])}</span></li>`).join("")}</ul>
      </section>` : ""}
    </div>
    ${planResearchFootnote()}
  `;
}

function planResearchSources(plan = window.CURRENT_PLAN) {
  if (Array.isArray(plan?.sources) && plan.sources.length) return plan.sources;
  if (typeof window.researchForSport === "function") {
    return window.researchForSport(plan?.sport || "run", plan?.goal_type || "race");
  }
  return [];
}

function planResearchTags(plan = window.CURRENT_PLAN) {
  const tags = [];
  const sport = plan?.sport || "run";
  const sportBit = typeof window.sportLabel === "function"
    ? window.sportLabel(sport)
    : (window.SPORT_LABEL && window.SPORT_LABEL[sport]) || sport;
  if (sportBit) tags.push(sportBit);

  const preset = String(plan?.distance_preset || "").toLowerCase();
  const presetLabel = {
    "5k": "5K",
    "10k": "10K",
    half: "Half marathon",
    marathon: "Marathon",
    "750": "750 m",
    "1500": "1500 m",
    "1900": "1900 m",
    "40": "40 km",
    "90": "90 km",
    "180": "180 km",
    kwart: "Olympic triathlon",
    halve: "70.3",
    volledige: "Ironman",
  }[preset];
  if (presetLabel) tags.push(presetLabel);
  else if (Number(plan?.run_km) >= 40) tags.push("Marathon");
  else if (Number(plan?.run_km) >= 20) tags.push("Half marathon");
  else if (Number(plan?.run_km) >= 15 && sport === "run") tags.push("10 miles");

  const sources = planResearchSources(plan);
  const blob = sources.map((s) => `${s.title || ""} ${s.used_for || ""}`).join(" ");
  if (/periodiz/i.test(blob)) tags.push("Periodization");
  if (sources.some((s) => s.race_only) || /taper/i.test(blob)) tags.push("Taper");
  if (sport === "triathlon" || /brick/i.test(blob)) tags.push("Bricks");
  if (/volume|load|10%/i.test(blob)) tags.push("Volume");
  return [...new Set(tags.filter(Boolean))];
}

function planResearchTagsHtml(plan = window.CURRENT_PLAN) {
  const tags = planResearchTags(plan);
  if (!tags.length) return "";
  return `<span class="research-tags">${tags.map((t) => `<span class="research-tag">${esc(t)}</span>`).join("")}</span>`;
}

function planResearchFootnote(plan = window.CURRENT_PLAN) {
  const sources = planResearchSources(plan);
  if (!sources.length) return "";
  return `
    <p class="footnote plan-research-foot">
      ${tt("plan.researchFoot")}
      <a href="/research">${tt("plan.seeResearch")}</a>
    </p>`;
}

function renderResearch() {
  const plan = window.CURRENT_PLAN;
  const sources = planResearchSources(plan);
  const tags = planResearchTagsHtml(plan);
  const back = hasPlan()
    ? `<a href="/plan">${tt("nav.plan")}</a>`
    : `<a href="/home">${tt("nav.home")}</a>`;
  return `
    <section class="hero compact">
      <div>
        <div class="eyebrow">${back} · ${tt("plan.research")}</div>
        <h1>${tt("plan.research")}</h1>
        <p class="muted">${tt("plan.researchLead")}</p>
        ${tags}
      </div>
    </section>
    <section class="card">
      ${sources.length ? `
        <ul class="roadmap research-list">${sources.map((s) => `
          <li>
            <strong><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a></strong>
            <span>${esc(s.used_for || "")}${Array.isArray(s.sports) && s.sports.length
              ? ` · ${s.sports.map((sp) => esc(typeof window.sportLabel === "function" ? window.sportLabel(sp) : sp)).join(", ")}`
              : ""}</span>
          </li>`).join("")}</ul>`
        : `<p class="muted" style="margin:0">${tt("plan.researchEmpty")}</p>`}
    </section>
    <p class="footnote"><a href="${hasPlan() ? "/plan" : "/home"}">${tt("plan.researchBack")}</a></p>`;
}

// ---------- Plan changes for the AI coach ----------

const CHANGE_ICON = { busy: "⛔", event: "★", import: "⇪", note: "✎", adapt: "↻" };

function adaptAlreadyKnown(fingerprint) {
  if (!fingerprint) return false;
  return CHANGES.some((c) => c?.details?.fingerprint === fingerprint);
}

function coachSendableChanges() {
  return pendingChanges().filter((c) => c.type !== "adapt");
}

async function queueWeekAdaptations(now = today()) {
  if (!CURRENT_USER_ID || !hasPlan()) return false;
  if (typeof proposeWeekAdaptations !== "function") return false;
  const proposals = proposeWeekAdaptations(ACTS, now);
  let queued = false;
  for (const proposal of proposals) {
    if (adaptAlreadyKnown(proposal.fingerprint)) continue;
    const row = {
      user_id: CURRENT_USER_ID,
      id: newId(),
      type: "adapt",
      summary: proposal.summary,
      details: {
        mode: proposal.mode,
        week: proposal.week,
        rationale: proposal.rationale,
        days: proposal.days,
        km: proposal.km,
        note: proposal.note,
        actions: proposal.actions || [],
        fingerprint: proposal.fingerprint,
      },
      status: "pending",
    };
    const { error } = await sb.from("changes").insert(row);
    if (error) continue;
    CHANGES = [{ ...row, createdAt: new Date().toISOString() }, ...CHANGES];
    queued = true;
  }
  return queued;
}

async function queueNiggleAdaptation(now = today()) {
  if (!CURRENT_USER_ID || !hasPlan()) throw new Error("Sign in with a plan first");
  const wk = weekOf(now);
  const week = WEEKS[wk - 1];
  const proposal = typeof buildNiggleProposal === "function" ? buildNiggleProposal(week, now) : null;
  if (!proposal) throw new Error("Nothing left this week to ease.");
  if (adaptAlreadyKnown(proposal.fingerprint)) throw new Error("Niggle mode is already proposed for this week.");
  const row = {
    user_id: CURRENT_USER_ID,
    id: newId(),
    type: "adapt",
    summary: proposal.summary,
    details: {
      mode: proposal.mode,
      week: proposal.week,
      rationale: proposal.rationale,
      days: proposal.days,
      km: proposal.km,
      note: proposal.note,
      actions: proposal.actions || [],
      fingerprint: proposal.fingerprint,
    },
    status: "pending",
  };
  const { error } = await sb.from("changes").insert(row);
  if (error) throw error;
  CHANGES = [{ ...row, createdAt: new Date().toISOString() }, ...CHANGES];
  return row;
}

async function applyAdaptationChange(changeId) {
  if (!CURRENT_USER_ID || !hasPlan()) throw new Error("Sign in with a plan first");
  const change = CHANGES.find((c) => c.id === changeId && c.type === "adapt");
  if (!change) throw new Error("Adaptation not found");
  const details = change.details || {};
  const weekNum = Number(details.week);
  const days = details.days;
  if (!Number.isInteger(weekNum) || weekNum < 1 || !Array.isArray(days) || days.length !== 7) {
    throw new Error("Adaptation is incomplete");
  }
  const weeks = WEEKS.map((w) => ({ ...w, days: (w.days || []).map((d) => (Array.isArray(d) ? d.slice() : d)) }));
  const idx = weeks.findIndex((w) => Number(w.wk) === weekNum);
  if (idx < 0) throw new Error("Week not found in plan");
  const nextNote = [weeks[idx].note, details.note].filter(Boolean).join(" ");
  weeks[idx] = {
    ...weeks[idx],
    days,
    km: details.km != null ? details.km : weeks[idx].km,
    note: nextNote,
  };
  const { error } = await sb.from("plans").update({ weeks }).eq("user_id", CURRENT_USER_ID);
  if (error) throw error;
  const { error: chErr } = await sb.from("changes").update({ status: "applied" }).eq("user_id", CURRENT_USER_ID).eq("id", changeId);
  if (chErr) throw chErr;
  window.WEEKS = weeks;
  if (window.CURRENT_PLAN) window.CURRENT_PLAN.weeks = weeks;
  CHANGES = CHANGES.map((c) => (c.id === changeId ? { ...c, status: "applied" } : c));
  return weeks[idx];
}

async function dismissAdaptationChange(changeId) {
  if (!CURRENT_USER_ID) throw new Error("Sign in required");
  const { error } = await sb.from("changes").update({ status: "dismissed" }).eq("user_id", CURRENT_USER_ID).eq("id", changeId);
  if (error) throw error;
  CHANGES = CHANGES.map((c) => (c.id === changeId ? { ...c, status: "dismissed" } : c));
}

function longLabel(week) {
  const day = (week.days || []).find((d) => d && d[0] === "long");
  return `${day ? day[1] : ""} ${week.focus || ""} ${week.note || ""}`;
}

function phaseBlocksForReview(weeks) {
  const listed = Array.isArray(window.PHASES) ? window.PHASES : [];
  if (listed.length) {
    return listed
      .map((p) => ({
        name: String(p.name || "").trim(),
        to: Number(p.to) || 0,
      }))
      .filter((p) => p.name && p.to > 0);
  }
  const ends = [];
  const rows = weeks || [];
  for (let i = 0; i < rows.length; i++) {
    const name = String(rows[i]?.phase || "").trim();
    const wk = Number(rows[i]?.wk) || 0;
    if (!name || !wk) continue;
    const next = String(rows[i + 1]?.phase || "").trim();
    if (name !== next) ends.push({ name, to: wk });
  }
  return ends;
}

function reviewStages(weeks) {
  const sport = String(window.CURRENT_PLAN?.sport || "run").toLowerCase();
  const preset = String(window.CURRENT_PLAN?.distance_preset || "").toLowerCase();
  const marathonLike = sport === "run" && (/marathon|42|full/.test(preset) || Number(window.CURRENT_PLAN?.run_km) >= 40);
  const stages = [];

  if (marathonLike) {
    const longs = (weeks || []).map((w) => {
      const blob = longLabel(w);
      return {
        wk: Number(w.wk),
        long: Number(w.long) || 0,
        mp: /@ ?mp|marathon pace/i.test(blob),
        phase: String(w.phase || ""),
      };
    }).filter((l) => l.wk > 0);
    const withMp = longs.filter((l) => l.mp && l.long >= 20);
    const first = withMp[0];
    const main = withMp.find((l) => l.long >= 26);
    const lock = [...withMp].reverse().find((l) => /peak/i.test(l.phase) && l.long >= 24);
    if (first) stages.push({ id: "first-mp-20", wk: first.wk, title: "first 20 km+ with marathon pace" });
    if (main && main.wk !== first?.wk) stages.push({ id: "main-mp", wk: main.wk, title: "main marathon-pace long" });
    if (lock && lock.wk !== main?.wk && lock.wk !== first?.wk) stages.push({ id: "lock-mp", wk: lock.wk, title: "lock race pace" });
  }

  // Re-check paces/volume when a training block ends (skip taper — freshen, don't retarget).
  for (const block of phaseBlocksForReview(weeks)) {
    if (/taper/i.test(block.name)) continue;
    const id = `end-${block.name.toLowerCase().replace(/\s+/g, "-")}`;
    if (stages.some((s) => s.id === id)) continue;
    stages.push({
      id,
      wk: block.to,
      title: `end of ${block.name} block`,
    });
  }

  return stages.sort((a, b) => a.wk - b.wk || String(a.id).localeCompare(String(b.id)));
}

function toastCoachResult(data, fallback) {
  toast(data?.summary || fallback);
  const alert = typeof data?.alert === "string" ? data.alert.trim() : "";
  if (alert) toast(alert, true);
}

function dueReviewStages(now) {
  const wk = weekOf(now);
  return reviewStages(window.WEEKS).filter((s) => wk === s.wk || wk === s.wk + 1);
}

function alreadyQueued(stage) {
  return CHANGES.some((c) => c.details && c.details.stage === stage.id);
}

async function queueStageReviews(now) {
  if (!CURRENT_USER_ID || !hasPlan()) return false;
  const due = dueReviewStages(now).filter((s) => !alreadyQueued(s));
  if (!due.length) return false;
  let queued = false;
  for (const stage of due) {
    const row = {
      user_id: CURRENT_USER_ID,
      id: newId(),
      type: "note",
      summary: `Stage review · week ${stage.wk}: ${stage.title}. Re-evaluate paces, volume and A-goal from logged sessions.`,
      details: { stage: stage.id, week: stage.wk },
      status: "pending",
    };
    const { error } = await sb.from("changes").insert(row);
    if (error) continue;
    CHANGES = [{ ...row, createdAt: new Date().toISOString() }, ...CHANGES];
    queued = true;
  }
  return queued;
}

let COACH_POLL = null;
let COACH_STATUS = "idle";
let FEEDBACK_POLL = null;
let FEEDBACK_STATUS = "idle";
let WEEK_FEEDBACK_STAMP = null;
let COACH_MESSAGES = [];
let COACH_CHAT_SHEET_OPEN = false;
let COACH_CHAT_UNREAD = false;
const COACH_CHAT_COLLAPSE_KEY = "coach-chat-collapsed";

function isCoachChatMobile() {
  return typeof window.matchMedia === "function" && window.matchMedia("(max-width: 700px)").matches;
}

function coachChatCollapsed() {
  try { return localStorage.getItem(COACH_CHAT_COLLAPSE_KEY) === "1"; } catch { return false; }
}

function setCoachChatCollapsed(collapsed) {
  try { localStorage.setItem(COACH_CHAT_COLLAPSE_KEY, collapsed ? "1" : "0"); } catch { /* ignore */ }
}

async function loadCoachMessages() {
  if (!CURRENT_USER_ID) return [];
  const { data, error } = await sb
    .from("coach_messages")
    .select("id, role, content, job_id, created_at")
    .eq("user_id", CURRENT_USER_ID)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) return COACH_MESSAGES;
  return (data || []).map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    jobId: m.job_id,
    createdAt: m.created_at,
  }));
}

function coachChatThreadHtml() {
  const reviewing = COACH_STATUS === "reviewing";
  if (!COACH_MESSAGES.length && !reviewing) {
    return `<p class="coach-chat-empty muted small-text">${esc(tt("coach.chatEmpty"))}</p>`;
  }
  const bubbles = COACH_MESSAGES.map((m) => {
    const when = m.createdAt
      ? fmt(new Date(m.createdAt), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
      : "";
    return `
      <div class="coach-chat-bubble ${m.role === "user" ? "is-user" : "is-assistant"}">
        <div class="coach-chat-text">${esc(m.content)}</div>
        ${when ? `<div class="coach-chat-meta muted">${esc(when)}</div>` : ""}
      </div>`;
  }).join("");
  const typing = reviewing
    ? `<div class="coach-chat-bubble is-assistant is-typing"><div class="coach-chat-text">${esc(tt("coach.chatThinking"))}</div></div>`
    : "";
  return bubbles + typing;
}

function coachChatComposerHtml() {
  const reviewing = COACH_STATUS === "reviewing";
  return `
    <form class="coach-chat-form">
      <textarea name="text" rows="2" maxlength="2000" required ${reviewing ? "disabled" : ""}
        placeholder="${esc(tt("coach.chatPlaceholder"))}"></textarea>
      <button class="button small" type="submit" ${reviewing ? "disabled" : ""}>${esc(tt("coach.chatSend"))}</button>
    </form>`;
}

function coachChatPendingHtml() {
  const items = pendingChanges();
  const sendable = coachSendableChanges();
  const reviewing = COACH_STATUS === "reviewing";
  if (!items.length && !sendable.length) return "";
  return `
    <div class="coach-chat-pending">
      <ul class="coach-chat-pending-list">
        ${items.map((c) => `
          <li class="${c.type === "adapt" ? "is-adapt" : ""}">
            <div class="coach-chat-pending-body">
              <span class="change-icon t-${c.type}">${CHANGE_ICON[c.type] || "•"}</span>
              ${c.type === "adapt" ? adaptChangeBody(c) : `<span class="change-text">${esc(c.summary)}</span>`}
            </div>
            <span class="coach-chat-pending-actions">
              ${c.type === "adapt" ? `<button class="button small" type="button" data-action="accept-adapt" data-id="${esc(c.id)}">${tt("coach.accept")}</button>` : ""}
              <button class="icon-button" type="button" data-action="delete-change" data-id="${esc(c.id)}" title="${esc(c.type === "adapt" ? tt("coach.dismiss") : tt("coach.removeFromList"))}">✕</button>
            </span>
          </li>`).join("")}
      </ul>
      ${sendable.length ? `
        <button class="button small" type="button" data-action="send-coach"${reviewing ? " disabled" : ""}>
          ${reviewing ? tt("coach.reviewing") : tt("coach.send")}
        </button>` : ""}
      ${items.some((c) => c.type === "adapt") ? `<p class="muted small-text">${esc(tt("coach.adaptHint"))}</p>` : ""}
    </div>`;
}

function coachChatPanelInner(variant) {
  const reviewing = COACH_STATUS === "reviewing";
  return `
    <div class="coach-chat-head">
      <div>
        <div class="eyebrow">${esc(tt("coach.eyebrow"))}</div>
        <h2>${esc(tt("coach.chatTitle"))}</h2>
      </div>
      <div class="coach-chat-head-actions">
        <button class="button ghost small" type="button" data-action="niggle-mode" title="${esc(tt("coach.niggle"))}">${esc(tt("coach.niggle"))}</button>
        ${variant === "rail" ? `<button class="icon-button" type="button" data-action="coach-chat-collapse" title="${esc(tt("coach.chatCollapse"))}" aria-label="${esc(tt("coach.chatCollapse"))}">‹</button>` : ""}
        ${variant === "sheet" ? `<button class="icon-button" type="button" data-action="coach-chat-close" title="${esc(tt("common.close"))}" aria-label="${esc(tt("common.close"))}">✕</button>` : ""}
      </div>
    </div>
    ${coachChatPendingHtml()}
    <div class="coach-chat-thread" data-coach-thread>${coachChatThreadHtml()}</div>
    ${reviewing ? `<p class="muted small-text coach-chat-status">${esc(tt("coach.chatThinking"))}</p>` : ""}
    ${coachChatComposerHtml()}
  `;
}

function ensureCoachChatUi() {
  const header = document.getElementById("app-header");
  const nav = header?.querySelector("nav");
  if (nav && !nav.querySelector("[data-action=coach-chat-toggle]")) {
    const anchor = nav.querySelector(".nav-more") || nav.querySelector(".account-menu") || nav.querySelector(".nav-sep");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "nav-btn coach-chat-nav";
    btn.dataset.action = "coach-chat-toggle";
    btn.title = tt("coach.chatTitle");
    btn.setAttribute("aria-label", tt("coach.chatTitle"));
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v6A2.5 2.5 0 0 1 16.5 15H12l-4 3.5V15H7.5A2.5 2.5 0 0 1 5 12.5z"/>
      </svg>
      <span class="nav-badge coach-chat-badge" hidden></span>`;
    if (anchor) nav.insertBefore(btn, anchor);
    else nav.appendChild(btn);
  }

  if (!document.getElementById("coach-chat-rail")) {
    const rail = document.createElement("aside");
    rail.id = "coach-chat-rail";
    rail.className = "coach-chat-rail";
    rail.hidden = true;
    rail.innerHTML = `<div class="coach-chat-panel">${coachChatPanelInner("rail")}</div>`;
    document.body.appendChild(rail);
  }

  if (!document.getElementById("coach-chat-sheet")) {
    const sheet = document.createElement("div");
    sheet.id = "coach-chat-sheet";
    sheet.className = "coach-chat-sheet";
    sheet.hidden = true;
    sheet.innerHTML = `
      <button class="coach-chat-backdrop" type="button" data-action="coach-chat-close" aria-label="Close"></button>
      <div class="coach-chat-panel" role="dialog" aria-modal="true">${coachChatPanelInner("sheet")}</div>`;
    document.body.appendChild(sheet);
  }

  if (!document.getElementById("coach-chat-fab")) {
    const fab = document.createElement("button");
    fab.type = "button";
    fab.id = "coach-chat-fab";
    fab.className = "coach-chat-fab";
    fab.dataset.action = "coach-chat-expand";
    fab.hidden = true;
    fab.setAttribute("aria-label", tt("coach.chatTitle"));
    fab.innerHTML = `<span>${esc(tt("coach.chatTitle"))}</span>`;
    document.body.appendChild(fab);
  }
}

function refreshCoachChatPanels() {
  const railPanel = document.querySelector("#coach-chat-rail .coach-chat-panel");
  if (railPanel) railPanel.innerHTML = coachChatPanelInner("rail");
  const sheetPanel = document.querySelector("#coach-chat-sheet .coach-chat-panel");
  if (sheetPanel) sheetPanel.innerHTML = coachChatPanelInner("sheet");
  for (const thread of document.querySelectorAll("[data-coach-thread]")) {
    thread.scrollTop = thread.scrollHeight;
  }
}

function syncCoachChatUi() {
  ensureCoachChatUi();
  const mobile = isCoachChatMobile();
  const onPlan = currentRoute() === "plan" && hasPlan();
  const collapsed = coachChatCollapsed();
  const rail = document.getElementById("coach-chat-rail");
  const sheet = document.getElementById("coach-chat-sheet");
  const fab = document.getElementById("coach-chat-fab");
  const navBtn = document.querySelector("[data-action=coach-chat-toggle]");
  const badge = navBtn?.querySelector(".coach-chat-badge");

  document.body.classList.toggle("coach-chat-rail-open", !mobile && onPlan && !collapsed);
  document.body.classList.toggle("coach-chat-sheet-open", mobile && COACH_CHAT_SHEET_OPEN);

  if (rail) {
    const showRail = !mobile && onPlan && !collapsed;
    rail.hidden = !showRail;
  }
  if (fab) {
    fab.hidden = !(!mobile && onPlan && collapsed);
  }
  if (sheet) {
    sheet.hidden = !(mobile && COACH_CHAT_SHEET_OPEN);
  }
  if (navBtn) {
    navBtn.classList.toggle("mobile-only-chat", true);
    navBtn.hidden = !hasPlan();
    navBtn.classList.toggle("active", mobile && COACH_CHAT_SHEET_OPEN);
  }
  if (badge) {
    const pending = pendingChanges().length;
    const show = COACH_CHAT_UNREAD || COACH_STATUS === "reviewing" || pending > 0;
    badge.hidden = !show;
    badge.textContent = COACH_STATUS === "reviewing" ? "…" : (pending > 0 ? String(pending) : "1");
  }

  refreshCoachChatPanels();
}

function focusCoachChatComposer(prefill = "") {
  const root = !document.getElementById("coach-chat-sheet")?.hidden
    ? document.getElementById("coach-chat-sheet")
    : document.getElementById("coach-chat-rail");
  const input = root?.querySelector(".coach-chat-form textarea, .coach-chat-form input");
  if (!input || input.disabled) return;
  if (prefill) {
    input.value = prefill;
    try { input.setSelectionRange(prefill.length, prefill.length); } catch { /* ignore */ }
  }
  input.focus();
}

async function openCoachChat(opts = {}) {
  const mobile = isCoachChatMobile();
  COACH_CHAT_UNREAD = false;
  if (mobile) {
    COACH_CHAT_SHEET_OPEN = true;
  } else {
    setCoachChatCollapsed(false);
    if (currentRoute() !== "plan") go("/plan");
  }
  syncCoachChatUi();
  const prefill = opts.prefill || "";
  requestAnimationFrame(() => focusCoachChatComposer(prefill));
}

function closeCoachChatSheet() {
  COACH_CHAT_SHEET_OPEN = false;
  COACH_CHAT_UNREAD = false;
  syncCoachChatUi();
}

async function sendCoachChat(text, opts = {}) {
  const content = String(text || "").trim().slice(0, 2000);
  if (!content) return null;
  if (!CURRENT_USER_ID) throw new Error("Sign in required");
  if (!hasPlan()) throw new Error("Create a plan first");
  if (COACH_STATUS === "reviewing") throw new Error(tt("coach.chatBusy"));

  const { data, error } = await sb.from("coach_messages").insert({
    user_id: CURRENT_USER_ID,
    role: "user",
    content,
  }).select("id, role, content, job_id, created_at").single();
  if (error) throw error;

  COACH_MESSAGES = [...COACH_MESSAGES, {
    id: data.id,
    role: data.role,
    content: data.content,
    jobId: data.job_id,
    createdAt: data.created_at,
  }];
  COACH_STATUS = "reviewing";
  syncCoachChatUi();
  if (currentRoute() === "plan") render(true);

  try {
    const result = await invokeCoach({ action: "chat" });
    if (result.status === "applied") {
      COACH_STATUS = "idle";
      if (!opts.silent) toastCoachResult(result, tt("coach.chatReplied"));
      const { data: plan } = await sb.from("plans").select("*").eq("user_id", CURRENT_USER_ID).maybeSingle();
      if (plan) applyPlanRow(plan);
      const previousNote = currentReviewNote();
      [CHANGES, FEEDBACK, BUSY, COACH_MESSAGES] = await Promise.all([
        loadChanges(),
        loadFeedback(),
        loadBusy(),
        loadCoachMessages(),
      ]);
      maybeStampReviewFeedback(previousNote);
      if (!opts.fromSheet) COACH_CHAT_UNREAD = false;
      render(true);
      syncCoachChatUi();
      return result;
    }
    if (result.jobId) pollCoachJob(result.jobId, { kind: "chat" });
    else {
      COACH_STATUS = "idle";
      syncCoachChatUi();
    }
    return result;
  } catch (err) {
    COACH_STATUS = "idle";
    syncCoachChatUi();
    throw err;
  }
}

async function invokeCoach(body) {
  const { data, error } = await sb.functions.invoke("coach", { body });
  if (error) {
    let msg = error.message || "Coach request failed";
    try {
      const extra = error.context ? await error.context.json() : data;
      if (extra?.needsKey) msg = "Add CURSOR_API_KEY in Supabase Edge Function secrets. Create a key at cursor.com/dashboard → API Keys.";
      else if (extra?.error) msg = extra.error;
    } catch {}
    throw new Error(msg);
  }
  if (data?.error) {
    if (data.needsKey) throw new Error("Add CURSOR_API_KEY in Supabase Edge Function secrets. Create a key at cursor.com/dashboard → API Keys.");
    throw new Error(data.error);
  }
  return data;
}

async function sendCoachRequest(opts = {}) {
  const due = dueReviewStages(today());
  const stage = due.map((s) => s.id).join(", ") || null;
  try {
    const data = await invokeCoach({ action: "start", stage });
    if (data.status === "applied") {
      COACH_STATUS = "idle";
      toastCoachResult(data, "Plan updated.");
      const { data: plan } = await sb.from("plans").select("*").eq("user_id", CURRENT_USER_ID).maybeSingle();
      if (plan) applyPlanRow(plan);
      const previousNote = currentReviewNote();
      [CHANGES, FEEDBACK, BUSY] = await Promise.all([loadChanges(), loadFeedback(), loadBusy()]);
      maybeStampReviewFeedback(previousNote);
      render(true);
      return data;
    }
    COACH_STATUS = data.jobId ? "reviewing" : "idle";
    if (!opts.silent) toast(data.existing ? "Coach is already reviewing." : "Coach request sent.");
    if (data.jobId) pollCoachJob(data.jobId);
    return data;
  } catch (err) {
    COACH_STATUS = "idle";
    if (!opts.silent) toast(err.message, true);
    return null;
  }
}

async function resumeCoachJob() {
  if (!CURRENT_USER_ID) return;
  const { data } = await sb.from("coach_jobs")
    .select("id, status, stage")
    .eq("user_id", CURRENT_USER_ID)
    .in("status", ["queued", "running"])
    .or("stage.is.null,and(stage.neq.progress-report,stage.neq.week-feedback)")
    .order("created_at", { ascending: false })
    .limit(1);
  if (data?.[0]) {
    COACH_STATUS = "reviewing";
    pollCoachJob(data[0].id);
  }
}


async function pollCoachJob(jobId, opts = {}) {
  clearTimeout(COACH_POLL);
  try {
    const data = await invokeCoach({ action: "status", jobId });
    if (data.status === "applied") {
      COACH_STATUS = "idle";
      const isChat = data.kind === "chat" || opts.kind === "chat";
      toastCoachResult(data, isChat ? tt("coach.chatReplied") : "Plan updated.");
      const { data: plan } = await sb.from("plans").select("*").eq("user_id", CURRENT_USER_ID).maybeSingle();
      if (plan) applyPlanRow(plan);
      const previousNote = currentReviewNote();
      [CHANGES, FEEDBACK, BUSY, COACH_MESSAGES] = await Promise.all([
        loadChanges(),
        loadFeedback(),
        loadBusy(),
        loadCoachMessages(),
      ]);
      maybeStampReviewFeedback(previousNote);
      if (isChat && isCoachChatMobile() && !COACH_CHAT_SHEET_OPEN) COACH_CHAT_UNREAD = true;
      render(true);
      syncCoachChatUi();
      refreshOpenDay();
      return;
    }
    if (data.status === "error") {
      COACH_STATUS = "idle";
      toast(data.error || "Coach review failed.", true);
      render(true);
      syncCoachChatUi();
      return;
    }
    COACH_STATUS = "reviewing";
    syncCoachChatUi();
    COACH_POLL = setTimeout(() => pollCoachJob(jobId, opts), 4000);
  } catch (err) {
    COACH_STATUS = "idle";
    toast(err.message, true);
    render(true);
    syncCoachChatUi();
  }
}

function feedbackCacheKey() {
  return `week-feedback:${CURRENT_USER_ID || "anon"}`;
}

function persistWeekFeedbackStamp() {
  if (!WEEK_FEEDBACK_STAMP?.fingerprint) return;
  try { localStorage.setItem(feedbackCacheKey(), JSON.stringify(WEEK_FEEDBACK_STAMP)); } catch { /* ignore */ }
}

function readCachedWeekFeedbackStamp() {
  try {
    const row = JSON.parse(localStorage.getItem(feedbackCacheKey()) || "null");
    const week = Number(row?.week);
    if (!Number.isInteger(week) || week < 1 || typeof row.fingerprint !== "string" || !row.fingerprint) return null;
    return { week, fingerprint: row.fingerprint };
  } catch {
    return null;
  }
}

function stampWeekFeedback(week, fingerprint) {
  const wk = Number(week);
  if (!Number.isInteger(wk) || wk < 1 || !fingerprint) return;
  WEEK_FEEDBACK_STAMP = { week: wk, fingerprint };
  persistWeekFeedbackStamp();
}

function currentReviewNote() {
  if (!hasPlan()) return "";
  const week = reviewWeek(ACTS, today());
  return week ? (FEEDBACK.weeks[String(week.wk)] || "") : "";
}

function maybeStampReviewFeedback(previousText) {
  if (!hasPlan()) return;
  const week = reviewWeek(ACTS, today());
  if (!week) return;
  const text = FEEDBACK.weeks[String(week.wk)] || "";
  if (text && text !== previousText) stampWeekFeedback(week.wk, feedbackFingerprint(week, ACTS));
}

async function loadWeekFeedbackStamp() {
  const cached = readCachedWeekFeedbackStamp();
  if (cached) WEEK_FEEDBACK_STAMP = cached;
  if (!CURRENT_USER_ID) return;
  const { data } = await sb.from("coach_jobs")
    .select("result")
    .eq("user_id", CURRENT_USER_ID)
    .eq("stage", "week-feedback")
    .eq("status", "applied")
    .order("updated_at", { ascending: false })
    .limit(1);
  const result = data?.[0]?.result;
  if (result && typeof result === "object" && result.fingerprint && result.week) {
    stampWeekFeedback(result.week, String(result.fingerprint));
  }
}

function feedbackSnapshot(week, acts, now) {
  return {
    week: week.wk,
    phase: week.phase,
    focus: week.focus,
    km: week.km,
    from: ymd(weekStart(week.wk)),
    to: ymd(addDays(weekStart(week.wk), 6)),
    auto: weekFeedback(week, acts, now),
    sessions: reviewWeekActs(week, acts).map((a) => ({
      started_at: a.datetime,
      type: a.raw?.["Activity Type"] || a.cat,
      cat: a.cat,
      distance: a.dist,
      pace: a.pace,
      hr: a.hr,
      title: a.title || "",
      date: a.date,
    })),
    fingerprint: feedbackFingerprint(week, acts),
  };
}

function refreshOpenDay() {
  const dialog = document.getElementById("day-dialog");
  if (!dialog?.open) return;
  const date = dialog.querySelector("[data-date]")?.dataset.date;
  if (date) openDay(date);
}

async function requestWeekFeedback() {
  const visible = actsForCoach();
  const week = hasPlan() ? reviewWeek(visible, today()) : null;
  if (!week) return;
  if (!reviewWeekActs(week, visible).length) {
    const any = hasPlan() ? reviewWeekActs(reviewWeek(ACTS, today()), ACTS) : [];
    toast(any.some(isStravaActivity) && !STRAVA.shareWithCoach
      ? "Strava sessions stay in your log. Allow AI coach sharing on Connections to include them."
      : "Log or sync a session this week before asking for feedback.");
    return;
  }
  if (FEEDBACK_STATUS === "writing") return;
  if (feedbackIsCurrent(week, visible)) {
    toast("Feedback already matches this week's sessions.");
    return;
  }
  if (!CURRENT_USER_ID) {
    toast("Sign in to ask the coach.", true);
    return;
  }
  const snapshot = feedbackSnapshot(week, visible, today());
  FEEDBACK_STATUS = "writing";
  render(true);
  try {
    const data = await invokeCoach({ action: "feedback", snapshot });
    if (data.status === "applied") {
      stampWeekFeedback(data.week || week.wk, data.fingerprint || snapshot.fingerprint);
      if (!data.unchanged) FEEDBACK = await loadFeedback();
      FEEDBACK_STATUS = "idle";
      if (data.unchanged) toast("Feedback already matches this week's sessions.");
      else toastCoachResult(data, "Week feedback updated.");
      render(true);
      refreshOpenDay();
      return;
    }
    if (data.jobId) pollFeedbackJob(data.jobId);
  } catch (err) {
    FEEDBACK_STATUS = "idle";
    toast(err.message || "Could not ask the coach.", true);
    render(true);
  }
}

async function pollFeedbackJob(jobId) {
  clearTimeout(FEEDBACK_POLL);
  try {
    const data = await invokeCoach({ action: "status", jobId });
    if (data.status === "applied") {
      FEEDBACK_STATUS = "idle";
      if (data.week && data.fingerprint) stampWeekFeedback(data.week, data.fingerprint);
      if (!data.unchanged) FEEDBACK = await loadFeedback();
      if (data.unchanged) toast("Feedback already matches this week's sessions.");
      else toastCoachResult(data, "Week feedback updated.");
      render(true);
      refreshOpenDay();
      return;
    }
    if (data.status === "error") {
      FEEDBACK_STATUS = "idle";
      toast(data.error || "Week feedback failed.", true);
      render(true);
      return;
    }
    FEEDBACK_STATUS = "writing";
    FEEDBACK_POLL = setTimeout(() => pollFeedbackJob(jobId), 4000);
  } catch (err) {
    FEEDBACK_STATUS = "idle";
    toast(err.message, true);
    render(true);
  }
}

async function resumeFeedbackJob() {
  if (!CURRENT_USER_ID) return;
  const { data } = await sb.from("coach_jobs")
    .select("id")
    .eq("user_id", CURRENT_USER_ID)
    .eq("stage", "week-feedback")
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (data?.[0]) {
    FEEDBACK_STATUS = "writing";
    pollFeedbackJob(data[0].id);
  }
}

function adaptChangeBody(c) {
  const details = c.details || {};
  const rationale = String(details.rationale || "").trim();
  const actions = Array.isArray(details.actions) ? details.actions.filter(Boolean) : [];
  const mode = String(details.mode || "adapt");
  const modeLabel = tt(`coach.adapt.${mode}`) || mode;
  return `
    <span class="change-text">
      <strong class="adapt-mode">${esc(modeLabel)}</strong>
      ${esc(c.summary)}
      ${rationale ? `<span class="adapt-rationale">${esc(rationale)}</span>` : ""}
      ${actions.length ? `<span class="adapt-actions">${actions.map((a) => esc(a)).join(" · ")}</span>` : ""}
      <span class="muted"> · ${fmt(new Date(c.createdAt), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
    </span>`;
}

function toast(message, isError = false) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = isError ? "show error" : "show";
  clearTimeout(el._t);
  el._t = setTimeout(() => (el.className = ""), 4500);
}

async function importCSV(file) {
  const onSetup = currentRoute() === "setup" || !!document.querySelector(".setup-form");
  try {
    if (!CURRENT_USER_ID) throw new Error("Sign in required");
    const incoming = parseCSV(await file.text());
    const rows = incoming.map((r) => csvToDbRow(r, CURRENT_USER_ID)).filter(Boolean);
    if (!rows.length) throw new Error("This doesn't look like a Garmin Connect Activities export (missing 'Activity Type' or 'Date' columns).");
    const known = new Set(ACTS.map((a) => a.datetime));
    const added = rows.filter((r) => !known.has(r.started_at)).length;
    const updated = rows.length - added;
    const { error } = await sb.from("activities").upsert(rows, { onConflict: "user_id,activity_type,started_at" });
    if (error) throw error;
    ACTS = await loadActivities();
    window._setupActs = ACTS;
    try { if (typeof window.refreshFitnessPaces === "function") await window.refreshFitnessPaces(ACTS); } catch {}
    try { CHANGES = await loadChanges(); } catch {}
    try { if (hasPlan()) await queueWeekAdaptations(today()); } catch {}
    if (onSetup) {
      const setupForm = document.querySelector(".setup-form");
      if (setupForm && typeof window.fillWeeklyFromSynced === "function") {
        window.fillWeeklyFromSynced(setupForm, { force: true });
      }
      if (typeof window.paintSetupConnect === "function" && document.getElementById("setup-connect-body")) {
        window.paintSetupConnect();
      }
    } else {
      render(true);
    }
    const latest = ACTS.map((a) => a.date).sort().at(-1);
    toast(added ? `Imported ${added} new activit${added === 1 ? "y" : "ies"} (${updated} already known).${latest ? ` Latest: ${short(parseDate(latest))}.` : ""}` : `No new activities: all ${updated} were already imported.`);
  } catch (err) {
    toast(err.message || "Could not import that CSV.", true);
  }
}

async function refreshState(reopen) {
  [BUSY, CHANGES, GEAR] = await Promise.all([loadBusy(), loadChanges(), loadGear()]);
  render(true);
  if (reopen) openDay(reopen);
}

// ---------- Router ----------

let ACTS = [];

function activityYears(acts, now) {
  const years = new Set([now.getFullYear()]);
  (acts || []).forEach((a) => {
    const y = Number(String(a.date || "").slice(0, 4));
    if (y >= 1990 && y <= 2100) years.add(y);
  });
  return [...years].sort((a, b) => b - a);
}

function selectedActivityYear(now = today()) {
  const parts = pathParts();
  if (parts[0] !== "activities") return now.getFullYear();
  const y = Number(parts[1]);
  if (Number.isInteger(y) && y >= 1990 && y <= 2100) return y;
  return now.getFullYear();
}

function selectedActivityFilter() {
  const parts = pathParts();
  if (parts[0] !== "activities") return "";
  const first = parts[1] || "";
  const second = parts[2] || "";
  if (YEAR_SPORTS.includes(first)) return first;
  if (YEAR_SPORTS.includes(second)) return second;
  return "";
}

function activitiesHref(year, sport, now = today()) {
  const bits = ["/activities"];
  if (year && year !== now.getFullYear()) bits.push(String(year));
  if (sport) bits.push(sport);
  return bits.join("/");
}

function durationSec(raw) {
  const text = String(raw || "").trim();
  if (!text || text === "--") return 0;
  const parts = text.split(":").map((n) => Number(n));
  if (!parts.length || parts.length > 3 || parts.some((n) => !Number.isFinite(n) || n < 0)) return 0;
  if (parts.length === 1) return parts[0] * 60;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function formatHours(sec) {
  const total = Math.max(0, Math.round(Number(sec) || 0));
  if (!total) return "";
  const h = Math.floor(total / 3600);
  let m = Math.round((total % 3600) / 60);
  if (m === 60) return `${h + 1}h`;
  if (!h && !m) return "<1m";
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function weekVolumeBySport(acts, start) {
  const from = ymd(start);
  const to = ymd(addDays(start, 6));
  // Keep keys in lockstep with YEAR_SPORTS — missing keys turn session totals into NaN.
  const byCat = Object.fromEntries(YEAR_SPORTS.map((cat) => [cat, 0]));
  const timeByCat = Object.fromEntries(YEAR_SPORTS.map((cat) => [cat, 0]));
  const countByCat = Object.fromEntries(YEAR_SPORTS.map((cat) => [cat, 0]));
  (acts || []).forEach((a) => {
    if (!a.date || a.date < from || a.date > to || byCat[a.cat] == null) return;
    byCat[a.cat] += chartDist(a.cat, a.dist || 0);
    timeByCat[a.cat] += durationSec(a.time);
    countByCat[a.cat] += 1;
  });
  return {
    from,
    to,
    byCat,
    timeByCat,
    countByCat,
    total: YEAR_SPORTS.reduce((sum, cat) => sum + (byCat[cat] || 0), 0),
    count: YEAR_SPORTS.reduce((sum, cat) => sum + (countByCat[cat] || 0), 0),
    timeSec: YEAR_SPORTS.reduce((sum, cat) => sum + (timeByCat[cat] || 0), 0),
  };
}

function renderActivityWeekChart(acts, year, filter, now) {
  const weeks = yearWeekStarts(year);
  const rows = weeks.map((start) => weekVolumeBySport(acts, start));
  const cats = filter ? [filter] : YEAR_SPORTS;
  const peak = Math.max(0, ...rows.map((r) => cats.reduce((sum, cat) => sum + (r.byCat[cat] || 0), 0)));
  const { max: maxVal, step } = chartAxis(peak);
  const W = Math.max(760, 46 + weeks.length * 16);
  const H = 220, padL = 36, padR = 10, padT = 18, padB = 28;
  const bw = (W - padL - padR) / weeks.length;
  const yAt = (v) => H - padB - (maxVal ? (v / maxVal) * (H - padT - padB) : 0);
  const ticks = [];
  for (let i = 1; i * step <= maxVal + step * 1e-6; i += 1) ticks.push(Math.round(i * step * 1e6) / 1e6);
  const grid = `<text class="axis" x="${padL}" y="12">km</text>` + ticks.map((v) => {
    return `<line x1="${padL}" x2="${W - padR}" y1="${yAt(v)}" y2="${yAt(v)}"></line><text class="axis" x="${padL - 6}" y="${yAt(v) + 4}" text-anchor="end">${formatChartTick(v)}</text>`;
  }).join("");

  const nowMon = ymd(mondayOf(now));
  const thisYear = now.getFullYear() === year;
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let lastMonth = -1;
  const bars = [];
  const hovers = [];
  rows.forEach((row, i) => {
    const start = weeks[i];
    const mid = addDays(start, 3);
    const month = mid.getFullYear() === year ? mid.getMonth() : start.getMonth();
    const monthLabel = month !== lastMonth && (mid.getFullYear() === year || start.getFullYear() === year)
      ? names[month]
      : "";
    if (monthLabel) lastMonth = month;
    const cur = thisYear && ymd(start) === nowMon;
    const future = thisYear && start > now;
    let y = H - padB;
    const stack = cats.map((cat) => {
      const val = row.byCat[cat] || 0;
      if (!(val > 0)) return "";
      const h = Math.max(2, H - padB - yAt(val));
      y -= h;
      return `<rect class="b-${cat}" x="${padL + i * bw + 2}" y="${y}" width="${Math.max(2, bw - 4)}" height="${h}" rx="2"></rect>`;
    }).join("");
    const active = cats.filter((cat) => row.byCat[cat] > 0);
    const count = cats.reduce((sum, cat) => sum + (row.countByCat[cat] || 0), 0);
    const timeSec = cats.reduce((sum, cat) => sum + (row.timeByCat[cat] || 0), 0);
    const total = active.reduce((sum, cat) => sum + row.byCat[cat], 0);
    const dates = `${short(start)} – ${short(addDays(start, 6))}`;
    const timeLabel = formatHours(timeSec);
    const stats = count ? [
      `<span>Sessions <strong>${count}</strong></span>`,
      ...active.map((cat) => `<span>${YEAR_SPORT_LABEL(cat)} <strong>${fmtDistWithUnit(row.byCat[cat], 1)}</strong></span>`),
      ...(active.length > 1 ? [`<span>Total <strong>${fmtDistWithUnit(total, 1)}</strong></span>`] : []),
      ...(timeLabel ? [`<span>Time <strong>${esc(timeLabel)}</strong></span>`] : []),
    ] : [`<span>No sessions</span>`];
    const summary = count
      ? `${count} session${count === 1 ? "" : "s"}, ${active.map((cat) => `${YEAR_SPORT_LABEL(cat)} ${fmtDistWithUnit(row.byCat[cat], 1)}`).join(", ")}${timeLabel ? `, ${timeLabel}` : ""}`
      : "no sessions";
    const tipSide = i < 5 ? " tip-start" : i >= rows.length - 5 ? " tip-end" : "";
    const x = padL + i * bw;
    bars.push(`
      <g class="wkbar${cur ? " cur" : ""}${future ? " future" : ""}${row.total ? "" : " empty"}">
        ${stack}
        ${monthLabel ? `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${monthLabel}</text>` : ""}
      </g>`);
    hovers.push(`
      <a class="chart-hover${tipSide}${cur ? " cur" : ""}" href="#act-${year}-${pad(month + 1)}" style="left:${(x / W) * 100}%;width:${(bw / W) * 100}%" aria-label="${esc(`${dates}: ${summary}`)}">
        <span class="chart-tip">
          <em>${cur ? "This week" : "Week"}</em>
          <em class="chart-tip-dates">${esc(dates)}</em>
          ${stats.join("")}
        </span>
      </a>`);
  });

  const totals = Object.fromEntries(cats.map((cat) => [cat, rows.reduce((s, r) => s + (r.byCat[cat] || 0), 0)]));
  const sessions = rows.reduce((s, r) => s + (r.count || 0), 0);
  const legend = cats.map((cat) => `<span><i class="lg-${cat}"></i>${YEAR_SPORT_LABEL(cat)}${totals[cat] ? ` ${fmtDistWithUnit(totals[cat], 1)}` : ""}</span>`).join("");
  return `
    <div class="year-month">
      <div class="year-month-head">
        <h3>${filter ? tt("act.sportByWeek", { sport: YEAR_SPORT_LABEL(filter), unit: distUnit() }) : tt("act.weeklyVolume")}</h3>
        <span class="muted">${sessions ? `${sessions} session${sessions === 1 ? "" : "s"} in ${year}` : `No sessions in ${year}`}</span>
      </div>
      <div class="chart-scroll">
        <div class="chart-inner week-vol-inner">
          <svg class="week-vol-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`Weekly ${filter ? YEAR_SPORT_LABEL(filter).toLowerCase() : "training"} volume in ${year}`)}">${grid}${bars.join("")}</svg>
          <div class="chart-hovers">${hovers.join("")}</div>
        </div>
      </div>
      <div class="legend week-vol-legend">${legend}</div>
    </div>`;
}

function activityListRow(a) {
  const d = parseDate(a.date);
  const dayName = DAY_NAMES()[(d.getDay() + 6) % 7];
  return `
    <li class="day clickable" data-date="${esc(a.date)}" tabindex="0" role="button" title="${esc(tt("day.viewActivity"))}">
      <div class="day-date"><strong>${d.getDate()}</strong><span>${dayName}</span></div>
      <div class="day-body">
        <div class="session"><span class="chip k-${a.cat}">${YEAR_SPORT_LABEL(a.cat) || a.cat}</span><span class="label">${esc(a.title || activityLine(a))}</span></div>
        <div class="actual k-${a.cat}">${activityLine(a)}</div>
      </div>
      <span class="day-open" aria-hidden="true">›</span>
    </li>`;
}

function renderActivities(acts, now) {
  const filter = selectedActivityFilter();
  const year = selectedActivityYear(now);
  const pool = acts || [];
  const yearPool = yearActs(pool, year);
  const rows = yearPool.filter((a) => !filter || a.cat === filter);
  const totals = Object.fromEntries(YEAR_SPORTS.map((cat) => [cat, 0]));
  yearPool.forEach((a) => { if (totals[a.cat] != null) totals[a.cat] += 1; });
  const years = activityYears(pool, now);
  const groups = [];
  let monthKey = "";
  rows.forEach((a) => {
    const key = String(a.date || "").slice(0, 7);
    if (!key) return;
    if (key !== monthKey) {
      monthKey = key;
      groups.push({ key, label: fmt(parseDate(a.date), { month: "long", year: "numeric" }), items: [] });
    }
    groups[groups.length - 1].items.push(a);
  });
  const chips = [
    ["", tt("common.all"), yearPool.length],
    ...YEAR_SPORTS.map((cat) => [cat, YEAR_SPORT_LABEL(cat), totals[cat]]),
  ];
  const volume = activityVolume(rows, filter);
  const summary = rows.length
    ? tt(rows.length === 1 ? "act.sessionsIn" : "act.sessionsInPlural", { count: rows.length, year })
    : yearPool.length
      ? tt("act.noSportInYear", { sport: YEAR_SPORT_LABEL(filter).toLowerCase(), year })
      : pool.length
        ? tt("act.nothingInYear", { year })
        : tt("act.nothingYet");
  return `
    <section class="hero compact">
      <div>
        <div class="eyebrow">${tt("act.log")}</div>
        <h1>${filter ? tt("act.sportTitle", { sport: YEAR_SPORT_LABEL(filter) }) : tt("act.allTitle")}</h1>
        <p class="muted">${summary}</p>
      </div>
      <div class="hero-side">
        <button class="button" type="button" data-action="toggle-activity-log">${tt("act.logSession")}</button>
        ${rows.length ? `
          <div class="countdown act-km">
            <strong>${esc(volume.value)}</strong>
            <span>${tt("act.logged", { unit: volume.unit })}</span>
          </div>` : ""}
      </div>
    </section>
    ${activityLogOpen ? `<section class="card">${activityPageLogForm()}</section>` : ""}
    <section class="card">
      <div class="choice-row act-filters">
        ${years.map((y) => `
          <a class="choice-btn${y === year ? " active" : ""}" href="${activitiesHref(y, filter, now)}"${y === year ? ' aria-current="true"' : ""}>${y}</a>`).join("")}
      </div>
      <div class="choice-row act-filters">
        ${chips.map(([cat, label, n]) => `
          <a class="choice-btn${filter === cat ? " active" : ""}" href="${activitiesHref(year, cat, now)}"${filter === cat ? ' aria-current="true"' : ""}>${esc(label)}${n ? ` ${n}` : ""}</a>`).join("")}
      </div>
      ${renderActivityWeekChart(yearPool, year, filter, now)}
      ${rows.length ? groups.map((g) => `
        <div class="act-month" id="act-${g.key}">
          <div class="act-month-head">
            <h2>${esc(g.label)}</h2>
            <span class="muted">${g.items.length} · ${activityVolumeLabel(g.items, filter)}</span>
          </div>
          <ul class="days">${g.items.map(activityListRow).join("")}</ul>
        </div>`).join("") : `
        <p class="muted" style="margin:14px 0 0">${yearPool.length
          ? tt("act.noSportInYear", { sport: YEAR_SPORT_LABEL(filter).toLowerCase(), year })
          : tt("act.noSessionsInYear", { year })}</p>`}
    </section>`;
}

const APP_ROUTES = new Set(["home", "plan", "activities", "events", "gear", "profile", "connections", "settings", "progress", "research", "setup", "create-plan"]);

function pathParts() {
  return location.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
}

function currentRoute() {
  const base = pathParts()[0];
  return APP_ROUTES.has(base) ? base : "home";
}

function routeExtra() {
  return pathParts()[1] || "";
}

function isAppPath(pathname) {
  const base = String(pathname || "").replace(/^\/+|\/+$/g, "").split("/")[0] || "home";
  return APP_ROUTES.has(base);
}

function migrateLegacyHash() {
  const hash = location.hash;
  let path = null;
  const week = hash.match(/^#plan-w(\d+)$/);
  if (week) path = `/plan/${week[1]}`;
  else if (hash === "#plan" || hash.startsWith("#plan")) path = "/plan";
  else if (hash.startsWith("#activities-")) path = `/activities/${hash.slice(12)}`;
  else if (hash === "#activities") path = "/activities";
  else if (hash.startsWith("#profile-")) path = `/profile/${hash.slice(9)}`;
  else if (hash === "#profile") path = "/profile";
  else if (hash === "#connections") path = "/connections";
  else if (hash === "#settings") path = "/settings";
  else if (hash === "#gear") path = "/gear";
  else if (!hash && (location.pathname === "/" || location.pathname === "/index.html" || location.pathname === "")) path = "/home";
  if (!path) return;
  history.replaceState(null, "", path + location.search);
}

function go(path, { replace = false, force = false } = {}) {
  const next = (path.startsWith("/") ? path : `/${path}`) + location.search;
  const [nextBase] = path.replace(/^\/+|\/+$/g, "").split("/");
  const sameSection = pathParts()[0] === nextBase;
  if (location.pathname + location.search === next && !location.hash) {
    if (!APP_READY && nextBase !== "setup" && nextBase !== "create-plan" && window.CURRENT_USER_ID) {
      return window.bootApp?.();
    }
    render(force);
    return;
  }
  if (replace || sameSection) history.replaceState(null, "", next);
  else history.pushState(null, "", next);
  if (!APP_READY && nextBase !== "setup" && nextBase !== "create-plan" && window.CURRENT_USER_ID) {
    return window.bootApp?.();
  }
  render(force);
}

window.go = go;
migrateLegacyHash();

function renderView(route, acts, now) {
  if (route === "profile") return renderProfile(acts, now);
  if (route === "connections") return renderConnections();
  if (route === "settings") return renderSettings();
  if (route === "activities") return renderActivities(acts, now);
  if (route === "events") return renderPastEvents(now);
  if (route === "gear") return renderGear();
  if (route === "research") return renderResearch();
  if (!hasPlan()) return renderNoPlanHome(acts, now);
  if (route === "plan") return renderPlan(acts, now);
  if (route === "progress") return renderProgress(acts, now);
  return renderHome(acts, now);
}

function render(force = false) {
  syncStandaloneClass();
  closeAccountMenu();
  closeNavMoreMenu();
  captureEventFormDraft();
  captureEventPersonalDraft();
  captureActivityLogDraft();
  if (currentRoute() === "setup") {
    const hasSetupUi = document.querySelector(".setup-form, .setup-connect-step");
    if (typeof window.renderOnboarding === "function" && !hasSetupUi) {
      window.renderOnboarding();
    }
    return;
  }
  if (currentRoute() === "create-plan") {
    const hasForm = document.querySelector(".setup-form[data-create-only='1']");
    if (typeof window.renderCreatePlan === "function" && !hasForm) {
      window.renderCreatePlan();
    }
    return;
  }
  document.body.classList.remove("onboarding");
  if (!APP_READY) {
    if (window.CURRENT_USER_ID && typeof window.bootApp === "function") {
      showAppLoading();
      window.bootApp();
    }
    return;
  }
  const now = today();
  const route = currentRoute();
  document.querySelectorAll("nav a[data-route]").forEach((a) => {
    const active = a.dataset.route === route
      || (route === "progress" && a.dataset.route === "plan");
    a.classList.toggle("active", active);
  });
  const accountMenu = document.querySelector(".account-menu");
  if (accountMenu) {
    accountMenu.classList.toggle("active", ["profile", "connections", "settings"].includes(route));
  }
  const navMore = document.querySelector(".nav-more");
  if (navMore) {
    navMore.classList.toggle(
      "active",
      ["home", "plan", "progress", "activities", "events", "gear"].includes(route),
    );
  }
  updateNavSyncButton();
  const pending = pendingChanges().length;
  document.querySelectorAll(".nav-badge:not(.coach-chat-badge)").forEach((badge) => {
    badge.hidden = !pending;
    badge.textContent = pending;
  });
  const app = document.getElementById("app");
  const prevRoute = app.dataset.route;
  const sportKey = route === "profile" ? selectedYearSport() : route === "activities" ? `${selectedActivityYear(now)}-${selectedActivityFilter() || "all"}` : "";
  const prevSport = app.dataset.sport;
  const rebuild = force || prevRoute !== route || prevSport !== sportKey;
  const stayingOnPlan = route === "plan" && prevRoute === "plan";
  let savedScroll = null;
  if (stayingOnPlan && rebuild) {
    PLAN_OPEN_WEEKS = readOpenPlanWeeks();
    savedScroll = window.scrollY;
  }
  if (rebuild) {
    app.innerHTML = renderView(route, ACTS, now);
    restoreEventFormDraft(app);
    app.dataset.route = route;
    app.dataset.sport = sportKey;
    const curBar = app.querySelector(".chart-hover.cur, .chart .wkbar.cur, .week-vol-chart .wkbar.cur");
    const chartScroll = curBar?.closest(".chart-scroll");
    if (chartScroll && chartScroll.scrollWidth > chartScroll.clientWidth) {
      const bar = curBar.getBoundingClientRect(), box = chartScroll.getBoundingClientRect();
      chartScroll.scrollLeft += bar.left - box.left - (box.width - bar.width) / 2;
    }
  }
  if (route === "plan") {
    const focus = routePlanWeek() || PLAN_FOCUS_WEEK;
    const el = focus ? document.getElementById(`plan-w${focus}`) : null;
    if (el) {
      el.open = true;
      rememberPlanWeek(focus);
    }
    if (savedScroll != null) window.scrollTo(0, savedScroll);
    else if (el && routePlanWeek()) el.scrollIntoView({ behavior: "smooth", block: "start" });
    else if (prevRoute !== route) window.scrollTo(0, 0);
  } else if (prevRoute !== route || (route === "activities" && prevSport !== sportKey)) {
    window.scrollTo(0, 0);
    if (route === "home" && prevRoute && prevRoute !== "home" && eventFormDraft?.open) {
      document.getElementById("events")?.scrollIntoView({ block: "start" });
    }
  }
  if (route === "progress" && prevRoute !== "progress") {
    if (PROGRESS_STATUS === "running") resumeProgressJob();
    else if (!progressReportIsCurrent()) requestProgressReport();
  }
  syncCoachChatUi();
}

async function cloudRequest(method, url, body) {
  const uid = CURRENT_USER_ID;
  const ev = url.match(/^\/api\/events(?:\/([^/?]+))?$/);
  const busy = url.match(/^\/api\/busy(?:\/([^/?]+))?$/);
  const ch = url.match(/^\/api\/changes(?:\/([^/?]+))?$/);
  if (ev) {
    const id = ev[1] && decodeURIComponent(ev[1]);
    if (method === "GET") {
      const { data, error } = await sb.from("events").select("*").eq("user_id", uid).order("date");
      if (error) throw error;
      return data;
    }
    if (method === "POST") {
      const sports = window.EVENT_SPORTS || ["run", "swim", "bike", "triathlon", "walk", "ski"];
      const kinds = window.EVENT_KINDS || ["race", "stage", "camp", "holiday"];
      let endDate = String(body.end_date || body.date || "").slice(0, 10);
      const startDate = String(body.date || "").slice(0, 10);
      if (!endDate || endDate < startDate) endDate = startDate;
      const maxEnd = (() => {
        const d = parseDate(startDate);
        if (Number.isNaN(d.getTime())) return startDate;
        d.setDate(d.getDate() + ((window.EVENT_MAX_DAYS || 21) - 1));
        return ymd(d);
      })();
      if (endDate > maxEnd) endDate = maxEnd;
      let legs = Array.isArray(body.legs) ? body.legs : [];
      if (typeof window.normalizeEventLegs === "function") {
        legs = window.normalizeEventLegs(startDate, endDate, legs);
      }
      const multi = endDate > startDate;
      let sport = sports.includes(body.sport) ? body.sport : "run";
      let km = Number(body.km);
      let swim_m = body.swim_m ? Number(body.swim_m) : null;
      let bike_km = body.bike_km ? Number(body.bike_km) : null;
      if (multi && typeof window.summarizeEventLegs === "function") {
        const sum = window.summarizeEventLegs(legs);
        sport = sum.sport || sport;
        km = sum.km || km || 0.1;
        swim_m = sum.swim_m;
        bike_km = sum.bike_km;
      }
      if (!(km > 0)) km = 0.1;
      const kind = kinds.includes(body.kind) ? body.kind : "race";
      const row = {
        user_id: uid,
        id: `${body.date}-${String(body.name || "event").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${newId()}`,
        date: startDate,
        end_date: multi ? endDate : null,
        name: body.name,
        km,
        effort: "easy",
        note: "",
        event_note: clipText(body.event_note, 140),
        location: clipText(body.location, 80),
        race: false,
        is_public: body.is_public === "yes" || body.is_public === true,
        sport,
        kind,
        legs: multi ? legs : [],
        source_id: body.source_id || null,
        swim_m,
        bike_km,
      };
      let { data, error } = await sb.from("events").insert(row).select("*").single();
      if (error && columnMissing(error, "event_note")) {
        delete row.event_note;
        ({ data, error } = await sb.from("events").insert(row).select("*").single());
        if (!error) data.event_note_skipped = true;
      }
      if (error && columnMissing(error, "location")) {
        delete row.location;
        ({ data, error } = await sb.from("events").insert(row).select("*").single());
      }
      if (error && (columnMissing(error, "end_date") || columnMissing(error, "legs") || columnMissing(error, "kind"))) {
        delete row.end_date;
        delete row.legs;
        delete row.kind;
        ({ data, error } = await sb.from("events").insert(row).select("*").single());
      }
      if (error) throw error;
      await sb.from("changes").insert({ user_id: uid, id: newId(), type: "event", summary: `New event: ${row.name}, ${row.km} km on ${row.date}`, details: row, status: "pending" });
      return data;
    }
    if (method === "DELETE" && id) {
      const { data: existing, error: findErr } = await sb.from("events").select("*").eq("user_id", uid).eq("id", id).maybeSingle();
      if (findErr) throw findErr;
      if (!existing) throw new Error("Event not found");
      const { error } = await sb.from("events").delete().eq("user_id", uid).eq("id", id);
      if (error) throw error;
      await sb.from("changes").insert({
        user_id: uid,
        id: newId(),
        type: "event",
        summary: `Event removed: ${existing.name} on ${existing.date}`,
        details: existing,
        status: "pending",
      });
      return { ok: true };
    }
    if (method === "PATCH" && id) {
      const { data: existing, error: findErr } = await sb.from("events").select("*").eq("user_id", uid).eq("id", id).maybeSingle();
      if (findErr) throw findErr;
      if (!existing) throw new Error("Event not found");
      const patch = {};
      const sports = window.EVENT_SPORTS || ["run", "swim", "bike", "triathlon", "walk", "ski"];
      const kinds = window.EVENT_KINDS || ["race", "stage", "camp", "holiday"];
      const fullEdit = body.date != null || body.sport != null || body.kind != null
        || body.end_date != null || body.legs != null || body.location != null
        || body.is_public != null;
      const editingPublic = fullEdit || body.name != null || body.km != null || body.event_note != null;
      if (editingPublic) {
        if (existing.source_id) throw new Error("You can only edit events you created.");
        if (body.name != null || body.km != null || fullEdit) {
          const name = String(body.name != null ? body.name : existing.name || "").trim();
          let km = Number(body.km != null ? body.km : existing.km);
          if (!name) throw new Error("Name is required");
          if (!(km > 0 && km < 5000)) throw new Error("Distance must be a positive number");
          patch.name = name;
          patch.km = km;
        }
        if (body.event_note != null) patch.event_note = clipText(body.event_note, 140);
        if (body.location != null) patch.location = clipText(body.location, 80);
        if (body.is_public != null) patch.is_public = body.is_public === "yes" || body.is_public === true;
        if (body.date != null) patch.date = String(body.date).slice(0, 10);
        if (body.sport != null) patch.sport = sports.includes(body.sport) ? body.sport : (existing.sport || "run");
        if (body.kind != null) patch.kind = kinds.includes(body.kind) ? body.kind : (existing.kind || "race");
        if (body.swim_m != null) patch.swim_m = body.swim_m ? Number(body.swim_m) : null;
        if (body.bike_km != null) patch.bike_km = body.bike_km ? Number(body.bike_km) : null;
        if (body.end_date != null || body.legs != null || body.date != null) {
          const startDate = String(patch.date || existing.date || "").slice(0, 10);
          let endDate = String(body.end_date != null ? body.end_date : (existing.end_date || startDate)).slice(0, 10);
          if (!endDate || endDate < startDate) endDate = startDate;
          const multi = endDate > startDate;
          let legs = Array.isArray(body.legs) ? body.legs : (existing.legs || []);
          if (typeof window.normalizeEventLegs === "function") {
            legs = window.normalizeEventLegs(startDate, endDate, legs);
          }
          if (multi && typeof window.summarizeEventLegs === "function") {
            const sum = window.summarizeEventLegs(legs);
            if (sum.sport) patch.sport = sum.sport;
            if (sum.km) patch.km = sum.km;
            patch.swim_m = sum.swim_m;
            patch.bike_km = sum.bike_km;
          }
          patch.end_date = multi ? endDate : null;
          patch.legs = multi ? legs : [];
          if (!(Number(patch.km) > 0)) patch.km = Number(existing.km) || 0.1;
        }
      }
      if (body.effort != null) {
        const effort = String(body.effort);
        if (!["easy", "race", "other"].includes(effort)) throw new Error("Pick easy, race pace, or something else.");
        patch.effort = effort;
      }
      if (body.note != null) patch.note = clipText(body.note, 140);
      if (!Object.keys(patch).length) throw new Error("Nothing to update");
      let { data, error } = await sb.from("events").update(patch).eq("user_id", uid).eq("id", id).select("*").single();
      if (error && patch.event_note != null && columnMissing(error, "event_note")) {
        delete patch.event_note;
        ({ data, error } = await sb.from("events").update(patch).eq("user_id", uid).eq("id", id).select("*").single());
        if (!error) data.event_note_skipped = true;
      }
      if (error && (columnMissing(error, "end_date") || columnMissing(error, "legs") || columnMissing(error, "kind"))) {
        delete patch.end_date;
        delete patch.legs;
        delete patch.kind;
        ({ data, error } = await sb.from("events").update(patch).eq("user_id", uid).eq("id", id).select("*").single());
      }
      if (error && columnMissing(error, "location")) {
        delete patch.location;
        ({ data, error } = await sb.from("events").update(patch).eq("user_id", uid).eq("id", id).select("*").single());
      }
      if (error) throw error;
      if (patch.name && isGoalRace(existing) && window.CURRENT_PLAN) {
        await sb.from("plans").update({
          event_name: patch.name,
          run_km: existing.sport === "run" || existing.sport === "triathlon" ? patch.km : window.CURRENT_PLAN.run_km,
        }).eq("user_id", uid);
        window.CURRENT_PLAN.event_name = patch.name;
        if (existing.sport === "run" || existing.sport === "triathlon") window.CURRENT_PLAN.run_km = patch.km;
      }
      const effortChanged = patch.effort && patch.effort !== existing.effort;
      const noteChanged = patch.note != null && patch.note !== (existing.note || "");
      if (effortChanged || noteChanged) {
        const label = effortLabel(patch.effort || existing.effort);
        const note = patch.note != null ? patch.note : (existing.note || "");
        await sb.from("changes").insert({
          user_id: uid,
          id: newId(),
          type: "event",
          summary: `Your effort for ${existing.name}: ${label}${note ? ` — ${note}` : ""}`,
          details: { id, effort: patch.effort || existing.effort, note },
          status: "pending",
        });
      }
      return data;
    }
  }
  if (busy) {
    const date = busy[1];
    if (method === "GET") return loadBusy();
    if (method === "POST") {
      const row = { user_id: uid, date: body.date, reason: String(body.reason || "").slice(0, 140), session: String(body.session || "").slice(0, 140) };
      const { error } = await sb.from("busy_days").upsert(row);
      if (error) throw error;
      await sb.from("changes").insert({ user_id: uid, id: newId(), type: "busy", summary: `Busy on ${row.date}${row.reason ? ` (${row.reason})` : ""}`, details: row, status: "pending" });
      return row;
    }
    if (method === "DELETE" && date) {
      const { error } = await sb.from("busy_days").delete().eq("user_id", uid).eq("date", date);
      if (error) throw error;
      return { ok: true };
    }
  }
  if (ch) {
    const id = ch[1] && decodeURIComponent(ch[1]);
    if (method === "GET") return loadChanges();
    if (method === "POST") {
      const text = String(body.text || "").trim();
      if (!text) throw new Error("Write a note first");
      const { error } = await sb.from("changes").insert({ user_id: uid, id: newId(), type: "note", summary: text, details: {}, status: "pending" });
      if (error) throw error;
      return { ok: true };
    }
    if (method === "DELETE" && id) {
      const { error } = await sb.from("changes").delete().eq("user_id", uid).eq("id", id);
      if (error) throw error;
      return { ok: true };
    }
  }
  const gear = url.match(/^\/api\/gear(?:\/([^/?]+))?$/);
  if (gear) {
    const id = gear[1] && decodeURIComponent(gear[1]);
    if (method === "GET") return loadGear();
    if (method === "POST" && !id) {
      const type = GEAR_KINDS[body.type] ? body.type : null;
      const name = String(body.name || "").trim().slice(0, 80);
      const note = String(body.note || "").trim().slice(0, 140);
      if (!type) throw new Error("Pick a gear type");
      if (!name) throw new Error("Name is required");
      let weightKg = null;
      if (gearHasWeight(type)) {
        weightKg = body.weightKg != null ? Number(body.weightKg) : null;
        if (!(weightKg > 0)) throw new Error(`Enter a weight in ${weightUnit()}.`);
      }
      let shoeKind = null;
      let maxKm = null;
      let notifyWear = false;
      if (type === "shoes") {
        shoeKind = SHOE_KINDS[body.shoeKind] ? body.shoeKind : "daily";
        maxKm = body.maxKm != null ? Number(body.maxKm) : shoeMaxKmDefault(shoeKind);
        if (!(maxKm > 0)) throw new Error(`Enter a lifespan target in ${distUnit()}.`);
        notifyWear = !!body.notifyWear;
      }
      const { data, error } = await sb.from("gear").insert({
        id: newId(),
        user_id: uid,
        type,
        name,
        note,
        retired: false,
        weight_kg: weightKg,
        shoe_kind: shoeKind,
        max_km: maxKm,
        notify_wear: notifyWear,
      }).select("*").single();
      if (error) throw error;
      return mapGearRow(data);
    }
    if (method === "POST" && id) {
      const patch = {};
      const existing = GEAR.items.find((g) => g.id === id);
      if (typeof body.retired === "boolean") patch.retired = body.retired;
      const name = String(body.name || "").trim().slice(0, 80);
      if (name) patch.name = name;
      if (body.note != null) patch.note = String(body.note).trim().slice(0, 140);
      if (body.weightKg !== undefined) {
        if (existing && gearHasWeight(existing.type)) {
          const weightKg = body.weightKg == null || body.weightKg === "" ? null : Number(body.weightKg);
          if (!(weightKg > 0)) throw new Error(`Enter a weight in ${weightUnit()}.`);
          patch.weight_kg = weightKg;
        }
      }
      if (existing?.type === "shoes") {
        if (body.shoeKind !== undefined) {
          patch.shoe_kind = SHOE_KINDS[body.shoeKind] ? body.shoeKind : "daily";
        }
        if (body.maxKm !== undefined) {
          const maxKm = Number(body.maxKm);
          if (!(maxKm > 0)) throw new Error(`Enter a lifespan target in ${distUnit()}.`);
          patch.max_km = maxKm;
        }
        if (body.notifyWear !== undefined) patch.notify_wear = !!body.notifyWear;
      }
      if (!Object.keys(patch).length) throw new Error("Nothing to update");
      const { data, error } = await sb.from("gear").update(patch).eq("user_id", uid).eq("id", id).select("*").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Gear not found");
      return mapGearRow(data);
    }
  }
  if (url.match(/^\/api\/activity-gear$/)) {
    if (method !== "POST") throw new Error("Method not allowed");
    const activity = String(body.activity || "").trim();
    if (!activity) throw new Error("Activity is required");
    const gearId = body.gearId ? String(body.gearId) : "";
    if (!gearId) {
      const { error } = await sb.from("activity_gear").delete().eq("user_id", uid).eq("activity", activity);
      if (error) throw error;
      return { ok: true, gearId: null };
    }
    const { data: owned, error: findErr } = await sb.from("gear").select("id").eq("user_id", uid).eq("id", gearId).maybeSingle();
    if (findErr) throw findErr;
    if (!owned) throw new Error("Gear not found");
    const { error } = await sb.from("activity_gear").upsert({ user_id: uid, activity, gear_id: gearId });
    if (error) throw error;
    return { ok: true, gearId };
  }
  if (url.match(/^\/api\/activities$/)) {
    if (method === "POST") {
      const ds = String(body.date || "").slice(0, 10);
      const cat = LOG_TYPES[body.type] ? body.type : "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ds)) throw new Error("Pick a valid date");
      if (parseDate(ds) > today()) throw new Error("You can only log today or an older day");
      if (!cat) throw new Error("Choose run, bike, swim or walk");
      const spec = LOG_TYPES[cat];
      const dist = Number(body.distance);
      if (cat === "swim") {
        if (!(dist >= 25 && dist <= 20000)) throw new Error("Swim distance should be metres, between 25 and 20,000");
      } else if (!(dist > 0 && dist < 400)) {
        throw new Error("Distance should be a positive number");
      }
      let hr = null;
      if (body.hr !== "" && body.hr != null) {
        hr = parseInt(body.hr, 10);
        if (!(hr >= 40 && hr <= 220)) throw new Error("Average heart rate should be between 40 and 220");
      }
      const duration = parseDurationInput(body.duration);
      const pace = computeAvgPace(cat, dist, duration.sec);
      const started = uniqueStartedAt(ds);
      const plan = planFor(ds);
      const provisional = {
        datetime: started,
        date: ds,
        cat,
        dist,
        title: spec.title,
      };
      const title = plan && scoreActivityAgainstPlan(provisional, plan)
        ? plan.label
        : spec.title;
      const distText = cat === "swim" ? String(Math.round(dist)) : String(Math.round(dist * 100) / 100);
      const row = {
        user_id: uid,
        activity_type: spec.type,
        started_at: started,
        title,
        distance: dist,
        duration: duration.text,
        avg_hr: hr,
        max_hr: null,
        avg_pace: pace,
        raw: {
          "Activity Type": spec.type,
          Date: started,
          Title: title,
          Distance: distText,
          Time: duration.text || "",
          "Avg HR": hr != null ? String(hr) : "",
          "Max HR": "",
          "Avg Pace": pace || "",
          Source: "manual",
        },
      };
      const { error } = await sb.from("activities").insert(row);
      if (error) throw error;
      return row;
    }
    if (method === "DELETE") {
      const activityType = String(body.activityType || "").trim();
      const startedAt = String(body.startedAt || "").trim();
      if (!activityType || !startedAt) throw new Error("Activity is required");
      const { error } = await sb.from("activities").delete()
        .eq("user_id", uid)
        .eq("activity_type", activityType)
        .eq("started_at", startedAt);
      if (error) throw error;
      await sb.from("activity_gear").delete().eq("user_id", uid).eq("activity", startedAt);
      return { ok: true };
    }
  }
  throw new Error("Unknown request");
}

async function apiRequest(method, url, body) {
  return cloudRequest(method, url, body);
}

async function clearBusyCoveredByEvents(events = EVENTS) {
  if (!CURRENT_USER_ID) return false;
  const covered = new Set();
  (events || []).forEach((ev) => {
    if (!ev?.date) return;
    const start = String(ev.date).slice(0, 10);
    const end = typeof window.eventEndYmd === "function" ? window.eventEndYmd(ev) : start;
    let cur = parseDate(start);
    const last = parseDate(end);
    if (Number.isNaN(cur.getTime()) || Number.isNaN(last.getTime())) return;
    while (cur <= last) {
      covered.add(ymd(cur));
      cur = addDays(cur, 1);
    }
  });
  if (!covered.size) return false;
  const stale = Object.keys(BUSY || {}).filter((ds) => covered.has(ds));
  if (!stale.length) return false;
  await Promise.all(stale.map((ds) => sb.from("busy_days").delete().eq("user_id", CURRENT_USER_ID).eq("date", ds)));
  stale.forEach((ds) => { delete BUSY[ds]; });
  return true;
}

async function syncPlanWithAgendaEvents(events = EVENTS) {
  if (!CURRENT_USER_ID || !hasPlan() || !Array.isArray(window.WEEKS) || !window.WEEKS.length) return false;
  if (typeof window.applyAgendaEventToWeeks !== "function") return false;
  const planStart = PLAN_START || window.CURRENT_PLAN?.start_date;
  const goalDate = MARATHON_DATE || window.CURRENT_PLAN?.event_date;
  if (!planStart) return false;
  let weeks = typeof window.clonePlanWeeks === "function"
    ? window.clonePlanWeeks(window.WEEKS)
    : window.WEEKS.map((w) => ({ ...w, days: (w.days || []).map((d) => (Array.isArray(d) ? d.slice() : d)) }));
  let changed = false;
  const agenda = (events || [])
    .filter((ev) => ev && ev.date && ev.name && !isGoalRace(ev))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  agenda.forEach((ev) => {
    const multi = !!(ev.end_date && ev.end_date > ev.date)
      || (Array.isArray(ev.legs) && ev.legs.length > 1)
      || (typeof window.eventIsSoftKind === "function" && window.eventIsSoftKind(ev.kind));
    if (!multi && !(Number(ev.km) >= 8)) return;
    const result = window.applyAgendaEventToWeeks(weeks, planStart, ev, { goalDate });
    weeks = result.weeks;
    if (result.changed) changed = true;
  });
  try {
    if (await clearBusyCoveredByEvents(agenda)) changed = true;
  } catch (err) {
    console.warn("Could not clear busy days under agenda events", err);
  }
  if (!changed) return false;
  if (JSON.stringify(weeks) === JSON.stringify(window.WEEKS)) return true;
  const { error } = await sb.from("plans").update({ weeks }).eq("user_id", CURRENT_USER_ID);
  if (error) throw error;
  window.WEEKS = weeks;
  if (window.CURRENT_PLAN) window.CURRENT_PLAN.weeks = weeks;
  return true;
}
window.syncPlanWithAgendaEvents = syncPlanWithAgendaEvents;

async function refreshEvents() {
  [EVENTS, CHANGES] = await Promise.all([loadEvents(), loadChanges()]);
  try {
    await syncPlanWithAgendaEvents(EVENTS);
  } catch (err) {
    console.warn("Could not weave agenda events into plan", err);
  }
  render(true);
}

document.addEventListener("click", async (e) => {
  const dialog = document.getElementById("day-dialog");
  if (e.target === dialog) return dialog.close();
  const unitsBtn = e.target.closest("button[data-units]");
  if (unitsBtn) {
    const form = unitsBtn.closest("form");
    const value = unitsBtn.dataset.units;
    if (form && (value === "metric" || value === "imperial")) {
      const hidden = form.querySelector("[name=units]");
      if (hidden) hidden.value = value;
      form.querySelectorAll("[data-units]").forEach((b) => {
        b.classList.toggle("is-on", b.dataset.units === value);
      });
    }
    return;
  }
  const langBtn = e.target.closest("button[data-lang]");
  if (langBtn) {
    const value = langBtn.dataset.lang;
    if (value === "en" || value === "nl") {
      const scope = langBtn.closest("form") || langBtn.closest(".auth-lang-switch") || document;
      const hidden = scope.querySelector?.("[name=language]");
      if (hidden) hidden.value = value;
      scope.querySelectorAll?.("[data-lang]")?.forEach?.((b) => {
        b.classList.toggle("is-on", b.dataset.lang === value);
        b.setAttribute?.("aria-pressed", b.dataset.lang === value ? "true" : "false");
      });
      if (!langBtn.closest(".settings-form") && typeof window.setLanguage === "function") {
        window.setLanguage(value, { persist: true });
        const authForm = document.querySelector(".auth-form");
        if (authForm) {
          const mode = authForm.dataset.mode || "signin";
          const email = authForm.email?.value || "";
          const awaitConfirm = authForm.dataset.awaitConfirm === "1";
          const note = awaitConfirm
            ? (typeof window.t === "function" ? window.t("auth.accountCreated") : "")
            : (authForm.querySelector(".form-note")?.textContent || "");
          if (mode === "recovery") renderPasswordReset(email);
          else {
            renderLogin(note, {
              mode: mode === "forgot" || mode === "signup" ? mode : "signin",
              email,
              awaitConfirm,
              tone: note ? "ok" : undefined,
            });
          }
        }
      }
    }
    return;
  }
  const accountTrigger = e.target.closest("[data-action=account-menu]");
  if (accountTrigger) {
    e.preventDefault();
    toggleAccountMenu();
    return;
  }
  const navMoreTrigger = e.target.closest("[data-action=nav-more]");
  if (navMoreTrigger) {
    e.preventDefault();
    toggleNavMoreMenu();
    return;
  }
  if (!e.target.closest(".account-menu")) closeAccountMenu();
  if (!e.target.closest(".nav-more")) closeNavMoreMenu();
  const link = e.target.closest("a[href]");
  if (link && !link.target && !link.hasAttribute("download") && e.button === 0
      && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey
      && !(link.getAttribute("href") || "").startsWith("#")) {
    const url = new URL(link.getAttribute("href"), location.origin);
    if (url.origin === location.origin && isAppPath(url.pathname)) {
      e.preventDefault();
      closeAccountMenu();
      closeNavMoreMenu();
      const dest = url.pathname.replace(/\/+$/, "") || "/home";
      const onSetupFlow = document.body.classList.contains("onboarding")
        || currentRoute() === "setup"
        || currentRoute() === "create-plan";
      if (onSetupFlow && dest !== "/setup" && dest !== "/create-plan") {
        if (dest === "/home" && typeof window.leaveSetupToHome === "function") {
          await window.leaveSetupToHome();
        } else if (typeof window.saveSetupDraftNow === "function") {
          window.saveSetupDraftNow();
        }
        return;
      }
      if (url.pathname === "/gear" || url.pathname.startsWith("/gear/")) dialog?.close();
      go(url.pathname, { force: dest === "/home" });
      return;
    }
  }
  const weekSummary = e.target.closest("details.week > summary");
  if (weekSummary && !e.target.closest(".day.clickable")) {
    const weekEl = weekSummary.parentElement;
    const wk = Number((weekEl.id.match(/^plan-w(\d+)$/) || [])[1]);
    if (wk) {
      const opening = !weekEl.open;
      rememberPlanWeek(wk, opening);
      syncPlanWeekPath(opening ? wk : PLAN_FOCUS_WEEK);
    }
  }
  const eventSportBtn = e.target.closest("[data-event-sport]");
  if (eventSportBtn) {
    const form = eventSportBtn.closest(".event-form");
    if (form && !form.classList.contains("from-public")) {
      if (form.sport) form.sport.value = eventSportBtn.dataset.eventSport;
      form.querySelectorAll("[data-event-sport]").forEach((b) => {
        b.classList.toggle("active", b === eventSportBtn);
      });
      paintAgendaDistances(form, eventSportBtn.dataset.eventSport, false);
    }
    return;
  }
  const eventPresetBtn = e.target.closest("[data-event-preset]");
  if (eventPresetBtn) {
    const form = eventPresetBtn.closest(".event-form");
    if (form && !form.classList.contains("from-public")) {
      applyAgendaPreset(form, eventPresetBtn.dataset.eventPreset);
    }
    return;
  }
  const eventPublicBtn = e.target.closest("[data-event-public]");
  if (eventPublicBtn) {
    const form = eventPublicBtn.closest(".event-form");
    if (form) setAgendaPublic(form, eventPublicBtn.dataset.eventPublic);
    return;
  }
  const eventKindBtn = e.target.closest("[data-event-kind]");
  if (eventKindBtn) {
    const form = eventKindBtn.closest(".event-form");
    if (form) {
      e.preventDefault();
      if (form.kind) form.kind.value = eventKindBtn.dataset.eventKind || "race";
      form.querySelectorAll("[data-event-kind]").forEach((b) => {
        b.classList.toggle("active", b.dataset.eventKind === form.kind.value);
      });
      rememberEventForm(form);
    }
    return;
  }
  const btn = e.target.closest("[data-action]");
  if (!btn) {
    const day = e.target.closest(".day.clickable");
    if (day && !dialog.contains(day)) openDay(day.dataset.date);
    return;
  }
  // Setup-form strength mode / gear actions are handled in plan.js.
  if (btn.closest(".setup-form") && String(btn.dataset.action || "").startsWith("setup-")) return;
  if (btn.dataset.action === "close-dialog") dialog.close();
  if (btn.dataset.action === "open-day") {
    e.preventDefault();
    openDay(btn.dataset.date);
    return;
  }
  if (btn.dataset.action === "import") {
    closeAccountMenu();
    closeNavMoreMenu();
    document.getElementById("csv-input")?.click();
    return;
  }
  if (btn.dataset.action === "nav-sync") {
    await runNavSync();
    return;
  }
  if (btn.dataset.action === "garmin-sync") {
    if (!GARMIN.connected) {
      toast("Connect Garmin first on the Connections page.");
      go("/connections");
      return;
    }
    const syncButtons = document.querySelectorAll("[data-action=garmin-sync]");
    syncButtons.forEach((el) => { el.disabled = true; });
    try {
      const message = await performGarminSync();
      render(true);
      toast(message);
    } catch (err) {
      GARMIN.lastError = err.message;
      render(true);
      toast(err.message || "Garmin sync failed.", true);
    } finally {
      document.querySelectorAll("[data-action=garmin-sync]").forEach((el) => { el.disabled = false; });
    }
    return;
  }
  if (btn.dataset.action === "garmin-disconnect") {
    if (!confirm("Disconnect Garmin? Your imported activities stay; you can reconnect with a new key anytime.")) return;
    btn.disabled = true;
    try {
      await invokeGarmin({ action: "disconnect" });
      GARMIN = { connected: false, lastSyncAt: null, lastSyncStatus: null, lastError: null, loaded: true };
      render(true);
      toast("Garmin disconnected.");
    } catch (err) {
      toast(err.message || "Could not disconnect Garmin.", true);
    } finally {
      btn.disabled = false;
    }
    return;
  }
  if (btn.dataset.action === "strava-sync") {
    if (!STRAVA.connected) {
      toast("Connect Strava first on the Connections page.");
      go("/connections");
      return;
    }
    const syncButtons = document.querySelectorAll("[data-action=strava-sync]");
    syncButtons.forEach((el) => { el.disabled = true; });
    try {
      const message = await performStravaSync();
      render(true);
      toast(message);
    } catch (err) {
      STRAVA.lastError = err.message;
      render(true);
      toast(err.message || "Strava sync failed.", true);
    } finally {
      document.querySelectorAll("[data-action=strava-sync]").forEach((el) => { el.disabled = false; });
    }
    return;
  }
  if (btn.dataset.action === "strava-disconnect") {
    if (!confirm("Disconnect Strava? Activities imported from Strava will be removed from this app. You can connect again later.")) return;
    btn.disabled = true;
    try {
      await invokeStrava({ action: "disconnect" });
      STRAVA = { connected: false, shareWithCoach: false, lastSyncAt: null, lastSyncStatus: null, lastError: null, needsReconnectForZones: false, loaded: true };
      ACTS = await loadActivities();
      render(true);
      toast("Strava disconnected. Imported activities were removed.");
    } catch (err) {
      toast(err.message || "Could not disconnect Strava.", true);
    } finally {
      btn.disabled = false;
    }
    return;
  }
  if (btn.dataset.action === "predict-mode") {
    PREDICT_MODE = btn.dataset.mode === "pace" ? "pace" : "time";
    render(true);
    return;
  }
  if (btn.dataset.action === "refresh-progress") {
    if (currentRoute() !== "progress") go("/progress");
    requestProgressReport({ manual: true });
    return;
  }
  if (btn.dataset.action === "request-feedback") {
    requestWeekFeedback();
    return;
  }
  if (btn.dataset.action === "toggle-recovery") {
    if (typeof toggleRecoveryPanel === "function") toggleRecoveryPanel();
    return;
  }
  if (btn.dataset.action === "home-zone") {
    if (typeof setHomeZone === "function") setHomeZone(btn.dataset.zone);
    if (btn.dataset.zone === "today") HOME_WEEK = null;
    render(true);
    return;
  }
  if (btn.dataset.action === "home-week-prev" || btn.dataset.action === "home-week-next" || btn.dataset.action === "home-week-today") {
    if (!hasPlan()) return;
    const calendarWk = calendarPlanWeek(today());
    const cur = homeViewWeek(today());
    if (btn.dataset.action === "home-week-today") HOME_WEEK = null;
    else if (btn.dataset.action === "home-week-prev") HOME_WEEK = Math.max(1, cur - 1);
    else HOME_WEEK = Math.min(WEEKS.length, cur + 1);
    if (HOME_WEEK === calendarWk) HOME_WEEK = null;
    if (typeof setHomeZone === "function") setHomeZone("week");
    render(true);
    return;
  }
  if (btn.dataset.action === "dismiss-install") {
    dismissInstallHint();
    render(true);
    return;
  }
  if (btn.dataset.action === "install-app") {
    if (!DEFERRED_INSTALL_PROMPT) {
      toast(tt("install.unavailable"), true);
      return;
    }
    try {
      DEFERRED_INSTALL_PROMPT.prompt();
      const choice = await DEFERRED_INSTALL_PROMPT.userChoice;
      DEFERRED_INSTALL_PROMPT = null;
      if (choice?.outcome === "accepted") dismissInstallHint();
      syncStandaloneClass();
      render(true);
    } catch (err) {
      toast(err.message || tt("install.unavailable"), true);
    }
    return;
  }
  if (btn.dataset.action === "start-plan") {
    if (typeof window.renderCreatePlan === "function") window.renderCreatePlan();
    else go("/create-plan");
    return;
  }
  if (btn.dataset.action === "remove-plan") {
    if (!window.CURRENT_PLAN) return;
    const name = eventLabel();
    if (!confirm(`Remove the ${name} plan? Your activities stay. The goal race on this plan is removed. You can start a new plan from Home.`)) return;
    btn.disabled = true;
    try {
      await window.removeCurrentPlan();
    } catch (err) {
      btn.disabled = false;
      toast(err.message || "Could not remove the plan.", true);
    }
    return;
  }
  if (btn.dataset.action === "unbusy") {
    try {
      await apiRequest("DELETE", `/api/busy/${btn.dataset.date}`);
      await refreshState();
    } catch (err) {
      toast(err.message, true);
    }
    return;
  }
  if (btn.dataset.action === "today-busy") {
    const ds = btn.dataset.date || ymd(today());
    const plan = planFor(ds);
    btn.disabled = true;
    try {
      await apiRequest("POST", "/api/busy", {
        date: ds,
        reason: "",
        session: plan ? plan.label : "",
      });
      await refreshState();
      toast(tt("home.todayBusyDone"));
    } catch (err) {
      toast(err.message || tt("home.todayBusyFail"), true);
    } finally {
      btn.disabled = false;
    }
    return;
  }
  if (btn.dataset.action === "today-move-toggle") {
    if (typeof toggleTodayPanel === "function") toggleTodayPanel("move");
    return;
  }
  if (btn.dataset.action === "today-ask-toggle") {
    const ds = ymd(today());
    const plan = planFor(ds);
    const prefill = plan
      ? `Today (${plan.label}): `
      : `Today (${ds}): `;
    openCoachChat({ prefill });
    return;
  }
  if (btn.dataset.action === "coach-chat-toggle") {
    if (isCoachChatMobile()) {
      if (COACH_CHAT_SHEET_OPEN) closeCoachChatSheet();
      else openCoachChat();
    } else {
      openCoachChat();
    }
    return;
  }
  if (btn.dataset.action === "coach-chat-close") {
    closeCoachChatSheet();
    return;
  }
  if (btn.dataset.action === "coach-chat-collapse") {
    setCoachChatCollapsed(true);
    syncCoachChatUi();
    return;
  }
  if (btn.dataset.action === "coach-chat-expand") {
    setCoachChatCollapsed(false);
    syncCoachChatUi();
    focusCoachChatComposer();
    return;
  }
  if (btn.dataset.action === "today-move") {
    btn.disabled = true;
    try {
      await moveTodaySession(btn.dataset.from, btn.dataset.to);
      await refreshState();
      toast(tt("home.todayMoved", { day: short(parseDate(btn.dataset.to)) }));
    } catch (err) {
      toast(err.message || tt("home.todayMoveFail"), true);
    } finally {
      btn.disabled = false;
    }
    return;
  }
  if (btn.dataset.action === "today-ics") {
    try {
      downloadTodayIcs(btn.dataset.date || ymd(today()));
      toast(tt("home.todayCalendarDone"));
    } catch (err) {
      toast(err.message || tt("home.todayCalendarFail"), true);
    }
    return;
  }
  if (btn.dataset.action === "delete-change") {
    try {
      const row = CHANGES.find((c) => c.id === btn.dataset.id);
      if (row?.type === "adapt") {
        await dismissAdaptationChange(btn.dataset.id);
        render(true);
        syncCoachChatUi();
        toast(tt("coach.adaptDismissed"));
      } else {
        await apiRequest("DELETE", `/api/changes/${encodeURIComponent(btn.dataset.id)}`);
        await refreshState();
        syncCoachChatUi();
      }
    } catch (err) {
      toast(err.message, true);
    }
    return;
  }
  if (btn.dataset.action === "accept-adapt") {
    btn.disabled = true;
    try {
      await applyAdaptationChange(btn.dataset.id);
      render(true);
      syncCoachChatUi();
      toast(tt("coach.adaptApplied"));
    } catch (err) {
      btn.disabled = false;
      toast(err.message, true);
    }
    return;
  }
  if (btn.dataset.action === "niggle-mode") {
    btn.disabled = true;
    try {
      await queueNiggleAdaptation(today());
      await openCoachChat();
      syncCoachChatUi();
      toast(tt("coach.niggleQueued"));
    } catch (err) {
      toast(err.message, true);
    } finally {
      btn.disabled = false;
    }
    return;
  }
  if (btn.dataset.action === "send-coach") {
    if (COACH_STATUS === "reviewing") return;
    if (!coachSendableChanges().length) {
      toast(tt("coach.nothingToSend"), true);
      return;
    }
    COACH_STATUS = "reviewing";
    syncCoachChatUi();
    render(true);
    await sendCoachRequest();
    render(true);
    syncCoachChatUi();
    return;
  }
  if (btn.dataset.action === "open-coach-chat") {
    await openCoachChat();
    return;
  }
  if (btn.dataset.action === "toggle-activity-log") {
    if (btn.closest(".log-form-page")) {
      activityLogOpen = false;
      activityLogDraft = null;
      render(true);
      return;
    }
    if (!activityLogOpen) {
      activityLogOpen = true;
      render(true);
    }
    document.querySelector(".log-form-page [name=date]")?.focus();
    return;
  }

  if (btn?.dataset?.action === "leg-add-sport" || btn?.dataset?.action === "leg-remove-sport"
    || btn?.dataset?.action === "leg-copy-prev") {
    const form = btn.closest(".event-form, .setup-form");
    if (!form || form.classList.contains("from-public") || form.dataset.pickedEvent) return;
    e.preventDefault();
    const legIdx = Number(btn.dataset.leg);
    const legs = readLegsFromEditor(form);
    const leg = legs[legIdx];
    if (!leg) return;
    if (btn.dataset.action === "leg-add-sport") {
      leg.items = [...(leg.items || []), defaultLegItem(form)];
    } else if (btn.dataset.action === "leg-remove-sport") {
      const itemIdx = Number(btn.dataset.item);
      leg.items = (leg.items || []).filter((_, i) => i !== itemIdx);
    } else if (btn.dataset.action === "leg-copy-prev" && legIdx > 0) {
      const prev = legs[legIdx - 1];
      leg.items = JSON.parse(JSON.stringify(prev.items || []));
    }
    const hidden = legsJsonInput(form);
    if (hidden) hidden.value = JSON.stringify(legs);
    if (form.classList.contains("setup-form")) form.dataset.eventLegsJson = JSON.stringify(legs);
    rebuildEventLegsEditor(form, legs);
    if (form.classList.contains("event-form")) rememberEventForm(form);
    return;
  }
  if (btn?.dataset?.action === "leg-rest") {
    return; // checkbox change handler
  }
  if (!btn) return;

  if (btn.dataset.action === "toggle-form") {
    const form = document.querySelector(".event-form");
    if (!form) return;
    const opening = form.hidden;
    eventFollowUpId = null;
    eventPersonalDraft = null;
    if (!opening) {
      eventFormDraft = null;
      eventEditingId = null;
      delete form.dataset.editId;
      render(true);
      return;
    }
    document.querySelector(".event-personal.is-followup")?.remove();
    form.hidden = false;
    paintAgendaDistances(form, form.sport?.value || "run", true);
    form.querySelector("input[name=date]")?.focus();
    return;
  }
  if (btn.dataset.action === "use-similar-event") {
    const form = btn.closest(".event-form");
    if (!form) return;
    let ev = null;
    try { ev = JSON.parse(btn.getAttribute("data-similar-event") || ""); } catch { ev = null; }
    if (!ev) return;
    applyPublicEventToAgenda(form, ev);
    return;
  }
  if (btn.dataset.action === "keep-own-event") {
    const form = btn.closest(".event-form");
    if (!form) return;
    form.dataset.skipSimilar = "1";
    hideSimilarEventPrompt(form);
    form.requestSubmit();
    return;
  }
  if (btn.dataset.action === "pick-effort") {
    const form = btn.closest(".event-personal");
    if (!form) return;
    form.querySelectorAll("[data-effort]").forEach((b) => {
      const on = b === btn;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    if (form.effort) form.effort.value = btn.dataset.effort;
    const note = form.querySelector("[name=note]");
    if (note) {
      note.placeholder = btn.dataset.effort === "other"
        ? "What kind of effort? Only you see this."
        : "e.g. wave B, jog it with friends";
      if (btn.dataset.effort === "other") note.focus();
    }
    if (form.classList.contains("is-followup")) rememberEventPersonal(form);
    return;
  }
  if (btn.dataset.action === "back-event-personal") {
    const form = btn.closest(".event-personal");
    const ev = EVENTS.find((x) => String(x.id) === String(form?.dataset.id)) || followUpEvent();
    if (!ev) return;
    openEventFormForEdit(ev);
    return;
  }
  if (btn.dataset.action === "skip-event-personal") {
    eventFollowUpId = null;
    eventPersonalDraft = null;
    eventEditingId = null;
    render(true);
    return;
  }
  if (btn.dataset.action === "plan-for-event") {
    const form = btn.closest(".event-personal");
    const ev = EVENTS.find((x) => String(x.id) === String(form?.dataset.id));
    if (!ev) return;
    if (isGoalRace(ev) && window.CURRENT_PLAN) {
      toast("This event is already your plan.");
      return;
    }
    if (window.CURRENT_PLAN && !confirm(`Create a plan for ${ev.name}? This replaces your ${eventLabel()} plan.`)) return;
    const errorEl = form?.querySelector(".form-error");
    if (errorEl) errorEl.textContent = "";
    btn.disabled = true;
    try {
      const payload = personalPayload(form, false);
      if (payload) await apiRequest("PATCH", `/api/events/${encodeURIComponent(ev.id)}`, payload);
      eventFollowUpId = null;
      eventPersonalDraft = null;
      eventEditingId = null;
      document.getElementById("day-dialog")?.close();
      if (typeof window.startPlanForAgendaEvent !== "function") throw new Error("Plan setup is not available.");
      await window.startPlanForAgendaEvent(ev, { replace: !!window.CURRENT_PLAN });
    } catch (err) {
      btn.disabled = false;
      if (errorEl) errorEl.textContent = err.message || "Could not start a plan.";
      else toast(err.message || "Could not start a plan.", true);
    }
    return;
  }
  if (btn.dataset.action === "toggle-gear-form") {
    const wrap = document.querySelector(".gear-add");
    if (!wrap) return;
    if (wrap.hidden) openGearForm();
    else closeGearForm();
  }
  if (btn.dataset.action === "quick-gear") {
    try {
      await quickAddStrengthGear(btn.dataset.type);
    } catch (err) {
      toast(err.message || "Could not add gear.", true);
    }
    return;
  }
  if (btn.dataset.action === "edit-gear") {
    const item = GEAR.items.find((g) => g.id === btn.dataset.id);
    if (!item) return;
    openGearForm(item);
  }
  if (btn.dataset.action === "toggle-retire") {
    const item = GEAR.items.find((g) => g.id === btn.dataset.id);
    if (!item) return;
    try {
      await apiRequest("POST", `/api/gear/${encodeURIComponent(item.id)}`, { retired: !item.retired });
      GEAR = await loadGear();
      render(true);
      toast(item.retired ? `${item.name} is active again.` : `${item.name} retired.`);
    } catch (err) {
      toast(err.message, true);
    }
  }
  if (btn.dataset.action === "delete-activity") {
    const started = btn.dataset.started;
    const type = btn.dataset.type;
    if (!started || !type) return;
    if (!confirm("Remove this logged session?")) return;
    try {
      await apiRequest("DELETE", "/api/activities", { activityType: type, startedAt: started });
      ACTS = await loadActivities();
      GEAR = await loadGear();
      render(true);
      if (btn.dataset.date) openDay(btn.dataset.date);
      toast("Session removed.");
    } catch (err) {
      toast(err.message || "Could not remove that session.", true);
    }
    return;
  }
  if (btn.dataset.action === "delete-event") {
    const ev = EVENTS.find((x) => String(x.id) === String(btn.dataset.id));
    if (!ev) return;
    if (!confirm(`Remove “${ev.name}” from your agenda?`)) return;
    const dropPlan = isGoalRace(ev) && window.CURRENT_PLAN
      && confirm(`This is the goal of your ${eventLabel()} plan. Remove that plan too so you can start a new one for a different event?`);
    const fromDialog = !!btn.closest("#day-dialog");
    const date = ev.date;
    try {
      if (dropPlan) {
        await window.removeCurrentPlan();
        toast("Plan and goal race removed. Start a new plan for the event you want.");
        return;
      }
      await apiRequest("DELETE", `/api/events/${encodeURIComponent(ev.id)}`);
      await refreshEvents();
      toast(`Removed ${ev.name}.`);
      if (fromDialog && document.getElementById("day-dialog")?.open) openDay(date);
    } catch (err) {
      toast(err.message || "Could not remove the event.", true);
    }
    return;
  }
});

document.addEventListener("submit", async (e) => {
  const settingsForm = e.target.closest(".settings-form");
  if (settingsForm) {
    e.preventDefault();
    const errorEl = settingsForm.querySelector(".form-error");
    const noteEl = settingsForm.querySelector(".form-note");
    const submit = settingsForm.querySelector("button[type=submit]");
    if (errorEl) errorEl.textContent = "";
    if (noteEl) noteEl.textContent = "";
    if (submit) submit.disabled = true;
    try {
      if (settingsForm.dataset.settings === "username") {
        const username = normalizeUsername(settingsForm.username.value);
        const invalid = usernameError(username);
        if (invalid) throw new Error(invalid);
        await saveUsernameQuiet(username);
        render(true);
        toast(tt("settings.toastName"));
        return;
      }
      if (settingsForm.dataset.settings === "language") {
        const language = settingsForm.language?.value || profileLanguage();
        await saveLanguageQuiet(language);
        if (typeof window.applyDomI18n === "function") window.applyDomI18n();
        render(true);
        toast(tt("settings.toastLanguage"));
        return;
      }
      if (settingsForm.dataset.settings === "units") {
        const units = normalizeUnits(settingsForm.units?.value || profileUnits());
        await saveUnitsQuiet(units);
        render(true);
        toast(units === "imperial" ? tt("settings.toastUnitsImperial") : tt("settings.toastUnitsMetric"));
        return;
      }
      if (settingsForm.dataset.settings === "password") {
        const email = window.CURRENT_USER_EMAIL || "";
        const current = settingsForm.current.value;
        const password = settingsForm.password.value;
        const confirm = settingsForm.confirm.value;
        if (!current) throw new Error(tt("settings.enterCurrentPassword"));
        const message = typeof window.passwordError === "function"
          ? window.passwordError(password, confirm, email)
          : (!password || password !== confirm ? tt("settings.checkNewPassword") : "");
        if (message) {
          if (typeof window.paintPasswordRules === "function") window.paintPasswordRules(settingsForm, true);
          throw new Error(message);
        }
        if (!email) throw new Error(tt("settings.signInAgain"));
        const { error: verifyError } = await sb.auth.signInWithPassword({ email, password: current });
        if (verifyError) throw new Error(tt("settings.currentIncorrect"));
        const { error } = await sb.auth.updateUser({ password });
        if (error) throw error;
        settingsForm.reset();
        if (typeof window.paintPasswordRules === "function") window.paintPasswordRules(settingsForm);
        if (noteEl) noteEl.textContent = tt("settings.passwordUpdated");
        toast("Password updated.");
        return;
      }
    } catch (err) {
      if (errorEl) errorEl.textContent = err.message || "Could not save settings.";
    } finally {
      if (submit) submit.disabled = false;
    }
    return;
  }
  const busyForm = e.target.closest(".busy-form");
  if (busyForm) {
    e.preventDefault();
    const ds = busyForm.dataset.date;
    const plan = planFor(ds);
    try {
      await apiRequest("POST", "/api/busy", { date: ds, reason: busyForm.reason.value, session: plan ? plan.label : "" });
      await refreshState(ds);
    } catch (err) {
      toast(err.message, true);
    }
    return;
  }
  const todayAskForm = e.target.closest(".today-ask-form");
  if (todayAskForm) {
    e.preventDefault();
    const text = String(todayAskForm.text?.value || "").trim();
    if (!text) return;
    const ds = todayAskForm.dataset.date || ymd(today());
    const plan = planFor(ds);
    const prefix = plan
      ? `Today (${plan.label}): `
      : `Today (${ds}): `;
    const submit = todayAskForm.querySelector("button[type=submit]");
    if (submit) submit.disabled = true;
    try {
      await openCoachChat();
      await sendCoachChat(`${prefix}${text}`);
      todayAskForm.reset();
      if (typeof toggleTodayPanel === "function") toggleTodayPanel(null);
    } catch (err) {
      toast(err.message || tt("home.todayAskFail"), true);
    } finally {
      if (submit) submit.disabled = false;
    }
    return;
  }
  const chatForm = e.target.closest(".coach-chat-form");
  if (chatForm) {
    e.preventDefault();
    const text = String(chatForm.text?.value || "").trim();
    if (!text) return;
    const submit = chatForm.querySelector("button[type=submit]");
    if (submit) submit.disabled = true;
    try {
      chatForm.reset();
      await sendCoachChat(text);
    } catch (err) {
      toast(err.message || tt("home.todayAskFail"), true);
      syncCoachChatUi();
    } finally {
      if (submit) submit.disabled = false;
    }
    return;
  }
  const stravaForm = e.target.closest(".strava-form");
  if (stravaForm) {
    e.preventDefault();
    const errorEl = stravaForm.querySelector(".form-error");
    if (errorEl) errorEl.textContent = "";
    const submit = stravaForm.querySelector("button[type=submit]");
    if (submit) submit.disabled = true;
    const fromSetup = stravaForm.dataset.fromSetup === "1"
      || !!document.querySelector(".setup-connect-step");
    try {
      await window.startStravaConnect({
        fromSetup,
        shareWithCoach: !!stravaForm.shareWithCoach?.checked,
        passcode: stravaForm.passcode?.value || "",
      });
      return;
    } catch (err) {
      if (errorEl) errorEl.textContent = err.message || "Could not connect Strava.";
      else toast(err.message || "Could not connect Strava.", true);
    } finally {
      if (submit) submit.disabled = false;
    }
    return;
  }
  const garminForm = e.target.closest(".garmin-form");
  if (garminForm) {
    e.preventDefault();
    const errorEl = garminForm.querySelector(".form-error");
    if (errorEl) errorEl.textContent = "";
    const submit = garminForm.querySelector("button[type=submit]");
    if (submit) submit.disabled = true;
    const setupForm = garminForm.closest(".setup-form") || document.querySelector(".setup-form");
    const onSetupConnect = garminForm.dataset.fromSetup === "1"
      || !!garminForm.closest(".setup-connect-step, #setup-connect")
      || !!document.querySelector(".setup-connect-step");
    const syncNow = !!garminForm.querySelector("[name=sync_now]")?.checked;
    try {
      await invokeGarmin({ action: "save_key", apiKey: garminForm.apiKey.value });
      garminForm.reset();
      await loadGarminStatus();
      document.getElementById("day-dialog")?.close();
      if ((setupForm || onSetupConnect) && syncNow) {
        try {
          await window.setupGarminSync({ permission: true });
        } catch (syncErr) {
          toast(syncErr.message || "Connected, but sync failed. You can retry from setup.", true);
        }
        if (typeof window.paintSetupConnect === "function") window.paintSetupConnect();
        if (setupForm && typeof window.fillWeeklyFromSynced === "function") {
          window.fillWeeklyFromSynced(setupForm, { force: true });
        }
      } else if (setupForm || onSetupConnect) {
        if (typeof window.paintSetupConnect === "function") window.paintSetupConnect();
        toast("Garmin connected.");
      } else {
        render(true);
        toast(syncNow
          ? "Garmin key saved."
          : "Garmin key saved. Sync activities when you’re ready.");
        if (syncNow) {
          try { await window.setupGarminSync({ permission: true }); } catch (syncErr) {
            toast(syncErr.message || "Sync failed.", true);
          }
        }
      }
    } catch (err) {
      if (errorEl) errorEl.textContent = err.message || "Could not save Garmin key.";
      else toast(err.message || "Could not save Garmin key.", true);
    } finally {
      if (submit) submit.disabled = false;
    }
    return;
  }
  const gearForm = e.target.closest(".gear-form");
  if (gearForm) {
    e.preventDefault();
    const errorEl = gearForm.querySelector(".form-error");
    errorEl.textContent = "";
    const id = gearForm.dataset.id;
    const name = gearForm.name.value;
    const note = gearForm.note?.value || "";
    const type = gearForm.type?.value;
    const existing = id ? GEAR.items.find((g) => g.id === id) : null;
    const effectiveType = existing?.type || type;
    let weightKg = null;
    if (gearHasWeight(effectiveType)) {
      weightKg = parseWeightInput(gearForm.weight?.value);
      if (!(weightKg > 0)) {
        errorEl.textContent = `Enter a weight in ${weightUnit()}.`;
        return;
      }
    }
    let shoeKind;
    let maxKm;
    let notifyWear;
    if (effectiveType === "shoes") {
      shoeKind = SHOE_KINDS[gearForm.shoe_kind?.value] ? gearForm.shoe_kind.value : "daily";
      maxKm = parseDistInput(gearForm.max_km?.value);
      if (!(maxKm > 0)) {
        errorEl.textContent = `Enter a lifespan target in ${distUnit()}.`;
        return;
      }
      notifyWear = !!gearForm.notify_wear?.checked;
    }
    const submit = gearForm.querySelector("button[type=submit]");
    if (submit) submit.disabled = true;
    try {
      const payload = { name, note, weightKg, shoeKind, maxKm, notifyWear };
      if (id) {
        await apiRequest("POST", `/api/gear/${encodeURIComponent(id)}`, payload);
        GEAR = await loadGear();
        render(true);
        toast("Gear updated.");
      } else {
        await apiRequest("POST", "/api/gear", { type, ...payload });
        GEAR = await loadGear();
        render(true);
        toast("Gear added.");
      }
    } catch (err) {
      errorEl.textContent = err.message;
    } finally {
      if (submit) submit.disabled = false;
    }
    return;
  }
  const logForm = e.target.closest(".log-form");
  if (logForm) {
    e.preventDefault();
    const errorEl = logForm.querySelector(".form-error");
    if (errorEl) errorEl.textContent = "";
    const submit = logForm.querySelector("button[type=submit]");
    submit.disabled = true;
    const pageForm = logForm.classList.contains("log-form-page");
    const date = pageForm ? logForm.date.value : logForm.dataset.date;
    const sport = logForm.type.value;
    const rawDist = logForm.distance.value;
    const distance = sport === "swim" ? rawDist : String(parseDistInput(rawDist));
    try {
      await apiRequest("POST", "/api/activities", {
        date,
        type: sport,
        distance,
        duration: logForm.duration.value,
        hr: logForm.hr.value,
      });
      if (pageForm) {
        activityLogOpen = false;
        activityLogDraft = null;
      }
      ACTS = await loadActivities();
      render(true);
      if (!pageForm) openDay(date);
      toast("Session logged.");
    } catch (err) {
      if (errorEl) errorEl.textContent = err.message || "Could not save that session.";
      else toast(err.message || "Could not save that session.", true);
    } finally {
      submit.disabled = false;
    }
    return;
  }
  const editForm = e.target.closest(".event-edit-form");
  if (editForm) {
    e.preventDefault();
    const errorEl = editForm.querySelector(".form-error");
    if (errorEl) errorEl.textContent = "";
    try {
      const saved = await apiRequest("PATCH", `/api/events/${encodeURIComponent(editForm.dataset.id)}`, {
        name: editForm.name.value,
        km: parseDistInput(editForm.km.value),
        event_note: editForm.event_note?.value || "",
      });
      await refreshEvents();
      if (saved?.event_note_skipped) toast("Event saved, but the public event note needs a database update.", true);
      else toast("Event updated.");
      if (saved?.date && document.getElementById("day-dialog")?.open) openDay(saved.date);
    } catch (err) {
      if (errorEl) errorEl.textContent = err.message;
      else toast(err.message, true);
    }
    return;
  }
  const personalForm = e.target.closest(".event-personal");
  if (personalForm) {
    e.preventDefault();
    const errorEl = personalForm.querySelector(".form-error");
    if (errorEl) errorEl.textContent = "";
    const submit = personalForm.querySelector("button[type=submit]");
    if (submit) submit.disabled = true;
    try {
      const payload = personalPayload(personalForm, true);
      const saved = await apiRequest("PATCH", `/api/events/${encodeURIComponent(personalForm.dataset.id)}`, payload);
      const date = saved?.date;
      if (eventFollowUpId === personalForm.dataset.id) eventFollowUpId = null;
      eventPersonalDraft = null;
      eventEditingId = null;
      await refreshEvents();
      if (date && document.getElementById("day-dialog")?.open) openDay(date);
      toast("Saved for you.");
    } catch (err) {
      if (errorEl) errorEl.textContent = err.message;
      else toast(err.message, true);
    } finally {
      if (submit) submit.disabled = false;
    }
    return;
  }
  const form = e.target.closest(".event-form");
  if (!form) return;
  e.preventDefault();
  const errorEl = form.querySelector(".form-error");
  if (errorEl) errorEl.textContent = "";
  // Multi-day hides the single-distance field; make sure it can't block HTML5 submit.
  const { start: rangeStart, end: rangeEnd } = eventFormRange(form);
  syncEventKmConstraint(form, !!(rangeStart && rangeEnd && rangeEnd > rangeStart));
  const data = Object.fromEntries(new FormData(form));
  const presetId = data.preset || "";
  const sports = window.EVENT_SPORTS || ["run", "swim", "bike", "triathlon", "walk", "ski"];
  const sport = sports.includes(data.sport) ? data.sport : "run";
  data.sport = sport;
  data.kind = (window.EVENT_KINDS || []).includes(data.kind) ? data.kind : "race";
  data.end_date = String(data.end_date || data.date || "").slice(0, 10);
  const setEventFormError = (msg) => {
    if (errorEl) errorEl.textContent = msg;
    else toast(msg, true);
  };
  if (data.end_date && data.date && data.end_date < data.date) {
    setEventFormError("End date must be on or after the start date.");
    return;
  }
  const multi = data.end_date && data.date && data.end_date > data.date;
  if (multi) {
    data.legs = readLegsFromEditor(form);
    const active = data.legs.some((leg) => (leg.items || []).length);
    if (!active) {
      setEventFormError("Add at least one sport day (or shorten to a single day).");
      return;
    }
    deriveEventSummaryFromForm(form, data);
  } else if (presetId && presetId !== "custom") {
    const km = eventPresetKm(sport, presetId);
    if (km != null) data.km = km;
    const preset = ((window.EVENT_PRESETS || {})[sport] || []).find((p) => p.id === presetId);
    if (preset?.swim) data.swim_m = preset.swim;
    if (preset?.bike) data.bike_km = preset.bike;
    data.legs = [];
    data.end_date = data.date;
  } else {
    data.km = parseDistInput(data.km);
    data.legs = [];
    data.end_date = data.date;
  }
  data.location = clipText(data.location, 80);
  data.is_public = data.is_public === "yes";
  if (form.classList.contains("from-public")) data.event_note = "";
  if (!(Number(data.km) > 0)) {
    if (multi) data.km = 0.1;
    else {
      setEventFormError("Pick a distance.");
      return;
    }
  }
  const submit = form.querySelector("button[type=submit]");
  if (submit) submit.disabled = true;
  try {
    if (!form.dataset.skipSimilar && !form.classList.contains("from-public") && !data.source_id) {
      const similar = await findSimilarPublicEvents({
        date: data.date,
        km: data.km,
        location: data.location,
        sport,
      });
      if (similar.length) {
        showSimilarEventPrompt(form, similar);
        return;
      }
    }
    delete form.dataset.skipSimilar;
    const editId = form.dataset.editId || eventEditingId || "";
    const saved = editId
      ? await apiRequest("PATCH", `/api/events/${encodeURIComponent(editId)}`, data)
      : await apiRequest("POST", "/api/events", data);
    form.reset();
    form.hidden = true;
    delete form.dataset.editId;
    setAgendaEventLocked(form, false);
    hideSimilarEventPrompt(form);
    eventFormDraft = null;
    eventEditingId = null;
    eventFollowUpId = saved?.id || editId || null;
    await refreshEvents();
    document.querySelector(".event-personal.is-followup")?.scrollIntoView({ block: "nearest" });
    if (saved?.event_note_skipped) toast("Event saved. The public event note needs a database update before it can be stored.", true);
    else toast(editId ? "Event updated." : "Event saved.");
  } catch (err) {
    setEventFormError(err.message || "Could not save that event.");
  } finally {
    if (submit) submit.disabled = false;
  }
});

function personalPayload(form, required) {
  const effort = form?.effort?.value || "";
  if (!["easy", "race", "other"].includes(effort)) {
    if (required) throw new Error("Pick easy, race pace, or something else.");
    return null;
  }
  const payload = { effort };
  const noteEl = form.querySelector?.("[name=note]") || form.note;
  if (noteEl) payload.note = noteEl.value || "";
  return payload;
}

document.addEventListener("change", async (e) => {

  const legRest = e.target.closest("[data-action=leg-rest]");
  if (legRest) {
    const form = legRest.closest(".event-form, .setup-form");
    if (form && !form.classList.contains("from-public") && !form.dataset.pickedEvent) {
      const legs = readLegsFromEditor(form);
      const legIdx = Number(legRest.dataset.leg);
      if (legs[legIdx]) {
        legs[legIdx].items = legRest.checked ? [] : [defaultLegItem(form)];
        const hidden = legsJsonInput(form);
        if (hidden) hidden.value = JSON.stringify(legs);
        if (form.classList.contains("setup-form")) form.dataset.eventLegsJson = JSON.stringify(legs);
        rebuildEventLegsEditor(form, legs);
        if (form.classList.contains("event-form")) rememberEventForm(form);
      }
    }
    return;
  }
  const eventDateField = e.target.closest(".event-form [name=date], .event-form [name=end_date]");
  if (eventDateField) {
    const form = eventDateField.closest(".event-form");
    if (form) {
      if (eventDateField.name === "date" && eventDateField.value) {
        const start = String(eventDateField.value).slice(0, 10);
        const endEl = form.querySelector("[name=end_date]");
        if (endEl) {
          endEl.min = start;
          endEl.value = ymd(addDays(parseDate(start), 1));
        }
      }
      rebuildEventLegsEditor(form);
      rememberEventForm(form);
    }
    return;
  }
  const legField = e.target.closest(".event-leg-item select, .event-leg-item input");
  if (legField) {
    const form = legField.closest(".event-form, .setup-form");
    if (form && !form.classList.contains("from-public") && !form.dataset.pickedEvent) {
      const item = legField.closest(".event-leg-item");
      if (legField.matches("select") && item) {
        const prevSport = item.dataset.sport || "run";
        const sport = legField.value || "run";
        const input = item.querySelector("input[type=number]");
        const unitEl = item.querySelector("[data-leg-unit]");
        const raw = String(input?.value || "").trim();
        const km = raw ? legDistParse(prevSport, raw) : 0;
        if (input) {
          input.value = km > 0 ? legDistDisplay(sport, km) : "";
          input.min = sport === "swim" ? "25" : "0.1";
          input.step = sport === "swim" ? "25" : "0.1";
        }
        if (unitEl) unitEl.textContent = legDistUnit(sport);
        item.dataset.sport = sport;
      }
      syncLegsJson(form);
      if (form.classList.contains("event-form")) rememberEventForm(form);
    }
    return;
  }

  const typeSel = e.target.closest(".log-form [name=type]");
  if (typeSel) {
    const form = typeSel.form;
    const swim = typeSel.value === "swim";
    const unit = form.querySelector("[data-unit]");
    if (unit) unit.textContent = logDistUnit(typeSel.value);
    form.distance.min = swim ? "25" : "0.1";
    form.distance.step = swim ? "25" : "0.01";
    if (swim && form.distance.value && Number(form.distance.value) < 25) form.distance.value = "";
    return;
  }
  const gearType = e.target.closest(".gear-form [name=type]");
  if (gearType) {
    syncGearNamePlaceholder(gearType.form);
    syncGearWeightVisibility(gearType.form);
    syncShoeFieldsVisibility(gearType.form);
    if (gearType.value === "shoes") applyShoeKindDefault(gearType.form);
    return;
  }
  const shoeKind = e.target.closest(".gear-form [name=shoe_kind]");
  if (shoeKind) {
    applyShoeKindDefault(shoeKind.form);
    return;
  }
  const share = e.target.closest("[data-action=strava-share]");
  if (share) {
    const next = !!share.checked;
    share.disabled = true;
    try {
      const data = await invokeStrava({ action: "share", shareWithCoach: next });
      STRAVA.shareWithCoach = !!data.shareWithCoach;
      render(true);
      toast(next ? "Strava summaries can go to the AI coach." : "Strava sessions stay in your log only.");
    } catch (err) {
      share.checked = !next;
      toast(err.message || "Could not update Strava sharing.", true);
    } finally {
      share.disabled = false;
    }
    return;
  }
  const sel = e.target.closest("[data-action=assign-gear]");
  if (!sel) return;
  try {
    await apiRequest("POST", "/api/activity-gear", { activity: sel.dataset.activity, gearId: sel.value || null });
    GEAR = await loadGear();
    render(true);
    if (sel.dataset.date) openDay(sel.dataset.date);
    toast(sel.value ? "Gear assigned." : "Gear cleared.");
  } catch (err) {
    toast(err.message, true);
  }
});

document.addEventListener("input", (e) => {
  const personal = e.target.closest?.(".event-personal.is-followup");
  if (personal && (e.target.name === "note" || e.target.name === "effort")) {
    rememberEventPersonal(personal);
  }
  const eventForm = e.target.closest?.(".event-form");
  if (eventForm && !eventForm.hidden) rememberEventForm(eventForm);
  const form = e.target.closest?.(".settings-form[data-settings=password]");
  if (!form || !["password", "confirm", "current"].includes(e.target.name)) return;
  if (typeof window.paintPasswordRules === "function") window.paintPasswordRules(form);
  const errorEl = form.querySelector(".form-error");
  if (errorEl) errorEl.textContent = "";
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeAccountMenu();
    closeNavMoreMenu();
  }
  if (e.key !== "Enter" && e.key !== " ") return;
  const day = e.target.closest?.(".day.clickable, .today-card-hit");
  if (day?.dataset?.date) {
    e.preventDefault();
    openDay(day.dataset.date);
  }
});

document.addEventListener("toggle", (e) => {
  const el = e.target;
  if (!(el instanceof HTMLDetailsElement) || !el.classList.contains("week")) return;
  const wk = Number((el.id.match(/^plan-w(\d+)$/) || [])[1]);
  if (!wk) return;
  if (!PLAN_OPEN_WEEKS) PLAN_OPEN_WEEKS = readOpenPlanWeeks();
  rememberPlanWeek(wk, el.open);
  if (currentRoute() === "plan") syncPlanWeekPath(el.open ? wk : PLAN_FOCUS_WEEK);
}, true);

window.addEventListener("popstate", () => {
  if (!APP_READY && window.CURRENT_USER_ID && typeof window.bootApp === "function") {
    showAppLoading();
    window.bootApp();
    return;
  }
  render();
});
document.getElementById("csv-input").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) importCSV(file);
  e.target.value = "";
});

let APP_READY = false;
let APP_BOOTING = null;
let APP_BOOT_GEN = 0;

function showAppLoading() {
  const app = document.getElementById("app");
  if (!app) return;
  if (!app.querySelector(":scope > .auth-loading")) {
    app.innerHTML = `<p class="muted auth-loading">Loading…</p>`;
  }
  app.dataset.route = "";
  app.dataset.sport = "";
}

window.bootApp = function bootApp() {
  if (currentRoute() === "setup") {
    const hasSetupUi = document.querySelector(".setup-form, .setup-connect-step, .setup-creating");
    if (typeof window.renderOnboarding === "function" && !hasSetupUi) {
      window.renderOnboarding();
    }
    return Promise.resolve();
  }
  if (currentRoute() === "create-plan") {
    const hasForm = document.querySelector(".setup-form[data-create-only='1']");
    if (typeof window.renderCreatePlan === "function" && !hasForm) {
      window.renderCreatePlan();
    }
    return Promise.resolve();
  }
  document.body.classList.remove("onboarding");
  if (APP_READY) {
    if (hasPlan() && typeof window.syncPlanDates === "function") window.syncPlanDates();
    render(true);
    if (hasPlan()) {
      return loadEvents()
        .then(async (events) => {
          EVENTS = events;
          try { await syncPlanWithAgendaEvents(EVENTS); } catch { /* best-effort */ }
          render(true);
        })
        .catch(() => {});
    }
    return Promise.resolve();
  }
  if (APP_BOOTING) return APP_BOOTING;
  const bootUserId = window.CURRENT_USER_ID;
  const gen = APP_BOOT_GEN;
  showAppLoading();
  APP_BOOTING = (async () => {
    if (hasPlan() && typeof window.syncPlanDates === "function") window.syncPlanDates();
    const [acts, events, feedback, busy, changes, gear, messages] = await Promise.all([
      loadActivities(),
      loadEvents(),
      loadFeedback(),
      hasPlan() ? loadBusy() : Promise.resolve({}),
      hasPlan() ? loadChanges() : Promise.resolve([]),
      loadGear(),
      hasPlan() ? loadCoachMessages() : Promise.resolve([]),
    ]);
    if (gen !== APP_BOOT_GEN || window.CURRENT_USER_ID !== bootUserId) return;
    ACTS = acts;
    EVENTS = events;
    FEEDBACK = feedback;
    BUSY = busy;
    CHANGES = changes;
    GEAR = gear;
    COACH_MESSAGES = messages;
    try {
      if (hasPlan()) await syncPlanWithAgendaEvents(EVENTS);
    } catch (err) {
      console.warn("Could not weave agenda events into plan", err);
    }
    await loadWellness();
    if (gen !== APP_BOOT_GEN || window.CURRENT_USER_ID !== bootUserId) return;
    if (hasPlan() && typeof window.refreshFitnessPaces === "function") {
      try { await window.refreshFitnessPaces(ACTS); } catch { /* keep generic paces */ }
    }
    if (gen !== APP_BOOT_GEN || window.CURRENT_USER_ID !== bootUserId) return;
    await Promise.all([loadGarminStatus(), loadStravaStatus()]);
    if (gen !== APP_BOOT_GEN || window.CURRENT_USER_ID !== bootUserId) return;
    await maybeHandleStravaCallback();
    if (gen !== APP_BOOT_GEN || window.CURRENT_USER_ID !== bootUserId) return;
    if (hasPlan()) await Promise.all([loadProgressReport(), loadWeekFeedbackStamp()]);
    if (gen !== APP_BOOT_GEN || window.CURRENT_USER_ID !== bootUserId) return;
    APP_READY = true;
    if (hasPlan()) {
      const adapted = await queueWeekAdaptations(today());
      if (gen !== APP_BOOT_GEN || window.CURRENT_USER_ID !== bootUserId) return;
      const queued = await queueStageReviews(today());
      if (gen !== APP_BOOT_GEN || window.CURRENT_USER_ID !== bootUserId) return;
      if (queued) await sendCoachRequest({ silent: true });
      else await resumeCoachJob();
      await resumeFeedbackJob();
      if (adapted) render(true);
    }
    if (gen !== APP_BOOT_GEN || window.CURRENT_USER_ID !== bootUserId) return;
    render(true);
    maybeToastShoeWear();
    // After first paint: pull Garmin/Strava if they haven't synced today.
    if (typeof maybeAutoSyncConnections === "function") {
      maybeAutoSyncConnections().catch(() => {});
    }
  })().finally(() => {
    if (gen === APP_BOOT_GEN) APP_BOOTING = null;
  });
  return APP_BOOTING;
};

window.resetApp = function resetApp() {
  APP_BOOT_GEN += 1;
  APP_READY = false;
  APP_BOOTING = null;
  ACTS = [];
  EVENTS = [];
  FEEDBACK = { weeks: {}, activities: {} };
  BUSY = {};
  CHANGES = [];
  COACH_MESSAGES = [];
  COACH_CHAT_SHEET_OPEN = false;
  COACH_CHAT_UNREAD = false;
  GEAR = { items: [], assignments: {} };
  window.WELLNESS = {};
  window.TRAINING_METRICS = null;
  try {
    localStorage.removeItem(`wellness-days:${CURRENT_USER_ID || "anon"}`);
    localStorage.removeItem(`training-metrics:${CURRENT_USER_ID || "anon"}`);
  } catch { /* ignore */ }
  GARMIN = { connected: false, lastSyncAt: null, lastSyncStatus: null, lastError: null, loaded: false };
  STRAVA = { connected: false, shareWithCoach: false, lastSyncAt: null, lastSyncStatus: null, lastError: null, needsReconnectForZones: false, loaded: false };
  window.AUTO_SYNC_TRIED = false;
  STRAVA_CALLBACK_HANDLED = false;
  PLAN_OPEN_WEEKS = null;
  PLAN_FOCUS_WEEK = null;
  HOME_WEEK = null;
  PROGRESS_STATUS = "idle";
  PROGRESS_REPORT = null;
  COACH_STATUS = "idle";
  FEEDBACK_STATUS = "idle";
  WEEK_FEEDBACK_STAMP = null;
  clearTimeout(PROGRESS_POLL);
  clearTimeout(COACH_POLL);
  clearTimeout(FEEDBACK_POLL);
  if (typeof window.resetPlanLoad === "function") window.resetPlanLoad();
  else if (typeof window.clearPlanRow === "function") window.clearPlanRow();
  else window.CURRENT_PLAN = null;
  window.CURRENT_USER_ID = null;
  window.CURRENT_PROFILE = null;
  window.CURRENT_USER_EMAIL = "";
  const app = document.getElementById("app");
  if (app) {
    app.dataset.route = "";
    app.dataset.sport = "";
  }
};

let COACH_CHAT_RESIZE_T = null;
window.addEventListener("resize", () => {
  clearTimeout(COACH_CHAT_RESIZE_T);
  COACH_CHAT_RESIZE_T = setTimeout(() => {
    if (typeof syncCoachChatUi === "function") syncCoachChatUi();
  }, 120);
});

window.addEventListener("tp:languagechange", () => {
  if (typeof window.applyDomI18n === "function") window.applyDomI18n();
  if (APP_READY) render(true);
});
