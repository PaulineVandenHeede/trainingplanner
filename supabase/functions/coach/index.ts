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

function compactWeeks(weeks: Record<string, unknown>[]) {
  return (weeks || []).map((w) => {
    const days = Array.isArray(w.days) ? w.days : [];
    const long = days.find((d) => Array.isArray(d) && d[0] === "long");
    return {
      wk: w.wk,
      phase: w.phase,
      km: w.km,
      long: w.long,
      focus: w.focus,
      note: w.note || null,
      longLabel: long ? long[1] : null,
    };
  });
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
  return handleStart(userClient, user.id, body.stage || null);
});

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

async function applyStructuredNotes(userClient: ReturnType<typeof createClient>, userId: string) {
  const { data: plan } = await userClient.from("plans").select("start_date, event_date, weeks").eq("user_id", userId).maybeSingle();
  const { data: changes } = await userClient.from("changes").select("id, type, summary, status").eq("user_id", userId).eq("status", "pending");
  const notes = (changes || []).filter((c) => c.type === "note" && /busy|ski|holiday|remove|rest/i.test(c.summary || ""));
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
    appliedIds.push(note.id);
  }
  if (!appliedIds.length) return null;

  const { error: planErr } = await userClient.from("plans").update({ weeks }).eq("user_id", userId);
  if (planErr) throw planErr;
  const { error: chErr } = await userClient.from("changes").update({ status: "applied" }).eq("user_id", userId).in("id", appliedIds);
  if (chErr) throw chErr;

  const summary = `Marked ${dates.join(", ")} busy and removed those sessions.`;
  const { data: job, error: jobErr } = await userClient.from("coach_jobs").insert({
    user_id: userId,
    status: "applied",
    summary,
    result: { dates, applyChangeIds: appliedIds },
  }).select("id").single();
  if (jobErr) throw jobErr;
  return { jobId: job.id, status: "applied", summary };
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

  const [{ data: plan }, { data: changes }, { data: acts }] = await Promise.all([
    userClient.from("plans").select("event_name, event_date, start_date, run_days, weekly_km, paces, weeks, notes").eq("user_id", userId).maybeSingle(),
    userClient.from("changes").select("id, type, summary, details, status, created_at").eq("user_id", userId).eq("status", "pending").order("created_at", { ascending: false }),
    userClient.from("activities").select("started_at, activity_type, distance, avg_pace, avg_hr, title").eq("user_id", userId).order("started_at", { ascending: false }).limit(40),
  ]);
  if (!plan) return json({ error: "No plan" }, 400);

  const start = new Date(`${plan.start_date}T00:00:00`);
  const today = new Date();
  const week = Math.floor((today.getTime() - start.getTime()) / 86400000 / 7) + 1;

  const prompt = [
    "You are the training-plan coach for this athlete. Do not write code or files.",
    "Read the snapshot and return ONE JSON object only, no extra prose.",
    "",
    `User id: ${userId}`,
    `Event: ${plan.event_name} on ${plan.event_date}`,
    `Run days: ${plan.run_days} · start ${plan.start_date} · current week ${week}`,
    stage ? `Stage re-eval: ${stage}` : "",
    "",
    "Current paces:",
    JSON.stringify(plan.paces || []),
    "",
    "Weeks:",
    JSON.stringify(compactWeeks(plan.weeks || [])),
    "",
    "Pending changes:",
    JSON.stringify(changes || []),
    "",
    "Recent activities:",
    JSON.stringify(compactActs(acts || [])),
    "",
    "Rules:",
    "- Keep the long run as the priority. Raise weekly volume by about 10% at most. No back-to-back long runs.",
    "- If this is a stage re-eval and logged runs look good (weekly km hit, easy days stay easy, MP on 20 km+ longs feels controlled), you MAY tighten marathon pace one step (max 5–8 sec/km). Never during rebuild weeks 1–4. Do not add a run day unless they asked.",
    "- If things look poor (missed longs, niggles, easy days too hard), hold or ease volume. Do not tighten pace.",
    "- If there is not enough activity data, keep paces and say so in summary.",
    "",
    "JSON shape:",
    '{"summary":"one sentence","hold":false,"paces":null,"weekNotes":{},"weekFeedback":{},"activityFeedback":{},"applyChangeIds":[]}',
    '- paces: array of [name, pace, use] like the current paces, or null to leave them.',
    '- weekNotes: { "11": "note" } keys are week numbers. Only weeks you change.',
    '- weekFeedback: { "11": "feedback" } for completed weeks you reviewed.',
    '- activityFeedback: { "<started_at>": "feedback" } using the activity started_at values.',
    "- applyChangeIds: pending change ids you accounted for.",
    "- hold: true if you did not change paces or weekly km.",
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

  const [{ data: plan }, { data: acts }] = await Promise.all([
    userClient.from("plans").select("event_name, event_date, start_date, weekly_km, notes, weeks").eq("user_id", userId).maybeSingle(),
    userClient.from("activities").select("started_at, activity_type, distance, avg_pace, avg_hr, title").eq("user_id", userId).order("started_at", { ascending: false }).limit(40),
  ]);
  if (!plan) return json({ error: "No plan" }, 400);

  const prompt = [
    "You are the training-plan coach for this athlete. Do not write code or files. Do not change the plan.",
    "Write a progress report from the snapshot. Return ONE JSON object only, no extra prose.",
    "",
    `Event: ${plan.event_name} on ${plan.event_date}`,
    `Plan start: ${plan.start_date} · typical week ${plan.weekly_km} km`,
    plan.notes ? `Athlete notes: ${plan.notes}` : "",
    "",
    "Client snapshot:",
    JSON.stringify(snapshot || {}),
    "",
    "Recent activities:",
    JSON.stringify(compactActs(acts || [])),
    "",
    "Weeks:",
    JSON.stringify(compactWeeks(plan.weeks || [])),
    "",
    "Write 2–4 short paragraphs: how the block is going, whether volume and key sessions are on track, current vs projected race time if present, and what matters in the next 1–2 weeks.",
    "Tone: direct, specific, encouraging. No headings, no bullets, no markdown.",
    "",
    "JSON shape:",
    '{"summary":"one sentence","report":"paragraphs separated by blank lines","week":null}',
    "- week: current week number from the snapshot, or null.",
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
  const sessions = feedbackSessions(snapshot);
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

  const { data: plan } = await userClient
    .from("plans")
    .select("event_name, event_date, start_date, paces, notes")
    .eq("user_id", userId)
    .maybeSingle();
  if (!plan) return json({ error: "No plan" }, 400);

  const prompt = [
    "You are the training-plan coach for this athlete. Do not write code or files. Do not change the plan, paces, or weekly volume.",
    "Comment on this one training week. Return ONE JSON object only, no extra prose.",
    "",
    `Event: ${plan.event_name} on ${plan.event_date}`,
    `Plan start: ${plan.start_date}`,
    plan.notes ? `Athlete notes: ${plan.notes}` : "",
    "",
    "Paces:",
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
    "Write a short week note (2–4 sentences) about how the week went: volume, the long or key session, and easy-day effort.",
    "Add a one-sentence note only for sessions that need a comment. Skip walks and ordinary easy sessions that went as planned.",
    "Tone: direct and specific. No headings, no bullets, no markdown.",
    "",
    "JSON shape:",
    `{"summary":"one sentence","weekFeedback":{"${week}":"week note"},"activityFeedback":{}}`,
    "- weekFeedback: exactly one key, the week number above.",
    "- activityFeedback: keys must be copied exactly from started_at. Omit sessions with nothing to add.",
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
    const result = job.result && typeof job.result === "object" ? job.result as { report?: string; week?: number; fingerprint?: string } : null;
    const kind = job.stage === "progress-report" ? "progress" : job.stage === "week-feedback" ? "feedback" : undefined;
    return json({
      jobId: job.id,
      status: job.status,
      summary: job.summary,
      error: job.error,
      report: result?.report || job.summary || "",
      week: result?.week ?? null,
      fingerprint: result?.fingerprint,
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
    const prev = job.result && typeof job.result === "object" ? job.result as Record<string, unknown> : {};
    const result = { ...prev, ...patch, report };
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
    await userClient.from("coach_jobs").update({
      status: "applied",
      summary,
      result: { fingerprint: prev.fingerprint, week, sessions },
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);
    return json({
      jobId: job.id,
      status: "applied",
      summary,
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

  await userClient.from("coach_jobs").update({
    status: "applied",
    summary: patch.summary || "Plan reviewed",
    result: patch,
    updated_at: new Date().toISOString(),
  }).eq("id", job.id);

  return json({ jobId: job.id, status: "applied", summary: patch.summary || "Plan reviewed" });
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

  const ids = Array.isArray(patch.applyChangeIds) ? patch.applyChangeIds.filter((id) => typeof id === "string") : [];
  if (ids.length) {
    const { error } = await userClient.from("changes").update({ status: "applied" }).eq("user_id", userId).in("id", ids);
    if (error) throw error;
  }
}
