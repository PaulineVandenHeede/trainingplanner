// Session explanations and rule-based feedback. Loaded before app.js; uses its helpers at call time.

const DEFAULT_EASY = { lo: 410, hi: 450, mid: 430 }; // 6:50–7:30
const DEFAULT_STEADY = { lo: 380, hi: 400, mid: 390 }; // 6:20–6:40
const DEFAULT_MP = { lo: 383, hi: 385, mid: 384 }; // ~6:24

function parsePaceSpec(text) {
  const parts = String(text || "").match(/(\d+):(\d{2})/g) || [];
  const secs = parts.map((p) => {
    const [m, s] = p.split(":").map(Number);
    return m * 60 + s;
  }).filter((n) => n > 0);
  if (!secs.length) return null;
  const lo = Math.min(...secs);
  const hi = Math.max(...secs);
  return { lo, hi, mid: Math.round((lo + hi) / 2) };
}

function planPace(matcher, fallback) {
  const rows = Array.isArray(window.PACES) ? window.PACES : [];
  const row = rows.find((p) => matcher.test(String(p[0] || "")));
  return parsePaceSpec(row && row[1]) || fallback;
}

function easyZone() {
  const p = planPace(/easy|long/i, DEFAULT_EASY);
  return [p.lo, p.hi];
}
function easyRange() {
  const [lo, hi] = easyZone();
  return `${fmtPace(lo)}–${fmtPace(hi)}`;
}
function steadyPace() { return planPace(/steady|cruise/i, DEFAULT_STEADY); }
function mpPace() { return planPace(/marathon|race pace/i, DEFAULT_MP); }
function fmtClock(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `${h}:${String(m).padStart(2, "0")}` : `${m}:00`;
}
function raceGoalClock() { return fmtClock(Math.round(mpPace().mid * 42.195)); }
function raceSolidBand() {
  const goal = Math.round(mpPace().mid * 42.195);
  return `${fmtClock(goal + 300)}–${fmtClock(goal + 1200)}`;
}

const GUIDES = {
  easy: {
    title: "Easy run",
    why: "Builds aerobic base and durability with little fatigue. Most of your weekly km should feel like this.",
    how: [
      "Start slower than you think; let the first 1–2 km be the slowest.",
      "Stay conversational: you should be able to talk in full sentences.",
      "If HR drifts up on hills or in heat, slow down. Effort matters more than pace.",
    ],
    targets: [["Pace", "Easy zone"], ["Effort", "Conversational, RPE 3/10"], ["Shoes", "Daily trainer"]],
  },
  strides: {
    title: "Strides",
    why: "Short relaxed accelerations that keep your legs used to faster turnover without adding fatigue.",
    how: [
      "After the easy run, on flat ground: 6–8 × 20 seconds.",
      "Build up to about 5K effort over the first 5–10 seconds, hold it relaxed, then ease off.",
      "Walk or jog 40–60 seconds between each one. Tall posture, quick light feet.",
      "Never a sprint: smooth and controlled.",
    ],
    targets: [["Reps", "6–8 × 20 sec"], ["Recovery", "40–60 sec walk/jog"]],
  },
  steady: {
    title: "Steady blocks (first quality)",
    why: "A first taste of controlled, faster aerobic running. It teaches rhythm at a pace a bit quicker than marathon pace.",
    how: [
      "Warm up 2–3 km easy.",
      "Run 2 × 10 minutes steady with 3 minutes easy jogging in between.",
      "Cool down easy for the remaining km.",
      "Steady = comfortably hard; you can speak short sentences.",
    ],
    targets: [["Steady pace", "Steady / cruise"], ["Shoes", "Faster pair if you have one"]],
  },
  cruise: {
    title: "Cruise intervals",
    why: "Raises the pace you can sustain aerobically and makes marathon pace feel easier.",
    how: [
      "Warm up 2–3 km easy, plus 3–4 strides.",
      "5 × 6 minutes at cruise pace, with 90 seconds easy jog between.",
      "Cool down 1–2 km easy.",
      "Even splits: the last rep should be as fast as the first, not faster.",
    ],
    targets: [["Cruise pace", "Steady / cruise"], ["Recovery", "90 sec jog"], ["Shoes", "Faster pair if you have one"]],
  },
  quality: {
    title: "Thursday quality run",
    why: "The one harder run of the week during build and peak. It develops marathon-specific fitness.",
    how: [
      "Warm up 2–3 km easy.",
      "Main set, rotating weekly: 3 × 2 km at marathon pace, 5 × 6' cruise, or 20–25' steady.",
      "Cool down easy to reach the total distance.",
      "If you're tired or the Saturday long is at risk, make it an easy run instead.",
    ],
    targets: [["MP", "Marathon pace"], ["Cruise", "Steady / cruise"], ["Shoes", "Faster pair if you have one"]],
  },
  shortMP: {
    title: "Easy run with a short MP block",
    why: "Keeps marathon pace familiar during the taper without adding fatigue.",
    how: ["Mostly easy, with 2–3 km at marathon pace in the middle.", "Stop the MP block early if it feels hard."],
    targets: [["MP", "Marathon pace"]],
  },
  long: {
    title: "Long run",
    why: "The key session of the week: builds endurance, fat use and the durability to cover 42.2 km.",
    how: [
      "Run the whole thing easy and even; the last km should feel like the first.",
      "Bring water for runs over 75–90 minutes.",
      "Over 90 minutes, practise fuelling: a gel or chews every 30–40 minutes.",
      "Easy walk and food within an hour afterwards.",
    ],
    targets: [["Pace", "Easy zone"], ["Effort", "Conversational throughout"], ["Shoes", "Daily trainer (faster pair if there's MP work)"]],
  },
  longMP: {
    title: "Long run with marathon-pace segment",
    why: "Rehearses race pace on tired legs so the goal from your plan gets tested.",
    how: [
      "Run the first part easy.",
      "Then the marathon-pace km. If you can't hold it at a controlled effort, that's information, not failure.",
      "Run the race-day fuelling plan: 30–60 g carbs per hour.",
      "Ease back to easy pace for any km after the MP block.",
    ],
    targets: [["Easy part", "Easy zone"], ["MP", "Marathon pace"], ["Shoes", "Faster pair if you have one"]],
  },
  fuel: {
    title: "Fuelling practice",
    why: "Your gut needs training too. Practise in long runs so race day holds no surprises.",
    how: ["Aim for 30–60 g carbs per hour, starting at 30–40 minutes.", "Use the gel brand that's on the race course if possible.", "Note what worked and what didn't."],
    targets: [["Carbs", "30–60 g / hour"]],
  },
  strength: {
    title: "Strength & stability (bodyweight, 25–30 min)",
    why: "Stronger feet, calves and hips keep your knees tracking well when you're tired, which matters more as the long runs grow. Right after the Monday run, so Tuesday and Wednesday stay recovery days.",
    how: [
      "Warm-up: ankle circles, leg swings, 10 squats, 10 glute bridges.",
      "Feet & ankles (1 round): arch doming 10 × 5 s per foot, toe yoga 10 per foot, single-leg balance 3 × 30–45 s (eyes closed or on a pillow as it gets easy), single-leg calf raises on a step 12–15 per leg with straight knee and again with bent knee, 3 s down.",
      "Knees & hips (2–3 rounds, 60 s rest): reverse lunge 8–10 per leg, slow step-down from a stair 8 per leg, single-leg glute bridge 10 per leg, single-leg Romanian deadlift 8 per leg, side-lying leg raise or clamshell 12–15 per leg.",
      "Core: side plank 30 s per side, dead bug 8 per side.",
      "Weeks 3–4: 2 rounds, learn the form. Weeks 5–12: 3 rounds, plus pogo hops 2×20 from week 7. Build/peak: 2–3 rounds with slow 3 s lowering; 2 rounds in cutback weeks. Taper: light, no hops.",
      "Stop each set 2–3 reps before failure. Knee or Achilles pain (not muscle tiredness): skip that exercise.",
    ],
    targets: [["Equipment", "None: stair, wall, pillow"], ["Knee cue", "Knee over 2nd toe, no caving in"], ["Fallback day", "Sunday, 2 rounds (never Friday)"]],
  },
  strengthHome: {
    title: "Strength & stability (home kit, 25–35 min)",
    why: "Loaded hip hinges and single-leg work build tendon resilience without a gym. Use your kettlebell, dumbbells or bands after an easy run so quality days stay fresh.",
    how: [
      "Warm-up: ankle circles, leg swings, 10 bodyweight squats, 8 hip hinges with a light load.",
      "Feet & calves (1 round): single-leg calf raises on a step 12–15 per leg (straight and bent knee), arch doming 10 × 5 s, single-leg balance 3 × 30–45 s.",
      "Main (2–3 rounds, 60–90 s rest): goblet squat or banded squat 8–10, single-leg Romanian deadlift 8 per leg (kettlebell/dumbbell), reverse lunge or split squat 8 per leg, band pull-apart or face-pull 12–15, optional pull-up / band row 5–8.",
      "Core: side plank 30–40 s per side, dead bug or pallof press 8 per side.",
      "Progress by slowing the lower (3 s), then adding load. Cutback weeks: 2 rounds. Taper: bodyweight only, no jumps.",
      "Stop 2–3 reps before failure. Sharp knee or Achilles pain: drop the load or skip that move.",
    ],
    targets: [["Equipment", "Kettlebell / dumbbells / bands"], ["Knee cue", "Knee over 2nd toe"], ["Fallback", "Bodyweight session if travelling"]],
  },
  strengthGym: {
    title: "Strength & stability (gym, 30–40 min)",
    why: "A short gym block after easy running covers hips, calves and posterior chain with machines or free weights — keep it submaximal so it supports mileage instead of stealing from it.",
    how: [
      "Warm-up: 5 min easy bike or row, ankle circles, 10 bodyweight squats, 8 hip hinges.",
      "Main (2–3 rounds, 90 s rest): goblet or back squat 6–8, Romanian deadlift or hip hinge machine 6–8, walking lunge or split squat 8 per leg, calf raise (straight + bent knee) 12–15, lat pulldown or assisted pull-up 8–10, optional hip abduction 12–15.",
      "Core: side plank 30–40 s per side, dead bug or cable anti-rotation 8 per side.",
      "Leave 2–3 reps in reserve on every set. No max lifts, no failure, no novel PRs in build/peak weeks.",
      "Cutback / travel: swap to the home or bodyweight session. Taper: 1 light round or skip.",
    ],
    targets: [["Equipment", "Full gym"], ["Effort", "RPE 6–7, never failure"], ["Fallback", "Home kit or bodyweight"]],
  },
  walk: {
    title: "Office walk",
    why: "Active recovery on office days. It keeps blood flowing and adds easy aerobic time without running stress.",
    how: ["Your normal commute walks count.", "No need to push the pace."],
    targets: [],
  },
  swimA: {
    title: "Main swim: Session A (30–50 min)",
    why: "Builds the swim habit and technique for the 70.3 (1.9 km). Low impact, so it supports running recovery.",
    how: [
      "Warm-up (~8 min): 200 m easy freestyle (or 4×50), then 4×50 as 25 drill / 25 easy with 20 s rest.",
      "Rotate drills: catch-up (hands meet in front), fingertip drag (fingers trail the surface on recovery), 6-kick switch (kick on your side, switch after 6 kicks), single-arm freestyle.",
      "Main: 4–6 × 100 easy freestyle with 20–30 s rest, or 10–15 minutes continuous easy.",
      "Cool-down: 100–200 m easy.",
    ],
    targets: [["Effort", "Easy, smooth, long strokes"], ["Track", "Swolf (lower = more efficient)"]],
  },
  swimB: {
    title: "Short technique swim: Session B (20–30 min)",
    why: "Technique work when you're tired or short on time. Low effort, lots of focus on form; it makes the main swim more efficient.",
    how: [
      "200 m very easy to warm up.",
      "6 × 50 as 25 drill / 25 swim, 20 s rest. Pick 2 drills: catch-up and 6-kick switch.",
      "4 × 50 kick with a board, relaxed, kicking from the hips.",
      "4 × 50 counting strokes per length; try to take 1–2 fewer strokes with a longer glide.",
      "100 m easy to finish.",
    ],
    targets: [["Effort", "Very easy"], ["Focus", "Long body, relaxed breathing, glide"]],
  },
  bike: {
    title: "Easy bike",
    why: "Aerobic volume and a head start on 70.3 bike fitness without running impact. Easy only until the marathon.",
    how: [
      "Conversational the whole way: you could chat with a riding partner.",
      "Spin a light gear at 85–95 rpm rather than pushing big gears.",
      "No intervals, no hammer group rides.",
      "If your legs are heavy from the long run, shorten it or skip it.",
    ],
    targets: [["Effort", "Easy, RPE 3/10"], ["Cadence", "85–95 rpm"]],
  },
  rest: {
    title: "Rest day",
    why: "Adaptation happens during rest. Rest the day before the long run protects the most important session.",
    how: ["Normal daily walking is fine.", "Sleep, eat well, hydrate.", "Optional: 10 minutes of mobility or stretching."],
    targets: [],
  },
  backup: {
    title: "Off, or backup long run",
    why: "Sunday stays free unless Saturday's long run didn't happen.",
    how: ["If Saturday's long got done: rest.", "If not: run the planned long today. Don't do both."],
    targets: [],
  },
  travel: {
    title: "Travel day",
    why: "Sightseeing on foot is plenty of activity. Moving the long run earlier means nothing is lost.",
    how: ["No make-up runs.", "Walk as much as you like; comfortable shoes.", "Hydrate; travel days dry you out."],
    targets: [],
  },
  ski: {
    title: "Ski day",
    why: "Ski days are real training: lots of eccentric load on the quads. That replaces the run, bike and swim — it does not sit on top of them.",
    how: [
      "Ski is the session. Do not add a long run or a quality run on ski days.",
      "The day after a long run, keep skiing easy: shorter, gentler slopes.",
      "If a day is a ski rest and legs feel springy, an easy 6–8 km jog is optional. Never a long or a workout.",
      "Eat and sleep like a training week. Alpine days dehydrate you.",
    ],
    targets: [["Effort", "Ski as the day's sport"], ["Optional run", "Easy 6–8 km, rest-day only"]],
  },
  event: {
    title: "Event run",
    why: "A fun way to get the long run done. It counts as training, so run it at your planned effort, not race effort.",
    how: [
      "Start easier than the pack and settle into the easy pace from your plan.",
      "On trails, shorten your stride on technical parts and walk steep climbs. That's normal.",
      "Water at aid stations; no gels needed for shorter events.",
      "If extra km are planned, run them easy before the start (they double as a warm-up).",
    ],
    targets: [["Pace", "~7:00 /km"], ["Effort", "Easy / conversational"]],
  },
  race: {
    title: "Marathon race day",
    why: "Everything comes together. Pace targets get confirmed by the December–January long runs.",
    how: [
      "First 5 km slightly slower than goal pace; let the crowd go.",
      "Settle at goal pace only if the build longs confirmed it.",
      "Fuel from 30–40 minutes: 30–60 g carbs per hour, water at every station.",
      "From 30 km: hold form, run the mile you're in.",
    ],
    targets: [["Goal", "Aspirational from plan paces"], ["Solid band", "See pace guide"], ["Shoes", "Race pair"]],
  },
};

function paceUnitSuffix() {
  return typeof window.isImperial === "function" && window.isImperial() ? "/mi" : "/km";
}

function displayPaceRange(range) {
  const text = String(range || "");
  if (!(typeof window.isImperial === "function" && window.isImperial())) return text;
  return text.replace(/\d+:\d{2}/g, (m) => {
    const parts = m.split(":").map(Number);
    if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return m;
    const sec = parts[0] * 60 + parts[1];
    const mi = Math.round(sec * 1.609344);
    return `${Math.floor(mi / 60)}:${String(mi % 60).padStart(2, "0")}`;
  });
}

function stampPaces(guide) {
  const z = paceZones();
  const unit = paceUnitSuffix();
  const map = {
    "Easy zone": `${displayPaceRange(z.easy.range)} ${unit}`,
    "Steady / cruise": `${displayPaceRange(z.steady.range)} ${unit}`,
    "Marathon pace": `${displayPaceRange(z.mp.range)} ${unit}`,
    "Aspirational from plan paces": `${raceGoalClock()} (aspirational)`,
    "See pace guide": raceSolidBand(),
  };
  return {
    ...guide,
    targets: (guide.targets || []).map(([k, v]) => [k, map[v] || v]),
  };
}

function strengthGuideForAccess() {
  const level = typeof window.strengthAccessLevel === "function" ? window.strengthAccessLevel() : "bodyweight";
  if (level === "gym") return GUIDES.strengthGym;
  if (level === "home") return GUIDES.strengthHome;
  return GUIDES.strength;
}

function guidesFor(kind, label) {
  const l = label.toLowerCase();
  let out;
  if (kind === "race") out = [GUIDES.race];
  else if (kind === "event") out = [GUIDES.event];
  else if (kind === "travel") out = /ski/.test(l) ? [GUIDES.ski] : [GUIDES.travel];
  else if (kind === "bike") out = [GUIDES.bike];
  else if (kind === "walkswim") out = [GUIDES.swimA, GUIDES.walk];
  else if (kind === "walk") out = /swim/.test(l) ? [GUIDES.walk, { ...GUIDES.swimB, title: GUIDES.swimB.title + " (optional)" }] : [GUIDES.walk];
  else if (kind === "rest") out = /backup/.test(l) ? [GUIDES.backup] : /shakeout/.test(l) ? [GUIDES.rest, { ...GUIDES.easy, title: "Optional 20' shakeout" }] : [GUIDES.rest];
  else if (kind === "long") {
    out = [/@ ?mp/.test(l) ? GUIDES.longMP : GUIDES.long];
    if (/fuel/.test(l)) out.push(GUIDES.fuel);
  } else if (kind === "quality") {
    if (/steady/.test(l)) out = [GUIDES.steady];
    else if (/cruise/.test(l)) out = [GUIDES.cruise];
    else out = [GUIDES.quality];
  } else {
    out = /short mp/.test(l) ? [GUIDES.shortMP] : /strides/.test(l) ? [GUIDES.easy, GUIDES.strides] : [GUIDES.easy];
    if (/strength/.test(l)) out.push(strengthGuideForAccess());
  }
  return out.map(stampPaces);
}

// ---------- Planned session pace profile ----------

function paceZones() {
  const easy = planPace(/easy|long/i, DEFAULT_EASY);
  const steady = steadyPace();
  const mp = mpPace();
  const settle = Math.round((easy.mid + mp.mid) / 2);
  return {
    easy: { sec: easy.mid, range: `${fmtPace(easy.lo)}–${fmtPace(easy.hi)}`, label: "Easy" },
    event: { sec: easy.mid, range: `~${fmtPace(easy.mid)}`, label: "Event" },
    settle: { sec: settle, range: `~${fmtPace(settle)}`, label: "Settle in" },
    steady: { sec: steady.mid, range: `${fmtPace(steady.lo)}–${fmtPace(steady.hi)}`, label: "Steady" },
    cruise: { sec: steady.mid, range: `${fmtPace(steady.lo)}–${fmtPace(steady.hi)}`, label: "Cruise" },
    mp: { sec: mp.mid, range: `~${fmtPace(mp.mid)}`, label: "Marathon pace" },
    stride: { sec: 300, range: "fast / relaxed", label: "Stride" },
  };
}

function minutesToKm(minutes, zone) {
  return minutes / (paceZones()[zone].sec / 60);
}

function finishSegments(raw, totalKm) {
  const segments = raw.map((s) => {
    const km = s.km != null ? s.km : minutesToKm(s.minutes, s.zone);
    return { name: s.name || "", km: Math.round(km * 100) / 100, zone: s.zone };
  }).filter((s) => s.km > 0);
  if (totalKm) {
    const used = segments.reduce((sum, s) => sum + s.km, 0);
    const left = Math.round((totalKm - used) * 100) / 100;
    if (left >= 0.3) segments.push({ name: "Cool-down", km: left, zone: "easy" });
  }
  return segments;
}

function sessionProfile(kind, label, km) {
  const l = String(label || "").toLowerCase();
  const total = Number(km) || 0;

  if (/strides/.test(l) && (kind === "run" || kind === "quality")) {
    const reps = Number((l.match(/(\d+)\s*[×x]\s*20/) || [])[1] || 6);
    const easyKm = Math.max(3, total || 6);
    const raw = [{ name: "Easy", km: easyKm, zone: "easy" }];
    for (let i = 0; i < reps; i++) {
      raw.push({ name: i === 0 ? "Strides" : "", minutes: 20 / 60, zone: "stride" });
      raw.push({ name: "", minutes: 50 / 60, zone: "easy" });
    }
    return { title: "Easy run + strides", segments: finishSegments(raw) };
  }

  if (kind === "quality" || /(\d+)\s*[×x]\s*10/.test(l) || /cruise/.test(l)) {
    if (/(\d+)\s*[×x]\s*10/.test(l) || (kind === "quality" && /steady/.test(l))) {
      const n = Number((l.match(/(\d+)\s*[×x]\s*10/) || [])[1] || 2);
      const raw = [{ name: "Warm-up", km: 2.2, zone: "easy" }];
      for (let i = 0; i < n; i++) {
        if (i) raw.push({ name: "Easy jog", minutes: 3, zone: "easy" });
        raw.push({ name: i === 0 ? `${n} × 10 min steady` : "", minutes: 10, zone: "steady" });
      }
      return { title: "Steady blocks", segments: finishSegments(raw, total || 8) };
    }
    if (/cruise/.test(l)) {
      const n = Number((l.match(/(\d+)\s*[×x]\s*6/) || [])[1] || 5);
      const raw = [{ name: "Warm-up", km: 2.2, zone: "easy" }];
      for (let i = 0; i < n; i++) {
        if (i) raw.push({ name: "Jog", minutes: 1.5, zone: "easy" });
        raw.push({ name: i === 0 ? `${n} × 6 min cruise` : "", minutes: 6, zone: "cruise" });
      }
      return { title: "Cruise intervals", segments: finishSegments(raw, total || 10) };
    }
    if (kind === "quality") {
      const raw = [{ name: "Warm-up", km: 2.2, zone: "easy" }];
      for (let i = 0; i < 3; i++) {
        if (i) raw.push({ name: "Jog", minutes: 2, zone: "easy" });
        raw.push({ name: i === 0 ? "3 × 2 km @ MP" : "", km: 2, zone: "mp" });
      }
      return { title: "Quality (typical MP reps)", segments: finishSegments(raw, total || 10) };
    }
  }

  if (/short mp/.test(l)) {
    const t = total || 8;
    const mpKm = 2.5;
    const easy = (t - mpKm) / 2;
    return {
      title: "Easy with a short MP block",
      segments: finishSegments([
        { name: "Easy", km: easy, zone: "easy" },
        { name: "Marathon pace", km: mpKm, zone: "mp" },
        { name: "Easy", km: easy, zone: "easy" },
      ]),
    };
  }

  const lastMp = l.match(/last\s+(\d+(?:\.\d+)?)\s*@\s*mp/);
  const midMp = l.match(/(\d+)(?:–(\d+))?\s*@\s*mp/);
  if ((kind === "long" || kind === "event") && (lastMp || midMp)) {
    const t = total || Number((l.match(/(\d+(?:\.\d+)?)\s*km/) || [])[1] || 20);
    const lo = Number((lastMp || midMp)[1]);
    const hi = Number((lastMp || midMp)[2] || lo);
    const mpKm = (lo + hi) / 2;
    const easyKm = Math.max(0.5, t - mpKm);
    if (lastMp || /last/.test(l)) {
      return {
        title: "Long run · MP at the end",
        segments: finishSegments([
          { name: "Easy", km: easyKm, zone: "easy" },
          { name: `${lo === hi ? lo : `${lo}–${hi}`} km @ MP`, km: mpKm, zone: "mp" },
        ]),
      };
    }
    return {
      title: "Long run · MP in the middle",
      segments: finishSegments([
        { name: "Easy", km: easyKm * 0.62, zone: "easy" },
        { name: `${lo === hi ? lo : `${lo}–${hi}`} km @ MP`, km: mpKm, zone: "mp" },
        { name: "Easy", km: easyKm * 0.38, zone: "easy" },
      ]),
    };
  }

  if (kind === "race") {
    return {
      title: "Race pace shape",
      segments: finishSegments([
        { name: "First 5 km, slightly slower", km: 5, zone: "settle" },
        { name: "Goal pace", km: Math.max(5, (total || 42.2) - 5), zone: "mp" },
      ]),
    };
  }

  return null;
}

// ---------- Busy days ----------

const FREE_KINDS = ["rest", "walk", "walkswim", "bike"];

function freeDaysInWeek(week, skip) {
  const s = weekStart(week.wk);
  return week.days
    .map(([kind], i) => ({ i, kind, ds: ymd(addDays(s, i)) }))
    .filter((d) => d.i !== skip && FREE_KINDS.includes(d.kind) && !BUSY[d.ds] && parseDate(d.ds) >= today());
}

const dayName = (week, i) => `${(typeof DAY_NAMES === "function" ? DAY_NAMES() : DAY_NAMES)[i]} ${short(addDays(weekStart(week.wk), i))}`;

function busySuggestion(week, i) {
  const [kind, label] = week.days[i];
  const free = freeDaysInWeek(week, i);
  const longIdx = week.days.findIndex(([k], j) => j !== i && ["long", "event", "race"].includes(k));
  const notNextToLong = free.filter((d) => longIdx === -1 || Math.abs(d.i - longIdx) > 1);

  if (kind === "long" || kind === "event") {
    const pref = [6, 4, 5, 3, 0, 2, 1].map((j) => free.find((d) => d.i === j)).filter(Boolean);
    if (pref.length) return `This is the week's key session (${label}). Suggestion: move it to ${dayName(week, pref[0].i)} and keep the day before it easy or off.`;
    return `This is the week's key session (${label}) and there's no free day left this week. Suggestion: run a shorter version (about 70%) on the nearest free day rather than dropping it.`;
  }
  if (kind === "quality") {
    if (notNextToLong.length) return `Suggestion: move the quality run to ${dayName(week, notNextToLong[0].i)}, keeping at least one easy day before the long run. If that doesn't fit, run it as an easy run or skip it.`;
    return "Suggestion: skip the quality session this week. The long run matters more.";
  }
  if (kind === "run") return "Suggestion: just skip it. If the week feels light, add 1–2 km to another easy run, but never to the long run.";
  if (kind === "walkswim") {
    const swimDay = free.find((d) => d.kind === "walk");
    return swimDay ? `Suggestion: move the swim to ${dayName(week, swimDay.i)}, or skip it this week. Runs take priority.` : "Suggestion: skip the swim this week. Runs take priority.";
  }
  if (kind === "bike") return "Suggestion: skip it. The bike is the first thing to cut in the marathon block.";
  return "Nothing to move: no training was planned today.";
}

// ---------- Feedback ----------

const toSec = (pace) => {
  if (!pace) return null;
  const [m, s] = pace.split(":").map(Number);
  return isNaN(m) || isNaN(s) ? null : m * 60 + s;
};
const fmtPace = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};
const num = (v) => {
  const n = parseFloat(String(v ?? "").replace(/[',]/g, ""));
  return isNaN(n) ? null : n;
};
const minutes = (t) => {
  if (!t || t.includes("-")) return null;
  const parts = t.split(":").map(Number);
  return parts.length === 3 ? parts[0] * 60 + parts[1] + parts[2] / 60 : parts[0] + parts[1] / 60;
};

function teText(te) {
  if (te == null) return "";
  if (te < 2) return `Aerobic TE ${te}: a recovery-level stimulus.`;
  if (te < 3) return `Aerobic TE ${te}: maintains your aerobic fitness.`;
  if (te < 4) return `Aerobic TE ${te}: improving your aerobic base, ideal for easy and long runs.`;
  if (te < 5) return `Aerobic TE ${te}: highly improving. That's more than an easy day usually needs.`;
  return `Aerobic TE ${te}: overreaching. Make sure the next days are easy.`;
}

function recentRuns(acts, act, days = 42) {
  const from = ymd(addDays(parseDate(act.date), -days));
  return acts.filter((a) => a.cat === "run" && a.datetime < act.datetime && a.date >= from);
}

function runFeedback(act, plan, acts) {
  const out = [];
  const pace = toSec(act.pace);
  const hr = num(act.hr);
  const te = num(act.raw["Aerobic TE"]);
  const runKinds = ["run", "quality", "long", "event", "race"];
  const isEasy = plan
    ? ["run", "long", "event"].includes(plan.kind) && !/@ ?mp|quality|steady|cruise/i.test(plan.label)
    : !/tempo|interval|race|threshold|quality/i.test(act.title || "");

  if (!plan && window.CURRENT_PLAN) out.push("This run falls outside the plan window.");
  else if (!plan) out.push(`${act.dist} km run.`);
  else if (!runKinds.includes(plan.kind)) out.push(`No run was planned today (${plan.label.toLowerCase()}). Extra runs are fine occasionally, but recovery days are part of the plan.`);
  else if (plan.km) {
    const diff = act.dist - plan.km;
    if (Math.abs(diff) <= Math.max(0.5, plan.km * 0.08)) out.push(`Distance right on the planned ${plan.km} km.`);
    else if (diff > 0) out.push(`${diff.toFixed(1)} km more than the planned ${plan.km} km. Fine now and then; don't let it become a habit while volume builds.`);
    else out.push(`${Math.abs(diff).toFixed(1)} km short of the planned ${plan.km} km. No need to make it up.`);
  }

  if (pace && isEasy) {
    const [lo, hi] = easyZone();
    if (pace < lo - 5) out.push(`Average pace ${act.pace}/km is quicker than the easy zone (${easyRange()}). Fine if it truly felt easy, but slowing a little keeps easy days easy.`);
    else if (pace > hi + 10) out.push(`Pace ${act.pace}/km is slower than the easy zone, which is completely fine for easy days, especially with hills, heat or tired legs.`);
    else out.push(`Pace ${act.pace}/km sits in the easy zone.`);
  } else if (pace && plan && plan.kind === "quality") {
    out.push(`Average pace ${act.pace}/km includes warm-up and cool-down; check the laps for the work segments (target ${paceZones().steady.range}).`);
  }

  const prev = recentRuns(acts, act);
  const hrBase = median(prev.map((a) => num(a.hr)).filter(Boolean));
  if (hr && hrBase && prev.length >= 3) {
    const d = hr - hrBase;
    if (d <= -4) out.push(`Average HR ${hr} is ${Math.abs(d)} bpm below your recent typical (${hrBase}). A sign of growing aerobic efficiency.`);
    else if (d >= 5) out.push(`Average HR ${hr} is ${d} bpm above your recent typical (${hrBase}). Heat, fatigue, stress or pace can all cause that; keep an eye on it.`);
    else out.push(`Average HR ${hr} is in line with your recent runs (~${hrBase}).`);
  }

  if (plan && plan.kind === "long") {
    const lastLong = prev.filter((a) => a.date < ymd(addDays(parseDate(act.date), -3))).sort((a, b) => b.dist - a.dist)[0];
    if (lastLong) out.push(`Previous longest run in the last 6 weeks: ${lastLong.dist} km at ${lastLong.pace}/km, HR ${lastLong.hr}.`);
  }

  if (te != null) {
    out.push(teText(te));
    if (isEasy && te >= 4) out.push("For an easy session that's on the high side. Ease the pace next time.");
  }

  const sameDayBike = acts.find((a) => a.cat === "bike" && a.date === act.date);
  if (sameDayBike && plan && plan.kind === "long") out.push("You also rode on the same day. That stacks load on top of the long run.");
  return out.join(" ");
}

function swimFeedback(act, plan, acts) {
  const out = [];
  const moving = minutes(act.raw["Moving Time"]) ?? minutes(act.time);
  const swolf = num(act.raw["Avg. Swolf"]);
  const planned = plan && /(\d+)(?:–(\d+))?'/.exec(plan.label);
  const bits = [`${act.dist} m`];
  if (moving) bits.push(`in ${Math.round(moving)} minutes of moving time`);
  if (act.pace) bits.push(`averaging ${act.pace}/100 m`);
  out.push(`${bits.join(" ")}.`);
  if (planned) {
    const lo = Number(planned[1]), hi = Number(planned[2] || planned[1]);
    if (moving < lo - 3) out.push(`Planned was ${lo}–${hi} minutes, so a bit short. Next time add a main-set rep or two.`);
    else out.push(`That fits the planned ${lo}–${hi} minutes.`);
  } else if (plan && !/swim/.test(plan.label.toLowerCase())) {
    out.push("An extra swim beyond the plan: easy swimming is good recovery for running legs.");
  }
  const prevSwims = acts.filter((a) => a.cat === "swim" && a.datetime < act.datetime);
  const prevSwolf = median(prevSwims.map((a) => num(a.raw["Avg. Swolf"])).filter(Boolean));
  if (swolf && prevSwolf) {
    const d = swolf - prevSwolf;
    out.push(d < 0 ? `Swolf ${swolf} is better than your usual ${prevSwolf}: more efficient strokes.` : d > 2 ? `Swolf ${swolf} is above your usual ${prevSwolf}; tiredness or more drills can explain that.` : `Swolf ${swolf} is in line with your usual ${prevSwolf}.`);
  } else if (swolf) out.push(`Swolf ${swolf} (time + strokes per length) is your baseline; lower means more efficient.`);
  return out.join(" ");
}

function bikeFeedback(act, plan, acts) {
  const out = [];
  const te = num(act.raw["Aerobic TE"]);
  const mins = minutes(act.raw["Moving Time"]) ?? minutes(act.time);
  const bits = [`${act.dist} km`];
  if (mins) bits.push(`in ${Math.round(mins)} minutes`);
  if (act.pace) bits.push(`at ${act.pace} km/h average`);
  out.push(`${bits.join(" ")}.`);
  if (plan && plan.kind !== "bike") {
    const firstBike = Array.isArray(window.WEEKS) && window.PLAN_START
      ? window.WEEKS.findIndex((w) => w.bike && w.bike !== "—")
      : -1;
    const bikeFrom = firstBike >= 0 ? ymd(addDays(parseDate(window.PLAN_START), firstBike * 7)) : null;
    out.push(bikeFrom && act.date < bikeFrom
      ? `The bike isn't in the plan until ${bikeFrom}, so keep these occasional for now.`
      : "This ride wasn't on today's plan.");
  }
  else if (plan) out.push(`Planned: ${plan.label.toLowerCase()}.`);
  if (te != null) out.push(teText(te));
  if (te >= 4) out.push("Through the marathon block, bike rides should stay easy (TE under ~3.5) so they don't take energy from running.");
  if (acts.some((a) => a.cat === "run" && a.date === act.date && a.dist >= 8)) out.push("Same day as a longer run, which adds a lot of load in one day.");
  return out.join(" ");
}

function activityFeedback(act, plan, acts) {
  if (act.cat === "run") return runFeedback(act, plan, acts);
  if (act.cat === "swim") return swimFeedback(act, plan, acts);
  if (act.cat === "bike") return bikeFeedback(act, plan, acts);
  return `Walk of ${act.dist} km. Counts as active recovery.`;
}

function loggedWeekFeedback(acts, now) {
  const start = addDays(now, -((now.getDay() + 6) % 7));
  const from = ymd(start), to = ymd(addDays(start, 6));
  const weekActs = acts.filter((a) => a.date >= from && a.date <= to);
  const runs = weekActs.filter((a) => a.cat === "run");
  const km = runs.reduce((s, a) => s + (a.dist || 0), 0);
  if (!weekActs.length) return "Nothing logged this week yet. Open a day to mark a session done, or import a Garmin Activities.csv.";
  const out = [`${runs.length} run${runs.length === 1 ? "" : "s"} for ${km.toFixed(1)} km so far this week.`];
  const swims = weekActs.filter((a) => a.cat === "swim").length;
  const bikes = weekActs.filter((a) => a.cat === "bike").length;
  if (swims) out.push(`${swims} swim${swims === 1 ? "" : "s"}.`);
  if (bikes) out.push(`${bikes} ride${bikes === 1 ? "" : "s"}.`);
  const [easyLo] = easyZone();
  const quick = runs.filter((a) => toSec(a.pace) && toSec(a.pace) < easyLo - 5);
  if (runs.length && !quick.length) out.push("Logged run paces look easy.");
  else if (quick.length) out.push(`${quick.length} run${quick.length > 1 ? "s were" : " was"} quicker than ${fmtPace(easyLo)}/km. Keep most days conversational unless it was a quality session.`);
  return out.join(" ");
}

function weekFeedback(week, acts, now) {
  const out = [];
  const s = weekStart(week.wk);
  const daysIn = Math.min(7, daysBetween(s, now) + 1);
  const target = week.km;
  const km = weekRunKm(week, acts);
  const weekActs = acts.filter((a) => a.date >= ymd(s) && a.date <= ymd(addDays(s, 6)));

  let planned = 0, done = 0;
  week.days.slice(0, daysIn).forEach(([kind, label, km], i) => {
    const wanted = typeof plannedSportCats === "function" ? plannedSportCats(kind) : (KIND_MATCH[kind] || null);
    const ds = ymd(addDays(s, i));
    if (!wanted || !wanted.length || BUSY[ds]) return;
    planned++;
    const dayActs = weekActs.filter((a) => a.date === ds);
    if (typeof planDayDone === "function") {
      if (planDayDone({ week, i, kind, label: typeof fmtPlanLabel === "function" ? fmtPlanLabel(label) : label, km }, dayActs)) done++;
    } else if (wanted.some((c) => dayActs.some((a) => a.cat === c))) {
      done++;
    }
  });

  const pct = Math.round((km / target) * 100);
  out.push(`${done} of ${planned} planned sessions done so far, with ${km.toFixed(1)} of ${target} km run (${pct}%).`);

  const longIdx = week.days.findIndex(([k]) => ["long", "event", "race"].includes(k));
  if (longIdx !== -1 && longIdx < daysIn) {
    const ds = ymd(addDays(s, longIdx));
    const longRun = weekActs.filter((a) => a.cat === "run" && a.date === ds).sort((a, b) => b.dist - a.dist)[0];
    if (longRun) out.push(`Long run: ${longRun.dist} km at ${longRun.pace}/km, HR ${longRun.hr}.`);
    else out.push("The long run isn't logged. It's the week's priority, so if possible move it rather than skip it.");
  }

  const easyRuns = weekActs.filter((a) => {
    if (a.cat !== "run") return false;
    const i = daysBetween(s, parseDate(a.date));
    const [kind, label] = week.days[i] || [];
    return ["run", "long"].includes(kind) && !/@ ?mp|steady|cruise|quality/i.test(label);
  });
  const [easyLo] = easyZone();
  const quick = easyRuns.filter((a) => toSec(a.pace) && toSec(a.pace) < easyLo - 5);
  if (easyRuns.length && !quick.length) out.push("All easy runs stayed in the easy zone.");
  else if (quick.length) out.push(`${quick.length} easy run${quick.length > 1 ? "s were" : " was"} faster than ${fmtPace(easyLo)}/km; keep easy days easy.`);

  const swimTarget = week.swim && week.swim !== "—"
    ? Number((week.swim.match(/(\d)(?:–\d)?×/) || [])[1] || 0)
    : 0;
  const swims = weekActs.filter((a) => a.cat === "swim").length;
  if (swimTarget) out.push(swims >= swimTarget ? `Swim target met (${swims}×).` : `${swims} of ${swimTarget} planned swim${swimTarget > 1 ? "s" : ""}.`);
  const planUsesBike = Array.isArray(window.WEEKS) && window.WEEKS.some((w) => w.bike && w.bike !== "—");
  if (planUsesBike && week.bike === "—" && weekActs.some((a) => a.cat === "bike")) {
    out.push("There was a ride in a no-bike week; keep the bike easy so it doesn't take energy from running.");
  }
  return out.join(" ");
}

// ---------- Race time / pace prediction (Garmin-style) ----------

function clockSec(text) {
  if (!text || text === "--") return null;
  const parts = String(text).trim().split(":").map(Number);
  if (!parts.length || parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

function fmtRaceClock(sec) {
  if (!(sec > 0) || !Number.isFinite(sec)) return "—";
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h) return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function activitySeconds(a) {
  const moving = a?.raw?.["Moving Time"];
  const sec = clockSec(a?.time) || clockSec(moving);
  if (sec > 0) return sec;
  const dist = Number(a?.dist);
  if (!(dist > 0)) return null;
  if (a.cat === "bike") {
    const kph = parseFloat(a.pace);
    return kph > 0 ? (dist / kph) * 3600 : null;
  }
  const pace = toSec(a.pace);
  if (!pace) return null;
  if (a.cat === "swim") {
    const meters = dist > 30 ? dist : dist * 1000;
    return pace * (meters / 100);
  }
  return pace * dist;
}

function swimMeters(a) {
  const d = Number(a?.dist);
  if (!(d > 0)) return null;
  return d > 30 ? d : d * 1000;
}

function vo2At(v) {
  return -4.60 + 0.182258 * v + 0.000104 * v * v;
}
function pctVo2At(tMin) {
  return 0.8 + 0.1894393 * Math.exp(-0.012778 * tMin) + 0.2989558 * Math.exp(-0.1932605 * tMin);
}
function vdotFromRace(distM, sec) {
  if (!(distM > 0) || !(sec > 60)) return null;
  const v = (distM / sec) * 60;
  const pct = pctVo2At(sec / 60);
  if (!(pct > 0.4 && pct < 1.05)) return null;
  const vdot = vo2At(v) / pct;
  return vdot >= 15 && vdot <= 90 ? vdot : null;
}
function timeFromVdot(vdot, distM) {
  if (!(vdot > 0) || !(distM > 0)) return null;
  let lo = 90, hi = 12 * 3600;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    const v = (distM / mid) * 60;
    const est = vo2At(v) / pctVo2At(mid / 60);
    if (est > vdot) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function trainingMetrics() {
  return window.TRAINING_METRICS || {};
}

function observedMaxHr(acts) {
  const profile = num(trainingMetrics().max_hr);
  if (profile >= 150 && profile <= 230) return profile;
  let max = 0;
  (acts || []).forEach((a) => {
    const hr = num(a?.raw?.["Max HR"]) || num(a?.hr);
    if (hr > max) max = hr;
  });
  return max >= 150 ? max : 190;
}

function digNum(node, names, depth = 0) {
  if (!node || typeof node !== "object" || depth > 5) return null;
  for (const [key, value] of Object.entries(node)) {
    if (names.includes(key) && num(value) > 0) return num(value);
  }
  for (const value of Object.values(node)) {
    if (value && typeof value === "object") {
      const found = digNum(value, names, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function gapPaceSec(a) {
  const direct = toSec(a?.raw?.["Avg GAP"]);
  if (direct) return direct;
  const speed = digNum(a?.raw, ["avgGradeAdjustedSpeed", "averageGradeAdjustedSpeed"]);
  if (speed > 0.4 && speed < 8) return 1000 / speed;
  return null;
}

function teLabel(a) {
  const direct = a?.raw?.["TE Label"];
  if (direct && direct !== "--") return String(direct).toLowerCase();
  const raw = a?.raw || {};
  const text = raw.garmin?.trainingEffectLabel
    || raw.garmin?.summaryDTO?.trainingEffectLabel
    || raw.garminSummary?.trainingEffectLabel
    || raw.garmin?.aerobicTrainingEffectMessage
    || raw.garminSummary?.aerobicTrainingEffectMessage;
  return text ? String(text).toLowerCase() : "";
}

function labelKind(label) {
  if (/recovery|base|easy|aerobic_base/.test(label)) return "easy";
  if (/tempo|threshold|vo2|anaerobic|speed|interval/.test(label)) return "quality";
  return "";
}

function splitRows(a, key) {
  const rows = a?.raw?.[key];
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({
    m: num(row.m),
    sec: num(row.sec),
    hr: num(row.hr) || null,
  })).filter((row) => row.m >= 200 && row.sec >= 30);
}

function representativeEffort(a, kind) {
  const work = splitRows(a, "work");
  const splits = splitRows(a, "splits");
  const pool = kind === "quality" && work.length >= 2 ? work : splits;
  if (pool.length < 3 && !(kind === "quality" && work.length >= 2)) return null;
  const use = pool.length ? pool : work;
  if (use.length < 2) return null;
  const paces = use.map((row) => row.sec / (row.m / 1000));
  const mid = median(paces);
  const chosen = kind === "quality" && mid
    ? use.filter((row) => row.sec / (row.m / 1000) <= mid * 0.98)
    : use;
  const rows = chosen.length >= 2 ? chosen : use;
  let secSum = 0;
  let mSum = 0;
  const hrs = [];
  rows.forEach((row) => {
    secSum += row.sec;
    mSum += row.m;
    if (row.hr) hrs.push(row.hr);
  });
  if (!(mSum > 0) || !(secSum > 0)) return null;
  return { secPerKm: secSum / (mSum / 1000), hr: median(hrs) };
}

function zoneSeconds(a) {
  const raw = a?.raw?.["HR Zone Seconds"];
  if (!raw || raw === "--") return null;
  const secs = String(raw).split(",").map((n) => Number(n)).filter((n) => Number.isFinite(n) && n >= 0);
  return secs.length >= 3 ? secs : null;
}

function effortFraction(hr, maxHr, act = null) {
  const phys = trainingMetrics();
  const max = num(phys.max_hr) >= 150 ? num(phys.max_hr) : maxHr;
  const rest = num(phys.resting_hr);
  const lthr = num(phys.lthr);
  if (!(hr >= 90)) return null;
  let frac = null;
  if (lthr > 120 && lthr + 5 >= hr) frac = Math.min(0.96, (hr / lthr) * 0.9);
  if (max > hr && max >= 150) {
    const pct = hr / max;
    if (rest >= 35 && rest < hr && max > rest + 30) {
      const reserve = (hr - rest) / (max - rest);
      const blended = pct * 0.65 + reserve * 0.35;
      frac = frac == null ? blended : (frac + blended) / 2;
    } else if (frac == null) frac = pct;
  }
  if (!(frac > 0)) return null;
  const floors = Array.isArray(phys.zones) ? phys.zones.map(num).filter((n) => n > 40) : [];
  if (floors.length >= 3) {
    const zone = floors.filter((floor) => hr >= floor).length;
    if (zone <= 2) frac = Math.min(frac, 0.76);
    else if (zone >= 4) frac = Math.max(frac, 0.86);
  }
  const zones = zoneSeconds(act);
  if (zones) {
    const total = zones.reduce((s, n) => s + n, 0);
    if (total > 0) {
      const easyShare = (zones[0] + (zones[1] || 0)) / total;
      const hardShare = ((zones[3] || 0) + (zones[4] || 0)) / total;
      if (easyShare >= 0.7) frac = Math.min(frac, 0.74);
      else if (hardShare >= 0.35) frac = Math.max(frac, 0.86);
    }
  }
  return Math.max(0.55, Math.min(0.98, frac));
}

function lactateSample(date) {
  const speed = num(trainingMetrics().lt_speed_mps);
  if (!(speed > 1.5 && speed < 7)) return null;
  const vdot = vdotFromRace(speed * 3600, 3600);
  if (!vdot) return null;
  return { date, vdot, source: "quality", distKm: speed * 3.6, sec: 3600, fraction: 0.9 };
}

function sessionEffortKind(a) {
  if (typeof planFor !== "function") return "easy";
  const plan = planFor(a.date);
  if (!plan) return "easy";
  if (plan.kind === "quality" || plan.kind === "race" || plan.kind === "event") return "quality";
  if (plan.kind === "long") return "long";
  return "easy";
}

function runPerformance(a, maxHr) {
  if (a.cat !== "run") return null;
  const distKm = Number(a.dist);
  const sec = activitySeconds(a);
  if (!(distKm >= 1.5) || !(sec >= 4 * 60) || sec / distKm < 150 || sec / distKm > 600) return null;
  const kind = sessionEffortKind(a);
  const te = num(a.raw?.["Aerobic TE"]);
  const label = teLabel(a);
  const fromLabel = labelKind(label);
  // Plan day wins over Garmin's "base/recovery" label so a controlled long run is not dropped.
  let source = kind === "quality" || kind === "long"
    ? kind
    : (fromLabel || "easy");
  if (fromLabel === "quality" || te >= 4) source = "quality";
  const rep = representativeEffort(a, source === "quality" ? "quality" : kind);
  const hr = rep?.hr || num(a.hr);
  let paceSec = sec / distKm;
  if (rep?.secPerKm) paceSec = rep.secPerKm;
  const gap = gapPaceSec(a);
  const ascent = num(a.raw?.["Total Ascent"]);
  if (gap && gap < paceSec - 5 && distKm > 0 && ascent / distKm >= 8) paceSec = gap;
  if (paceSec < 150 || paceSec > 600) return null;
  const v = (1000 / paceSec) * 60;
  const fraction = effortFraction(hr, maxHr, a);
  let intensity = fraction;
  if (source === "quality" && fraction != null && fraction >= 0.8) intensity = Math.max(fraction, 0.86);
  if ((source === "easy" || source === "long") && fraction != null && fraction >= 0.78) source = "hr";
  let vdot;
  if (source === "quality" && intensity == null) vdot = vo2At(v) / 0.9;
  else {
    // Heart rate is the effort. Do not invent a high long-run floor when HR says it was easy.
    const fallback = ({ beginner: 0.82, intermediate: 0.70, advanced: 0.65 }[window.CURRENT_PLAN?.experience] || 0.70);
    const i = intensity != null ? intensity : (source === "long" ? 0.78 : fallback);
    vdot = vo2At(v) / i;
  }
  if (!(vdot >= 15 && vdot <= 90)) return null;
  return { date: a.date, vdot, source, distKm, sec, fraction: intensity };
}

function riegelSec(sec, fromDist, toDist, exp = 1.06) {
  if (!(sec > 0) || !(fromDist > 0) || !(toDist > 0)) return null;
  return sec * ((toDist / fromDist) ** exp);
}

function goalEventSpec() {
  const plan = window.CURRENT_PLAN || {};
  const sport = plan.sport || "run";
  const runKm = Number(plan.run_km) || null;
  const swimM = Number(plan.swim_m) || null;
  const bikeKm = Number(plan.bike_km) || null;
  return {
    sport,
    name: plan.event_name || "Race",
    runKm,
    swimM,
    bikeKm,
    primary: sport === "swim" ? "swim" : sport === "bike" ? "bike" : "run",
    targetRunKm: runKm || (sport === "run" ? 42.2 : null),
  };
}

function planGoalRunSec(spec) {
  const rows = Array.isArray(window.PACES) ? window.PACES : [];
  const row = rows.find((p) => /race pace|marathon|goal/i.test(String(p[0] || "")));
  const pace = parsePaceSpec(row && row[1]);
  if (!pace || !(spec.targetRunKm > 0)) return null;
  return pace.mid * spec.targetRunKm;
}

function weightedVdot(samples) {
  const ranked = [...samples].sort((a, b) => b.vdot - a.vdot).slice(0, 4);
  const weights = [0.42, 0.28, 0.18, 0.12];
  let num = 0, den = 0;
  ranked.forEach((s, i) => {
    const w = weights[i] || 0.08;
    num += s.vdot * w;
    den += w;
  });
  return den ? num / den : null;
}

function improvementByRace(now, acts, spec) {
  const weeks = Array.isArray(window.WEEKS) ? window.WEEKS : [];
  const race = typeof RACE !== "undefined" ? RACE : parseDate(window.MARATHON_DATE);
  const daysLeft = Math.max(0, daysBetween(now, race));
  const weeksLeft = daysLeft / 7;
  const curWk = typeof weekOf === "function" ? weekOf(now) : 1;
  const future = weeks.filter((w) => w.wk > curWk);
  const work = future.filter((w) => !/taper/i.test(w.phase || ""));
  const peak = Math.max(1, ...weeks.map((w) => Number(w.km) || 0));
  const recent = typeof typicalWeeklyKm === "function" ? typicalWeeklyKm(acts, spec.sport) : null;
  const volumeGap = recent > 0 ? Math.max(0, Math.min(1, (peak - recent) / peak)) : 0.35;
  const workGain = 0.058 * (1 - Math.exp(-work.length / 7));
  const timeGain = 0.012 * Math.min(8, weeksLeft);
  const volumeGain = 0.035 * volumeGap;
  const taperFresh = future.some((w) => /taper/i.test(w.phase || "")) ? 0.012 : daysLeft > 3 ? 0.006 : 0;
  let gain = Math.min(0.12, workGain + timeGain * 0.35 + volumeGain + taperFresh);
  const load = trainingMetrics().load;
  if (load && (num(load.low) + num(load.high) + num(load.anaerobic)) > 0) {
    const hard = (num(load.high) + num(load.anaerobic)) / (num(load.low) + num(load.high) + num(load.anaerobic));
    if (hard > 0.55) gain *= 0.75;
  }
  return gain;
}

function predictLeg(samples, date, toDist, exp) {
  const from = ymd(addDays(parseDate(date), -28));
  const pool = samples.filter((s) => s.date >= from && s.date <= date);
  if (!pool.length) return null;
  const eq = pool.map((s) => riegelSec(s.sec, s.dist, toDist, exp)).filter((n) => n > 0);
  const best = [...eq].sort((a, b) => a - b).slice(0, 3);
  if (!best.length) return null;
  const weights = [0.5, 0.3, 0.2];
  let num = 0, den = 0;
  best.forEach((v, i) => { num += v * weights[i]; den += weights[i]; });
  return num / den;
}

window.racePrediction = function racePrediction(acts, now) {
  if (!hasPlan || !hasPlan()) return null;
  const spec = goalEventSpec();
  const race = typeof RACE !== "undefined" ? RACE : parseDate(window.MARATHON_DATE);
  const start = typeof START !== "undefined" ? START : parseDate(window.PLAN_START);
  if (!race || Number.isNaN(race.getTime())) return null;

  const maxHr = observedMaxHr(acts);
  const runSamples = [];
  const swimSamples = [];
  const bikeSamples = [];
  (acts || []).forEach((a) => {
    if (a.date > ymd(now)) return;
    if (a.cat === "run") {
      const row = runPerformance(a, maxHr);
      if (row) runSamples.push(row);
    } else if (a.cat === "swim") {
      const meters = swimMeters(a);
      const sec = activitySeconds(a);
      if (meters >= 200 && sec >= 120) swimSamples.push({ date: a.date, dist: meters, sec });
    } else if (a.cat === "bike") {
      const km = Number(a.dist);
      const sec = activitySeconds(a);
      if (km >= 8 && sec >= 600) bikeSamples.push({ date: a.date, dist: km, sec });
    }
  });
  const byDate = (a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
  const lt = lactateSample(ymd(now));
  if (lt) runSamples.push(lt);
  runSamples.sort(byDate);
  swimSamples.sort(byDate);
  bikeSamples.sort(byDate);

  const wantRun = spec.sport === "run" || spec.sport === "triathlon";
  const wantSwim = spec.sport === "swim" || spec.sport === "triathlon";
  const wantBike = spec.sport === "bike" || spec.sport === "triathlon";
  const hasRun = wantRun && runSamples.length > 0;
  const hasSwim = wantSwim && swimSamples.length > 0;
  const hasBike = wantBike && bikeSamples.length > 0;
  const goalRun = wantRun ? planGoalRunSec(spec) : null;

  if (!hasRun && !hasSwim && !hasBike && !goalRun) {
    return { spec, empty: true, currentSec: null, projectedSec: null };
  }

  const transSec = spec.sport !== "triathlon" ? 0
    : (spec.bikeKm || 0) >= 150 ? 10 * 60
      : (spec.bikeKm || 0) >= 70 ? 8 * 60
        : 5 * 60;

  function eventAt(date) {
    const ds = typeof date === "string" ? date : ymd(date);
    let runSec = null, swimSec = null, bikeSec = null, vdot = null;
    if (wantRun && spec.targetRunKm) {
      const prior = runSamples.filter((s) => s.date <= ds);
      const from = ymd(addDays(parseDate(ds), -21));
      const recent = prior.filter((s) => s.date >= from);
      const perf = recent.filter((s) => s.source !== "easy");
      const use = (perf.length ? perf : recent);
      vdot = use.length ? weightedVdot(use) : null;
      const vo2 = num(trainingMetrics().vo2_run);
      if (vdot && vo2 >= 25 && vo2 <= 85) {
        const hard = use.some((s) => s.source === "quality" || (s.fraction != null && s.fraction >= 0.84));
        const w = hard ? 0.3 : 0.45;
        vdot = vdot * (1 - w) + vo2 * w;
      }
      if (vdot) runSec = timeFromVdot(vdot, spec.targetRunKm * 1000);
      else if (goalRun) runSec = goalRun;
    }
    if (wantSwim && spec.swimM) swimSec = predictLeg(swimSamples.filter((s) => s.date <= ds), ds, spec.swimM, 1.05);
    if (wantBike && spec.bikeKm) bikeSec = predictLeg(bikeSamples.filter((s) => s.date <= ds), ds, spec.bikeKm, 1.05);
    if (spec.sport === "run") return runSec ? { timeSec: runSec, paceSec: runSec, vdot } : null;
    if (spec.sport === "swim") return swimSec ? { timeSec: swimSec, paceSec: swimSec, vdot } : null;
    if (spec.sport === "bike") return bikeSec ? { timeSec: bikeSec, paceSec: bikeSec, vdot } : null;
    const parts = [swimSec, bikeSec, runSec].filter((n) => n > 0);
    if (!parts.length) return null;
    const timeSec = parts.reduce((s, n) => s + n, 0) + (parts.length >= 2 ? transSec : 0);
    return { timeSec, paceSec: runSec || timeSec, swimSec, bikeSec, runSec, vdot, complete: !!(swimSec && bikeSec && runSec) };
  }

  const from = start;
  const endHist = now < race ? now : race;

  const history = [];
  let last = null;
  if (from <= endHist) {
    for (let d = new Date(from); d <= endHist; d = addDays(d, 1)) {
      const point = eventAt(d);
      if (point) last = { date: ymd(d), ...point };
      if (last) history.push({ ...last, date: ymd(d) });
    }
  } else {
    const point = eventAt(now);
    if (point) history.push({ ...point, date: ymd(from) });
  }
  if (!history.length && goalRun) {
    history.push({ date: ymd(endHist), timeSec: goalRun, paceSec: goalRun, vdot: null });
  }
  if (!history.length) return { spec, empty: true, currentSec: null, projectedSec: null };

  const current = history[history.length - 1];
  const currentSec = current.timeSec;
  const gain = now < race ? improvementByRace(now, acts, spec) : 0;
  const projectedSec = currentSec * (1 - gain);
  const delta = Math.max(0, currentSec - projectedSec);
  const optimisticSec = projectedSec - delta * 0.28;
  const pessimisticSec = currentSec + Math.max(currentSec * 0.012, delta * 0.12);

  const distLabel = spec.sport === "triathlon"
    ? [spec.swimM ? `${spec.swimM >= 1000 ? `${(spec.swimM / 1000).toFixed(spec.swimM % 1000 ? 1 : 0)} km` : `${spec.swimM} m`} swim` : null,
      spec.bikeKm ? `${spec.bikeKm} km bike` : null,
      spec.runKm ? `${spec.runKm} km run` : null].filter(Boolean).join(" · ")
    : spec.sport === "swim" && spec.swimM
      ? (spec.swimM >= 1000 ? `${(spec.swimM / 1000).toFixed(spec.swimM % 1000 ? 1 : 0)} km` : `${spec.swimM} m`)
      : spec.sport === "bike" && spec.bikeKm
        ? `${spec.bikeKm} km`
        : spec.targetRunKm ? `${spec.targetRunKm} km` : "";

  const incomplete = spec.sport === "triathlon" && current && !current.complete;
  const usedHr = runSamples.some((s) => s.fraction != null);
  const phys = trainingMetrics();
  const note = incomplete
    ? "Run fitness is solid; log swims and rides for a full triathlon estimate."
    : !runSamples.length && !swimSamples.length && !bikeSamples.length
      ? "From your plan race pace until there are timed sessions to work from."
      : phys.vo2_run
        ? "From recent runs, with heart rate as the effort, blended with Garmin VO2max. Projection assumes you follow the rest of the plan."
        : usedHr
          ? "From recent runs, with heart rate as the effort. A comfortable long run is not scored as race pace. Projection assumes you follow the rest of the plan."
          : "From logged sessions. Projection assumes you follow the rest of the plan.";

  return {
    spec,
    empty: false,
    distLabel,
    note,
    from: ymd(from),
    race: ymd(race),
    now: ymd(now),
    history,
    currentSec,
    currentPaceSec: current.paceSec,
    projectedSec,
    projectedPaceSec: (current.paceSec || currentSec) * (projectedSec / currentSec),
    optimisticSec,
    pessimisticSec,
    complete: !incomplete,
    source: runSamples.length || swimSamples.length || bikeSamples.length ? "activities" : "plan",
  };
};

window.fmtRaceClock = fmtRaceClock;

// ---------- Week adaptation (missed-week / rescue / niggle) ----------

const ADAPT_KEY_KINDS = new Set(["long", "quality", "race", "event"]);

function isKeySession(kind, label = "") {
  if (ADAPT_KEY_KINDS.has(kind)) return true;
  const blob = String(label || "");
  if (kind === "bike" && /long|brick|key|endurance/i.test(blob)) return true;
  if (kind === "swim" && /key|main|css|threshold|quality/i.test(blob)) return true;
  return false;
}

function cloneDay(day) {
  return Array.isArray(day) ? day.slice() : ["rest", "Rest"];
}

function cloneWeekDays(week) {
  return (week.days || []).map(cloneDay);
}

function dayKm(day) {
  const n = Number(day?.[2]);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function weekRunVolume(days) {
  return days.reduce((sum, d) => {
    const kind = d?.[0];
    if (!["run", "quality", "long", "event", "race"].includes(kind)) return sum;
    return sum + dayKm(d);
  }, 0);
}

function softenLabel(label, mode) {
  const text = String(label || "").trim();
  if (!text) return mode === "niggle" ? "Easy" : text;
  if (mode === "niggle" && !/easy|recovery|easy effort/i.test(text)) {
    return `${text} · keep easy`;
  }
  return text;
}

function trimLongDay(day, factor = 0.88) {
  const next = cloneDay(day);
  const km = dayKm(next);
  if (km > 0) {
    const trimmed = Math.max(1, Math.round(km * factor * 10) / 10);
    next[2] = trimmed;
    next[1] = String(next[1] || "")
      .replace(/(\d+(?:\.\d+)?)\s*km/i, `${trimmed} km`)
      .replace(/(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)/, String(trimmed));
    if (!/\d/.test(String(next[1]))) next[1] = `${trimmed} km easy`;
  }
  next[1] = softenLabel(next[1], "niggle");
  return next;
}

function asEasyDay(day) {
  const next = cloneDay(day);
  const km = dayKm(next);
  next[0] = "run";
  if (km > 0) next[1] = `${km} km easy`;
  else next[1] = softenLabel(next[1] || "Easy run", "niggle");
  return next;
}

function restDay(reason) {
  return ["rest", reason || "Rest"];
}

function assessWeekSessions(week, acts, now) {
  const start = weekStart(week.wk);
  const todayYmd = ymd(now);
  const days = (week.days || []).map((day, i) => {
    const [kind, label, km] = day || ["rest", "Rest"];
    const ds = ymd(addDays(start, i));
    const busy = !!(typeof BUSY !== "undefined" && BUSY[ds]);
    const trainable = (typeof plannedSportCats === "function" ? plannedSportCats(kind) : []).length > 0;
    const plan = {
      week,
      i,
      kind,
      label: typeof fmtPlanLabel === "function" ? fmtPlanLabel(label) : label,
      km,
    };
    const dayActs = (acts || []).filter((a) => a.date === ds);
    const done = trainable && !busy && typeof planDayDone === "function" && planDayDone(plan, dayActs);
    return {
      i,
      ds,
      kind,
      label,
      km,
      busy,
      trainable,
      done,
      key: isKeySession(kind, label),
      past: ds < todayYmd,
      today: ds === todayYmd,
      future: ds > todayYmd,
      remaining: ds >= todayYmd && !done && !busy,
    };
  });
  const missedKeys = days.filter((d) => d.key && d.past && !d.done && !d.busy);
  const missedSessions = days.filter((d) => d.trainable && d.past && !d.done && !d.busy);
  const remainingKeys = days.filter((d) => d.key && d.remaining);
  const remainingTrainable = days.filter((d) => d.trainable && d.remaining);
  return {
    week,
    days,
    missedKeys,
    missedSessions,
    remainingKeys,
    remainingTrainable,
    dow: ((now.getDay() + 6) % 7),
  };
}

function daysChanged(before, after) {
  return JSON.stringify(before) !== JSON.stringify(after);
}

function adaptFingerprint(mode, weekNum, token) {
  return `adapt:${mode}:w${weekNum}:${token}`;
}

function buildRescueProposal(assess) {
  const { week, days, missedKeys, missedSessions, remainingTrainable, dow } = assess;
  if (dow < 2) return null; // Mon–Tue: too early for mid-week rescue
  if (!missedSessions.length && !missedKeys.length) return null;
  if (!remainingTrainable.length) return null;
  // Need a real mess: 1+ missed key, or 2+ missed sessions with remaining work.
  if (!missedKeys.length && missedSessions.length < 2) return null;

  const nextDays = cloneWeekDays(week);
  const actions = [];
  let longPending = days.find((d) => d.kind === "long" && d.remaining)
    || days.find((d) => ["event", "race"].includes(d.kind) && d.remaining);
  const missedLong = missedKeys.find((d) => ["long", "event", "race"].includes(d.kind));
  const protectLong = !!(longPending || missedLong);

  // If the long was missed earlier, try to park a shortened long on the best free remaining day.
  if (missedLong && !longPending) {
    const free = days.filter((d) => d.remaining && ["rest", "walk", "run"].includes(d.kind));
    const prefer = [5, 6, 4, 3, 2, 1, 0].map((i) => free.find((d) => d.i === i)).filter(Boolean);
    const slot = prefer[0];
    if (slot) {
      const shortened = trimLongDay(week.days[missedLong.i] || ["long", missedLong.label, missedLong.km], 0.75);
      shortened[0] = "long";
      nextDays[slot.i] = shortened;
      actions.push(`Move a shortened long to ${DAY_NAMES()[slot.i]}`);
      longPending = { i: slot.i };
    }
  } else if (longPending && missedKeys.length) {
    nextDays[longPending.i] = trimLongDay(week.days[longPending.i], missedKeys.length >= 2 ? 0.85 : 0.92);
    actions.push(`Keep ${DAY_NAMES()[longPending.i]} long as the priority (slightly eased)`);
  }

  // Drop remaining quality when protecting the long or the week is already messy.
  days.forEach((d) => {
    if (!d.remaining) return;
    if (d.kind === "quality") {
      nextDays[d.i] = restDay("Rest — rescue week");
      actions.push(`Drop quality on ${DAY_NAMES()[d.i]} (protect the long)`);
      return;
    }
    if ((d.kind === "bike" || d.kind === "swim" || d.kind === "walkswim") && (missedKeys.length || protectLong)) {
      nextDays[d.i] = restDay("Rest — rescue week");
      actions.push(`Drop ${d.kind} on ${DAY_NAMES()[d.i]}`);
    }
  });

  // Drop surplus easy runs: keep at most one easy day besides the long when keys were missed.
  const remainingEasy = days.filter((d) => d.remaining && d.kind === "run" && nextDays[d.i][0] === "run");
  const easyBudget = protectLong || missedKeys.length ? 1 : 2;
  remainingEasy.forEach((d, idx) => {
    if (idx < easyBudget) return;
    nextDays[d.i] = restDay("Rest — rescue week");
    actions.push(`Drop easy run on ${DAY_NAMES()[d.i]}`);
  });

  if (!actions.length || !daysChanged(week.days, nextDays)) return null;
  const km = weekRunVolume(nextDays);
  const token = [...missedKeys.map((d) => d.i), "r", ...remainingTrainable.map((d) => d.i)].join("-");
  return {
    mode: "rescue",
    week: week.wk,
    summary: `Week ${week.wk} rescue: keep what matters, drop the rest`,
    rationale: [
      missedKeys.length
        ? `Missed key session${missedKeys.length === 1 ? "" : "s"} earlier this week.`
        : `${missedSessions.length} planned sessions already missed.`,
      "Protect the long / race session; quality and fillers go first.",
      ...actions,
    ].join(" "),
    days: nextDays,
    km,
    note: `Rescue plan: ${actions.join("; ")}.`,
    actions,
    fingerprint: adaptFingerprint("rescue", week.wk, token),
  };
}

function buildRebuildProposal(assess, prevAssess) {
  const { week, days, missedKeys, remainingTrainable, dow } = assess;
  const prevMissedKeys = prevAssess?.missedKeys || [];
  const prevDone = (prevAssess?.days || []).filter((d) => d.done).length;
  const lateWeekMess = dow >= 4 && missedKeys.length >= 2 && remainingTrainable.length;
  // Require some logging last week so empty sync gaps don't look like a collapse.
  const afterBadWeek = prevMissedKeys.length >= 2 && prevDone >= 1 && dow <= 3;
  if (!lateWeekMess && !afterBadWeek) return null;

  const nextDays = cloneWeekDays(week);
  const actions = [];

  if (afterBadWeek) {
    actions.push(`Last week missed ${prevMissedKeys.length} key sessions — no catch-up stacking.`);
    days.forEach((d) => {
      if (!d.remaining && !d.today) return;
      if (d.kind === "quality") {
        nextDays[d.i] = asEasyDay(week.days[d.i]);
        actions.push(`Turn ${DAY_NAMES()[d.i]} quality into easy`);
      } else if (d.kind === "long") {
        nextDays[d.i] = trimLongDay(week.days[d.i], 0.9);
        actions.push(`Keep the long on ${DAY_NAMES()[d.i]}, slightly shorter`);
      } else if (d.kind === "run" && missedKeys.length + prevMissedKeys.length >= 3) {
        // Leave easy runs; volume stays race-reachable.
      }
    });
  }

  if (lateWeekMess) {
    actions.push(`${missedKeys.length} key sessions already missed this week.`);
    days.forEach((d) => {
      if (!d.remaining) return;
      if (d.kind === "quality") {
        nextDays[d.i] = restDay("Rest — rebuild");
        actions.push(`Drop remaining quality on ${DAY_NAMES()[d.i]}`);
      } else if (d.kind === "long" || d.kind === "event" || d.kind === "race") {
        nextDays[d.i] = trimLongDay(week.days[d.i], 0.85);
        actions.push(`Keep ${DAY_NAMES()[d.i]} as the priority session (eased)`);
      } else if (d.kind === "run") {
        nextDays[d.i] = restDay("Rest — rebuild");
        actions.push(`Drop easy run on ${DAY_NAMES()[d.i]}`);
      } else if (["bike", "swim", "walkswim", "walk"].includes(d.kind) && !isKeySession(d.kind, d.label)) {
        nextDays[d.i] = restDay("Rest — rebuild");
        actions.push(`Drop ${d.kind} on ${DAY_NAMES()[d.i]}`);
      }
    });
  }

  if (!actions.length || !daysChanged(week.days, nextDays)) return null;
  const token = [
    afterBadWeek ? `p${prevMissedKeys.map((d) => d.i).join("")}` : "",
    missedKeys.map((d) => d.i).join(""),
    remainingTrainable.map((d) => d.i).join(""),
  ].filter(Boolean).join(":");
  return {
    mode: "rebuild",
    week: week.wk,
    summary: afterBadWeek
      ? `Week ${week.wk} rebuild after a messy week`
      : `Week ${week.wk} rebuild: salvage the key session`,
    rationale: actions.join(" "),
    days: nextDays,
    km: weekRunVolume(nextDays),
    note: `Rebuild: ${actions.join("; ")}.`,
    actions,
    fingerprint: adaptFingerprint("rebuild", week.wk, token),
  };
}

function buildNiggleProposal(week, now) {
  week = week || findPlanWeek(weekOf(now));
  if (!week) return null;
  const start = weekStart(week.wk);
  const todayYmd = ymd(now);
  const nextDays = cloneWeekDays(week);
  const actions = [];
  (week.days || []).forEach((day, i) => {
    const ds = ymd(addDays(start, i));
    if (ds < todayYmd) return;
    const [kind] = day || [];
    if (kind === "quality") {
      nextDays[i] = asEasyDay(day);
      actions.push(`${DAY_NAMES()[i]} quality → easy`);
    } else if (kind === "long" || kind === "event") {
      nextDays[i] = trimLongDay(day, 0.88);
      actions.push(`${DAY_NAMES()[i]} long eased ~12%`);
    } else if (kind === "run") {
      nextDays[i] = asEasyDay(day);
      nextDays[i][1] = softenLabel(nextDays[i][1], "niggle");
    } else if (kind === "bike" && isKeySession(kind, day[1])) {
      const eased = cloneDay(day);
      eased[1] = softenLabel(eased[1], "niggle");
      nextDays[i] = eased;
      actions.push(`${DAY_NAMES()[i]} key bike — keep easy`);
    }
  });
  if (!actions.length || !daysChanged(week.days, nextDays)) return null;
  return {
    mode: "niggle",
    week: week.wk,
    summary: `Week ${week.wk} niggle mode: ease without gutting the week`,
    rationale: "Ease intensity and trim the long slightly. Keep sessions on the calendar so race day stays reachable.",
    days: nextDays,
    km: weekRunVolume(nextDays),
    note: `Niggle mode: ${actions.join("; ")}.`,
    actions,
    fingerprint: adaptFingerprint("niggle", week.wk, ymd(now)),
  };
}

function findPlanWeek(weekNum) {
  const weeks = Array.isArray(window.WEEKS) ? window.WEEKS : [];
  return weeks.find((w) => Number(w.wk) === Number(weekNum)) || weeks[weekNum - 1] || null;
}

function proposeWeekAdaptations(acts, now = today()) {
  if (typeof hasPlan === "function" && !hasPlan()) return [];
  const wk = weekOf(now);
  const current = findPlanWeek(wk);
  if (!current) return [];
  const prev = findPlanWeek(wk - 1);
  const curAssess = assessWeekSessions(current, acts, now);
  const prevAssess = prev ? assessWeekSessions(prev, acts, addDays(weekStart(prev.wk), 6)) : null;

  // One structural proposal per week: rebuild wins over mid-week rescue.
  const rebuild = buildRebuildProposal(curAssess, prevAssess);
  if (rebuild) return [rebuild];
  const rescue = buildRescueProposal(curAssess);
  return rescue ? [rescue] : [];
}

window.isKeySession = isKeySession;
window.assessWeekSessions = assessWeekSessions;
window.proposeWeekAdaptations = proposeWeekAdaptations;
window.buildNiggleProposal = buildNiggleProposal;
window.adaptFingerprint = adaptFingerprint;
