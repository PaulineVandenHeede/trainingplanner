import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Strava push subscription endpoint (no JWT — Strava calls this directly).
 *
 * After deploy, create the subscription once:
 *   curl -X POST https://www.strava.com/api/v3/push_subscriptions \
 *     -F client_id=$STRAVA_CLIENT_ID \
 *     -F client_secret=$STRAVA_CLIENT_SECRET \
 *     -F callback_url=https://YOUR_PROJECT.supabase.co/functions/v1/strava-webhook \
 *     -F verify_token=$STRAVA_WEBHOOK_VERIFY_TOKEN
 */

const STRAVA_API = "https://www.strava.com/api/v3";
const STRAVA_TOKEN = "https://www.strava.com/oauth/token";

type Sb = ReturnType<typeof createClient>;

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expected = Deno.env.get("STRAVA_WEBHOOK_VERIFY_TOKEN") || "temp-strava-webhook-verify";
    if (mode === "subscribe" && expected && token === expected && challenge) {
      return new Response(JSON.stringify({ "hub.challenge": challenge }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  // Acknowledge quickly; process async best-effort in the same isolate.
  let event: Record<string, unknown> = {};
  try {
    event = await req.json();
  } catch {
    return new Response("ok", { status: 200 });
  }

  try {
    await handleEvent(event);
  } catch (err) {
    console.error("strava-webhook", err instanceof Error ? err.message : err);
  }
  return new Response("ok", { status: 200 });
});

async function handleEvent(event: Record<string, unknown>) {
  const objectType = String(event.object_type || "");
  const aspect = String(event.aspect_type || "");
  const objectId = Number(event.object_id);
  const ownerId = Number(event.owner_id);

  if (objectType === "athlete" && aspect === "update") {
    const updates = (event.updates || {}) as Record<string, unknown>;
    if (updates.authorized === "false" || updates.authorized === false) {
      const admin = adminClient();
      if (Number.isFinite(ownerId)) {
        const { data: conn } = await admin
          .from("strava_connections")
          .select("user_id")
          .eq("athlete_id", ownerId)
          .maybeSingle();
        if (conn?.user_id) await deleteStravaActivities(admin, conn.user_id);
        await admin.from("strava_connections").delete().eq("athlete_id", ownerId);
      }
    }
    return;
  }

  if (objectType !== "activity" || !Number.isFinite(objectId) || !Number.isFinite(ownerId)) return;

  const admin = adminClient();
  const { data: conn } = await admin
    .from("strava_connections")
    .select("user_id,access_token,refresh_token,expires_at")
    .eq("athlete_id", ownerId)
    .maybeSingle();
  if (!conn) return;

  if (aspect === "delete") {
    await deleteByStravaId(admin, conn.user_id, objectId);
    return;
  }

  if (aspect !== "create" && aspect !== "update") return;

  const access = await ensureAccessToken(admin, conn);
  const detail = await getActivity(access, objectId);
  const row = mapStravaToRow(conn.user_id, detail, detail);
  if (!row) return;
  const { error } = await admin.from("activities").upsert(row, {
    onConflict: "user_id,activity_type,started_at",
  });
  if (error) throw new Error(error.message);
}

function adminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  return createClient(supabaseUrl, serviceKey);
}

async function ensureAccessToken(
  admin: Sb,
  conn: { user_id: string; access_token: string; refresh_token: string; expires_at: string },
) {
  const expiresAt = new Date(conn.expires_at).getTime();
  if (expiresAt - Date.now() > 60_000) return conn.access_token;

  const clientId = Deno.env.get("STRAVA_CLIENT_ID") || "";
  const clientSecret = Deno.env.get("STRAVA_CLIENT_SECRET") || "";
  const res = await fetch(STRAVA_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: conn.refresh_token,
    }),
  });
  if (!res.ok) throw new Error(`refresh failed ${res.status}`);
  const token = await res.json();
  await admin.from("strava_connections").update({
    access_token: token.access_token,
    refresh_token: token.refresh_token || conn.refresh_token,
    expires_at: new Date(token.expires_at * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("user_id", conn.user_id);
  return token.access_token as string;
}

async function getActivity(accessToken: string, id: number) {
  const res = await fetch(`${STRAVA_API}/activities/${id}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`activity ${res.status}`);
  return await res.json() as Record<string, unknown>;
}

async function deleteStravaActivities(admin: Sb, userId: string) {
  const { data, error } = await admin
    .from("activities")
    .select("started_at")
    .eq("user_id", userId)
    .eq("raw->>Source", "strava-api");
  if (error) throw new Error(error.message);
  const started = [...new Set((data || []).map((row) => row.started_at).filter(Boolean))];
  for (const startedAt of started) {
    const { error: gearErr } = await admin.from("activity_gear").delete().eq("user_id", userId).eq("activity", startedAt);
    if (gearErr) throw new Error(gearErr.message);
    const { error: noteErr } = await admin.from("activity_feedback").delete().eq("user_id", userId).eq("started_at", startedAt);
    if (noteErr) throw new Error(noteErr.message);
  }
  const { error: delErr } = await admin
    .from("activities")
    .delete()
    .eq("user_id", userId)
    .eq("raw->>Source", "strava-api");
  if (delErr) throw new Error(delErr.message);
}

async function deleteByStravaId(admin: Sb, userId: string, stravaId: number) {
  const { data } = await admin
    .from("activities")
    .select("activity_type,started_at,raw")
    .eq("user_id", userId);
  for (const row of data || []) {
    const raw = row.raw && typeof row.raw === "object" ? row.raw as Record<string, unknown> : {};
    if (Number(raw.stravaActivityId) === stravaId) {
      await admin.from("activity_gear").delete().eq("user_id", userId).eq("activity", row.started_at);
      await admin.from("activity_feedback").delete().eq("user_id", userId).eq("started_at", row.started_at);
      await admin.from("activities")
        .delete()
        .eq("user_id", userId)
        .eq("activity_type", row.activity_type)
        .eq("started_at", row.started_at);
    }
  }
}

function mapStravaToRow(
  userId: string,
  summary: Record<string, unknown>,
  detail: Record<string, unknown> | null,
) {
  const src = detail || summary;
  const typeKey = String(src.sport_type || src.type || "");
  const cat = categorize(typeKey);
  if (!cat) return null;
  const started = formatStarted(src.start_date_local || src.start_date);
  if (!started) return null;

  const meters = Number(src.distance);
  let distance: number | null = null;
  if (Number.isFinite(meters)) distance = cat === "swim" ? meters : meters / 1000;

  const movingSec = Number(src.moving_time);
  const elapsedSec = Number(src.elapsed_time);
  const duration = formatDuration(Number.isFinite(movingSec) && movingSec > 0 ? movingSec : elapsedSec);
  const avgHr = Number(src.average_heartrate);
  const maxHr = Number(src.max_heartrate);
  const avgSpeed = Number(src.average_speed);
  let avgPace: string | null = null;
  if (Number.isFinite(avgSpeed) && avgSpeed > 0) {
    if (cat === "run" || cat === "walk") avgPace = formatPace(1000 / avgSpeed);
    else if (cat === "swim") avgPace = formatPace(100 / avgSpeed);
    else if (cat === "bike") avgPace = (avgSpeed * 3.6).toFixed(1);
  }
  const activityType = displayTypeName(typeKey);
  const title = String(src.name || activityType);
  const id = Number(src.id);
  const distDisplay = distance == null
    ? ""
    : String(cat === "swim" ? Math.round(distance) : Number(distance.toFixed(2)));

  return {
    user_id: userId,
    activity_type: activityType,
    started_at: started,
    title: title || null,
    distance: distance != null && Number.isFinite(distance) ? distance : null,
    duration: duration || null,
    avg_hr: Number.isFinite(avgHr) ? Math.round(avgHr) : null,
    max_hr: Number.isFinite(maxHr) ? Math.round(maxHr) : null,
    avg_pace: avgPace || null,
    raw: {
      "Activity Type": activityType,
      Date: started,
      Title: title,
      Distance: distDisplay,
      Time: duration || "--",
      "Avg HR": Number.isFinite(avgHr) ? String(Math.round(avgHr)) : "--",
      "Max HR": Number.isFinite(maxHr) ? String(Math.round(maxHr)) : "--",
      "Avg Pace": avgPace || "--",
      Source: "strava-api",
      stravaActivityId: Number.isFinite(id) ? id : null,
      stravaTypeKey: typeKey,
    },
  };
}

function categorize(type: string) {
  const t = String(type || "").toLowerCase();
  if (t.includes("run") || t.includes("track") || t.includes("trail") || t.includes("treadmill")) return "run";
  if (t.includes("swim")) return "swim";
  if (t.includes("cycl") || t.includes("bik") || t.includes("ride") || t.includes("ebike") || t.includes("gravel")) {
    return "bike";
  }
  if (t.includes("walk") || t.includes("hik")) return "walk";
  return null;
}

function displayTypeName(typeKey: string) {
  return String(typeKey || "Activity")
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatStarted(value: unknown) {
  if (!value) return "";
  return String(value).replace("T", " ").replace(/Z$/, "").slice(0, 19);
}

function formatDuration(seconds: unknown) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s < 0) return null;
  const total = Math.round(s);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function formatPace(secPerUnit: number) {
  if (!Number.isFinite(secPerUnit) || secPerUnit <= 0 || secPerUnit > 7200) return null;
  const total = Math.round(secPerUnit);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
