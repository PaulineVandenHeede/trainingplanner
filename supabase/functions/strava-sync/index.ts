import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STRAVA_AUTH = "https://www.strava.com/oauth/authorize";
const STRAVA_TOKEN = "https://www.strava.com/oauth/token";
const STRAVA_API = "https://www.strava.com/api/v3";
const STRAVA_SCOPES = "read,activity:read_all,profile:read_all";
/** First connect / deep backfill window — long enough to keep prior race evidence (e.g. a spring half). */
const FIRST_SYNC_DAYS = 365;
const PAGE_SIZE = 50;
const DETAIL_BUDGET = 40;
const STATE_TTL_MS = 15 * 60 * 1000;

/** Temporary placeholders until real Strava API credentials are set as Edge Function secrets. */
const TEMP = {
  STRAVA_CLIENT_ID: "TEMP_STRAVA_CLIENT_ID",
  STRAVA_CLIENT_SECRET: "TEMP_STRAVA_CLIENT_SECRET",
  STRAVA_CONNECT_PASSCODE: "tri-friends-70.3",
  // Comma-separated allowlist: local + production. Strava app callback domain must match the one you use.
  STRAVA_REDIRECT_URI: "http://localhost:8000/connections,https://health.paulinevandenheede.com/connections",
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
    deep?: boolean;
    shareWithCoach?: boolean;
    returnTo?: string;
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
        body.returnTo || "",
      ));
    }
    if (action === "exchange") {
      return json(await handleExchange(admin, user.id, body.code || "", body.state || "", body.redirectUri || ""));
    }
    if (action === "disconnect") return json(await handleDisconnect(admin, user.id));
    if (action === "sync") {
      return json(await handleSync(admin, user.id, body.full === true, body.deep === true));
    }
    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Strava request failed";
    const status = /passcode|not configured|Sign in|already linked|Invalid|expired/i.test(message) ? 400 : 500;
    return json({ error: message }, status);
  }
});

function scopeHasProfileRead(scope: string | null | undefined) {
  return String(scope || "").split(/[,\s]+/).filter(Boolean).includes("profile:read_all");
}

async function handleStatus(admin: Sb, userId: string) {
  const { data, error } = await admin
    .from("strava_connections")
    .select("athlete_id,last_sync_at,last_sync_status,last_error,updated_at,share_with_coach,scope")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const hasProfileScope = scopeHasProfileRead(data?.scope);
  return {
    connected: !!data,
    athleteId: data?.athlete_id || null,
    lastSyncAt: data?.last_sync_at || null,
    lastSyncStatus: data?.last_sync_status || null,
    lastError: data?.last_error || null,
    updatedAt: data?.updated_at || null,
    shareWithCoach: data?.share_with_coach === true,
    hasProfileScope,
    needsReconnectForZones: !!data && !hasProfileScope,
    passcodeRequired: true,
  };
}

async function handleConnectUrl(
  userId: string,
  passcode: string,
  redirectUri: string,
  shareWithCoach: boolean,
  returnTo = "",
) {
  assertPasscode(passcode);
  const clientId = requireEnv("STRAVA_CLIENT_ID");
  const redirect = resolveRedirectUri(redirectUri);
  const state = await signState(userId, shareWithCoach, returnTo);
  const url = new URL(STRAVA_AUTH);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirect);
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
  const redirect = resolveRedirectUri(redirectUri);

  const token = await exchangeCode(code, redirect);
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

async function handleSync(admin: Sb, userId: string, full = false, deep = false) {
  const conn = await loadConn(admin, userId);
  if (!conn) throw new Error("Connect Strava first.");

  try {
    const access = await ensureAccessToken(admin, userId, conn);
    // deep: re-open the first-sync lookback even after an earlier short sync (e.g. 90 → 365 days).
    const after = full ? null : syncAfterEpoch(deep ? null : conn.last_sync_at);
    const summaries = await listActivities(access, after);
    const index = await loadActivityIndex(admin, userId);
    let added = 0;
    let updated = 0;
    let skippedDup = 0;
    let total = 0;
    let detailed = 0;
    let detailBudget = DETAIL_BUDGET;
    const pendingGear: { startedAt: string; gearId: string; activityType: string }[] = [];

    for (const summary of summaries) {
      const preview = mapStravaToRow(userId, summary, null);
      if (!preview) continue;
      total += 1;
      const cat = categorize(String(summary.sport_type || summary.type || preview.activity_type));
      const exactKey = `${preview.activity_type}|${preview.started_at}`;
      const twin = findCrossSourceTwin(index, cat, preview.started_at, preview.distance, "garmin-api");
      if (twin) {
        const stravaId = Number(summary.id);
        if (Number.isFinite(stravaId)) await stampStravaIdOnTwin(admin, userId, twin, stravaId);
        skippedDup += 1;
        const gearId = stravaGearIdOf(summary, null);
        if (gearId) pendingGear.push({ startedAt: twin.started_at, gearId, activityType: twin.activity_type });
        continue;
      }

      const isNew = !index.exact.has(exactKey);
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
      rememberActivity(index, {
        activity_type: row.activity_type,
        started_at: row.started_at,
        distance: row.distance,
        source: "strava-api",
        raw: row.raw as Record<string, unknown>,
      });
      if (isNew) added += 1;
      else updated += 1;
      const gearId = stravaGearIdOf(summary, detail);
      if (gearId) pendingGear.push({ startedAt: row.started_at, gearId, activityType: row.activity_type });
    }

    let gearAssigned = 0;
    let gearCreated = 0;
    let gearNote = "";
    try {
      const gear = await matchStravaGear(admin, userId, access, pendingGear);
      gearAssigned = gear.assigned;
      gearCreated = gear.created;
      gearNote = gear.note ? ` ${gear.note}` : "";
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gear matching failed";
      gearNote = ` Gear matching skipped: ${message}`;
    }

    let metrics: Record<string, unknown> | null = null;
    let metricsNote = "";
    try {
      const zonesResult = await syncAthleteZones(admin, userId, access, conn);
      metrics = zonesResult.metrics;
      metricsNote = zonesResult.note ? ` ${zonesResult.note}` : "";
    } catch (err) {
      const message = err instanceof Error ? err.message : "Zone sync failed";
      metricsNote = ` HR zones skipped: ${message}`;
    }

    const now = new Date().toISOString();
    const dupNote = skippedDup ? ` Skipped ${skippedDup} already saved via Garmin.` : "";
    const status = full
      ? `Full history: ${added} added, ${Math.max(0, total - added - skippedDup)} already saved.${dupNote}${gearNote}${metricsNote}`
      : deep
        ? `Deep sync (${FIRST_SYNC_DAYS}d): ${added} added, ${updated} updated (${total} total${detailed ? `, ${detailed} detailed` : ""}).${dupNote}${gearNote}${metricsNote}`
        : `Synced ${added} new, ${updated} updated (${total} total${detailed ? `, ${detailed} detailed` : ""}).${dupNote}${gearNote}${metricsNote}`;
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
      skippedDup,
      total,
      detailed,
      gearAssigned,
      gearCreated,
      metrics,
      full,
      deep,
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

async function loadConn(admin: Sb, userId: string): Promise<(Conn & { scope?: string | null }) | null> {
  const { data, error } = await admin
    .from("strava_connections")
    .select("athlete_id,access_token,refresh_token,expires_at,last_sync_at,scope")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

/** Map Strava /athlete/zones into training_metrics floors + estimated max HR. */
function metricsFromStravaZones(payload: Record<string, unknown>) {
  const hr = payload.heart_rate && typeof payload.heart_rate === "object"
    ? payload.heart_rate as Record<string, unknown>
    : null;
  const bands = Array.isArray(hr?.zones) ? hr.zones : [];
  if (bands.length < 3) return null;

  const floors = bands
    .map((band) => {
      if (!band || typeof band !== "object") return null;
      const min = Number((band as Record<string, unknown>).min);
      return Number.isFinite(min) && min > 40 ? Math.round(min) : null;
    })
    .filter((n): n is number => n != null);
  if (floors.length < 3) return null;

  const last = bands[bands.length - 1] as Record<string, unknown>;
  const lastMin = Number(last?.min);
  const lastMax = Number(last?.max);
  let maxHr: number | null = null;
  if (Number.isFinite(lastMax) && lastMax >= 150 && lastMax <= 230) {
    maxHr = Math.round(lastMax);
  } else if (Number.isFinite(lastMin) && lastMin >= 140 && lastMin <= 220) {
    // Default Strava zones: Z5 starts near 97% of max HR when not custom.
    maxHr = hr?.custom_zones === false
      ? Math.round(lastMin / 0.97)
      : Math.round(lastMin + 5);
    if (maxHr > 230) maxHr = 230;
  }

  return {
    zones: floors.slice(0, 5),
    max_hr: maxHr,
  };
}

async function getAthleteZones(accessToken: string) {
  const res = await fetch(`${STRAVA_API}/athlete/zones`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const text = await res.text();
  if (res.status === 401 || res.status === 403) {
    throw new Error("reconnect");
  }
  if (!res.ok) throw new Error(stravaError("zones", res.status, text));
  return JSON.parse(text) as Record<string, unknown>;
}

async function syncAthleteZones(
  admin: Sb,
  userId: string,
  accessToken: string,
  conn: Conn & { scope?: string | null },
): Promise<{ metrics: Record<string, unknown> | null; note: string }> {
  if (!scopeHasProfileRead(conn.scope)) {
    return {
      metrics: null,
      note: "Reconnect Strava to import heart-rate zones (needs profile access).",
    };
  }

  let payload: Record<string, unknown>;
  try {
    payload = await getAthleteZones(accessToken);
  } catch (err) {
    if (err instanceof Error && err.message === "reconnect") {
      return {
        metrics: null,
        note: "Reconnect Strava to import heart-rate zones (needs profile access).",
      };
    }
    throw err;
  }
  const parsed = metricsFromStravaZones(payload);
  if (!parsed) {
    return { metrics: null, note: "No Strava heart-rate zones configured." };
  }

  const { data: existing } = await admin
    .from("training_metrics")
    .select("max_hr,resting_hr,lthr,lt_speed_mps,vo2_run,zones,load")
    .eq("user_id", userId)
    .maybeSingle();

  const row: Record<string, unknown> = {
    user_id: userId,
    resting_hr: existing?.resting_hr ?? null,
    lthr: existing?.lthr ?? null,
    lt_speed_mps: existing?.lt_speed_mps ?? null,
    vo2_run: existing?.vo2_run ?? null,
    load: existing?.load ?? null,
    zones: parsed.zones,
    updated_at: new Date().toISOString(),
  };
  // Keep a higher Garmin/observed max HR if already present; otherwise use Strava estimate.
  const prevMax = Number(existing?.max_hr);
  if (parsed.max_hr && Number.isFinite(parsed.max_hr)) {
    row.max_hr = Number.isFinite(prevMax) && prevMax >= parsed.max_hr ? Math.round(prevMax) : parsed.max_hr;
  } else if (Number.isFinite(prevMax)) {
    row.max_hr = Math.round(prevMax);
  } else {
    row.max_hr = null;
  }

  const { error } = await admin.from("training_metrics").upsert(row);
  if (error) throw new Error(error.message);

  const { data: saved } = await admin
    .from("training_metrics")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  const zoneCount = parsed.zones.length;
  const maxBit = row.max_hr ? `, max HR ${row.max_hr}` : "";
  return {
    metrics: saved || row,
    note: `HR zones imported (${zoneCount}${maxBit}).`,
  };
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

type ActIndexRow = {
  activity_type: string;
  started_at: string;
  distance: number | null;
  source: string;
  raw: Record<string, unknown>;
};

type ActIndex = {
  exact: Set<string>;
  rows: ActIndexRow[];
};

async function loadActivityIndex(admin: Sb, userId: string): Promise<ActIndex> {
  const { data, error } = await admin
    .from("activities")
    .select("activity_type,started_at,distance,raw")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const exact = new Set<string>();
  const rows: ActIndexRow[] = [];
  for (const row of data || []) {
    const started = formatStarted(row.started_at);
    const raw = row.raw && typeof row.raw === "object" ? row.raw as Record<string, unknown> : {};
    const source = String(raw.Source || "");
    const item: ActIndexRow = {
      activity_type: String(row.activity_type || ""),
      started_at: started,
      distance: row.distance == null ? null : Number(row.distance),
      source,
      raw,
    };
    exact.add(`${item.activity_type}|${item.started_at}`);
    rows.push(item);
  }
  return { exact, rows };
}

function rememberActivity(index: ActIndex, row: ActIndexRow) {
  index.exact.add(`${row.activity_type}|${row.started_at}`);
  index.rows.push(row);
}

function startedMs(value: string) {
  const ms = Date.parse(String(value || "").replace(" ", "T"));
  return Number.isFinite(ms) ? ms : NaN;
}

function distanceClose(a: number | null, b: number | null) {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return true;
  if (a <= 0 || b <= 0) return true;
  const delta = Math.abs(a - b);
  return delta <= 0.25 || delta / Math.max(a, b) <= 0.05;
}

function findCrossSourceTwin(
  index: ActIndex,
  cat: string | null,
  startedAt: string,
  distance: number | null,
  source: string,
): ActIndexRow | null {
  if (!cat) return null;
  const want = startedMs(startedAt);
  if (!Number.isFinite(want)) return null;
  let best: ActIndexRow | null = null;
  let bestDelta = Infinity;
  for (const row of index.rows) {
    if (row.source !== source) continue;
    if (categorize(row.activity_type) !== cat) continue;
    if (!distanceClose(row.distance, distance)) continue;
    const got = startedMs(row.started_at);
    if (!Number.isFinite(got)) continue;
    const delta = Math.abs(got - want);
    if (delta > 120_000) continue;
    if (delta < bestDelta) {
      best = row;
      bestDelta = delta;
    }
  }
  return best;
}

async function stampStravaIdOnTwin(admin: Sb, userId: string, twin: ActIndexRow, stravaId: number) {
  if (Number(twin.raw.stravaActivityId) === stravaId) return;
  const nextRaw = { ...twin.raw, stravaActivityId: stravaId };
  const { error } = await admin.from("activities").update({ raw: nextRaw })
    .eq("user_id", userId)
    .eq("activity_type", twin.activity_type)
    .eq("started_at", twin.started_at);
  if (error) throw new Error(error.message);
  twin.raw = nextRaw;
}

function stravaGearIdOf(summary: Record<string, unknown>, detail: Record<string, unknown> | null) {
  const raw = detail?.gear_id ?? summary.gear_id;
  const id = String(raw || "").trim();
  if (!id || id === "none") return null;
  return id;
}

type LocalGear = {
  id: string;
  type: string;
  name: string;
  retired: boolean;
  strava_uuid: string | null;
};

function stravaGearType(gearId: string, gear: Record<string, unknown> | null) {
  if (gearId.startsWith("b")) return "bike";
  if (gearId.startsWith("g")) return "shoes";
  const frame = gear?.frame_type;
  if (frame != null) return "bike";
  return "shoes";
}

function stravaGearName(gear: Record<string, unknown>, fallbackId: string) {
  const name = String(gear.name || "").trim();
  if (name) return name.slice(0, 80);
  const brand = String(gear.brand_name || "").trim();
  const model = String(gear.model_name || "").trim();
  const joined = [brand, model].filter(Boolean).join(" ").trim();
  if (joined) return joined.slice(0, 80);
  return fallbackId.startsWith("b") ? "Bike" : "Shoes";
}

function gearFitsActivity(type: string, activityType: string) {
  const cat = categorize(activityType);
  if (type === "shoes") return cat === "run" || cat === "walk";
  if (type === "bike") return cat === "bike" || cat === "ebike";
  return false;
}

function normGearName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

async function loadLocalGear(admin: Sb, userId: string): Promise<{ items: LocalGear[]; hasUuid: boolean }> {
  const withUuid = await admin
    .from("gear")
    .select("id,type,name,retired,strava_uuid")
    .eq("user_id", userId);
  if (!withUuid.error) {
    return {
      items: (withUuid.data || []).map((row) => ({
        id: String(row.id),
        type: String(row.type || ""),
        name: String(row.name || ""),
        retired: !!row.retired,
        strava_uuid: row.strava_uuid != null && row.strava_uuid !== "" ? String(row.strava_uuid) : null,
      })),
      hasUuid: true,
    };
  }
  const plain = await admin.from("gear").select("id,type,name,retired").eq("user_id", userId);
  if (plain.error) throw new Error(plain.error.message);
  return {
    items: (plain.data || []).map((row) => ({
      id: String(row.id),
      type: String(row.type || ""),
      name: String(row.name || ""),
      retired: !!row.retired,
      strava_uuid: null,
    })),
    hasUuid: false,
  };
}

function findLocalStravaGear(items: LocalGear[], type: string, gearId: string, name: string) {
  const byId = items.find((item) => item.strava_uuid === gearId || item.id === gearId);
  if (byId) return byId;
  const want = normGearName(name);
  if (!want) return null;
  const matches = items.filter((item) => item.type === type && !item.strava_uuid && normGearName(item.name) === want);
  return matches.length === 1 ? matches[0] : null;
}

async function getStravaGear(accessToken: string, gearId: string) {
  const res = await fetch(`${STRAVA_API}/gear/${encodeURIComponent(gearId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(stravaError("gear", res.status, text));
  return JSON.parse(text) as Record<string, unknown>;
}

async function matchStravaGear(
  admin: Sb,
  userId: string,
  accessToken: string,
  pending: { startedAt: string; gearId: string; activityType: string }[],
): Promise<{ assigned: number; created: number; note: string }> {
  if (!pending.length) return { assigned: 0, created: 0, note: "" };

  const { items, hasUuid } = await loadLocalGear(admin, userId);
  const { data: existing, error: assignErr } = await admin
    .from("activity_gear")
    .select("activity")
    .eq("user_id", userId);
  if (assignErr) throw new Error(assignErr.message);
  const assignedKeys = new Set((existing || []).map((row) => String(row.activity)));

  const cache = new Map<string, Record<string, unknown>>();
  let assigned = 0;
  let created = 0;

  for (const item of pending) {
    if (assignedKeys.has(item.startedAt)) continue;
    let detail = cache.get(item.gearId) || null;
    if (!detail) {
      try {
        detail = await getStravaGear(accessToken, item.gearId);
        cache.set(item.gearId, detail);
      } catch {
        detail = { id: item.gearId, name: item.gearId };
        cache.set(item.gearId, detail);
      }
    }
    const type = stravaGearType(item.gearId, detail);
    if (!gearFitsActivity(type, item.activityType)) continue;
    const name = stravaGearName(detail, item.gearId);
    let local = findLocalStravaGear(items, type, item.gearId, name);
    if (!local) {
      const insert: Record<string, unknown> = {
        id: item.gearId.slice(0, 40),
        user_id: userId,
        type,
        name,
        note: "From Strava",
        retired: !!detail.retired,
      };
      if (hasUuid) insert.strava_uuid = item.gearId;
      const columns = hasUuid ? "id,type,name,retired,strava_uuid" : "id,type,name,retired";
      const { data, error } = await admin.from("gear").insert(insert).select(columns).maybeSingle();
      if (error || !data) {
        if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message);
        local = findLocalStravaGear(items, type, item.gearId, name);
        if (!local) continue;
      } else {
        local = {
          id: String(data.id),
          type: String(data.type || type),
          name: String(data.name || name),
          retired: !!data.retired,
          strava_uuid: hasUuid ? item.gearId : null,
        };
        items.push(local);
        created += 1;
      }
    } else if (hasUuid && !local.strava_uuid) {
      await admin.from("gear").update({ strava_uuid: item.gearId }).eq("user_id", userId).eq("id", local.id);
      local.strava_uuid = item.gearId;
    }

    const { error } = await admin.from("activity_gear").upsert({
      user_id: userId,
      activity: item.startedAt,
      gear_id: local.id,
    });
    if (error) throw new Error(error.message);
    assignedKeys.add(item.startedAt);
    assigned += 1;
  }

  const bits: string[] = [];
  if (assigned) bits.push(`${assigned} activit${assigned === 1 ? "y" : "ies"} linked`);
  if (created) bits.push(`${created} added`);
  return { assigned, created, note: bits.length ? `Gear: ${bits.join(", ")}.` : "" };
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
    else if (cat === "bike" || cat === "ebike") {
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
  const workoutType = src.workout_type ?? summary.workout_type;

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
  if (workoutType != null && workoutType !== "") raw.stravaWorkoutType = workoutType;

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
  // E-bike before bike: "ebike" / "e_bike" also match the generic "bik" check.
  if (/e[\s_-]*bike|electric[\s_-]*bike|ebiking/.test(t)) return "ebike";
  if (
    t.includes("cycl") || t.includes("bik") || t.includes("ride") ||
    t.includes("virtualride") || t.includes("gravel")
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

function allowedRedirectUris() {
  const raw = stravaConfig("STRAVA_REDIRECT_URI");
  const extras = Deno.env.get("STRAVA_REDIRECT_URIS") || "";
  const parts = `${raw},${extras}`.split(",").map((s) => s.trim()).filter(Boolean);
  // Always accept loopback on port 8000 during development.
  parts.push("http://localhost:8000/connections", "http://127.0.0.1:8000/connections");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const key = normalizeUri(part);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(part.replace(/\/+$/, "") || part);
  }
  return out;
}

function isPrivateLanHost(host: string) {
  const h = String(host || "").toLowerCase();
  if (h === "localhost" || h === "127.0.0.1") return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!m) return false;
  const a = Number(m[1]), b = Number(m[2]), c = Number(m[3]), d = Number(m[4]);
  if ([a, b, c, d].some((n) => n > 255)) return false;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

/** Local/LAN http://…:8000/connections is allowed without listing every IP. */
function isLocalDevRedirect(uri: string) {
  try {
    const u = new URL(uri);
    if (u.protocol !== "http:") return false;
    if (u.port !== "8000") return false;
    const path = u.pathname.replace(/\/+$/, "") || "/";
    if (path !== "/connections") return false;
    return isPrivateLanHost(u.hostname);
  } catch {
    return false;
  }
}

/** Pick the client redirect URI if it’s on the allowlist (local, LAN, or production). */
function resolveRedirectUri(requested: string) {
  if (!requested) throw new Error("Redirect URI is not configured for this app.");
  const cleaned = String(requested).replace(/\/+$/, "");
  const want = normalizeUri(cleaned);
  const allowed = allowedRedirectUris();
  const match = allowed.find((uri) => normalizeUri(uri) === want);
  if (match || isLocalDevRedirect(cleaned)) {
    // Prefer the exact client value so token exchange matches the authorize step.
    return cleaned || match || cleaned;
  }
  throw new Error("Redirect URI is not configured for this app.");
}

function normalizeReturnTo(returnTo: string) {
  return returnTo === "/setup" ? "/setup" : "/connections";
}

async function signState(userId: string, shareWithCoach: boolean, returnTo = "") {
  const secret = requireEnv("STRAVA_CLIENT_SECRET");
  const payload = {
    uid: userId,
    exp: Date.now() + STATE_TTL_MS,
    n: crypto.randomUUID(),
    share: shareWithCoach === true,
    ret: normalizeReturnTo(returnTo),
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
  let payload: { uid?: string; exp?: number; share?: boolean; ret?: string };
  try {
    const padded = body + "=".repeat((4 - (body.length % 4)) % 4);
    payload = JSON.parse(atob(padded.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    throw new Error("Invalid or expired Strava connect session. Try again.");
  }
  if (payload.uid !== userId) throw new Error("Invalid or expired Strava connect session. Try again.");
  if (!payload.exp || Date.now() > payload.exp) {
    throw new Error("Strava connect session expired. Try connecting again.");
  }
  return { share: payload.share === true, returnTo: normalizeReturnTo(payload.ret || "") };
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
