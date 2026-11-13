// Live guided session player: timed cues (beeps + speech) + optional phone GPS.
(function () {
  const LIVE_KINDS = new Set(["run", "walk", "walkrun", "quality", "long", "bike", "ski", "brick"]);
  const GPS_KINDS = new Set(["run", "walk", "walkrun", "quality", "long", "bike", "ski"]);

  /** @type {null | {
   *   ds: string,
   *   plan: object,
   *   title: string,
   *   cues: Array<{id:string,label:string,speak:string,role:string,durationSec:number}>,
   *   idx: number,
   *   segmentLeftMs: number,
   *   running: boolean,
   *   startedAt: Date | null,
   *   movingMs: number,
   *   wallEndMs: number | null,
   *   lastTick: number,
   *   useGps: boolean,
   *   gpsKm: number,
   *   gpsPoints: Array<{lat:number,lng:number,t:number,acc?:number}>,
   *   lastFix: {lat:number,lng:number,t:number} | null,
   *   watchId: number | null,
   *   wakeLock: WakeLockSentinel | null,
   *   audioCtx: AudioContext | null,
   *   raf: number | null,
   *   phase: "ready" | "active" | "done",
   *   adhoc?: boolean,
   * }} */
  let state = null;

  function tt(key, vars) {
    return typeof t === "function" ? t(key, vars) : key;
  }

  function escHtml(s) {
    if (typeof esc === "function") return esc(s);
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function formatClock(sec) {
    const s = Math.max(0, Math.round(sec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    if (h > 0) return `${h}:${pad(m)}:${pad(r)}`;
    return `${m}:${pad(r)}`;
  }

  function formatStartedAt(d) {
    return `${ymdLocal(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function ymdLocal(d) {
    if (typeof ymd === "function") return ymd(d);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function todayYmd() {
    if (typeof today === "function" && typeof ymd === "function") return ymd(today());
    return ymdLocal(new Date());
  }

  function haversineKm(a, b) {
    const R = 6371;
    const toRad = (x) => (x * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2
      + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function isBusyDay(ds) {
    try {
      return !!(typeof BUSY === "object" && BUSY?.[String(ds || todayYmd()).slice(0, 10)]);
    } catch {
      return false;
    }
  }

  /** Short 2' target for QA — enable with ?livetest=1 (not a normal option). */
  function liveTestDurationsEnabled() {
    try {
      return new URLSearchParams(location.search).get("livetest") === "1";
    } catch {
      return false;
    }
  }

  /** Phones/tablets only — GPS + audio cues are meant for on-body use. */
  function isMobileLiveDevice() {
    try {
      const coarse = window.matchMedia("(pointer: coarse)").matches;
      const fineOnly = window.matchMedia("(pointer: fine)").matches && !coarse;
      const touch = (navigator.maxTouchPoints || 0) > 0
        || window.matchMedia("(hover: none)").matches;
      const compact = window.matchMedia("(max-width: 1024px)").matches;
      if (fineOnly && !touch) return false;
      return coarse || (touch && compact);
    } catch {
      return false;
    }
  }

  /** Show Start session on today's card / day dialog (even with no plan). */
  function canOfferLiveSession(ds) {
    if (!isMobileLiveDevice()) return false;
    const day = String(ds || todayYmd()).slice(0, 10);
    if (day !== todayYmd()) return false;
    return !isBusyDay(day);
  }

  /** True when today's plan already has guided cues we can run as-is. */
  function canStartLiveSession(plan, ds) {
    if (!canOfferLiveSession(ds)) return false;
    if (!plan || !LIVE_KINDS.has(plan.kind)) return false;
    const built = typeof sessionCues === "function"
      ? sessionCues(plan.kind, plan.label, plan.km)
      : null;
    return !!(built && built.cues && built.cues.length);
  }

  function supportsGps(plan) {
    const kind = plan?.kind;
    return !!(kind && GPS_KINDS.has(kind));
  }

  const ADHOC_SPORTS = [
    { id: "run", labelKey: "live.sport.run" },
    { id: "walk", labelKey: "live.sport.walk" },
    { id: "bike", labelKey: "live.sport.bike" },
    { id: "ski", labelKey: "live.sport.ski" },
  ];

  function sportTitle(sport) {
    const map = {
      run: tt("live.sport.run"),
      walk: tt("live.sport.walk"),
      bike: tt("live.sport.bike"),
      ski: tt("live.sport.ski"),
    };
    const label = map[sport] || sport;
    // Never show raw i18n keys if a string is missing.
    if (String(label).startsWith("live.")) {
      return ({ run: "Run", walk: "Walk", bike: "Bike", ski: "Ski" })[sport] || sport;
    }
    return label;
  }

  function adhocPlan(sport, minutes) {
    const title = sportTitle(sport);
    const label = minutes > 0 ? `${title} · ${minutes}'` : title;
    return { kind: sport, label, km: null, adhoc: true };
  }

  function adhocCues(sport, minutes) {
    const title = sportTitle(sport);
    const speak = sport === "walk" ? tt("live.speak.walk")
      : sport === "bike" ? tt("live.speak.bike")
      : sport === "ski" ? tt("live.speak.ski")
      : tt("live.speak.run");
    return {
      title,
      cues: [{
        id: "c0",
        label: minutes > 0 ? `${title} · ${minutes}'` : title,
        speak,
        role: "easy",
        durationSec: minutes > 0 ? minutes * 60 : 0,
      }],
    };
  }

  /** Guided free-session intervals (warm-up · 5×3' · cool-down). */
  function intervalCuesRun() {
    const cues = [
      {
        id: "w",
        label: tt("live.interval.warmup"),
        speak: tt("live.speak.warmup"),
        role: "warmup",
        durationSec: 8 * 60,
      },
    ];
    for (let i = 0; i < 5; i++) {
      cues.push({
        id: `work${i}`,
        label: tt("live.interval.rep", { n: String(i + 1) }),
        speak: tt("live.speak.interval"),
        role: "work",
        durationSec: 3 * 60,
      });
      if (i < 4) {
        cues.push({
          id: `rec${i}`,
          label: tt("live.interval.recover"),
          speak: tt("live.speak.recover"),
          role: "recover",
          durationSec: 90,
        });
      }
    }
    cues.push({
      id: "c",
      label: tt("live.interval.cooldown"),
      speak: tt("live.speak.cooldown"),
      role: "cooldown",
      durationSec: 5 * 60,
    });
    return {
      title: tt("live.interval.title"),
      cues,
    };
  }

  function daysAgoYmd(n) {
    const d = typeof today === "function" ? new Date(today()) : new Date();
    d.setDate(d.getDate() - n);
    return ymdLocal(d);
  }

  function parseActMinutes(a) {
    const raw = a?.time || a?.duration || a?.raw?.Time || "";
    const text = String(raw).trim();
    if (!text) return null;
    const parts = text.split(":").map(Number);
    if (parts.some((x) => !Number.isFinite(x))) return null;
    let sec = 0;
    if (parts.length === 3) sec = parts[0] * 3600 + parts[1] * 60 + parts[2];
    else if (parts.length === 2) sec = parts[0] * 60 + parts[1];
    else return null;
    if (!(sec > 0 && sec < 24 * 3600)) return null;
    return sec / 60;
  }

  function typicalMinutes(acts, fallback) {
    const mins = acts.map(parseActMinutes).filter((m) => m != null && m >= 15 && m <= 150);
    if (!mins.length) return fallback;
    mins.sort((a, b) => a - b);
    const mid = mins[Math.floor(mins.length / 2)];
    if (mid < 37) return 30;
    if (mid < 52) return 45;
    return 60;
  }

  /**
   * Suggest a free session from recent logged activity (no plan required).
   * Frequent runners → interval proposal; otherwise easy timed session in usual sport.
   */
  function suggestFreeSession() {
    let acts = [];
    try {
      if (typeof peekActivities === "function") acts = peekActivities() || [];
      else if (typeof ACTS !== "undefined" && Array.isArray(ACTS)) acts = ACTS;
    } catch { /* ignore */ }
    const from = daysAgoYmd(28);
    const recent = (acts || []).filter((a) => {
      const cat = a?.cat;
      return (cat === "run" || cat === "walk" || cat === "bike" || cat === "ski")
        && String(a.date || "") >= from;
    });
    if (recent.length < 2) return null;

    const counts = { run: 0, walk: 0, bike: 0, ski: 0 };
    recent.forEach((a) => { counts[a.cat] = (counts[a.cat] || 0) + 1; });
    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const [sport, count] = ranked[0];
    if (!count) return null;
    const ofSport = recent.filter((a) => a.cat === sport);
    const minutes = typicalMinutes(ofSport, sport === "walk" ? 30 : 45);

    if (sport === "run" && count >= 3) {
      const built = intervalCuesRun();
      return {
        sport: "run",
        mode: "intervals",
        minutes: 0,
        title: built.title,
        reason: tt("live.suggest.reasonRunOften", { count: String(count) }),
        built,
      };
    }

    const title = minutes > 0
      ? `${sportTitle(sport)} · ${minutes}'`
      : sportTitle(sport);
    return {
      sport,
      mode: "easy",
      minutes,
      title,
      reason: tt("live.suggest.reasonUsual", {
        sport: sportTitle(sport),
        count: String(count),
      }),
      built: adhocCues(sport, minutes),
    };
  }

  function plannedBuild(plan) {
    if (!plan || !LIVE_KINDS.has(plan.kind)) return null;
    if (typeof sessionCues !== "function") return null;
    return sessionCues(plan.kind, plan.label, plan.km);
  }

  /**
   * Pause other audio only while spoken cues play (not for the whole session).
   * Safari/iOS Audio Session; other browsers ignore quietly.
   */
  function claimAudioFocus() {
    try {
      if ("audioSession" in navigator && navigator.audioSession) {
        navigator.audioSession.type = "transient-solo";
      }
    } catch { /* ignore */ }
  }

  function releaseAudioFocus() {
    try {
      if ("audioSession" in navigator && navigator.audioSession) {
        navigator.audioSession.type = "auto";
      }
    } catch { /* ignore */ }
  }

  async function ensureAudio() {
    if (!state) return;
    if (!state.audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      state.audioCtx = new Ctx();
    }
    if (state.audioCtx.state === "suspended" || state.audioCtx.state === "interrupted") {
      try { await state.audioCtx.resume(); } catch { /* ignore */ }
    }
  }

  let cachedVoice = null;
  let voicesReady = false;

  function warmVoices() {
    if (!window.speechSynthesis) return;
    const load = () => {
      const list = window.speechSynthesis.getVoices() || [];
      if (list.length) {
        voicesReady = true;
        cachedVoice = null; // re-pick next speak
      }
    };
    load();
    window.speechSynthesis.addEventListener?.("voiceschanged", load, { once: true });
  }
  warmVoices();

  function beep(freq, durationMs, gain = 0.1) {
    if (!state?.audioCtx) return;
    const ctx = state.audioCtx;
    const t0 = ctx.currentTime;
    const dur = Math.max(0.04, durationMs / 1000);
    // Soft fundamental + light overtone for a cleaner “ping”.
    [
      { f: freq, type: "sine", peak: gain },
      { f: freq * 2, type: "triangle", peak: gain * 0.22 },
    ].forEach(({ f, type, peak }) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.04);
    });
  }

  function playRoleBeep(role) {
    if (role === "work") {
      beep(740, 70, 0.08);
      setTimeout(() => beep(988, 160, 0.12), 90);
    } else if (role === "recover") {
      beep(587, 70, 0.07);
      setTimeout(() => beep(494, 180, 0.09), 85);
    } else if (role === "warmup" || role === "cooldown") {
      beep(523, 90, 0.07);
      setTimeout(() => beep(659, 140, 0.09), 100);
    } else {
      beep(698, 80, 0.08);
      setTimeout(() => beep(880, 140, 0.1), 95);
    }
  }

  /** Last 5 seconds: one tick per second; final second is higher/longer. */
  function countdownTickBeep(secLeft) {
    if (secLeft === 1) {
      beep(1047, 260, 0.14);
      setTimeout(() => beep(1319, 180, 0.1), 140);
      return;
    }
    const freq = 784 + (5 - secLeft) * 40;
    beep(freq, 85, 0.075 + (5 - secLeft) * 0.008);
  }

  function maybeCountdownTicks() {
    if (!state || !state.running || state.inOvertime) return;
    const cue = currentCue();
    if (!cue || !(cue.durationSec > 0) || !(state.segmentLeftMs > 0)) return;
    if (state.segmentLeftMs > 5000) {
      state._lastCountdownBeep = null;
      return;
    }
    const secLeft = Math.max(1, Math.ceil(state.segmentLeftMs / 1000));
    if (secLeft > 5) return;
    if (state._lastCountdownBeep === secLeft) return;
    state._lastCountdownBeep = secLeft;
    countdownTickBeep(secLeft);
  }

  function pickVoice(langTag) {
    if (!window.speechSynthesis) return null;
    if (cachedVoice && cachedVoice.lang?.toLowerCase().startsWith(langTag.slice(0, 2))) {
      return cachedVoice;
    }
    const voices = window.speechSynthesis.getVoices() || [];
    if (!voices.length) return null;
    const want = langTag.slice(0, 2).toLowerCase();
    const rank = (v) => {
      let s = 0;
      const name = String(v.name || "").toLowerCase();
      const vl = String(v.lang || "").toLowerCase();
      if (vl.startsWith(want)) s += 20;
      if (vl === langTag.toLowerCase()) s += 10;
      if (/google|premium|enhanced|neural|natural|microsoft|samantha|karen|moira|daniel|ellen|Xander|Google Nederlands|Nederland/i.test(name)) s += 12;
      if (/compact|eloquence|novelty|whisper|zarvox|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|pipes|trinoids|whisper/i.test(name)) s -= 20;
      if (v.localService) s += 2;
      return s;
    };
    const best = voices.slice().sort((a, b) => rank(b) - rank(a))[0] || null;
    cachedVoice = best;
    return best;
  }

  let speakGen = 0;

  function stopSpeech() {
    speakGen += 1;
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    releaseAudioFocus();
  }

  function speak(text) {
    if (!window.speechSynthesis || !text) return;
    try {
      window.speechSynthesis.cancel();
      const gen = ++speakGen;
      claimAudioFocus();
      const lang = (document.documentElement.lang || "en").toLowerCase();
      const langTag = lang.startsWith("nl") ? "nl-NL" : "en-US";
      const u = new SpeechSynthesisUtterance(String(text));
      u.lang = langTag;
      u.rate = 0.94;
      u.pitch = 1.02;
      u.volume = 1;
      const voice = pickVoice(langTag);
      if (voice) u.voice = voice;
      const done = () => {
        if (gen !== speakGen) return;
        releaseAudioFocus();
      };
      u.onend = done;
      u.onerror = done;
      // Tiny delay helps some browsers actually apply the chosen voice.
      setTimeout(() => {
        if (gen !== speakGen) return;
        try { window.speechSynthesis.speak(u); } catch { done(); }
      }, voicesReady ? 40 : 120);
    } catch { /* ignore */ }
  }

  function announceCue(cue) {
    if (!cue) return;
    playRoleBeep(cue.role);
    setTimeout(() => speak(cue.speak), 280);
  }

  async function requestWakeLock() {
    if (!state || !navigator.wakeLock?.request) return;
    try {
      state.wakeLock = await navigator.wakeLock.request("screen");
      state.wakeLock.addEventListener("release", () => {
        if (state) state.wakeLock = null;
      });
    } catch { /* unsupported / denied */ }
  }

  function releaseWakeLock() {
    try { state?.wakeLock?.release(); } catch { /* ignore */ }
    if (state) state.wakeLock = null;
  }

  function stopGps() {
    if (state?.watchId != null && navigator.geolocation) {
      try { navigator.geolocation.clearWatch(state.watchId); } catch { /* ignore */ }
    }
    if (state) state.watchId = null;
  }

  function startGps() {
    if (!state?.useGps || !navigator.geolocation) return;
    stopGps();
    state.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!state || !state.running) return;
        const acc = pos.coords.accuracy;
        if (acc != null && acc > 45) return;
        const fix = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          t: Date.now(),
          acc: acc ?? undefined,
        };
        if (state.lastFix) {
          const dt = (fix.t - state.lastFix.t) / 1000;
          const dKm = haversineKm(state.lastFix, fix);
          // Ignore teleport / stalled noise
          if (dt > 0 && dt < 30 && dKm < 0.12 && dKm > 0.0005) {
            const speedKmh = (dKm / dt) * 3600;
            if (speedKmh < 45 || state.plan?.kind === "bike") {
              state.gpsKm += dKm;
            }
          }
        }
        state.lastFix = { lat: fix.lat, lng: fix.lng, t: fix.t };
        const last = state.gpsPoints[state.gpsPoints.length - 1];
        if (!last || fix.t - last.t >= 4000 || haversineKm(last, fix) >= 0.02) {
          if (state.gpsPoints.length < 600) state.gpsPoints.push(fix);
        }
        paintOverlay();
      },
      () => {
        if (state) {
          const el = document.querySelector("[data-live-gps-status]");
          if (el) el.textContent = tt("live.gpsUnavailable");
        }
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
    );
  }

  function currentCue() {
    return state?.cues?.[state.idx] || null;
  }

  function nextCue() {
    return state?.cues?.[state.idx + 1] || null;
  }

  function isIntervalSession() {
    return (state?.cues?.length || 0) > 1;
  }

  /** Single timed block (e.g. free 30 min) — countdown, then overtime (no auto-finish). */
  function hasTargetCountdown() {
    if (!state || isIntervalSession() || state.inOvertime) return false;
    const cue = state.cues?.[0];
    return !!(cue && cue.durationSec > 0);
  }

  function targetDurationSec() {
    const cue = state?.cues?.[0];
    return cue && cue.durationSec > 0 ? cue.durationSec : 0;
  }

  function enterOvertime() {
    if (!state || state.inOvertime) return;
    state.inOvertime = true;
    state.segmentLeftMs = 0;
    playRoleBeep("work");
    speak(tt("live.targetReached"));
    paintOverlay();
  }

  function wallMs() {
    if (!state?.startedAt) return 0;
    if (state.phase === "done" && state.wallEndMs != null) {
      return Math.max(0, state.wallEndMs - state.startedAt.getTime());
    }
    return Math.max(0, Date.now() - state.startedAt.getTime());
  }

  function trackMapHtml(points) {
    if (!points || points.length < 2) return "";
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;
    points.forEach((p) => {
      minLat = Math.min(minLat, p.lat);
      maxLat = Math.max(maxLat, p.lat);
      minLng = Math.min(minLng, p.lng);
      maxLng = Math.max(maxLng, p.lng);
    });
    const padLat = Math.max((maxLat - minLat) * 0.12, 0.00025);
    const padLng = Math.max((maxLng - minLng) * 0.12, 0.00025);
    minLat -= padLat;
    maxLat += padLat;
    minLng -= padLng;
    maxLng += padLng;
    const w = 320;
    const h = 200;
    const spanLat = maxLat - minLat || 0.001;
    const spanLng = maxLng - minLng || 0.001;
    const xy = (p) => {
      const x = ((p.lng - minLng) / spanLng) * (w - 16) + 8;
      const y = (1 - (p.lat - minLat) / spanLat) * (h - 16) + 8;
      return [x, y];
    };
    const pts = points.map(xy);
    const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
    const [sx, sy] = pts[0];
    const [ex, ey] = pts[pts.length - 1];
    return `
      <div class="live-map-wrap" aria-label="${escHtml(tt("live.routeMap"))}">
        <svg class="live-map" viewBox="0 0 ${w} ${h}" role="img">
          <path class="live-map-line" d="${d}" />
          <circle class="live-map-start" cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="4" />
          <circle class="live-map-end" cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="4" />
        </svg>
      </div>`;
  }

  function advanceSegment() {
    if (!state) return;
    if (state.idx >= state.cues.length - 1) {
      finishSession(false);
      return;
    }
    state.idx += 1;
    const cue = currentCue();
    state.segmentLeftMs = cue && cue.durationSec > 0 ? cue.durationSec * 1000 : Infinity;
    state._lastCountdownBeep = null;
    announceCue(cue);
    paintOverlay();
  }

  function tick(now) {
    if (!state || state.phase !== "active") return;
    state.raf = requestAnimationFrame(tick);
    if (!state.running) {
      state.lastTick = now;
      if (!state._lastPaint || now - state._lastPaint > 400) {
        state._lastPaint = now;
        paintOverlay();
      }
      return;
    }
    const dt = now - (state.lastTick || now);
    state.lastTick = now;
    state.movingMs += dt;
    const cue = currentCue();
    if (cue && cue.durationSec > 0 && !state.inOvertime) {
      state.segmentLeftMs -= dt;
      maybeCountdownTicks();
      // Mid-session cues for timed free sessions (not intervals).
      if (!isIntervalSession() && (cue.durationSec || 0) >= 90) {
        const totalMs = cue.durationSec * 1000;
        const left = state.segmentLeftMs;
        if (
          !state._warnedHalf
          && left <= totalMs / 2
          && left > 5000
        ) {
          state._warnedHalf = true;
          playRoleBeep("easy");
          speak(tt("live.halfway"));
        }
        // "One minute left" only when the target is longer than 3' (avoids clashing with halfway on 2').
        if (
          !state._warnedMinute
          && cue.durationSec > 180
          && left <= 60000
          && left > 5000
        ) {
          state._warnedMinute = true;
          playRoleBeep("warmup");
          speak(tt("live.oneMinuteLeft"));
        }
      }
      if (state.segmentLeftMs <= 0) {
        if (!isIntervalSession()) {
          enterOvertime();
          return;
        }
        advanceSegment();
        return;
      }
    }
    if (!state._lastPaint || now - state._lastPaint > 250) {
      state._lastPaint = now;
      paintOverlay();
    }
  }

  function sportCat() {
    if (state?.plan?.adhoc) {
      if (state.plan.logSport) return state.plan.logSport;
      if (["run", "walk", "bike", "ski"].includes(state.plan.kind)) return state.plan.kind;
      return "run";
    }
    if (typeof plannedLogSport === "function") return plannedLogSport(state?.plan);
    return "run";
  }

  function paceText(movingSec, km) {
    if (!(km > 0.05) || !(movingSec > 0) || typeof fmtPace !== "function") return "—";
    const cat = sportCat();
    if (cat === "bike") return `${(km / (movingSec / 3600)).toFixed(1)} km/h`;
    return `${fmtPace(movingSec / km)} /km`;
  }

  function paintOverlay() {
    const root = document.getElementById("live-session");
    if (!root || !state) return;
    const cue = currentCue();
    const next = nextCue();
    const interval = isIntervalSession();
    const openEnded = !!(cue && !(cue.durationSec > 0));
    const movingSec = Math.floor((state.movingMs || 0) / 1000);
    const wallSec = Math.floor(wallMs() / 1000);
    const left = openEnded
      ? movingSec
      : Math.max(0, Math.ceil((state.segmentLeftMs || 0) / 1000));
    const progress = cue && cue.durationSec > 0
      ? 1 - Math.max(0, state.segmentLeftMs) / (cue.durationSec * 1000)
      : 0;

    root.dataset.phase = state.phase;

    root.querySelectorAll("[data-live-ready-only]").forEach((el) => {
      el.hidden = state.phase !== "ready";
    });
    root.querySelectorAll("[data-live-active-only]").forEach((el) => {
      el.hidden = state.phase !== "active";
    });
    root.querySelectorAll("[data-live-done-only]").forEach((el) => {
      el.hidden = state.phase !== "done";
    });

    const titleEl = root.querySelector("[data-live-title]");
    if (titleEl && state.phase !== "ready") {
      titleEl.textContent = state.phase === "done"
        ? tt("live.doneTitle")
        : (state.title || cue?.label || tt("live.title"));
    }
    const stepEl = root.querySelector("[data-live-step]");
    if (stepEl) {
      if (state.phase === "ready") {
        stepEl.textContent = state.adhoc ? tt("live.readySub") : "";
      } else if (state.phase === "active" && interval) {
        stepEl.textContent = tt("live.step", {
          current: String(Math.min(state.idx + 1, state.cues.length)),
          total: String(state.cues.length),
        });
      } else {
        stepEl.textContent = "";
      }
    }

    const timed = hasTargetCountdown();
    const overtime = !!(state.phase === "active" && state.inOvertime);
    const targetSec = targetDurationSec();
    const overtimeSec = overtime && targetSec > 0
      ? Math.max(0, movingSec - targetSec)
      : 0;
    const roleEl = root.querySelector("[data-live-role]");
    const cueEl = root.querySelector("[data-live-cue]");
    const leftEl = root.querySelector("[data-live-left]");
    const nextEl = root.querySelector("[data-live-next]");
    const intervalBlock = root.querySelector("[data-live-interval]");
    const intervalRingWrap = root.querySelector("[data-live-interval-ring-wrap]");
    const intervalRingEl = root.querySelector("[data-live-interval-ring]");
    const primaryBlock = root.querySelector("[data-live-primary-block]");
    const showInterval = state.phase === "active" && interval;
    if (intervalBlock) intervalBlock.hidden = !showInterval;
    if (primaryBlock) primaryBlock.hidden = showInterval; // interval segment owns the top
    if (roleEl) {
      roleEl.textContent = tt(`live.role.${cue?.role || "easy"}`);
      roleEl.dataset.role = cue?.role || "easy";
    }
    if (cueEl) cueEl.textContent = cue?.label || "—";
    if (leftEl) leftEl.textContent = formatClock(left);
    if (nextEl) {
      nextEl.textContent = next
        ? tt("live.nextCue", { cue: next.label })
        : tt("live.lastCue");
    }
    const RING_C = 2 * Math.PI * 54;
    if (intervalRingWrap) {
      intervalRingWrap.dataset.role = cue?.role || "easy";
    }
    if (intervalRingEl && showInterval) {
      // Remaining fraction: full at start, empties as the segment countdown runs.
      const remaining = Math.min(1, Math.max(0, 1 - progress));
      intervalRingEl.style.strokeDasharray = String(RING_C);
      intervalRingEl.style.strokeDashoffset = String(RING_C * (1 - remaining));
      intervalRingEl.style.opacity = "1";
    }

    const primaryEl = root.querySelector("[data-live-primary]");
    const primaryHint = root.querySelector("[data-live-primary-hint]");
    const ringWrap = root.querySelector("[data-live-ring-wrap]");
    const ringEl = root.querySelector("[data-live-ring]");
    const overtimeBanner = root.querySelector("[data-live-overtime]");
    if (primaryEl && state.phase === "active" && !showInterval) {
      if (timed) {
        primaryEl.textContent = formatClock(left);
        primaryEl.dataset.mode = "countdown";
      } else if (overtime) {
        primaryEl.textContent = `+${formatClock(overtimeSec)}`;
        primaryEl.dataset.mode = "overtime";
      } else {
        primaryEl.textContent = formatClock(movingSec);
        primaryEl.dataset.mode = "moving";
      }
    }
    if (primaryHint && state.phase === "active" && !showInterval) {
      // Countdown is self-explanatory; only hint open / overtime.
      if (timed) {
        primaryHint.hidden = true;
        primaryHint.textContent = "";
      } else {
        primaryHint.hidden = false;
        primaryHint.textContent = overtime ? tt("live.overtimeHint") : tt("live.movingHint");
      }
    }
    if (ringWrap && !showInterval) {
      ringWrap.classList.toggle("is-countdown", !!(state.phase === "active" && timed));
      ringWrap.classList.toggle("is-overtime", overtime);
      ringWrap.classList.toggle("is-plain", !(timed || overtime));
    }
    if (ringEl && !showInterval) {
      if (state.phase === "active" && timed) {
        // Remaining fraction: full at start, empties as countdown runs.
        const remaining = Math.min(1, Math.max(0, 1 - progress));
        ringEl.style.strokeDasharray = String(RING_C);
        ringEl.style.strokeDashoffset = String(RING_C * (1 - remaining));
        ringEl.style.opacity = "1";
      } else if (overtime) {
        ringEl.style.strokeDasharray = String(RING_C);
        ringEl.style.strokeDashoffset = String(RING_C); // empty after target
        ringEl.style.opacity = "1";
      } else {
        ringEl.style.strokeDashoffset = String(RING_C);
        ringEl.style.opacity = "0";
      }
    }
    if (overtimeBanner) {
      overtimeBanner.hidden = !overtime;
      if (overtime) {
        overtimeBanner.textContent = tt("live.overtimeBanner", {
          target: formatClock(targetSec),
        });
      }
    }

    root.querySelectorAll("[data-live-moving]").forEach((el) => {
      el.textContent = formatClock(movingSec);
    });
    root.querySelectorAll("[data-live-wall]").forEach((el) => {
      el.textContent = formatClock(wallSec);
    });
    root.querySelectorAll("[data-live-dist]").forEach((el) => {
      el.textContent = state.useGps
        ? `${(state.gpsKm || 0).toFixed(2)} km`
        : "—";
    });
    root.querySelectorAll("[data-live-pace]").forEach((el) => {
      el.textContent = state.useGps ? paceText(movingSec, state.gpsKm || 0) : "—";
    });
    root.querySelectorAll("[data-live-gps]").forEach((el) => {
      el.hidden = !state.useGps;
    });
    root.querySelectorAll("[data-live-moving-stat]").forEach((el) => {
      // Show beside elapsed for intervals, timed countdown, and overtime.
      el.hidden = !(state.phase === "active" && (showInterval || timed || overtime));
    });

    const pausedBanner = root.querySelector("[data-live-paused]");
    if (pausedBanner) pausedBanner.hidden = !(state.phase === "active" && !state.running);

    const pauseBtn = root.querySelector("[data-action=live-pause]");
    const resumeBtn = root.querySelector("[data-action=live-resume]");
    const skipBtn = root.querySelector("[data-action=live-skip]");
    if (pauseBtn) pauseBtn.hidden = !(state.phase === "active" && state.running);
    if (resumeBtn) resumeBtn.hidden = !(state.phase === "active" && !state.running);
    if (skipBtn) skipBtn.hidden = !(state.phase === "active" && interval);

    const mapHost = root.querySelector("[data-live-map]");
    if (mapHost && state.phase === "done") {
      mapHost.innerHTML = state.useGps ? trackMapHtml(state.gpsPoints) : "";
      mapHost.hidden = !mapHost.innerHTML;
    }
  }

  function overlayHtml(plan, built, preferGps, adhoc, suggestion) {
    const gpsOk = adhoc || supportsGps(plan);
    const sport = suggestion?.sport
      || (plan?.kind && ADHOC_SPORTS.some((s) => s.id === plan.kind) ? plan.kind : "run");
    const mode = suggestion?.mode === "intervals" ? "intervals" : "easy";
    const minutes = suggestion?.minutes ?? 0;
    const durationOpts = [
      { min: 0, key: "live.durationOpen" },
      ...(liveTestDurationsEnabled() ? [{ min: 2, key: "live.duration2" }] : []),
      { min: 30, key: "live.duration30" },
      { min: 45, key: "live.duration45" },
      { min: 60, key: "live.duration60" },
    ];
    return `
      <div class="live-session" id="live-session" data-phase="ready" data-adhoc-mode="${mode}" role="dialog" aria-modal="true" aria-label="${escHtml(tt("live.title"))}">
        <div class="live-session-inner">
          <header class="live-head">
            <div>
              <div class="eyebrow">${escHtml(tt("live.title"))}</div>
              <h2 data-live-title>${escHtml(adhoc ? (suggestion?.title || tt("live.pickSportTitle")) : (built.title || plan.label || ""))}</h2>
              <p class="muted small-text live-head-progress" data-live-step>${adhoc ? escHtml(tt("live.readySub")) : ""}</p>
            </div>
            <button class="icon-button" type="button" data-action="live-discard" aria-label="${escHtml(tt("live.discard"))}">✕</button>
          </header>

          <div class="live-ready" data-live-ready-only>
            <p class="muted">${escHtml(adhoc ? tt("live.readyHintFree") : tt("live.readyHint"))}</p>
            ${adhoc && suggestion ? `
              <div class="live-suggest">
                <div class="live-pick-label">${escHtml(tt("live.suggest.label"))}</div>
                <p class="live-suggest-title"><strong>${escHtml(suggestion.title)}</strong></p>
                <p class="muted small-text">${escHtml(suggestion.reason)}</p>
                <button class="button ghost small" type="button" data-action="live-use-suggest">${escHtml(tt("live.suggest.use"))}</button>
              </div>
            ` : ""}
            ${adhoc ? `
              <div class="live-pick-block">
                <div class="live-pick-label">${escHtml(tt("live.pickSport"))}</div>
                <div class="live-sport-grid" role="group" aria-label="${escHtml(tt("live.pickSport"))}">
                  ${ADHOC_SPORTS.map((s) => `
                    <button class="choice-btn${s.id === sport ? " active" : ""}" type="button"
                      data-action="live-pick-sport" data-sport="${s.id}" aria-pressed="${s.id === sport ? "true" : "false"}">
                      ${escHtml(tt(s.labelKey))}
                    </button>`).join("")}
                </div>
              </div>
              <div class="live-pick-block" data-live-workout-block>
                <div class="live-pick-label">${escHtml(tt("live.pickWorkout"))}</div>
                <div class="live-workout-grid" role="group" aria-label="${escHtml(tt("live.pickWorkout"))}">
                  <button class="choice-btn${mode === "easy" ? " active" : ""}" type="button"
                    data-action="live-pick-workout" data-workout="easy" aria-pressed="${mode === "easy" ? "true" : "false"}">
                    ${escHtml(tt("live.workout.easy"))}
                  </button>
                  <button class="choice-btn${mode === "intervals" ? " active" : ""}" type="button"
                    data-action="live-pick-workout" data-workout="intervals" data-live-intervals-btn aria-pressed="${mode === "intervals" ? "true" : "false"}">
                    ${escHtml(tt("live.workout.intervals"))}
                  </button>
                </div>
              </div>
              <div class="live-pick-block" data-live-duration-block ${mode === "intervals" ? "hidden" : ""}>
                <div class="live-pick-label">${escHtml(tt("live.pickDuration"))}</div>
                <div class="live-duration-grid" role="group" aria-label="${escHtml(tt("live.pickDuration"))}">
                  ${durationOpts.map((d) => `
                    <button class="choice-btn${d.min === minutes ? " active" : ""}" type="button"
                      data-action="live-pick-duration" data-minutes="${d.min}" aria-pressed="${d.min === minutes ? "true" : "false"}">
                      ${escHtml(tt(d.key))}
                    </button>`).join("")}
                </div>
                <p class="muted small-text">${escHtml(tt("live.durationEnds"))}</p>
              </div>
              <p class="muted small-text" data-live-interval-hint ${mode === "intervals" ? "" : "hidden"}>
                ${escHtml(tt("live.interval.hint"))}
              </p>
            ` : ""}
            ${gpsOk ? `
              <label class="live-gps-toggle">
                <input type="checkbox" data-live-gps-check ${preferGps ? "checked" : ""} />
                <span>${escHtml(tt("live.trackGps"))}</span>
              </label>
              <p class="muted small-text">${escHtml(tt("live.gpsHint"))}</p>
            ` : ""}
            <button class="button live-primary" type="button" data-action="live-go">${escHtml(tt("live.start"))}</button>
          </div>

          <div class="live-active" data-live-active-only hidden>
            <p class="live-paused-banner" data-live-paused hidden>${escHtml(tt("live.paused"))}</p>
            <p class="live-overtime-banner" data-live-overtime hidden></p>
            <div class="live-interval" data-live-interval hidden>
              <div class="live-role" data-live-role data-role="easy"></div>
              <div class="live-cue" data-live-cue>—</div>
              <div class="live-countdown-ring is-countdown" data-live-interval-ring-wrap data-role="easy">
                <svg class="live-ring-svg" viewBox="0 0 120 120" aria-hidden="true">
                  <circle class="live-ring-track" cx="60" cy="60" r="54" />
                  <circle class="live-ring-progress" data-live-interval-ring cx="60" cy="60" r="54" />
                </svg>
                <div class="live-moving" data-mode="countdown" data-live-left>0:00</div>
              </div>
              <p class="live-next muted" data-live-next></p>
            </div>
            <div class="live-active-main" data-live-primary-block>
              <div class="live-countdown-ring" data-live-ring-wrap>
                <svg class="live-ring-svg" viewBox="0 0 120 120" aria-hidden="true">
                  <circle class="live-ring-track" cx="60" cy="60" r="54" />
                  <circle class="live-ring-progress" data-live-ring cx="60" cy="60" r="54" />
                </svg>
                <div class="live-moving" data-live-primary>0:00</div>
              </div>
              <p class="muted small-text" data-live-primary-hint>${escHtml(tt("live.movingHint"))}</p>
            </div>
            <div class="live-stats">
              <div data-live-moving-stat hidden>
                <span>${escHtml(tt("live.moving"))}</span>
                <strong data-live-moving>0:00</strong>
              </div>
              <div>
                <span>${escHtml(tt("live.elapsed"))}</span>
                <strong data-live-wall>0:00</strong>
              </div>
              <div data-live-gps hidden>
                <span>${escHtml(tt("live.distance"))}</span>
                <strong data-live-dist>0.00 km</strong>
              </div>
              <div data-live-gps hidden>
                <span>${escHtml(tt("live.pace"))}</span>
                <strong data-live-pace>—</strong>
              </div>
            </div>
            <p class="muted small-text" data-live-gps-status></p>
            <div class="live-controls">
              <button class="button ghost" type="button" data-action="live-pause">${escHtml(tt("live.pause"))}</button>
              <button class="button" type="button" data-action="live-resume" hidden>${escHtml(tt("live.resume"))}</button>
              <button class="button ghost" type="button" data-action="live-skip" hidden>${escHtml(tt("live.skip"))}</button>
              <button class="button" type="button" data-action="live-finish">${escHtml(tt("live.finish"))}</button>
            </div>
          </div>

          <div class="live-done" data-live-done-only hidden>
            <div class="live-stats">
              <div>
                <span>${escHtml(tt("live.moving"))}</span>
                <strong data-live-moving>0:00</strong>
              </div>
              <div>
                <span>${escHtml(tt("live.elapsed"))}</span>
                <strong data-live-wall>0:00</strong>
              </div>
              <div data-live-gps hidden>
                <span>${escHtml(tt("live.distance"))}</span>
                <strong data-live-dist>0.00 km</strong>
              </div>
            </div>
            <div data-live-map hidden></div>
            <p class="muted small-text">${escHtml(tt("live.doneHint"))}</p>
            <div class="live-controls">
              <button class="button ghost" type="button" data-action="live-share">${escHtml(tt("live.share"))}</button>
              <button class="button ghost" type="button" data-action="live-discard">${escHtml(tt("live.discard"))}</button>
              <button class="button" type="button" data-action="live-save">${escHtml(tt("live.save"))}</button>
            </div>
          </div>
        </div>
        <div class="live-confirm" data-live-confirm hidden>
          <div class="live-confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="live-confirm-title" aria-describedby="live-confirm-copy">
            <h3 id="live-confirm-title">${escHtml(tt("live.discardTitle"))}</h3>
            <p id="live-confirm-copy" class="muted">${escHtml(tt("live.discardConfirm"))}</p>
            <div class="live-controls">
              <button class="button ghost" type="button" data-action="live-discard-cancel">${escHtml(tt("common.cancel"))}</button>
              <button class="button" type="button" data-action="live-discard-confirm">${escHtml(tt("live.discard"))}</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  function showDiscardConfirm(show) {
    const el = document.querySelector("[data-live-confirm]");
    if (!el) return;
    el.hidden = !show;
  }

  function requestDiscard() {
    // Nothing recorded yet — close immediately.
    if (!state || state.phase === "ready") {
      closeOverlay();
      return;
    }
    showDiscardConfirm(true);
  }

  function closeOverlay() {
    stopGps();
    releaseWakeLock();
    if (state?.raf) cancelAnimationFrame(state.raf);
    if (state?.audioCtx) {
      try { state.audioCtx.close(); } catch { /* ignore */ }
    }
    stopSpeech();
    document.getElementById("live-session")?.remove();
    document.body.classList.remove("live-session-open");
    state = null;
  }

  function readAdhocChoices() {
    const root = document.getElementById("live-session");
    const sportBtn = root?.querySelector("[data-action=live-pick-sport].active");
    const durBtn = root?.querySelector("[data-action=live-pick-duration].active");
    const workoutBtn = root?.querySelector("[data-action=live-pick-workout].active");
    const sport = sportBtn?.dataset.sport || "run";
    const minutes = Number(durBtn?.dataset.minutes || 0);
    const workout = workoutBtn?.dataset.workout === "intervals" && sport === "run"
      ? "intervals"
      : "easy";
    return {
      sport,
      minutes: Number.isFinite(minutes) ? minutes : 0,
      workout,
    };
  }

  function syncAdhocWorkoutUi() {
    const root = document.getElementById("live-session");
    if (!root || !state?.adhoc) return;
    const sport = root.querySelector("[data-action=live-pick-sport].active")?.dataset.sport || "run";
    const intervalsBtn = root.querySelector("[data-live-intervals-btn]");
    const durationBlock = root.querySelector("[data-live-duration-block]");
    const intervalHint = root.querySelector("[data-live-interval-hint]");
    const canIntervals = sport === "run";
    if (intervalsBtn) {
      intervalsBtn.disabled = !canIntervals;
      intervalsBtn.hidden = !canIntervals;
      if (!canIntervals && intervalsBtn.classList.contains("active")) {
        pickChoice("[data-action=live-pick-workout]", root.querySelector("[data-action=live-pick-workout][data-workout=easy]"));
      }
    }
    const workout = root.querySelector("[data-action=live-pick-workout].active")?.dataset.workout || "easy";
    const intervals = canIntervals && workout === "intervals";
    root.dataset.adhocMode = intervals ? "intervals" : "easy";
    if (durationBlock) durationBlock.hidden = intervals;
    if (intervalHint) intervalHint.hidden = !intervals;
    const titleEl = root.querySelector("[data-live-title]");
    if (titleEl) {
      titleEl.textContent = intervals
        ? tt("live.interval.title")
        : sportTitle(sport);
    }
  }

  function applySuggestion(suggestion) {
    const root = document.getElementById("live-session");
    if (!root || !suggestion) return;
    state.suggestion = suggestion;
    const sportBtn = root.querySelector(`[data-action=live-pick-sport][data-sport="${suggestion.sport}"]`);
    if (sportBtn) pickChoice("[data-action=live-pick-sport]", sportBtn);
    const workoutBtn = root.querySelector(
      `[data-action=live-pick-workout][data-workout="${suggestion.mode === "intervals" ? "intervals" : "easy"}"]`,
    );
    if (workoutBtn) pickChoice("[data-action=live-pick-workout]", workoutBtn);
    if (suggestion.mode !== "intervals") {
      const durBtn = root.querySelector(
        `[data-action=live-pick-duration][data-minutes="${suggestion.minutes}"]`,
      ) || root.querySelector("[data-action=live-pick-duration][data-minutes='45']");
      if (durBtn) pickChoice("[data-action=live-pick-duration]", durBtn);
    }
    syncAdhocWorkoutUi();
  }

  async function beginActive() {
    if (!state || state.phase !== "ready") return;

    if (state.adhoc) {
      const { sport, minutes, workout } = readAdhocChoices();
      let built;
      if (workout === "intervals" && sport === "run") {
        built = intervalCuesRun();
        state.plan = { kind: "quality", label: built.title, km: null, adhoc: true, logSport: "run" };
      } else {
        built = adhocCues(sport, minutes);
        state.plan = adhocPlan(sport, minutes);
      }
      state.title = built.title;
      state.cues = built.cues;
      const titleEl = document.querySelector("[data-live-title]");
      if (titleEl) titleEl.textContent = built.title;
    }

    const check = document.querySelector("[data-live-gps-check]");
    state.useGps = !!(check?.checked && supportsGps(state.plan));
    await ensureAudio();
    state.phase = "active";
    state.running = true;
    state.startedAt = new Date();
    state.movingMs = 0;
    state.wallEndMs = null;
    state._warnedMinute = false;
    state._warnedHalf = false;
    state._lastCountdownBeep = null;
    state.inOvertime = false;
    state.idx = 0;
    warmVoices();
    const cue = currentCue();
    state.segmentLeftMs = cue && cue.durationSec > 0 ? cue.durationSec * 1000 : Infinity;
    state.lastTick = performance.now();
    await requestWakeLock();
    if (state.useGps) startGps();
    announceCue(currentCue());
    paintOverlay();
    state.raf = requestAnimationFrame(tick);
  }

  function setPaused(paused) {
    if (!state || state.phase !== "active") return;
    state.running = !paused;
    state.lastTick = performance.now();
    if (!paused) {
      requestWakeLock();
      if (state.useGps && state.watchId == null) startGps();
    } else {
      stopSpeech();
    }
    paintOverlay();
  }

  function skipSegment() {
    if (!state || state.phase !== "active") return;
    advanceSegment();
  }

  function finishSession(fromButton) {
    if (!state) return;
    if (state.phase === "done") return;
    state.wallEndMs = Date.now();
    state.phase = "done";
    state.running = false;
    stopGps();
    releaseWakeLock();
    if (state.raf) {
      cancelAnimationFrame(state.raf);
      state.raf = null;
    }
    stopSpeech();
    if (fromButton) playRoleBeep("cooldown");
    speak(tt("live.doneSpeak"));
    paintOverlay();
  }

  function openShareFromLive() {
    if (!state || typeof window.openShareCard !== "function") return;
    const cat = sportCat();
    const movingSec = Math.max(0, Math.round(state.movingMs / 1000));
    const dist = state.useGps && state.gpsKm > 0.05
      ? Math.round(state.gpsKm * 100) / 100
      : (Number(state.plan?.km) > 0 ? Number(state.plan.km) : 0);
    window.openShareCard({
      title: state.plan?.label || state.title || tt("live.doneTitle"),
      sport: cat,
      distanceKm: dist,
      dist: cat === "swim" ? dist * 1000 : dist,
      movingSec,
      date: state.ds,
      track: state.gpsPoints || [],
    });
  }

  async function saveSession() {
    if (!state) return;
    const plan = state.plan;
    const cat = sportCat();
    const movingSec = Math.max(1, Math.round(state.movingMs / 1000));
    let dist = state.useGps && state.gpsKm > 0.05
      ? Math.round(state.gpsKm * 100) / 100
      : (Number(plan.km) > 0 ? Number(plan.km) : 0);
    if (!(dist > 0)) {
      if (cat === "bike") dist = Math.round((25 * movingSec / 3600) * 100) / 100;
      else if (cat === "walk") dist = Math.round((5.5 * movingSec / 3600) * 100) / 100;
      else dist = Math.round((10 * movingSec / 3600) * 100) / 100;
    }
    dist = Math.max(0.1, dist);

    const duration = typeof formatHms === "function"
      ? formatHms(movingSec)
      : formatClock(movingSec);

    const started = state.startedAt ? formatStartedAt(state.startedAt) : formatStartedAt(new Date());
    const track = state.gpsPoints.slice();

    const btn = document.querySelector("[data-action=live-save]");
    if (btn) btn.disabled = true;
    try {
      if (typeof apiRequest !== "function") throw new Error(tt("live.saveFail"));
      await apiRequest("POST", "/api/activities", {
        date: state.ds,
        type: cat,
        distance: dist,
        duration,
        source: state.useGps ? "phone-gps" : "phone-session",
        startedAt: started,
        title: plan.label || undefined,
        track: track.length ? track : undefined,
      });
      if (typeof loadActivities === "function") {
        ACTS = await loadActivities();
      }
      closeOverlay();
      document.getElementById("day-dialog")?.close?.();
      if (typeof render === "function") render(true);
      if (typeof toast === "function") toast(tt("live.saved"));
    } catch (err) {
      if (btn) btn.disabled = false;
      if (typeof toast === "function") toast(err?.message || tt("live.saveFail"), true);
    }
  }

  function openLiveSession(ds) {
    const day = String(ds || todayYmd()).slice(0, 10);
    if (!isMobileLiveDevice()) {
      if (typeof toast === "function") toast(tt("live.mobileOnly"), true);
      return;
    }
    if (!canOfferLiveSession(day)) {
      if (typeof toast === "function") toast(tt("live.unavailable"), true);
      return;
    }
    const planDay = typeof planFor === "function" ? planFor(day) : null;
    const planned = plannedBuild(planDay);
    const adhoc = !planned?.cues?.length;
    const suggestion = adhoc ? suggestFreeSession() : null;
    const plan = adhoc
      ? (suggestion
        ? (suggestion.mode === "intervals"
          ? { kind: "quality", label: suggestion.title, km: null, adhoc: true, logSport: "run" }
          : adhocPlan(suggestion.sport, suggestion.minutes))
        : adhocPlan("run", 0))
      : planDay;
    const built = adhoc
      ? (suggestion?.built || adhocCues("run", 0))
      : planned;

    closeOverlay();
    state = {
      ds: day,
      plan,
      title: built.title,
      cues: built.cues,
      idx: 0,
      segmentLeftMs: built.cues[0].durationSec > 0 ? built.cues[0].durationSec * 1000 : Infinity,
      running: false,
      startedAt: null,
      movingMs: 0,
      wallEndMs: null,
      inOvertime: false,
      lastTick: 0,
      useGps: true,
      gpsKm: 0,
      gpsPoints: [],
      lastFix: null,
      watchId: null,
      wakeLock: null,
      audioCtx: null,
      raf: null,
      phase: "ready",
      adhoc,
      suggestion,
    };

    document.body.insertAdjacentHTML(
      "beforeend",
      overlayHtml(plan, built, true, adhoc, suggestion),
    );
    document.body.classList.add("live-session-open");
    try { document.getElementById("day-dialog")?.close?.(); } catch { /* ignore */ }
    if (adhoc) syncAdhocWorkoutUi();
    paintOverlay();
  }

  function pickChoice(groupSelector, btn) {
    const root = document.getElementById("live-session");
    if (!root) return;
    root.querySelectorAll(groupSelector).forEach((el) => {
      el.classList.toggle("active", el === btn);
      el.setAttribute("aria-pressed", el === btn ? "true" : "false");
    });
  }

  function onClick(e) {
    const btn = e.target.closest?.("[data-action]");
    if (!btn || !document.getElementById("live-session")) return;
    const action = btn.dataset.action;
    if (action === "live-pick-sport") {
      e.preventDefault();
      pickChoice("[data-action=live-pick-sport]", btn);
      syncAdhocWorkoutUi();
      return;
    }
    if (action === "live-pick-workout") {
      e.preventDefault();
      pickChoice("[data-action=live-pick-workout]", btn);
      syncAdhocWorkoutUi();
      return;
    }
    if (action === "live-use-suggest") {
      e.preventDefault();
      if (state?.suggestion) applySuggestion(state.suggestion);
      return;
    }
    if (action === "live-pick-duration") {
      e.preventDefault();
      pickChoice("[data-action=live-pick-duration]", btn);
      return;
    }
    if (action === "live-go") {
      e.preventDefault();
      beginActive();
      return;
    }
    if (action === "live-pause") {
      e.preventDefault();
      setPaused(true);
      return;
    }
    if (action === "live-resume") {
      e.preventDefault();
      setPaused(false);
      return;
    }
    if (action === "live-skip") {
      e.preventDefault();
      skipSegment();
      return;
    }
    if (action === "live-finish") {
      e.preventDefault();
      finishSession(true);
      return;
    }
    if (action === "live-save") {
      e.preventDefault();
      saveSession();
      return;
    }
    if (action === "live-share") {
      e.preventDefault();
      openShareFromLive();
      return;
    }
    if (action === "live-discard") {
      e.preventDefault();
      requestDiscard();
      return;
    }
    if (action === "live-discard-cancel") {
      e.preventDefault();
      showDiscardConfirm(false);
      return;
    }
    if (action === "live-discard-confirm") {
      e.preventDefault();
      showDiscardConfirm(false);
      closeOverlay();
    }
  }

  document.addEventListener("click", onClick);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state?.running) requestWakeLock();
  });

  window.isMobileLiveDevice = isMobileLiveDevice;
  window.canOfferLiveSession = canOfferLiveSession;
  window.canStartLiveSession = canStartLiveSession;
  window.openLiveSession = openLiveSession;
  window.closeLiveSession = closeOverlay;
})();
