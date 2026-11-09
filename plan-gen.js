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
    { id: "1500", label: "1.5 km", swim: 1500 },
    { id: "1900", label: "1.9 km", swim: 1900 },
    { id: "5k", label: "5 km", swim: 5000 },
    { id: "custom", label: "Custom" },
  ],
  bike: [
    { id: "40", label: "40 km", bike: 40 },
    { id: "90", label: "90 km", bike: 90 },
    { id: "180", label: "180 km", bike: 180 },
    { id: "custom", label: "Custom" },
  ],
  triathlon: [
    { id: "kwart", label: "Kwart tri", swim: 1500, bike: 40, run: 10 },
    { id: "halve", label: "Halve tri (70.3)", swim: 1900, bike: 90, run: 21.1 },
    { id: "volledige", label: "Volledige tri", swim: 3800, bike: 180, run: 42.2 },
    { id: "custom", label: "Custom" },
  ],
};

window.SPORT_LABEL = { run: "Running", swim: "Swimming", bike: "Cycling", triathlon: "Triathlon" };

window.TIME_PRESETS = ["5k", "10k", "half", "marathon", "custom"];
window.TIME_GOALS = [
  { id: "5k-20", label: "Sub-20", preset: "5k" },
  { id: "5k-22", label: "Sub-22", preset: "5k" },
  { id: "5k-25", label: "Sub-25", preset: "5k" },
  { id: "5k-30", label: "Sub-30", preset: "5k" },
  { id: "10k-40", label: "Sub-40", preset: "10k" },
  { id: "10k-45", label: "Sub-45", preset: "10k" },
  { id: "10k-50", label: "Sub-50", preset: "10k" },
  { id: "10k-60", label: "Sub-60", preset: "10k" },
  { id: "half-130", label: "Sub-1:30", preset: "half" },
  { id: "half-145", label: "Sub-1:45", preset: "half" },
  { id: "half-200", label: "Sub-2:00", preset: "half" },
  { id: "marathon-330", label: "Sub-3:30", preset: "marathon" },
  { id: "marathon-400", label: "Sub-4:00", preset: "marathon" },
  { id: "marathon-430", label: "Sub-4:30", preset: "marathon" },
];
window.timeGoalName = function timeGoalName(goal, extra = {}) {
  const time = String(extra.time || "").trim();
  const km = Number(extra.run);
  if (goal === "custom" || goal?.id === "custom" || extra.preset === "custom") {
    const dist = km > 0 ? `${km} km` : "custom";
    return time ? `${time} · ${dist}` : dist;
  }
  if (!goal) return time || "";
  const dist = ((window.EVENT_PRESETS || {}).run || []).find((p) => p.id === goal.preset);
  if (time) return [time, dist?.label].filter(Boolean).join(" ");
  return [goal.label, dist?.label].filter(Boolean).join(" ");
};

window.FITNESS_WEEKS = [8, 12, 16];

const pgPad = (n) => String(n).padStart(2, "0");
const pgParse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const pgYmd = (d) => `${d.getFullYear()}-${pgPad(d.getMonth() + 1)}-${pgPad(d.getDate())}`;
const pgAdd = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const pgDays = (a, b) => Math.round((b - a) / 864e5);
const pgMonday = (d) => pgAdd(d, -((d.getDay() + 6) % 7));

function resolveDistances(sport, presetId, custom) {
  const preset = (EVENT_PRESETS[sport] || []).find((p) => p.id === presetId);
  if (!preset) throw new Error("Choose a distance.");
  if (preset.id !== "custom") return { swim: preset.swim || null, bike: preset.bike || null, run: preset.run || null, label: preset.label };
  const swim = custom.swim ? Number(custom.swim) : null;
  const bike = custom.bike ? Number(custom.bike) : null;
  const run = custom.run ? Number(custom.run) : null;
  if (sport === "run" && !(run > 0)) throw new Error("Enter the run distance in km.");
  if (sport === "swim" && !(swim > 0)) throw new Error("Enter the swim distance in metres.");
  if (sport === "bike" && !(bike > 0)) throw new Error("Enter the bike distance in km.");
  if (sport === "triathlon" && (!(swim > 0) || !(bike > 0) || !(run > 0))) throw new Error("Enter swim, bike and run distances.");
  return { swim, bike, run, label: "Custom" };
}

function peakVolume(sport, weekly, runKm) {
  const start = Math.max(4, Number(weekly) || 8);
  let cap = start + 12;
  if (sport === "run") {
    if (runKm <= 5) cap = 35;
    else if (runKm <= 10) cap = 45;
    else if (runKm <= 16.2) cap = 50;
    else if (runKm <= 21.2) cap = 55;
    else cap = 65;
  } else if (sport === "triathlon") {
    if (runKm <= 10) cap = 40;
    else if (runKm <= 21.2) cap = 48;
    else cap = 55;
  } else if (sport === "swim") {
    cap = Math.max(start + 2, start * 1.4);
  } else if (sport === "bike") {
    cap = Math.min(250, Math.max(start + 20, start * 1.5));
  }
  const built = start * (1.1 ** 12);
  return Math.round(Math.min(cap, Math.max(start, Math.min(built, start * 2.2 + 6))));
}

function longCap(sport, runKm, weekly) {
  if (sport === "swim") return Math.max(1, Math.round((weekly || 2) * 0.4 * 10) / 10);
  if (sport === "bike") return Math.min(180, Math.round(weekly * 0.45));
  if (runKm >= 42) return 32;
  if (runKm >= 21) return 21;
  if (runKm >= 16) return 18;
  if (runKm >= 10) return 16;
  if (runKm >= 5) return 12;
  return Math.max(8, Math.round((runKm || 8) * 1.2));
}

function phaseBlocks(n) {
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

function assignPhases(n) {
  const blocks = phaseBlocks(n);
  const phases = [];
  let used = 0;
  blocks.forEach((b, i) => {
    const remaining = n - used;
    const left = blocks.length - i;
    const len = i === blocks.length - 1 ? remaining : Math.min(remaining - (left - 1), Math.max(1, b.weeks));
    const from = used + 1;
    const to = used + len;
    phases.push({ name: b.name, from, to, focus: b.name === "Taper" ? "Freshen up for race week" : b.name === "Peak" ? "Highest load, then recover" : b.name === "Build" ? "Quality + longer key session" : "Consistency and aerobic base" });
    used = to;
  });
  return phases;
}

function weekTargets(n, startKm, peakKm, taperFrom) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    if (i === n) {
      out.push(Math.max(6, Math.round(startKm * 0.45)));
      continue;
    }
    if (i >= taperFrom) {
      const t = (i - taperFrom + 1) / Math.max(1, n - taperFrom);
      out.push(Math.round(peakKm * (0.78 - t * 0.28)));
      continue;
    }
    const buildN = taperFrom - 1;
    const t = (i - 1) / Math.max(1, buildN - 1);
    let km = Math.round(startKm + (peakKm - startKm) * t);
    if (i % 4 === 0 && i < taperFrom) km = Math.round(km * 0.82);
    out.push(Math.max(startKm, km));
  }
  return out;
}

function swimLabel(sport, phase, swimM) {
  if (sport === "run" || sport === "bike") return "—";
  if (sport === "swim") return `${Math.max(1, Math.round((swimM || 1500) / 800))} sessions`;
  if (phase === "Taper") return "1×25–35'";
  if (phase === "Peak") return "2×40–50'";
  return "2×35–45'";
}

function bikeLabel(sport, phase, bikeKm) {
  if (sport === "run" || sport === "swim") return "—";
  if (sport === "bike") return phase === "Taper" ? "Easy spin" : "Key ride + easy";
  if (phase === "Taper") return "40–60' spin";
  if (bikeKm >= 160) return "2–4 h easy";
  if (bikeKm >= 80) return "90–150' easy";
  return "45–75' easy";
}

function splitRunKm(total, longKm, hasQuality, nDays) {
  const rest = Math.max(0, total - longKm);
  const qualityDays = hasQuality && nDays >= 3 ? 1 : 0;
  const quality = qualityDays ? Math.max(4, Math.round(rest * 0.35)) : 0;
  const easyCount = Math.max(1, nDays - 1 - qualityDays);
  let left = Math.max(0, rest - quality);
  const easies = [];
  for (let i = 0; i < easyCount; i++) {
    const remaining = easyCount - i;
    const share = i === easyCount - 1 ? left : Math.max(3, Math.round(left / remaining));
    easies.push(share);
    left = Math.max(0, left - share);
  }
  return { easies, quality, longKm };
}

function runDaySlots(nDays) {
  const extras = [0, 2, 3, 1, 6];
  const days = [5];
  const need = Math.max(2, Math.min(6, nDays)) - 1;
  for (let i = 0; i < need && i < extras.length; i++) days.push(extras[i]);
  return days.sort((a, b) => a - b);
}

function normalizeWeekdays(list, fallback = []) {
  const raw = (Array.isArray(list) ? list : String(list || "").split(","))
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
  const swim = free(sport === "triathlon"
    ? [1, 2, 3].filter((i) => !run.includes(i)).slice(0, 2)
    : sport === "swim" ? [0, 2, 5] : []);
  const bike = free(sport === "triathlon"
    ? [run.includes(6) ? 6 : 6]
    : sport === "bike" ? [0, 2, 5] : []);
  return { run, strength, swim, bike, busy: [...busy].sort((a, b) => a - b) };
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
    } else if (sport === "triathlon") {
      info.push(`${names[i]}: ${label} on the same day is normal triathlon work. Keep the second session easy.`);
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

window.experienceFromWeeklyKm = function experienceFromWeeklyKm(km) {
  const n = Number(km);
  if (!(n > 0)) return "intermediate";
  if (n < 25) return "beginner";
  if (n < 50) return "intermediate";
  return "advanced";
};

function daysFor(sport, phase, km, longKm, raceDay, isRaceWeek, distances, opts = {}) {
  const nDays = Math.max(2, Math.min(6, Number(opts.runDays) || 3));
  const wantStrength = !!opts.strength;
  const hasQuality = ["Build", "Peak"].includes(phase) && !isRaceWeek;
  const days = Array.from({ length: 7 }, () => ["rest", "Rest"]);

  const set = (i, kind, label, run) => { days[i] = run != null ? [kind, label, run] : [kind, label]; };

  if (isRaceWeek) {
    for (let i = 0; i < 7; i++) {
      if (i === raceDay) {
        const name = distances.label || "Race";
        if (sport === "swim") set(i, "race", `${name} ${distances.swim} m`);
        else if (sport === "bike") set(i, "race", `${name} ${distances.bike} km`);
        else if (sport === "triathlon") set(i, "race", `${name}`, distances.run);
        else set(i, "race", `${name} ${distances.run} km`, distances.run);
      } else if (i === Math.max(0, raceDay - 3)) set(i, "run", "Shakeout 4–6 easy", 5);
      else if (i < raceDay && sport !== "swim" && sport !== "bike" && i % 2 === 0) set(i, "run", "Easy 4–5", 4);
      else set(i, "rest", i === raceDay - 1 ? "Rest / 20' shakeout" : "Rest");
    }
    return days;
  }

  if (sport === "swim") {
    set(0, "swim", `Swim ${Math.max(0.6, (km * 0.3)).toFixed(1)} km`);
    set(2, "swim", `Swim ${Math.max(0.6, (km * 0.3)).toFixed(1)} km`);
    set(5, "swim", `Long swim ${longKm} km`);
    if (km > longKm + 2) set(3, "swim", "Technique + easy");
    return days;
  }

  if (sport === "bike") {
    set(0, "bike", "Easy spin 45–60'");
    set(2, hasQuality ? "bike" : "bike", hasQuality ? "Quality ride" : "Steady ride");
    set(5, "bike", `Long ride ~${longKm} km`);
    if (km > 40) set(3, "bike", "Easy recovery spin");
    return days;
  }

  const busySet = new Set(normalizeWeekdays(opts.busyWeekdays, []));
  const freeDays = (list, fallback) => normalizeWeekdays(list, fallback).filter((d) => !busySet.has(d));
  const runIdx = freeDays(opts.runWeekdays, runDaySlots(nDays));
  const longIdx = runIdx.includes(5) ? 5 : (runIdx[runIdx.length - 1] ?? 5);
  const qualityIdx = hasQuality
    ? (runIdx.includes(2) && 2 !== longIdx ? 2 : runIdx.find((i) => i !== longIdx && i !== 0))
    : null;
  const easyIdx = runIdx.filter((i) => i !== longIdx && i !== qualityIdx);
  const split = splitRunKm(km, longKm, !!qualityIdx, runIdx.length);
  const strengthDays = wantStrength
    ? freeDays(opts.strengthWeekdays, [easyIdx.includes(0) ? 0 : (easyIdx[0] ?? runIdx[0] ?? 0)])
    : [];
  const swimDays = freeDays(
    opts.swimWeekdays,
    sport === "swim" ? [0, 2, 5] : sport === "triathlon" ? [1, 2, 3].filter((i) => !runIdx.includes(i)).slice(0, 2) : []
  );
  const bikeDays = freeDays(
    opts.bikeWeekdays,
    sport === "bike" ? [0, 2, 5] : sport === "triathlon" ? [6] : []
  );

  const addOn = (i, extra) => {
    const [kind, label, run] = days[i];
    if (kind === "rest") set(i, extra.kind, extra.label, extra.km);
    else days[i] = [kind, `${label} + ${extra.short}`, run];
  };

  if (!runIdx.includes(4) && !swimDays.includes(4) && !bikeDays.includes(4)) set(4, "rest", "Rest");

  easyIdx.forEach((i, n) => {
    const easyKm = Math.max(3, split.easies[n] || 4);
    set(i, "run", `Run ${easyKm} easy`, easyKm);
  });
  if (qualityIdx != null && split.quality) set(qualityIdx, "quality", `Quality ${split.quality}`, split.quality);
  if (longIdx != null) set(longIdx, "long", `Long ${longKm} easy`, longKm);

  swimDays.forEach((i, n) => {
    addOn(i, { kind: "swim", label: n === 0 ? "Swim technique" : "Walk + swim", short: n === 0 ? "swim" : "swim", km: undefined });
  });
  bikeDays.forEach((i) => {
    addOn(i, { kind: "bike", label: bikeLabel(sport, phase, distances.bike), short: "bike", km: undefined });
  });
  strengthDays.forEach((i) => {
    addOn(i, { kind: days[i][0] === "rest" ? "run" : days[i][0], label: "Strength", short: "strength", km: days[i][2] });
  });
  return days;
}

const EXPERIENCE_LEVELS = ["beginner", "intermediate", "advanced"];

window.trainingAdvice = function trainingAdvice(sport, presetId, custom, experience) {
  let runKm = 0;
  if (presetId) {
    try { runKm = resolveDistances(sport, presetId, custom || {}).run || 0; } catch { runKm = 0; }
  }
  const isRunSport = sport === "run" || sport === "triathlon";
  const level = EXPERIENCE_LEVELS.includes(experience) ? experience : "intermediate";
  let minDays = 3, recDays = 3, event = "this event";
  if (runKm >= 42 || presetId === "volledige") {
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
  const strengthStrong = runKm >= 21 || sport === "triathlon";
  const strengthRecommended = strengthStrong || runKm >= 16;
  const levelLabel = level === "beginner" ? "a beginner" : level === "advanced" ? "an advanced runner" : "an intermediate runner";
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
        ? `For ${event}, ${levelLabel} usually needs ${minDays} run days as a minimum — ${recDays} is better, so each run stays shorter. Beginners can sit at the low end while volume is still small; advanced runners add days rather than making each run much longer.`
        : `For ${event}, ${levelLabel} is fine on ${recDays} run days a week. Extra easy days help if the extra kilometres stay easy.`,
    strengthHint: !presetId ? "Pick a distance first. Strength matters more as the race gets longer."
      : strengthStrong
        ? "Strongly recommended at this distance: 1–2 short sessions a week cut overuse injuries by about half and improve running economy."
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

function weaveEventIntoWeek(weeks, start, ev) {
  const date = pgParse(ev.date);
  if (Number.isNaN(date.getTime())) return;
  const wk = Math.floor(pgDays(start, date) / 7) + 1;
  const week = weeks[wk - 1];
  if (!week || wk >= weeks.length) return;
  const dayIdx = (date.getDay() + 6) % 7;
  const longIdx = week.days.findIndex((d) => d[0] === "long" || d[0] === "event" || d[0] === "race");
  const evKm = Number(ev.km) || 0;
  let km = evKm || week.long;
  let label = `${ev.name}${evKm ? ` ${evKm} km` : ""}`;
  if (evKm > 0 && week.long > evKm + 3 && evKm <= 16) {
    const extra = week.long - evKm;
    const pre = Math.round(extra / 2);
    const post = extra - pre;
    label = `${ev.name}: ${pre} + ${evKm} + ${post} = ${week.long} km`;
    km = week.long;
  }
  week.days[dayIdx] = ["event", label, km];
  week.long = Math.max(week.long || 0, km);
  week.focus = week.focus && week.focus.includes(ev.name) ? week.focus : ev.name;
  const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const bits = [`${ev.name} on ${names[dayIdx]} is this week's long.`];
  if (longIdx >= 0 && longIdx !== dayIdx) {
    week.days[longIdx] = ["rest", longIdx === dayIdx - 1 ? "Rest (protect event)" : "Rest / easy walk"];
    bits.push(`The planned long on ${names[longIdx]} comes out so you don't stack two longs.`);
  }
  if (dayIdx > 0 && ["long", "quality"].includes(week.days[dayIdx - 1][0])) {
    week.days[dayIdx - 1] = ["rest", "Rest (protect event)"];
  }
  week.note = [week.note, bits.join(" ")].filter(Boolean).join(" ");
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
  if (sport === "swim") return [["Easy", "Conversational effort", "Most of the volume"], ["Threshold", "Controlled hard", "Short sets"]];
  if (sport === "bike") return [["Easy", "Z2 / can talk", "Most rides"], ["Long", "Steady endurance", "Weekend ride"]];
  return [
    ["Easy / long", "Comfortably conversational", "Most km"],
    ["Steady / cruise", "Controlled, not racing", "Mid-week quality"],
    ["Race pace", "Goal event effort", "Short segments late in the plan"],
    ["Strides", "Fast but relaxed", "6–8 × 20 sec"],
  ];
}

window.generateTrainingPlan = function generateTrainingPlan(input) {
  const goalType = input.goalType === "time" || input.goalType === "fitness" ? input.goalType : "race";
  let sport = input.sport;
  let preset = input.preset;
  let eventName = String(input.eventName || "").trim();
  let eventDate = input.eventDate;
  const today = new Date();
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  if (goalType === "time") {
    sport = "run";
    const customTime = String(input.customTime || "").trim();
    const customKm = Number(input.custom?.run);
    const isCustom = input.preset === "custom" || input.timeGoal === "custom";
    if (isCustom) {
      preset = input.preset === "custom" ? "custom" : input.preset;
      if (preset === "custom" && !(customKm > 0)) throw new Error("Enter the run distance in km.");
      if (!customTime) throw new Error("Enter a target time.");
      eventName = eventName || (typeof window.timeGoalName === "function"
        ? window.timeGoalName("custom", { time: customTime, run: customKm, preset })
        : customTime);
    } else {
      const goal = (window.TIME_GOALS || []).find((g) => g.id === input.timeGoal);
      if (!goal) throw new Error("Choose a time goal.");
      preset = goal.preset;
      eventName = eventName || (typeof window.timeGoalName === "function" ? window.timeGoalName(goal) : goal.label);
    }
  }
  if (goalType === "fitness") {
    if (!["run", "swim", "bike", "triathlon"].includes(sport)) throw new Error("Choose a focus.");
    preset = sport === "run" ? "10k" : sport === "swim" ? "1500" : sport === "bike" ? "40" : "halve";
    eventName = eventName || "General fitness";
    const weeks = (window.FITNESS_WEEKS || [8, 12, 16]).includes(Number(input.fitnessWeeks))
      ? Number(input.fitnessWeeks)
      : 12;
    if (!eventDate) eventDate = pgYmd(pgAdd(todayDate, weeks * 7));
  }

  const distances = resolveDistances(sport, preset, input.custom || {});
  const weekly = Number(input.weeklyKm);
  if (!(weekly > 0) || weekly > 200) throw new Error("Enter your current weekly kilometres (1–200).");
  eventName = eventName || distances.label;
  const race = pgParse(eventDate);
  if (Number.isNaN(race.getTime())) throw new Error(goalType === "time" ? "Pick a target date." : "Pick an event date.");
  if (race < todayDate) throw new Error(goalType === "time" ? "Target date needs to be in the future." : "Event date needs to be in the future.");
  const isFitness = goalType === "fitness";

  let start = pgMonday(todayDate);
  let n = Math.floor(pgDays(start, pgMonday(race)) / 7) + 1;
  if (n > 32) {
    start = pgAdd(pgMonday(race), -31 * 7);
    n = 32;
  }
  if (n < 4) n = Math.max(4, n);

  const wantsRunDays = sport === "run" || sport === "triathlon";
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
  if (wantsRunDays && !runWeekdays.length && !(Number(input.runDays) > 0)) throw new Error("Choose which days you want to run.");

  const peak = peakVolume(sport, weekly, distances.run || 0);
  const phases = assignPhases(n);
  const taper = phases.find((p) => p.name === "Taper");
  const targets = weekTargets(n, weekly, peak, taper ? taper.from : n - 1);
  const cap = longCap(sport, distances.run || 0, weekly);
  const raceDay = (race.getDay() + 6) % 7;
  const dayOpts = {
    runDays: runDaysN || 3,
    strength,
    runWeekdays,
    strengthWeekdays,
    swimWeekdays,
    bikeWeekdays,
    busyWeekdays,
  };

  const weeks = targets.map((km, i) => {
    const wk = i + 1;
    const phase = phases.find((p) => wk >= p.from && wk <= p.to) || phases[0];
    const isRaceWeek = !isFitness && wk === n;
    const longKm = isRaceWeek
      ? (distances.run || distances.bike || Math.round((distances.swim || 1000) / 1000))
      : Math.min(cap, Math.max(sport === "swim" ? 0.8 : 6, Math.round(km * 0.38)));
    const extras = [];
    if (wantsRunDays) extras.push(`${runDaysN} run days`);
    if (strength && wantsRunDays) extras.push("strength after an easy run");
    if (busyWeekdays.length) extras.push(`${busyWeekdays.length} busy day${busyWeekdays.length > 1 ? "s" : ""}/week`);
    const days = daysFor(sport, phase.name, km, longKm, raceDay, isRaceWeek, { ...distances, label: eventName }, dayOpts);
    busyWeekdays.forEach((d) => {
      if (!isRaceWeek || d !== raceDay) days[d] = ["rest", "Busy"];
    });
    return {
      wk,
      phase: phase.name,
      km,
      long: longKm,
      swim: swimLabel(sport, phase.name, distances.swim),
      bike: bikeLabel(sport, phase.name, distances.bike),
      focus: isFitness && wk === n ? "Keep the habit and finish the block easy" : isRaceWeek ? "Race week" : phase.focus,
      note: wk === 1 ? `Built from ${weekly} km/week toward ${eventName}${extras.length ? `, ${extras.join(", ")}` : ""}. Weekly load rises about 10% max, with a cutback every 4th week.` : undefined,
      days,
    };
  });

  const otherEvents = (input.otherEvents || []).filter((e) => e && e.date && e.name && e.date !== pgYmd(race));
  const before = otherEvents.filter((e) => e.date >= pgYmd(start) && e.date < pgYmd(race));
  const after = otherEvents.filter((e) => e.date > pgYmd(race));
  before.forEach((ev) => weaveEventIntoWeek(weeks, start, ev));

  return {
    sport,
    distance_preset: input.preset,
    event_name: eventName,
    event_date: pgYmd(race),
    start_date: pgYmd(start),
    swim_m: distances.swim,
    bike_km: distances.bike,
    run_km: distances.run,
    weekly_km: weekly,
    run_days: runDaysN,
    include_strength: wantsRunDays ? strength : !!strength,
    run_weekdays: runWeekdays,
    strength_weekdays: strengthWeekdays,
    swim_weekdays: swimWeekdays,
    bike_weekdays: bikeWeekdays,
    notes: "",
    experience,
    phases,
    weeks,
    paces: defaultPaces(sport),
    roadmap: buildRoadmap(after, race, eventName),
  };
};
