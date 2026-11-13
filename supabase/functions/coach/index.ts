import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function cursorAuth(key: string) {
  return `Basic ${btoa(`${key}:`)}`;
}

/** Small Cursor model. Override with COACH_MODEL if needed. Do not enable Fast — it costs more. */
function coachModel() {
  return { id: Deno.env.get("COACH_MODEL") || "composer-2.5" };
}

function parsePatch(text: string) {
  const fenced = String(text || "").match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : String(text || "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < 0) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

function compactActs(rows: Record<string, unknown>[]) {
  return (rows || []).slice(0, 40).map((a) => ({
    date: a.started_at,
    type: a.activity_type,
    km: a.distance,
    pace: a.avg_pace,
    hr: a.avg_hr,
    title: a.title,
  }));
}

function startedKey(value: unknown) {
  return String(value || "").replace("T", " ").slice(0, 19);
}

/** Strava rows stay out of the coach prompt unless this athlete opted in. */
async function stravaBlockedStarts(userClient: ReturnType<typeof createClient>, userId: string) {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  let share = false;
  if (url && key) {
    const admin = createClient(url, key);
    const { data: conn } = await admin
      .from("strava_connections")
      .select("share_with_coach")
      .eq("user_id", userId)
      .maybeSingle();
    share = conn?.share_with_coach === true;
  }
  if (share) return new Set<string>();
  const { data } = await userClient
    .from("activities")
    .select("started_at")
    .eq("user_id", userId)
    .eq("raw->>Source", "strava-api");
  return new Set((data || []).map((row) => startedKey(row.started_at)));
}

function omitStravaActs(rows: Record<string, unknown>[] | null, blocked: Set<string>) {
  return (rows || []).filter((row) => !blocked.has(startedKey(row.started_at)));
}

function compactWeeks(weeks: Record<string, unknown>[]) {
  return (weeks || []).map((w) => {
    const days = Array.isArray(w.days) ? w.days : [];
    const sessions = days
      .filter((d): d is unknown[] => Array.isArray(d) && d.length >= 1)
      .map((d) => ({ kind: d[0], label: d[1] ?? null }))
      .filter((d) => d.kind && d.kind !== "rest");
    const long = days.find((d) => Array.isArray(d) && d[0] === "long");
    return {
      wk: w.wk,
      phase: w.phase,
      km: w.km,
      long: w.long,
      focus: w.focus,
      note: w.note || null,
      longLabel: long ? long[1] : null,
      sessions,
    };
  });
}

const PLAN_FIELDS =
  "sport, distance_preset, event_name, event_date, start_date, run_days, weekly_km, paces, weeks, notes, swim_m, bike_km, run_km, swim_weekdays, bike_weekdays, run_weekdays, include_strength, experience";

function compactWellness(rows: Record<string, unknown>[] | null) {
  return (rows || []).slice(0, 14).map((row) => ({
    day: row.day,
    sleep: row.sleep_score ?? null,
    sleepH: row.sleep_sec != null ? Math.round(Number(row.sleep_sec) / 360) / 10 : null,
    battery: row.battery_morning ?? row.battery_latest ?? null,
    stress: row.stress_avg ?? null,
    hrv: row.hrv_night ?? null,
    hrvStatus: row.hrv_status ?? null,
    rhr: row.resting_hr ?? null,
  }));
}

function compactMetrics(row: Record<string, unknown> | null) {
  if (!row) return null;
  return {
    maxHr: row.max_hr ?? null,
    restingHr: row.resting_hr ?? null,
    lthr: row.lthr ?? null,
    vo2: row.vo2_run ?? null,
    zones: row.zones ?? null,
    load: row.load ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

function recoverySummary(rows: Record<string, unknown>[] | null) {
  const recent = (rows || []).slice(0, 7);
  if (!recent.length) return { days: 0, flag: "unknown" as const, note: "No recent wellness data." };
  const nums = (key: string) =>
    recent.map((r) => Number(r[key])).filter((n) => Number.isFinite(n) && n > 0);
  const avg = (vals: number[]) => (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null);
  const sleep = avg(nums("sleep_score"));
  const battery = avg(
    recent
      .map((r) => Number(r.battery_morning ?? r.battery_latest))
      .filter((n) => Number.isFinite(n) && n >= 0),
  );
  const stress = avg(nums("stress_avg"));
  const hrvPoor = recent.filter((r) => /unbalanced|low|poor/i.test(String(r.hrv_status || ""))).length;
  let flag: "good" | "ok" | "poor" | "unknown" = "ok";
  const poorSignals =
    (sleep != null && sleep < 60 ? 1 : 0) +
    (battery != null && battery < 45 ? 1 : 0) +
    (stress != null && stress > 55 ? 1 : 0) +
    (hrvPoor >= 3 ? 1 : 0);
  if (poorSignals >= 2) flag = "poor";
  else if ((sleep == null || sleep >= 70) && (battery == null || battery >= 60) && hrvPoor <= 1) flag = "good";
  return {
    days: recent.length,
    flag,
    avgSleep: sleep != null ? Math.round(sleep) : null,
    avgBattery: battery != null ? Math.round(battery) : null,
    avgStress: stress != null ? Math.round(stress) : null,
    hrvPoorDays: hrvPoor,
    note:
      flag === "poor"
        ? "Recent recovery looks strained (sleep / Body Battery / stress / HRV)."
        : flag === "good"
          ? "Recent recovery looks supportive of planned load."
          : "Recent recovery is mixed; judge key sessions carefully.",
  };
}

async function loadRecovery(userClient: ReturnType<typeof createClient>, userId: string) {
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - 14);
  const fromDay = from.toISOString().slice(0, 10);
  const [{ data: wellness }, { data: metrics }] = await Promise.all([
    userClient
      .from("wellness_days")
      .select("day, sleep_score, sleep_sec, battery_morning, battery_latest, stress_avg, hrv_night, hrv_week, hrv_status, resting_hr")
      .eq("user_id", userId)
      .gte("day", fromDay)
      .order("day", { ascending: false })
      .limit(21),
    userClient
      .from("training_metrics")
      .select("max_hr, resting_hr, lthr, vo2_run, zones, load, updated_at")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  return {
    wellness: wellness || [],
    metrics: metrics || null,
    summary: recoverySummary(wellness || []),
  };
}

function planHeader(plan: Record<string, unknown>, week: number) {
  const sport = String(plan.sport || "run").toLowerCase();
  const bits = [
    `Sport: ${sport}`,
    plan.distance_preset ? `Distance: ${plan.distance_preset}` : "",
    `Event: ${plan.event_name || "n/a"} on ${plan.event_date || "n/a"}`,
    `Plan start: ${plan.start_date} · current week ${week}`,
    plan.weekly_km != null ? `Typical week volume marker: ${plan.weekly_km} km` : "",
    plan.run_days != null ? `Run days/week: ${plan.run_days}` : "",
    plan.swim_m != null ? `Swim race: ${plan.swim_m} m` : "",
    plan.bike_km != null ? `Bike race: ${plan.bike_km} km` : "",
    plan.run_km != null ? `Run race: ${plan.run_km} km` : "",
    plan.include_strength ? "Strength days: included" : "",
    plan.experience ? `Experience: ${plan.experience}` : "",
  ];
  return { sport, lines: bits.filter(Boolean) };
}

function sportRules(sport: string, distancePreset: unknown) {
  const preset = String(distancePreset || "").toLowerCase();
  if (sport === "triathlon") {
    return [
      "- This is a multi-sport plan. Balance swim, bike, and run; do not treat weekly_km as run-only volume.",
      "- Protect key sessions across disciplines (brick as first-class bike→run, long bike, key swim). Do not turn the week into run-only advice.",
      "- Pace/effort guides may include swim sets (WU/main/CD), bike power or RPE when no meter, and per-leg race pacing — update only fields that fit the sport.",
      "- Stage re-evals happen at end-of-block reviews and major race-specific milestones, not marathon-pace-only logic unless the run leg warrants it.",
      "- In race week, protect the mini T2 brick / openers and prefer checklist / transition notes over adding volume.",
    ];
  }
  if (sport === "swim") {
    return [
      "- Prioritize key swim sets and technique consistency over run-style volume rules.",
      "- Do not invent run long-run logic. Raise load gradually; avoid stacking hard sets on consecutive days.",
      "- Stage re-evals happen at end-of-block reviews. Tighten pace/effort only when logged swims support it.",
    ];
  }
  if (sport === "bike") {
    return [
      "- Prioritize the long ride and key quality rides. Raise weekly load gradually; no back-to-back hard rides.",
      "- Do not invent run long-run / marathon-pace logic.",
      "- Stage re-evals happen at end-of-block reviews. Refresh effort/pace guides only when rides support it.",
    ];
  }
  const marathon = /marathon|42|mara/.test(preset) || preset === "42.2" || preset === "full";
  return [
    "- Keep the long run as the priority. Raise weekly volume by about 10% at most. No back-to-back long runs.",
    marathon
      ? "- Stage re-evals happen at marathon-pace milestones and at the end of each training block (Rebuild/Base/Build/Peak). Taper is not a pace retarget."
      : "- Stage re-evals happen at end-of-block reviews and race-pace milestones when present. Taper is not a pace retarget.",
    "- If this is a stage re-eval and logged sessions look good (weekly volume hit, easy days stay easy, key/quality work feels controlled), you MAY update paces: tighten race pace one step (max 5–8 sec/km for run) and refresh easy / steady / tempo from recent data. Never tighten during rebuild weeks 1–4. Do not add a run day unless they asked.",
    "- At end-of-block reviews, prefer refreshing the whole pace guide when activity data supports it; hold if the block was messy.",
  ];
}

function recoveryRules() {
  return [
    "Recovery / load rules:",
    "- Use wellness (sleep, Body Battery, stress, HRV) as a load signal, not a reason to abandon the A-race.",
    "- Keep the structure that makes race day reachable (key long / quality sessions and sensible progression). Prefer easing intensity and paces over deleting the volume the race still needs.",
    "- If recovery is chronically poor or logged work shows the plan is too heavy: set alert to a clear athlete-facing warning (e.g. plan may be too heavy; ease paces / drop ambition a step), optionally ease paces (easy first; race pace only if clearly unsustainable), and add weekNotes. Do not gut weekly volume so far that the race becomes unreachable.",
    "- Acute one-day recovery dips: soft-pedal via weekNotes / activityFeedback for that window. Do not rewrite the whole plan.",
    "- If recovery looks good and sessions are controlled, you may tighten cautiously per the sport rules above.",
    "- If there is not enough activity or wellness data, keep paces and say so in summary; alert stays null.",
  ];
}

function adaptationRules() {
  return [
    "Week adaptation rules (life happens):",
    "- NEVER silently rewrite week day structures. If the week needs restructuring, propose via adaptations[] so the athlete can Accept.",
    "- Missed-week rebuild: after 2+ missed key sessions (long / quality / race / key bike or swim), propose a rebuilt remaining week — no catch-up stacking; protect the long; drop or ease quality first.",
    "- Mid-week rescue: if early-week sessions were missed and days remain, propose drop vs keep. Priority keep: long/race > one quality if recovery allows > easy aerobic. Drop fillers (extra easy, optional swim/bike) first.",
    "- Niggle / injury ease: if notes mention niggle, sore, pain, calf, knee, etc., propose easing intensity (quality→easy, trim long ~10–15%) without deleting the week so race day stays reachable.",
    "- Each adaptations[] item: { mode: \"rebuild\"|\"rescue\"|\"niggle\", week: number, summary, rationale, days: 7-day array like plan days [kind,label,km?], km, note, actions: string[] }.",
    "- Only include adaptations when structure should change. Prefer one adaptation for the current week. Do not invent past days that already happened.",
  ];
}

function actDateKey(value: unknown) {
  return String(value || "").slice(0, 10);
}

function weekExecutionSnapshot(plan: Record<string, unknown>, acts: Record<string, unknown>[], weekNum: number) {
  const start = new Date(`${plan.start_date}T00:00:00`);
  const weeks = Array.isArray(plan.weeks) ? plan.weeks as Record<string, unknown>[] : [];
  const week = weeks.find((w) => Number(w.wk) === weekNum);
  if (!week) return null;
  const weekStart = new Date(start);
  weekStart.setDate(weekStart.getDate() + (weekNum - 1) * 7);
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const days = Array.isArray(week.days) ? week.days as unknown[] : [];
  const keyKinds = new Set(["long", "quality", "race", "event", "brick"]);
  return {
    week: weekNum,
    sessions: days.map((day, i) => {
      const row = Array.isArray(day) ? day : ["rest", "Rest"];
      const kind = String(row[0] || "rest");
      const label = row[1] == null ? null : String(row[1]);
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      const ds = d.toISOString().slice(0, 10);
      const logged = acts.some((a) => actDateKey(a.date || a.started_at) === ds);
      const key = keyKinds.has(kind)
        || (kind === "bike" && /long|brick|key|sweet|race-pace/i.test(label || ""))
        || (kind === "swim" && /key|css|threshold|race-pace|main/i.test(label || ""));
      return {
        i,
        date: ds,
        kind,
        label,
        key,
        past: ds < todayKey,
        remaining: ds >= todayKey,
        logged,
        missedKey: key && ds < todayKey && !logged,
      };
    }),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Sign in required" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anon = req.headers.get("apikey") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  const userClient = createClient(supabaseUrl, anon, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  const user = userData?.user;
  if (userErr || !user) return json({ error: "Sign in required" }, 401);

  let body: { action?: string; jobId?: string; stage?: string; snapshot?: Record<string, unknown> } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  if (body.action === "status") return handleStatus(userClient, user.id, body.jobId || "");
  if (body.action === "progress") return handleProgress(userClient, user.id, body.snapshot || null);
  if (body.action === "feedback") return handleFeedback(userClient, user.id, body.snapshot || null);
  if (body.action === "chat") return handleChat(userClient, user.id);
  return handleStart(userClient, user.id, body.stage || null);
});

async function loadRecentMessages(userClient: ReturnType<typeof createClient>, userId: string, limit = 20) {
  const { data, error } = await userClient
    .from("coach_messages")
    .select("id, role, content, job_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).slice().reverse();
}

async function insertAssistantMessage(
  userClient: ReturnType<typeof createClient>,
  userId: string,
  content: string,
  jobId: string | null = null,
) {
  const text = String(content || "").trim().slice(0, 8000);
  if (!text) return null;
  const { data, error } = await userClient
    .from("coach_messages")
    .insert({
      user_id: userId,
      role: "assistant",
      content: text,
      job_id: jobId,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

function assistantReplyFromPatch(patch: Record<string, unknown>) {
  const reply = typeof patch.reply === "string" ? patch.reply.trim() : "";
  const summary = typeof patch.summary === "string" ? patch.summary.trim() : "";
  const alert = typeof patch.alert === "string" ? patch.alert.trim() : "";
  const parts = [reply || summary, alert].filter(Boolean);
  return parts.join("\n\n").slice(0, 8000);
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function parseNoteDates(text: string, year: number) {
  const dates = new Set<string>();
  const iso = text.match(/\d{4}-\d{2}-\d{2}/g) || [];
  iso.forEach((d) => dates.add(d));
  const re = /(\d{1,2})(?:st|nd|rd|th)?(?:\s+of)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)/gi;
  let m;
  while ((m = re.exec(text))) {
    const month = MONTHS[m[2].toLowerCase()];
    if (!month) continue;
    const day = Number(m[1]);
    dates.add(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }
  return [...dates];
}

async function applyStructuredBusyText(
  userClient: ReturnType<typeof createClient>,
  userId: string,
  texts: { id?: string; summary: string }[],
) {
  const { data: plan } = await userClient.from("plans").select("start_date, event_date, weeks").eq("user_id", userId).maybeSingle();
  const notes = texts.filter((c) => /busy|ski|holiday|remove|rest/i.test(c.summary || ""));
  if (!plan || !notes.length) return null;

  const year = Number(String(plan.event_date || plan.start_date || "2027").slice(0, 4));
  const start = new Date(`${plan.start_date}T00:00:00`);
  const weeks = Array.isArray(plan.weeks) ? [...plan.weeks] : [];
  const appliedIds: string[] = [];
  const dates: string[] = [];

  for (const note of notes) {
    const found = parseNoteDates(note.summary || "", year);
    if (!found.length) continue;
    for (const date of found) {
      dates.push(date);
      const day = new Date(`${date}T00:00:00`);
      const wk = Math.floor((day.getTime() - start.getTime()) / 86400000 / 7) + 1;
      const dow = (day.getDay() + 6) % 7;
      const week = weeks.find((w) => Number(w.wk) === wk);
      const session = week?.days?.[dow]?.[1] || "";
      await userClient.from("busy_days").upsert({
        user_id: userId,
        date,
        reason: /ski/i.test(note.summary) ? "skiing holiday" : "busy",
        session,
      });
      if (week?.days?.[dow] && week.days[dow][0] !== "rest") {
        const dropped = typeof week.days[dow][2] === "number" ? week.days[dow][2] : 0;
        week.days[dow] = ["rest", /ski/i.test(note.summary) ? "Rest — skiing" : "Rest"];
        week.km = Math.max(0, Number(week.km || 0) - dropped);
        week.note = [week.note, `${date}: session removed (${session || "planned run"}).`].filter(Boolean).join(" ");
      }
    }
    if (note.id) appliedIds.push(note.id);
  }
  if (!dates.length) return null;

  const { error: planErr } = await userClient.from("plans").update({ weeks }).eq("user_id", userId);
  if (planErr) throw planErr;
  if (appliedIds.length) {
    const { error: chErr } = await userClient.from("changes").update({ status: "applied" }).eq("user_id", userId).in("id", appliedIds);
    if (chErr) throw chErr;
  }

  const summary = `Marked ${dates.join(", ")} busy and removed those sessions.`;
  return { summary, dates, appliedIds };
}

async function applyStructuredNotes(userClient: ReturnType<typeof createClient>, userId: string) {
  const { data: changes } = await userClient.from("changes").select("id, type, summary, status").eq("user_id", userId).eq("status", "pending");
  const notes = (changes || []).filter((c) => c.type === "note").map((c) => ({ id: c.id as string, summary: String(c.summary || "") }));
  const local = await applyStructuredBusyText(userClient, userId, notes);
  if (!local) return null;

  const { data: job, error: jobErr } = await userClient.from("coach_jobs").insert({
    user_id: userId,
    status: "applied",
    summary: local.summary,
    result: { dates: local.dates, applyChangeIds: local.appliedIds },
  }).select("id").single();
  if (jobErr) throw jobErr;
  return { jobId: job.id, status: "applied", summary: local.summary };
}

async function handleStart(userClient: ReturnType<typeof createClient>, userId: string, stage: string | null) {
  if (!stage) {
    const local = await applyStructuredNotes(userClient, userId);
    if (local) return json(local);
  }

  const cursorKey = Deno.env.get("CURSOR_API_KEY");
  if (!cursorKey) {
    return json({
      error: "CURSOR_API_KEY is not set",
      needsKey: true,
    }, 503);
  }

  const { data: open } = await userClient
    .from("coach_jobs")
    .select("id, agent_id, run_id, status, stage")
    .eq("user_id", userId)
    .in("status", ["queued", "running"])
    .or("stage.is.null,and(stage.neq.progress-report,stage.neq.week-feedback)")
    .order("created_at", { ascending: false })
    .limit(1);
  if (open?.[0]) return json({ jobId: open[0].id, status: open[0].status, existing: true });

  const [{ data: plan }, { data: changes }, { data: acts }, recovery] = await Promise.all([
    userClient.from("plans").select(PLAN_FIELDS).eq("user_id", userId).maybeSingle(),
    userClient.from("changes").select("id, type, summary, details, status, created_at").eq("user_id", userId).eq("status", "pending").order("created_at", { ascending: false }),
    userClient.from("activities").select("started_at, activity_type, distance, avg_pace, avg_hr, title").eq("user_id", userId).order("started_at", { ascending: false }).limit(200),
    loadRecovery(userClient, userId),
  ]);
  if (!plan) return json({ error: "No plan" }, 400);
  const blocked = await stravaBlockedStarts(userClient, userId);
  const visibleActs = omitStravaActs(acts, blocked);

  const start = new Date(`${plan.start_date}T00:00:00`);
  const today = new Date();
  const week = Math.floor((today.getTime() - start.getTime()) / 86400000 / 7) + 1;
  const header = planHeader(plan, week);
  const execution = weekExecutionSnapshot(plan, visibleActs as Record<string, unknown>[], week);
  const pendingForCoach = (changes || []).filter((c) => c.type !== "adapt");

  const prompt = [
    "You are the training-plan coach for this athlete. Do not write code or files.",
    "Read the snapshot and return ONE JSON object only, no extra prose.",
    "",
    `User id: ${userId}`,
    ...header.lines,
    stage ? `Stage re-eval: ${stage}` : "",
    plan.notes ? `Athlete notes: ${plan.notes}` : "",
    "",
    "Current paces / effort guide:",
    JSON.stringify(plan.paces || []),
    "",
    "Weeks:",
    JSON.stringify(compactWeeks(plan.weeks || [])),
    "",
    "Current week execution:",
    JSON.stringify(execution),
    "",
    "Pending changes (athlete notes/events/busy — not adaptations):",
    JSON.stringify(pendingForCoach),
    "",
    "Recent activities:",
    JSON.stringify(compactActs(visibleActs)),
    "",
    "Recovery summary:",
    JSON.stringify(recovery.summary),
    "Recent wellness days:",
    JSON.stringify(compactWellness(recovery.wellness)),
    "Training metrics:",
    JSON.stringify(compactMetrics(recovery.metrics)),
    "",
    "Sport rules:",
    ...sportRules(header.sport, plan.distance_preset),
    "- If things look poor (missed key sessions, niggles, easy days too hard), hold or ease intensity. Do not tighten pace.",
    ...recoveryRules(),
    ...adaptationRules(),
    "",
    "JSON shape:",
    '{"summary":"one sentence","alert":null,"hold":false,"paces":null,"weekNotes":{},"weekFeedback":{},"activityFeedback":{},"adaptations":[],"applyChangeIds":[]}',
    '- paces: array of [name, pace, use] like the current paces, or null to leave them.',
    '- weekNotes: { "11": "note" } keys are week numbers. Only weeks you change.',
    '- weekFeedback: { "11": "feedback" } for completed weeks you reviewed.',
    '- activityFeedback: { "<started_at>": "feedback" } using the activity started_at values.',
    "- adaptations: optional array of week rebuild/rescue/niggle proposals (see rules). Stored as pending for the athlete to Accept — not applied automatically.",
    "- applyChangeIds: pending change ids you accounted for (never adapt ids).",
    "- hold: true if you did not change paces or weekly km.",
    "- alert: null, or one short athlete-facing warning when the plan looks too heavy / paces should ease. Not a second summary.",
  ].filter(Boolean).join("\n");

  const created = await fetch("https://api.cursor.com/v1/agents", {
    method: "POST",
    headers: {
      Authorization: cursorAuth(cursorKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: stage ? `Plan review · ${stage}` : "Plan review",
      prompt: { text: prompt },
      model: coachModel(),
    }),
  });
  const payload = await created.json().catch(() => ({}));
  if (!created.ok) {
    return json({
      error: payload.message || payload.error || `Cursor API ${created.status}`,
    }, 502);
  }

  const agentId = payload.agent?.id || payload.id;
  const runId = payload.run?.id || payload.agent?.latestRunId || null;
  if (!agentId) return json({ error: "Cursor did not return an agent id", raw: payload }, 502);

  const { data: job, error: jobErr } = await userClient
    .from("coach_jobs")
    .insert({
      user_id: userId,
      agent_id: agentId,
      run_id: runId,
      status: "running",
      stage,
    })
    .select("id, status, agent_id")
    .single();
  if (jobErr) return json({ error: jobErr.message }, 500);

  return json({ jobId: job.id, status: job.status, agentId });
}

async function handleChat(userClient: ReturnType<typeof createClient>, userId: string) {
  let messages: { id: string; role: string; content: string; created_at?: string }[] = [];
  try {
    messages = await loadRecentMessages(userClient, userId, 20);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 500);
  }
  const latestUser = [...messages].reverse().find((m) => m.role === "user");
  if (!latestUser?.content?.trim()) {
    return json({ error: "Send a chat message first" }, 400);
  }

  try {
    const local = await applyStructuredBusyText(userClient, userId, [{ summary: latestUser.content }]);
    if (local) {
      const { data: job, error: jobErr } = await userClient.from("coach_jobs").insert({
        user_id: userId,
        status: "applied",
        stage: "chat",
        summary: local.summary,
        result: { dates: local.dates, reply: local.summary },
      }).select("id").single();
      if (jobErr) throw jobErr;
      await insertAssistantMessage(userClient, userId, local.summary, job.id);
      return json({ jobId: job.id, status: "applied", summary: local.summary, kind: "chat" });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 500);
  }

  const cursorKey = Deno.env.get("CURSOR_API_KEY");
  if (!cursorKey) {
    return json({
      error: "CURSOR_API_KEY is not set",
      needsKey: true,
    }, 503);
  }

  const { data: open } = await userClient
    .from("coach_jobs")
    .select("id, agent_id, run_id, status, stage")
    .eq("user_id", userId)
    .in("status", ["queued", "running"])
    .or("stage.is.null,and(stage.neq.progress-report,stage.neq.week-feedback)")
    .order("created_at", { ascending: false })
    .limit(1);
  if (open?.[0]) return json({ jobId: open[0].id, status: open[0].status, existing: true, kind: "chat" });

  const [{ data: plan }, { data: changes }, { data: acts }, recovery] = await Promise.all([
    userClient.from("plans").select(PLAN_FIELDS).eq("user_id", userId).maybeSingle(),
    userClient.from("changes").select("id, type, summary, details, status, created_at").eq("user_id", userId).eq("status", "pending").order("created_at", { ascending: false }),
    userClient.from("activities").select("started_at, activity_type, distance, avg_pace, avg_hr, title").eq("user_id", userId).order("started_at", { ascending: false }).limit(200),
    loadRecovery(userClient, userId),
  ]);
  if (!plan) return json({ error: "No plan" }, 400);
  const blocked = await stravaBlockedStarts(userClient, userId);
  const visibleActs = omitStravaActs(acts, blocked);

  const start = new Date(`${plan.start_date}T00:00:00`);
  const today = new Date();
  const week = Math.floor((today.getTime() - start.getTime()) / 86400000 / 7) + 1;
  const header = planHeader(plan, week);
  const execution = weekExecutionSnapshot(plan, visibleActs as Record<string, unknown>[], week);
  const pendingForCoach = (changes || []).filter((c) => c.type !== "adapt");
  const thread = messages.map((m) => ({
    role: m.role,
    content: String(m.content || "").slice(0, 2000),
  }));

  const prompt = [
    "You are the training-plan coach for this athlete in a live chat. Do not write code or files.",
    "Read the snapshot and chat thread. Reply as the coach in the JSON fields below.",
    "Answer the athlete's latest message clearly. You may also adjust the plan when warranted.",
    "",
    `User id: ${userId}`,
    ...header.lines,
    plan.notes ? `Athlete notes: ${plan.notes}` : "",
    "",
    "Current paces / effort guide:",
    JSON.stringify(plan.paces || []),
    "",
    "Weeks:",
    JSON.stringify(compactWeeks(plan.weeks || [])),
    "",
    "Current week execution:",
    JSON.stringify(execution),
    "",
    "Pending plan changes (events/busy/import — not adaptations):",
    JSON.stringify(pendingForCoach),
    "",
    "Chat thread (oldest → newest). Reply to the latest user message:",
    JSON.stringify(thread),
    "",
    "Recent activities:",
    JSON.stringify(compactActs(visibleActs)),
    "",
    "Recovery summary:",
    JSON.stringify(recovery.summary),
    "Recent wellness days:",
    JSON.stringify(compactWellness(recovery.wellness)),
    "Training metrics:",
    JSON.stringify(compactMetrics(recovery.metrics)),
    "",
    "Sport rules:",
    ...sportRules(header.sport, plan.distance_preset),
    "- If things look poor (missed key sessions, niggles, easy days too hard), hold or ease intensity. Do not tighten pace.",
    ...recoveryRules(),
    ...adaptationRules(),
    "",
    "JSON shape:",
    '{"summary":"one short sentence for toasts","reply":"2-6 sentence chat reply the athlete will read","alert":null,"hold":false,"paces":null,"weekNotes":{},"weekFeedback":{},"activityFeedback":{},"adaptations":[],"applyChangeIds":[]}',
    "- reply: the main chat answer. Be concrete and athlete-facing. Prefer reply over dumping everything into summary.",
    '- paces: array of [name, pace, use] like the current paces, or null to leave them.',
    '- weekNotes: { "11": "note" } keys are week numbers. Only weeks you change.',
    '- weekFeedback: { "11": "feedback" } for completed weeks you reviewed.',
    '- activityFeedback: { "<started_at>": "feedback" } using the activity started_at values.',
    "- adaptations: optional array of week rebuild/rescue/niggle proposals (see rules). Stored as pending for the athlete to Accept — not applied automatically.",
    "- applyChangeIds: pending change ids you accounted for (never adapt ids).",
    "- hold: true if you did not change paces or weekly km.",
    "- alert: null, or one short athlete-facing warning when the plan looks too heavy / paces should ease. Not a second summary.",
  ].filter(Boolean).join("\n");

  const created = await fetch("https://api.cursor.com/v1/agents", {
    method: "POST",
    headers: {
      Authorization: cursorAuth(cursorKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Coach chat",
      prompt: { text: prompt },
      model: coachModel(),
    }),
  });
  const payload = await created.json().catch(() => ({}));
  if (!created.ok) {
    return json({
      error: payload.message || payload.error || `Cursor API ${created.status}`,
    }, 502);
  }

  const agentId = payload.agent?.id || payload.id;
  const runId = payload.run?.id || payload.agent?.latestRunId || null;
  if (!agentId) return json({ error: "Cursor did not return an agent id", raw: payload }, 502);

  const { data: job, error: jobErr } = await userClient
    .from("coach_jobs")
    .insert({
      user_id: userId,
      agent_id: agentId,
      run_id: runId,
      status: "running",
      stage: "chat",
    })
    .select("id, status, agent_id")
    .single();
  if (jobErr) return json({ error: jobErr.message }, 500);

  return json({ jobId: job.id, status: job.status, agentId, kind: "chat" });
}

async function handleProgress(userClient: ReturnType<typeof createClient>, userId: string, snapshot: Record<string, unknown> | null) {
  const fingerprint = snapshot && typeof snapshot.fingerprint === "string" ? snapshot.fingerprint : "";

  const { data: open } = await userClient
    .from("coach_jobs")
    .select("id, agent_id, run_id, status, stage")
    .eq("user_id", userId)
    .eq("stage", "progress-report")
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (open?.[0]) return json({ jobId: open[0].id, status: open[0].status, existing: true, kind: "progress" });

  if (fingerprint) {
    const { data: last } = await userClient
      .from("coach_jobs")
      .select("id, summary, result")
      .eq("user_id", userId)
      .eq("stage", "progress-report")
      .eq("status", "applied")
      .order("updated_at", { ascending: false })
      .limit(1);
    const prev = last?.[0];
    const prevResult = prev?.result && typeof prev.result === "object" ? prev.result as { fingerprint?: string; report?: string; week?: number } : null;
    if (prev && prevResult?.fingerprint && prevResult.fingerprint === fingerprint) {
      return json({
        jobId: prev.id,
        status: "applied",
        summary: prev.summary,
        report: String(prevResult.report || prev.summary || "").trim(),
        week: prevResult.week ?? null,
        fingerprint,
        unchanged: true,
        kind: "progress",
      });
    }
  }

  const cursorKey = Deno.env.get("CURSOR_API_KEY");
  if (!cursorKey) {
    return json({
      error: "CURSOR_API_KEY is not set",
      needsKey: true,
    }, 503);
  }

  const [{ data: plan }, { data: acts }, recovery] = await Promise.all([
    userClient.from("plans").select(PLAN_FIELDS).eq("user_id", userId).maybeSingle(),
    userClient.from("activities").select("started_at, activity_type, distance, avg_pace, avg_hr, title").eq("user_id", userId).order("started_at", { ascending: false }).limit(200),
    loadRecovery(userClient, userId),
  ]);
  if (!plan) return json({ error: "No plan" }, 400);
  const blocked = await stravaBlockedStarts(userClient, userId);
  const visibleActs = omitStravaActs(acts, blocked);
  const start = new Date(`${plan.start_date}T00:00:00`);
  const weekNow = Math.floor((Date.now() - start.getTime()) / 86400000 / 7) + 1;
  const header = planHeader(plan, weekNow);

  const prompt = [
    "You are the training-plan coach for this athlete. Do not write code or files. Do not change the plan.",
    "Write a progress report from the snapshot. Return ONE JSON object only, no extra prose.",
    "",
    ...header.lines,
    plan.notes ? `Athlete notes: ${plan.notes}` : "",
    "",
    "Client snapshot:",
    JSON.stringify(snapshot || {}),
    "",
    "Recent activities:",
    JSON.stringify(compactActs(visibleActs)),
    "",
    "Weeks:",
    JSON.stringify(compactWeeks(plan.weeks || [])),
    "",
    "Recovery summary:",
    JSON.stringify(recovery.summary),
    "Recent wellness days:",
    JSON.stringify(compactWellness(recovery.wellness)),
    "Training metrics:",
    JSON.stringify(compactMetrics(recovery.metrics)),
    "",
    "Write a SHORT progress report: at most 2 short paragraphs, roughly 80–120 words total. Cover only: (1) whether the block/key sessions are on track, (2) current vs projected race time if present, (3) one focus for the next 1–2 weeks. Skip fluff and repetition.",
    "If recovery suggests the plan is getting too heavy, say so in one clear sentence and recommend easing paces / ambition while keeping race day reachable — do not propose abandoning the race.",
    "Tone: direct, specific, encouraging. No headings, no bullets, no markdown.",
    "",
    "JSON shape:",
    '{"summary":"one sentence","alert":null,"report":"1–2 short paragraphs separated by a blank line","week":null}',
    "- week: current week number from the snapshot, or null.",
    "- alert: null, or one short athlete-facing warning when load looks too heavy.",
  ].filter(Boolean).join("\n");

  const created = await fetch("https://api.cursor.com/v1/agents", {
    method: "POST",
    headers: {
      Authorization: cursorAuth(cursorKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Progress report",
      prompt: { text: prompt },
      model: coachModel(),
    }),
  });
  const payload = await created.json().catch(() => ({}));
  if (!created.ok) {
    return json({
      error: payload.message || payload.error || `Cursor API ${created.status}`,
    }, 502);
  }

  const agentId = payload.agent?.id || payload.id;
  const runId = payload.run?.id || payload.agent?.latestRunId || null;
  if (!agentId) return json({ error: "Cursor did not return an agent id", raw: payload }, 502);

  const { data: job, error: jobErr } = await userClient
    .from("coach_jobs")
    .insert({
      user_id: userId,
      agent_id: agentId,
      run_id: runId,
      status: "running",
      stage: "progress-report",
      result: fingerprint ? { fingerprint } : null,
    })
    .select("id, status, agent_id")
    .single();
  if (jobErr) return json({ error: jobErr.message }, 500);

  return json({ jobId: job.id, status: job.status, agentId, kind: "progress" });
}

function formatStarted(value: unknown) {
  return String(value || "").replace("T", " ").slice(0, 19);
}

function feedbackSessions(snapshot: Record<string, unknown> | null) {
  const rows = Array.isArray(snapshot?.sessions) ? snapshot.sessions : [];
  return rows
    .map((row) => {
      const item = row && typeof row === "object" ? row as Record<string, unknown> : null;
      const started = formatStarted(item?.started_at);
      if (!item || !started) return null;
      return {
        started_at: started,
        type: String(item.type || item.cat || ""),
        distance: item.distance ?? null,
        pace: item.pace == null ? null : String(item.pace),
        hr: item.hr == null ? null : String(item.hr),
        title: String(item.title || ""),
        date: item.date ? String(item.date) : started.slice(0, 10),
      };
    })
    .filter((row): row is NonNullable<typeof row> => !!row);
}

async function handleFeedback(userClient: ReturnType<typeof createClient>, userId: string, snapshot: Record<string, unknown> | null) {
  const week = Number(snapshot?.week);
  const fingerprint = snapshot && typeof snapshot.fingerprint === "string" ? snapshot.fingerprint : "";
  const blocked = await stravaBlockedStarts(userClient, userId);
  const sessions = feedbackSessions(snapshot).filter((row) => !blocked.has(row.started_at));
  if (!Number.isInteger(week) || week < 1 || !sessions.length || !fingerprint) {
    return json({ error: "Nothing to review this week" }, 400);
  }

  const { data: open } = await userClient
    .from("coach_jobs")
    .select("id, agent_id, run_id, status, stage")
    .eq("user_id", userId)
    .eq("stage", "week-feedback")
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (open?.[0]) return json({ jobId: open[0].id, status: open[0].status, existing: true, kind: "feedback" });

  const { data: recent } = await userClient
    .from("coach_jobs")
    .select("id, summary, result")
    .eq("user_id", userId)
    .eq("stage", "week-feedback")
    .eq("status", "applied")
    .order("updated_at", { ascending: false })
    .limit(8);
  const prev = (recent || []).find((row) => {
    const result = row.result && typeof row.result === "object" ? row.result as { week?: number; fingerprint?: string } : null;
    return result?.week === week && result.fingerprint === fingerprint;
  });
  if (prev) {
    return json({
      jobId: prev.id,
      status: "applied",
      summary: prev.summary || "Week feedback is already up to date.",
      week,
      fingerprint,
      unchanged: true,
      kind: "feedback",
    });
  }

  const cursorKey = Deno.env.get("CURSOR_API_KEY");
  if (!cursorKey) {
    return json({ error: "CURSOR_API_KEY is not set", needsKey: true }, 503);
  }

  const [{ data: plan }, recovery] = await Promise.all([
    userClient.from("plans").select(PLAN_FIELDS).eq("user_id", userId).maybeSingle(),
    loadRecovery(userClient, userId),
  ]);
  if (!plan) return json({ error: "No plan" }, 400);
  const header = planHeader(plan, week);

  const prompt = [
    "You are the training-plan coach for this athlete. Do not write code or files. Do not change the plan, paces, or weekly volume.",
    "Comment on this one training week. Return ONE JSON object only, no extra prose.",
    "",
    ...header.lines,
    plan.notes ? `Athlete notes: ${plan.notes}` : "",
    "",
    "Paces / effort guide:",
    JSON.stringify(plan.paces || []),
    "",
    "Week snapshot:",
    JSON.stringify({
      week,
      phase: snapshot?.phase || null,
      focus: snapshot?.focus || null,
      km: snapshot?.km ?? null,
      from: snapshot?.from || null,
      to: snapshot?.to || null,
      auto: snapshot?.auto || null,
      sessions,
    }),
    "",
    "Recovery summary:",
    JSON.stringify(recovery.summary),
    "Recent wellness days:",
    JSON.stringify(compactWellness(recovery.wellness)),
    "",
    "Write a short week note (2–4 sentences) about how the week went for this sport: volume across disciplines if triathlon, the long or key session(s), easy-day effort, and whether recovery matched the load.",
    "If recovery or execution suggests the week was too heavy, say that paces may need to ease while keeping the race reachable.",
    "Add a one-sentence note only for sessions that need a comment. Skip walks and ordinary easy sessions that went as planned.",
    "Tone: direct and specific. No headings, no bullets, no markdown.",
    "",
    "JSON shape:",
    `{"summary":"one sentence","alert":null,"weekFeedback":{"${week}":"week note"},"activityFeedback":{}}`,
    "- weekFeedback: exactly one key, the week number above.",
    "- activityFeedback: keys must be copied exactly from started_at. Omit sessions with nothing to add.",
    "- alert: null, or one short athlete-facing warning when load looks too heavy.",
  ].filter(Boolean).join("\n");

  const created = await fetch("https://api.cursor.com/v1/agents", {
    method: "POST",
    headers: {
      Authorization: cursorAuth(cursorKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: `Week ${week} feedback`,
      prompt: { text: prompt },
      model: coachModel(),
    }),
  });
  const payload = await created.json().catch(() => ({}));
  if (!created.ok) {
    return json({
      error: payload.message || payload.error || `Cursor API ${created.status}`,
    }, 502);
  }

  const agentId = payload.agent?.id || payload.id;
  const runId = payload.run?.id || payload.agent?.latestRunId || null;
  if (!agentId) return json({ error: "Cursor did not return an agent id", raw: payload }, 502);

  const { data: job, error: jobErr } = await userClient
    .from("coach_jobs")
    .insert({
      user_id: userId,
      agent_id: agentId,
      run_id: runId,
      status: "running",
      stage: "week-feedback",
      result: { fingerprint, week, sessions: sessions.map((row) => row.started_at) },
    })
    .select("id, status, agent_id")
    .single();
  if (jobErr) return json({ error: jobErr.message }, 500);

  return json({ jobId: job.id, status: job.status, agentId, kind: "feedback", week, fingerprint });
}

async function handleStatus(userClient: ReturnType<typeof createClient>, userId: string, jobId: string) {
  if (!jobId) return json({ error: "jobId required" }, 400);
  const { data: job, error } = await userClient
    .from("coach_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !job) return json({ error: "Job not found" }, 404);
  if (job.status === "applied" || job.status === "error") {
    const result = job.result && typeof job.result === "object"
      ? job.result as { report?: string; reply?: string; week?: number; fingerprint?: string; alert?: string | null }
      : null;
    const kind = job.stage === "progress-report"
      ? "progress"
      : job.stage === "week-feedback"
        ? "feedback"
        : job.stage === "chat"
          ? "chat"
          : undefined;
    return json({
      jobId: job.id,
      status: job.status,
      summary: job.summary,
      error: job.error,
      report: result?.report || job.summary || "",
      reply: typeof result?.reply === "string" ? result.reply : "",
      week: result?.week ?? null,
      fingerprint: result?.fingerprint,
      alert: typeof result?.alert === "string" && result.alert.trim() ? result.alert.trim() : null,
      kind,
    });
  }

  const cursorKey = Deno.env.get("CURSOR_API_KEY");
  if (!cursorKey) return json({ error: "CURSOR_API_KEY is not set", needsKey: true }, 503);

  let runId = job.run_id;
  if (!runId && job.agent_id) {
    const agentRes = await fetch(`https://api.cursor.com/v1/agents/${job.agent_id}`, {
      headers: { Authorization: cursorAuth(cursorKey) },
    });
    const agent = await agentRes.json().catch(() => ({}));
    runId = agent.latestRunId || null;
    if (runId) await userClient.from("coach_jobs").update({ run_id: runId, updated_at: new Date().toISOString() }).eq("id", job.id);
  }
  if (!job.agent_id || !runId) return json({ jobId: job.id, status: "running" });

  const runRes = await fetch(`https://api.cursor.com/v1/agents/${job.agent_id}/runs/${runId}`, {
    headers: { Authorization: cursorAuth(cursorKey) },
  });
  const run = await runRes.json().catch(() => ({}));
  const runStatus = String(run.status || "").toUpperCase();
  if (!runRes.ok) return json({ jobId: job.id, status: "running" });
  if (["CREATING", "RUNNING", "PENDING"].includes(runStatus)) {
    return json({ jobId: job.id, status: "running" });
  }
  if (["ERROR", "CANCELLED", "EXPIRED"].includes(runStatus)) {
    await userClient.from("coach_jobs").update({
      status: "error",
      error: run.result || runStatus,
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);
    return json({ jobId: job.id, status: "error", error: run.result || runStatus });
  }

  const patch = parsePatch(run.result || "");
  if (!patch) {
    await userClient.from("coach_jobs").update({
      status: "error",
      error: "Could not parse coach JSON",
      result: { raw: run.result || "" },
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);
    return json({ jobId: job.id, status: "error", error: "Could not parse coach JSON" });
  }

  if (job.stage === "progress-report") {
    const report = String(patch.report || patch.summary || "").trim();
    const alert = typeof patch.alert === "string" && patch.alert.trim() ? patch.alert.trim() : null;
    const prev = job.result && typeof job.result === "object" ? job.result as Record<string, unknown> : {};
    const result = { ...prev, ...patch, report, alert };
    await userClient.from("coach_jobs").update({
      status: "applied",
      summary: patch.summary || "Progress report",
      result,
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);
    return json({
      jobId: job.id,
      status: "applied",
      summary: patch.summary || "Progress report",
      report,
      alert,
      week: patch.week ?? null,
      fingerprint: result.fingerprint || null,
      kind: "progress",
    });
  }

  if (job.stage === "week-feedback") {
    const prev = job.result && typeof job.result === "object" ? job.result as { week?: number; fingerprint?: string; sessions?: string[] } : {};
    const week = Number(prev.week);
    const sessions = Array.isArray(prev.sessions) ? prev.sessions.map((s) => formatStarted(s)).filter(Boolean) : [];
    try {
      await saveFeedback(userClient, userId, patch, { week, sessions });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await userClient.from("coach_jobs").update({
        status: "error",
        error: message,
        result: { ...prev, raw: patch },
        updated_at: new Date().toISOString(),
      }).eq("id", job.id);
      return json({ jobId: job.id, status: "error", error: message, kind: "feedback" });
    }
    const summary = String(patch.summary || "Week feedback updated").trim();
    const alert = typeof patch.alert === "string" && patch.alert.trim() ? patch.alert.trim() : null;
    await userClient.from("coach_jobs").update({
      status: "applied",
      summary,
      result: { fingerprint: prev.fingerprint, week, sessions, alert },
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);
    return json({
      jobId: job.id,
      status: "applied",
      summary,
      alert,
      week,
      fingerprint: prev.fingerprint || null,
      kind: "feedback",
    });
  }

  try {
    await applyPatch(userClient, userId, patch);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await userClient.from("coach_jobs").update({
      status: "error",
      error: message,
      result: patch,
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);
    return json({ jobId: job.id, status: "error", error: message });
  }

  const alert = typeof patch.alert === "string" && patch.alert.trim() ? patch.alert.trim() : null;
  const reply = assistantReplyFromPatch(patch);
  const summary = String(patch.summary || (job.stage === "chat" ? "Coach replied" : "Plan reviewed")).trim();
  const result = { ...patch, alert, reply };
  await userClient.from("coach_jobs").update({
    status: "applied",
    summary,
    result,
    updated_at: new Date().toISOString(),
  }).eq("id", job.id);

  if (job.stage === "chat" && reply) {
    try {
      await insertAssistantMessage(userClient, userId, reply, job.id);
    } catch {
      // Plan patch already applied; chat UI can still show summary via job result.
    }
  }

  return json({
    jobId: job.id,
    status: "applied",
    summary,
    reply,
    alert,
    kind: job.stage === "chat" ? "chat" : undefined,
  });
}

async function saveFeedback(
  userClient: ReturnType<typeof createClient>,
  userId: string,
  patch: Record<string, unknown>,
  limits?: { week?: number; sessions?: string[] },
) {
  const weekOnly = limits?.week;
  const allowed = limits?.sessions ? new Map(limits.sessions.map((s) => [formatStarted(s), formatStarted(s)])) : null;

  if (patch.weekFeedback && typeof patch.weekFeedback === "object") {
    const rows = Object.entries(patch.weekFeedback as Record<string, unknown>)
      .filter(([week]) => weekOnly == null || Number(week) === weekOnly)
      .map(([week, text]) => ({ user_id: userId, week: Number(week), text: String(text || "").trim() }))
      .filter((row) => Number.isInteger(row.week) && row.week > 0 && row.text);
    if (rows.length) {
      const { error } = await userClient.from("week_feedback").upsert(rows, { onConflict: "user_id,week" });
      if (error) throw error;
    }
  }

  if (weekOnly != null) {
    const wrote = patch.weekFeedback && typeof patch.weekFeedback === "object"
      ? String((patch.weekFeedback as Record<string, unknown>)[String(weekOnly)] || "").trim()
      : "";
    if (!wrote) throw new Error("Coach did not return week feedback");
  }

  if (patch.activityFeedback && typeof patch.activityFeedback === "object") {
    const rows = Object.entries(patch.activityFeedback as Record<string, unknown>)
      .map(([started, text]) => {
        const key = formatStarted(started);
        const started_at = allowed ? allowed.get(key) : key;
        if (!started_at) return null;
        const note = String(text || "").trim();
        if (!note) return null;
        return { user_id: userId, started_at, text: note };
      })
      .filter((row): row is { user_id: string; started_at: string; text: string } => !!row);
    if (rows.length) {
      const { error } = await userClient.from("activity_feedback").upsert(rows, { onConflict: "user_id,started_at" });
      if (error) throw error;
    }
  }
}

function normalizeAdaptationDays(days: unknown) {
  if (!Array.isArray(days) || days.length !== 7) return null;
  return days.map((day) => {
    if (!Array.isArray(day) || !day.length) return ["rest", "Rest"];
    const kind = String(day[0] || "rest");
    const label = day[1] == null ? (kind === "rest" ? "Rest" : kind) : String(day[1]);
    const km = typeof day[2] === "number" && Number.isFinite(day[2]) ? day[2] : undefined;
    return km == null ? [kind, label] : [kind, label, km];
  });
}

async function queueCoachAdaptations(
  userClient: ReturnType<typeof createClient>,
  userId: string,
  patch: Record<string, unknown>,
) {
  const rows = Array.isArray(patch.adaptations) ? patch.adaptations : [];
  if (!rows.length) return 0;
  const { data: existing } = await userClient
    .from("changes")
    .select("id, details, status")
    .eq("user_id", userId)
    .eq("type", "adapt");
  const known = new Set(
    (existing || [])
      .map((row) => {
        const details = row.details && typeof row.details === "object" ? row.details as Record<string, unknown> : {};
        return String(details.fingerprint || "");
      })
      .filter(Boolean),
  );

  let inserted = 0;
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const mode = String(item.mode || "adapt");
    if (!["rebuild", "rescue", "niggle", "adapt"].includes(mode)) continue;
    const week = Number(item.week);
    const days = normalizeAdaptationDays(item.days);
    if (!Number.isInteger(week) || week < 1 || !days) continue;
    const fingerprint = String(item.fingerprint || `adapt:${mode}:w${week}:coach`);
    if (known.has(fingerprint)) continue;
    const summary = String(item.summary || `Week ${week} ${mode} proposal`).slice(0, 500);
    const details = {
      mode,
      week,
      rationale: String(item.rationale || "").slice(0, 2000),
      days,
      km: typeof item.km === "number" ? item.km : null,
      note: String(item.note || "").slice(0, 1000),
      actions: Array.isArray(item.actions) ? item.actions.map((a) => String(a)).slice(0, 12) : [],
      fingerprint,
      source: "coach",
    };
    const id = crypto.randomUUID();
    const { error } = await userClient.from("changes").insert({
      user_id: userId,
      id,
      type: "adapt",
      summary,
      details,
      status: "pending",
    });
    if (error) continue;
    known.add(fingerprint);
    inserted += 1;
  }
  return inserted;
}

async function applyPatch(userClient: ReturnType<typeof createClient>, userId: string, patch: Record<string, unknown>) {
  const { data: plan, error: planErr } = await userClient.from("plans").select("weeks, paces").eq("user_id", userId).maybeSingle();
  if (planErr) throw planErr;
  if (!plan) throw new Error("No plan");

  const updates: Record<string, unknown> = {};
  if (Array.isArray(patch.paces) && patch.paces.length) updates.paces = patch.paces;
  if (patch.weekNotes && typeof patch.weekNotes === "object") {
    const weeks = Array.isArray(plan.weeks) ? [...plan.weeks] : [];
    for (const [wk, note] of Object.entries(patch.weekNotes as Record<string, string>)) {
      const i = weeks.findIndex((w) => Number(w.wk) === Number(wk));
      if (i >= 0) weeks[i] = { ...weeks[i], note };
    }
    updates.weeks = weeks;
  }
  if (Object.keys(updates).length) {
    const { error } = await userClient.from("plans").update(updates).eq("user_id", userId);
    if (error) throw error;
  }

  await saveFeedback(userClient, userId, patch);
  await queueCoachAdaptations(userClient, userId, patch);

  const ids = Array.isArray(patch.applyChangeIds)
    ? patch.applyChangeIds.filter((id) => typeof id === "string")
    : [];
  if (ids.length) {
    // Never auto-apply adaptation proposals via applyChangeIds.
    const { data: rows } = await userClient
      .from("changes")
      .select("id, type")
      .eq("user_id", userId)
      .in("id", ids);
    const safeIds = (rows || []).filter((r) => r.type !== "adapt").map((r) => r.id);
    if (safeIds.length) {
      const { error } = await userClient.from("changes").update({ status: "applied" }).eq("user_id", userId).in("id", safeIds);
      if (error) throw error;
    }
  }
}
