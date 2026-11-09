const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const KIND_LABEL = {
  run: "Easy run", quality: "Quality", long: "Long run", event: "Event", race: "Race",
  walk: "Walk", swim: "Swim", walkswim: "Walk + swim", bike: "Bike", rest: "Rest", travel: "Travel",
};
const KIND_MATCH = {
  run: ["run"], quality: ["run"], long: ["run"], event: ["run"], race: ["run"],
  walk: ["walk"], swim: ["swim"], walkswim: ["swim"], bike: ["bike"],
};

const pad = (n) => String(n).padStart(2, "0");
const parseDate = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const daysBetween = (a, b) => Math.round((b - a) / 864e5);
const fmt = (d, opts) => d.toLocaleDateString("en-GB", opts);
const short = (d) => fmt(d, { day: "numeric", month: "short" });

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
      Distance: row.distance != null ? String(row.distance) : "--",
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

window.peekActivities = () => (typeof ACTS !== "undefined" && ACTS) || window._setupActs || [];

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
  shoes: { title: "Shoes", add: "shoes", hint: "e.g. ASICS Gel Pursue 10", picker: "Shoes", empty: "shoes", addLink: "shoes", unit: "km" },
  bike: { title: "Bikes", add: "a bike", hint: "e.g. Canyon Endurace", picker: "Bike", empty: "bike", addLink: "a bike", unit: "km" },
  swimsuit: { title: "Swimsuits", add: "a swimsuit", hint: "e.g. Arena Powerskin", picker: "Swimsuit", empty: "swimsuit", addLink: "a swimsuit", unit: "m" },
  wetsuit: { title: "Wetsuits", add: "a wetsuit", hint: "e.g. HUUB Aegis", picker: "Wetsuit", empty: "wetsuit", addLink: "a wetsuit", unit: "m" },
};

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
  if (a.cat === "swim") bits.push(`Swim ${a.dist} m`);
  else if (a.cat === "bike") bits.push(`Bike ${a.dist} km`);
  else if (a.cat === "walk") bits.push(`Walk ${a.dist} km`);
  else bits.push(`Run ${a.dist} km`);
  if (dur && a.cat !== "walk") bits.push(dur);
  if (a.pace && a.cat === "run") bits.push(`${a.pace}/km`);
  else if (a.pace && a.cat === "swim") bits.push(`${a.pace}/100m`);
  else if (a.pace && a.cat === "bike") bits.push(`${a.pace} km/h`);
  if (a.hr) bits.push(`HR ${a.hr}`);
  if (gear) bits.push(esc(gear.name));
  return bits.join(" · ");
}

const LOG_TYPES = {
  run: { type: "Running", title: "Run", unit: "km" },
  bike: { type: "Cycling", title: "Ride", unit: "km" },
  swim: { type: "Pool Swim", title: "Swim", unit: "m" },
  walk: { type: "Walking", title: "Walk", unit: "km" },
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
    <label>Distance (<span data-unit>${spec.unit}</span>)
      <input type="number" name="distance" required min="${swim ? "25" : "0.1"}" step="${swim ? "25" : "0.01"}" value="${esc(distance)}" />
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
  return `This week also has a long run on ${DAY_NAMES[otherLong]} (${esc(label)}). Consider letting the event replace it so you don't stack two longs.`;
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
      <div class="event-note">★ ${esc(ev.name)} · ${ev.km} km · ${effortLabel(ev.effort)}${ev.note ? ` — ${esc(ev.note)}` : ""}</div>
      ${conflict ? `<div class="event-warn">${conflict}</div>` : ""}`;
  }).join("");
}

function dayRow(week, i, acts, now) {
  const [kind, label] = week.days[i];
  const date = addDays(weekStart(week.wk), i);
  const ds = ymd(date);
  const dayActs = acts.filter((a) => a.date === ds);
  const isToday = ds === ymd(now);
  const isPast = date < now;
  const wanted = KIND_MATCH[kind] || [];
  const done = wanted.length > 0 && wanted.some((c) => dayActs.some((a) => a.cat === c));
  const busy = BUSY[ds];
  let status = "";
  if (done) status = `<span class="status done" title="Done">✓</span>`;
  else if (isPast && wanted.length && !busy) status = `<span class="status missed" title="Not logged">–</span>`;
  const hint = dayActs.length ? "View activity" : isPast ? "View session" : "How to do this session";
  const rec = isToday ? recoveryFor(ds) : null;
  const recoveryChip = rec
    ? `<span class="recovery-chip lvl-${rec.score >= 80 ? "high" : rec.score >= 60 ? "mid" : "low"}" title="Recovery ${rec.score}">${rec.score}</span>`
    : "";
  return `
    <li class="day clickable ${isToday ? "today" : ""} ${isPast ? "past" : ""} ${busy ? "busy" : ""}" data-date="${ds}" tabindex="0" role="button" title="${hint}">
      <div class="day-date"><strong>${DAY_NAMES[i]}</strong><span>${short(date)}</span></div>
      <div class="day-body">
        ${busy ? `<div class="busy-line"><span class="chip k-busy">Busy</span>${busy.reason ? esc(busy.reason) : "No training today"}</div>` : ""}
        <div class="session"><span class="chip k-${kind}">${KIND_LABEL[kind]}</span><span class="label">${label}</span>${recoveryChip}${status}</div>
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
        <div class="session"><span class="chip k-${a.cat}">${KIND_LABEL[a.cat] || a.cat}</span><span class="label">${esc(a.title || activityLine(a))}</span></div>
        <div class="actual k-${a.cat}">${activityLine(a)}</div>
        <p class="auto-text">${esc(activityFeedback(a, null, acts))}</p>`).join("")
    : `<div class="session"><span class="chip k-rest">Rest</span><span class="label">${isPast ? "Nothing logged" : "No session yet"}</span></div>`;
  return `
    <li class="day clickable ${isToday ? "today" : ""} ${isPast ? "past" : ""}" data-date="${ds}" tabindex="0" role="button" title="${dayActs.length ? "View activity" : "View day"}">
      <div class="day-date"><strong>${DAY_NAMES[i]}</strong><span>${short(date)}</span></div>
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
    items: (items || []).map((row) => ({
      id: row.id,
      type: row.type,
      name: row.name,
      note: row.note || "",
      retired: !!row.retired,
      addedAt: row.added_at,
    })),
    assignments,
  };
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
  return { week, i, kind, label, km };
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
    ["Distance", "Distance", " km"], ["Time", "Time"], ["Moving time", "Moving Time"], ["Avg pace", "Avg Pace", " /km"],
    ["Best pace", "Best Pace", " /km"], ["Grade-adj. pace", "Avg GAP", " /km"], ["Avg HR", "Avg HR", " bpm"], ["Max HR", "Max HR", " bpm"],
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
    ["Distance", "Distance", " km"], ["Time", "Time"], ["Moving time", "Moving Time"], ["Avg speed", "Avg Pace", " km/h"],
    ["Max speed", "Best Pace", " km/h"], ["Avg HR", "Avg HR", " bpm"], ["Max HR", "Max HR", " bpm"], ["Aerobic TE", "Aerobic TE"],
    ["Ascent", "Total Ascent", " m"], ["Calories", "Calories", " kcal"], ["Body Battery", "Body Battery Drain"],
  ],
  walk: [
    ["Distance", "Distance", " km"], ["Time", "Time"], ["Avg HR", "Avg HR", " bpm"], ["Steps", "Steps"], ["Calories", "Calories", " kcal"],
  ],
};

function statGrid(a) {
  const cells = STAT_FIELDS[a.cat]
    .map(([label, key, unit = ""]) => {
      let v = a.raw[key];
      if (!v || v === "--" || v === "0.0") return "";
      v = v.replace(/^'/, "");
      if (/^\d\d:\d\d:\d\d$/.test(v) && v.startsWith("00:")) v = v.slice(3);
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
  const meta = `${ev.km} km${ev.sport ? ` · ${ev.sport}` : ""}`;
  if (ownsEvent(ev)) {
    return `
      <form class="event-edit-form" data-id="${esc(ev.id)}">
        <div class="eyebrow">Event</div>
        <p class="muted small-text">Name, distance and the event note can be public.</p>
        <div class="event-edit-fields">
          <label>Name<input type="text" name="name" required value="${esc(ev.name)}" /></label>
          <label>Distance (km)<input type="number" name="km" required min="0.1" step="0.1" value="${esc(ev.km)}" /></label>
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
        ${activityMeta(a, `Walk · ${a.dist} km`)}
        ${gearPicker(a)}
      </section>`).join("");

  const guides = plan ? guidesFor(plan.kind, plan.label) : [];
  const showGuidesOpen = !dayActs.length;

  return `
    <header class="dialog-head">
      <div>
        <div class="eyebrow">${fmt(date, { weekday: "long", day: "numeric", month: "long" })}${plan ? ` · Week ${plan.week.wk} · ${plan.week.phase}` : ""}</div>
        <h2>${plan ? `<span class="chip k-${plan.kind}">${KIND_LABEL[plan.kind]}</span> ` : ""}${esc(title)}</h2>
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
  const dist = gearDistance(item);
  const count = ACTS.filter((a) => GEAR.assignments[a.datetime] === item.id).length;
  const unit = GEAR_KINDS[item.type]?.unit || "km";
  const amount = unit === "m"
    ? `${Math.round(dist).toLocaleString("en-GB")} m`
    : `${dist.toFixed(1)} km`;
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
      </div>
      <div class="gear-actions">
        <button class="button ghost small" type="button" data-action="edit-gear" data-id="${esc(item.id)}">Edit</button>
        <button class="button ghost small" type="button" data-action="toggle-retire" data-id="${esc(item.id)}">${item.retired ? "Unretire" : "Retire"}</button>
      </div>
    </li>`;
}

function gearGroup(type) {
  const kind = GEAR_KINDS[type];
  const items = GEAR.items.filter((g) => g.type === type);
  if (!items.length) return "";
  const active = items.filter((g) => !g.retired);
  const retired = items.filter((g) => g.retired);
  return `
    <section class="card">
      <div class="card-head">
        <h2>${kind.title}</h2>
      </div>
      <ul class="gear-list">
        ${active.map(gearRow).join("") || `<li class="muted">None active.</li>`}
      </ul>
      ${retired.length ? `
        <div class="eyebrow gear-retired-label">Retired</div>
        <ul class="gear-list retired">${retired.map(gearRow).join("")}</ul>` : ""}
    </section>`;
}

function syncGearNamePlaceholder(form) {
  const kind = GEAR_KINDS[form?.type?.value];
  const input = form?.querySelector("input[name=name]");
  if (kind && input) input.placeholder = kind.hint;
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
}

function openGearForm(item = null) {
  const wrap = document.querySelector(".gear-add");
  const form = wrap?.querySelector(".gear-form");
  if (!wrap || !form) return;
  syncGearFormMode(form, item);
  wrap.hidden = false;
  form.querySelector("input[name=name]")?.focus();
  wrap.scrollIntoView({ block: "nearest" });
}

function closeGearForm() {
  const wrap = document.querySelector(".gear-add");
  const form = wrap?.querySelector(".gear-form");
  if (!wrap || !form) return;
  wrap.hidden = true;
  syncGearFormMode(form, null);
}

function gearAddForm() {
  const options = Object.entries(GEAR_KINDS)
    .map(([id, kind]) => `<option value="${id}">${kind.picker}</option>`)
    .join("");
  return `
    <section class="card gear-add" hidden>
      <h2 class="gear-form-title">Add gear</h2>
      <form class="gear-form">
        <label>Type
          <select name="type">
            ${options}
          </select>
        </label>
        <label class="grow">Name<input type="text" name="name" required maxlength="80" placeholder="${GEAR_KINDS.shoes.hint}" /></label>
        <label class="full">Note <span class="muted">(optional)</span><input type="text" name="note" maxlength="140" placeholder="e.g. daily trainer, race pair" /></label>
        <div class="form-actions">
          <span class="form-error"></span>
          <button class="button ghost" type="button" data-action="toggle-gear-form">Cancel</button>
          <button class="button" type="submit">Save</button>
        </div>
      </form>
    </section>`;
}

function renderGear() {
  const groups = Object.keys(GEAR_KINDS).map(gearGroup).join("");
  return `
    <section class="hero compact">
      <div>
        <div class="eyebrow">Inventory</div>
        <h1>Shoes, bikes &amp; swim kit</h1>
        <p class="muted">Add shoes, a bike, a swimsuit or a wetsuit, or let a Garmin sync bring them in. Sync links Garmin gear onto activities that don't have any yet, and leaves a choice you already made. Retire a pair when it's done.</p>
      </div>
      <button class="button" type="button" data-action="toggle-gear-form">+ Add gear</button>
    </section>
    ${gearAddForm()}
    ${groups || `<section class="card"><p class="muted">None yet. Activities still work — add gear only when you want to assign it.</p></section>`}`;
}

function normalizeUsername(raw) {
  return String(raw || "").trim().toLowerCase();
}

function usernameError(name) {
  if (!name) return "Pick a username.";
  if (!/^[a-z][a-z0-9_]{2,19}$/.test(name)) {
    return "3–20 characters, start with a letter, only letters, numbers and _.";
  }
  return "";
}

async function saveUsernameFromInput(input) {
  if (!input || input.dataset.saving === "1") return;
  const errorEl = document.querySelector(".username-error");
  const username = normalizeUsername(input.value);
  const current = window.CURRENT_PROFILE?.username || "";
  if (errorEl) errorEl.textContent = "";
  if (username === current) {
    input.value = current;
    input.readOnly = true;
    sizeUsernameInput(input);
    return;
  }
  const invalid = usernameError(username);
  if (invalid) {
    if (errorEl) errorEl.textContent = invalid;
    input.focus();
    return;
  }
  input.dataset.saving = "1";
  input.readOnly = true;
  try {
    const { error } = await sb.from("profiles").upsert({
      user_id: CURRENT_USER_ID,
      username,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      if (error.code === "23505") throw new Error("That username is already taken.");
      if (error.code === "23514") throw new Error("3–20 characters, start with a letter, only letters, numbers and _.");
      throw error;
    }
    window.CURRENT_PROFILE = { username };
    if (typeof window.showUser === "function") {
      const { data: { user } } = await sb.auth.getUser();
      window.showUser(user);
    }
    render(true);
    toast("Username saved.");
  } catch (err) {
    input.readOnly = false;
    if (errorEl) errorEl.textContent = err.message || "Could not save username.";
    input.focus();
  } finally {
    delete input.dataset.saving;
  }
}

function fmtDist(cat, dist) {
  const n = Number(dist) || 0;
  if (cat === "swim") {
    return n >= 1000 ? `${(n / 1000).toFixed(1)} km` : `${Math.round(n)} m`;
  }
  return `${n.toFixed(1)} km`;
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
const YEAR_SPORT_LABEL = { run: "Run", swim: "Swim", bike: "Bike", walk: "Walk" };

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
    if (dist >= 1000) return { value: (dist / 1000).toFixed(1), unit: "km" };
    return { value: String(Math.round(dist)), unit: "m" };
  }
  const km = (rows || []).reduce((s, a) => s + chartDist(a.cat, a.dist || 0), 0);
  return { value: km.toFixed(1), unit: "km" };
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
    const title = `${names[i]} ${year}: ${m.count ? `${fmtDist(cat, m.dist)} · ${m.count} session${m.count === 1 ? "" : "s"}` : "No sessions"}`;
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
    ? `${from}–${to} · ${fmtDist(cat, totalDist)} · ${totalCount} session${totalCount === 1 ? "" : "s"}`
    : `No ${YEAR_SPORT_LABEL[cat].toLowerCase()} sessions yet this year`;
  return `
    <div class="year-month" id="year-month-chart">
      <div class="year-month-head">
        <h3>${YEAR_SPORT_LABEL[cat]} by month</h3>
        <span class="muted">${summary}</span>
      </div>
      <div class="chart-scroll">
        <svg class="month-chart k-${cat}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${YEAR_SPORT_LABEL[cat]} volume by month in ${year}`)}">${grid}${bars}</svg>
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
        <div><span>Run km logged</span><strong>${stats.loggedKm.toFixed(1)}<em> / ${stats.plannedKm.toFixed(0)}</em></strong></div>
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
        <span>${YEAR_SPORT_LABEL[cat]}</span>
        <strong>${row.count ? fmtDist(cat, row.dist) : "—"}</strong>
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
      month = { key, name: labelDate.toLocaleDateString("en-GB", { month: "short" }), cells: [] };
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

function usernameInputSize(value, placeholder) {
  return Math.max(String(value || placeholder || "name").length, 4);
}

function sizeUsernameInput(input) {
  if (input) input.size = usernameInputSize(input.value, input.placeholder);
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

async function maybeHandleStravaCallback() {
  if (STRAVA_CALLBACK_HANDLED || !CURRENT_USER_ID) return false;
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  const state = params.get("state");
  const oauthError = params.get("error");
  if (!code && !oauthError) return false;
  if (currentRoute() !== "connections") return false;
  STRAVA_CALLBACK_HANDLED = true;
  const clean = () => {
    const url = new URL(location.href);
    ["code", "state", "scope", "error", "error_description"].forEach((k) => url.searchParams.delete(k));
    history.replaceState(null, "", url.pathname + (url.searchParams.toString() ? `?${url.searchParams}` : ""));
  };
  clean();
  if (oauthError) {
    toast(params.get("error_description") || "Strava authorization was cancelled.", true);
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
    toast("Strava connected. Sync to pull activities.");
    render(true);
  } catch (err) {
    STRAVA.lastError = err.message || "Could not finish Strava connect";
    STRAVA.loaded = true;
    toast(STRAVA.lastError, true);
    render(true);
  }
  return true;
}

window.refreshSetupConnections = async function refreshSetupConnections() {
  await loadGarminStatus();
  try {
    ACTS = await loadActivities();
    window._setupActs = ACTS;
  } catch { /* keep whatever we have */ }
  return GARMIN;
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
    window.paintSetupConnect(setupForm);
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
  const n = data.added || 0;
  return n
    ? `Synced ${n} new activit${n === 1 ? "y" : "ies"} from Strava (${data.updated || 0} updated).`
    : (data.total ? `Strava sync complete — ${data.updated || 0} already known.` : "Strava sync complete — no activities in range.");
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
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16.5 7.5A6.5 6.5 0 1 0 18 12"/><path d="M14.5 5.5 17 8l2.5-2.5"/><rect x="9.2" y="11.2" width="5.6" height="8.2" rx="2.2"/><path d="M11 13.2h2.4"/></svg>`;
}

function profileTabs(active) {
  return `
    <nav class="profile-tabs" aria-label="Profile sections">
      <a class="choice-btn${active === "overview" ? " active" : ""}" href="/profile"${active === "overview" ? ' aria-current="page"' : ""}>Overview</a>
      <a class="choice-btn${active === "connections" ? " active" : ""}" href="/connections"${active === "connections" ? ' aria-current="page"' : ""}>Connections</a>
    </nav>`;
}

function renderGarminConnectionCard() {
  const connected = GARMIN.connected;
  return `
    <section class="card conn-card">
      <div class="card-head">
        <div>
          <div class="eyebrow">Device</div>
          <h2>Garmin Connect</h2>
          <p class="muted" style="margin:6px 0 0">Use your own Garmin Personal API key. Sync pulls activities, heart-rate zones, threshold, VO2 when Garmin shares it, plus sleep, Body Battery, stress and HRV for the recovery score on today's workout. Shoes, bikes or swim kit saved in Garmin are linked when an activity has no gear yet.</p>
        </div>
        <span class="conn-label ${connected ? "on" : "off"}">${connected ? "Connected" : "Not connected"}</span>
      </div>
      <p class="conn-meta ${GARMIN.lastError ? "warn" : ""}">${esc(garminStatusLine())}</p>
      ${connected ? `
        <div class="conn-actions">
          <button class="button" type="button" data-action="garmin-sync">${syncIconSvg()} Sync</button>
          <button class="button ghost" type="button" data-action="garmin-disconnect">Disconnect</button>
        </div>
        <details class="garmin-key-replace">
          <summary class="muted small-text">Replace API key</summary>
          <form class="garmin-form">
            <label>New Personal API key
              <input type="password" name="apiKey" required autocomplete="off" spellcheck="false" placeholder="Paste key from Garmin Connect" />
            </label>
            <p class="form-error"></p>
            <button class="button small" type="submit">Save key</button>
          </form>
        </details>` : `
        <form class="garmin-form">
          <label>Personal API key
            <input type="password" name="apiKey" required autocomplete="off" spellcheck="false" placeholder="Paste key from Garmin Connect" />
          </label>
          <p class="muted small-text">Create a key at <a href="https://connect.garmin.com/app/settings/personalApiToken" target="_blank" rel="noopener">Garmin Connect → Personal API</a> (shown once; treat it like a password).</p>
          <p class="form-error"></p>
          <button class="button" type="submit">Save &amp; connect</button>
        </form>`}
    </section>`;
}

function renderStravaConnectionCard() {
  const connected = STRAVA.connected;
  return `
    <section class="card conn-card">
      <div class="card-head">
        <div>
          <div class="eyebrow">Service</div>
          <h2>Strava</h2>
          <p class="muted" style="margin:6px 0 0">Compatible with Strava. Activities already on your own account, including from a watch, are stored for your plan and shown only to you. Disconnecting removes them from this app.</p>
        </div>
        <span class="conn-label ${connected ? "on" : "off"}">${connected ? "Connected" : "Not connected"}</span>
      </div>
      <p class="conn-meta ${STRAVA.lastError ? "warn" : ""}">${esc(stravaStatusLine())}</p>
      ${connected ? `
        <label class="own-risk-field">
          <input type="checkbox" data-action="strava-share" ${STRAVA.shareWithCoach ? "checked" : ""} />
          <span>Send Strava session summaries (date, sport, distance, pace, heart rate) to the AI coach. Leave this off and those sessions stay in your log only.</span>
        </label>
        <div class="conn-actions">
          <button class="button" type="button" data-action="strava-sync">${syncIconSvg()} Sync</button>
          <button class="button ghost" type="button" data-action="strava-disconnect">Disconnect</button>
        </div>` : `
        <form class="strava-form">
          <label>Connect passcode
            <input type="password" name="passcode" required autocomplete="off" spellcheck="false" placeholder="Passcode from the app owner" />
          </label>
          <label class="own-risk-field">
            <input type="checkbox" name="shareWithCoach" />
            <span>Also send Strava session summaries (date, sport, distance, pace, heart rate) to the AI coach. Leave this off and those sessions stay in your log only.</span>
          </label>
          <p class="muted small-text">Your Strava login happens on Strava. A new Strava API app can connect one athlete until the app owner raises that limit in Strava’s API settings.</p>
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
        <div class="eyebrow">Your profile</div>
        <h1>Connections</h1>
        <p class="muted">Link devices and services so activities can sync into your plan.</p>
      </div>
    </section>
    ${profileTabs("connections")}
    ${renderGarminConnectionCard()}
    ${renderStravaConnectionCard()}
    <p class="footnote">CSV import stays available from the upload button in the top bar.</p>`;
}

function renderProfile(acts, now) {
  const userEmail = window.CURRENT_USER_EMAIL || "";
  const username = window.CURRENT_PROFILE?.username || "";
  const letter = (username || userEmail || "?").slice(0, 1).toUpperCase();
  const placeholder = "Choose a username";
  return `
    <section class="hero compact profile-hero">
      <div class="profile-ident">
        <span class="profile-avatar" aria-hidden="true">${esc(letter)}</span>
        <div>
          <div class="eyebrow">Your profile</div>
          <h1 class="username-heading">
            <input class="username-inline" type="text" name="username" maxlength="20" autocomplete="username" spellcheck="false" value="${esc(username)}" placeholder="${placeholder}" size="${usernameInputSize(username, placeholder)}" readonly data-action="edit-username" aria-label="Username" title="Click to edit" />
          </h1>
          <p class="form-error username-error"></p>
          <p class="muted">${userEmail ? esc(userEmail) : "This is how you appear in the app."}</p>
        </div>
      </div>
    </section>
    ${profileTabs("overview")}
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
          <h2>Week ${week.wk} · ${short(s)} – ${short(e)}</h2>
        </div>
        <span class="pill p-${week.phase}">${week.phase}</span>
      </div>
      <div class="targets">
        <div><span>Run</span><strong>${week.km} km</strong></div>
        <div><span>Long</span><strong>${week.long} km</strong></div>
        ${extraSportTargets(week)}
      </div>
      ${showActual ? `
        <div class="progress">
          <div class="progress-label">Logged run km: <strong>${actual.toFixed(1)}</strong> / ${week.km}</div>
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
          <div class="eyebrow">This week · review</div>
          <h2>${short(start)} – ${short(end)}</h2>
        </div>
      </div>
      <p class="auto-text">${esc(summary)}</p>
    </section>
    <section class="card">
      <div class="card-head">
        <div>
          <div class="eyebrow">This week</div>
          <h2>${weekActs.length ? `${km.toFixed(1)} km from ${runs.length} run${runs.length === 1 ? "" : "s"}` : "No sessions logged yet"}</h2>
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
        <span class="ev-name">${esc(e.name)} · ${e.km} km <span class="muted">· ${effortLabel(e.effort)}${weekBit} · ${when}${e.is_public ? " · public" : ""}</span></span>
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

function eventsCard(now, upcoming, opts = {}) {
  const past = pastEventsList(now, opts.acts || ACTS);
  const latestPast = past[0];
  const follow = followUpEvent();
  const fields = eventFormDraft?.fields || {};
  const open = !!eventFormDraft?.open && !follow;
  const locked = !!eventFormDraft?.locked;
  const sport = fields.sport || "run";
  const isPublic = fields.is_public === "yes" ? "yes" : "no";
  const field = (name) => esc(fields[name] || "");
  return `
    <section class="card" id="events">
      <div class="card-head">
        <h2>Upcoming events</h2>
        <button class="button small" type="button" data-action="toggle-form">+ Add event</button>
      </div>
      <form class="event-form${locked ? " from-public" : ""}"${open ? "" : " hidden"}>
        <label class="full">Search public events
          <input type="search" name="event_search" placeholder="e.g. Gent Marathon, Samson 10K" autocomplete="off" value="${field("event_search")}" />
        </label>
        <ul class="search-results full" hidden></ul>
        <label>Date<input type="date" name="date" required value="${field("date")}" /></label>
        <label class="grow">Name<input type="text" name="name" required placeholder="e.g. Kerstcorrida Gent" value="${field("name")}" /></label>
        <label>Distance (km)<input type="number" name="km" required min="0.1" step="0.1" placeholder="10" value="${field("km")}" /></label>
        <label>Type
          <select name="sport">
            <option value="run"${sport === "run" ? " selected" : ""}>Running</option>
            <option value="swim"${sport === "swim" ? " selected" : ""}>Swimming</option>
            <option value="bike"${sport === "bike" ? " selected" : ""}>Cycling</option>
            <option value="triathlon"${sport === "triathlon" ? " selected" : ""}>Triathlon</option>
          </select>
        </label>
        <label class="full event-note-field">Event note <span class="muted">(optional, can be public)</span>
          <input type="text" name="event_note" maxlength="140" placeholder="e.g. chip start 9:30, city centre" value="${field("event_note")}" />
        </label>
        <label class="full">Visibility
          <select name="is_public">
            <option value="no"${isPublic === "no" ? " selected" : ""}>Just for me</option>
            <option value="yes"${isPublic === "yes" ? " selected" : ""}>Public — name, date, distance and event note</option>
          </select>
        </label>
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

window.applyPublicEventToAgenda = function applyPublicEventToAgenda(form, ev) {
  form.date.value = ev.date || "";
  form.name.value = ev.name || "";
  form.km.value = ev.km || "";
  if (form.sport) form.sport.value = "run";
  if (form.effort) form.effort.value = "easy";
  if (form.source_id) form.source_id.value = ev.id || "";
  if (form.swim_m) form.swim_m.value = "";
  if (form.bike_km) form.bike_km.value = "";
  if (form.note) form.note.value = "";
  if (form.event_note) form.event_note.value = "";
  if (form.is_public) form.is_public.value = "no";
  setAgendaEventLocked(form, true);
};

function setAgendaEventLocked(form, locked) {
  form.classList.toggle("from-public", locked);
  ["date", "name", "km"].forEach((n) => {
    if (form[n]) form[n].readOnly = locked;
  });
  let hint = form.querySelector(".picked-readonly");
  if (locked) {
    if (!hint) {
      hint = document.createElement("p");
      hint.className = "muted small-text picked-readonly full";
      hint.textContent = "This is a public event, so name, date and distance stay as listed.";
      form.querySelector("label.full")?.after(hint);
    }
    hint.hidden = false;
  } else if (hint) hint.hidden = true;
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
  if (wk === calendarWk) return "This week";
  if (wk === calendarWk + 1) return "Next week";
  if (wk === calendarWk - 1) return "Last week";
  return offset === 0 ? "Selected week" : "Following week";
}

function renderNoPlanHome(acts, now) {
  const lastSync = acts.length ? acts.map((a) => a.date).sort().at(-1) : null;
  const upcoming = upcomingEventsList(now, acts);
  return `
    <section class="hero">
      <div>
        <div class="eyebrow">Today · ${fmt(now, { weekday: "long", day: "numeric", month: "long" })}</div>
        <h1>No plan yet</h1>
        <p class="muted">Start a plan when you are ready. Import a CSV for this week, or add a public event to your agenda.</p>
      </div>
      <button class="button" type="button" data-action="start-plan">Start plan</button>
    </section>
    ${acts.length ? loggedWeekBlock(acts, now) : `
      <section class="card">
        <p class="muted" style="margin:0">Nothing to show yet. Open a day to log a session, import a Garmin CSV, or start a plan.</p>
      </section>`}
    ${eventsCard(now, upcoming, { acts })}
    <p class="footnote">${lastSync ? `Activities up to ${short(parseDate(lastSync))}. <a href="/activities">See all</a>` : "Log a session from a day, or import a Garmin CSV."}</p>`;
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

  return `
    <section class="hero">
      <div>
        <div class="eyebrow">Today · ${fmt(now, { weekday: "long", day: "numeric", month: "long" })}${viewingPast ? ` · viewing week ${wk}` : ""}</div>
        <h1>Week ${wk} of ${WEEKS.length} <span class="muted">· ${phase.name}</span></h1>
        <p class="muted">${phase.focus}</p>
        ${window.CURRENT_PLAN?.notes ? `<p class="plan-notes">${esc(window.CURRENT_PLAN.notes)}</p>` : ""}
      </div>
      <button type="button" class="countdown" data-action="open-day" data-date="${ymd(RACE)}" title="View ${esc(eventLabel())}">
        <strong>${daysToRace}</strong><span>days to ${esc(eventLabel())}</span>
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

    ${pendingChanges().length ? `
      <a class="changes-banner" href="/plan">
        <strong>${pendingChanges().length} plan change${pendingChanges().length > 1 ? "s" : ""} waiting for the AI coach</strong>
        <span>Review and send them from the Full plan page →</span>
      </a>` : ""}

    ${reviewCard(acts, now)}

    <div class="week-nav">
      <button class="button ghost small" type="button" data-action="home-week-prev"${wk <= 1 ? " disabled" : ""} aria-label="Previous week">← Previous week</button>
      ${viewingPast ? `<button class="button ghost small" type="button" data-action="home-week-today">This week</button>` : ""}
      <button class="button ghost small" type="button" data-action="home-week-next"${wk >= WEEKS.length ? " disabled" : ""} aria-label="Next week">Next week →</button>
    </div>

    <div class="grid">
      ${weekCard(current, acts, now, homeWeekCardTitle(wk, calendarWk, 0))}
      ${next ? weekCard(next, acts, now, homeWeekCardTitle(wk, calendarWk, 1)) : ""}
    </div>

    ${eventsCard(now, upcoming, { acts })}

    <div class="cta"><a class="button" href="/plan">See the full plan to race day →</a></div>
    <p class="footnote">${lastSync ? `Activities up to ${short(parseDate(lastSync))}. <a href="/activities">See all</a>` : "Open a day to mark it done, or import a Garmin Connect Activities.csv."}</p>
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
    const progress = actual !== null ? `${actual.toFixed(1)} km` : "—";
    const aria = `Week ${w.wk}, ${dates}: ${w.km} km, long ${w.long} km, progress ${actual !== null ? `${actual.toFixed(1)} km` : "not started"}`;
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
          <em>Week ${w.wk}</em>
          <em class="chart-tip-dates">${esc(dates)}</em>
          <span>Weekly <strong>${w.km} km</strong></span>
          <span>Long <strong>${w.long} km</strong></span>
          <span>Progress <strong>${esc(progress)}</strong></span>
        </span>
      </a>`);
  });
  const ticks = [];
  for (let v = 10; v < max; v += 10) ticks.push(v);
  const grid = ticks.map((v) => `<line x1="${pad}" x2="${W - pad}" y1="${y(v)}" y2="${y(v)}"></line><text class="axis" x="${pad - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join("");
  return `<div class="chart-scroll"><div class="chart-inner">
      <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weekly run km">${grid}${bars.join("")}</svg>
      <div class="chart-hovers">${hovers.join("")}</div>
    </div></div>
    <div class="legend"><span><i class="lg-total"></i>Weekly run km</span><span><i class="lg-long"></i>Long run</span><span><i class="lg-actual"></i>Logged</span></div>`;
}

function localProgressReport(acts, now) {
  const stats = planProgressStats(acts, now);
  const pred = typeof window.racePrediction === "function" ? window.racePrediction(acts, now) : null;
  if (!stats) return "Start the plan to get a progress report.";
  const paras = [];
  if (!stats.started) {
    paras.push(`${eventLabel()} starts in ${daysBetween(now, START)} days. The report will track from week 1.`);
  } else if (stats.finished) {
    paras.push(`${eventLabel()} is done. You logged ${stats.loggedKm.toFixed(1)} km across ${stats.done} sessions in this block.`);
  } else {
    const sessionPct = stats.planned ? Math.round((stats.done / stats.planned) * 100) : 0;
    paras.push(`Week ${stats.wk} of ${stats.totalWeeks}, ${stats.phase.name || "build"}, ${Math.max(0, stats.daysToRace)} days to ${eventLabel()}. ${stats.done} of ${stats.planned} planned sessions are done (${sessionPct}%), with ${stats.loggedKm.toFixed(1)} of ${stats.plannedKm.toFixed(0)} km logged.`);
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
    ? "No plan yet"
    : stats.finished
      ? `${esc(eventLabel())} is done`
      : stats.started
        ? `Week ${stats.wk} of ${stats.totalWeeks} · ${esc(stats.phase.name || "")}`
        : `Starts in ${daysBetween(now, START)} days`;
  return `
    <section class="hero compact">
      <div>
        <div class="eyebrow">${status}</div>
        <h1>Progress report</h1>
        <p class="muted">${esc(eventLabel())}${stats && !stats.finished ? ` · ${Math.max(0, stats.daysToRace)} days to race` : ""}</p>
      </div>
      <div class="hero-actions">
        <a class="button ghost small" href="/plan">Back to plan</a>
        <button type="button" class="button ghost small" data-action="refresh-progress" ${running ? "disabled" : ""}>
          ${running ? "Writing…" : "Ask the coach again"}
        </button>
      </div>
    </section>
    <section class="card" id="progress-report">
      ${running ? `<p class="muted small-text">${hasAi ? "Updating the report…" : "The coach is writing a progress report from your plan and sessions."}</p>` : ""}
      ${stale ? `<p class="muted small-text">This was written in week ${PROGRESS_REPORT.week}. Ask again for an update.</p>` : ""}
      <div class="progress-copy">${paragraphs}</div>
      ${when && hasAi ? `<p class="muted small-text">Coach note · ${esc(when)}</p>` : ""}
    </section>
    ${renderRacePrediction(acts, now)}`;
}

function renderVolumeCard(acts, now) {
  return `
    <section class="card volume-card">
      <div class="card-head">
        <div>
          <div class="eyebrow">Load</div>
          <h2>Weekly run km</h2>
        </div>
        <a class="button ghost small" href="/progress">Progress report</a>
      </div>
      ${renderChart(acts, now)}
    </section>`;
}

function weekKmSummary(w, acts, now) {
  const s = weekStart(w.wk);
  if (s > now) return `<span class="km"><strong>${w.km}</strong> km planned · long ${w.long}</span>`;
  const logged = weekRunKm(w, acts);
  const pct = Math.round((logged / w.km) * 100);
  const inProgress = w.wk === weekOf(now) && ymd(now) !== ymd(addDays(s, 6));
  const level = inProgress ? "live" : pct >= 90 ? "good" : pct >= 60 ? "ok" : "low";
  return `
    <span class="km logged lvl-${level}" title="${logged.toFixed(1)} of ${w.km} km run${inProgress ? " (week in progress)" : ""}">
      <span class="km-nums"><strong>${logged.toFixed(1)}</strong> / ${w.km} km <em>${pct}%</em></span>
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
    if (spec.sport === "bike" && spec.bikeKm) return `${(spec.bikeKm / (use / 3600)).toFixed(1)} km/h`;
    if (spec.sport === "swim" && spec.swimM) return `${fmtPace(use / (spec.swimM / 100))}/100m`;
    const km = spec.targetRunKm || spec.runKm;
    if (km) return `${fmtPace(use / km)}/km`;
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
        if (gain > 0.15) delta = `${gain.toFixed(1)} km/h faster`;
      } else {
        const unitDist = spec.sport === "swim" && spec.swimM ? spec.swimM / 100 : (spec.targetRunKm || spec.runKm);
        const per = unitDist ? deltaSec / unitDist : 0;
        const unit = spec.sport === "swim" ? "/100m" : "/km";
        if (per >= 1) delta = per < 60 ? `${Math.round(per)}s${unit} faster` : `${fmtPace(per)}${unit} faster`;
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
          ${w.wk === curWk ? `<span class="you">You are here</span>` : ""}
        </summary>
        <div class="week-body">
          ${hasSportTarget(w, "swim") || hasSportTarget(w, "bike") ? `
          <div class="targets small">
            ${extraSportTargets(w)}
          </div>` : ""}
          ${s <= now ? `<div class="review inline"><div class="eyebrow">Week feedback</div>${reviewBlock(w, acts, now)}</div>` : ""}
          ${w.note ? `<p class="note">${w.note}</p>` : ""}
          <ul class="days">${w.days.map((_, i) => dayRow(w, i, acts, now)).join("")}</ul>
        </div>
      </details>`;
  }).join("");

  return `
    <section class="hero compact">
      <div>
        <div class="eyebrow">${WEEKS.length} weeks · ${short(START)} → ${fmt(RACE, { day: "numeric", month: "short", year: "numeric" })}</div>
        <h1>Full ${esc(eventLabel())} plan</h1>
        <p class="muted">${window.CURRENT_PLAN?.sport === "run"
          ? "The long run is the key session. If tired: keep that and cut an easy run. Weekly load rises about 10%, with a cutback every fourth week."
          : window.CURRENT_PLAN?.sport === "triathlon"
            ? "Triathlon structure: longer aerobic base, then build with race-specific work and bike→run bricks, then a sharper taper. If tired: cut extras first, protect the long ride and key brick. About 10% load increase week to week, cutback every fourth week."
          : "Key session wins every conflict. If tired: cut the extra sport first, then easy km. About 10% load increase week to week, with a cutback every fourth week."}</p>
        ${window.CURRENT_PLAN?.notes ? `<p class="plan-notes">${esc(window.CURRENT_PLAN.notes)}</p>` : ""}
      </div>
      <button class="button ghost small" type="button" data-action="remove-plan">Remove plan</button>
    </section>

    ${changesCard()}

    ${renderVolumeCard(acts, now)}

    <div class="weeks">${weeks}</div>

    <div class="grid">
      <section class="card">
        <div class="card-head"><h2>Pace guide</h2></div>
        <table class="table">
          <thead><tr><th>Effort</th><th>Pace / km</th><th>Use</th></tr></thead>
          <tbody>${PACES.map((p) => `<tr><td>${p[0]}</td><td><strong>${p[1]}</strong></td><td class="muted">${p[2]}</td></tr>`).join("")}</tbody>
        </table>
        <p class="muted small-text">Keep easy days easy. Save race effort for the event and short quality sessions. <a href="/gear">Track shoes, bikes and swim kit on the Gear page</a>.</p>
      </section>
      ${ROADMAP_703.length ? `
      <section class="card">
        <div class="card-head"><h2>${roadmapHeading()}</h2></div>
        <ul class="roadmap">${ROADMAP_703.map((r) => `<li><strong>${esc(r[0])}</strong><span>${esc(r[1])}</span></li>`).join("")}</ul>
      </section>` : ""}
      ${(window.CURRENT_PLAN?.sources || []).length ? `
      <section class="card">
        <div class="card-head"><h2>Research behind this plan</h2></div>
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

function reviewStages(weeks) {
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
  const stages = [];
  if (first) stages.push({ id: "first-mp-20", wk: first.wk, title: "first 20 km+ with marathon pace" });
  if (main && main.wk !== first?.wk) stages.push({ id: "main-mp", wk: main.wk, title: "main marathon-pace long" });
  if (lock && lock.wk !== main?.wk && lock.wk !== first?.wk) stages.push({ id: "lock-mp", wk: lock.wk, title: "lock race pace" });
  return stages;
}

function dueReviewStage(now) {
  const wk = weekOf(now);
  return reviewStages(window.WEEKS).find((s) => wk === s.wk || wk === s.wk + 1) || null;
}

function alreadyQueued(stage) {
  return CHANGES.some((c) => c.details && c.details.stage === stage.id);
}

async function queueStageReviews(now) {
  if (!CURRENT_USER_ID || !hasPlan()) return false;
  const due = dueReviewStage(now);
  if (!due || alreadyQueued(due)) return false;
  const row = {
    user_id: CURRENT_USER_ID,
    id: newId(),
    type: "note",
    summary: `Stage review · week ${due.wk}: ${due.title}. Re-evaluate volume and A-goal from logged runs.`,
    details: { stage: due.id, week: due.wk },
    status: "pending",
  };
  const { error } = await sb.from("changes").insert(row);
  if (error) return false;
  CHANGES = [{ ...row, createdAt: new Date().toISOString() }, ...CHANGES];
  return true;
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
  const due = dueReviewStage(today());
  try {
    const data = await invokeCoach({ action: "start", stage: due?.id || null });
    if (data.status === "applied") {
      COACH_STATUS = "idle";
      toast(data.summary || "Plan updated.");
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
      if (!data.unchanged) toast(data.summary || "Progress report ready.");
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
      if (!data.unchanged) toast(data.summary || "Progress report ready.");
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
      toast(data.summary || "Plan updated.");
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
      toast(data.unchanged ? "Feedback already matches this week's sessions." : (data.summary || "Week feedback updated."));
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
      toast(data.unchanged ? "Feedback already matches this week's sessions." : (data.summary || "Week feedback updated."));
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
  return `
    <section class="card changes" id="changes">
      <div class="card-head">
        <div>
          <div class="eyebrow">AI coach</div>
          <h2>Plan changes ${items.length ? `<span class="count">${items.length}</span>` : ""}</h2>
        </div>
        ${(items.length || reviewing) ? `<button class="button small" type="button" data-action="send-coach"${reviewing ? " disabled" : ""}>${reviewing ? "Reviewing" : "Send to AI coach"}</button>` : ""}
      </div>
      ${items.length ? `
        <ul class="change-list">
          ${items.map((c) => `
            <li>
              <span class="change-icon t-${c.type}">${CHANGE_ICON[c.type] || "•"}</span>
              <span class="change-text">${esc(c.summary)}<span class="muted"> · ${fmt(new Date(c.createdAt), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span></span>
              <button class="icon-button" type="button" data-action="delete-change" data-id="${esc(c.id)}" title="Remove from list">✕</button>
            </li>`).join("")}
        </ul>
        <p class="muted small-text">${reviewing
          ? "Sent to the AI coach. Reviewing these changes now. The plan updates when it finishes."
          : "Click <strong>Send to AI coach</strong> and the review goes out as a request. The plan updates when it finishes. Stage weeks do this automatically."}</p>` : reviewing ? `
        <p class="muted small-text">Sent to the AI coach. Reviewing now. The plan updates when it finishes.</p>` : `
        <p class="muted small-text">No pending changes. Busy days, new events and CSV imports show up here automatically.${applied ? ` ${applied} earlier change${applied > 1 ? "s were" : " was"} applied.` : ""}</p>`}
      <form class="note-form">
        <input type="text" name="text" maxlength="2000" placeholder="Anything else for the coach? e.g. sore calf, holiday 20–27 Dec, want to try a 10K race in January" />
        <button class="button ghost small" type="submit">Add note</button>
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
      if (setupForm && typeof window.paintSetupConnect === "function") {
        window.paintSetupConnect(setupForm);
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
      ...active.map((cat) => `<span>${YEAR_SPORT_LABEL[cat]} <strong>${row.byCat[cat].toFixed(1)} km</strong></span>`),
      ...(active.length > 1 ? [`<span>Total <strong>${total.toFixed(1)} km</strong></span>`] : []),
      ...(timeLabel ? [`<span>Time <strong>${esc(timeLabel)}</strong></span>`] : []),
    ] : [`<span>No sessions</span>`];
    const summary = count
      ? `${count} session${count === 1 ? "" : "s"}, ${active.map((cat) => `${YEAR_SPORT_LABEL[cat]} ${row.byCat[cat].toFixed(1)} km`).join(", ")}${timeLabel ? `, ${timeLabel}` : ""}`
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
  const legend = cats.map((cat) => `<span><i class="lg-${cat}"></i>${YEAR_SPORT_LABEL[cat]}${totals[cat] ? ` ${totals[cat].toFixed(1)} km` : ""}</span>`).join("");
  return `
    <div class="year-month">
      <div class="year-month-head">
        <h3>${filter ? `${YEAR_SPORT_LABEL[filter]} km by week` : "Weekly volume"}</h3>
        <span class="muted">${sessions ? `${sessions} session${sessions === 1 ? "" : "s"} in ${year}` : `No sessions in ${year}`}</span>
      </div>
      <div class="chart-scroll">
        <div class="chart-inner week-vol-inner">
          <svg class="week-vol-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`Weekly ${filter ? YEAR_SPORT_LABEL[filter].toLowerCase() : "training"} volume in ${year}`)}">${grid}${bars.join("")}</svg>
          <div class="chart-hovers">${hovers.join("")}</div>
        </div>
      </div>
      <div class="legend week-vol-legend">${legend}</div>
    </div>`;
}

function activityListRow(a) {
  const d = parseDate(a.date);
  const dayName = DAY_NAMES[(d.getDay() + 6) % 7];
  return `
    <li class="day clickable" data-date="${esc(a.date)}" tabindex="0" role="button" title="View activity">
      <div class="day-date"><strong>${d.getDate()}</strong><span>${dayName}</span></div>
      <div class="day-body">
        <div class="session"><span class="chip k-${a.cat}">${YEAR_SPORT_LABEL[a.cat] || a.cat}</span><span class="label">${esc(a.title || activityLine(a))}</span></div>
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
    ["", "All", yearPool.length],
    ...YEAR_SPORTS.map((cat) => [cat, YEAR_SPORT_LABEL[cat], totals[cat]]),
  ];
  const volume = activityVolume(rows, filter);
  const summary = rows.length
    ? `${rows.length} session${rows.length === 1 ? "" : "s"} in ${year}`
    : yearPool.length
      ? `No ${YEAR_SPORT_LABEL[filter].toLowerCase()} sessions in ${year}.`
      : pool.length
        ? `Nothing logged in ${year}. Pick another year, or log a session.`
        : "Nothing logged yet. Log a session, or import a Garmin CSV.";
  return `
    <section class="hero compact">
      <div>
        <div class="eyebrow">Log</div>
        <h1>${filter ? `${YEAR_SPORT_LABEL[filter]} activities` : "All activities"}</h1>
        <p class="muted">${summary}</p>
      </div>
      <div class="hero-side">
        <button class="button" type="button" data-action="toggle-activity-log">Log a session</button>
        ${rows.length ? `
          <div class="countdown act-km">
            <strong>${esc(volume.value)}</strong>
            <span>${volume.unit} logged</span>
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
          ? `No ${YEAR_SPORT_LABEL[filter].toLowerCase()} sessions in ${year}.`
          : `No sessions in ${year}.`}</p>`}
    </section>`;
}

const APP_ROUTES = new Set(["home", "plan", "activities", "events", "gear", "profile", "connections", "progress", "setup"]);

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
  else if (hash === "#gear") path = "/gear";
  else if (!hash && (location.pathname === "/" || location.pathname === "/index.html" || location.pathname === "")) path = "/home";
  if (!path) return;
  history.replaceState(null, "", path + location.search);
}

function go(path, { replace = false } = {}) {
  const next = (path.startsWith("/") ? path : `/${path}`) + location.search;
  const [nextBase] = path.replace(/^\/+|\/+$/g, "").split("/");
  const sameSection = pathParts()[0] === nextBase;
  if (location.pathname + location.search === next && !location.hash) {
    if (!APP_READY && nextBase !== "setup" && window.CURRENT_USER_ID) return window.bootApp?.();
    render();
    return;
  }
  if (replace || sameSection) history.replaceState(null, "", next);
  else history.pushState(null, "", next);
  if (!APP_READY && nextBase !== "setup" && window.CURRENT_USER_ID) return window.bootApp?.();
  render();
}

window.go = go;
migrateLegacyHash();

function renderView(route, acts, now) {
  if (route === "profile") return renderProfile(acts, now);
  if (route === "connections") return renderConnections();
  if (route === "activities") return renderActivities(acts, now);
  if (route === "events") return renderPastEvents(now);
  if (!hasPlan()) return renderNoPlanHome(acts, now);
  if (route === "plan") return renderPlan(acts, now);
  if (route === "progress") return renderProgress(acts, now);
  if (route === "gear") return renderGear();
  return renderHome(acts, now);
}

function render(force = false) {
  captureEventFormDraft();
  captureActivityLogDraft();
  if (currentRoute() === "setup") {
    const hasSetupUi = document.querySelector(".setup-form, .setup-connect-step");
    if (typeof window.renderOnboarding === "function" && !hasSetupUi) {
      window.renderOnboarding();
    }
    return;
  }
  document.body.classList.remove("onboarding");
  if (!APP_READY) {
    if (window.CURRENT_USER_ID && typeof window.bootApp === "function") window.bootApp();
    return;
  }
  const now = today();
  const route = currentRoute();
  document.querySelectorAll("nav a").forEach((a) => {
    const active = a.dataset.route === route
      || (route === "progress" && a.dataset.route === "plan")
      || (route === "connections" && a.dataset.route === "profile");
    a.classList.toggle("active", active);
  });
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
          if (!(km > 0 && km < 300)) throw new Error("Distance must be a positive number of km");
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
      if (!type) throw new Error("Type must be shoes, bike, swimsuit or wetsuit");
      if (!name) throw new Error("Name is required");
      const { data, error } = await sb.from("gear").insert({
        id: newId(), user_id: uid, type, name, note, retired: false,
      }).select("*").single();
      if (error) throw error;
      return { id: data.id, type: data.type, name: data.name, note: data.note || "", retired: !!data.retired, addedAt: data.added_at };
    }
    if (method === "POST" && id) {
      const patch = {};
      if (typeof body.retired === "boolean") patch.retired = body.retired;
      const name = String(body.name || "").trim().slice(0, 80);
      if (name) patch.name = name;
      if (body.note != null) patch.note = String(body.note).trim().slice(0, 140);
      if (!Object.keys(patch).length) throw new Error("Nothing to update");
      const { data, error } = await sb.from("gear").update(patch).eq("user_id", uid).eq("id", id).select("*").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Gear not found");
      return { id: data.id, type: data.type, name: data.name, note: data.note || "", retired: !!data.retired, addedAt: data.added_at };
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
        throw new Error("Distance should be a positive number of km");
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
  const link = e.target.closest("a[href]");
  if (link && !link.target && !link.hasAttribute("download") && e.button === 0
      && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey
      && !(link.getAttribute("href") || "").startsWith("#")) {
    const url = new URL(link.getAttribute("href"), location.origin);
    if (url.origin === location.origin && isAppPath(url.pathname)) {
      e.preventDefault();
      const dest = url.pathname.replace(/\/+$/, "") || "/home";
      if (document.body.classList.contains("onboarding") && dest !== "/setup") {
        if (dest === "/home" && typeof window.leaveSetupToHome === "function") {
          await window.leaveSetupToHome();
        } else if (typeof window.saveSetupDraftNow === "function") {
          window.saveSetupDraftNow();
        }
        return;
      }
      if (url.pathname === "/gear" || url.pathname.startsWith("/gear/")) dialog?.close();
      go(url.pathname);
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
  const btn = e.target.closest("[data-action]");
  if (!btn) {
    const day = e.target.closest(".day.clickable");
    if (day && !dialog.contains(day)) openDay(day.dataset.date);
    return;
  }
  if (btn.dataset.action === "close-dialog") dialog.close();
  if (btn.dataset.action === "open-day") {
    e.preventDefault();
    openDay(btn.dataset.date);
    return;
  }
  if (btn.dataset.action === "edit-username") {
    const input = btn.matches(".username-inline") ? btn : btn.querySelector(".username-inline");
    if (input && input.readOnly) {
      input.readOnly = false;
      input.focus();
      input.select();
    }
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
    if (typeof window.renderOnboarding === "function") window.renderOnboarding();
    else go("/setup");
    return;
  }
  if (btn.dataset.action === "remove-plan") {
    if (!window.CURRENT_PLAN) return;
    const name = eventLabel();
    if (!confirm(`Remove the ${name} plan and start a new one? Your activities stay. The goal race on this plan is removed.`)) return;
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
    form.querySelector("input[name=date]")?.focus();
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
    try {
      const data = await invokeStrava({
        action: "connect_url",
        passcode: stravaForm.passcode.value,
        redirectUri: stravaRedirectUri(),
        shareWithCoach: !!stravaForm.shareWithCoach?.checked,
      });
      if (!data?.url) throw new Error("Could not start Strava connect.");
      location.href = data.url;
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
    const onSetupConnect = !!garminForm.closest(".setup-connect-step, #setup-connect") || !!document.querySelector(".setup-connect-step");
    const syncNow = !!garminForm.querySelector("[name=sync_now]")?.checked;
    try {
      await invokeGarmin({ action: "save_key", apiKey: garminForm.apiKey.value });
      garminForm.reset();
      await loadGarminStatus();
      if ((setupForm || onSetupConnect) && syncNow) {
        try {
          await window.setupGarminSync({ permission: true });
        } catch (syncErr) {
          toast(syncErr.message || "Connected, but sync failed. You can retry from setup.", true);
        }
        if (typeof window.paintSetupConnect === "function") window.paintSetupConnect(setupForm);
        if (setupForm && typeof window.fillWeeklyFromSynced === "function") {
          window.fillWeeklyFromSynced(setupForm, { force: true });
        }
      } else if (setupForm || onSetupConnect) {
        if (typeof window.paintSetupConnect === "function") window.paintSetupConnect(setupForm);
        toast("Garmin connected. Tick sync permission and sync to pull existing activities.");
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
    const submit = gearForm.querySelector("button[type=submit]");
    if (submit) submit.disabled = true;
    try {
      if (id) {
        await apiRequest("POST", `/api/gear/${encodeURIComponent(id)}`, { name, note });
        GEAR = await loadGear();
        render(true);
        toast("Gear updated.");
      } else {
        await apiRequest("POST", "/api/gear", { type: gearForm.type.value, name, note });
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
    try {
      await apiRequest("POST", "/api/activities", {
        date,
        type: logForm.type.value,
        distance: logForm.distance.value,
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
        km: editForm.km.value,
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
  data.km = Number(data.km);
  data.is_public = data.is_public === "yes";
  if (form.classList.contains("from-public")) data.event_note = "";
  const submit = form.querySelector("button[type=submit]");
  if (submit) submit.disabled = true;
  try {
    const saved = await apiRequest("POST", "/api/events", data);
    form.reset();
    form.hidden = true;
    setAgendaEventLocked(form, false);
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
    if (unit) unit.textContent = swim ? "m" : "km";
    form.distance.min = swim ? "25" : "0.1";
    form.distance.step = swim ? "25" : "0.01";
    if (swim && form.distance.value && Number(form.distance.value) < 25) form.distance.value = "";
    return;
  }
  const gearType = e.target.closest(".gear-form [name=type]");
  if (gearType) {
    syncGearNamePlaceholder(gearType.form);
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
  const input = e.target.closest?.(".username-inline");
  if (input) sizeUsernameInput(input);
});

document.addEventListener("focusout", (e) => {
  const input = e.target.closest?.(".username-inline");
  if (input && !input.readOnly) saveUsernameFromInput(input);
});

document.addEventListener("keydown", (e) => {
  const usernameInput = e.target.closest?.(".username-inline");
  if (usernameInput) {
    if (e.key === "Enter") {
      e.preventDefault();
      usernameInput.blur();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      usernameInput.value = window.CURRENT_PROFILE?.username || "";
      usernameInput.readOnly = true;
      sizeUsernameInput(usernameInput);
      const errorEl = document.querySelector(".username-error");
      if (errorEl) errorEl.textContent = "";
    }
    return;
  }
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

window.addEventListener("popstate", () => render());
document.getElementById("csv-input").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) importCSV(file);
  e.target.value = "";
});

let APP_READY = false;
let APP_BOOTING = null;

window.bootApp = function bootApp() {
  if (currentRoute() === "setup") {
    const hasSetupUi = document.querySelector(".setup-form, .setup-connect-step");
    if (typeof window.renderOnboarding === "function" && !hasSetupUi) {
      window.renderOnboarding();
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
  APP_BOOTING = (async () => {
    if (hasPlan() && typeof window.syncPlanDates === "function") window.syncPlanDates();
    [ACTS, EVENTS, FEEDBACK, BUSY, CHANGES, GEAR] = await Promise.all([
      loadActivities(),
      loadEvents(),
      loadFeedback(),
      hasPlan() ? loadBusy() : Promise.resolve({}),
      hasPlan() ? loadChanges() : Promise.resolve([]),
      loadGear(),
    ]);
    await loadWellness();
    await Promise.all([loadGarminStatus(), loadStravaStatus()]);
    await maybeHandleStravaCallback();
    if (hasPlan()) await Promise.all([loadProgressReport(), loadWeekFeedbackStamp()]);
    APP_READY = true;
    if (hasPlan()) {
      const queued = await queueStageReviews(today());
      if (queued) await sendCoachRequest({ silent: true });
      else await resumeCoachJob();
      await resumeFeedbackJob();
    }
    render(true);
  })();
  return APP_BOOTING;
};

window.resetApp = function resetApp() {
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
  window.CURRENT_PROFILE = null;
  window.CURRENT_USER_EMAIL = "";
};
