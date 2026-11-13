window.EVENT_PRESETS = {
  run: [
    { id: "5k", label: "5K", run: 5 },
    { id: "10k", label: "10K", run: 10 },
    { id: "10mi", label: "10 miles", run: 16.1 },
    { id: "half", label: "Half marathon", run: 21.1 },
    { id: "marathon", label: "Marathon", run: 42.2 },
    { id: "custom", label: "Custom" },
  ],
  swim: [
    { id: "750", label: "750 m", swim: 750 },
    { id: "1000", label: "1 km", swim: 1000 },
    { id: "1500", label: "1.5 km", swim: 1500 },
    { id: "1900", label: "1.9 km", swim: 1900 },
    { id: "3800", label: "3.8 km", swim: 3800 },
    { id: "5k", label: "5 km", swim: 5000 },
    { id: "custom", label: "Custom" },
  ],
  bike: [
    { id: "20", label: "20 km", bike: 20 },
    { id: "40", label: "40 km", bike: 40 },
    { id: "90", label: "90 km", bike: 90 },
    { id: "180", label: "180 km", bike: 180 },
    { id: "custom", label: "Custom" },
  ],
  triathlon: [
    { id: "sprint", label: "Sprint (750 m / 20 / 5)", swim: 750, bike: 20, run: 5 },
    { id: "kwart", label: "Olympic (1.5 / 40 / 10)", swim: 1500, bike: 40, run: 10 },
    { id: "halve", label: "Half / 70.3", swim: 1900, bike: 90, run: 21.1 },
    { id: "volledige", label: "Full / Ironman", swim: 3800, bike: 180, run: 42.2 },
    { id: "custom", label: "Custom" },
  ],
  duathlon: [
    { id: "sprint", label: "Sprint (5 / 20 / 2.5)", run: 5, bike: 20, run2: 2.5 },
    { id: "standard", label: "Standard (10 / 40 / 5)", run: 10, bike: 40, run2: 5 },
    { id: "custom", label: "Custom" },
  ],
  aquathlon: [
    { id: "sprint", label: "Sprint (750 m / 5 km)", swim: 750, run: 5 },
    { id: "standard", label: "Standard (1 km / 5 km)", swim: 1000, run: 5 },
    { id: "custom", label: "Custom" },
  ],
  walk: [
    { id: "10", label: "10 km", run: 10 },
    { id: "20", label: "20 km", run: 20 },
    { id: "30", label: "30 km", run: 30 },
    { id: "custom", label: "Custom" },
  ],
  ski: [
    { id: "half", label: "Half day (~15 km)", bike: 15 },
    { id: "full", label: "Full day (~30 km)", bike: 30 },
    { id: "custom", label: "Custom" },
  ],
};

window.EVENT_SPORTS = ["run", "swim", "bike", "triathlon", "duathlon", "aquathlon", "walk", "ski"];
window.EVENT_KINDS = ["race", "stage", "camp", "holiday"];
window.MULTI_DAY_KINDS = ["stage", "camp", "holiday"];
window.EVENT_MAX_DAYS = 21;

/** Ordered discipline slots for multi-sport single-day events. */
window.eventDisciplineSlots = function eventDisciplineSlots(sport) {
  if (sport === "triathlon") {
    return [
      { key: "swim", sport: "swim" },
      { key: "bike", sport: "bike" },
      { key: "run", sport: "run" },
    ];
  }
  if (sport === "duathlon") {
    return [
      { key: "run1", sport: "run" },
      { key: "bike", sport: "bike" },
      { key: "run2", sport: "run" },
    ];
  }
  if (sport === "aquathlon") {
    return [
      { key: "swim", sport: "swim" },
      { key: "run", sport: "run" },
    ];
  }
  return [];
};

window.isMultiDisciplineSport = function isMultiDisciplineSport(sport) {
  return (window.eventDisciplineSlots(sport) || []).length > 0;
};

window.sportLabel = function sportLabel(s) {
  const key = `sport.${s}Full`;
  if (typeof window.t === "function") {
    const value = window.t(key);
    if (value !== key) return value;
  }
  return ({
    run: "Running",
    swim: "Swimming",
    bike: "Cycling",
    triathlon: "Triathlon",
    duathlon: "Duathlon",
    aquathlon: "Aquathlon",
    walk: "Walking",
    ski: "Skiing",
  })[s] || s;
};
window.SPORT_LABEL = new Proxy({}, {
  get(_target, prop) {
    if (prop === Symbol.toStringTag) return "Object";
    return window.sportLabel(prop);
  },
});

/** Periodization template sport for walk/ski (and unknown). */
window.planTemplateSport = function planTemplateSport(sport) {
  if (sport === "walk") return "run";
  if (sport === "ski") return "bike";
  if (sport === "duathlon" || sport === "aquathlon") return "triathlon";
  if (["run", "swim", "bike", "triathlon"].includes(sport)) return sport;
  return "run";
};

window.eventEndYmd = function eventEndYmd(ev) {
  const start = String(ev?.date || "").slice(0, 10);
  const end = String(ev?.end_date || "").slice(0, 10);
  if (start && end && end >= start) return end;
  return start;
};

window.eventCoversDate = function eventCoversDate(ev, dateStr) {
  const d = String(dateStr || "").slice(0, 10);
  const start = String(ev?.date || "").slice(0, 10);
  if (!d || !start) return false;
  return d >= start && d <= window.eventEndYmd(ev);
};

window.eventIsSoftKind = function eventIsSoftKind(kind) {
  return kind === "camp" || kind === "holiday";
};

function pgEachYmd(startYmd, endYmd) {
  const out = [];
  const start = String(startYmd || "").slice(0, 10);
  const end = String(endYmd || start).slice(0, 10);
  let cur = pgParse(start);
  const last = pgParse(end);
  if (Number.isNaN(cur.getTime()) || Number.isNaN(last.getTime()) || last < cur) return out;
  while (cur <= last) {
    out.push(pgYmd(cur));
    cur = pgAdd(cur, 1);
  }
  return out;
}

function normalizeLegItem(raw) {
  const sport = String(raw?.sport || "").toLowerCase();
  if (!window.EVENT_SPORTS.includes(sport) || window.isMultiDisciplineSport?.(sport)) return null;
  const km = Number(raw?.km);
  // Distance is optional — sport-only means "I'll do this, distance TBD".
  if (Number.isFinite(km) && km > 0 && km < 500) {
    return { sport, km: Math.round(km * 10) / 10 };
  }
  return { sport };
}

/** Build a full day list for [start, end], merging provided legs. Cap EVENT_MAX_DAYS. */
window.normalizeEventLegs = function normalizeEventLegs(startYmd, endYmd, legs) {
  const start = String(startYmd || "").slice(0, 10);
  let end = String(endYmd || start).slice(0, 10);
  if (!start) return [];
  if (!end || end < start) end = start;
  const maxEnd = pgYmd(pgAdd(pgParse(start), (window.EVENT_MAX_DAYS || 21) - 1));
  if (end > maxEnd) end = maxEnd;
  const byDate = new Map();
  (Array.isArray(legs) ? legs : []).forEach((leg) => {
    const d = String(leg?.date || "").slice(0, 10);
    if (!d || d < start || d > end) return;
    const items = (Array.isArray(leg.items) ? leg.items : [])
      .map(normalizeLegItem)
      .filter(Boolean);
    byDate.set(d, { date: d, items });
  });
  return pgEachYmd(start, end).map((d) => byDate.get(d) || { date: d, items: [] });
};

window.legDayLoadKm = function legDayLoadKm(leg) {
  return (leg?.items || []).reduce((s, it) => s + (Number(it.km) || 0), 0);
};

window.legDayLabel = function legDayLabel(leg, eventName, stageNum) {
  const items = leg?.items || [];
  if (!items.length) {
    const rest = "Rest / transfer";
    return stageNum != null
      ? `${eventName || "Event"} · day ${stageNum} · ${rest}`
      : `${eventName || "Event"} · ${rest}`;
  }
  const bits = items.map((it) => {
    const label = window.sportLabel ? window.sportLabel(it.sport) : it.sport;
    if (!(Number(it.km) > 0)) return label;
    if (it.sport === "swim") return `${label} ${Math.round(it.km * 1000)} m`;
    return `${label} ${fmtKmLabel(it.km)} km`;
  });
  const body = bits.join(" + ");
  if (stageNum != null) return `${eventName || "Event"} · day ${stageNum}: ${body}`;
  return eventName ? `${eventName}: ${body}` : body;
};

/**
 * Derive summary sport/km/swim_m/bike_km from legs.
 * Dominant sport = highest total km (swim stored as km = m/1000 in legs).
 */
window.summarizeEventLegs = function summarizeEventLegs(legs) {
  const totals = {};
  let dayCount = 0;
  let activeDays = 0;
  (legs || []).forEach((leg) => {
    dayCount += 1;
    const items = leg?.items || [];
    if (items.length) activeDays += 1;
    items.forEach((it) => {
      totals[it.sport] = (totals[it.sport] || 0) + (Number(it.km) || 0);
    });
  });
  const ranked = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const sport = ranked[0]?.[0] || "run";
  const km = Math.round((totals[sport] || 0) * 10) / 10 || 0.1;
  const swim_m = totals.swim ? Math.round(totals.swim * 1000) : null;
  const bike_km = totals.bike ? Math.round(totals.bike * 10) / 10 : null;
  const totalKm = Math.round(Object.values(totals).reduce((s, n) => s + n, 0) * 10) / 10;
  const hardest = Math.max(0, ...(legs || []).map((leg) => window.legDayLoadKm(leg)));
  return { sport, km, swim_m, bike_km, totalKm, dayCount, activeDays, hardest, totals };
};

window.expandEventToDayEntries = function expandEventToDayEntries(ev) {
  if (!ev?.date || !ev?.name) return [];
  const start = String(ev.date).slice(0, 10);
  const end = window.eventEndYmd(ev);
  const kind = window.EVENT_KINDS.includes(ev.kind) ? ev.kind : "race";
  const soft = window.eventIsSoftKind(kind);
  let legs = window.normalizeEventLegs(start, end, ev.legs);
  const hasItems = legs.some((leg) => (leg.items || []).length);
  if (!hasItems) {
    const sport = window.EVENT_SPORTS.includes(ev.sport) ? ev.sport : "run";
    const items = [];
    if (sport === "triathlon" || sport === "aquathlon" || sport === "duathlon") {
      if (Number(ev.swim_m) > 0) items.push({ sport: "swim", km: Number(ev.swim_m) / 1000 });
      if (Number(ev.bike_km) > 0) items.push({ sport: "bike", km: Number(ev.bike_km) });
      if (Number(ev.km) > 0) items.push({ sport: "run", km: Number(ev.km) });
    } else if (sport === "swim" && Number(ev.swim_m) > 0) {
      items.push({ sport: "swim", km: Number(ev.swim_m) / 1000 });
    } else {
      const km = Number(
        sport === "bike" || sport === "ski" ? (ev.bike_km || ev.km) : ev.km
      ) || 0.1;
      items.push({ sport: sport === "triathlon" ? "run" : sport, km });
    }
    legs = legs.map((leg, i) => (i === 0
      ? { date: leg.date, items }
      : { date: leg.date, items: [] }));
  }
  const multi = legs.length > 1;
  return legs.map((leg, i) => {
    const load = window.legDayLoadKm(leg);
    const primary = (leg.items || [])[0];
    return {
      date: leg.date,
      name: ev.name,
      km: load || Number(ev.km) || 0,
      sport: primary?.sport || ev.sport || "run",
      items: leg.items || [],
      kind,
      soft,
      effort: ev.effort || (soft ? "easy" : "race"),
      note: ev.note || "",
      stageNum: multi ? i + 1 : null,
      parentId: ev.id || null,
      existing: true,
    };
  });
};

window.eventRangeSummary = function eventRangeSummary(ev) {
  const start = String(ev?.date || "").slice(0, 10);
  const end = window.eventEndYmd(ev);
  if (!start) return "";
  if (!end || end === start) return start;
  const legs = window.normalizeEventLegs(start, end, ev.legs);
  const sum = window.summarizeEventLegs(legs);
  const days = sum.dayCount || 1;
  const sportBit = sum.activeDays
    ? ` · ${window.sportLabel(sum.sport)} ${fmtKmLabel(sum.totalKm)} km`
    : "";
  return `${days} days · ${start} → ${end}${sportBit}`;
};

window.TIME_PRESETS = {
  run: ["5k", "10k", "half", "marathon", "custom"],
  swim: ["750", "1500", "1900", "5k", "custom"],
  bike: ["40", "90", "180", "custom"],
  triathlon: ["kwart", "halve", "volledige", "custom"],
  walk: ["10", "20", "30", "custom"],
  ski: ["half", "full", "custom"],
};
window.TIME_GOALS = [
  { id: "5k-20", label: "Sub-20", preset: "5k", sport: "run" },
  { id: "5k-22", label: "Sub-22", preset: "5k", sport: "run" },
  { id: "5k-25", label: "Sub-25", preset: "5k", sport: "run" },
  { id: "5k-30", label: "Sub-30", preset: "5k", sport: "run" },
  { id: "10k-40", label: "Sub-40", preset: "10k", sport: "run" },
  { id: "10k-45", label: "Sub-45", preset: "10k", sport: "run" },
  { id: "10k-50", label: "Sub-50", preset: "10k", sport: "run" },
  { id: "10k-60", label: "Sub-60", preset: "10k", sport: "run" },
  { id: "half-130", label: "Sub-1:30", preset: "half", sport: "run" },
  { id: "half-145", label: "Sub-1:45", preset: "half", sport: "run" },
  { id: "half-200", label: "Sub-2:00", preset: "half", sport: "run" },
  { id: "marathon-330", label: "Sub-3:30", preset: "marathon", sport: "run" },
  { id: "marathon-400", label: "Sub-4:00", preset: "marathon", sport: "run" },
  { id: "marathon-430", label: "Sub-4:30", preset: "marathon", sport: "run" },
  { id: "swim-750-12", label: "Sub-12", preset: "750", sport: "swim" },
  { id: "swim-750-15", label: "Sub-15", preset: "750", sport: "swim" },
  { id: "swim-1500-25", label: "Sub-25", preset: "1500", sport: "swim" },
  { id: "swim-1500-30", label: "Sub-30", preset: "1500", sport: "swim" },
  { id: "swim-1500-35", label: "Sub-35", preset: "1500", sport: "swim" },
  { id: "swim-1900-35", label: "Sub-35", preset: "1900", sport: "swim" },
  { id: "swim-1900-40", label: "Sub-40", preset: "1900", sport: "swim" },
  { id: "swim-5k-90", label: "Sub-1:30", preset: "5k", sport: "swim" },
  { id: "swim-5k-120", label: "Sub-2:00", preset: "5k", sport: "swim" },
  { id: "bike-40-70", label: "Sub-1:10", preset: "40", sport: "bike" },
  { id: "bike-40-80", label: "Sub-1:20", preset: "40", sport: "bike" },
  { id: "bike-40-90", label: "Sub-1:30", preset: "40", sport: "bike" },
  { id: "bike-90-180", label: "Sub-3:00", preset: "90", sport: "bike" },
  { id: "bike-90-210", label: "Sub-3:30", preset: "90", sport: "bike" },
  { id: "bike-90-240", label: "Sub-4:00", preset: "90", sport: "bike" },
  { id: "bike-180-360", label: "Sub-6:00", preset: "180", sport: "bike" },
  { id: "bike-180-420", label: "Sub-7:00", preset: "180", sport: "bike" },
  { id: "bike-180-480", label: "Sub-8:00", preset: "180", sport: "bike" },
  { id: "tri-kwart-130", label: "Sub-1:30", preset: "kwart", sport: "triathlon" },
  { id: "tri-kwart-200", label: "Sub-2:00", preset: "kwart", sport: "triathlon" },
  { id: "tri-kwart-230", label: "Sub-2:30", preset: "kwart", sport: "triathlon" },
  { id: "tri-halve-500", label: "Sub-5:00", preset: "halve", sport: "triathlon" },
  { id: "tri-halve-530", label: "Sub-5:30", preset: "halve", sport: "triathlon" },
  { id: "tri-halve-600", label: "Sub-6:00", preset: "halve", sport: "triathlon" },
  { id: "tri-voll-12", label: "Sub-12:00", preset: "volledige", sport: "triathlon" },
  { id: "tri-voll-13", label: "Sub-13:00", preset: "volledige", sport: "triathlon" },
  { id: "tri-voll-14", label: "Sub-14:00", preset: "volledige", sport: "triathlon" },
];
window.timeGoalName = function timeGoalName(goal, extra = {}) {
  const time = String(extra.time || "").trim();
  const sport = extra.sport || goal?.sport || "run";
  const presetId = extra.preset || goal?.preset;
  const customDist = () => {
    if (sport === "swim" && Number(extra.swim) > 0) return `${Number(extra.swim)} m`;
    if (sport === "bike" && Number(extra.bike) > 0) return `${Number(extra.bike)} km`;
    if (Number(extra.run) > 0) return `${Number(extra.run)} km`;
    return "custom";
  };
  if (goal === "custom" || goal?.id === "custom" || extra.preset === "custom") {
    const dist = customDist();
    return time ? `${time} · ${dist}` : dist;
  }
  if (!goal) return time || "";
  const dist = ((window.EVENT_PRESETS || {})[sport] || []).find((p) => p.id === presetId);
  if (time) return [time, dist?.label].filter(Boolean).join(" ");
  return [goal.label, dist?.label].filter(Boolean).join(" ");
};

window.FITNESS_WEEKS = [8, 12, 16];
// Common fitness-block lengths by focus (what public plans most often use).
window.FITNESS_WEEKS_BY_SPORT = {
  run: { options: [8, 12, 16], default: 12, hint: "Most run fitness blocks are 8–16 weeks; 12 is the usual sweet spot." },
  swim: { options: [6, 8, 12], default: 8, hint: "Swim fitness blocks are often shorter — 6–12 weeks with technique focus." },
  bike: { options: [8, 12, 16], default: 12, hint: "Cycling base blocks commonly run 8–16 weeks." },
  triathlon: { options: [8, 12, 16], default: 12, hint: "Triathlon fitness / base blocks are most often 8–16 weeks." },
  walk: { options: [8, 12, 16], default: 12, hint: "Walking fitness blocks are usually 8–16 weeks." },
  ski: { options: [8, 12, 16], default: 12, hint: "Ski fitness blocks commonly run 8–16 weeks." },
};

// Research links returned on generated plans. Each entry lists which sports it applies to;
// race_only sources (tapers, race bricks) are omitted for general fitness blocks.
window.TRAINING_RESEARCH = [
  // —— Running ——
  {
    id: "run-periodization-review",
    title: "Training Periodization in Distance Runners (systematic review)",
    url: "https://pubmed.ncbi.nlm.nih.gov/35418513/",
    sports: ["run"],
    used_for: "Base → build → peak; mostly easy volume with hard/easy days; quality rises late in the block",
  },
  {
    id: "run-recreational",
    title: "Factors Affecting Training in Recreational Endurance Runners",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7183043/",
    sports: ["run"],
    used_for: "Periodized progression for recreational runners; most volume easy; strength + intervals help",
  },
  {
    id: "run-start-to-run",
    title: "Beginner run–walk progression (ACS M / NHS-style walk–jog principles)",
    url: "https://www.nhs.uk/live-well/exercise/running-and-aerobic-exercises/get-running-with-couch-to-5k/",
    sports: ["run"],
    used_for: "Start to Run: timed walk–jog sessions, build frequency gently (1–3 days/week), progress jog bouts toward a continuous ~20–30' jog / 5K feel",
  },
  {
    id: "run-long-vs-race",
    title: "Should You Run Longer Than Your Race Distance in Training? (Runner’s World)",
    url: "https://www.runnersworld.com/training/a71352096/when-to-run-longer-than-race-distance/",
    sports: ["run", "walk"],
    used_for: "5K/10K often exceed race distance; half depends on experience; keep the long ~≤30% of weekly volume",
  },
  {
    id: "run-higdon-10mi",
    title: "15K and 10 Mile Training Programs (Hal Higdon)",
    url: "https://www.halhigdon.com/training/15k-10-mile-training/",
    sports: ["run"],
    race_only: true,
    used_for: "10-mile / 15K long-run peaks: novice ~8 mi, intermediate ~race distance, advanced up to ~13 mi",
  },
  {
    id: "run-daniels-long",
    title: "Daniels on long-run length (Runner’s World / Canadian Running summaries)",
    url: "https://www.runnersworld.com/advanced/a20789777/variations-on-the-long-run/",
    sports: ["run", "walk"],
    used_for: "Long run ~20–25% of weekly volume (up to ~30% when weekly is under ~64 km); time-on-feet caps matter",
  },
  {
    id: "run-hansons-pfitz",
    title: "Daniels vs Pfitzinger vs Hansons Marathon Plans",
    url: "https://magic.training/en/blog/daniels-vs-pfitzinger-vs-hansons-marathon-plans",
    sports: ["run"],
    used_for: "Hansons keep long ~25–30% of week (often ~16 mi cap); Pfitzinger uses longer long + midweek medium-long",
  },
  // —— Duathlon / aquathlon ——
  {
    id: "duathlon-220",
    title: "Free 8-week duathlon training plan (220 Triathlon)",
    url: "https://www.220triathlon.com/training/training-plans/free-8-week-duathlon-training-plan",
    sports: ["duathlon", "triathlon"],
    race_only: true,
    used_for: "Standard duathlon (10/40/5): alternate run/bike days, weekly brick, don’t skip run-off-bike practice",
  },
  {
    id: "duathlon-entrenai",
    title: "Standard Duathlon Plan: 10K-40K-5K (EntrenAI)",
    url: "https://www.entrenai.app/en/plans/duathlon/standard",
    sports: ["duathlon"],
    race_only: true,
    used_for: "Run-heavy week (~45–48% time); weekly R-B-R brick; peak long run ~90' with race-pace segments",
  },
  {
    id: "aquathlon-peakora",
    title: "Aquathlon Training: Swim and Run Without the Bike",
    url: "https://peakora.at/en/blog/aquathlon-training/",
    sports: ["aquathlon"],
    race_only: true,
    used_for: "Don’t copy a triathlon week; ~2 swims + 3–4 runs; weekly swim→run brick is the key session",
  },
  {
    id: "aquathlon-tth",
    title: "Aquathlon Training Plans (Tri Training Harder)",
    url: "https://tritrainingharder.com/training-plans-aquathlon",
    sports: ["aquathlon"],
    race_only: true,
    used_for: "Sprint/standard aquathlon blocks are swim+run focused at modest weekly hours (~4–5.5 h)",
  },
  // —— Multi-day / stage ——
  {
    id: "stage-irunfar",
    title: "A Guide To Your Best Multi-Stage Race Performance (iRunFar)",
    url: "https://www.irunfar.com/a-guide-to-your-best-multi-day-race-performance-part-1-training",
    sports: ["run", "walk"],
    race_only: true,
    used_for: "Back-to-back (or triple) long days to practise racing on tired legs; space hard weekends for recovery",
  },
  {
    id: "stage-marathonhandbook",
    title: "How to Train for a Stage Race (Marathon Handbook)",
    url: "https://marathonhandbook.com/train-stage-race/",
    sports: ["run"],
    race_only: true,
    used_for: "Peak ~3–4 weeks out; back-to-back long runs; don’t need every stage distance as a single continuous long",
  },
  {
    id: "stage-cts-bike",
    title: "Training for Multi-Day Cycling Tours and Events (CTS)",
    url: "https://trainright.com/crushing-multi-day-cycling-tours-amateur-stage-race/",
    sports: ["bike", "ski"],
    race_only: true,
    used_for: "2–3 day endurance blocks with recovery after; progress from easy blocks to tempo/threshold blocks",
  },
  {
    id: "run-taper-marathon",
    title: "Longer Disciplined Tapers Improve Marathon Performance",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC8506252/",
    sports: ["run"],
    race_only: true,
    used_for: "2–3 week disciplined taper before a race; cut volume while keeping some sharpness",
  },
  {
    id: "endurance-taper-meta",
    title: "Effects of tapering on performance in endurance athletes (meta-analysis)",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC10171681/",
    sports: ["run", "swim", "bike", "triathlon"],
    race_only: true,
    used_for: "~41–60% volume cut over ≤21 days; keep intensity and session frequency",
  },
  // —— Swim ——
  {
    id: "swim-periodization-review",
    title: "Training Intensity Distribution and Periodization in Elite Swimmers",
    url: "https://pubmed.ncbi.nlm.nih.gov/33952709/",
    sports: ["swim"],
    used_for: "Wave-like mesocycles; aerobic base then threshold/VO2 work matched to event",
  },
  {
    id: "swim-overload-taper",
    title: "Identifying Optimal Overload and Taper in Elite Swimmers",
    url: "https://www.inigomujika.com/wp-content/uploads/2013/12/identifying_optimal_overload.pdf",
    sports: ["swim"],
    race_only: true,
    used_for: "Pre-race overload then taper: cut volume sharply, keep intensity and most sessions",
  },
  {
    id: "swim-usa-adm",
    title: "USA Swimming American Development Model",
    url: "https://www.usaswimming.org/coaches-leaders/coaches/american-development-model",
    sports: ["swim"],
    used_for: "Technique and consistency first; progressive load with energy-system awareness",
  },
  // —— Bike ——
  {
    id: "bike-trainingpeaks-annual",
    title: "How to Create Your Annual Cycling Training Plan (TrainingPeaks)",
    url: "https://www.trainingpeaks.com/blog/create-annual-cycling-training-plan/",
    sports: ["bike"],
    used_for: "Base → build → peak structure; raise load gradually; taper only before a goal race",
  },
  {
    id: "bike-base-to-build",
    title: "Further or Faster: When to Go from Base to Build",
    url: "https://www.trainingpeaks.com/blog/further-or-faster-when-to-go-from-base-to-build/",
    sports: ["bike"],
    used_for: "Stay in base until endurance is solid, then add intensity in the build",
  },
  {
    id: "bike-british-cycling-intensity",
    title: "British Cycling: understanding training intensity",
    url: "https://www.britishcycling.org.uk/knowledge/training/get-started/article/izn20140725-All-Cycling-Understanding-Intensity-1-0",
    sports: ["bike"],
    used_for: "Most rides easy; hard sessions deliberate — avoid junk middle intensity",
  },
  // —— Triathlon ——
  {
    id: "triathlete-20w",
    title: "A 20-Week Training Plan for Your First 70.3 Triathlon",
    url: "https://www.triathlete.com/training/20-week-training-plan-first-70-3-triathlon",
    sports: ["triathlon"],
    used_for: "70.3 structure: ~8w base → build → peak, recovery every 4th week, brick pattern",
  },
  {
    id: "triathlete-periodization",
    title: "How to Use Periodization in Your Triathlon Training Plan",
    url: "https://www.triathlete.com/training/how-to-use-periodization-in-your-triathlon-training-plan",
    sports: ["triathlon"],
    used_for: "Base/build/taper lengths; longer base for inexperienced long-course athletes; 3:1 overload/recovery",
  },
  {
    id: "osb-70.3",
    title: "Half-Ironman Specific Training (Marty Gaal / OSB Multisport)",
    url: "https://www.osbmultisport.com/articles/halfironmantraining.pdf",
    sports: ["triathlon"],
    used_for: "Beginners emphasize aerobic base; advanced add race-specific intensity; brick/race-pace key sessions",
  },
  {
    id: "scientific-taper",
    title: "How to optimize your triathlon taper (Scientific Triathlon)",
    url: "https://scientifictriathlon.com/tapering-for-triathlon/",
    sports: ["triathlon"],
    race_only: true,
    used_for: "8–14 day taper for 70.3; ~40–60% volume cut; keep frequency and some race intensity",
  },
  {
    id: "garmin-periodisation",
    title: "Periodisation of Training (Garmin triathlon programme)",
    url: "https://static.garmincdn.com/shared/emea/custom/training/downloads/triathlon/Tri-Training-Programme-Periodisation-ENGLISH.pdf",
    sports: ["triathlon"],
    used_for: "Long aerobic base (8–16w); progression then specific/race-pace work; volume down in specific phase",
  },
  {
    id: "corerise-split",
    title: "How to train for triathlon: structuring swim, bike and run",
    url: "https://corerise.ai/learn/how-to-train-for-triathlon-three-disciplines",
    sports: ["triathlon"],
    used_for: "~15% swim / 55% bike / 30% run by time; protect the run; bike carries most volume",
  },
  {
    id: "usat-bricks",
    title: "How to Use Brick Workouts in Triathlon Training (USA Triathlon)",
    url: "https://www.usatriathlon.org/articles/training-tips/how-to-use-brick-workouts-in-triathlon-training",
    sports: ["triathlon"],
    race_only: true,
    used_for: "Bike→run bricks to practise T2 and race feel",
  },
  {
    id: "triathlete-bricks",
    title: "How Often Should You Run Off the Bike in Triathlon Training?",
    url: "https://www.triathlete.com/training/dear-coach-how-often-should-i-run-off-the-bike/",
    sports: ["triathlon"],
    race_only: true,
    used_for: "About one brick most build/peak weeks for long-course; short mid-week option + longer weekend brick",
  },
  {
    id: "tritanium-couch",
    title: "Couch to Half Ironman (70.3) Training Plan",
    url: "https://tri-tanium.com/resources/couch-to-70-3-training-plan/",
    sports: ["triathlon"],
    used_for: "Frequency first, then volume, then intensity; 3–4 week blocks with recovery",
  },
];

const pgPad = (n) => String(n).padStart(2, "0");
const pgParse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const pgYmd = (d) => `${d.getFullYear()}-${pgPad(d.getMonth() + 1)}-${pgPad(d.getDate())}`;
const pgAdd = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const pgDays = (a, b) => Math.round((b - a) / 864e5);
const pgMonday = (d) => pgAdd(d, -((d.getDay() + 6) % 7));

function resolveDistances(sport, presetId, custom) {
  const preset = (EVENT_PRESETS[sport] || []).find((p) => p.id === presetId);
  if (!preset) throw new Error("Choose a distance.");
  if (preset.id !== "custom") {
    return {
      swim: preset.swim || null,
      bike: preset.bike || null,
      run: preset.run || null,
      run2: preset.run2 || null,
      label: preset.label,
    };
  }
  const swim = custom.swim ? Number(custom.swim) : null;
  const bike = custom.bike ? Number(custom.bike) : null;
  const run = custom.run ? Number(custom.run) : null;
  const run2 = custom.run2 ? Number(custom.run2) : null;
  if ((sport === "run" || sport === "walk") && !(run > 0)) {
    throw new Error(sport === "walk" ? "Enter the walk distance in km." : "Enter the run distance in km.");
  }
  if (sport === "swim" && !(swim > 0)) throw new Error("Enter the swim distance in metres.");
  if ((sport === "bike" || sport === "ski") && !(bike > 0)) {
    throw new Error(sport === "ski" ? "Enter the ski distance in km." : "Enter the bike distance in km.");
  }
  if (sport === "triathlon" && (!(swim > 0) || !(bike > 0) || !(run > 0))) {
    throw new Error("Enter swim, bike and run distances.");
  }
  if (sport === "duathlon" && (!(run > 0) || !(bike > 0) || !(run2 > 0))) {
    throw new Error("Enter first run, bike and second run distances.");
  }
  if (sport === "aquathlon" && (!(swim > 0) || !(run > 0))) {
    throw new Error("Enter swim and run distances.");
  }
  return { swim, bike, run, run2: sport === "duathlon" ? run2 : null, label: "Custom" };
}

function peakVolume(sport, weekly, runKm) {
  const start = Math.max(4, Number(weekly) || 8);
  let cap = start + 12;
  if (sport === "run" || sport === "walk") {
    if (runKm <= 5) cap = 35;
    else if (runKm <= 10) cap = 42;
    else if (runKm <= 16.2) cap = 48; // 10-mile: enough weekly volume to peak the long at ~race distance
    else if (runKm <= 21.2) cap = 55;
    else cap = sport === "walk" ? 70 : 65;
  } else if (sport === "triathlon" || sport === "duathlon" || sport === "aquathlon") {
    if (runKm <= 10) cap = 40;
    else if (runKm <= 21.2) cap = 48;
    else cap = 55;
  } else if (sport === "swim") {
    cap = Math.max(start + 2, start * 1.4);
  } else if (sport === "bike" || sport === "ski") {
    cap = Math.min(sport === "ski" ? 200 : 250, Math.max(start + 20, start * 1.5));
  }
  const built = start * (1.1 ** 12);
  return Math.round(Math.min(cap, Math.max(start, Math.min(built, start * 2.2 + 6))));
}

// Peak long-run distance by race + experience (Higdon 10-mile / RW race-distance guidance).
// Shorter races may exceed race distance; from ~10 miles up, recreational peaks sit at or under race.
function longCap(sport, runKm, weekly, experience = "intermediate") {
  if (sport === "swim") return Math.max(1, Math.round((weekly || 2) * 0.4 * 10) / 10);
  if (sport === "bike" || sport === "ski") return Math.min(180, Math.round(weekly * 0.45));
  const level = EXPERIENCE_LEVELS.includes(experience) ? experience : "intermediate";
  const race = Math.max(0, Number(runKm) || 0);
  if (race >= 42) {
    if (level === "beginner") return 28;
    if (level === "advanced") return 32;
    return 30;
  }
  if (race >= 21) {
    if (level === "beginner") return Math.min(18, Math.round(race * 0.85));
    if (level === "advanced") return Math.min(24, Math.round(race * 1.1));
    return Math.round(race);
  }
  // 10-mile / 15K band: novice ~80% race, intermediate ≈ race, advanced ~25% over.
  if (race >= 15) {
    if (level === "beginner") return Math.max(10, Math.round(race * 0.8));
    if (level === "advanced") return Math.min(21, Math.round(race * 1.25));
    return Math.round(race);
  }
  // 10K: exceeding race distance is normal and useful.
  if (race >= 10) {
    if (level === "beginner") return 12;
    if (level === "advanced") return 16;
    return 14;
  }
  if (race >= 5) {
    if (level === "beginner") return 8;
    if (level === "advanced") return 12;
    return 10;
  }
  return Math.max(8, Math.round((race || 8) * 1.2));
}

// Long run as a share of weekly volume. Coaches typically keep this near ~25–30%
// (Runner’s World / O’Connell); shorter races may sit a little higher when weekly km is modest.
function longShareOfWeek(sport, runKm) {
  if (sport === "swim") return 0.4;
  if (sport === "bike" || sport === "ski") return 0.4;
  const race = Math.max(0, Number(runKm) || 0);
  if (race >= 42) return 0.28;
  if (race >= 21) return 0.30;
  if (race >= 15) return 0.32;
  if (race >= 10) return 0.34;
  return 0.35;
}

function triDistanceBand(distances = {}) {
  const runKm = Number(distances.run) || 0;
  const bikeKm = Number(distances.bike) || 0;
  const swimM = Number(distances.swim) || 0;
  if (runKm >= 40 || bikeKm >= 160 || swimM >= 3500) return "full";
  if (runKm >= 18 || bikeKm >= 70 || swimM >= 1700) return "half";
  if (runKm >= 8 || bikeKm >= 35 || swimM >= 1200) return "olympic";
  return "sprint";
}

function phaseBlocks(n, opts = {}) {
  const sport = opts.sport || "run";
  const experience = opts.experience || "intermediate";
  const fitness = !!opts.fitness;
  const band = sport === "triathlon" ? triDistanceBand(opts.distances) : null;
  const longCourse = band === "half" || band === "full";
  const beginnerLong = sport === "triathlon" && longCourse && experience === "beginner";
  const advancedLong = sport === "triathlon" && longCourse && experience === "advanced";

  // General fitness: no race → no taper. End on Build/Peak and keep the habit.
  if (fitness) {
    if (sport === "triathlon") {
      if (n >= 18) {
        const rebuild = beginnerLong ? Math.round(n * 0.12) : Math.round(n * 0.1);
        const base = beginnerLong ? Math.round(n * 0.4) : advancedLong ? Math.round(n * 0.3) : Math.round(n * 0.36);
        const build = beginnerLong ? Math.round(n * 0.22) : advancedLong ? Math.round(n * 0.3) : Math.round(n * 0.26);
        const peak = Math.max(2, n - rebuild - base - build);
        return [
          { name: "Rebuild", weeks: Math.max(1, rebuild) },
          { name: "Base", weeks: Math.max(4, base) },
          { name: "Build", weeks: Math.max(3, build) },
          { name: "Peak", weeks: Math.max(2, peak) },
        ];
      }
      if (n >= 12) {
        const base = beginnerLong ? Math.round(n * 0.48) : advancedLong ? Math.round(n * 0.34) : Math.round(n * 0.42);
        const build = beginnerLong ? Math.round(n * 0.26) : advancedLong ? Math.round(n * 0.36) : Math.round(n * 0.32);
        const peak = Math.max(2, n - base - build);
        return [
          { name: "Base", weeks: Math.max(4, base) },
          { name: "Build", weeks: Math.max(3, build) },
          { name: "Peak", weeks: Math.max(2, peak) },
        ];
      }
      if (n >= 8) {
        return [
          { name: "Base", weeks: Math.max(3, Math.round(n * 0.45)) },
          { name: "Build", weeks: Math.max(3, Math.round(n * 0.55)) },
        ];
      }
      return [{ name: "Build", weeks: Math.max(4, n) }];
    }
    if (n >= 18) {
      return [
        { name: "Rebuild", weeks: Math.round(n * 0.16) },
        { name: "Base", weeks: Math.round(n * 0.34) },
        { name: "Build", weeks: Math.round(n * 0.28) },
        { name: "Peak", weeks: Math.max(2, n) },
      ];
    }
    if (n >= 12) {
      return [
        { name: "Base", weeks: Math.round(n * 0.42) },
        { name: "Build", weeks: Math.round(n * 0.34) },
        { name: "Peak", weeks: Math.max(2, n) },
      ];
    }
    if (n >= 8) {
      return [
        { name: "Base", weeks: Math.max(3, Math.round(n * 0.45)) },
        { name: "Build", weeks: Math.max(3, n) },
      ];
    }
    return [{ name: "Build", weeks: Math.max(4, n) }];
  }

  // Triathlon: Triathlete/Garmin-style base → build → peak → 8–14 day taper.
  // Inexperienced long-course athletes get a longer base and a shorter build.
  if (sport === "triathlon") {
    const taperW = n >= 10 ? 2 : Math.max(1, Math.min(2, n - 3));
    if (n >= 18) {
      const rebuild = beginnerLong ? Math.round(n * 0.12) : Math.round(n * 0.1);
      const base = beginnerLong ? Math.round(n * 0.38) : advancedLong ? Math.round(n * 0.28) : Math.round(n * 0.34);
      const build = beginnerLong ? Math.round(n * 0.2) : advancedLong ? Math.round(n * 0.28) : Math.round(n * 0.24);
      const peak = Math.max(2, n - rebuild - base - build - taperW);
      return [
        { name: "Rebuild", weeks: Math.max(1, rebuild) },
        { name: "Base", weeks: Math.max(4, base) },
        { name: "Build", weeks: Math.max(3, build) },
        { name: "Peak", weeks: Math.max(2, peak) },
        { name: "Taper", weeks: taperW },
      ];
    }
    if (n >= 12) {
      const base = beginnerLong ? Math.round(n * 0.45) : advancedLong ? Math.round(n * 0.32) : Math.round(n * 0.4);
      const build = beginnerLong ? Math.round(n * 0.22) : advancedLong ? Math.round(n * 0.32) : Math.round(n * 0.28);
      const peak = Math.max(1, n - base - build - taperW);
      return [
        { name: "Base", weeks: Math.max(4, base) },
        { name: "Build", weeks: Math.max(3, build) },
        { name: "Peak", weeks: Math.max(1, peak) },
        { name: "Taper", weeks: taperW },
      ];
    }
    if (n >= 8) {
      return [
        { name: "Base", weeks: Math.max(3, Math.round(n * 0.4)) },
        { name: "Build", weeks: Math.max(2, Math.round(n * 0.35)) },
        { name: "Taper", weeks: Math.max(1, taperW) },
      ];
    }
    return [
      { name: "Build", weeks: Math.max(3, n - 2) },
      { name: "Taper", weeks: Math.max(1, Math.min(2, n - 3)) },
    ];
  }

  if (n >= 18) return [
    { name: "Rebuild", weeks: Math.round(n * 0.16) },
    { name: "Base", weeks: Math.round(n * 0.32) },
    { name: "Build", weeks: Math.round(n * 0.24) },
    { name: "Peak", weeks: Math.max(2, Math.round(n * 0.12)) },
    { name: "Taper", weeks: Math.max(2, n) },
  ];
  if (n >= 12) return [
    { name: "Base", weeks: Math.round(n * 0.4) },
    { name: "Build", weeks: Math.round(n * 0.3) },
    { name: "Peak", weeks: Math.max(1, Math.round(n * 0.12)) },
    { name: "Taper", weeks: Math.max(2, n) },
  ];
  return [
    { name: "Build", weeks: Math.max(3, n - 2) },
    { name: "Taper", weeks: Math.max(2, n) },
  ];
}

function phaseFocus(name, sport, band, fitness) {
  if (sport === "triathlon") {
    const long = band === "half" || band === "full";
    if (name === "Rebuild") return "Ease back in: frequency over duration, technique and strength";
    if (name === "Base") {
      return long
        ? "Aerobic base across swim/bike/run — mostly easy volume, form work, early short bricks"
        : "Build consistency and aerobic endurance across all three sports";
    }
    if (name === "Build") {
      return fitness
        ? "Add quality across swim/bike/run and keep weekly bricks for transition fitness"
        : "Add race-specific intensity, longer key sessions, and weekly bike→run bricks";
    }
    if (name === "Peak") {
      return fitness
        ? "Hold a strong sustainable load; protect recovery weeks"
        : "Highest race-specific load: long bricks, fueling practice, then protect recovery";
    }
    if (name === "Taper") return "Cut volume ~40–60%, keep session frequency and short race-pace reminders";
  }
  if (name === "Taper") return "Freshen up for race week";
  if (name === "Peak") return fitness ? "Highest sustainable load — keep the habit" : "Highest load, then recover";
  if (name === "Build") return "Quality (intervals / cruise / MP) + longer key session";
  if (name === "Rebuild") return "Ease back into training";
  if (name === "Base") return "Aerobic base with light VO₂ intervals and strides";
  return "Consistency and aerobic base";
}

function assignPhases(n, opts = {}) {
  const blocks = phaseBlocks(n, opts);
  const band = opts.sport === "triathlon" ? triDistanceBand(opts.distances) : null;
  const phases = [];
  let used = 0;
  blocks.forEach((b, i) => {
    const remaining = n - used;
    const left = blocks.length - i;
    const len = i === blocks.length - 1 ? remaining : Math.min(remaining - (left - 1), Math.max(1, b.weeks));
    const from = used + 1;
    const to = used + len;
    phases.push({
      name: b.name,
      from,
      to,
      focus: phaseFocus(b.name, opts.sport, band, !!opts.fitness),
    });
    used = to;
  });
  return phases;
}

function weekTargets(n, startKm, peakKm, taperFrom, opts = {}) {
  const sport = opts.sport || "run";
  const fitness = !!opts.fitness;
  // Scientific Triathlon: ~40–60% volume cut into race week for triathlon;
  // keep a steeper early taper drop than a linear cut.
  // Fitness blocks have no race week / taper — volume builds (with cutbacks) to the end.
  const raceFloor = sport === "triathlon"
    ? Math.max(6, Math.round(peakKm * 0.42))
    : Math.max(6, Math.round(startKm * 0.45));
  const taperStartFrac = sport === "triathlon" ? 0.72 : 0.78;
  const taperEndFrac = sport === "triathlon" ? 0.48 : 0.5;
  const buildN = fitness ? n : Math.max(1, taperFrom - 1);
  const out = [];
  for (let i = 1; i <= n; i++) {
    if (!fitness && i === n) {
      out.push(raceFloor);
      continue;
    }
    if (!fitness && i >= taperFrom) {
      const t = (i - taperFrom + 1) / Math.max(1, n - taperFrom);
      // Fast early decay, then flatter — approximate exponential taper shape.
      const decay = 1 - Math.exp(-2.2 * t);
      const frac = taperStartFrac - decay * (taperStartFrac - taperEndFrac);
      out.push(Math.round(peakKm * frac));
      continue;
    }
    const t = (i - 1) / Math.max(1, buildN - 1);
    let km = Math.round(startKm + (peakKm - startKm) * t);
    if (i % 4 === 0 && (fitness || i < taperFrom)) km = Math.round(km * 0.82);
    out.push(Math.max(startKm, km));
  }
  return out;
}

function swimLabel(sport, phase, swimM) {
  if (sport === "run" || sport === "bike" || sport === "duathlon" || sport === "ski") return "—";
  if (sport === "swim") return `${Math.max(1, Math.round((swimM || 1500) / 800))} sessions`;
  if (sport === "aquathlon") {
    if (phase === "Taper") return "2×25–35' (keep feel)";
    if (phase === "Peak" || phase === "Build") return "2–3×30–45' + swim→run brick";
    return "2×30–40' technique + endurance";
  }
  // Triathlon: keep swim frequency (~3×) even in taper; shorten duration.
  if (phase === "Taper") return "2–3×25–35' (keep feel)";
  if (phase === "Peak") return swimM >= 3000 ? "3×45–60'" : "3×40–50'";
  if (phase === "Build") return swimM >= 1700 ? "3×40–50'" : "2–3×35–45'";
  if (phase === "Rebuild") return "2×30–40' technique";
  return swimM >= 1700 ? "3×35–45' technique + endurance" : "2–3×30–40'";
}

function bikeLabel(sport, phase, bikeKm) {
  if (sport === "run" || sport === "swim" || sport === "aquathlon") return "—";
  if (sport === "bike") return phase === "Taper" ? "Easy spin" : "Key ride + easy";
  if (sport === "duathlon") {
    if (phase === "Taper") return "2×30–50' spin + short race-pace opens";
    if (phase === "Peak") return "Long 75–120' + mid-week quality + R-B-R brick";
    if (phase === "Build") return "Long 60–90' + steady quality + weekly brick";
    return "45–75' easy aerobic · introduce short bricks";
  }
  if (phase === "Taper") return "2×30–50' spin + short race-pace opens";
  if (phase === "Peak") {
    if (bikeKm >= 160) return "Long 3–5 h + mid-week quality";
    if (bikeKm >= 80) return "Long 2–3.5 h + mid-week quality";
    return "Long 75–120' + mid-week quality";
  }
  if (phase === "Build") {
    if (bikeKm >= 160) return "Long 2.5–4 h + tempo/sweet-spot";
    if (bikeKm >= 80) return "Long 90–180' + tempo work";
    return "Long 60–90' + steady quality";
  }
  if (phase === "Rebuild") return "Easy aerobic rides, build frequency";
  if (bikeKm >= 160) return "2–4 h easy aerobic";
  if (bikeKm >= 80) return "90–150' easy aerobic";
  return "45–75' easy aerobic";
}

function brickLabel(phase, band, wk) {
  if (phase === "Taper") return "Short brick · easy bike + 8–12' T2 run";
  if (phase === "Peak") {
    if (band === "full") return "Race-sim brick · long ride + 25–40' run";
    if (band === "half") return "Race-sim brick · 2–3 h bike + 20–35' run";
    return "Brick · 60–90' bike + 15–25' run";
  }
  if (phase === "Build") {
    if (band === "half" || band === "full") return "Brick · 75–120' bike + 15–25' easy run";
    return "Brick · 45–75' bike + 10–20' run";
  }
  // Base / Rebuild: infrequent short bricks
  if (wk % 2 === 0) return "Easy brick · 45–75' bike + 10–15' run";
  return null;
}

/** Duathlon key session: run → bike → run (practise the second run off the bike). */
function duathlonBrickLabel(phase, distances = {}, wk = 1) {
  const run1 = Number(distances.run) || 10;
  const bike = Number(distances.bike) || 40;
  const run2 = Number(distances.run2) || Math.max(2.5, Math.round(run1 * 0.5 * 10) / 10);
  const short = run1 <= 6 && bike <= 25;
  if (phase === "Taper") return "Short brick · easy bike 30–40' + 8–12' T2 run";
  if (phase === "Peak") {
    return short
      ? `Race-sim R-B-R · ~${fmtKmLabel(run1 * 0.8)} run + ${fmtKmLabel(bike * 0.75)} km bike + ${fmtKmLabel(run2)} run`
      : `Race-sim R-B-R · ~30' run + 90' bike + 20–30' run`;
  }
  if (phase === "Build") {
    return short
      ? "Brick · 15–20' run + 45–60' bike + 10–15' run"
      : "Brick · 20–30' run + 60–90' bike + 15–25' run";
  }
  if (wk % 2 === 0) return "Easy brick · 15' run + 40–60' bike + 10' run";
  return null;
}

/** Aquathlon key session: swim → run (transition off the water). */
function aquathlonBrickLabel(phase, distances = {}, wk = 1) {
  const swimM = Number(distances.swim) || 750;
  const runKm = Number(distances.run) || 5;
  if (phase === "Taper") return "Short brick · easy swim feel + 1–2 km easy run";
  if (phase === "Peak") {
    return `Race-sim swim→run · ~${Math.round(swimM * 0.9)} m + ${fmtKmLabel(Math.min(runKm, Math.max(2, runKm * 0.6)))} km run`;
  }
  if (phase === "Build") {
    return swimM >= 1500
      ? "Brick · 1000–1500 m swim + 3–5 km run-off"
      : "Brick · 600–800 m race-pace swim + 2–3 km run";
  }
  if (wk % 2 === 0) return "Easy brick · short swim + 1–2 km easy run-off";
  return null;
}

function swimSetLabel(phase, n, band) {
  if (phase === "Taper") {
    return n === 0
      ? "Swim · WU + short race-pace opens + CD"
      : "Swim · technique feel · keep it short";
  }
  if (phase === "Build" || phase === "Peak") {
    if (n === 0) return "Swim · WU drills + aerobic main + CD";
    if (band === "half" || band === "full") {
      return n === 1
        ? "Swim · WU + race-pace 100s / CSS sets + CD"
        : "Swim · endurance continuous + form CD";
    }
    return "Swim · WU + threshold / pace sets + CD";
  }
  return n === 0
    ? "Swim · WU drills + easy endurance + CD"
    : "Swim · technique focus (catch / glide) + easy";
}

function bikeSessionLabel(sport, phase, band, isKey, distances) {
  if (phase === "Taper") return isKey ? "Easy spin + short race-pace opens" : "Recovery spin · RPE 2–3";
  if (phase === "Build" || phase === "Peak") {
    if (isKey) {
      if (band === "full" || band === "half") {
        return "Long aerobic / race-pace ride · power Z2–Z3 or RPE 4–6";
      }
      return "Key ride · steady / sweet-spot · power or RPE 5–6";
    }
    return "Steady / sweet-spot · ~65–80% FTP or RPE 4–5";
  }
  return isKey
    ? bikeLabel(sport, phase, distances.bike)
    : "Easy aerobic ride · Z2 / RPE 3 · 85–95 rpm";
}

function qualitySessionSpec(phase, weekNum, qualityKm) {
  const km = fmtKmLabel(qualityKm);
  const cutback = weekNum % 4 === 0;
  if (phase === "Base") {
    // Introduce VO₂ early; keep cutbacks as strides only.
    if (cutback) return { kind: "run", label: `Run ${km} easy + 6×20s strides`, km: qualityKm };
    const rot = weekNum % 3;
    if (rot === 1) return { kind: "quality", label: `Run ~${km} · 8×200m @ interval`, km: qualityKm };
    if (rot === 2) return { kind: "quality", label: `Run ~${km} · 6×400m @ interval`, km: qualityKm };
    return { kind: "quality", label: `Run ~${km} · 5×3' @ interval`, km: qualityKm };
  }
  if (phase === "Build") {
    if (cutback) return { kind: "run", label: `Run ${km} easy + strides`, km: qualityKm };
    const rot = weekNum % 3;
    if (rot === 0) return { kind: "quality", label: `Run ~${km} · 5×1000m @ interval`, km: qualityKm };
    if (rot === 1) return { kind: "quality", label: `Run ~${km} · cruise 5×6'`, km: qualityKm };
    return { kind: "quality", label: `Run ~${km} · 3×2 km @ MP`, km: qualityKm };
  }
  if (phase === "Peak") {
    const rot = weekNum % 3;
    if (rot === 0) return { kind: "quality", label: `Run ~${km} · 4×1000m @ interval`, km: qualityKm };
    if (rot === 1) return { kind: "quality", label: `Run ~${km} · cruise 4×6'`, km: qualityKm };
    return { kind: "quality", label: `Run ~${km} sharp · short MP + strides`, km: qualityKm };
  }
  return { kind: "quality", label: `Quality ${km}`, km: qualityKm };
}

function midweekRunCap(longKm, raceKm = 0) {
  const long = Math.max(0, Number(longKm) || 0);
  // Keep midweek work clearly shorter than the long (~60%).
  let cap = long > 0 ? Math.max(3, Math.floor(long * 0.6)) : 40;
  const race = Math.max(0, Number(raceKm) || 0);
  // For races through half, midweek easies are typically ~half of race distance
  // (Higdon 10-mile midweek runs are often 5–8 km), never near race distance.
  if (race > 0 && race <= 21.2) {
    cap = Math.min(cap, Math.max(3, Math.floor(race * 0.55)));
  }
  return cap;
}

function splitRunKm(total, longKm, hasQuality, nDays, phase = "Build", opts = {}) {
  const long = Math.max(0, Number(longKm) || 0);
  const rest = Math.max(0, (Number(total) || 0) - long);
  const qualityDays = hasQuality && nDays >= 3 ? 1 : 0;
  const share = phase === "Base" ? 0.28 : 0.35;
  let quality = qualityDays ? Math.max(phase === "Base" ? 5 : 4, Math.round(rest * share)) : 0;
  const midCap = midweekRunCap(long, opts.raceKm);
  if (quality) quality = Math.min(quality, midCap);
  const easyCount = Math.max(1, nDays - 1 - qualityDays);
  let left = Math.max(0, rest - quality);
  const easies = [];
  for (let i = 0; i < easyCount; i++) {
    const remaining = easyCount - i;
    let take = i === easyCount - 1 ? left : Math.max(3, Math.round(left / remaining));
    take = Math.min(take, midCap, left);
    // Prefer dropping leftover volume over inventing another near-race easy day.
    if (take < 3 && left >= 3) take = Math.min(3, midCap, left);
    easies.push(take);
    left = Math.max(0, left - take);
  }
  return { easies, quality, longKm: long };
}

function runDaySlots(nDays) {
  const extras = [0, 2, 3, 1, 6];
  const days = [5];
  const need = Math.max(2, Math.min(6, nDays)) - 1;
  for (let i = 0; i < need && i < extras.length; i++) days.push(extras[i]);
  return days.sort((a, b) => a - b);
}

function normalizeWeekdays(list, fallback = []) {
  const parts = Array.isArray(list)
    ? list
    : String(list ?? "").split(",");
  const raw = parts
    .map((x) => (typeof x === "string" ? x.trim() : x))
    .filter((x) => x !== "" && x != null)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  const uniq = [...new Set(raw)].sort((a, b) => a - b);
  return uniq.length ? uniq : fallback.slice();
}

window.defaultTrainingBlocks = function defaultTrainingBlocks(sport, recDays, wantStrength, busyDays = []) {
  const busy = new Set(normalizeWeekdays(busyDays, []));
  const free = (days) => days.filter((d) => !busy.has(d));
  const n = Math.max(2, Math.min(6, Number(recDays) || 3));
  const run = free((sport === "run" || sport === "triathlon") ? runDaySlots(n) : []);
  const strength = wantStrength && run.length ? free([run.includes(0) ? 0 : run[0]]) : [];
  // Triathlon week template (Triathlete 20-week / ~15-55-30 time split):
  // ~3 swim (frequency for technique), 2–3 bike (volume on the bike), run days as chosen.
  // Prefer Tue/Thu/Sat swim and Wed + weekend bike so hard sessions are spaced.
  let swim = [];
  let bike = [];
  if (sport === "triathlon") {
    // Prefer swim frequency (~3×/week). Doubling with an easy run is normal; avoid the long-run day when possible.
    const longRun = run.includes(5) ? 5 : (run[run.length - 1] ?? null);
    const swimPrefer = [1, 3, 4, 2, 0].filter((i) => i !== longRun);
    swim = free(swimPrefer).slice(0, 3);
    if (swim.length < 3) {
      const more = free([0, 1, 2, 3, 4, 6]).filter((d) => !swim.includes(d) && d !== longRun);
      swim = [...swim, ...more].slice(0, 3);
    }
    // Weekend long bike is the key endurance session; same-day swim/run is fine for bricks.
    const longBikeDay = free([6, 0]).find((d) => d != null) ?? free([4, 3, 2])[0];
    const midBike = free([2, 3, 1, 4]).find((d) => d !== longBikeDay && !run.includes(d))
      ?? free([2, 3, 1, 4]).find((d) => d !== longBikeDay);
    bike = [...new Set([longBikeDay, midBike].filter((d) => d != null))];
    // Optional third easy spin if the athlete has room (higher run-day athletes).
    if (n >= 5) {
      const extra = free([0, 1, 2, 3, 4]).find((d) => !bike.includes(d) && !run.includes(d) && !swim.includes(d));
      if (extra != null) bike.push(extra);
    }
  } else if (sport === "duathlon") {
    // Run-heavy (~45% time) + weekly R-B-R brick: 2–3 bike days, no swim.
    const longBikeDay = free([6, 0]).find((d) => d != null) ?? free([4, 3, 2])[0];
    const midBike = free([2, 3, 1, 4]).find((d) => d !== longBikeDay && !run.includes(d))
      ?? free([2, 3, 1, 4]).find((d) => d !== longBikeDay);
    bike = [...new Set([longBikeDay, midBike].filter((d) => d != null))];
    if (n >= 4) {
      const extra = free([0, 1, 2, 3, 4]).find((d) => !bike.includes(d) && !run.includes(d));
      if (extra != null) bike.push(extra);
    }
  } else if (sport === "aquathlon") {
    // Don't copy a triathlon week: ~2 swims + 3–4 runs, swim→run brick on a swim day.
    const longRun = run.includes(5) ? 5 : (run[run.length - 1] ?? null);
    const swimPrefer = [1, 3, 2, 4, 0].filter((i) => i !== longRun);
    swim = free(swimPrefer).slice(0, 2);
    if (swim.length < 2) {
      const more = free([0, 1, 2, 3, 4]).filter((d) => !swim.includes(d) && d !== longRun);
      swim = [...swim, ...more].slice(0, 2);
    }
  } else if (sport === "swim") {
    swim = free([0, 2, 5]);
  } else if (sport === "bike") {
    bike = free([0, 2, 5]);
  }
  const long = run.includes(5) ? 5 : (run.length ? run[run.length - 1] : null);
  return { run, strength, swim, bike, busy: [...busy].sort((a, b) => a - b), long };
};

window.trainingOverlapNotes = function trainingOverlapNotes(sport, blocks) {
  const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const warns = [];
  const info = [];
  const run = blocks.run || [];
  const strength = blocks.strength || [];
  const swim = blocks.swim || [];
  const bike = blocks.bike || [];
  for (let i = 0; i < 7; i++) {
    const types = [
      run.includes(i) && "run",
      strength.includes(i) && "strength",
      swim.includes(i) && "swim",
      bike.includes(i) && "bike",
    ].filter(Boolean);
    if (types.length < 2) continue;
    const label = types.join(" + ");
    if (types.includes("strength") && run.includes(i) && i === 5) {
      warns.push(`${names[i]}: strength on the long-run day is hard to recover from. Move it to an easier run day.`);
    } else if (types.length >= 3) {
      warns.push(`${names[i]}: ${label} is a lot for one day. Fine now and then, not as the default week.`);
    } else if (types.includes("run") && types.includes("strength")) {
      info.push(`${names[i]}: strength after the easy run is a good pairing.`);
    } else if (sport === "triathlon" || sport === "duathlon" || sport === "aquathlon") {
      info.push(`${names[i]}: ${label} on the same day is normal multi-sport work. Keep the second session easy.`);
    } else {
      info.push(`${names[i]}: ${label} on the same day is fine if one of them stays easy.`);
    }
  }
  if (run.includes(4) && run.includes(5)) {
    warns.push("Friday and Saturday are both run days. An easy or rest Friday usually protects the long run.");
  }
  return { warns, info };
};

window.inferSportFromEvent = function inferSportFromEvent(ev) {
  if (!ev) return "run";
  const listed = String(ev.sport || "").toLowerCase();
  if (EVENT_PRESETS[listed]) return listed;
  const swim = Number(ev.swim_m || 0);
  const bike = Number(ev.bike_km || 0);
  const run = Number(ev.run_km || ev.km || 0);
  const name = String(ev.name || "").toLowerCase();
  if ((swim > 0 && bike > 0) || /triathlon|tri\b|70\.3|ironman|kwart|halve|volledige/.test(name)) return "triathlon";
  if (/duathlon|dua\b/.test(name)) return "duathlon";
  if (/aquathlon|aqua\b/.test(name) || (swim > 0 && run > 0 && !(bike > 0))) return "aquathlon";
  if (swim > 0 || /\bswim|zwem/.test(name)) return "swim";
  if ((bike > 0 && !(run > 0)) || /\bcycl|bike|wieler|rit\b/.test(name)) return "bike";
  return "run";
};

window.inferPresetFromEvent = function inferPresetFromEvent(sport, ev) {
  const presets = EVENT_PRESETS[sport] || [];
  const run = Number(ev.run_km || ev.km || 0);
  const swim = Number(ev.swim_m || 0);
  const bike = Number(ev.bike_km || 0);
  const match = presets.find((p) => p.id !== "custom"
    && (p.run == null || Math.abs((p.run || 0) - run) < 0.3)
    && (p.swim == null || Math.abs((p.swim || 0) - swim) < 20)
    && (p.bike == null || Math.abs((p.bike || 0) - bike) < 1));
  return match ? match.id : (presets.some((p) => p.id === "custom") ? "custom" : "");
};

// Sport-specific weekly volume → experience. Cycling 50 km/week is still beginner;
// swimming uses km of swimming (e.g. 2 km/week beginner, 6+ advanced).
window.experienceFromWeeklyKm = function experienceFromWeeklyKm(km, sport = "run") {
  const n = Number(km);
  if (!(n > 0)) return "intermediate";
  if (sport === "bike") {
    if (n < 100) return "beginner";
    if (n < 180) return "intermediate";
    return "advanced";
  }
  if (sport === "swim") {
    if (n < 3) return "beginner";
    if (n < 6) return "intermediate";
    return "advanced";
  }
  if (sport === "ski") {
    if (n < 80) return "beginner";
    if (n < 150) return "intermediate";
    return "advanced";
  }
  // run + walk + triathlon / duathlon / aquathlon (run leg volume)
  if (n < 25) return "beginner";
  if (n < 50) return "intermediate";
  return "advanced";
};

window.experienceThresholds = function experienceThresholds(sport = "run") {
  if (sport === "bike" || sport === "ski") {
    return {
      beginner: sport === "ski" ? 80 : 100,
      intermediate: sport === "ski" ? 150 : 180,
      unit: sport === "ski" ? "km/week on skis" : "km/week on the bike",
    };
  }
  if (sport === "swim") return { beginner: 3, intermediate: 6, unit: "km/week in the pool" };
  if (sport === "walk") return { beginner: 20, intermediate: 40, unit: "km/week of walking" };
  return { beginner: 25, intermediate: 50, unit: "km/week of running" };
};

window.needsDedicatedLongDay = function needsDedicatedLongDay(sport, presetId, custom) {
  if (!presetId || !(sport === "run" || sport === "walk" || sport === "triathlon"
    || sport === "duathlon" || sport === "aquathlon")) return false;
  try {
    const d = resolveDistances(sport, presetId, custom || {});
    const runLoad = (d.run || 0) + (d.run2 || 0);
    return runLoad >= 16 || (d.run || 0) >= 16;
  } catch {
    return false;
  }
};

window.eventReachability = function eventReachability({
  sport,
  presetId,
  custom,
  weeklyKm,
  eventDate,
  goalType,
} = {}) {
  if (goalType === "fitness" || !presetId) return { level: "ok", message: "", requireAck: true };
  let distances;
  try {
    distances = resolveDistances(sport, presetId, custom || {});
  } catch {
    return { level: "ok", message: "", requireAck: true };
  }
  const weekly = Number(weeklyKm);
  if (!(weekly > 0)) return { level: "ok", message: "", requireAck: true };

  const today = new Date();
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const race = eventDate ? pgParse(eventDate) : null;
  const weeks = race && !Number.isNaN(race.getTime())
    ? Math.max(1, Math.floor(pgDays(pgMonday(todayDate), pgMonday(race)) / 7) + 1)
    : null;

  const runKm = distances.run || 0;
  const bikeKm = distances.bike || 0;
  const swimM = distances.swim || 0;
  let level = "ok";
  let message = "";
  let minWeekly = null;

  if (sport === "run" || sport === "triathlon" || sport === "duathlon" || sport === "aquathlon") {
    if (runKm >= 42) {
      minWeekly = 35;
      if (weekly < 25 || (weeks != null && weeks < 12 && weekly < 40)) level = "hard";
      else if (weekly < 35) level = "warn";
      message = level === "hard"
        ? `A marathon-distance event from about ${weekly} km/week is a big jump${weeks != null ? ` with only ~${weeks} weeks` : ""}. Most plans want at least ~${minWeekly} km/week already, and enough time to build.`
        : `Marathon distance from ${weekly} km/week is ambitious. Aim to build toward at least ~${minWeekly} km/week before race day.`;
    } else if (runKm >= 21) {
      minWeekly = 25;
      if (weekly < 15 || (weeks != null && weeks < 8 && weekly < 25)) level = "hard";
      else if (weekly < 22) level = "warn";
      message = level === "hard"
        ? `A half-marathon / 70.3 run leg from about ${weekly} km/week is tough${weeks != null ? ` in ~${weeks} weeks` : ""}. A safer base is closer to ${minWeekly} km/week.`
        : `Half-marathon distance from ${weekly} km/week needs steady building. Plan for at least ~${minWeekly} km/week near peak.`;
    } else if (runKm >= 16) {
      minWeekly = 20;
      if (weekly < 12) level = "warn";
      message = `A 10-mile race from ${weekly} km/week is doable if you build carefully toward ~${minWeekly} km/week.`;
    } else if (runKm >= 10 && weekly < 10) {
      level = "warn";
      minWeekly = 15;
      message = `A 10K from ${weekly} km/week is still reachable, but keep most running easy and build toward ~${minWeekly} km/week.`;
    }
  } else if (sport === "bike") {
    if (bikeKm >= 180) {
      minWeekly = 150;
      if (weekly < 80) level = "hard";
      else if (weekly < 120) level = "warn";
      message = `A ${bikeKm} km ride from ${weekly} km/week on the bike is ${level === "hard" ? "a very large jump" : "ambitious"}. Many riders sit near ${minWeekly}+ km/week before that distance.`;
    } else if (bikeKm >= 90) {
      minWeekly = 80;
      if (weekly < 40) level = "hard";
      else if (weekly < 60) level = "warn";
      message = `A ${bikeKm} km target from ${weekly} km/week needs a solid long-ride progression. Aim toward ~${minWeekly} km/week.`;
    }
  } else if (sport === "swim") {
    if (swimM >= 5000) {
      minWeekly = 6;
      if (weekly < 3) level = "hard";
      else if (weekly < 5) level = "warn";
      message = `A ${swimM / 1000} km swim from ${weekly} km/week is demanding. Build toward ~${minWeekly} km/week in the water.`;
    } else if (swimM >= 1900 && weekly < 2) {
      level = "warn";
      minWeekly = 3;
      message = `Open-water race distance from ${weekly} km/week is a stretch — build consistency toward ~${minWeekly} km/week.`;
    }
  }

  if (sport === "triathlon" && (bikeKm >= 90 || swimM >= 1900)) {
    if (level === "ok" && weekly < 30) {
      level = "warn";
      message = `Multi-sport volume from ${weekly} km/week of running is light for a 70.3+. Research-based weeks often land near ~10–12+ total hours (roughly 15% swim / 55% bike / 30% run by time), so expect more load than the run number alone.`;
    } else if (level === "ok" && weeks != null && weeks < 16 && weekly < 35) {
      level = "warn";
      message = `A 70.3+ in ~${weeks} weeks from ${weekly} km/week run volume is tight. Many first-timer plans use 16–20 weeks with a long aerobic base before race-specific work.`;
    }
  }

  return {
    level,
    message: level === "ok" ? "" : message,
    minWeekly,
    requireAck: true,
  };
};

// Display-only km text (same as Garmin): keep full-precision values in day[2].
const fmtKmLabel = (n) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return String(n ?? "");
  return String(Number(x.toFixed(2)));
};

function daysFor(sport, phase, km, longKm, raceDay, isRaceWeek, distances, opts = {}) {
  const nDays = Math.max(2, Math.min(6, Number(opts.runDays) || 3));
  const wantStrength = !!opts.strength;
  // Base gets lighter VO₂ / interval quality; Build/Peak mix intervals, cruise and MP.
  const hasQuality = ["Base", "Build", "Peak"].includes(phase) && !isRaceWeek;
  const days = Array.from({ length: 7 }, () => ["rest", "Rest"]);

  const set = (i, kind, label, run) => { days[i] = run != null ? [kind, label, run] : [kind, label]; };

  if (isRaceWeek) {
    const name = distances.label || "Race";
    if (sport === "swim") set(raceDay, "race", `${name} ${distances.swim} m`);
    else if (sport === "bike" || sport === "ski") {
      set(raceDay, "race", `${name} ${fmtKmLabel(distances.bike)} km`);
    } else if (sport === "triathlon" || sport === "duathlon" || sport === "aquathlon") {
      set(raceDay, "race", `${name}`, distances.run);
    } else set(raceDay, "race", `${name} ${fmtKmLabel(distances.run)} km`, distances.run);

    if (sport === "triathlon" || sport === "duathlon" || sport === "aquathlon") {
      const used = new Set([raceDay]);
      // Closest day before race: bag check. If only one day exists (e.g. Tue race),
      // fold a tiny transition opener into that day.
      if (raceDay === 1) {
        if (sport === "aquathlon") set(0, "brick", "Mini swim→run · short feel + 8' run · bag check");
        else set(0, "brick", "Mini T2 · 20–30' easy bike + 8' run · bag check");
        used.add(0);
      } else if (raceDay > 1) {
        const preRace = sport === "aquathlon"
          ? [
            [raceDay - 1, ["rest", "Rest · bag check / early night"]],
            [raceDay - 2, ["brick", "Mini swim→run · short feel + 8–12' run"]],
            [raceDay - 3, ["swim", "Swim · short feel + 4–6 × race-pace 50s"]],
            [raceDay - 4, ["run", "Shakeout 4–5 easy + strides", 5]],
          ]
          : sport === "duathlon"
            ? [
              [raceDay - 1, ["rest", "Rest · bag check / early night"]],
              [raceDay - 2, ["brick", "Mini T2 brick · 20–30' easy bike + 8–12' run"]],
              [raceDay - 3, ["bike", "Easy spin 30–40' · RPE 2–3"]],
              [raceDay - 4, ["run", "Shakeout 4–5 easy + strides", 5]],
            ]
            : [
              [raceDay - 1, ["rest", "Rest · bag check / early night"]],
              [raceDay - 2, ["brick", "Mini T2 brick · 20–30' easy bike + 8–12' run"]],
              [raceDay - 3, ["swim", "Swim · short feel + 4–6 × race-pace 50s"]],
              [raceDay - 4, ["run", "Shakeout 4–5 easy + strides", 5]],
            ];
        for (const [i, day] of preRace) {
          if (i < 0 || used.has(i)) continue;
          set(i, day[0], day[1], day[2]);
          used.add(i);
        }
      }
      for (let i = 0; i < 7; i++) {
        if (used.has(i)) continue;
        if (i < raceDay && i % 2 === 0) {
          if (sport === "aquathlon") set(i, "swim", "Easy swim 20–30' · feel");
          else set(i, "bike", "Easy spin 30–40' · RPE 2–3");
        } else set(i, "rest", "Rest");
      }
    } else {
      const foot = sport === "run" || sport === "walk";
      const kindEasy = sport === "walk" ? "walk" : "run";
      for (let i = 0; i < 7; i++) {
        if (i === raceDay) continue;
        if (i === Math.max(0, raceDay - 3) && foot) {
          set(i, kindEasy, sport === "walk" ? "Easy walk 4–6" : "Shakeout 4–6 easy", 5);
        } else if (i < raceDay && foot && i % 2 === 0) {
          set(i, kindEasy, sport === "walk" ? "Easy walk 4–5" : "Easy 4–5", 4);
        } else {
          set(i, "rest", i === raceDay - 1 ? "Rest / 20' shakeout" : "Rest");
        }
      }
    }
    return days;
  }

  if (sport === "swim") {
    set(0, "swim", `Swim ${Math.max(0.6, (km * 0.3)).toFixed(1)} km`);
    set(2, "swim", `Swim ${Math.max(0.6, (km * 0.3)).toFixed(1)} km`);
    set(5, "swim", `Long swim ${fmtKmLabel(longKm)} km`);
    if (km > longKm + 2) set(3, "swim", "Technique + easy");
    return days;
  }

  if (sport === "bike" || sport === "ski") {
    const easy = sport === "ski" ? "Easy ski 45–60'" : "Easy spin 45–60'";
    const quality = sport === "ski" ? "Quality ski session" : "Quality ride";
    const steady = sport === "ski" ? "Steady ski" : "Steady ride";
    const longLabel = sport === "ski"
      ? `Long ski ~${fmtKmLabel(longKm)} km`
      : `Long ride ~${fmtKmLabel(longKm)} km`;
    const recovery = sport === "ski" ? "Easy recovery ski" : "Easy recovery spin";
    const kind = sport === "ski" ? "ski" : "bike";
    set(0, kind, easy);
    set(2, kind, hasQuality ? quality : steady);
    set(5, kind, longLabel);
    if (km > 40) set(3, kind, recovery);
    return days;
  }

  if (sport === "walk") {
    const busySetWalk = new Set(normalizeWeekdays(opts.busyWeekdays, []));
    const freeWalk = (list, fallback) => normalizeWeekdays(list, fallback).filter((d) => !busySetWalk.has(d));
    const walkIdx = freeWalk(opts.runWeekdays, runDaySlots(nDays));
    const preferredLongW = Number.isInteger(Number(opts.longWeekday)) ? Number(opts.longWeekday) : null;
    const longIdxW = preferredLongW != null && walkIdx.includes(preferredLongW)
      ? preferredLongW
      : (walkIdx.includes(5) ? 5 : (walkIdx[walkIdx.length - 1] ?? 5));
    const easyIdxW = walkIdx.filter((i) => i !== longIdxW);
    const splitW = splitRunKm(km, longKm, false, walkIdx.length, phase, {
      raceKm: distances.run || 0,
    });
    easyIdxW.forEach((i, n) => {
      const easyKm = Math.max(3, splitW.easies[n] || 4);
      set(i, "walk", `Walk ${fmtKmLabel(easyKm)} easy`, easyKm);
    });
    set(longIdxW, "long", `Long walk ${fmtKmLabel(longKm)}`, longKm);
    return days;
  }

  const busySet = new Set(normalizeWeekdays(opts.busyWeekdays, []));
  const freeDays = (list, fallback) => normalizeWeekdays(list, fallback).filter((d) => !busySet.has(d));
  const runIdx = freeDays(opts.runWeekdays, runDaySlots(nDays));
  const preferredLong = Number.isInteger(Number(opts.longWeekday)) ? Number(opts.longWeekday) : null;
  const longIdx = preferredLong != null && runIdx.includes(preferredLong)
    ? preferredLong
    : (runIdx.includes(5) ? 5 : (runIdx[runIdx.length - 1] ?? 5));
  const qualityIdx = hasQuality
    ? (runIdx.includes(2) && 2 !== longIdx ? 2 : runIdx.find((i) => i !== longIdx && i !== 0))
    : null;
  const easyIdx = runIdx.filter((i) => i !== longIdx && i !== qualityIdx);
  const split = splitRunKm(km, longKm, !!qualityIdx, runIdx.length, phase, {
    raceKm: distances.run || 0,
  });
  const strengthDays = wantStrength
    ? freeDays(opts.strengthWeekdays, [easyIdx.includes(0) ? 0 : (easyIdx[0] ?? runIdx[0] ?? 0)])
    : [];
  const swimDays = freeDays(
    opts.swimWeekdays,
    sport === "swim" ? [0, 2, 5]
      : sport === "triathlon"
        ? [1, 3, 5].filter((i) => !runIdx.includes(i)).concat([1, 2, 3, 4].filter((i) => !runIdx.includes(i))).filter((v, i, a) => a.indexOf(v) === i).slice(0, 3)
        : sport === "aquathlon"
          ? [1, 3].filter((i) => !runIdx.includes(i)).concat([2, 4, 0].filter((i) => !runIdx.includes(i))).filter((v, i, a) => a.indexOf(v) === i).slice(0, 2)
          : []
  );
  const bikeDays = freeDays(
    opts.bikeWeekdays,
    sport === "bike" ? [0, 2, 5]
      : sport === "triathlon" || sport === "duathlon"
        ? [6, 2].filter((i, idx, arr) => arr.indexOf(i) === idx)
        : []
  );

  const addOn = (i, extra) => {
    const [kind, label, run] = days[i];
    if (kind === "rest") set(i, extra.kind, extra.label, extra.km);
    else {
      const addLabel = extra.detail || extra.short;
      days[i] = [kind, `${label} + ${addLabel}`, run];
    }
  };

  if (!runIdx.includes(4) && !swimDays.includes(4) && !bikeDays.includes(4)) set(4, "rest", "Rest");

  easyIdx.forEach((i, n) => {
    const easyKm = Math.max(3, split.easies[n] || 4);
    set(i, "run", `Run ${fmtKmLabel(easyKm)} easy`, easyKm);
  });
  if (qualityIdx != null && split.quality) {
    const q = qualitySessionSpec(phase, Number(opts.weekNum) || 1, split.quality);
    set(qualityIdx, q.kind, q.label, q.km);
  }
  if (longIdx != null) set(longIdx, "long", `Long ${fmtKmLabel(longKm)} easy`, longKm);

  const band = sport === "triathlon" ? triDistanceBand(distances) : null;
  const wk = Number(opts.weekNum) || 1;
  const brick = sport === "triathlon" ? brickLabel(phase, band, wk)
    : sport === "duathlon" ? duathlonBrickLabel(phase, distances, wk)
      : sport === "aquathlon" ? aquathlonBrickLabel(phase, distances, wk)
        : null;
  // Prefer attaching the brick to the longest bike day (usually weekend).
  const brickBikeDay = bikeDays.length
    ? (bikeDays.includes(6) ? 6 : bikeDays.includes(0) ? 0 : bikeDays[bikeDays.length - 1])
    : null;
  // Aquathlon: attach swim→run brick to a swim day (not the long-run day).
  const brickSwimDay = swimDays.length
    ? (swimDays.find((d) => d !== longIdx) ?? swimDays[0])
    : null;

  swimDays.forEach((i, n) => {
    const isAquaBrick = !!(sport === "aquathlon" && brick && i === brickSwimDay);
    if (isAquaBrick) {
      const [kind, label, run] = days[i];
      if (kind === "rest") set(i, "brick", brick);
      else days[i] = ["brick", `${label} · ${brick}`, run];
      return;
    }
    const label = sport === "triathlon" || sport === "swim" || sport === "aquathlon"
      ? swimSetLabel(phase, n, band)
      : (phase === "Taper" ? "Swim: short technique + feel" : "Swim technique + easy endurance");
    addOn(i, { kind: "swim", label, short: "swim", km: undefined });
  });
  bikeDays.forEach((i, n) => {
    const isBrickDay = !!((sport === "triathlon" || sport === "duathlon") && brick && i === brickBikeDay);
    const isKey = isBrickDay || n === bikeDays.length - 1;
    if (isBrickDay) {
      const [kind, label, run] = days[i];
      if (kind === "rest") set(i, "brick", brick);
      else days[i] = ["brick", `${label} · ${brick}`, run];
      return;
    }
    const label = bikeSessionLabel(sport, phase, band, isKey, distances);
    addOn(i, {
      kind: "bike",
      label,
      short: "bike",
      detail: isKey ? label : (sport === "triathlon" || sport === "duathlon" || sport === "bike" ? label : "bike"),
      km: undefined,
    });
  });
  strengthDays.forEach((i) => {
    addOn(i, { kind: days[i][0] === "rest" ? "run" : days[i][0], label: "Strength", short: "strength", km: days[i][2] });
  });
  return days;
}

const EXPERIENCE_LEVELS = ["beginner", "intermediate", "advanced"];

window.trainingAdvice = function trainingAdvice(sport, presetId, custom, experience) {
  let distances = { run: 0, bike: 0, swim: 0 };
  if (presetId) {
    try { distances = resolveDistances(sport, presetId, custom || {}); } catch { /* keep zeros */ }
  }
  const runKm = (distances.run || 0) + (distances.run2 || 0);
  const isRunSport = sport === "run" || sport === "triathlon"
    || sport === "duathlon" || sport === "aquathlon";
  const level = EXPERIENCE_LEVELS.includes(experience) ? experience : "intermediate";
  let minDays = 3, recDays = 3, event = "this event";
  if (sport === "duathlon") {
    event = runKm >= 12 ? "a standard duathlon" : "a sprint duathlon";
    if (level === "beginner") { minDays = 3; recDays = 3; }
    else if (level === "advanced") { minDays = 4; recDays = 4; }
    else { minDays = 3; recDays = 4; }
  } else if (sport === "aquathlon") {
    event = "an aquathlon";
    minDays = 3;
    recDays = level === "advanced" ? 4 : 3;
  } else if (sport === "triathlon") {
    const band = triDistanceBand(distances);
    if (band === "full" || presetId === "volledige") {
      event = "a full-distance triathlon";
      if (level === "beginner") { minDays = 3; recDays = 4; }
      else if (level === "advanced") { minDays = 4; recDays = 5; }
      else { minDays = 3; recDays = 4; }
    } else if (band === "half" || presetId === "halve") {
      event = "a 70.3 / half triathlon";
      if (level === "beginner") { minDays = 3; recDays = 3; }
      else if (level === "advanced") { minDays = 4; recDays = 4; }
      else { minDays = 3; recDays = 4; }
    } else if (band === "olympic" || presetId === "kwart") {
      event = "an Olympic / kwart triathlon";
      minDays = 3;
      recDays = level === "advanced" ? 4 : 3;
    } else {
      event = "a sprint triathlon";
      minDays = 3;
      recDays = 3;
    }
  } else if (runKm >= 42 || presetId === "volledige") {
    event = "a marathon or long-course triathlon";
    if (level === "beginner") { minDays = 3; recDays = 4; }
    else if (level === "advanced") { minDays = 5; recDays = 6; }
    else { minDays = 4; recDays = 5; }
  } else if (runKm >= 21 || presetId === "halve" || presetId === "half") {
    event = "a half marathon or 70.3";
    if (level === "beginner") { minDays = 3; recDays = 3; }
    else if (level === "advanced") { minDays = 4; recDays = 5; }
    else { minDays = 3; recDays = 4; }
  } else if (runKm >= 16) {
    event = "a 10-mile race";
    if (level === "beginner") { minDays = 3; recDays = 3; }
    else if (level === "advanced") { minDays = 4; recDays = 5; }
    else { minDays = 3; recDays = 4; }
  } else if (runKm >= 10) {
    event = "a 10K";
    minDays = 3;
    recDays = level === "beginner" ? 3 : level === "advanced" ? 5 : 4;
  } else if (runKm > 0) {
    event = "a 5K";
    minDays = 3;
    recDays = level === "beginner" ? 3 : level === "advanced" ? 5 : 4;
  } else if (isRunSport) {
    minDays = 3;
    recDays = level === "beginner" ? 3 : level === "advanced" ? 5 : 4;
  }
  const strengthStrong = runKm >= 21 || sport === "triathlon" || sport === "duathlon";
  const strengthRecommended = strengthStrong || runKm >= 16 || sport === "aquathlon";
  const levelLabel = sport === "triathlon"
    ? (level === "beginner" ? "a beginner triathlete" : level === "advanced" ? "an advanced triathlete" : "an intermediate triathlete")
    : sport === "duathlon"
      ? (level === "beginner" ? "a beginner duathlete" : level === "advanced" ? "an advanced duathlete" : "an intermediate duathlete")
      : sport === "aquathlon"
        ? (level === "beginner" ? "a beginner aquathlete" : level === "advanced" ? "an advanced aquathlete" : "an intermediate aquathlete")
        : (level === "beginner" ? "a beginner" : level === "advanced" ? "an advanced runner" : "an intermediate runner");
  const multiHint = !presetId ? ""
    : sport === "triathlon"
      ? ` For ${event}, aim for ~3 swims (technique needs frequency), most volume on the bike (~55% of training time), and protect the run (~30%). Build frequency first, then duration, then intensity. Expect one bike→run brick most build/peak weeks.`
      : sport === "duathlon"
        ? ` For ${event}, keep the week run-heavy with 2–3 bike days and one weekly run→bike→run brick so the second run feels familiar.`
        : sport === "aquathlon"
          ? ` For ${event}, use ~2 swims and 3–4 runs — don’t copy a triathlon week. The key session is a weekly swim→run brick.`
          : "";
  return {
    minDays,
    recDays,
    experience: level,
    strengthRecommended,
    strengthStrong,
    showRunDays: isRunSport,
    daysHint: !isRunSport ? ""
      : !presetId ? "Pick a distance and your current level to see a research-based week."
      : recDays > minDays
        ? `For ${event}, ${levelLabel} usually needs ${minDays} run days as a minimum — ${recDays} is better, so each run stays shorter. Beginners can sit at the low end while volume is still small; advanced athletes add days rather than making each run much longer.${multiHint}`
        : `For ${event}, ${levelLabel} is fine on ${recDays} run days a week. Extra easy days help if the extra kilometres stay easy.${multiHint}`,
    strengthHint: !presetId ? "Pick a distance first. Strength matters more as the race gets longer."
      : strengthStrong
        ? sport === "triathlon" || sport === "duathlon"
          ? `Strongly recommended for ${sport}: 1–2 short sessions in base (injury resilience), then maintain in build/peak.`
          : "Strongly recommended at this distance: 1–2 short sessions a week cut overuse injuries by about half and improve running economy."
        : strengthRecommended
          ? "Recommended as mileage builds: a short session after an easy run helps tendons, hips and running economy."
          : "Optional at this distance. Still useful if you have a history of niggles.",
  };
};

const NOTE_DAYS = [
  ["monday", 0], ["mon", 0], ["tuesday", 1], ["tue", 1], ["tues", 1],
  ["wednesday", 2], ["wed", 2], ["thursday", 3], ["thu", 3], ["thur", 3],
  ["friday", 4], ["fri", 4], ["saturday", 5], ["sat", 5], ["sunday", 6], ["sun", 6],
];

window.parsePlanNotes = function parsePlanNotes(notes) {
  const extra = { swim: [], bike: [], run: [], strength: [] };
  const text = String(notes || "").toLowerCase();
  if (!text.trim()) return extra;
  const sports = [
    ["swim", "swim"],
    ["bike", "bike|cycle|cycling|ride"],
    ["run", "run"],
    ["strength", "strength|gym|weights"],
  ];
  for (const [key, sportRe] of sports) {
    for (const [name, i] of NOTE_DAYS) {
      const re = new RegExp(`(?:${sportRe})[^.]{0,28}(?:every|each|on)\\s+${name}|(?:every|each|on)\\s+${name}[^.]{0,20}(?:${sportRe})`);
      if (re.test(text) && !extra[key].includes(i)) extra[key].push(i);
    }
  }
  return extra;
};

function mergeDays(a, b) {
  return [...new Set([...(a || []), ...(b || [])])].sort((x, y) => x - y);
}

function monthLabel(d) {
  return d.toLocaleDateString("en-GB", { month: "short" });
}

function monthSpan(from, days) {
  const end = pgAdd(from, days);
  if (from.getMonth() === end.getMonth()) return monthLabel(from);
  return `${monthLabel(from)} – ${monthLabel(end)}`;
}

const AGENDA_IMPORTANT_KINDS = new Set(["long", "quality", "brick", "race"]);

function clonePlanWeeks(weeks) {
  return (weeks || []).map((w) => ({
    ...w,
    days: (w.days || []).map((d) => (Array.isArray(d) ? d.slice() : d)),
  }));
}
window.clonePlanWeeks = clonePlanWeeks;

function dayReplaceCost(day) {
  const k = day?.[0];
  if (!k || k === "rest") return 0;
  if (k === "walk") return 1;
  if (k === "bike" || k === "swim" || k === "walkswim") return 2;
  if (k === "run") return 3;
  return 99;
}

function findSlotForImportant(week, kind, blocked) {
  const order = (kind === "long" || kind === "race")
    ? [4, 3, 6, 2, 0, 1, 5] // Fri first — protect weekend event windows
    : [2, 1, 0, 3, 4, 6, 5];
  let best = -1;
  let bestCost = 99;
  for (const i of order) {
    if (blocked.has(i)) continue;
    const day = week.days[i];
    if (!day) continue;
    if (AGENDA_IMPORTANT_KINDS.has(day[0])) continue;
    const cost = dayReplaceCost(day);
    if (cost < bestCost) {
      best = i;
      bestCost = cost;
      if (cost === 0) break;
    }
  }
  return best;
}

function dayShowsEvent(day, eventName) {
  return !!(day && (day[0] === "event" || day[0] === "rest" || day[0] === "race")
    && String(day[1] || "").includes(eventName));
}

/**
 * Mark every day of an agenda event on the plan and relocate long/quality/brick
 * off the window (Friday preferred for longs). Safe to re-run (idempotent).
 */
window.applyAgendaEventToWeeks = function applyAgendaEventToWeeks(weeks, planStartYmd, ev, opts = {}) {
  if (!ev?.date || !ev?.name || !Array.isArray(weeks) || !weeks.length) {
    return { weeks, changed: false, moves: [] };
  }
  const goalDate = opts.goalDate ? String(opts.goalDate).slice(0, 10) : "";
  const start = String(ev.date).slice(0, 10);
  const end = window.eventEndYmd(ev);
  if (goalDate && start === goalDate) return { weeks, changed: false, moves: [] };

  const planStart = pgParse(planStartYmd);
  if (Number.isNaN(planStart.getTime())) return { weeks, changed: false, moves: [] };
  const entries = window.expandEventToDayEntries(ev);
  if (!entries.length) return { weeks, changed: false, moves: [] };

  const soft = !!(ev.soft || window.eventIsSoftKind(ev.kind));
  const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const blockedByWeek = new Map();
  const displaced = [];
  let changed = false;

  entries.forEach((entry) => {
    const date = pgParse(entry.date);
    if (Number.isNaN(date.getTime())) return;
    const wk = Math.floor(pgDays(planStart, date) / 7) + 1;
    const weekIdx = wk - 1;
    const week = weeks[weekIdx];
    if (!week?.days) return;
    const dayIdx = (date.getDay() + 6) % 7;
    if (!blockedByWeek.has(weekIdx)) blockedByWeek.set(weekIdx, new Set());
    blockedByWeek.get(weekIdx).add(dayIdx);

    const prev = week.days[dayIdx];
    const already = dayShowsEvent(prev, ev.name);
    const items = entry.items || [];
    // Use leg distance only — don't inherit the event's summary km (often 0.1 placeholder).
    const load = window.legDayLoadKm({ items }) || 0;
    const label = items.length
      ? window.legDayLabel({ items }, ev.name, entry.stageNum)
      : (soft ? `${ev.name} · travel / easy` : ev.name);
    let next;
    if (!items.length) {
      next = ["rest", soft ? `${ev.name} · travel / easy` : `${ev.name}`];
    } else if (!(load > 0) && soft) {
      next = ["event", label];
    } else {
      next = load > 0 ? ["event", label, load] : ["event", label];
    }

    if (!already && prev && AGENDA_IMPORTANT_KINDS.has(prev[0])) {
      displaced.push({ weekIdx, day: prev.slice(), kind: prev[0] });
    }
    if (!already && JSON.stringify(prev) !== JSON.stringify(next)) {
      week.days[dayIdx] = next;
      changed = true;
    } else if (!already) {
      week.days[dayIdx] = next;
    }
    if (load > 0) week.long = Math.max(Number(week.long) || 0, load);
  });

  // Hard races: drop a same-week long that isn't the event day (race is the key session).
  if (!soft) {
    blockedByWeek.forEach((daySet, weekIdx) => {
      const week = weeks[weekIdx];
      if (!week?.days) return;
      week.days.forEach((d, i) => {
        if (daySet.has(i)) return;
        if (d?.[0] !== "long") return;
        week.days[i] = ["rest", "Rest / easy walk"];
        const bit = `The planned long comes out so you don't stack it with ${ev.name}.`;
        if (!String(week.note || "").includes(bit)) {
          week.note = [week.note, bit].filter(Boolean).join(" ");
        }
        changed = true;
      });
    });
    // Don't relocate a long that landed under a hard race day — the race replaces it.
    for (let i = displaced.length - 1; i >= 0; i--) {
      if (displaced[i].kind === "long") displaced.splice(i, 1);
    }
  }

  displaced.sort((a, b) => {
    const rank = (k) => (k === "long" ? 0 : k === "quality" ? 1 : 2);
    return rank(a.kind) - rank(b.kind);
  });

  const moves = [];
  const tryPlace = (weekIdx) => {
    if (weekIdx < 0 || weekIdx >= weeks.length) return -1;
    const week = weeks[weekIdx];
    const blocked = new Set(blockedByWeek.get(weekIdx) || []);
    week.days.forEach((d, i) => {
      if (AGENDA_IMPORTANT_KINDS.has(d?.[0])) blocked.add(i);
    });
    return findSlotForImportant(week, "long", blocked);
  };

  displaced.forEach((item) => {
    let targetWeekIdx = item.weekIdx;
    let slot = tryPlace(item.weekIdx);
    if (slot < 0 && soft) {
      // Prefer before the window for longs (e.g. Friday pre-holiday), else after.
      const neighbors = item.kind === "long"
        ? [item.weekIdx - 1, item.weekIdx + 1]
        : [item.weekIdx + 1, item.weekIdx - 1];
      for (const wi of neighbors) {
        slot = tryPlace(wi);
        if (slot >= 0) {
          targetWeekIdx = wi;
          break;
        }
      }
    }
    if (slot < 0) {
      const week = weeks[item.weekIdx];
      const miss = `Could not place “${item.day[1]}” around ${ev.name} — shorten it when you return.`;
      if (!String(week.note || "").includes(miss)) {
        week.note = [week.note, miss].filter(Boolean).join(" ");
        changed = true;
      }
      return;
    }
    const target = weeks[targetWeekIdx];
    target.days[slot] = item.day;
    const bit = `Moved “${item.day[1]}” to ${names[slot]} for ${ev.name}.`;
    if (!String(target.note || "").includes(bit)) {
      target.note = [target.note, bit].filter(Boolean).join(" ");
    }
    if (targetWeekIdx !== item.weekIdx) {
      const origin = weeks[item.weekIdx];
      const shift = `Key session moved out of the ${ev.name} window.`;
      if (!String(origin.note || "").includes(shift)) {
        origin.note = [origin.note, shift].filter(Boolean).join(" ");
      }
    }
    moves.push({
      session: item.day[1],
      kind: item.kind,
      toWeek: target.wk,
      toDay: names[slot],
    });
    changed = true;
  });

  blockedByWeek.forEach((_, weekIdx) => {
    const week = weeks[weekIdx];
    if (!week) return;
    const range = start === end ? start : `${start} → ${end}`;
    const mark = soft
      ? `${ev.name} (${range}): training yields to this window.`
      : `${ev.name} on ${range} is woven into this week.`;
    const note = String(week.note || "");
    const alreadyNoted = note.includes(ev.name) || note.includes(mark)
      || (soft && /ski(ing)? holiday/i.test(note));
    if (!alreadyNoted) {
      week.note = [week.note, mark].filter(Boolean).join(" ");
      changed = true;
    }
  });

  return { weeks, changed, moves };
};

function weaveEventIntoWeek(weeks, start, ev) {
  const date = pgParse(ev.date);
  if (Number.isNaN(date.getTime())) return;
  const wk = Math.floor(pgDays(start, date) / 7) + 1;
  const week = weeks[wk - 1];
  if (!week || wk > weeks.length) return;
  const dayIdx = (date.getDay() + 6) % 7;
  const soft = !!(ev.soft || window.eventIsSoftKind(ev.kind));
  const longIdx = week.days.findIndex((d) => d[0] === "long" || d[0] === "event" || d[0] === "race");
  const items = Array.isArray(ev.items) ? ev.items : [];
  const evKm = Number(ev.km) || window.legDayLoadKm({ items }) || 0;
  let km = evKm || (soft ? 0 : week.long);
  let label = items.length
    ? window.legDayLabel({ items }, ev.name, ev.stageNum)
    : `${ev.name}${evKm ? ` ${fmtKmLabel(evKm)} km` : ""}`;
  if (!soft && !items.length && evKm > 0 && week.long > evKm + 3 && evKm <= 16) {
    const extra = week.long - evKm;
    const pre = Math.round(extra / 2);
    const post = extra - pre;
    label = `${ev.name}: ${pre} + ${fmtKmLabel(evKm)} + ${post} = ${fmtKmLabel(week.long)} km`;
    km = week.long;
  }
  const prev = week.days[dayIdx] ? week.days[dayIdx].slice() : null;
  if (!items.length && !(evKm > 0) && soft) {
    week.days[dayIdx] = ["rest", `${ev.name} · easy / holiday`];
  } else {
    week.days[dayIdx] = ["event", label, km || undefined];
  }
  if (km > 0) week.long = Math.max(week.long || 0, km);
  week.focus = week.focus && week.focus.includes(ev.name) ? week.focus : ev.name;
  const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const bits = soft
    ? [`${ev.name} on ${names[dayIdx]} — keep surrounding days easy.`]
    : [`${ev.name} on ${names[dayIdx]} is this week's key session.`];
  if (!soft && longIdx >= 0 && longIdx !== dayIdx) {
    week.days[longIdx] = ["rest", longIdx === dayIdx - 1 ? "Rest (protect event)" : "Rest / easy walk"];
    bits.push(`The planned long on ${names[longIdx]} comes out so you don't stack two longs.`);
  }
  if (!soft && dayIdx > 0 && ["long", "quality"].includes(week.days[dayIdx - 1][0])) {
    week.days[dayIdx - 1] = ["rest", "Rest (protect event)"];
  }
  // Soft events (and hard events that land on the long day): relocate the displaced key session.
  if (prev && AGENDA_IMPORTANT_KINDS.has(prev[0])) {
    const blocked = new Set([dayIdx]);
    week.days.forEach((d, i) => {
      if (AGENDA_IMPORTANT_KINDS.has(d?.[0])) blocked.add(i);
    });
    const slot = findSlotForImportant(week, prev[0], blocked);
    if (slot >= 0) {
      week.days[slot] = prev;
      bits.push(`Moved “${prev[1]}” to ${names[slot]}.`);
    }
  }
  week.note = [week.note, bits.join(" ")].filter(Boolean).join(" ");
}

/**
 * For multi-day / stage goals: sprinkle back-to-back long weekends in Build/Peak
 * (iRunFar / Marathon Handbook / CTS pattern — practise racing on tired legs).
 * Spaced about every 3rd eligible week; skipped on cutbacks, taper, and race week.
 */
function applyMultiDayBackToBacks(weeks, opts = {}) {
  const sport = opts.sport || "run";
  const raceStartWeek = Number(opts.raceStartWeek) || 0;
  const taperFrom = Number(opts.taperFrom) || 0;
  const foot = sport === "run" || sport === "walk" || sport === "triathlon"
    || sport === "duathlon" || sport === "aquathlon";
  const bikeish = sport === "bike" || sport === "ski";
  if (!foot && !bikeish) return;

  let eligible = 0;
  weeks.forEach((week) => {
    if (!week || !Array.isArray(week.days)) return;
    const wk = Number(week.wk) || 0;
    if (week.phase !== "Build" && week.phase !== "Peak") return;
    if (wk && wk % 4 === 0) return; // cutback weeks
    if (raceStartWeek && wk === raceStartWeek) return;
    if (taperFrom && wk >= taperFrom) return;

    eligible += 1;
    // First eligible, then every 3rd — enough stimulus without stacking fatigue weekly.
    if (eligible !== 1 && eligible % 3 !== 1) return;

    const longIdx = week.days.findIndex((d) => d && (d[0] === "long" || (bikeish && /long/i.test(String(d[1] || "")))));
    if (longIdx < 0) return;

    const candidates = [longIdx - 1, longIdx + 1].filter((i) => i >= 0 && i <= 6);
    let slot = -1;
    for (const i of candidates) {
      const kind = week.days[i]?.[0];
      if (!kind || kind === "busy" || kind === "race" || kind === "event" || kind === "brick" || kind === "quality") continue;
      slot = i;
      if (kind === "rest" || kind === "run" || kind === "walk" || kind === "bike" || kind === "ski") break;
    }
    if (slot < 0) return;

    const longKm = Number(week.long) || Number(week.days[longIdx][2]) || 0;
    const backKm = Math.max(foot ? 6 : 20, Math.round((longKm || (foot ? 12 : 40)) * 0.7));
    if (bikeish) {
      const kind = sport === "ski" ? "ski" : "bike";
      week.days[slot] = [kind, `Back-to-back · endurance on tired legs ~${fmtKmLabel(backKm)} km`, backKm];
    } else {
      const kind = sport === "walk" ? "walk" : "run";
      week.days[slot] = [kind, `Back-to-back · ${fmtKmLabel(backKm)} easy on tired legs`, backKm];
    }
    week.note = [week.note, "Back-to-back long weekend — practise performing on tired legs for the multi-day."]
      .filter(Boolean).join(" ");
    if (!week.focus || /base|build|peak/i.test(week.focus)) {
      week.focus = "Back-to-back endurance";
    }
  });
}

/** Overwrite every day in [eventStart, eventEnd] with A-goal legs. */
function applyGoalEventWindow(weeks, planStart, eventStart, eventEnd, legs, eventName, kind) {
  const start = pgParse(eventStart);
  const end = pgParse(eventEnd || eventStart);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
  const normalized = window.normalizeEventLegs(eventStart, eventEnd || eventStart, legs);
  const multi = normalized.length > 1;
  const soft = window.eventIsSoftKind(kind);
  normalized.forEach((leg, i) => {
    const date = pgParse(leg.date);
    if (Number.isNaN(date.getTime())) return;
    const wk = Math.floor(pgDays(planStart, date) / 7) + 1;
    const week = weeks[wk - 1];
    if (!week) return;
    const dayIdx = (date.getDay() + 6) % 7;
    const load = window.legDayLoadKm(leg);
    const label = window.legDayLabel(leg, eventName, multi ? i + 1 : null);
    const dayKind = !leg.items.length ? "rest" : (soft ? "event" : "race");
    week.days[dayIdx] = load > 0 ? [dayKind, label, load] : [dayKind, label];
    if (load > 0) week.long = Math.max(week.long || 0, load);
    week.focus = eventName;
    if (multi && i === 0) {
      week.note = [week.note, `Event window starts: ${eventName}.`].filter(Boolean).join(" ");
    }
  });
  weeks.forEach((week, wi) => {
    const weekStart = pgAdd(planStart, wi * 7);
    let touched = false;
    for (let d = 0; d < 7; d++) {
      const ds = pgYmd(pgAdd(weekStart, d));
      if (ds >= eventStart && ds <= (eventEnd || eventStart)) touched = true;
    }
    if (!touched) return;
    week.days.forEach((day, d) => {
      const ds = pgYmd(pgAdd(weekStart, d));
      if (ds >= eventStart && ds <= (eventEnd || eventStart)) return;
      if (["long", "quality"].includes(day[0])) {
        week.days[d] = ["rest", "Rest (event window)"];
      }
    });
  });
}

function buildRoadmap(after, race, eventName) {
  if (!after.length) return [];
  const next = [...after].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const items = [[
    monthSpan(race, 21),
    `Recovery 2–3 weeks after ${eventName}: easy swim/spin and jog when ready.`,
  ]];
  next.forEach((ev) => {
    const evDate = pgParse(ev.date);
    if (Number.isNaN(evDate.getTime())) return;
    const gap = pgDays(race, evDate);
    if (gap > 35) {
      const buildStart = pgAdd(race, 21);
      const buildEnd = pgAdd(evDate, -14);
      if (pgDays(buildStart, buildEnd) > 14) {
        items.push([
          `${monthLabel(buildStart)} – ${monthLabel(buildEnd)}`,
          `Build toward ${ev.name}${ev.km ? ` (${ev.km} km)` : ""}.`,
        ]);
      }
    }
    items.push([
      `${monthLabel(evDate)} ${evDate.getFullYear()}`,
      `${ev.name}${ev.km ? ` · ${ev.km} km` : ""}${ev.note ? ` — ${ev.note}` : ""}.`,
    ]);
  });
  return items;
}

function defaultPaces(sport) {
  if (sport === "swim") {
    return [
      ["Easy", "Smooth strokes, full sentences if talking between sets", "Warm-up, cool-down, most volume"],
      ["Threshold / CSS", "Controlled hard; even splits", "Main-set 100s–400s"],
      ["Race pace", "Sustainable open-water race effort", "Short opens in build/taper"],
    ];
  }
  if (sport === "bike") {
    return [
      ["Easy / Z2", "~55–75% FTP or RPE 3 · can talk · 85–95 rpm", "Most rides"],
      ["Steady / sweet-spot", "~85–95% FTP or RPE 5–6", "Build quality"],
      ["Long", "Steady endurance; fuel as race day", "Weekend ride"],
    ];
  }
  if (sport === "triathlon") {
    return [
      ["Easy / aerobic", "Can talk · bike Z2 / RPE 3 · swim smooth", "Most swim/bike/run volume — especially base"],
      ["Steady / tempo", "Bike ~70–85% FTP or RPE 4–5 · run controlled", "Build-phase bike/run; beginner 70.3 often stays here"],
      ["Race pace", "Sustainable 70.3 effort per leg", "Short swim/bike sets in build; longer bricks in peak"],
      ["Bike power / RPE", "Easy Z2 · sweet-spot ~85–90% FTP · or RPE 3 / 5–6 if no meter", "Use power when you have it; otherwise cadence + RPE"],
      ["Brick run", "Easy→steady off the bike (T2)", "Practise transition; keep early minutes relaxed"],
      ["Strides / opens", "Fast but relaxed", "Keep neuromuscular feel in taper"],
    ];
  }
  return [
    ["Easy / long", "Comfortably conversational", "Most km"],
    ["Steady / cruise", "Controlled, not racing", "Threshold / cruise quality"],
    ["Interval / VO₂", "Hard but controlled · short reps", "Base–peak interval sessions"],
    ["Race pace", "Goal event effort", "Short segments late in the plan"],
    ["Strides", "Fast but relaxed", "6–8 × 20 sec"],
  ];
}

function researchForSport(sport, goalType = "race") {
  const all = window.TRAINING_RESEARCH || [];
  const mapped = window.planTemplateSport ? window.planTemplateSport(sport) : sport;
  const key = ["run", "swim", "bike", "triathlon"].includes(mapped) ? mapped : "run";
  const fitness = goalType === "fitness";
  return all.filter((s) => {
    const sports = Array.isArray(s.sports) && s.sports.length ? s.sports : ["triathlon"];
    if (!sports.includes(key)) return false;
    if (fitness && s.race_only) return false;
    return true;
  });
}
window.researchForSport = researchForSport;

window.generateTrainingPlan = function generateTrainingPlan(input) {
  const goalType = input.goalType === "time" || input.goalType === "fitness" ? input.goalType : "race";
  let sport = input.sport;
  let preset = input.preset;
  let eventName = String(input.eventName || "").trim();
  let eventDate = input.eventDate;
  const today = new Date();
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  if (goalType === "time") {
    if (!["run", "swim", "bike", "triathlon"].includes(sport)) throw new Error("Choose an event type.");
    const customTime = String(input.customTime || "").trim();
    const isCustom = input.preset === "custom" || input.timeGoal === "custom";
    if (isCustom) {
      preset = input.preset === "custom" ? "custom" : input.preset;
      if (!customTime) throw new Error("Enter a target time.");
      eventName = eventName || (typeof window.timeGoalName === "function"
        ? window.timeGoalName("custom", {
          time: customTime,
          run: input.custom?.run,
          swim: input.custom?.swim,
          bike: input.custom?.bike,
          preset,
          sport,
        })
        : customTime);
    } else {
      const goal = (window.TIME_GOALS || []).find((g) => g.id === input.timeGoal);
      if (!goal) throw new Error("Choose a time goal.");
      if (goal.sport && goal.sport !== sport) throw new Error("Choose a time goal for this event type.");
      preset = goal.preset;
      eventName = eventName || (typeof window.timeGoalName === "function"
        ? window.timeGoalName(goal, { sport })
        : goal.label);
    }
  }
  if (goalType === "fitness") {
    if (!(window.EVENT_SPORTS || []).includes(sport)) throw new Error("Choose a focus.");
    preset = sport === "run" || sport === "walk" ? (sport === "walk" ? "20" : "10k")
      : sport === "swim" ? "1500"
        : sport === "bike" || sport === "ski" ? (sport === "ski" ? "full" : "40")
          : "halve";
    eventName = eventName || "General fitness";
    const weeksIn = Number(input.fitnessWeeks);
    const weeks = weeksIn >= 4 && weeksIn <= 32 ? Math.round(weeksIn) : 12;
    if (!eventDate) eventDate = pgYmd(pgAdd(todayDate, weeks * 7));
  }

  if (goalType === "race" && !(window.EVENT_SPORTS || []).includes(sport)) {
    throw new Error("Choose an event type.");
  }

  const eventKind = window.EVENT_KINDS.includes(input.eventKind) ? input.eventKind : "race";
  const eventEndRaw = String(input.eventEndDate || eventDate || "").slice(0, 10);
  let goalLegs = Array.isArray(input.legs) ? input.legs : [];
  if (eventDate && eventEndRaw && eventEndRaw >= String(eventDate).slice(0, 10)) {
    goalLegs = window.normalizeEventLegs(eventDate, eventEndRaw, goalLegs);
  }
  const legSummary = goalLegs.length ? window.summarizeEventLegs(goalLegs) : null;
  if (legSummary?.hardest > 0 && preset === "custom") {
    if ((sport === "run" || sport === "walk") && !(Number(input.custom?.run) > 0)) {
      input.custom = { ...(input.custom || {}), run: legSummary.hardest };
    }
    if ((sport === "bike" || sport === "ski") && !(Number(input.custom?.bike) > 0)) {
      input.custom = { ...(input.custom || {}), bike: legSummary.hardest };
    }
  }

  const distances = resolveDistances(sport, preset, input.custom || {});
  if (legSummary?.hardest > 0) {
    if ((sport === "run" || sport === "walk") && !(distances.run > 0)) distances.run = legSummary.hardest;
    if ((sport === "bike" || sport === "ski") && !(distances.bike > 0)) distances.bike = legSummary.hardest;
  }
  const weekly = Number(input.weeklyKm);
  const weeklyMax = sport === "bike" || sport === "ski" ? 500 : sport === "swim" ? 40 : 200;
  if (!(weekly > 0) || weekly > weeklyMax) {
    throw new Error(`Enter your current weekly kilometres (1–${weeklyMax}).`);
  }
  eventName = eventName || distances.label;
  const race = pgParse(eventDate);
  if (Number.isNaN(race.getTime())) throw new Error(goalType === "time" ? "Pick a target date." : "Pick an event date.");
  if (race < todayDate) throw new Error(goalType === "time" ? "Target date needs to be in the future." : "Event date needs to be in the future.");
  const raceEnd = pgParse(eventEndRaw && eventEndRaw >= pgYmd(race) ? eventEndRaw : pgYmd(race));
  if (Number.isNaN(raceEnd.getTime())) throw new Error("Pick a valid event end date.");
  const isFitness = goalType === "fitness";
  const multiDayGoal = !isFitness && pgYmd(raceEnd) > pgYmd(race);

  let start = pgMonday(todayDate);
  let n = Math.floor(pgDays(start, pgMonday(raceEnd)) / 7) + 1;
  if (n > 32) {
    start = pgAdd(pgMonday(raceEnd), -31 * 7);
    n = 32;
  }
  if (n < 4) n = Math.max(4, n);

  const wantsRunDays = sport === "run" || sport === "walk" || sport === "triathlon";
  const experience = EXPERIENCE_LEVELS.includes(input.experience) ? input.experience : "intermediate";
  const busyWeekdays = normalizeWeekdays(input.busyWeekdays, []);
  const busySet = new Set(busyWeekdays);
  const withoutBusy = (days) => normalizeWeekdays(days, []).filter((d) => !busySet.has(d));
  const advice = trainingAdvice(sport, preset, input.custom || {}, experience);
  const strength = input.strength !== false && input.strength !== "no";
  const runWeekdays = withoutBusy(input.runWeekdays);
  const strengthWeekdays = strength ? withoutBusy(input.strengthWeekdays) : [];
  const swimWeekdays = withoutBusy(input.swimWeekdays);
  const bikeWeekdays = withoutBusy(input.bikeWeekdays);
  const runDaysN = wantsRunDays
    ? Math.max(2, Math.min(6, runWeekdays.length || Number(input.runDays) || advice.recDays))
    : null;
  if (wantsRunDays && !runWeekdays.length && !(Number(input.runDays) > 0)) {
    throw new Error(sport === "walk" ? "Choose which days you want to walk." : "Choose which days you want to run.");
  }
  const needsLong = typeof window.needsDedicatedLongDay === "function"
    && window.needsDedicatedLongDay(sport, preset, input.custom || {});
  let longWeekday = Number.isInteger(Number(input.longWeekday)) ? Number(input.longWeekday) : null;
  if (needsLong) {
    if (longWeekday == null || !runWeekdays.includes(longWeekday)) {
      throw new Error(sport === "walk"
        ? "Choose a day for your long walk before creating the plan."
        : "Choose a run day for your long run before creating the plan.");
    }
  } else if (longWeekday != null && !runWeekdays.includes(longWeekday)) {
    longWeekday = null;
  }

  const goalLoad = Math.max(
    distances.run || 0,
    distances.bike || 0,
    distances.swim ? distances.swim / 1000 : 0,
    legSummary?.hardest || 0,
  );
  const peak = peakVolume(sport, weekly, goalLoad || distances.run || 0);
  const templateSport = window.planTemplateSport(sport);
  const phaseOpts = { sport: templateSport, experience, distances, fitness: isFitness };
  const phases = assignPhases(n, phaseOpts);
  const taper = phases.find((p) => p.name === "Taper");
  const targets = weekTargets(n, weekly, peak, taper ? taper.from : n + 1, { sport: templateSport, fitness: isFitness });
  const goalRaceKm = goalLoad || distances.run || 0;
  const cap = longCap(sport, goalRaceKm, weekly, experience);
  const longShare = longShareOfWeek(templateSport, goalRaceKm);
  const raceDay = (race.getDay() + 6) % 7;
  const raceStartWeek = Math.floor(pgDays(start, pgMonday(race)) / 7) + 1;
  const sources = researchForSport(sport, goalType, program);
  const band = sport === "triathlon" ? triDistanceBand(distances) : null;
  const wantsMultiDayBackToBacks = multiDayGoal
    || (!isFitness && (window.MULTI_DAY_KINDS || []).includes(eventKind));

  const weeks = targets.map((km, i) => {
    const wk = i + 1;
    const phase = phases.find((p) => wk >= p.from && wk <= p.to) || phases[0];
    const isRaceWeek = !isFitness && wk === raceStartWeek;
    const longKm = isRaceWeek
      ? (goalLoad || distances.run || distances.bike || Math.round((distances.swim || 1000) / 1000))
      : Math.min(cap, Math.max(sport === "swim" ? 0.8 : 6, Math.round(km * longShare)));
    const extras = [];
    if (wantsRunDays) extras.push(`${runDaysN} ${sport === "walk" ? "walk" : "run"} days`);
    if (strength && wantsRunDays) extras.push("strength after an easy session");
    if (busyWeekdays.length) extras.push(`${busyWeekdays.length} busy day${busyWeekdays.length > 1 ? "s" : ""}/week`);
    if (sport === "triathlon") extras.push("~3 swim / 2–3 bike, bricks in build–peak");
    if (sport === "duathlon") extras.push("2–3 bike days, weekly R-B-R brick");
    if (sport === "aquathlon") extras.push("~2 swims, weekly swim→run brick");
    if (wantsMultiDayBackToBacks) extras.push(`multi-day event through ${pgYmd(raceEnd)}`);
    const dayOpts = {
      runDays: runDaysN || 3,
      strength,
      runWeekdays,
      strengthWeekdays,
      swimWeekdays,
      bikeWeekdays,
      busyWeekdays,
      longWeekday,
      weekNum: wk,
    };
    const days = daysFor(sport, phase.name, km, longKm, raceDay, isRaceWeek, { ...distances, label: eventName }, dayOpts);
    busyWeekdays.forEach((d) => {
      if (!isRaceWeek || d !== raceDay) days[d] = ["rest", "Busy"];
    });
    const brick = !isRaceWeek
      ? (sport === "triathlon" ? brickLabel(phase.name, band, wk)
        : sport === "duathlon" ? duathlonBrickLabel(phase.name, distances, wk)
          : sport === "aquathlon" ? aquathlonBrickLabel(phase.name, distances, wk)
            : null)
      : null;
    let note;
    if (wk === 1) {
      if (isFitness) {
        note = sport === "triathlon"
          ? `General fitness block from ${weekly} km/week run volume${extras.length ? ` (${extras.join("; ")})` : ""}. Frequency → volume → intensity, ~10% weekly load rise max, cutback every 4th week — no race taper.`
          : `General fitness block from ${weekly} km/week${extras.length ? `, ${extras.join(", ")}` : ""}. Weekly load rises about 10% max, with a cutback every 4th week — no race taper.`;
      } else if (sport === "triathlon") {
        note = `Built from ${weekly} km/week run volume toward ${eventName}${extras.length ? ` (${extras.join("; ")})` : ""}. Research-based triathlon periodization: frequency → volume → intensity, ~10% weekly load rise max, cutback every 4th week, and a sharper race taper.`;
      } else if (sport === "duathlon") {
        note = `Built from ${weekly} km/week toward ${eventName}${extras.length ? ` (${extras.join("; ")})` : ""}. Duathlon weeks stay run-heavy with weekly run→bike→run bricks so the second run feels familiar.`;
      } else if (sport === "aquathlon") {
        note = `Built from ${weekly} km/week toward ${eventName}${extras.length ? ` (${extras.join("; ")})` : ""}. Aquathlon weeks use ~2 swims + 3–4 runs with a weekly swim→run brick — not a copied triathlon week.`;
      } else {
        note = `Built from ${weekly} km/week toward ${eventName}${extras.length ? `, ${extras.join(", ")}` : ""}. Weekly load rises about 10% max, with a cutback every 4th week.`;
      }
    } else if (brick && (phase.name === "Build" || phase.name === "Peak")) {
      note = sport === "aquathlon"
        ? `Key transition work this week: ${brick}. Practise a fast swim→run change.`
        : sport === "duathlon"
          ? `Key transition work this week: ${brick}. Keep the first run controlled so the second run stays strong.`
          : `Key transition work this week: ${brick}. Practise fueling on the long ride.`;
    } else if (!isFitness && isRaceWeek && (sport === "triathlon" || sport === "duathlon" || sport === "aquathlon")) {
      note = sport === "aquathlon"
        ? "Race week: short swim feel, one mini swim→run opener, then rest. Pack transition kit early."
        : "Race week: short openers only, one mini T2 brick, then rest. Use the race-week checklist (bags, nutrition, transitions).";
    } else if (!isFitness && isRaceWeek && wantsMultiDayBackToBacks) {
      note = `Event week: taper into day 1 of ${eventName}, then follow the stage schedule.`;
    } else if (!isFitness && phase.name === "Taper" && wk === (taper ? taper.from : raceStartWeek - 1)) {
      note = sport === "triathlon" || sport === "duathlon" || sport === "aquathlon"
        ? "Taper starts: cut volume sharply, keep session frequency, short race-pace opens, and practise transitions once."
        : "Taper starts: reduce volume, keep some sharpness.";
    }
    return {
      wk,
      phase: phase.name,
      km,
      long: longKm,
      swim: swimLabel(sport, phase.name, distances.swim),
      bike: bikeLabel(sport, phase.name, distances.bike),
      focus: isFitness && wk === n
        ? "Keep the habit and finish the block easy"
        : isRaceWeek
          ? (multiDayGoal ? "Event week" : "Race week")
          : phase.focus,
      note,
      days,
    };
  });

  if (wantsMultiDayBackToBacks) {
    applyMultiDayBackToBacks(weeks, {
      sport,
      raceStartWeek,
      taperFrom: taper ? taper.from : null,
    });
  }

  const legsHaveItems = goalLegs.some((leg) => (leg.items || []).length);
  // Single-day races without explicit legs keep daysFor race-week scheduling.
  // Multi-day (or legs with items) overwrite the event window from the stage schedule.
  if (!isFitness && goalLegs.length && (multiDayGoal || legsHaveItems)) {
    applyGoalEventWindow(weeks, start, pgYmd(race), pgYmd(raceEnd), goalLegs, eventName, eventKind);
  }

  const raceYmd = pgYmd(race);
  const raceEndYmd = pgYmd(raceEnd);
  const planStartYmd = pgYmd(start);
  const otherEvents = (input.otherEvents || []).filter((e) => {
    if (!e || !e.name || !e.date) return false;
    const evStart = String(e.date).slice(0, 10);
    const evEnd = window.eventEndYmd(e);
    if (evStart === raceYmd) return false;
    // Overlap plan window up to goal end (after-race events stay on the roadmap only).
    return evStart <= raceEndYmd && evEnd >= planStartYmd;
  });
  otherEvents
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .forEach((ev) => {
      const multi = !!(ev.end_date && ev.end_date > ev.date) || (Array.isArray(ev.legs) && ev.legs.length > 1);
      if (multi || window.eventIsSoftKind(ev.kind)) {
        window.applyAgendaEventToWeeks(weeks, planStartYmd, ev, { goalDate: raceYmd });
      } else {
        weaveEventIntoWeek(weeks, start, ev);
      }
    });
  const after = (input.otherEvents || []).filter((e) => {
    if (!e?.date || !e?.name) return false;
    return window.eventEndYmd(e) > raceEndYmd;
  });

  return {
    sport,
    distance_preset: input.preset,
    event_name: eventName,
    event_date: raceYmd,
    event_end_date: raceEndYmd,
    event_kind: eventKind,
    event_legs: goalLegs,
    start_date: pgYmd(start),
    swim_m: distances.swim,
    bike_km: distances.bike,
    run_km: distances.run,
    run2_km: distances.run2 || null,
    weekly_km: weekly,
    run_days: runDaysN,
    include_strength: wantsRunDays ? strength : !!strength,
    run_weekdays: runWeekdays,
    strength_weekdays: strengthWeekdays,
    swim_weekdays: swimWeekdays,
    bike_weekdays: bikeWeekdays,
    long_weekday: longWeekday,
    notes: (() => {
      const bits = [];
      if (sport === "triathlon") {
        bits.push(isFitness
          ? "Triathlon fitness block uses researched periodization (base → build → peak, no taper), ~15/55/30 swim/bike/run time bias, recovery every 4th week, and bike→run bricks in build/peak."
          : "Triathlon plan uses researched periodization (base → build → peak → taper), ~15/55/30 swim/bike/run time bias, recovery every 4th week, and bike→run bricks in build/peak.");
      } else if (sport === "duathlon") {
        bits.push("Duathlon plan stays run-heavy with 2–3 bike days and weekly run→bike→run bricks so the second run is practised off the bike.");
      } else if (sport === "aquathlon") {
        bits.push("Aquathlon plan uses ~2 swims + 3–4 runs with a weekly swim→run brick — not a copied triathlon week.");
      }
      if (wantsMultiDayBackToBacks) {
        bits.push(`Multi-day event ${raceYmd} → ${raceEndYmd}: build/peak weeks include spaced back-to-back long days; the plan tapers into day 1 and follows stage legs through the window.`);
      }
      if (bits.length) bits.push("See Research under the plan.");
      return bits.join(" ");
    })(),
    experience,
    goal_type: goalType,
    phases,
    weeks,
    paces: defaultPaces(templateSport),
    sources,
    roadmap: buildRoadmap(after, raceEnd, eventName),
  };
};
