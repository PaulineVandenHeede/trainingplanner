import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STRAVA_AUTH = "https://www.strava.com/oauth/authorize";
const STRAVA_TOKEN = "https://www.strava.com/oauth/token";
const STRAVA_API = "https://www.strava.com/api/v3";
const STRAVA_SCOPES = "read,activity:read_all";
const FIRST_SYNC_DAYS = 90;
const PAGE_SIZE = 50;
const DETAIL_BUDGET = 40;
const STATE_TTL_MS = 15 * 60 * 1000;

/** Temporary placeholders until real Strava API credentials are set as Edge Function secrets. */
const TEMP = {
  STRAVA_CLIENT_ID: "TEMP_STRAVA_CLIENT_ID",
  STRAVA_CLIENT_SECRET: "TEMP_STRAVA_CLIENT_SECRET",
  STRAVA_CONNECT_PASSCODE: "TEMP_STRAVA_CONNECT_PASSCODE",
  STRAVA_REDIRECT_URI: "http://localhost:8000/connections",
  STRAVA_WEBHOOK_VERIFY_TOKEN: "temp-strava-webhook-verify",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

type Sb = ReturnType<typeof createClient>;

type Conn = {
  athlete_id: number;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  last_sync_at: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Sign in required" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anon = req.headers.get("apikey") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const userClient = createClient(supabaseUrl, anon, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  const user = userData?.user;
  if (userErr || !user) return json({ error: "Sign in required" }, 401);
  if (!serviceKey) return json({ error: "Server misconfigured" }, 500);
  const admin = createClient(supabaseUrl, serviceKey);

  let body: {
    action?: string;
    passcode?: string;
    redirectUri?: string;
    code?: string;
    state?: string;
    full?: boolean;
    shareWithCoach?: boolean;
  } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const action = body.action || "status";
  try {
    if (action === "status") return json(await handleStatus(admin, user.id));
    if (action === "connect_url") {
      return json(await handleConnectUrl(
        user.id,
        body.passcode || "",
        body.redirectUri || "",
        body.shareWithCoach === true,
      ));
    }
    if (action === "exchange") {
      return json(await handleExchange(admin, user.id, body.code || "", body.state || "", body.redirectUri || ""));
    }
    if (action === "disconnect") return json(await handleDisconnect(admin, user.id));
    if (action === "sync") return json(await handleSync(admin, user.id, body.full === true));
    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Strava request failed";
    const status = /passcode|not configured|Sign in|already linked|Invalid|expired/i.test(message) ? 400 : 500;
    return json({ error: message }, status);
  }
});

async function handleStatus(admin: Sb, userId: string) {
  const { data, error } = await admin
    .from("strava_connections")
    .select("athlete_id,last_sync_at,last_sync_status,last_error,updated_at,share_with_coach")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    connected: !!data,
    athleteId: data?.athlete_id || null,
    lastSyncAt: data?.last_sync_at || null,
    lastSyncStatus: data?.last_sync_status || null,
    lastError: data?.last_error || null,
    updatedAt: data?.updated_at || null,
    shareWithCoach: data?.share_with_coach === true,
    passcodeRequired: true,
  };
}

async function handleConnectUrl(userId: string, passcode: string, redirectUri: string, shareWithCoach: boolean) {
  assertPasscode(passcode);
  const clientId = requireEnv("STRAVA_CLIENT_ID");
  const expectedRedirect = requireEnv("STRAVA_REDIRECT_URI");
  if (!redirectUri || normalizeUri(redirectUri) !== normalizeUri(expectedRedirect)) {
    throw new Error("Redirect URI is not configured for this app.");
  }
  const state = await signState(userId, shareWithCoach);
  const url = new URL(STRAVA_AUTH);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", expectedRedirect);
  url.searchParams.set("approval_prompt", "auto");
  url.searchParams.set("scope", STRAVA_SCOPES);
  url.searchParams.set("state", state);
  return { ok: true, url: url.toString() };
}

async function handleExchange(
  admin: Sb,
  userId: string,
  code: string,
  state: string,
  redirectUri: string,
) {
  if (!code) throw new Error("Missing Strava authorization code.");
  const statePayload = await verifyState(userId, state);
  const expectedRedirect = requireEnv("STRAVA_REDIRECT_URI");
  if (redirectUri && normalizeUri(redirectUri) !== normalizeUri(expectedRedirect)) {
    throw new Error("Redirect URI is not configured for this app.");
  }

  const token = await exchangeCode(code, expectedRedirect);
  const athleteId = Number(token.athlete?.id);
  if (!Number.isFinite(athleteId)) throw new Error("Strava did not return an athlete id.");

  const { data: taken } = await admin
    .from("strava_connections")
    .select("user_id")
    .eq("athlete_id", athleteId)
    .maybeSingle();
  if (taken && taken.user_id !== userId) {
    throw new Error("That Strava account is already linked to another user.");
  }

  const now = new Date().toISOString();
  const { error } = await admin.from("strava_connections").upsert({
    user_id: userId,
    athlete_id: athleteId,
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: new Date(token.expires_at * 1000).toISOString(),
    scope: token.scope || STRAVA_SCOPES,
    share_with_coach: statePayload.share === true,
    last_error: null,
    updated_at: now,
  });
  if (error) throw new Error(error.message);
  return { ok: true, connected: true, athleteId };
}

async function handleDisconnect(admin: Sb, userId: string) {
  const removed = await deleteStravaActivities(admin, userId);
  const { data: conn } = await admin
    .from("strava_connections")
    .select("access_token")
    .eq("user_id", userId)
    .maybeSingle();
  if (conn?.access_token) {
    try {
      await fetch(`${STRAVA_API.replace("/api/v3", "")}/oauth/deauthorize`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ access_token: conn.access_token }),
      });
    } catch {
      // Still drop the local row if Strava deauth fails.
    }
  }
  const { error } = await admin.from("strava_connections").delete().eq("user_id", userId);
  if (error) throw new Error(error.message);
  return { ok: true, connected: false, removed };
}

async function handleSync(admin: Sb, userId: string, full = false) {
  const conn = await loadConn(admin, userId);
  if (!conn) throw new Error("Connect Strava first — enter the passcode on Connections.");

  try {
    const access = await ensureAccessToken(admin, userId, conn);
    const after = full ? null : syncAfterEpoch(conn.last_sync_at);
    const summaries = await listActivities(access, after);
    const known = await loadKnownKeys(admin, userId);
    let added = 0;
    let updated = 0;
    let total = 0;
    let detailed = 0;
    let detailBudget = DETAIL_BUDGET;

    for (const summary of summaries) {
      const preview = mapStravaToRow(userId, summary, null);
      if (!preview) continue;
      total += 1;
      const key = `${preview.activity_type}|${preview.started_at}`;
      const isNew = !known.has(key);
      let detail: Record<string, unknown> | null = null;
      if (isNew && detailBudget > 0) {
        const id = Number(summary.id);
        if (Number.isFinite(id)) {
          try {
            detail = await getActivity(access, id);
            detailBudget -= 1;
            detailed += 1;
          } catch {
            detail = null;
          }
        }
      }
      const row = mapStravaToRow(userId, summary, detail);
      if (!row) continue;
      const { error } = await admin.from("activities").upsert(row, {
        onConflict: "user_id,activity_type,started_at",
      });
      if (error) throw new Error(error.message);
      if (isNew) {
        added += 1;
        known.add(key);
      } else {
        updated += 1;
      }
    }

    const now = new Date().toISOString();
    const status = full
      ? `Full history: ${added} added, ${Math.max(0, total - added)} already saved.`
      : `Synced ${added} new, ${updated} updated (${total} total${detailed ? `, ${detailed} detailed` : ""}).`;
    await admin.from("strava_connections").update({
      last_sync_at: now,
      last_sync_status: status,
      last_error: null,
      updated_at: now,
    }).eq("user_id", userId);

    return {
      ok: true,
      connected: true,
      added,
      updated,
      total,
      detailed,
      full,
      lastSyncAt: now,
      lastSyncStatus: status,
      lastError: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    const now = new Date().toISOString();
    await admin.from("strava_connections").update({
      last_sync_status: "error",
      last_error: message,
      updated_at: now,
    }).eq("user_id", userId);
    throw err;
  }
}

async function loadConn(admin: Sb, userId: string): Promise<Conn | null> {
  const { data, error } = await admin
    .from("strava_connections")
    .select("athlete_id,access_token,refresh_token,expires_at,last_sync_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

async function ensureAccessToken(admin: Sb, userId: string, conn: Conn): Promise<string> {
  const expiresAt = new Date(conn.expires_at).getTime();
  if (expiresAt - Date.now() > 60_000) return conn.access_token;

  const clientId = requireEnv("STRAVA_CLIENT_ID");
  const clientSecret = requireEnv("STRAVA_CLIENT_SECRET");
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
  const text = await res.text();
  if (!res.ok) throw new Error(stravaError("refresh", res.status, text));
  const token = JSON.parse(text) as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
  };
  const now = new Date().toISOString();
  const { error } = await admin.from("strava_connections").update({
    access_token: token.access_token,
    refresh_token: token.refresh_token || conn.refresh_token,
    expires_at: new Date(token.expires_at * 1000).toISOString(),
    updated_at: now,
  }).eq("user_id", userId);
  if (error) throw new Error(error.message);
  return token.access_token;
}

async function exchangeCode(code: string, redirectUri: string) {
  const clientId = requireEnv("STRAVA_CLIENT_ID");
  const clientSecret = requireEnv("STRAVA_CLIENT_SECRET");
  const res = await fetch(STRAVA_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(stravaError("token", res.status, text));
  return JSON.parse(text) as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    scope?: string;
    athlete?: { id?: number };
  };
}

async function listActivities(accessToken: string, after: number | null) {
  const out: Record<string, unknown>[] = [];
  let page = 1;
  while (page <= 40) {
    const url = new URL(`${STRAVA_API}/athlete/activities`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", String(PAGE_SIZE));
    if (after != null) url.searchParams.set("after", String(after));
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(stravaError("activities", res.status, text));
    const batch = JSON.parse(text) as Record<string, unknown>[];
    if (!Array.isArray(batch) || !batch.length) break;
    out.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    page += 1;
  }
  return out;
}

async function getActivity(accessToken: string, id: number) {
  const res = await fetch(`${STRAVA_API}/activities/${id}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(stravaError("activity", res.status, text));
  return JSON.parse(text) as Record<string, unknown>;
}

async function loadKnownKeys(admin: Sb, userId: string) {
  const { data, error } = await admin
    .from("activities")
    .select("activity_type,started_at")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const set = new Set<string>();
  for (const row of data || []) {
    set.add(`${row.activity_type}|${formatStarted(row.started_at)}`);
  }
  return set;
}

function syncAfterEpoch(lastSyncAt: string | null): number {
  if (lastSyncAt) {
    const d = new Date(lastSyncAt);
    d.setUTCDate(d.getUTCDate() - 3);
    return Math.floor(d.getTime() / 1000);
  }
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - FIRST_SYNC_DAYS);
  return Math.floor(d.getTime() / 1000);
}

function mapStravaToRow(
  userId: string,
  summary: Record<string, unknown>,
  detail: Record<string, unknown> | null,
) {
  const src = detail || summary;
  const typeKey = String(src.sport_type || src.type || summary.sport_type || summary.type || "");
  const cat = categorize(typeKey);
  if (!cat) return null;

  const startedRaw = src.start_date_local || summary.start_date_local || src.start_date || summary.start_date;
  const started = formatStarted(startedRaw);
  if (!started) return null;

  const meters = Number(src.distance ?? summary.distance);
  let distance: number | null = null;
  if (Number.isFinite(meters)) {
    distance = cat === "swim" ? meters : meters / 1000;
  }

  const movingSec = Number(src.moving_time ?? summary.moving_time);
  const elapsedSec = Number(src.elapsed_time ?? summary.elapsed_time);
  const duration = formatDuration(Number.isFinite(movingSec) && movingSec > 0 ? movingSec : elapsedSec);
  const moving = formatDuration(movingSec);

  const avgHr = Number(src.average_heartrate ?? summary.average_heartrate);
  const maxHr = Number(src.max_heartrate ?? summary.max_heartrate);
  const avgSpeed = Number(src.average_speed ?? summary.average_speed);

  let avgPace: string | null = null;
  if (Number.isFinite(avgSpeed) && avgSpeed > 0) {
    if (cat === "run" || cat === "walk") avgPace = formatPace(1000 / avgSpeed);
    else if (cat === "swim") avgPace = formatPace(100 / avgSpeed);
    else if (cat === "bike") {
      const kmh = avgSpeed * 3.6;
      avgPace = Number.isFinite(kmh) ? kmh.toFixed(1) : null;
    }
  }

  const activityType = displayTypeName(typeKey);
  const title = String(src.name || summary.name || activityType);
  const id = Number(src.id ?? summary.id);
  const calories = src.calories ?? summary.calories;
  const ascent = src.total_elevation_gain ?? summary.total_elevation_gain;
  const avgPower = src.average_watts ?? summary.average_watts;
  const cadence = src.average_cadence ?? summary.average_cadence;

  const distDisplay = distance == null
    ? ""
    : String(cat === "swim" ? Math.round(distance) : Number(distance.toFixed(2)));

  const raw: Record<string, unknown> = {
    "Activity Type": activityType,
    Date: started,
    Title: title,
    Distance: distDisplay,
    Time: duration || "--",
    "Moving Time": moving || "--",
    "Avg HR": Number.isFinite(avgHr) ? String(Math.round(avgHr)) : "--",
    "Max HR": Number.isFinite(maxHr) ? String(Math.round(maxHr)) : "--",
    "Avg Pace": avgPace || "--",
    Calories: calories != null ? String(calories) : "--",
    "Total Ascent": ascent != null ? String(ascent) : "--",
    "Avg Run Cadence": cadence != null ? String(cadence) : "--",
    "Avg Power": avgPower != null ? String(avgPower) : "--",
    Source: "strava-api",
    stravaActivityId: Number.isFinite(id) ? id : null,
    stravaTypeKey: typeKey,
  };

  return {
    user_id: userId,
    activity_type: activityType,
    started_at: started,
    title: title && title !== "--" ? title : null,
    distance: distance != null && Number.isFinite(distance) ? distance : null,
    duration: duration || null,
    avg_hr: Number.isFinite(avgHr) ? Math.round(avgHr) : null,
    max_hr: Number.isFinite(maxHr) ? Math.round(maxHr) : null,
    avg_pace: avgPace || null,
    raw,
  };
}

function categorize(type: string) {
  const t = String(type || "").toLowerCase();
  if (t.includes("run") || t.includes("track") || t.includes("trail") || t.includes("treadmill")) {
    return "run";
  }
  if (t.includes("swim") || t.includes("lap_swimming") || t.includes("open_water")) return "swim";
  if (
    t.includes("cycl") || t.includes("bik") || t.includes("ride") ||
    t.includes("virtualride") || t.includes("ebike") || t.includes("gravel")
  ) return "bike";
  if (t.includes("walk") || t.includes("hik")) return "walk";
  return null;
}

function displayTypeName(typeKey: string) {
  const raw = String(typeKey || "Activity");
  return raw
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

function formatPace(secPerUnit: number | null) {
  if (secPerUnit == null || !Number.isFinite(secPerUnit) || secPerUnit <= 0 || secPerUnit > 3600 * 2) {
    return null;
  }
  const total = Math.round(secPerUnit);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function stravaConfig(name: keyof typeof TEMP) {
  const fromEnv = Deno.env.get(name) || "";
  return fromEnv || TEMP[name];
}

function secretsEqual(a: string, b: string): boolean {
  const aa = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  const len = Math.max(aa.length, bb.length);
  let diff = aa.length === bb.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    diff |= (aa[i] || 0) ^ (bb[i] || 0);
  }
  return diff === 0;
}

function assertPasscode(passcode: string) {
  const expected = stravaConfig("STRAVA_CONNECT_PASSCODE");
  const got = String(passcode || "");
  if (!got || !secretsEqual(got, expected)) {
    throw new Error("Wrong connect passcode.");
  }
}

function requireEnv(name: keyof typeof TEMP) {
  const v = stravaConfig(name);
  if (!v) throw new Error(`Strava is not configured (${name} missing).`);
  if (v.startsWith("TEMP_STRAVA_")) {
    throw new Error(
      "Strava API credentials are still temporary placeholders. Create an app at https://www.strava.com/settings/api and set STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET as Edge Function secrets.",
    );
  }
  return v;
}

function normalizeUri(uri: string) {
  try {
    const u = new URL(uri);
    u.hash = "";
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.protocol}//${u.host}${path}`.toLowerCase();
  } catch {
    return uri.trim().replace(/\/+$/, "").toLowerCase();
  }
}

async function signState(userId: string, shareWithCoach: boolean) {
  const secret = requireEnv("STRAVA_CLIENT_SECRET");
  const payload = {
    uid: userId,
    exp: Date.now() + STATE_TTL_MS,
    n: crypto.randomUUID(),
    share: shareWithCoach === true,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = await hmac(secret, body);
  return `${body}.${sig}`;
}

async function verifyState(userId: string, state: string) {
  if (!state || !state.includes(".")) throw new Error("Invalid or expired Strava connect session. Try again.");
  const [body, sig] = state.split(".", 2);
  const secret = requireEnv("STRAVA_CLIENT_SECRET");
  const expected = await hmac(secret, body);
  if (!secretsEqual(sig, expected)) throw new Error("Invalid or expired Strava connect session. Try again.");
  let payload: { uid?: string; exp?: number; share?: boolean };
  try {
    const padded = body + "=".repeat((4 - (body.length % 4)) % 4);
    payload = JSON.parse(atob(padded.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    throw new Error("Invalid or expired Strava connect session. Try again.");
  }
  if (payload.uid !== userId) throw new Error("Invalid or expired Strava connect session. Try again.");
  if (!payload.exp || Date.now() > payload.exp) {
    throw new Error("Strava connect session expired. Enter the passcode again.");
  }
  return { share: payload.share === true };
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
  return started.length;
}

async function hmac(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return b64url(String.fromCharCode(...new Uint8Array(sig)));
}

function b64url(value: string) {
  const bytes = typeof value === "string" && /[^\x00-\xff]/.test(value)
    ? new TextEncoder().encode(value)
    : Uint8Array.from(value, (c) => c.charCodeAt(0));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function stravaError(step: string, status: number, body: string) {
  let detail = body.slice(0, 200);
  try {
    const parsed = JSON.parse(body);
    detail = parsed?.message || parsed?.error || detail;
  } catch { /* keep slice */ }
  return `Strava ${step} failed (${status}): ${detail}`;
}
