function DAY_NAMES() {
  return typeof window.dayNames === "function"
    ? window.dayNames()
    : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
}
function KIND_LABEL(kind) {
  if (typeof window.kindLabel === "function") return window.kindLabel(kind);
  const fallback = {
    run: "Easy run", quality: "Quality", long: "Long run", event: "Event", race: "Race",
    walk: "Walk", swim: "Swim", walkswim: "Walk + swim", bike: "Bike", rest: "Rest", travel: "Travel",
  };
  return fallback[kind] || kind || "";
}
function tt(key, vars) {
  return typeof window.t === "function" ? window.t(key, vars) : key;
}
const KIND_MATCH = {
  run: ["run"], quality: ["run"], long: ["run"], event: ["run"], race: ["run"],
  walk: ["walk"], swim: ["swim"], walkswim: ["swim"], bike: ["bike"],
};

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
  if (sport === "bike") return isImperial() ? " mph" : " km/h";
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
  const t = type.toLowerCase();
  if (t.includes("run")) return "run";
  if (t.includes("swim")) return "swim";
  if (t.includes("cycl") || t.includes("bik")) return "bike";
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

const GEAR_KINDS = {
  shoes: { title: "Shoes", add: "shoes", hint: "e.g. ASICS Gel Pursue 10", picker: "Shoes", empty: "shoes", addLink: "shoes", unit: "km", group: "endurance" },
  bike: { title: "Bikes", add: "a bike", hint: "e.g. Canyon Endurace", picker: "Bike", empty: "bike", addLink: "a bike", unit: "km", group: "endurance" },
  swimsuit: { title: "Swimsuits", add: "a swimsuit", hint: "e.g. Arena Powerskin", picker: "Swimsuit", empty: "swimsuit", addLink: "a swimsuit", unit: "m", group: "endurance" },
  wetsuit: { title: "Wetsuits", add: "a wetsuit", hint: "e.g. HUUB Aegis", picker: "Wetsuit", empty: "wetsuit", addLink: "a wetsuit", unit: "m", group: "endurance" },
  kettlebell: { title: "Kettlebells", add: "a kettlebell", hint: "e.g. 16 kg", picker: "Kettlebell", empty: "kettlebell", addLink: "a kettlebell", unit: null, group: "strength", hasWeight: true },
  dumbbells: { title: "Dumbbells", add: "dumbbells", hint: "e.g. pair weight", picker: "Dumbbells", empty: "dumbbells", addLink: "dumbbells", unit: null, group: "strength", hasWeight: true },
  barbell: { title: "Barbells", add: "a barbell", hint: "e.g. working weight", picker: "Barbell", empty: "barbell", addLink: "a barbell", unit: null, group: "strength", hasWeight: true },
  bands: { title: "Bands", add: "bands", hint: "e.g. loop + long bands", picker: "Bands", empty: "bands", addLink: "bands", unit: null, group: "strength" },
  pullup: { title: "Pull-up bars", add: "a pull-up bar", hint: "e.g. doorway pull-up bar", picker: "Pull-up bar", empty: "pull-up bar", addLink: "a pull-up bar", unit: null, group: "strength" },
  gym: { title: "Gym access", add: "gym access", hint: "e.g. Basic-Fit membership", picker: "Gym access", empty: "gym access", addLink: "gym access", unit: null, group: "strength" },
};

const ENDURANCE_GEAR_TYPES = Object.keys(GEAR_KINDS).filter((id) => GEAR_KINDS[id].group === "endurance");
const STRENGTH_GEAR_TYPES = Object.keys(GEAR_KINDS).filter((id) => GEAR_KINDS[id].group === "strength");

// Typical useful lifespan by shoe category (km). Midpoints of common manufacturer /
 // coach ranges: daily trainers ~500–800, tempo ~400–600, race/super ~200–400,
 // trail ~500–700. Racing pairs often lose their edge earlier (~240 km).
const SHOE_KINDS = {
  daily: { label: "Daily trainer", maxKm: 700, hint: "Most volume shoes last about 500–800 km" },
  tempo: { label: "Tempo / performance", maxKm: 500, hint: "Lighter foam usually lasts about 400–600 km" },
  race: { label: "Race / super shoe", maxKm: 300, hint: "Carbon race shoes often fade by 200–400 km" },
  trail: { label: "Trail", maxKm: 600, hint: "Trail pairs typically last about 500–700 km" },
  other: { label: "Other", maxKm: 700, hint: "Set your own target distance" },
};
const SHOE_WEAR_WARN = 0.85;

function activeStrengthGear(items = GEAR.items) {
  return (items || []).filter((g) => !g.retired && GEAR_KINDS[g.type]?.group === "strength");
}

function strengthAccessLevel(items = GEAR.items) {
  const form = typeof document !== "undefined" ? document.querySelector(".setup-form") : null;
  const mode = form?.dataset.strengthMode || "";
  const active = activeStrengthGear(items);
  const home = active.filter((g) => g.type !== "gym");
  // Explicit setup choice wins — even before gear inventory is updated.
  if (mode === "bodyweight") return "bodyweight";
  if (mode === "gym") return "gym";
  if (mode === "home") return home.length ? "home" : "bodyweight";
  if (active.some((g) => g.type === "gym")) return "gym";
  if (home.length) return "home";
  return "bodyweight";
}

function strengthAccessLabel(level = strengthAccessLevel()) {
  if (level === "gym") return "Gym membership";
  if (level === "home") return "Home gym";
  return "Bodyweight";
}

function strengthGearAdvice() {
  const level = strengthAccessLevel();
  const active = activeStrengthGear().filter((g) => g.type !== "gym");
  if (level === "gym") return "Strength sessions use your gym membership.";
  if (level === "home") {
    const names = active.map((g) => g.name).slice(0, 3).join(", ");
    const more = active.length > 3 ? ` +${active.length - 3} more` : "";
    return names ? `Uses your gear: ${names}${more}.` : "Add home gym gear to load sessions.";
  }
  return "";
}

function gearHasWeight(type) {
  return !!GEAR_KINDS[type]?.hasWeight;
}

window.activeStrengthGear = activeStrengthGear;
window.strengthAccessLevel = strengthAccessLevel;
window.strengthAccessLabel = strengthAccessLabel;
window.strengthGearAdvice = strengthGearAdvice;

function gearFor(a) {
  const id = GEAR.assignments[a.datetime];
  return id ? GEAR.items.find((g) => g.id === id) : null;
}

function gearTypesFor(cat) {
  if (cat === "bike") return ["bike"];
  if (cat === "run" || cat === "walk") return ["shoes"];
  if (cat === "swim") return ["swimsuit", "wetsuit"];
  return [];
}

function activityLine(a) {
  const dur = a.time && a.time.startsWith("00:") ? a.time.slice(3) : a.time;
  const gear = gearFor(a);
  const bits = [];
  if (a.cat === "swim") bits.push(`Swim ${Math.round(Number(a.dist) || 0)} m`);
  else if (a.cat === "bike") bits.push(`Bike ${fmtDistWithUnit(a.dist)}`);
  else if (a.cat === "walk") bits.push(`Walk ${fmtDistWithUnit(a.dist)}`);
  else bits.push(`Run ${fmtDistWithUnit(a.dist)}`);
  if (dur && a.cat !== "walk") bits.push(dur);
  if (a.pace && a.cat === "run") bits.push(fmtRunPace(a.pace));
  else if (a.pace && a.cat === "swim") bits.push(`${a.pace}/100m`);
  else if (a.pace && a.cat === "bike") bits.push(fmtBikeSpeed(a.pace));
  if (a.hr) bits.push(`HR ${a.hr}`);
  if (gear) bits.push(esc(gear.name));
  return bits.join(" · ");
}

const LOG_TYPES = {
  run: { type: "Running", title: "Run", unitKey: "dist" },
  bike: { type: "Cycling", title: "Ride", unitKey: "dist" },
  swim: { type: "Pool Swim", title: "Swim", unitKey: "m" },
  walk: { type: "Walking", title: "Walk", unitKey: "dist" },
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
  if (cat === "bike") return (dist / (sec / 3600)).toFixed(1);
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
        ${option("swim", "Swim")}
        ${option("walk", "Walk")}
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
  const wanted = plan ? (KIND_MATCH[plan.kind] || []) : [];
  const matched = wanted.length > 0 && wanted.some((c) => dayActs.some((a) => a.cat === c));
  const trainable = wanted.length > 0;
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

function captureEventFormDraft() {
  const form = document.querySelector("#app .event-form");
  if (!form) return;
  if (form.hidden) {
    eventFormDraft = null;
    return;
  }
  eventFormDraft = {
    open: true,
    locked: form.classList.contains("from-public"),
    fields: Object.fromEntries(new FormData(form)),
  };
}

function restoreEventFormDraft(root) {
  const form = root.querySelector(".event-form");
  if (!form || !eventFormDraft?.open) return;
  if (eventFormDraft.locked) setAgendaEventLocked(form, true);
  const search = form.querySelector("input[name=event_search]");
  if (search && !eventFormDraft.locked && search.value.trim().length >= 2) {
    search.dispatchEvent(new Event("input", { bubbles: true }));
  }
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

function ownsEvent(ev) {
  return !!(ev && !ev.source_id);
}

const eventsOn = (dateStr) => EVENTS.filter((e) => eventDay(e) === String(dateStr || "").slice(0, 10));

function isGoalRace(ev) {
  if (!ev) return false;
  if (ev.race) return true;
  const plan = window.CURRENT_PLAN;
  if (!plan) return false;
  return plan.event_date === ev.date && (!plan.event_name || plan.event_name === ev.name);
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
  const [kind] = week.days[dayIndex];
  return eventsOn(ds).map((ev) => {
    if (kind === "event" || kind === "race") {
      const extra = [];
      if (ev.effort && ev.effort !== "race") extra.push(effortLabel(ev.effort));
      if (ev.note) extra.push(esc(ev.note));
      return extra.length ? `<div class="event-note">★ ${extra.join(" — ")}</div>` : "";
    }
    const conflict = eventConflict(week, dayIndex, ev);
    return `
      <div class="event-note">★ ${esc(ev.name)} · ${fmtDistWithUnit(ev.km)} · ${effortLabel(ev.effort)}${ev.note ? ` — ${esc(ev.note)}` : ""}</div>
      ${conflict ? `<div class="event-warn">${conflict}</div>` : ""}`;
  }).join("");
}

function dayRow(week, i, acts, now) {
  const [kind, rawLabel] = week.days[i];
  const label = fmtPlanLabel(rawLabel);
  const date = addDays(weekStart(week.wk), i);
  const ds = ymd(date);
  const dayActs = acts.filter((a) => a.date === ds);
  const isToday = ds === ymd(now);
  const isPast = date < now;
  const wanted = KIND_MATCH[kind] || [];
  const done = wanted.length > 0 && wanted.some((c) => dayActs.some((a) => a.cat === c));
  const busy = BUSY[ds];
  let status = "";
  if (done) status = `<span class="status done" title="${esc(tt("day.done"))}">✓</span>`;
  else if (isPast && wanted.length && !busy) status = `<span class="status missed" title="${esc(tt("day.notLogged"))}">–</span>`;
  const hint = dayActs.length ? tt("day.viewActivity") : isPast ? tt("day.viewSession") : tt("day.howTo");
  const rec = isToday ? recoveryFor(ds) : null;
  const recoveryChip = rec
    ? `<span class="recovery-chip lvl-${rec.score >= 80 ? "high" : rec.score >= 60 ? "mid" : "low"}" title="${esc(tt("day.recovery"))} ${rec.score}">${rec.score}</span>`
    : "";
  return `
    <li class="day clickable ${isToday ? "today" : ""} ${isPast ? "past" : ""} ${busy ? "busy" : ""}" data-date="${ds}" tabindex="0" role="button" title="${esc(hint)}">
      <div class="day-date"><strong>${DAY_NAMES()[i]}</strong><span>${short(date)}</span></div>
      <div class="day-body">
        ${busy ? `<div class="busy-line"><span class="chip k-busy">${tt("common.busy")}</span>${busy.reason ? esc(busy.reason) : tt("day.noTraining")}</div>` : ""}
        <div class="session"><span class="chip k-${kind}">${KIND_LABEL(kind)}</span><span class="label">${label}</span>${recoveryChip}${status}</div>
        ${eventLines(week, i, ds)}
        ${dayActs.map((a) => `<div class="actual k-${a.cat}">${activityLine(a)}</div>`).join("")}
      </div>
      <span class="day-open" aria-hidden="true">›</span>
    </li>`;
}

function loggedDayRow(i, start, acts, now) {
  const date = addDays(start, i);
  const ds = ymd(date);
  const dayActs = acts.filter((a) => a.date === ds);
  const isToday = ds === ymd(now);
  const isPast = date < now;
  const sessions = dayActs.length
    ? dayActs.map((a) => `
        <div class="session"><span class="chip k-${a.cat}">${KIND_LABEL(a.cat) || a.cat}</span><span class="label">${esc(a.title || activityLine(a))}</span></div>
        <div class="actual k-${a.cat}">${activityLine(a)}</div>
        <p class="auto-text">${esc(activityFeedback(a, null, acts))}</p>`).join("")
    : `<div class="session"><span class="chip k-rest">${KIND_LABEL("rest")}</span><span class="label">${isPast ? tt("day.nothingLogged") : tt("day.noSessionYet")}</span></div>`;
  return `
    <li class="day clickable ${isToday ? "today" : ""} ${isPast ? "past" : ""}" data-date="${ds}" tabindex="0" role="button" title="${esc(dayActs.length ? tt("day.viewActivity") : tt("day.viewDay"))}">
      <div class="day-date"><strong>${DAY_NAMES()[i]}</strong><span>${short(date)}</span></div>
      <div class="day-body">${sessions}</div>
      <span class="day-open" aria-hidden="true">›</span>
    </li>`;
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
async function loadGear() {
  if (!CURRENT_USER_ID) return { items: [], assignments: {} };
  const [{ data: items, error: itemErr }, { data: assigned, error: assignErr }] = await Promise.all([
    sb.from("gear").select("*").eq("user_id", CURRENT_USER_ID).order("added_at"),
    sb.from("activity_gear").select("activity,gear_id").eq("user_id", CURRENT_USER_ID),
  ]);
  if (itemErr || assignErr) return { items: [], assignments: {} };
  const assignments = {};
  for (const row of assigned || []) assignments[row.activity] = row.gear_id;
  return {
    items: (items || []).map(mapGearRow),
    assignments,
  };
}

function mapGearRow(row) {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    note: row.note || "",
    retired: !!row.retired,
    weightKg: row.weight_kg != null ? Number(row.weight_kg) : null,
    shoeKind: row.shoe_kind && SHOE_KINDS[row.shoe_kind] ? row.shoe_kind : null,
    maxKm: row.max_km != null ? Number(row.max_km) : null,
    notifyWear: !!row.notify_wear,
    addedAt: row.added_at,
  };
}

function shoeMaxKmDefault(kind) {
  return SHOE_KINDS[kind]?.maxKm || SHOE_KINDS.daily.maxKm;
}

function shoeWearState(item, usedKm = gearDistance(item)) {
  const maxKm = Number(item?.maxKm);
  if (!(maxKm > 0)) return { level: "none", usedKm, maxKm: null, pct: 0 };
  const pct = Math.min(1.5, usedKm / maxKm);
  if (usedKm >= maxKm) return { level: "over", usedKm, maxKm, pct };
  if (usedKm >= maxKm * SHOE_WEAR_WARN) return { level: "warn", usedKm, maxKm, pct };
  return { level: "ok", usedKm, maxKm, pct };
}

function shoeWearAlerts(items = GEAR.items) {
  return (items || [])
    .filter((g) => g.type === "shoes" && !g.retired && g.notifyWear && g.maxKm > 0)
    .map((g) => ({ item: g, wear: shoeWearState(g) }))
    .filter((row) => row.wear.level === "warn" || row.wear.level === "over");
}

function shoeWearBanner() {
  const alerts = shoeWearAlerts();
  if (!alerts.length) return "";
  const lines = alerts.map(({ item, wear }) => {
    const used = fmtDistWithUnit(wear.usedKm, 1);
    const max = fmtDistWithUnit(wear.maxKm, 0);
    if (wear.level === "over") {
      return `<li><strong>${esc(item.name)}</strong> is past its target (${used} / ${max}). Time to retire or rotate them.</li>`;
    }
    return `<li><strong>${esc(item.name)}</strong> is near its target (${used} / ${max}).</li>`;
  }).join("");
  return `
    <section class="card gear-wear-alert" role="status">
      <div class="eyebrow">Shoe lifespan</div>
      <h2>Wear alerts</h2>
      <ul class="gear-wear-list">${lines}</ul>
    </section>`;
}

function maybeToastShoeWear() {
  const alerts = shoeWearAlerts();
  if (!alerts.length) return;
  const key = `shoe-wear-toast:${CURRENT_USER_ID || "anon"}`;
  let seen = {};
  try { seen = JSON.parse(sessionStorage.getItem(key) || "{}"); } catch { seen = {}; }
  const fresh = alerts.filter(({ item, wear }) => seen[item.id] !== wear.level);
  if (!fresh.length) return;
  fresh.forEach(({ item, wear }) => { seen[item.id] = wear.level; });
  try { sessionStorage.setItem(key, JSON.stringify(seen)); } catch { /* ignore */ }
  const over = fresh.filter((r) => r.wear.level === "over");
  const warn = fresh.filter((r) => r.wear.level === "warn");
  if (over.length) {
    toast(over.length === 1
      ? `${over[0].item.name} is past its shoe lifespan target.`
      : `${over.length} pairs are past their shoe lifespan target.`);
  } else if (warn.length) {
    toast(warn.length === 1
      ? `${warn[0].item.name} is near its shoe lifespan target.`
      : `${warn.length} pairs are near their shoe lifespan target.`);
  }
}

function shoeWearBar(item) {
  if (item.type !== "shoes" || !(item.maxKm > 0)) return "";
  const wear = shoeWearState(item);
  const pct = Math.min(100, Math.round(wear.pct * 100));
  const used = fmtDistWithUnit(wear.usedKm, 1);
  const max = fmtDistWithUnit(wear.maxKm, 0);
  const kind = item.shoeKind && SHOE_KINDS[item.shoeKind] ? SHOE_KINDS[item.shoeKind].label : "";
  return `
    <div class="shoe-wear" data-level="${wear.level}">
      <div class="shoe-wear-meta">
        <span>${used} / ${max}${kind ? ` · ${esc(kind)}` : ""}</span>
        <span>${pct}%</span>
      </div>
      <div class="shoe-wear-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Distance on ${esc(item.name)}">
        <span class="shoe-wear-fill" style="width:${pct}%"></span>
      </div>
    </div>`;
}
const pendingChanges = () => CHANGES.filter((c) => c.status !== "applied");

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

function reviewCard(acts, now) {
  const week = reviewWeek(acts, now);
  if (!week) return "";
  const isCurrent = week.wk === weekOf(now);
  const sessions = reviewWeekActs(week, acts);
  const aiActs = actsForCoach(acts);
  const aiSessions = reviewWeekActs(week, aiActs);
  const writing = FEEDBACK_STATUS === "writing";
  const hasNote = !!FEEDBACK.weeks[String(week.wk)];
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
          <div class="eyebrow">${isCurrent ? "This week" : "Last week"} · review</div>
          <h2>Week ${week.wk} feedback</h2>
        </div>
        ${showButton ? `<button type="button" class="button ghost small" data-action="request-feedback"${writing ? " disabled" : ""}>${label}</button>` : ""}
      </div>
      ${reviewBlock(week, acts, now)}
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
  if (a.cat === "bike" && (key === "Avg Pace" || key === "Best Pace")) {
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
  return `
    <section class="guide">
      <h3>${esc(g.title)}</h3>
      <p>${esc(g.why)}</p>
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
  const selected = lead ? "" : (ev.effort === "steady" ? "other" : (ev.effort || ""));
  const known = selected === "easy" || selected === "race" || selected === "other";
  return `
    <form class="event-personal${lead ? " is-followup" : " in-dialog"}" data-id="${esc(ev.id)}">
      ${lead ? `<p class="personal-lead">How hard is ${esc(ev.name)} for you?</p>` : `<div class="eyebrow">Just for you</div>`}
      <p class="muted small-text">Effort and your personal note stay on your agenda. They are not part of the public event.</p>
      <fieldset class="effort-field">
        <legend>Your effort</legend>
        <div class="choice-row">${effortChoices(known ? selected : "")}</div>
      </fieldset>
      <input type="hidden" name="effort" value="${known ? esc(selected) : ""}" />
      <label class="full">Personal note <span class="muted">(optional, only you)</span>
        <input type="text" name="note" maxlength="140" placeholder="${selected === "other" ? "What kind of effort? Only you see this." : "e.g. wave B, jog it with friends"}" value="${lead ? "" : esc(ev.note || "")}" />
      </label>
      <div class="plan-offer">
        ${goal
          ? `<p class="muted small-text">This event is already your plan.</p>`
          : `<p>Want a plan that builds toward this event?</p>
             <button class="button" type="button" data-action="plan-for-event">Create a plan for this event</button>`}
      </div>
      <div class="form-actions">
        <span class="form-error"></span>
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
  if (sleepRow?.sleep_score > 0) {
    parts.push({ key: "Sleep", text: String(Math.round(sleepRow.sleep_score)), score: Number(sleepRow.sleep_score), weight: 0.34 });
  } else if (sleepRow?.sleep_sec > 0) {
    const hours = sleepRow.sleep_sec / 3600;
    parts.push({ key: "Sleep", text: `${hours.toFixed(1)} h`, score: Math.max(0, Math.min(100, (hours / 8) * 100)), weight: 0.34 });
  }
  if (hrvRow?.hrv_night > 0) {
    let score = 85;
    if (hrvRow.hrv_low > 0 && hrvRow.hrv_high > hrvRow.hrv_low) {
      if (hrvRow.hrv_night < hrvRow.hrv_low) score = Math.max(20, 100 * (hrvRow.hrv_night / hrvRow.hrv_low));
      else if (hrvRow.hrv_night > hrvRow.hrv_high) score = 88;
      else score = 100;
    }
    const band = hrvRow.hrv_low && hrvRow.hrv_high ? ` · band ${Math.round(hrvRow.hrv_low)}–${Math.round(hrvRow.hrv_high)}` : "";
    parts.push({ key: "HRV", text: `${Math.round(hrvRow.hrv_night)} ms${band}`, score, weight: 0.3 });
  }
  const battery = liveRow?.battery_morning != null ? liveRow.battery_morning : liveRow?.battery_latest;
  if (battery != null && battery >= 0 && battery <= 100) {
    parts.push({ key: "Body Battery", text: String(Math.round(battery)), score: Number(battery), weight: 0.24 });
  }
  if (liveRow?.stress_avg != null && liveRow.stress_avg >= 0 && liveRow.stress_avg <= 100) {
    parts.push({ key: "Stress", text: String(Math.round(liveRow.stress_avg)), score: Math.max(0, 100 - Number(liveRow.stress_avg)), weight: 0.12 });
  }
  if (!parts.length) return null;
  const weight = parts.reduce((sum, part) => sum + part.weight, 0);
  const score = Math.round(parts.reduce((sum, part) => sum + part.score * part.weight, 0) / weight);
  return { score, parts };
}
window.recoveryFor = recoveryFor;

function recoveryWord(score) {
  if (score >= 80) return "Ready";
  if (score >= 60) return "Okay";
  if (score >= 40) return "Tired";
  return "Rest";
}

function recoveryAdvice(score, plan) {
  const kind = plan?.kind || "";
  const name = plan?.label || "Today's session";
  if (score >= 80) {
    if (kind === "quality") return `${name} can go ahead as written.`;
    if (kind === "long") return `${name} can be the full distance. Stay in the easy heart-rate zone — there is room, and the plan still wants it easy.`;
    return `${name} stays easy so the harder days can land.`;
  }
  if (score >= 60) {
    if (kind === "quality") return `${name} is reasonable. Start conservative and keep the set only if it feels like the plan.`;
    return `${name} is fine at the easy end of the zone.`;
  }
  if (kind === "quality") return `Make ${name} an easy run. Keep the quality for a morning with better sleep and HRV.`;
  if (kind === "long") return `Keep ${name} easy, or cut it short. Sleep, HRV, Body Battery and stress are asking for less today.`;
  return `${name} should be short and easy, or a rest day.`;
}

function recoveryBlock(ds, plan) {
  const rec = recoveryFor(ds);
  if (!rec) {
    if (!GARMIN.connected || ds !== ymd(today())) return "";
    return `
      <section class="recovery">
        <div class="eyebrow">Recovery</div>
        <p class="muted" style="margin:6px 0 0">Sync Garmin to score sleep, Body Battery, stress and HRV for today's session.</p>
      </section>`;
  }
  const level = rec.score >= 80 ? "high" : rec.score >= 60 ? "mid" : "low";
  return `
    <section class="recovery lvl-${level}">
      <div class="recovery-top">
        <div>
          <div class="eyebrow">Recovery · ${esc(recoveryWord(rec.score))}</div>
          <p class="recovery-advice">${esc(recoveryAdvice(rec.score, plan))}</p>
        </div>
        <div class="recovery-score" aria-label="Recovery score ${rec.score}">${rec.score}</div>
      </div>
      <div class="recovery-bar" role="meter" aria-valuenow="${rec.score}" aria-valuemin="0" aria-valuemax="100"><span style="width:${Math.max(0, Math.min(100, rec.score))}%"></span></div>
      <div class="recovery-bits">${rec.parts.map((part) => `<span><em>${esc(part.key)}</em> ${esc(part.text)}</span>`).join("")}</div>
    </section>`;
}

function renderDayDetail(ds) {
  const plan = planFor(ds);
  const date = parseDate(ds);
  const dayActs = ACTS.filter((a) => a.date === ds && a.cat !== "walk");
  const walks = ACTS.filter((a) => a.date === ds && a.cat === "walk");
  const evs = eventsOn(ds);
  const title = plan ? plan.label : hasPlan() ? "Outside the plan" : (dayActs[0]?.title || "Logged day");

  const activityMeta = (a, label) => {
    const time = a.datetime.slice(11, 16);
    return `
      <div class="activity-head">
        <h3>${esc(label)}</h3>
        <div class="activity-meta">
          <span class="muted">${time}${isManualActivity(a) ? " · logged here" : ""}</span>
          ${stravaViewLink(a)}
          <button class="icon-button" type="button" data-action="delete-activity" data-started="${esc(a.datetime)}" data-type="${esc(a.raw["Activity Type"] || "")}" data-date="${esc(a.date)}" aria-label="Remove session">✕</button>
        </div>
      </div>`;
  };

  const activities = dayActs.map((a) => {
    const note = FEEDBACK.activities[a.datetime];
    return `
      <section class="activity k-${a.cat}">
        ${activityMeta(a, a.title || activityLine(a))}
        <div class="feedback">
          ${note ? `<p class="coach-text">${esc(note)}</p>` : ""}
          <p class="auto-text">${esc(activityFeedback(a, plan, ACTS))}</p>
        </div>
        ${gearPicker(a)}
        ${statGrid(a)}
      </section>`;
  }).join("");

  const walkBlocks = walks.map((a) => `
      <section class="activity k-walk">
        ${activityMeta(a, `Walk · ${fmtDistWithUnit(a.dist)}`)}
        ${gearPicker(a)}
      </section>`).join("");

  const guides = plan ? guidesFor(plan.kind, plan.label) : [];
  const showGuidesOpen = !dayActs.length;

  return `
    <header class="dialog-head">
      <div>
        <div class="eyebrow">${fmt(date, { weekday: "long", day: "numeric", month: "long" })}${plan ? ` · Week ${plan.week.wk} · ${plan.week.phase}` : ""}</div>
        <h2>${plan ? `<span class="chip k-${plan.kind}">${KIND_LABEL(plan.kind)}</span> ` : ""}${esc(title)}</h2>
      </div>
      <button class="icon-button" type="button" data-action="close-dialog" aria-label="Close">✕</button>
    </header>
    ${recoveryBlock(ds, plan)}
    ${evs.map((ev) => eventDetailBlock(ev)).join("")}
    ${plan ? busyBlock(plan, ds) : ""}
    ${plan ? paceGraph(plan) : ""}
    ${activities}
    ${walkBlocks}
    ${currentRoute() === "activities" ? "" : logSessionForm(ds, plan, ACTS.filter((a) => a.date === ds))}
    ${guides.length ? `
      <details class="guides" ${showGuidesOpen ? "open" : ""}>
        <summary>${dayActs.length ? "About the planned session" : "How to do this session"}</summary>
        ${guides.map(guideBlock).join("")}
      </details>` : ""}
  `;
}

function gearMatchesActivity(item, a) {
  return gearTypesFor(a.cat).includes(item.type);
}

function gearDistance(item, acts = ACTS) {
  return acts.reduce((sum, a) => {
    if (GEAR.assignments[a.datetime] !== item.id) return sum;
    if (!gearMatchesActivity(item, a)) return sum;
    return sum + (a.dist || 0);
  }, 0);
}

function gearUsageLabel(item) {
  const kind = GEAR_KINDS[item.type];
  if (kind?.group === "strength") {
    const weight = item.weightKg ? fmtWeightWithUnit(item.weightKg) : "";
    if (item.type === "gym") return "Full gym access for strength sessions";
    return weight ? `${weight} · available for strength sessions` : "Available for strength sessions";
  }
  const dist = gearDistance(item);
  const count = ACTS.filter((a) => GEAR.assignments[a.datetime] === item.id).length;
  const amount = kind?.unit === "m"
    ? `${Math.round(dist).toLocaleString(typeof window.localeTag === "function" ? window.localeTag() : "en-GB")} m`
    : fmtDistWithUnit(dist, 1);
  const sessions = count ? ` · ${count} session${count === 1 ? "" : "s"}` : "";
  return `${amount} from assigned activities${sessions}`;
}

function gearPicker(a) {
  const types = gearTypesFor(a.cat);
  if (!types.length) return "";
  const items = GEAR.items.filter((g) => types.includes(g.type));
  const assigned = GEAR.assignments[a.datetime] || "";
  const mixed = types.length > 1;
  if (!items.length) {
    const noun = mixed ? "swimsuit or wetsuit" : GEAR_KINDS[types[0]].empty;
    const add = mixed ? "a swimsuit or wetsuit" : GEAR_KINDS[types[0]].addLink;
    return `<p class="muted small-text">No ${noun} added yet. This activity is fine without gear — <a href="/gear">add ${add}</a> when you want to track it.</p>`;
  }
  const options = items
    .filter((g) => !g.retired || g.id === assigned)
    .map((g) => {
      const kind = mixed ? ` · ${GEAR_KINDS[g.type].picker.toLowerCase()}` : "";
      return `<option value="${esc(g.id)}" ${g.id === assigned ? "selected" : ""}>${esc(g.name)}${kind}${g.retired ? " (retired)" : ""}</option>`;
    })
    .join("");
  return `
    <label class="gear-pick">
      ${mixed ? "Swim kit" : GEAR_KINDS[types[0]].picker}
      <select data-action="assign-gear" data-activity="${esc(a.datetime)}" data-date="${esc(a.date)}">
        <option value="">None</option>
        ${options}
      </select>
    </label>`;
}

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

function gearRow(item) {
  return `
    <li>
      <div class="gear-main">
        <strong>${esc(item.name)}</strong>
        <span class="muted">${item.note ? `${esc(item.note)} · ` : ""}${gearUsageLabel(item)}</span>
        ${shoeWearBar(item)}
      </div>
      <div class="gear-actions">
        <button class="button ghost small" type="button" data-action="edit-gear" data-id="${esc(item.id)}">Edit</button>
        <button class="button ghost small" type="button" data-action="toggle-retire" data-id="${esc(item.id)}">${item.retired ? "Unretire" : "Retire"}</button>
      </div>
    </li>`;
}

function gearGroup(type) {
  const kind = GEAR_KINDS[type];
  const active = GEAR.items.filter((g) => g.type === type && !g.retired);
  if (!active.length) return "";
  return `
    <section class="card">
      <div class="card-head">
        <h2>${kind.title}</h2>
      </div>
      <ul class="gear-list">
        ${active.map(gearRow).join("")}
      </ul>
    </section>`;
}

function retiredGearSection() {
  const retired = GEAR.items.filter((g) => g.retired);
  if (!retired.length) return "";
  const byType = Object.keys(GEAR_KINDS)
    .map((type) => {
      const items = retired.filter((g) => g.type === type);
      if (!items.length) return "";
      return `
        <div class="gear-retired-group">
          <div class="eyebrow gear-retired-label">${GEAR_KINDS[type].title}</div>
          <ul class="gear-list retired">${items.map(gearRow).join("")}</ul>
        </div>`;
    })
    .join("");
  return `
    <section class="card gear-retired">
      <div class="card-head">
        <h2>${tt("gear.retired")}</h2>
      </div>
      <p class="muted setup-hint">${tt("gear.retiredHint")}</p>
      ${byType}
    </section>`;
}

function syncGearNamePlaceholder(form) {
  const kind = GEAR_KINDS[form?.type?.value];
  const input = form?.querySelector("input[name=name]");
  if (kind && input) {
    if (kind.hasWeight) {
      input.placeholder = isImperial() ? "e.g. Competition KB" : "e.g. Cast iron KB";
    } else {
      input.placeholder = kind.hint;
    }
  }
  const weightLabel = form?.querySelector("[data-weight-label]");
  if (weightLabel) weightLabel.textContent = `Weight (${weightUnit()})`;
  const maxLabel = form?.querySelector("[data-max-km-label]");
  if (maxLabel) maxLabel.textContent = `Lifespan target (${distUnit()})`;
}

function syncGearWeightVisibility(form) {
  if (!form) return;
  const wrap = form.querySelector(".gear-weight-field");
  const input = form.querySelector("input[name=weight]");
  const show = gearHasWeight(form.type?.value);
  if (wrap) wrap.hidden = !show;
  if (input) {
    input.required = !!show;
    if (!show) input.value = "";
  }
}

function syncShoeFieldsVisibility(form) {
  if (!form) return;
  const wrap = form.querySelector(".gear-shoe-fields");
  const show = form.type?.value === "shoes";
  if (wrap) wrap.hidden = !show;
  if (!show) return;
  const kind = form.shoe_kind?.value || "daily";
  const hint = form.querySelector("[data-shoe-hint]");
  if (hint) hint.textContent = SHOE_KINDS[kind]?.hint || "";
  if (form.max_km && !form.max_km.value) {
    form.max_km.value = displayDistValue(shoeMaxKmDefault(kind), 0);
  }
}

function applyShoeKindDefault(form) {
  if (!form || form.type?.value !== "shoes") return;
  const kind = form.shoe_kind?.value || "daily";
  const hint = form.querySelector("[data-shoe-hint]");
  if (hint) hint.textContent = SHOE_KINDS[kind]?.hint || "";
  if (form.max_km) form.max_km.value = displayDistValue(shoeMaxKmDefault(kind), 0);
}

function syncGearFormMode(form, item = null) {
  if (!form) return;
  const title = form.closest(".gear-add")?.querySelector(".gear-form-title");
  const type = form.type;
  const submit = form.querySelector("button[type=submit]");
  if (item) {
    form.dataset.id = item.id;
    if (title) title.textContent = "Edit gear";
    if (type) {
      type.value = item.type;
      type.disabled = true;
    }
    if (form.name) form.name.value = item.name || "";
    if (form.note) form.note.value = item.note || "";
    if (submit) submit.textContent = "Save changes";
  } else {
    delete form.dataset.id;
    if (title) title.textContent = "Add gear";
    if (type) type.disabled = false;
    form.reset();
    if (submit) submit.textContent = "Save";
  }
  const errorEl = form.querySelector(".form-error");
  if (errorEl) errorEl.textContent = "";
  syncGearNamePlaceholder(form);
  syncGearWeightVisibility(form);
  syncShoeFieldsVisibility(form);
  if (item && form.weight) form.weight.value = item.weightKg ? fmtWeight(item.weightKg) : "";
  if (item && item.type === "shoes") {
    if (form.shoe_kind) form.shoe_kind.value = item.shoeKind || "daily";
    if (form.max_km) form.max_km.value = item.maxKm ? displayDistValue(item.maxKm, 0) : displayDistValue(shoeMaxKmDefault(form.shoe_kind?.value || "daily"), 0);
    if (form.notify_wear) form.notify_wear.checked = !!item.notifyWear;
    const hint = form.querySelector("[data-shoe-hint]");
    if (hint) hint.textContent = SHOE_KINDS[form.shoe_kind?.value || "daily"]?.hint || "";
  } else if (!item && form.type?.value === "shoes") {
    applyShoeKindDefault(form);
    if (form.notify_wear) form.notify_wear.checked = false;
  }
}

function openGearForm(item = null, presetType = null) {
  const wrap = document.querySelector(".gear-add");
  const form = wrap?.querySelector(".gear-form");
  if (!wrap || !form) return;
  syncGearFormMode(form, item);
  if (!item && presetType && GEAR_KINDS[presetType] && form.type) {
    form.type.value = presetType;
    syncGearNamePlaceholder(form);
    syncGearWeightVisibility(form);
    syncShoeFieldsVisibility(form);
    if (presetType === "shoes") applyShoeKindDefault(form);
  }
  wrap.hidden = false;
  form.querySelector("input[name=name]")?.focus();
  wrap.scrollIntoView({ block: "nearest" });
}

async function quickAddStrengthGear(type, opts = {}) {
  if (!GEAR_KINDS[type] || GEAR_KINDS[type].group !== "strength") return;
  const defaults = {
    gym: { name: "Gym membership", note: "Full equipment access" },
    kettlebell: { name: "Kettlebell", note: "Home strength" },
    dumbbells: { name: "Dumbbells", note: "Home strength" },
    barbell: { name: "Barbell", note: "Home strength" },
    bands: { name: "Resistance bands", note: "Home strength" },
    pullup: { name: "Pull-up bar", note: "Home strength" },
  };
  const existing = GEAR.items.find((g) => g.type === type && !g.retired);
  if (existing && (type === "gym" || opts.insert)) {
    toast(`${existing.name} is already in your kit.`);
    return;
  }
  const insertNow = opts.insert === true || type === "gym" || !document.querySelector(".gear-add");
  if (insertNow) {
    const preset = defaults[type] || { name: GEAR_KINDS[type].picker, note: "" };
    await apiRequest("POST", "/api/gear", {
      type,
      name: preset.name,
      note: preset.note,
    });
    GEAR = await loadGear();
    if (!opts.skipRender) render(true);
    if (!opts.silent) {
      toast(type === "gym"
        ? "Gym membership added — strength sessions can use full gym equipment."
        : `${preset.name} added for strength sessions.`);
    }
    return;
  }
  openGearForm(null, type);
  const form = document.querySelector(".gear-form");
  if (form && defaults[type] && !form.name.value) {
    form.name.value = defaults[type].name;
    if (form.note && !form.note.value) form.note.value = defaults[type].note;
  }
}
window.quickAddStrengthGear = quickAddStrengthGear;

function closeGearForm() {
  const wrap = document.querySelector(".gear-add");
  const form = wrap?.querySelector(".gear-form");
  if (!wrap || !form) return;
  wrap.hidden = true;
  syncGearFormMode(form, null);
}

function gearAddForm() {
  const endurance = ENDURANCE_GEAR_TYPES
    .map((id) => `<option value="${id}">${GEAR_KINDS[id].picker}</option>`)
    .join("");
  const strength = STRENGTH_GEAR_TYPES
    .map((id) => `<option value="${id}">${GEAR_KINDS[id].picker}</option>`)
    .join("");
  const shoeKinds = Object.entries(SHOE_KINDS)
    .map(([id, meta]) => `<option value="${id}">${meta.label}</option>`)
    .join("");
  return `
    <section class="card gear-add" hidden>
      <h2 class="gear-form-title">Add gear</h2>
      <form class="gear-form">
        <label>Type
          <select name="type">
            <optgroup label="Endurance">${endurance}</optgroup>
            <optgroup label="Strength">${strength}</optgroup>
          </select>
        </label>
        <label class="grow">Name<input type="text" name="name" required maxlength="80" placeholder="${GEAR_KINDS.shoes.hint}" /></label>
        <label class="gear-weight-field" hidden>
          <span data-weight-label>Weight (${weightUnit()})</span>
          <input type="number" name="weight" min="0.5" step="0.5" placeholder="${isImperial() ? "35" : "16"}" />
        </label>
        <div class="gear-shoe-fields full" hidden>
          <label>Shoe type
            <select name="shoe_kind">
              ${shoeKinds}
            </select>
          </label>
          <label>
            <span data-max-km-label>Lifespan target (${distUnit()})</span>
            <input type="number" name="max_km" min="1" step="1" />
          </label>
          <p class="setup-hint" data-shoe-hint></p>
          <label class="check-row">
            <input type="checkbox" name="notify_wear" value="1" />
            <span>Notify me when this pair is near or past its lifespan</span>
          </label>
        </div>
        <label class="full">Note <span class="muted">(optional)</span><input type="text" name="note" maxlength="140" placeholder="e.g. daily trainer, race pair" /></label>
        <div class="form-actions">
          <span class="form-error"></span>
          <button class="button ghost" type="button" data-action="toggle-gear-form">Cancel</button>
          <button class="button" type="submit">Save</button>
        </div>
      </form>
    </section>`;
}

function strengthGearQuickAdd() {
  const level = strengthAccessLevel();
  const chips = [
    ["gym", "Gym membership"],
    ["kettlebell", "Kettlebell"],
    ["dumbbells", "Dumbbells"],
    ["bands", "Bands"],
    ["pullup", "Pull-up bar"],
    ["barbell", "Barbell"],
  ].map(([type, label]) => {
    const owned = GEAR.items.some((g) => g.type === type && !g.retired);
    return `<button class="choice-btn${owned ? " is-on" : ""}" type="button" data-action="quick-gear" data-type="${type}" ${owned && type === "gym" ? "disabled" : ""}>${owned && type === "gym" ? "Gym added" : `+ ${label}`}</button>`;
  }).join("");
  return `
    <section class="card gear-strength">
      <div class="eyebrow">${tt("gear.strengthEyebrow")}</div>
      <h2>${tt("gear.strengthTitle")}</h2>
      <p class="muted">${tt("gear.strengthLead")}</p>
      <p class="gear-access-pill"><span class="eyebrow">${tt("gear.current")}</span> ${esc(strengthAccessLabel(level))}</p>
      <p class="setup-hint">${esc(strengthGearAdvice())}</p>
      <div class="choice-row gear-quick">${chips}</div>
    </section>`;
}

function renderGear() {
  const endurance = ENDURANCE_GEAR_TYPES.map(gearGroup).join("");
  const strength = STRENGTH_GEAR_TYPES.map(gearGroup).join("");
  const hasActive = GEAR.items.some((g) => !g.retired);
  return `
    <section class="hero compact">
      <div>
        <div class="eyebrow">${tt("gear.inventory")}</div>
        <h1>${tt("gear.title")}</h1>
        <p class="muted">${tt("gear.lead")}</p>
      </div>
      <button class="button" type="button" data-action="toggle-gear-form">${tt("gear.add")}</button>
    </section>
    ${gearAddForm()}
    ${shoeWearBanner()}
    ${strengthGearQuickAdd()}
    ${strength}
    ${endurance || (!hasActive ? `<section class="card"><p class="muted">${tt("gear.noEndurance")}</p></section>` : "")}
    ${retiredGearSection()}`;
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

function yearSportStats(acts, year) {
  const rows = yearActs(acts, year);
  const cats = ["run", "swim", "bike", "walk"];
  const totals = Object.fromEntries(cats.map((cat) => [cat, { dist: 0, count: 0 }]));
  rows.forEach((a) => {
    if (!totals[a.cat]) return;
    totals[a.cat].dist += a.dist || 0;
    totals[a.cat].count += 1;
  });
  return { year, rows, totals, count: rows.length };
}

const YEAR_SPORTS = ["run", "swim", "bike", "walk"];
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
  const byCat = { run: 0, swim: 0, bike: 0, walk: 0 };
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
      const [kind, , km] = day;
      const wanted = KIND_MATCH[kind] || [];
      if (!wanted.length || BUSY[ds]) return;
      if (date > now) return;
      planned += 1;
      if (km) plannedKm += km;
      const dayActs = acts.filter((a) => a.date === ds);
      if (wanted.some((c) => dayActs.some((a) => a.cat === c))) done += 1;
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
    const sports = ["run", "swim", "bike", "walk"].filter((c) => info.byCat[c]).join(", ");
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
          <p class="muted" style="margin:6px 0 0">Longest this year: ${longest} week${longest === 1 ? "" : "s"}. A week counts when you log any run, swim, bike or walk.</p>
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

let GARMIN = { connected: false, lastSyncAt: null, lastSyncStatus: null, lastError: null, loaded: false };
let STRAVA = { connected: false, shareWithCoach: false, lastSyncAt: null, lastSyncStatus: null, lastError: null, loaded: false };
let STRAVA_CALLBACK_HANDLED = false;

async function invokeGarmin(body) {
  const payload = body && body.action === "sync" ? { ...body, today: ymd(today()) } : body;
  const { data, error } = await sb.functions.invoke("garmin-sync", { body: payload });
  if (error) {
    let msg = error.message || "Garmin request failed";
    try {
      const extra = error.context ? await error.context.json() : data;
      if (extra?.error) msg = extra.error;
    } catch {}
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

async function invokeStrava(body) {
  const { data, error } = await sb.functions.invoke("strava-sync", { body: body || {} });
  if (error) {
    let msg = error.message || "Strava request failed";
    try {
      const extra = error.context ? await error.context.json() : data;
      if (extra?.error) msg = extra.error;
    } catch {}
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

function stravaRedirectUri() {
  return `${location.origin}/connections`;
}

window.GARMIN_STATUS = GARMIN;
window.STRAVA_STATUS = STRAVA;

async function loadGarminStatus() {
  if (!CURRENT_USER_ID) {
    GARMIN = { connected: false, lastSyncAt: null, lastSyncStatus: null, lastError: null, loaded: true };
    window.GARMIN_STATUS = GARMIN;
    return GARMIN;
  }
  try {
    const data = await invokeGarmin({ action: "status" });
    GARMIN = {
      connected: !!data.connected,
      lastSyncAt: data.lastSyncAt || null,
      lastSyncStatus: data.lastSyncStatus || null,
      lastError: data.lastError || null,
      loaded: true,
    };
  } catch (err) {
    GARMIN = {
      connected: false,
      lastSyncAt: null,
      lastSyncStatus: null,
      lastError: err.message || "Could not load Garmin status",
      loaded: true,
    };
  }
  window.GARMIN_STATUS = GARMIN;
  return GARMIN;
}

async function loadStravaStatus() {
  if (!CURRENT_USER_ID) {
    STRAVA = { connected: false, shareWithCoach: false, lastSyncAt: null, lastSyncStatus: null, lastError: null, loaded: true };
    window.STRAVA_STATUS = STRAVA;
    return STRAVA;
  }
  try {
    const data = await invokeStrava({ action: "status" });
    STRAVA = {
      connected: !!data.connected,
      shareWithCoach: !!data.shareWithCoach,
      lastSyncAt: data.lastSyncAt || null,
      lastSyncStatus: data.lastSyncStatus || null,
      lastError: data.lastError || null,
      loaded: true,
    };
  } catch (err) {
    STRAVA = {
      connected: false,
      shareWithCoach: false,
      lastSyncAt: null,
      lastSyncStatus: null,
      lastError: err.message || "Could not load Strava status",
      loaded: true,
    };
  }
  window.STRAVA_STATUS = STRAVA;
  return STRAVA;
}

function decodeStravaStateReturnTo(state) {
  try {
    if (!state || !state.includes(".")) return "";
    const body = state.split(".", 2)[0];
    const padded = body + "=".repeat((4 - (body.length % 4)) % 4);
    const payload = JSON.parse(atob(padded.replace(/-/g, "+").replace(/_/g, "/")));
    if (payload?.ret === "/setup" || payload?.ret === "setup") return "/setup";
    if (payload?.ret === "/connections" || payload?.ret === "connections") return "/connections";
  } catch { /* ignore */ }
  return "";
}

function readStravaReturnTo(state = "") {
  const fromState = decodeStravaStateReturnTo(state);
  if (fromState) return fromState;
  try {
    const explicit = sessionStorage.getItem("strava-return-to") || localStorage.getItem("strava-return-to");
    if (explicit === "/setup" || explicit === "/connections") return explicit;
    if (sessionStorage.getItem("setup-after-strava") === "1") return "/setup";
  } catch { /* ignore */ }
  return "/connections";
}

function clearStravaReturnFlags() {
  try {
    sessionStorage.removeItem("strava-return-to");
    localStorage.removeItem("strava-return-to");
    sessionStorage.removeItem("setup-after-strava");
    sessionStorage.removeItem("strava-oauth-callback");
  } catch { /* ignore */ }
}

function takeStravaOauthCallback() {
  // Prefer the early stash from auth.js (params stripped before Supabase can eat them).
  try {
    const raw = sessionStorage.getItem("strava-oauth-callback");
    if (raw) {
      sessionStorage.removeItem("strava-oauth-callback");
      const parsed = JSON.parse(raw);
      if (parsed && (parsed.code || parsed.error)) return parsed;
    }
  } catch { /* ignore */ }
  const params = new URLSearchParams(location.search);
  const code = params.get("code") || "";
  const state = params.get("state") || "";
  const error = params.get("error") || "";
  if (!code && !error) return null;
  return {
    code,
    state,
    error,
    error_description: params.get("error_description") || "",
  };
}

async function returnAfterStrava(returnTo) {
  clearStravaReturnFlags();
  document.getElementById("day-dialog")?.close();
  if (returnTo === "/setup") {
    try {
      sessionStorage.setItem("setup-pending-connect", "1");
      // Clear connect-done so onboarding shows step 1 again.
      localStorage.removeItem(`setup-connect-done:${CURRENT_USER_ID || "anon"}`);
    } catch { /* ignore */ }
    history.replaceState(null, "", "/setup");
    if (typeof window.renderSetupConnectStep === "function") window.renderSetupConnectStep();
    else if (typeof window.renderOnboarding === "function") window.renderOnboarding();
    return;
  }
  history.replaceState(null, "", "/connections");
  if (!APP_READY && typeof window.bootApp === "function") {
    await window.bootApp();
    return;
  }
  if (typeof window.go === "function") window.go("/connections", { replace: true });
  else render(true);
}

async function maybeHandleStravaCallback() {
  if (STRAVA_CALLBACK_HANDLED || !CURRENT_USER_ID) return false;
  const callback = takeStravaOauthCallback();
  if (!callback) return false;
  const code = callback.code || "";
  const state = callback.state || "";
  const oauthError = callback.error || "";
  if (!code && !oauthError) return false;
  STRAVA_CALLBACK_HANDLED = true;
  const returnTo = readStravaReturnTo(state);
  // Drop any leftover OAuth params from the address bar.
  const url = new URL(location.href);
  ["code", "state", "scope", "error", "error_description"].forEach((k) => url.searchParams.delete(k));
  history.replaceState(null, "", url.pathname + (url.searchParams.toString() ? `?${url.searchParams}` : ""));
  if (oauthError) {
    const detail = callback.error_description || "Strava authorization was cancelled.";
    let message = detail;
    try { message = decodeURIComponent(String(detail).replace(/\+/g, " ")); } catch { /* keep */ }
    toast(message, true);
    await returnAfterStrava(returnTo);
    return true;
  }
  try {
    await invokeStrava({
      action: "exchange",
      code,
      state,
      redirectUri: stravaRedirectUri(),
    });
    await loadStravaStatus();
    try {
      await performStravaSync();
      toast("Strava connected and synced.");
    } catch {
      toast("Strava connected.");
    }
    await returnAfterStrava(returnTo);
  } catch (err) {
    STRAVA.lastError = err.message || "Could not finish Strava connect";
    STRAVA.loaded = true;
    toast(STRAVA.lastError, true);
    await returnAfterStrava(returnTo);
  }
  return true;
}
window.maybeHandleStravaCallback = maybeHandleStravaCallback;

window.refreshSetupConnections = async function refreshSetupConnections() {
  await Promise.all([loadGarminStatus(), loadStravaStatus()]);
  try {
    ACTS = await loadActivities();
    window._setupActs = ACTS;
  } catch { /* keep whatever we have */ }
  return { garmin: GARMIN, strava: STRAVA };
};

window.syncConnectedSourcesForSetup = async function syncConnectedSourcesForSetup() {
  await Promise.all([
    GARMIN.loaded ? Promise.resolve() : loadGarminStatus(),
    STRAVA.loaded ? Promise.resolve() : loadStravaStatus(),
  ]);
  const jobs = [];
  if (GARMIN.connected && typeof window.setupGarminSync === "function") {
    jobs.push(window.setupGarminSync({ permission: true }).catch(() => null));
  }
  if (STRAVA.connected) {
    jobs.push(performStravaSync().catch(() => null));
  }
  if (jobs.length) await Promise.all(jobs);
  try {
    ACTS = await loadActivities();
    window._setupActs = ACTS;
  } catch { /* keep whatever we have */ }
  const setupForm = document.querySelector(".setup-form");
  if (setupForm && typeof window.fillWeeklyFromSynced === "function") {
    window.fillWeeklyFromSynced(setupForm, { force: true });
  }
  return ACTS;
};

window.openGarminKeyDialog = function openGarminKeyDialog({ fromSetup = false } = {}) {
  const dialog = document.getElementById("day-dialog");
  if (!dialog) return;
  dialog.innerHTML = `
    <div class="dialog-body">
      <header class="dialog-head">
        <div>
          <div class="eyebrow">Garmin Connect</div>
          <h2>Paste your API key</h2>
        </div>
        <button class="icon-button" type="button" data-action="close-dialog" aria-label="Close">✕</button>
      </header>
      <p class="muted">Create a Personal API key in Garmin Connect, then paste it here. We’ll ask before syncing activities.</p>
      <form class="garmin-form" data-from-setup="${fromSetup ? "1" : "0"}">
        <label>Personal API key
          <input type="password" name="apiKey" required autocomplete="off" spellcheck="false" placeholder="Paste key from Garmin Connect" />
        </label>
        <label class="own-risk-field">
          <input type="checkbox" name="sync_now" value="1" checked />
          <span>After connecting, sync my existing activities once.</span>
        </label>
        <p class="muted small-text">Key from <a href="https://connect.garmin.com/app/settings/personalApiToken" target="_blank" rel="noopener">Garmin Connect → Personal API</a> (shown once; treat it like a password).</p>
        <p class="form-error" role="alert"></p>
        <button class="button" type="submit">Save &amp; connect</button>
      </form>
    </div>`;
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
  dialog.querySelector("[name=apiKey]")?.focus();
};

window.openStravaPasscodeDialog = function openStravaPasscodeDialog({ fromSetup = false } = {}) {
  const dialog = document.getElementById("day-dialog");
  if (!dialog) return;
  dialog.innerHTML = `
    <div class="dialog-body">
      <header class="dialog-head">
        <div>
          <div class="eyebrow">Strava</div>
          <h2>Enter connect passcode</h2>
        </div>
        <button class="icon-button" type="button" data-action="close-dialog" aria-label="Close">✕</button>
      </header>
      <p class="muted">Enter the connect passcode from the app owner. You’ll then sign in on Strava to authorize.</p>
      <form class="strava-form" data-from-setup="${fromSetup ? "1" : "0"}">
        <label>Connect passcode
          <input type="password" name="passcode" required autocomplete="off" spellcheck="false" placeholder="Passcode from the app owner" />
        </label>
        <label class="own-risk-field">
          <input type="checkbox" name="shareWithCoach" />
          <span>Also send Strava session summaries (date, sport, distance, pace, heart rate) to the AI coach.</span>
        </label>
        <p class="form-error" role="alert"></p>
        <button class="button" type="submit">Continue to Strava</button>
      </form>
    </div>`;
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
  dialog.querySelector("[name=passcode]")?.focus();
};

window.startStravaConnect = async function startStravaConnect({ fromSetup = false, shareWithCoach = false, passcode = "" } = {}) {
  if (!passcode) throw new Error("Enter the connect passcode.");
  const returnTo = fromSetup ? "/setup" : "/connections";
  try {
    sessionStorage.setItem("strava-return-to", returnTo);
    localStorage.setItem("strava-return-to", returnTo);
    if (fromSetup) {
      sessionStorage.setItem("setup-after-strava", "1");
      sessionStorage.setItem("setup-pending-connect", "1");
      // Keep username draft across the Strava redirect.
      const draft = document.querySelector(".setup-identity-form [name=username]")?.value || "";
      if (draft) sessionStorage.setItem("setup-username-draft", draft);
    } else {
      sessionStorage.removeItem("setup-after-strava");
    }
  } catch { /* ignore */ }
  const data = await invokeStrava({
    action: "connect_url",
    passcode,
    redirectUri: stravaRedirectUri(),
    shareWithCoach,
    returnTo,
  });
  if (!data?.url) throw new Error("Could not start Strava connect.");
  location.href = data.url;
};

window.setupGarminSync = async function setupGarminSync({ permission = true } = {}) {
  if (!permission) throw new Error("Permission needed to sync existing activities.");
  if (!GARMIN.connected) {
    await loadGarminStatus();
    if (!GARMIN.connected) throw new Error("Connect Garmin first.");
  }
  const fullKey = `garmin-full-gear:${CURRENT_USER_ID || "anon"}`;
  const full = !localStorage.getItem(fullKey);
  const data = await invokeGarmin({ action: "sync", full });
  if (full) localStorage.setItem(fullKey, "1");
  GARMIN = {
    connected: true,
    lastSyncAt: data.lastSyncAt || new Date().toISOString(),
    lastSyncStatus: data.status || null,
    lastError: null,
    loaded: true,
  };
  window.GARMIN_STATUS = GARMIN;
  applyGarminContext(data);
  ACTS = await loadActivities();
  window._setupActs = ACTS;
  const n = data.inserted || 0;
  const msg = n
    ? `Synced ${n} activit${n === 1 ? "y" : "ies"} from Garmin.`
    : (data.total ? `Garmin sync complete — ${data.updated || 0} already known.` : "Garmin sync complete — nothing new in range.");
  toast(msg);
  const setupForm = document.querySelector(".setup-form");
  if (setupForm && typeof window.fillWeeklyFromSynced === "function") {
    window.fillWeeklyFromSynced(setupForm, { force: true });
  }
  if (typeof window.paintSetupConnect === "function" && document.getElementById("setup-connect-body")) {
    window.paintSetupConnect();
  }
  return data;
};

function garminLastSyncLabel() {
  if (!GARMIN.lastSyncAt) return null;
  const day = short(parseDate(String(GARMIN.lastSyncAt).slice(0, 10)));
  const time = String(GARMIN.lastSyncAt).includes("T") ? ` ${String(GARMIN.lastSyncAt).slice(11, 16)}` : "";
  return `${day}${time}`;
}

function garminStatusLine() {
  if (!GARMIN.loaded) return "Checking connection…";
  if (!GARMIN.connected) {
    if (GARMIN.lastError) return GARMIN.lastError;
    return "Not connected. Create a Personal API key on Garmin Connect, then paste it below.";
  }
  const when = garminLastSyncLabel();
  if (GARMIN.lastError) return `Last sync failed${when ? ` (${when})` : ""}: ${GARMIN.lastError}`;
  if (GARMIN.lastSyncStatus) return `${when ? `Last sync ${when} · ` : ""}${GARMIN.lastSyncStatus}`;
  return "Connected. Sync to pull sessions from Garmin Connect.";
}

function stravaLastSyncLabel() {
  if (!STRAVA.lastSyncAt) return null;
  const day = short(parseDate(String(STRAVA.lastSyncAt).slice(0, 10)));
  const time = String(STRAVA.lastSyncAt).includes("T") ? ` ${String(STRAVA.lastSyncAt).slice(11, 16)}` : "";
  return `${day}${time}`;
}

function stravaStatusLine() {
  if (!STRAVA.loaded) return "Checking connection…";
  if (!STRAVA.connected) {
    if (STRAVA.lastError) return STRAVA.lastError;
    return "Not connected. Ask for the connect passcode, then authorize Strava.";
  }
  const when = stravaLastSyncLabel();
  if (STRAVA.lastError) return `Last sync failed${when ? ` (${when})` : ""}: ${STRAVA.lastError}`;
  if (STRAVA.lastSyncStatus) return `${when ? `Last sync ${when} · ` : ""}${STRAVA.lastSyncStatus}`;
  return "Connected. Sync to pull sessions from Strava.";
}

function navSyncLabel() {
  if (GARMIN.connected && STRAVA.connected) return "Sync Garmin and Strava";
  if (GARMIN.connected) return "Sync Garmin";
  if (STRAVA.connected) return "Sync Strava";
  return "Sync activities";
}

function updateNavSyncButton() {
  const btn = document.querySelector(".sync-btn");
  if (!btn) return;
  const label = navSyncLabel();
  btn.title = label;
  btn.setAttribute("aria-label", label);
}

async function performGarminSync() {
  const fullKey = `garmin-full-gear:${CURRENT_USER_ID || "anon"}`;
  const full = localStorage.getItem(fullKey) !== "done";
  const data = await invokeGarmin({ action: "sync", full });
  if (data?.full && !String(data.lastSyncStatus || "").includes("Gear matching paused")) {
    localStorage.setItem(fullKey, "done");
  }
  GARMIN = {
    connected: true,
    lastSyncAt: data.lastSyncAt || null,
    lastSyncStatus: data.lastSyncStatus || null,
    lastError: data.lastError || null,
    loaded: true,
  };
  window.GARMIN_STATUS = GARMIN;
  applyGarminContext(data);
  ACTS = await loadActivities();
  try { await loadWellness(); } catch {}
  try { GEAR = await loadGear(); } catch {}
  try { CHANGES = await loadChanges(); } catch {}
  const n = data.added || 0;
  const base = n
    ? `Synced ${n} new activit${n === 1 ? "y" : "ies"} from Garmin (${data.updated || 0} updated).`
    : (data.total ? `Garmin sync complete — ${data.updated || 0} already known.` : "Garmin sync complete — no activities in range.");
  const gearBits = [];
  if (data.gearAssigned) gearBits.push(`linked gear on ${data.gearAssigned}`);
  if (data.gearCreated) gearBits.push(`added ${data.gearCreated} from Garmin`);
  if (Array.isArray(data.wellness) && data.wellness.length) gearBits.push("recovery updated");
  if (data.metrics?.vo2_run) gearBits.push(`VO2 ${data.metrics.vo2_run}`);
  if (data.splitsAdded) gearBits.push(`${data.splitsAdded} run${data.splitsAdded === 1 ? "" : "s"} with splits`);
  return gearBits.length ? `${base} ${gearBits.join(", ")}.` : base;
}

async function performStravaSync() {
  const data = await invokeStrava({ action: "sync" });
  STRAVA = {
    connected: true,
    shareWithCoach: STRAVA.shareWithCoach,
    lastSyncAt: data.lastSyncAt || null,
    lastSyncStatus: data.lastSyncStatus || null,
    lastError: data.lastError || null,
    loaded: true,
  };
  window.STRAVA_STATUS = STRAVA;
  ACTS = await loadActivities();
  window._setupActs = ACTS;
  try { GEAR = await loadGear(); } catch {}
  const setupForm = document.querySelector(".setup-form");
  if (setupForm && typeof window.fillWeeklyFromSynced === "function") {
    window.fillWeeklyFromSynced(setupForm, { force: true });
  }
  const n = data.added || 0;
  const bits = [];
  if (data.skippedDup) bits.push(`skipped ${data.skippedDup} already on Garmin`);
  if (data.gearAssigned) bits.push(`linked gear on ${data.gearAssigned}`);
  if (data.gearCreated) bits.push(`added ${data.gearCreated} from Strava`);
  const base = n
    ? `Synced ${n} new activit${n === 1 ? "y" : "ies"} from Strava (${data.updated || 0} updated).`
    : (data.total || data.skippedDup
      ? `Strava sync complete — ${data.updated || 0} already known.`
      : "Strava sync complete — no activities in range.");
  return bits.length ? `${base} ${bits.join(", ")}.` : base;
}

function setSyncButtonsDisabled(disabled) {
  document.querySelectorAll(".sync-btn, [data-action=garmin-sync], [data-action=strava-sync]").forEach((el) => {
    el.disabled = disabled;
  });
}

async function runNavSync() {
  if (!GARMIN.loaded || !STRAVA.loaded) {
    await Promise.all([
      GARMIN.loaded ? Promise.resolve() : loadGarminStatus(),
      STRAVA.loaded ? Promise.resolve() : loadStravaStatus(),
    ]);
  }
  updateNavSyncButton();
  if (!GARMIN.connected && !STRAVA.connected) {
    toast("Connect Garmin or Strava on the Connections page.");
    go("/connections");
    return;
  }
  setSyncButtonsDisabled(true);
  const messages = [];
  const errors = [];
  try {
    if (GARMIN.connected) {
      try {
        messages.push(await performGarminSync());
      } catch (err) {
        GARMIN.lastError = err.message;
        errors.push(err.message || "Garmin sync failed.");
      }
    }
    if (STRAVA.connected) {
      try {
        messages.push(await performStravaSync());
      } catch (err) {
        STRAVA.lastError = err.message;
        errors.push(err.message || "Strava sync failed.");
      }
    }
    render(true);
    if (messages.length) toast(messages.join(" "));
    if (errors.length) toast(errors.join(" "), true);
  } finally {
    setSyncButtonsDisabled(false);
    updateNavSyncButton();
  }
}

function syncIconSvg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 0 0-15.5-6.4"/><path d="M3 4.5v5h5"/><path d="M3 12a9 9 0 0 0 15.5 6.4"/><path d="M21 19.5v-5h-5"/></svg>`;
}

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
  const open = panel.hidden;
  panel.hidden = !open;
  menu.classList.toggle("open", open);
  btn.setAttribute("aria-expanded", open ? "true" : "false");
}

function renderGarminConnectionCard() {
  const connected = GARMIN.connected;
  return `
    <section class="card conn-card">
      <div class="card-head">
        <div>
          <div class="eyebrow">${tt("conn.device")}</div>
          <h2>Garmin Connect</h2>
          <p class="muted" style="margin:6px 0 0">${tt("conn.garminLead")}</p>
        </div>
        <span class="conn-label ${connected ? "on" : "off"}">${connected ? tt("common.connected") : tt("common.notConnected")}</span>
      </div>
      <p class="conn-meta ${GARMIN.lastError ? "warn" : ""}">${esc(garminStatusLine())}</p>
      ${connected ? `
        <div class="conn-actions">
          <button class="button" type="button" data-action="garmin-sync">${syncIconSvg()} ${tt("common.sync")}</button>
          <button class="button ghost" type="button" data-action="garmin-disconnect">${tt("common.disconnect")}</button>
        </div>
        <details class="garmin-key-replace">
          <summary class="muted small-text">${tt("conn.replaceKey")}</summary>
          <form class="garmin-form">
            <label>${tt("conn.newKey")}
              <input type="password" name="apiKey" required autocomplete="off" spellcheck="false" placeholder="${esc(tt("conn.keyPlaceholder"))}" />
            </label>
            <p class="form-error"></p>
            <button class="button small" type="submit">${tt("conn.saveKey")}</button>
          </form>
        </details>` : `
        <form class="garmin-form">
          <label>${tt("conn.apiKey")}
            <input type="password" name="apiKey" required autocomplete="off" spellcheck="false" placeholder="${esc(tt("conn.keyPlaceholder"))}" />
          </label>
          <p class="muted small-text">${tt("conn.garminKeyHelp").replace("Garmin Connect → Personal API", `<a href="https://connect.garmin.com/app/settings/personalApiToken" target="_blank" rel="noopener">Garmin Connect → Personal API</a>`)}</p>
          <p class="form-error"></p>
          <button class="button" type="submit">${tt("conn.saveConnect")}</button>
        </form>`}
    </section>`;
}

function renderStravaConnectionCard() {
  const connected = STRAVA.connected;
  return `
    <section class="card conn-card">
      <div class="card-head">
        <div>
          <div class="eyebrow">${tt("conn.service")}</div>
          <h2>Strava</h2>
          <p class="muted" style="margin:6px 0 0">${tt("conn.stravaLead")}</p>
        </div>
        <span class="conn-label ${connected ? "on" : "off"}">${connected ? tt("common.connected") : tt("common.notConnected")}</span>
      </div>
      <p class="conn-meta ${STRAVA.lastError ? "warn" : ""}">${esc(stravaStatusLine())}</p>
      ${connected ? `
        <label class="own-risk-field">
          <input type="checkbox" data-action="strava-share" ${STRAVA.shareWithCoach ? "checked" : ""} />
          <span>${tt("conn.stravaShare")}</span>
        </label>
        <div class="conn-actions">
          <button class="button" type="button" data-action="strava-sync">${syncIconSvg()} ${tt("common.sync")}</button>
          <button class="button ghost" type="button" data-action="strava-disconnect">${tt("common.disconnect")}</button>
        </div>` : `
        <form class="strava-form">
          <label>${tt("conn.passcode")}
            <input type="password" name="passcode" required autocomplete="off" spellcheck="false" placeholder="${esc(tt("conn.passcodePlaceholder"))}" />
          </label>
          <label class="own-risk-field">
            <input type="checkbox" name="shareWithCoach" />
            <span>${tt("conn.stravaShareAlso")}</span>
          </label>
          <p class="muted small-text">${tt("conn.stravaHelp")}</p>
          <p class="form-error"></p>
          <button class="strava-connect" type="submit">
            <img src="/assets/btn_strava_connect_with_orange.svg" width="237" height="48" alt="Connect with Strava" />
          </button>
        </form>`}
    </section>`;
}

function renderConnections() {
  return `
    <section class="hero compact">
      <div>
        <div class="eyebrow">${tt("conn.eyebrow")}</div>
        <h1>${tt("conn.title")}</h1>
        <p class="muted">${tt("conn.lead")}</p>
      </div>
    </section>
    ${renderGarminConnectionCard()}
    ${renderStravaConnectionCard()}
    <p class="footnote">${tt("conn.csvFootnote")}</p>`;
}

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

function isEventDay(plan, ds) {
  return plan?.kind === "event" || plan?.kind === "race" || eventsOn(ds).length > 0;
}

function busyBlock(plan, ds) {
  const busy = BUSY[ds];
  if (busy) {
    return `
      <section class="busy-box">
        <div><strong>Marked as busy</strong>${busy.reason ? ` · ${esc(busy.reason)}` : ""}</div>
        <p>${esc(busySuggestion(plan.week, plan.i))}</p>
        <p class="muted small-text">Added to the plan changes on the Full plan page, so the AI coach can rework this week.</p>
        <button class="button ghost small" type="button" data-action="unbusy" data-date="${ds}">Unmark: I can train after all</button>
      </section>`;
  }
  if (parseDate(ds) < today() || isEventDay(plan, ds)) return "";
  return `
    <form class="busy-form" data-date="${ds}">
      <input type="text" name="reason" maxlength="140" placeholder="Something on? e.g. dinner, work trip, family day" />
      <button class="button ghost small" type="submit">Mark as busy day</button>
    </form>`;
}

function eventDay(ev) {
  return String(ev?.date || "").slice(0, 10);
}

function openDay(ds) {
  const day = String(ds || "").slice(0, 10);
  const dialog = document.getElementById("day-dialog");
  if (!day || !dialog) return;
  try {
    if (hasPlan()) {
      const wk = weekOf(parseDate(day));
      if (wk >= 1 && wk <= WEEKS.length) {
        rememberPlanWeek(wk);
        if (currentRoute() === "plan") syncPlanWeekPath(wk);
      }
    }
    dialog.innerHTML = `<div class="dialog-body">${renderDayDetail(day)}</div>`;
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
  } catch (err) {
    toast(err.message || "Could not open that day.", true);
  }
}

function weekRunKm(week, acts) {
  const from = ymd(weekStart(week.wk)), to = ymd(addDays(weekStart(week.wk), 6));
  return acts.filter((a) => a.cat === "run" && a.date >= from && a.date <= to).reduce((s, a) => s + (a.dist || 0), 0);
}

function hasSportTarget(week, key) {
  const val = week?.[key];
  return !!(val && val !== "—");
}

function extraSportTargets(week) {
  return [
    hasSportTarget(week, "swim") ? `<div><span>Swim</span><strong>${week.swim}</strong></div>` : "",
    hasSportTarget(week, "bike") ? `<div><span>Bike</span><strong>${week.bike}</strong></div>` : "",
  ].join("");
}

function weekCard(week, acts, now, title) {
  const s = weekStart(week.wk), e = addDays(s, 6);
  const actual = weekRunKm(week, acts);
  const showActual = s <= now;
  const pct = Math.min(100, Math.round((actual / week.km) * 100));
  return `
    <section class="card">
      <div class="card-head">
        <div>
          <div class="eyebrow">${title}</div>
          <h2>${tt("home.weekTitle", { week: week.wk, range: `${short(s)} – ${short(e)}` })}</h2>
        </div>
        <span class="pill p-${week.phase}">${week.phase}</span>
      </div>
      <div class="targets">
        <div><span>${tt("home.targetRun")}</span><strong>${fmtDistWithUnit(week.km, 0)}</strong></div>
        <div><span>${tt("home.targetLong")}</span><strong>${fmtDistWithUnit(week.long, 0)}</strong></div>
        ${extraSportTargets(week)}
      </div>
      ${showActual ? `
        <div class="progress">
          <div class="progress-label">${tt("home.loggedRun", { unit: distUnit() })} <strong>${fmtDist(actual, 1)}</strong> / ${fmtDist(week.km, 0)}</div>
          <div class="bar"><div style="width:${pct}%"></div></div>
        </div>` : ""}
      ${week.note ? `<p class="note">${week.note}</p>` : ""}
      <ul class="days">${week.days.map((_, i) => dayRow(week, i, acts, now)).join("")}</ul>
    </section>`;
}

// ---------- Views ----------

function loggedWeekBlock(acts, now) {
  const start = mondayOf(now);
  const end = addDays(start, 6);
  const weekActs = acts.filter((a) => a.date >= ymd(start) && a.date <= ymd(end));
  const runs = weekActs.filter((a) => a.cat === "run");
  const km = runs.reduce((s, a) => s + (a.dist || 0), 0);
  const summary = typeof loggedWeekFeedback === "function" ? loggedWeekFeedback(acts, now) : "";
  return `
    <section class="card review">
      <div class="card-head">
        <div>
          <div class="eyebrow">${tt("home.thisWeekReview")}</div>
          <h2>${short(start)} – ${short(end)}</h2>
        </div>
      </div>
      <p class="auto-text">${esc(summary)}</p>
    </section>
    <section class="card">
      <div class="card-head">
        <div>
          <div class="eyebrow">This week</div>
          <h2>${weekActs.length ? `${fmtDistWithUnit(km, 1)} from ${runs.length} run${runs.length === 1 ? "" : "s"}` : "No sessions logged yet"}</h2>
        </div>
      </div>
      <ul class="days">${[0, 1, 2, 3, 4, 5, 6].map((i) => loggedDayRow(i, start, acts, now)).join("")}</ul>
    </section>`;
}

function eventSportCats(ev) {
  const sport = String(ev?.sport || "run").toLowerCase();
  if (sport === "triathlon" || sport === "tri") return ["run", "swim", "bike"];
  if (sport === "swim" || sport === "bike" || sport === "run") return [sport];
  return ["run"];
}

function eventIsDone(ev, acts = ACTS) {
  const ds = eventDay(ev);
  if (!ds) return false;
  const wanted = eventSportCats(ev);
  return acts.some((a) => a.date === ds && wanted.includes(a.cat));
}

function eventIsPast(ev, now, acts = ACTS) {
  const d = parseDate(eventDay(ev));
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
  const wk = hasPlan() ? weekOf(d) : 0;
  const weekBit = wk >= 1 && wk <= WEEKS.length ? ` · week ${wk}` : "";
  const n = past ? daysBetween(d, now) : daysBetween(now, d);
  const when = past
    ? (n === 0 ? "today" : `${n} day${n === 1 ? "" : "s"} ago`)
    : (n === 0 ? "today" : `in ${n} days`);
  return `<li class="event-item ${e.race ? "race" : ""}${past ? " past" : ""}">
    <button type="button" class="ev-open" data-action="open-day" data-date="${esc(ds)}" title="View ${esc(e.name)}">
      <span class="ev-date"><strong>${fmt(d, { day: "numeric" })}</strong><span>${fmt(d, { month: "short" })}</span></span>
      <span class="ev-main">
        <span class="ev-name">${esc(e.name)} · ${fmtDistWithUnit(e.km)} <span class="muted">· ${effortLabel(e.effort)}${weekBit} · ${when}${e.location ? ` · ${esc(e.location)}` : ""}${e.is_public ? " · public" : ""}</span></span>
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
  const sport = fields.sport || "run";
  const isPublic = fields.is_public === "yes" ? "yes" : "no";
  const preset = fields.preset || "";
  const field = (name) => esc(fields[name] || "");
  const customOpen = preset === "custom" || (!preset && !!fields.km);
  return `
    <section class="card" id="events">
      <div class="card-head">
        <h2>${tt("home.upcomingEvents")}</h2>
        <button class="button small" type="button" data-action="toggle-form">${tt("home.addEvent")}</button>
      </div>
      <form class="event-form${locked ? " from-public" : ""}"${open ? "" : " hidden"}>
        <label class="full">Search public events
          <input type="search" name="event_search" placeholder="e.g. Gent Marathon, Samson 10K" autocomplete="off" value="${field("event_search")}" />
        </label>
        <ul class="search-results full" hidden></ul>
        <label>Date<input type="date" name="date" required value="${field("date")}" /></label>
        <label class="grow">Name<input type="text" name="name" required placeholder="e.g. Kerstcorrida Gent" value="${field("name")}" /></label>
        <label class="full">Location
          <input type="text" name="location" maxlength="80" placeholder="e.g. Gent, Belgium" value="${field("location")}" />
        </label>
        <fieldset class="full event-sport-field">
          <legend>${tt("setup.eventType")}</legend>
          <div class="choice-row" id="event-sport-choices">
            ${["run", "swim", "bike", "triathlon"].map((s) => `
              <button class="choice-btn${sport === s ? " active" : ""}" type="button" data-event-sport="${s}">${esc((typeof window.sportLabel === "function" ? window.sportLabel(s) : (window.SPORT_LABEL && window.SPORT_LABEL[s]) || s))}</button>`).join("")}
          </div>
          <input type="hidden" name="sport" value="${esc(sport)}" />
        </fieldset>
        <fieldset class="full event-distance-field">
          <legend>Distance</legend>
          <div class="choice-row" id="event-distance-choices">${eventDistanceChoicesHtml(sport, preset)}</div>
          <input type="hidden" name="preset" value="${esc(preset)}" />
        </fieldset>
        <label class="full event-custom-km"${customOpen ? "" : " hidden"}>Distance (${distUnit()})
          <input type="number" name="km" ${customOpen ? "required" : ""} min="0.1" step="0.1" placeholder="${isImperial() ? "6.2" : "10"}" value="${field("km") ? esc(displayDistValue(field("km"))) : ""}" />
        </label>
        <label class="full event-note-field">Event note <span class="muted">(optional, can be public)</span>
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
        <p class="muted small-text full">Nothing personal goes on this step. Effort and your own note come next, and stay private.</p>
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
  const past = pastEventsList(now);
  return `
    <section class="hero compact">
      <div>
        <div class="eyebrow"><a href="/home">Home</a> · Events</div>
        <h1>Past events</h1>
        <p class="muted">${past.length
          ? `${past.length} finished event${past.length === 1 ? "" : "s"}`
          : "No past events yet."}</p>
      </div>
    </section>
    <section class="card">
      <ul class="events">
        ${past.map((e) => eventListItem(e, now, { past: true })).join("") || `<li class="muted">Nothing here yet. Finished events show up after their date.</li>`}
      </ul>
    </section>`;
}

function eventPresetKm(sport, presetId) {
  const preset = ((window.EVENT_PRESETS || {})[sport] || []).find((p) => p.id === presetId);
  if (!preset || presetId === "custom") return null;
  if (sport === "swim") return (preset.swim || 0) / 1000;
  if (sport === "bike") return preset.bike || null;
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
  if (customWrap) customWrap.hidden = !isCustom;
  if (kmInput) {
    kmInput.required = isCustom;
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

let HOME_WEEK = null;

function calendarPlanWeek(now) {
  return Math.max(1, Math.min(WEEKS.length, weekOf(now)));
}

function homeViewWeek(now) {
  const cur = calendarPlanWeek(now);
  const wk = HOME_WEEK == null ? cur : HOME_WEEK;
  return Math.max(1, Math.min(WEEKS.length, wk));
}

function homeWeekCardTitle(viewWk, calendarWk, offset) {
  const wk = viewWk + offset;
  if (wk === calendarWk) return tt("home.thisWeek");
  if (wk === calendarWk + 1) return tt("home.nextWeekLabel");
  if (wk === calendarWk - 1) return tt("home.lastWeek");
  return offset === 0 ? tt("home.selectedWeek") : tt("home.followingWeek");
}

function renderNoPlanHome(acts, now) {
  const lastSync = acts.length ? acts.map((a) => a.date).sort().at(-1) : null;
  const upcoming = upcomingEventsList(now, acts);
  const footnote = lastSync
    ? `${tt("home.actsUpTo", { date: short(parseDate(lastSync)) })} <a href="/activities">${tt("home.seeAll")}</a>`
    : tt("home.logOrImport");
  return `
    <section class="hero">
      <div>
        <div class="eyebrow">${tt("home.today", { date: fmt(now, { weekday: "long", day: "numeric", month: "long" }) })}</div>
        <h1>${tt("home.noPlan")}</h1>
        <p class="muted">${tt("home.noPlanLead")}</p>
      </div>
      <button class="button" type="button" data-action="start-plan">${tt("home.startPlan")}</button>
    </section>
    ${acts.length ? loggedWeekBlock(acts, now) : `
      <section class="card">
        <p class="muted" style="margin:0">${tt("home.emptyCard")}</p>
      </section>`}
    ${eventsCard(now, upcoming, { acts })}
    <p class="footnote">${footnote}</p>`;
}

function renderHome(acts, now) {
  const calendarWk = calendarPlanWeek(now);
  const wk = homeViewWeek(now);
  HOME_WEEK = wk === calendarWk ? null : wk;
  const current = WEEKS[wk - 1];
  const next = WEEKS[wk];
  const phase = phaseOf(wk);
  const daysToRace = daysBetween(now, RACE);
  const progress = Math.round((daysBetween(START, now) / daysBetween(START, RACE)) * 100);
  const upcoming = upcomingEventsList(now, acts);
  const lastSync = acts.length ? acts.map((a) => a.date).sort().at(-1) : null;
  const viewingPast = wk !== calendarWk;

  const changesN = pendingChanges().length;
  const footnote = lastSync
    ? `${tt("home.actsUpTo", { date: short(parseDate(lastSync)) })} <a href="/activities">${tt("home.seeAll")}</a>`
    : tt("home.openDayOrImport");
  return `
    <section class="hero">
      <div>
        <div class="eyebrow">${tt("home.today", { date: fmt(now, { weekday: "long", day: "numeric", month: "long" }) })}${viewingPast ? tt("home.viewingWeek", { week: wk }) : ""}</div>
        <h1>${tt("home.weekOf", { week: wk, total: WEEKS.length })} <span class="muted">· ${phase.name}</span></h1>
        <p class="muted">${phase.focus}</p>
        ${window.CURRENT_PLAN?.notes ? `<p class="plan-notes">${esc(window.CURRENT_PLAN.notes)}</p>` : ""}
      </div>
      <button type="button" class="countdown" data-action="open-day" data-date="${ymd(RACE)}" title="${esc(tt("home.viewEvent", { event: eventLabel() }))}">
        <strong>${daysToRace}</strong><span>${tt("home.daysTo", { event: eventLabel() })}</span>
      </button>
    </section>

    <div class="timeline">
      ${PHASES.map((p) => `<div class="seg p-${p.name} ${p === phase ? "active" : ""}" style="flex:${p.to - p.from + 1}"><span>${p.name}</span></div>`).join("")}
      <div class="marker" style="left:${Math.max(0, Math.min(100, progress))}%"></div>
    </div>

    ${(() => {
      const block = recoveryBlock(ymd(now), planFor(ymd(now)));
      return block ? `<section class="card">${block}</section>` : "";
    })()}

    ${changesN ? `
      <a class="changes-banner" href="/plan">
        <strong>${changesN === 1 ? tt("home.changesOne") : tt("home.changesMany", { count: changesN })}</strong>
        <span>${tt("home.changesReview")}</span>
      </a>` : ""}

    ${reviewCard(acts, now)}

    <div class="week-nav">
      <button class="button ghost small" type="button" data-action="home-week-prev"${wk <= 1 ? " disabled" : ""} aria-label="${esc(tt("common.previous"))}">${tt("home.prevWeek")}</button>
      ${viewingPast ? `<button class="button ghost small" type="button" data-action="home-week-today">${tt("home.thisWeek")}</button>` : ""}
      <button class="button ghost small" type="button" data-action="home-week-next"${wk >= WEEKS.length ? " disabled" : ""} aria-label="${esc(tt("common.next"))}">${tt("home.nextWeek")}</button>
    </div>

    <div class="grid">
      ${weekCard(current, acts, now, homeWeekCardTitle(wk, calendarWk, 0))}
      ${next ? weekCard(next, acts, now, homeWeekCardTitle(wk, calendarWk, 1)) : ""}
    </div>

    ${eventsCard(now, upcoming, { acts })}

    <div class="cta"><a class="button" href="/plan">${tt("home.seeFullPlan")}</a></div>
    <p class="footnote">${footnote}</p>
  `;
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
    paras.push(`Current predicted finish is ${cur}. If you follow the rest of the plan, the projection is ${proj}.`);
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
      <p class="muted small-text predict-note">${esc(pred.note)}</p>
    ${closeTag}`;
}

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

function renderPlan(acts, now) {
  const curWk = weekOf(now);
  const weeks = WEEKS.map((w) => {
    const s = weekStart(w.wk), e = addDays(s, 6);
    const evs = EVENTS.filter((ev) => ev.date >= ymd(s) && ev.date <= ymd(e));
    return `
      <details id="plan-w${w.wk}" class="week ${w.wk === curWk ? "cur" : ""} ${e < now ? "done" : ""}" ${isPlanWeekOpen(w.wk, curWk) ? "open" : ""}>
        <summary>
          <span class="wk">W${w.wk}</span>
          <span class="dates">${short(s)} – ${short(e)}</span>
          <span class="pill p-${w.phase}">${w.phase}</span>
          ${weekKmSummary(w, acts, now)}
          <span class="focus">${w.focus}</span>
          ${evs.map((ev) => `<span class="ev-badge ${ev.race ? "race" : ""}">★ ${ev.name}</span>`).join("")}
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

    ${changesCard()}

    ${renderVolumeCard(acts, now)}

    <div class="weeks">${weeks}</div>

    <div class="grid">
      <section class="card">
        <div class="card-head"><h2>${tt("plan.paceGuide")}</h2></div>
        <table class="table">
          <thead><tr><th>${tt("plan.effort")}</th><th>${tt("plan.pace", { unit: distUnit() === "mi" ? "mi" : "km" })}</th><th>${tt("plan.use")}</th></tr></thead>
          <tbody>${PACES.map((p) => {
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
      ${(window.CURRENT_PLAN?.sources || []).length ? `
      <section class="card">
        <div class="card-head"><h2>${tt("plan.research")}</h2></div>
        <ul class="roadmap">${(window.CURRENT_PLAN.sources || []).map((s) => `
          <li><strong><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a></strong><span>${esc(s.used_for || "")}</span></li>`).join("")}</ul>
      </section>` : ""}
    </div>
  `;
}

// ---------- Plan changes for the AI coach ----------

const CHANGE_ICON = { busy: "⛔", event: "★", import: "⇪", note: "✎" };

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

async function pollCoachJob(jobId) {
  clearTimeout(COACH_POLL);
  try {
    const data = await invokeCoach({ action: "status", jobId });
    if (data.status === "applied") {
      COACH_STATUS = "idle";
      toastCoachResult(data, "Plan updated.");
      const { data: plan } = await sb.from("plans").select("*").eq("user_id", CURRENT_USER_ID).maybeSingle();
      if (plan) applyPlanRow(plan);
      const previousNote = currentReviewNote();
      [CHANGES, FEEDBACK] = await Promise.all([loadChanges(), loadFeedback()]);
      maybeStampReviewFeedback(previousNote);
      render(true);
      refreshOpenDay();
      return;
    }
    if (data.status === "error") {
      COACH_STATUS = "idle";
      toast(data.error || "Coach review failed.", true);
      render(true);
      return;
    }
    COACH_STATUS = "reviewing";
    COACH_POLL = setTimeout(() => pollCoachJob(jobId), 4000);
  } catch (err) {
    COACH_STATUS = "idle";
    toast(err.message, true);
    render(true);
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

function changesCard() {
  const items = pendingChanges();
  const applied = CHANGES.filter((c) => c.status === "applied").length;
  const reviewing = COACH_STATUS === "reviewing";
  const appliedNote = !applied
    ? ""
    : applied === 1
      ? tt("coach.appliedOne")
      : tt("coach.appliedMany", { count: applied });
  return `
    <section class="card changes" id="changes">
      <div class="card-head">
        <div>
          <div class="eyebrow">${tt("coach.eyebrow")}</div>
          <h2>${tt("coach.planChanges")} ${items.length ? `<span class="count">${items.length}</span>` : ""}</h2>
        </div>
        ${(items.length || reviewing) ? `<button class="button small" type="button" data-action="send-coach"${reviewing ? " disabled" : ""}>${reviewing ? tt("coach.reviewing") : tt("coach.send")}</button>` : ""}
      </div>
      ${items.length ? `
        <ul class="change-list">
          ${items.map((c) => `
            <li>
              <span class="change-icon t-${c.type}">${CHANGE_ICON[c.type] || "•"}</span>
              <span class="change-text">${esc(c.summary)}<span class="muted"> · ${fmt(new Date(c.createdAt), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span></span>
              <button class="icon-button" type="button" data-action="delete-change" data-id="${esc(c.id)}" title="${esc(tt("coach.removeFromList"))}">✕</button>
            </li>`).join("")}
        </ul>
        <p class="muted small-text">${reviewing ? tt("coach.sentReviewing") : tt("coach.sendHint")}</p>` : reviewing ? `
        <p class="muted small-text">${tt("coach.sentNow")}</p>` : `
        <p class="muted small-text">${tt("coach.nonePending")}${appliedNote}</p>`}
      <form class="note-form">
        <input type="text" name="text" maxlength="2000" placeholder="${esc(tt("coach.notePlaceholder"))}" />
        <button class="button ghost small" type="submit">${tt("coach.addNote")}</button>
      </form>
    </section>`;
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
    try { CHANGES = await loadChanges(); } catch {}
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
  const byCat = { run: 0, swim: 0, bike: 0, walk: 0 };
  const timeByCat = { run: 0, swim: 0, bike: 0, walk: 0 };
  const countByCat = { run: 0, swim: 0, bike: 0, walk: 0 };
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
    total: YEAR_SPORTS.reduce((sum, cat) => sum + byCat[cat], 0),
    count: YEAR_SPORTS.reduce((sum, cat) => sum + countByCat[cat], 0),
    timeSec: YEAR_SPORTS.reduce((sum, cat) => sum + timeByCat[cat], 0),
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

  const totals = Object.fromEntries(cats.map((cat) => [cat, rows.reduce((s, r) => s + r.byCat[cat], 0)]));
  const sessions = rows.reduce((s, r) => s + r.count, 0);
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
  const totals = { run: 0, swim: 0, bike: 0, walk: 0 };
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

const APP_ROUTES = new Set(["home", "plan", "activities", "events", "gear", "profile", "connections", "settings", "progress", "setup", "create-plan"]);

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
  if (!hasPlan()) return renderNoPlanHome(acts, now);
  if (route === "plan") return renderPlan(acts, now);
  if (route === "progress") return renderProgress(acts, now);
  return renderHome(acts, now);
}

function render(force = false) {
  closeAccountMenu();
  captureEventFormDraft();
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
  document.querySelectorAll("nav > a").forEach((a) => {
    const active = a.dataset.route === route
      || (route === "progress" && a.dataset.route === "plan");
    a.classList.toggle("active", active);
  });
  const accountMenu = document.querySelector(".account-menu");
  if (accountMenu) {
    accountMenu.classList.toggle("active", ["profile", "connections", "settings"].includes(route));
    accountMenu.querySelectorAll("[data-route]").forEach((a) => {
      a.classList.toggle("active", a.dataset.route === route);
    });
  }
  updateNavSyncButton();
  const badge = document.querySelector(".nav-badge");
  const pending = pendingChanges().length;
  if (badge) {
    badge.hidden = !pending;
    badge.textContent = pending;
  }
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
      const row = {
        user_id: uid,
        id: `${body.date}-${String(body.name || "event").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${newId()}`,
        date: body.date,
        name: body.name,
        km: Number(body.km),
        effort: "easy",
        note: "",
        event_note: clipText(body.event_note, 140),
        location: clipText(body.location, 80),
        race: false,
        is_public: body.is_public === "yes" || body.is_public === true,
        sport: ["run", "swim", "bike", "triathlon"].includes(body.sport) ? body.sport : "run",
        source_id: body.source_id || null,
        swim_m: body.swim_m ? Number(body.swim_m) : null,
        bike_km: body.bike_km ? Number(body.bike_km) : null,
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
      const editingPublic = body.name != null || body.km != null || body.event_note != null;
      if (editingPublic) {
        if (existing.source_id) throw new Error("You can only edit events you created.");
        if (body.name != null || body.km != null) {
          const name = String(body.name || "").trim();
          const km = Number(body.km);
          if (!name) throw new Error("Name is required");
          if (!(km > 0 && km < 500)) throw new Error("Distance must be a positive number");
          patch.name = name;
          patch.km = km;
        }
        if (body.event_note != null) patch.event_note = clipText(body.event_note, 140);
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
      const title = plan && (KIND_MATCH[plan.kind] || []).includes(cat)
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

async function refreshEvents() {
  [EVENTS, CHANGES] = await Promise.all([loadEvents(), loadChanges()]);
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
          if (mode === "recovery") renderPasswordReset(email);
          else renderLogin("", { mode: mode === "forgot" || mode === "signup" ? mode : "signin", email });
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
  if (!e.target.closest(".account-menu")) closeAccountMenu();
  const link = e.target.closest("a[href]");
  if (link && !link.target && !link.hasAttribute("download") && e.button === 0
      && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey
      && !(link.getAttribute("href") || "").startsWith("#")) {
    const url = new URL(link.getAttribute("href"), location.origin);
    if (url.origin === location.origin && isAppPath(url.pathname)) {
      e.preventDefault();
      closeAccountMenu();
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
  if (btn.dataset.action === "import") document.getElementById("csv-input").click();
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
      STRAVA = { connected: false, shareWithCoach: false, lastSyncAt: null, lastSyncStatus: null, lastError: null, loaded: true };
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
  if (btn.dataset.action === "home-week-prev" || btn.dataset.action === "home-week-next" || btn.dataset.action === "home-week-today") {
    if (!hasPlan()) return;
    const calendarWk = calendarPlanWeek(today());
    const cur = homeViewWeek(today());
    if (btn.dataset.action === "home-week-today") HOME_WEEK = null;
    else if (btn.dataset.action === "home-week-prev") HOME_WEEK = Math.max(1, cur - 1);
    else HOME_WEEK = Math.min(WEEKS.length, cur + 1);
    if (HOME_WEEK === calendarWk) HOME_WEEK = null;
    render(true);
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
      await refreshState(btn.dataset.date);
    } catch (err) {
      toast(err.message, true);
    }
  }
  if (btn.dataset.action === "delete-change") {
    try {
      await apiRequest("DELETE", `/api/changes/${encodeURIComponent(btn.dataset.id)}`);
      await refreshState();
    } catch (err) {
      toast(err.message, true);
    }
  }
  if (btn.dataset.action === "send-coach") {
    if (COACH_STATUS === "reviewing") return;
    COACH_STATUS = "reviewing";
    render(true);
    await sendCoachRequest();
    render(true);
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
  if (btn.dataset.action === "toggle-form") {
    const form = document.querySelector(".event-form");
    if (!form) return;
    const opening = form.hidden;
    eventFollowUpId = null;
    if (!opening) {
      eventFormDraft = null;
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
    return;
  }
  if (btn.dataset.action === "skip-event-personal") {
    eventFollowUpId = null;
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
  const noteForm = e.target.closest(".note-form");
  if (noteForm) {
    e.preventDefault();
    try {
      await apiRequest("POST", "/api/changes", { text: noteForm.text.value });
      await refreshState();
      toast("Note added to the plan changes.");
    } catch (err) {
      toast(err.message, true);
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
  const data = Object.fromEntries(new FormData(form));
  const presetId = data.preset || "";
  const sport = ["run", "swim", "bike", "triathlon"].includes(data.sport) ? data.sport : "run";
  data.sport = sport;
  if (presetId && presetId !== "custom") {
    const km = eventPresetKm(sport, presetId);
    if (km != null) data.km = km;
    const preset = ((window.EVENT_PRESETS || {})[sport] || []).find((p) => p.id === presetId);
    if (preset?.swim) data.swim_m = preset.swim;
    if (preset?.bike) data.bike_km = preset.bike;
  } else {
    data.km = parseDistInput(data.km);
  }
  data.location = clipText(data.location, 80);
  data.is_public = data.is_public === "yes";
  if (form.classList.contains("from-public")) data.event_note = "";
  if (!(Number(data.km) > 0)) {
    form.querySelector(".form-error").textContent = "Pick a distance.";
    return;
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
    const saved = await apiRequest("POST", "/api/events", data);
    form.reset();
    form.hidden = true;
    setAgendaEventLocked(form, false);
    hideSimilarEventPrompt(form);
    eventFormDraft = null;
    eventFollowUpId = saved?.id || null;
    await refreshEvents();
    document.querySelector(".event-personal.is-followup")?.scrollIntoView({ block: "nearest" });
    if (saved?.event_note_skipped) toast("Event saved. The public event note needs a database update before it can be stored.", true);
  } catch (err) {
    form.querySelector(".form-error").textContent = err.message;
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
  return { effort, note: form.note?.value || "" };
}

document.addEventListener("change", async (e) => {
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
  const form = e.target.closest?.(".settings-form[data-settings=password]");
  if (!form || !["password", "confirm", "current"].includes(e.target.name)) return;
  if (typeof window.paintPasswordRules === "function") window.paintPasswordRules(form);
  const errorEl = form.querySelector(".form-error");
  if (errorEl) errorEl.textContent = "";
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeAccountMenu();
  const day = e.target.closest?.(".day.clickable");
  if (day && (e.key === "Enter" || e.key === " ")) {
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
      return loadEvents().then((events) => { EVENTS = events; render(true); }).catch(() => {});
    }
    return Promise.resolve();
  }
  if (APP_BOOTING) return APP_BOOTING;
  const bootUserId = window.CURRENT_USER_ID;
  const gen = APP_BOOT_GEN;
  showAppLoading();
  APP_BOOTING = (async () => {
    if (hasPlan() && typeof window.syncPlanDates === "function") window.syncPlanDates();
    const [acts, events, feedback, busy, changes, gear] = await Promise.all([
      loadActivities(),
      loadEvents(),
      loadFeedback(),
      hasPlan() ? loadBusy() : Promise.resolve({}),
      hasPlan() ? loadChanges() : Promise.resolve([]),
      loadGear(),
    ]);
    if (gen !== APP_BOOT_GEN || window.CURRENT_USER_ID !== bootUserId) return;
    ACTS = acts;
    EVENTS = events;
    FEEDBACK = feedback;
    BUSY = busy;
    CHANGES = changes;
    GEAR = gear;
    await loadWellness();
    if (gen !== APP_BOOT_GEN || window.CURRENT_USER_ID !== bootUserId) return;
    await Promise.all([loadGarminStatus(), loadStravaStatus()]);
    if (gen !== APP_BOOT_GEN || window.CURRENT_USER_ID !== bootUserId) return;
    await maybeHandleStravaCallback();
    if (gen !== APP_BOOT_GEN || window.CURRENT_USER_ID !== bootUserId) return;
    if (hasPlan()) await Promise.all([loadProgressReport(), loadWeekFeedbackStamp()]);
    if (gen !== APP_BOOT_GEN || window.CURRENT_USER_ID !== bootUserId) return;
    APP_READY = true;
    if (hasPlan()) {
      const queued = await queueStageReviews(today());
      if (gen !== APP_BOOT_GEN || window.CURRENT_USER_ID !== bootUserId) return;
      if (queued) await sendCoachRequest({ silent: true });
      else await resumeCoachJob();
      await resumeFeedbackJob();
    }
    if (gen !== APP_BOOT_GEN || window.CURRENT_USER_ID !== bootUserId) return;
    render(true);
    maybeToastShoeWear();
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
  GEAR = { items: [], assignments: {} };
  window.WELLNESS = {};
  window.TRAINING_METRICS = null;
  try {
    localStorage.removeItem(`wellness-days:${CURRENT_USER_ID || "anon"}`);
    localStorage.removeItem(`training-metrics:${CURRENT_USER_ID || "anon"}`);
  } catch { /* ignore */ }
  GARMIN = { connected: false, lastSyncAt: null, lastSyncStatus: null, lastError: null, loaded: false };
  STRAVA = { connected: false, shareWithCoach: false, lastSyncAt: null, lastSyncStatus: null, lastError: null, loaded: false };
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

window.addEventListener("tp:languagechange", () => {
  if (typeof window.applyDomI18n === "function") window.applyDomI18n();
  if (APP_READY) render(true);
});
