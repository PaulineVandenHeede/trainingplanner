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

window.sportLabel = function sportLabel(s) {
  const key = `sport.${s}Full`;
  if (typeof window.t === "function") {
    const value = window.t(key);
    if (value !== key) return value;
  }
  return ({ run: "Running", swim: "Swimming", bike: "Cycling", triathlon: "Triathlon" })[s] || s;
};
window.SPORT_LABEL = new Proxy({}, {
  get(_target, prop) {
    if (prop === Symbol.toStringTag) return "Object";
    return window.sportLabel(prop);
  },
});

window.TIME_PRESETS = {
  run: ["5k", "10k", "half", "marathon", "custom"],
  swim: ["750", "1500", "1900", "5k", "custom"],
  bike: ["40", "90", "180", "custom"],
  triathlon: ["kwart", "halve", "volledige", "custom"],
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
  if (name === "Build") return "Quality + longer key session";
  if (name === "Rebuild") return "Ease back into training";
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
  if (sport === "run" || sport === "bike") return "—";
  if (sport === "swim") return `${Math.max(1, Math.round((swimM || 1500) / 800))} sessions`;
  // Triathlon: keep swim frequency (~3×) even in taper; shorten duration.
  if (phase === "Taper") return "2–3×25–35' (keep feel)";
  if (phase === "Peak") return swimM >= 3000 ? "3×45–60'" : "3×40–50'";
  if (phase === "Build") return swimM >= 1700 ? "3×40–50'" : "2–3×35–45'";
  if (phase === "Rebuild") return "2×30–40' technique";
  return swimM >= 1700 ? "3×35–45' technique + endurance" : "2–3×30–40'";
}

function bikeLabel(sport, phase, bikeKm) {
  if (sport === "run" || sport === "swim") return "—";
  if (sport === "bike") return phase === "Taper" ? "Easy spin" : "Key ride + easy";
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
  // run + triathlon (run leg volume)
  if (n < 25) return "beginner";
  if (n < 50) return "intermediate";
  return "advanced";
};

window.experienceThresholds = function experienceThresholds(sport = "run") {
  if (sport === "bike") return { beginner: 100, intermediate: 180, unit: "km/week on the bike" };
  if (sport === "swim") return { beginner: 3, intermediate: 6, unit: "km/week in the pool" };
  return { beginner: 25, intermediate: 50, unit: "km/week of running" };
};

window.needsDedicatedLongDay = function needsDedicatedLongDay(sport, presetId, custom) {
  if (!presetId || !(sport === "run" || sport === "triathlon")) return false;
  try {
    const d = resolveDistances(sport, presetId, custom || {});
    return (d.run || 0) >= 16;
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

  if (sport === "run" || sport === "triathlon") {
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
  const hasQuality = ["Build", "Peak"].includes(phase) && !isRaceWeek;
  const days = Array.from({ length: 7 }, () => ["rest", "Rest"]);

  const set = (i, kind, label, run) => { days[i] = run != null ? [kind, label, run] : [kind, label]; };

  if (isRaceWeek) {
    const name = distances.label || "Race";
    if (sport === "swim") set(raceDay, "race", `${name} ${distances.swim} m`);
    else if (sport === "bike") set(raceDay, "race", `${name} ${fmtKmLabel(distances.bike)} km`);
    else if (sport === "triathlon") set(raceDay, "race", `${name}`, distances.run);
    else set(raceDay, "race", `${name} ${fmtKmLabel(distances.run)} km`, distances.run);

    if (sport === "triathlon") {
      const used = new Set([raceDay]);
      // Closest day before race: bag check. If only one day exists (e.g. Tue race),
      // fold a tiny T2 opener into that day so transition practice still happens.
      if (raceDay === 1) {
        set(0, "brick", "Mini T2 · 20–30' easy bike + 8' run · bag check");
        used.add(0);
      } else if (raceDay > 1) {
        const preRace = [
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
        if (i < raceDay && i % 2 === 0) set(i, "bike", "Easy spin 30–40' · RPE 2–3");
        else set(i, "rest", "Rest");
      }
    } else {
      for (let i = 0; i < 7; i++) {
        if (i === raceDay) continue;
        if (i === Math.max(0, raceDay - 3) && sport !== "swim" && sport !== "bike") {
          set(i, "run", "Shakeout 4–6 easy", 5);
        } else if (i < raceDay && sport !== "swim" && sport !== "bike" && i % 2 === 0) {
          set(i, "run", "Easy 4–5", 4);
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

  if (sport === "bike") {
    set(0, "bike", "Easy spin 45–60'");
    set(2, hasQuality ? "bike" : "bike", hasQuality ? "Quality ride" : "Steady ride");
    set(5, "bike", `Long ride ~${fmtKmLabel(longKm)} km`);
    if (km > 40) set(3, "bike", "Easy recovery spin");
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
  const split = splitRunKm(km, longKm, !!qualityIdx, runIdx.length);
  const strengthDays = wantStrength
    ? freeDays(opts.strengthWeekdays, [easyIdx.includes(0) ? 0 : (easyIdx[0] ?? runIdx[0] ?? 0)])
    : [];
  const swimDays = freeDays(
    opts.swimWeekdays,
    sport === "swim" ? [0, 2, 5]
      : sport === "triathlon"
        ? [1, 3, 5].filter((i) => !runIdx.includes(i)).concat([1, 2, 3, 4].filter((i) => !runIdx.includes(i))).filter((v, i, a) => a.indexOf(v) === i).slice(0, 3)
        : []
  );
  const bikeDays = freeDays(
    opts.bikeWeekdays,
    sport === "bike" ? [0, 2, 5]
      : sport === "triathlon"
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
  if (qualityIdx != null && split.quality) set(qualityIdx, "quality", `Quality ${fmtKmLabel(split.quality)}`, split.quality);
  if (longIdx != null) set(longIdx, "long", `Long ${fmtKmLabel(longKm)} easy`, longKm);

  const band = sport === "triathlon" ? triDistanceBand(distances) : null;
  const wk = Number(opts.weekNum) || 1;
  const brick = sport === "triathlon" ? brickLabel(phase, band, wk) : null;
  // Prefer attaching the brick to the longest bike day (usually weekend).
  const brickBikeDay = bikeDays.length
    ? (bikeDays.includes(6) ? 6 : bikeDays.includes(0) ? 0 : bikeDays[bikeDays.length - 1])
    : null;

  swimDays.forEach((i, n) => {
    const label = sport === "triathlon" || sport === "swim"
      ? swimSetLabel(phase, n, band)
      : (phase === "Taper" ? "Swim: short technique + feel" : "Swim technique + easy endurance");
    addOn(i, { kind: "swim", label, short: "swim", km: undefined });
  });
  bikeDays.forEach((i, n) => {
    const isBrickDay = !!(sport === "triathlon" && brick && i === brickBikeDay);
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
      detail: isKey ? label : (sport === "triathlon" || sport === "bike" ? label : "bike"),
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
  const runKm = distances.run || 0;
  const isRunSport = sport === "run" || sport === "triathlon";
  const level = EXPERIENCE_LEVELS.includes(experience) ? experience : "intermediate";
  let minDays = 3, recDays = 3, event = "this event";
  if (sport === "triathlon") {
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
  const strengthStrong = runKm >= 21 || sport === "triathlon";
  const strengthRecommended = strengthStrong || runKm >= 16;
  const levelLabel = sport === "triathlon"
    ? (level === "beginner" ? "a beginner triathlete" : level === "advanced" ? "an advanced triathlete" : "an intermediate triathlete")
    : (level === "beginner" ? "a beginner" : level === "advanced" ? "an advanced runner" : "an intermediate runner");
  const triHint = sport === "triathlon" && presetId
    ? ` For ${event}, aim for ~3 swims (technique needs frequency), most volume on the bike (~55% of training time), and protect the run (~30%). Build frequency first, then duration, then intensity. Expect one bike→run brick most build/peak weeks.`
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
        ? `For ${event}, ${levelLabel} usually needs ${minDays} run days as a minimum — ${recDays} is better, so each run stays shorter. Beginners can sit at the low end while volume is still small; advanced athletes add days rather than making each run much longer.${triHint}`
        : `For ${event}, ${levelLabel} is fine on ${recDays} run days a week. Extra easy days help if the extra kilometres stay easy.${triHint}`,
    strengthHint: !presetId ? "Pick a distance first. Strength matters more as the race gets longer."
      : strengthStrong
        ? sport === "triathlon"
          ? "Strongly recommended for triathlon: 1–2 short sessions in base (injury resilience), then maintain in build/peak."
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
  let label = `${ev.name}${evKm ? ` ${fmtKmLabel(evKm)} km` : ""}`;
  if (evKm > 0 && week.long > evKm + 3 && evKm <= 16) {
    const extra = week.long - evKm;
    const pre = Math.round(extra / 2);
    const post = extra - pre;
    label = `${ev.name}: ${pre} + ${fmtKmLabel(evKm)} + ${post} = ${fmtKmLabel(week.long)} km`;
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
    ["Steady / cruise", "Controlled, not racing", "Mid-week quality"],
    ["Race pace", "Goal event effort", "Short segments late in the plan"],
    ["Strides", "Fast but relaxed", "6–8 × 20 sec"],
  ];
}

function researchForSport(sport, goalType = "race") {
  const all = window.TRAINING_RESEARCH || [];
  const key = ["run", "swim", "bike", "triathlon"].includes(sport) ? sport : "run";
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
    if (!["run", "swim", "bike", "triathlon"].includes(sport)) throw new Error("Choose a focus.");
    preset = sport === "run" ? "10k" : sport === "swim" ? "1500" : sport === "bike" ? "40" : "halve";
    eventName = eventName || "General fitness";
    const weeksIn = Number(input.fitnessWeeks);
    const weeks = weeksIn >= 4 && weeksIn <= 32 ? Math.round(weeksIn) : 12;
    if (!eventDate) eventDate = pgYmd(pgAdd(todayDate, weeks * 7));
  }

  const distances = resolveDistances(sport, preset, input.custom || {});
  const weekly = Number(input.weeklyKm);
  const weeklyMax = sport === "bike" ? 500 : sport === "swim" ? 40 : 200;
  if (!(weekly > 0) || weekly > weeklyMax) {
    throw new Error(`Enter your current weekly kilometres (1–${weeklyMax}).`);
  }
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
  const needsLong = typeof window.needsDedicatedLongDay === "function"
    && window.needsDedicatedLongDay(sport, preset, input.custom || {});
  let longWeekday = Number.isInteger(Number(input.longWeekday)) ? Number(input.longWeekday) : null;
  if (needsLong) {
    if (longWeekday == null || !runWeekdays.includes(longWeekday)) {
      throw new Error("Choose a run day for your long run before creating the plan.");
    }
  } else if (longWeekday != null && !runWeekdays.includes(longWeekday)) {
    longWeekday = null;
  }

  const peak = peakVolume(sport, weekly, distances.run || 0);
  const phaseOpts = { sport, experience, distances, fitness: isFitness };
  const phases = assignPhases(n, phaseOpts);
  const taper = phases.find((p) => p.name === "Taper");
  const targets = weekTargets(n, weekly, peak, taper ? taper.from : n + 1, { sport, fitness: isFitness });
  const cap = longCap(sport, distances.run || 0, weekly);
  const raceDay = (race.getDay() + 6) % 7;
  const sources = researchForSport(sport, goalType);
  const band = sport === "triathlon" ? triDistanceBand(distances) : null;

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
    if (sport === "triathlon") extras.push("~3 swim / 2–3 bike, bricks in build–peak");
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
    const brick = sport === "triathlon" && !isRaceWeek ? brickLabel(phase.name, band, wk) : null;
    let note;
    if (wk === 1) {
      if (isFitness) {
        note = sport === "triathlon"
          ? `General fitness block from ${weekly} km/week run volume${extras.length ? ` (${extras.join("; ")})` : ""}. Frequency → volume → intensity, ~10% weekly load rise max, cutback every 4th week — no race taper.`
          : `General fitness block from ${weekly} km/week${extras.length ? `, ${extras.join(", ")}` : ""}. Weekly load rises about 10% max, with a cutback every 4th week — no race taper.`;
      } else {
        note = sport === "triathlon"
          ? `Built from ${weekly} km/week run volume toward ${eventName}${extras.length ? ` (${extras.join("; ")})` : ""}. Research-based triathlon periodization: frequency → volume → intensity, ~10% weekly load rise max, cutback every 4th week, and a sharper race taper.`
          : `Built from ${weekly} km/week toward ${eventName}${extras.length ? `, ${extras.join(", ")}` : ""}. Weekly load rises about 10% max, with a cutback every 4th week.`;
      }
    } else if (brick && (phase.name === "Build" || phase.name === "Peak")) {
      note = `Key transition work this week: ${brick}. Practise fueling on the long ride.`;
    } else if (!isFitness && isRaceWeek && sport === "triathlon") {
      note = "Race week: short openers only, one mini T2 brick, then rest. Use the race-week checklist (bags, nutrition, transitions).";
    } else if (!isFitness && phase.name === "Taper" && wk === (taper ? taper.from : n - 1)) {
      note = sport === "triathlon"
        ? "Taper starts: cut volume sharply, keep swim/bike/run frequency, short race-pace opens, and practise T1/T2 once."
        : "Taper starts: reduce volume, keep some sharpness.";
    }
    return {
      wk,
      phase: phase.name,
      km,
      long: longKm,
      swim: swimLabel(sport, phase.name, distances.swim),
      bike: bikeLabel(sport, phase.name, distances.bike),
      focus: isFitness && wk === n ? "Keep the habit and finish the block easy" : isRaceWeek ? "Race week" : phase.focus,
      note,
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
    long_weekday: longWeekday,
    notes: sport === "triathlon"
      ? (isFitness
        ? "Triathlon fitness block uses researched periodization (base → build → peak, no taper), ~15/55/30 swim/bike/run time bias, recovery every 4th week, and bike→run bricks in build/peak. See sources on the Full plan page."
        : "Triathlon plan uses researched periodization (base → build → peak → taper), ~15/55/30 swim/bike/run time bias, recovery every 4th week, and bike→run bricks in build/peak. See sources on the Full plan page.")
      : "",
    experience,
    goal_type: goalType,
    phases,
    weeks,
    paces: defaultPaces(sport),
    sources,
    roadmap: buildRoadmap(after, race, eventName),
  };
};
