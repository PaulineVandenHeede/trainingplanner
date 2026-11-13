import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GARMIN_BASE = "https://personal.connectapi.garmin.com";
const TOKEN_PATH = "/personalapitoken-service/personal-api/personal-api-key/token";
const PAGE_SIZE = 50;
const FIRST_SYNC_DAYS = 90;
/** Garmin Personal API allows ~100 calls per short window. Budget detail fetches accordingly. */
const DETAIL_FETCH_BUDGET = 35;
const MAX_429_RETRIES = 4;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

type Sb = ReturnType<typeof createClient>;

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
  // Garmin api_key is revoked from the browser JWT role; only service role may touch it.
  const admin = createClient(supabaseUrl, serviceKey);

  let body: { action?: string; apiKey?: string; full?: boolean; today?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const action = body.action || "status";
  try {
    if (action === "status") return json(await handleStatus(admin, user.id));
    if (action === "save_key") return json(await handleSaveKey(admin, user.id, body.apiKey || ""));
    if (action === "disconnect") return json(await handleDisconnect(admin, user.id));
    if (action === "sync") {
      return json(await handleSync(userClient, admin, user.id, body.full === true, body.today || ""));
    }
    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Garmin request failed";
    return json({ error: message }, 500);
  }
});

async function handleStatus(admin: Sb, userId: string) {
  const { data, error } = await admin
    .from("garmin_connections")
    .select("last_sync_at,last_sync_status,last_error,updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    connected: !!data,
    lastSyncAt: data?.last_sync_at || null,
    lastSyncStatus: data?.last_sync_status || null,
    lastError: data?.last_error || null,
    updatedAt: data?.updated_at || null,
  };
}

async function handleSaveKey(admin: Sb, userId: string, apiKey: string) {
  const key = String(apiKey || "").trim();
  if (!key) throw new Error("Paste your Garmin Personal API key.");
  // Save without calling Garmin here — token exchange counts toward the rate limit.
  // Sync validates the key on the next Sync activities click.
  const now = new Date().toISOString();
  const { error } = await admin.from("garmin_connections").upsert({
    user_id: userId,
    api_key: key,
    last_error: null,
    updated_at: now,
  });
  if (error) throw new Error(error.message);
  return { ok: true, connected: true };
}

async function handleDisconnect(admin: Sb, userId: string) {
  const { error } = await admin.from("garmin_connections").delete().eq("user_id", userId);
  if (error) throw new Error(error.message);
  return { ok: true, connected: false };
}

async function handleSync(sb: Sb, admin: Sb, userId: string, full = false, today = "") {
  const { data: conn, error: connErr } = await admin
    .from("garmin_connections")
    .select("api_key,last_sync_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (connErr) throw new Error(connErr.message);
  if (!conn?.api_key) throw new Error("Connect Garmin first — add your Personal API key on Profile.");

  try {
    const token = await obtainToken(conn.api_key);
    const startDate = full ? null : syncStartDate(conn.last_sync_at);
    const summaries = await listActivities(token, startDate);
    const index = await loadCrossSourceIndex(sb, userId);
    let added = 0;
    let updated = 0;
    let replacedDup = 0;
    let total = 0;
    let detailed = 0;
    let detailBudget = DETAIL_FETCH_BUDGET;

    // Prefer fetching full detail for new activities first (richer raw), then fill from list summaries.
    const ordered = [...summaries].sort((a, b) => {
      const rowA = mapGarminToRow(userId, a, a, null);
      const rowB = mapGarminToRow(userId, b, b, null);
      const knownA = rowA ? index.exact.has(`${rowA.activity_type}|${rowA.started_at}`) : true;
      const knownB = rowB ? index.exact.has(`${rowB.activity_type}|${rowB.started_at}`) : true;
      if (knownA === knownB) return 0;
      return knownA ? 1 : -1;
    });

    for (const summary of ordered) {
      const id = activityIdOf(summary);
      if (!id) continue;

      const preview = mapGarminToRow(userId, summary, summary, null);
      if (!preview) continue;
      const key = `${preview.activity_type}|${preview.started_at}`;
      const existed = index.exact.has(key);
      const cat = categorize(preview.activity_type) || categorize(String(preview.title || ""));
      const stravaTwin = !existed
        ? findStravaTwin(index, cat, preview.started_at, preview.distance)
        : null;

      // Never rewrite a saved activity from the short list summary. That would drop
      // detail, splits and heart-rate fields already stored on the row.
      if (existed) {
        total += 1;
        continue;
      }

      let detail: Record<string, unknown> = summary;
      let workouts: unknown = null;
      // List summaries are enough for the app UI. Only spend rate-limit budget on new items.
      // A full history pass skips detail calls so shoe matching still has room under Garmin's rate limit.
      if (!full && detailBudget > 0) {
        try {
          detail = await garminGet(token, `/activity-service/activity/${id}`) as Record<string, unknown>;
          detailBudget -= 1;
          detailed += 1;
        } catch (err) {
          if (isRateLimitError(err)) throw err;
          detail = summary;
        }
        if (detailBudget > 0) {
          try {
            workouts = await garminGet(token, `/activity-service/activity/${id}/workouts`);
            detailBudget -= 1;
          } catch (err) {
            if (isRateLimitError(err)) throw err;
            workouts = null;
          }
        }
      }

      const row = mapGarminToRow(userId, summary, detail, workouts);
      if (!row) continue;
      if (stravaTwin) {
        const stravaId = Number(stravaTwin.raw.stravaActivityId);
        if (Number.isFinite(stravaId) && stravaId > 0) {
          (row.raw as Record<string, unknown>).stravaActivityId = stravaId;
        }
        await deleteActivityRow(sb, userId, stravaTwin.activity_type, stravaTwin.started_at);
        removeFromIndex(index, stravaTwin);
        replacedDup += 1;
      }
      const { error } = await sb.from("activities").upsert(row, {
        onConflict: "user_id,activity_type,started_at",
      });
      if (error) throw new Error(error.message);
      rememberIndexRow(index, {
        activity_type: row.activity_type,
        started_at: row.started_at,
        distance: row.distance,
        source: "garmin-api",
        raw: row.raw as Record<string, unknown>,
      });
      added += 1;
      total += 1;
    }

    const context = await syncTrainingContext(sb, userId, token, today);
    let splitsAdded = context.splits;
    let gearAssigned = 0;
    let gearCreated = 0;
    let gearNote = context.note;
    try {
      const gear = await matchGarminGear(sb, userId, token, summaries);
      gearAssigned = gear.assigned;
      gearCreated = gear.created;
      gearNote = gear.note ? ` ${gear.note}` : "";
    } catch (err) {
      if (isRateLimitError(err)) {
        gearNote += " Gear matching paused — Garmin rate limit. Sync again in a minute.";
      } else {
        const message = err instanceof Error ? err.message : "Gear matching failed";
        gearNote += ` Gear matching skipped: ${message}`;
      }
    }

    const now = new Date().toISOString();
    const kept = Math.max(0, total - added);
    const splitNote = splitsAdded ? ` ${splitsAdded} run${splitsAdded === 1 ? "" : "s"} gained km splits.` : "";
    const dupNote = replacedDup ? ` Replaced ${replacedDup} Strava duplicate${replacedDup === 1 ? "" : "s"} with Garmin.` : "";
    const status = full
      ? `Full history: ${added} added, ${kept} already saved.${splitNote}${dupNote}${gearNote}`
      : `Synced ${added} new, ${updated} updated (${total} total${detailed ? `, ${detailed} with full detail` : ""}).${splitNote}${dupNote}${gearNote}`;
    await admin.from("garmin_connections").update({
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
      replacedDup,
      total,
      detailed,
      gearAssigned,
      gearCreated,
      splitsAdded,
      metrics: context.metrics,
      wellness: context.wellness,
      full,
      lastSyncAt: now,
      lastSyncStatus: status,
      lastError: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    const now = new Date().toISOString();
    await admin.from("garmin_connections").update({
      last_sync_status: "error",
      last_error: message,
      updated_at: now,
    }).eq("user_id", userId);
    throw err;
  }
}

type CrossSourceRow = {
  activity_type: string;
  started_at: string;
  distance: number | null;
  source: string;
  raw: Record<string, unknown>;
};

type CrossSourceIndex = {
  exact: Set<string>;
  rows: CrossSourceRow[];
};

async function loadCrossSourceIndex(sb: Sb, userId: string): Promise<CrossSourceIndex> {
  const { data, error } = await sb
    .from("activities")
    .select("activity_type,started_at,distance,raw")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const exact = new Set<string>();
  const rows: CrossSourceRow[] = [];
  for (const row of data || []) {
    const started = formatStarted(row.started_at);
    const raw = row.raw && typeof row.raw === "object" ? row.raw as Record<string, unknown> : {};
    const item: CrossSourceRow = {
      activity_type: String(row.activity_type || ""),
      started_at: started,
      distance: row.distance == null ? null : Number(row.distance),
      source: String(raw.Source || ""),
      raw,
    };
    exact.add(`${item.activity_type}|${item.started_at}`);
    rows.push(item);
  }
  return { exact, rows };
}

function rememberIndexRow(index: CrossSourceIndex, row: CrossSourceRow) {
  index.exact.add(`${row.activity_type}|${row.started_at}`);
  index.rows.push(row);
}

function removeFromIndex(index: CrossSourceIndex, row: CrossSourceRow) {
  index.exact.delete(`${row.activity_type}|${row.started_at}`);
  index.rows = index.rows.filter((item) =>
    !(item.activity_type === row.activity_type && item.started_at === row.started_at)
  );
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

function findStravaTwin(
  index: CrossSourceIndex,
  cat: string | null,
  startedAt: string,
  distance: number | null,
): CrossSourceRow | null {
  if (!cat) return null;
  const want = startedMs(startedAt);
  if (!Number.isFinite(want)) return null;
  let best: CrossSourceRow | null = null;
  let bestDelta = Infinity;
  for (const row of index.rows) {
    if (row.source !== "strava-api") continue;
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

async function deleteActivityRow(sb: Sb, userId: string, activityType: string, startedAt: string) {
  // Keep activity_gear / feedback keyed by started_at — Garmin twin reuses the same timestamp.
  const { error } = await sb.from("activities")
    .delete()
    .eq("user_id", userId)
    .eq("activity_type", activityType)
    .eq("started_at", startedAt);
  if (error) throw new Error(error.message);
}

function syncStartDate(lastSyncAt: string | null): string {
  if (lastSyncAt) {
    const d = new Date(lastSyncAt);
    d.setUTCDate(d.getUTCDate() - 3);
    return d.toISOString().slice(0, 10);
  }
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - FIRST_SYNC_DAYS);
  return d.toISOString().slice(0, 10);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetrySeconds(body: string, fallback = 15) {
  try {
    const parsed = JSON.parse(body);
    const n = Number(parsed?.retryInSeconds);
    if (Number.isFinite(n) && n > 0) return Math.min(Math.ceil(n) + 1, 60);
  } catch {}
  return fallback;
}

function isRateLimitError(err: unknown) {
  return err instanceof Error && /\(429\)/.test(err.message);
}

async function obtainToken(apiKey: string): Promise<string> {
  let lastErr = "Garmin token failed";
  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
    const res = await fetch(`${GARMIN_BASE}${TOKEN_PATH}`, {
      method: "POST",
      headers: {
        Accept: "*/*",
        Authorization: `ApiKey ${apiKey}`,
      },
    });
    const text = (await res.text()).trim();
    if (res.ok) {
      if (!text || text.split(".").length < 2) {
        throw new Error("Garmin did not return an access token. Check your Personal API key.");
      }
      return text;
    }
    lastErr = garminError("token", res.status, text);
    if (res.status !== 429 || attempt === MAX_429_RETRIES) break;
    await sleep(parseRetrySeconds(text) * 1000);
  }
  throw new Error(lastErr);
}

async function listActivities(token: string, startDate: string | null) {
  const out: Record<string, unknown>[] = [];
  let start = 0;
  const cap = startDate ? 5000 : 8000;
  for (;;) {
    const params = new URLSearchParams({
      start: String(start),
      limit: String(PAGE_SIZE),
    });
    if (startDate) params.set("startDate", startDate);
    const page = await garminGet(
      token,
      `/activitylist-service/activities/search/activities?${params}`,
    );
    const list = Array.isArray(page) ? page : [];
    if (!list.length) break;
    for (const item of list) {
      if (item && typeof item === "object") out.push(item as Record<string, unknown>);
    }
    if (list.length < PAGE_SIZE) break;
    start += PAGE_SIZE;
    if (start >= cap) break;
  }
  return out;
}

async function garminGet(token: string, path: string): Promise<unknown> {
  const url = path.startsWith("http") ? path : `${GARMIN_BASE}${path}`;
  let lastErr = `Garmin ${path} failed`;
  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    if (res.status === 204) return null;
    const text = await res.text();
    if (res.ok) {
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }
    lastErr = garminError(path, res.status, text);
    if (res.status !== 429 || attempt === MAX_429_RETRIES) break;
    await sleep(parseRetrySeconds(text) * 1000);
  }
  throw new Error(lastErr);
}

function garminError(where: string, status: number, body: string) {
  const snippet = String(body || "").replace(/\s+/g, " ").slice(0, 180);
  if (status === 401 || status === 403) {
    return "Garmin rejected the key or token. Create a new Personal API key and save it again.";
  }
  if (status === 429) {
    const wait = parseRetrySeconds(body);
    return `Garmin rate limit hit — wait about ${wait}s then Sync again. (${snippet || "429"})`;
  }
  return `Garmin ${where} failed (${status})${snippet ? `: ${snippet}` : ""}`;
}

function activityIdOf(obj: Record<string, unknown> | null | undefined): string | null {
  if (!obj) return null;
  const id = obj.activityId ?? obj.activityIdDTO ?? dig(obj, ["metadataDTO", "activityId"]);
  if (id == null || id === "") return null;
  return String(id);
}

function dig(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function pick(...vals: unknown[]) {
  for (const v of vals) {
    if (v == null || v === "" || v === "--") continue;
    return v;
  }
  return null;
}

function categorize(type: string) {
  const t = String(type || "").toLowerCase();
  if (t.includes("run") || t.includes("track") || t.includes("trail") || t.includes("treadmill")) return "run";
  if (t.includes("swim") || t.includes("lap_swimming") || t.includes("open_water")) return "swim";
  // E-bike before bike: "ebike" / "e_bike" also match the generic "bik" check.
  if (/e[\s_-]*bike|electric[\s_-]*bike|ebiking/.test(t)) return "ebike";
  if (t.includes("cycl") || t.includes("bik") || t.includes("ride") || t.includes("virtual_ride")) return "bike";
  if (t.includes("walk") || t.includes("hik")) return "walk";
  return null;
}

function formatStarted(value: unknown) {
  if (!value) return "";
  return String(value).replace("T", " ").slice(0, 19);
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
  if (secPerUnit == null || !Number.isFinite(secPerUnit) || secPerUnit <= 0 || secPerUnit > 3600 * 2) return null;
  const total = Math.round(secPerUnit);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function typeLabel(summary: Record<string, unknown>, detail: Record<string, unknown>) {
  const typeObj = pick(
    summary.activityType,
    detail.activityType,
    detail.activityTypeDTO,
    dig(detail, ["activityTypeDTO"]),
  ) as Record<string, unknown> | string | null;
  if (typeof typeObj === "string") return typeObj;
  if (typeObj && typeof typeObj === "object") {
    return String(
      pick(typeObj.typeKey, typeObj.typeId, typeObj.key, typeObj.display) || "",
    );
  }
  return String(pick(summary.activityTypeKey, detail.activityTypeKey) || "");
}

function displayTypeName(typeKey: string, summary: Record<string, unknown>, detail: Record<string, unknown>) {
  const typeObj = pick(summary.activityType, detail.activityType, detail.activityTypeDTO) as Record<string, unknown> | null;
  const pretty = typeObj && typeof typeObj === "object"
    ? pick(typeObj.typeKey, typeObj.display)
    : null;
  const raw = String(pretty || typeKey || "Activity");
  return raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function mapGarminToRow(
  userId: string,
  summary: Record<string, unknown>,
  detail: Record<string, unknown>,
  workouts: unknown,
) {
  const summaryDto = (dig(detail, ["summaryDTO"]) || dig(detail, ["summary"]) || {}) as Record<string, unknown>;
  const typeKey = typeLabel(summary, detail);
  const cat = categorize(typeKey) || categorize(String(pick(summary.activityName, detail.activityName) || ""));
  if (!cat) return null;

  const startedRaw = pick(
    summary.startTimeLocal,
    detail.startTimeLocal,
    summaryDto.startTimeLocal,
    summary.startTimeGMT,
    detail.startTimeGMT,
    summaryDto.startTimeGMT,
  );
  const started = formatStarted(startedRaw);
  if (!started) return null;

  const meters = Number(pick(
    summary.distance,
    detail.distance,
    summaryDto.distance,
  ));
  let distance: number | null = null;
  if (Number.isFinite(meters)) {
    distance = cat === "swim" ? meters : meters / 1000;
  }

  const durationSec = pick(
    summary.duration,
    detail.duration,
    summaryDto.duration,
    summary.elapsedDuration,
    summaryDto.elapsedDuration,
  );
  const duration = formatDuration(durationSec);

  const avgHr = Number(pick(summary.averageHR, detail.averageHR, summaryDto.averageHR));
  const maxHr = Number(pick(summary.maxHR, detail.maxHR, summaryDto.maxHR));

  const avgSpeed = Number(pick(
    summary.averageSpeed,
    detail.averageSpeed,
    summaryDto.averageSpeed,
  ));
  let avgPace: string | null = null;
  const paceFromApi = pick(summary.averagePace, detail.averagePace, summaryDto.averagePace);
  if (paceFromApi != null && typeof paceFromApi === "string" && paceFromApi.includes(":")) {
    avgPace = paceFromApi;
  } else if (Number.isFinite(avgSpeed) && avgSpeed > 0) {
    if (cat === "run" || cat === "walk") avgPace = formatPace(1000 / avgSpeed);
    else if (cat === "swim") avgPace = formatPace(100 / avgSpeed);
    else if (cat === "bike" || cat === "ebike") {
      const kmh = avgSpeed * 3.6;
      avgPace = Number.isFinite(kmh) ? kmh.toFixed(1) : null;
    }
  } else if (Number.isFinite(Number(paceFromApi)) && Number(paceFromApi) > 0) {
    // Some payloads give pace as minutes (float).
    const mins = Number(paceFromApi);
    if (mins < 60) avgPace = formatPace(mins * 60);
  }

  const title = String(pick(summary.activityName, detail.activityName, summaryDto.activityName) || displayTypeName(typeKey, summary, detail));
  const activityType = displayTypeName(typeKey, summary, detail);
  const id = activityIdOf(summary) || activityIdOf(detail);

  const moving = formatDuration(pick(summary.movingDuration, summaryDto.movingDuration, detail.movingDuration));
  const calories = pick(summary.calories, summaryDto.calories, detail.calories);
  const ascent = pick(summary.elevationGain, summaryDto.elevationGain, detail.elevationGain);
  const steps = pick(summary.steps, summaryDto.steps, detail.steps);
  const cadence = pick(summary.averageRunningCadenceInStepsPerMinute, summaryDto.averageRunningCadenceInStepsPerMinute);
  const aerobic = pick(summary.aerobicTrainingEffect, summaryDto.aerobicTrainingEffect);
  const strokeCount = pick(summary.strokes, summaryDto.strokes);
  const avgPower = pick(summary.avgPower, summaryDto.avgPower, detail.avgPower);

  const distDisplay = distance == null ? "" : String(cat === "swim" ? Math.round(distance) : Number(distance.toFixed(2)));
  const signals = activitySignals(summary, detail, summaryDto);

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
    Steps: steps != null ? String(steps) : "--",
    "Avg Run Cadence": cadence != null ? String(cadence) : "--",
    "Aerobic TE": aerobic != null ? String(aerobic) : "--",
    "TE Label": signals.teLabel || "--",
    "Anaerobic TE": signals.anaerobic != null ? String(signals.anaerobic) : "--",
    "Avg GAP": signals.gap || "--",
    "HR Zone Seconds": signals.zoneSeconds || "--",
    "Total Strokes": strokeCount != null ? String(strokeCount) : "--",
    "Avg Power": avgPower != null ? String(avgPower) : "--",
    Source: "garmin-api",
    garminActivityId: id,
    garminTypeKey: typeKey,
    garmin: detail,
    garminSummary: summary,
    garminWorkouts: workouts,
  };
  if (signals.splits.length) raw.splits = signals.splits;
  if (signals.work.length) raw.work = signals.work;

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

const GENERIC_GEAR_TOKENS = new Set([
  "shoe", "shoes", "bike", "bikes", "bicycle", "cycle", "cycling", "running", "run", "ride",
]);

type LocalGear = {
  id: string;
  type: string;
  name: string;
  retired: boolean;
  garmin_uuid: string | null;
};

type ActRef = {
  key: string;
  activityType: string;
  garminId: string | null;
};

function bareGearKey(value: string): string {
  return value.replace(/-/g, "").toLowerCase();
}

function sameGearKey(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const left = bareGearKey(a);
  const right = bareGearKey(b);
  return left.length >= 8 && left === right;
}

function garminGearKey(gear: Record<string, unknown>): string | null {
  const uuid = String(gear.uuid || "").trim();
  if (uuid) return uuid;
  const pk = gear.gearPk ?? gear.id;
  if (pk == null || pk === "") return null;
  return `gpk:${pk}`;
}

function gearRowId(key: string): string {
  if (key.startsWith("gpk:")) return key.slice(0, 40);
  const bare = bareGearKey(key);
  if (/^[0-9a-f]{16,}$/.test(bare)) return bare.slice(0, 40);
  return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function canonicalGearUuid(key: string): string {
  if (key.startsWith("gpk:")) return key.slice(0, 80);
  const bare = bareGearKey(key);
  return (bare || key).slice(0, 80);
}

function garminGearType(gear: Record<string, unknown>): string | null {
  let raw = gear.gearTypeName ?? gear.gearType ?? gear.typeName ?? "";
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    raw = obj.gearTypeName ?? obj.typeName ?? obj.name ?? "";
  }
  const name = String(raw || "").toLowerCase();
  if (!name) return null;
  if (name.includes("wetsuit") || name.includes("wet suit")) return "wetsuit";
  if (name.includes("swimsuit") || name.includes("swim suit") || name.includes("bathing")) return "swimsuit";
  if (name.includes("shoe") || name.includes("footwear")) return "shoes";
  if (name.includes("bike") || name.includes("cycle") || name.includes("bicycle")) return "bike";
  return null;
}

function garminNameAliases(gear: Record<string, unknown>): string[] {
  const make = String(gear.gearMakeName || gear.brand || "").trim();
  const model = String(gear.gearModelName || gear.model || "").trim();
  const vals = [
    gear.displayName,
    gear.customMakeModel,
    gear.name,
    [make, model].filter(Boolean).join(" "),
    model,
  ];
  const out: string[] = [];
  for (const value of vals) {
    const text = String(value || "").trim();
    if (!text || text === "--" || out.includes(text)) continue;
    out.push(text);
  }
  return out;
}

function garminRetired(gear: Record<string, unknown>): boolean {
  const status = String(gear.gearStatusName || "").toLowerCase();
  if (status.includes("retire")) return true;
  const end = gear.dateEnd;
  if (typeof end === "string" && end.trim()) return Number.isFinite(Date.parse(end));
  return false;
}

function normGearName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function distinctiveTokens(name: string): string[] {
  return name.split(" ").filter((token) => {
    if (!token || GENERIC_GEAR_TOKENS.has(token)) return false;
    if (/\d/.test(token)) return token.length >= 3;
    return token.length >= 5;
  });
}

function containmentScore(a: string, b: string): number {
  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  const tokens = distinctiveTokens(short);
  if (!tokens.length) return 0;
  const words = new Set(long.split(" "));
  if (!tokens.every((token) => words.has(token))) return 0;
  return 50 + Math.min(short.length, 40);
}

function nameScore(localName: string, aliases: string[]): number {
  const local = normGearName(localName);
  if (!local) return 0;
  let best = 0;
  for (const alias of aliases) {
    const other = normGearName(alias);
    if (!other) continue;
    if (local === other) return 100;
    const score = containmentScore(local, other);
    if (score > best) best = score;
  }
  return best;
}

function linkedToOtherGear(item: LocalGear, key: string): boolean {
  if (item.garmin_uuid && !sameGearKey(item.garmin_uuid, key)) return true;
  const id = bareGearKey(item.id);
  if (/^[0-9a-f]{32}$/.test(id) && !sameGearKey(item.id, key)) return true;
  if (item.id.startsWith("gpk:") && item.id !== key) return true;
  return false;
}

function findLocalGear(
  items: LocalGear[],
  type: string,
  key: string,
  aliases: string[],
): { gear: LocalGear | null; ambiguous: boolean } {
  const byUuid = items.find((item) => sameGearKey(item.id, key) || sameGearKey(item.garmin_uuid, key));
  if (byUuid) return { gear: byUuid, ambiguous: false };
  const scored = items
    .filter((item) => item.type === type && !linkedToOtherGear(item, key))
    .map((item) => ({ item, score: nameScore(item.name, aliases) }))
    .filter((row) => row.score >= 50)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return { gear: null, ambiguous: false };
  if (scored.length > 1 && scored[0].score === scored[1].score) return { gear: null, ambiguous: true };
  return { gear: scored[0].item, ambiguous: false };
}

function gearFitsActivity(type: string, activityType: string): boolean {
  const cat = categorize(activityType);
  if (type === "shoes") return cat === "run" || cat === "walk";
  if (type === "bike") return cat === "bike" || cat === "ebike";
  if (type === "swimsuit" || type === "wetsuit") return cat === "swim";
  return false;
}

function asRecordList(page: unknown): Record<string, unknown>[] {
  let arr: unknown[] | null = null;
  if (Array.isArray(page)) arr = page;
  else if (page && typeof page === "object") {
    const obj = page as Record<string, unknown>;
    for (const key of ["activities", "activityList", "gear", "gearDTOs", "items"]) {
      if (Array.isArray(obj[key])) {
        arr = obj[key] as unknown[];
        break;
      }
    }
  }
  if (!arr) return [];
  return arr.filter((item): item is Record<string, unknown> => !!item && typeof item === "object");
}

function activityKey(date: unknown, startedAt: unknown): string {
  const fromRaw = formatStarted(date);
  if (fromRaw && fromRaw.length >= 10 && fromRaw !== "--") return fromRaw;
  const fromStart = formatStarted(startedAt);
  return fromStart && fromStart.length >= 10 ? fromStart : "";
}

function gearNoteText(assigned: number, created: number, skipped: number): string {
  const bits: string[] = [];
  if (assigned) bits.push(`${assigned} activit${assigned === 1 ? "y" : "ies"} linked`);
  if (created) bits.push(`${created} added`);
  if (skipped) bits.push(`${skipped} skipped because the name matched more than one item`);
  if (!bits.length) return "";
  return `Gear: ${bits.join(", ")}.`;
}

function profileIdFromSummaries(summaries: Record<string, unknown>[]): string | null {
  for (const summary of summaries) {
    const id = pick(summary.ownerId, summary.userProfileId, summary.profileId);
    if (id == null) continue;
    const text = String(id).trim();
    if (text) return text;
  }
  return null;
}

async function garminGearCatalog(
  token: string,
  summaries: Record<string, unknown>[],
): Promise<{ items: Record<string, unknown>[]; unavailable: boolean }> {
  let missing = false;
  try {
    const v2 = await garminGet(token, "/gear-service/gear/v2/list?start=0&limit=100");
    const list = asRecordList(v2);
    if (list.length) return { items: list, unavailable: false };
  } catch (err) {
    if (isRateLimitError(err)) throw err;
    if (!(err instanceof Error && /\(404\)/.test(err.message))) throw err;
    missing = true;
  }

  const fromSummary = profileIdFromSummaries(summaries);
  if (fromSummary) {
    try {
      const page = await garminGet(
        token,
        `/gear-service/gear/filterGear?userProfilePk=${encodeURIComponent(fromSummary)}`,
      );
      return { items: asRecordList(page), unavailable: false };
    } catch (err) {
      if (isRateLimitError(err)) throw err;
      if (!(err instanceof Error && /\(404\)/.test(err.message))) throw err;
      missing = true;
    }
  }
  return { items: [], unavailable: missing };
}

async function listGearUses(token: string, key: string): Promise<Record<string, unknown>[]> {
  if (key.startsWith("gpk:")) return [];
  const keys = [...new Set([key, bareGearKey(key)].filter(Boolean))];
  let sawNotFound = false;
  for (const candidate of keys) {
    try {
      return await listGearUsesAt(token, candidate);
    } catch (err) {
      if (isRateLimitError(err)) throw err;
      if (err instanceof Error && /\(404\)/.test(err.message)) {
        sawNotFound = true;
        continue;
      }
      throw err;
    }
  }
  if (sawNotFound) return [];
  return [];
}

async function listGearUsesAt(token: string, key: string): Promise<Record<string, unknown>[]> {
  const encoded = encodeURIComponent(key);
  const paths = [
    (start: number) => `/activitylist-service/activities/${encoded}/gear?start=${start}&limit=1000`,
    (start: number) => `/gear-service/gear/${encoded}/activities?start=${start}&limit=1000`,
  ];
  let lastErr: Error | null = null;
  for (const path of paths) {
    try {
      const out: Record<string, unknown>[] = [];
      for (let start = 0; start < 3000; start += 1000) {
        const page = await garminGet(token, path(start));
        const list = asRecordList(page);
        out.push(...list);
        if (list.length < 1000) break;
      }
      return out;
    } catch (err) {
      if (isRateLimitError(err)) throw err;
      if (err instanceof Error && /\(404\)/.test(err.message)) {
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  if (lastErr) throw lastErr;
  return [];
}

async function loadLocalGear(sb: Sb, userId: string): Promise<{ items: LocalGear[]; hasUuid: boolean }> {
  const withUuid = await sb
    .from("gear")
    .select("id,type,name,retired,garmin_uuid")
    .eq("user_id", userId);
  if (!withUuid.error) {
    return { items: (withUuid.data || []).map(mapLocalGear), hasUuid: true };
  }
  const plain = await sb.from("gear").select("id,type,name,retired").eq("user_id", userId);
  if (plain.error) throw new Error(plain.error.message);
  return { items: (plain.data || []).map(mapLocalGear), hasUuid: false };
}

function mapLocalGear(row: Record<string, unknown>): LocalGear {
  return {
    id: String(row.id),
    type: String(row.type || ""),
    name: String(row.name || ""),
    retired: !!row.retired,
    garmin_uuid: row.garmin_uuid != null && row.garmin_uuid !== "" ? String(row.garmin_uuid) : null,
  };
}

function rowField(row: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] != null && row[key] !== "") return row[key];
  }
  return null;
}

function refFromActivityRow(row: Record<string, unknown>): ActRef {
  const raw = row.raw && typeof row.raw === "object" ? row.raw as Record<string, unknown> : null;
  const date = raw
    ? raw.Date
    : rowField(row, ["Date", "act_date", "raw->>Date", "raw->Date"]);
  const garminId = raw
    ? raw.garminActivityId
    : rowField(row, ["garminActivityId", "garmin_id", "raw->>garminActivityId", "raw->garminActivityId"]);
  return {
    key: activityKey(date, row.started_at),
    activityType: String(row.activity_type || ""),
    garminId: garminId != null && garminId !== "" ? String(garminId) : null,
  };
}

async function loadActivityIndex(sb: Sb, userId: string): Promise<ActRef[]> {
  const slim = await sb
    .from("activities")
    .select("started_at,activity_type,raw->>Date,raw->>garminActivityId")
    .eq("user_id", userId);
  if (!slim.error) {
    return (slim.data || []).map((row) => refFromActivityRow(row as Record<string, unknown>)).filter((row) => row.key);
  }
  const full = await sb.from("activities").select("started_at,activity_type,raw").eq("user_id", userId);
  if (full.error) throw new Error(full.error.message);
  return (full.data || []).map((row) => refFromActivityRow(row as Record<string, unknown>)).filter((row) => row.key);
}

function resolveGearActivity(
  item: Record<string, unknown>,
  byGarminId: Map<string, ActRef>,
  byKey: Map<string, ActRef[]>,
): ActRef | null {
  const id = activityIdOf(item);
  if (id && byGarminId.has(id)) return byGarminId.get(id) || null;
  const key = activityKey(pick(item.startTimeLocal, item.startTimeGMT), null);
  const hits = key ? byKey.get(key) : undefined;
  if (!hits?.length) return null;
  if (hits.length === 1) return hits[0];
  const typeKey = typeLabel(item, item);
  const wanted = displayTypeName(typeKey, item, item);
  const typed = hits.filter((hit) => hit.activityType === wanted);
  return typed.length === 1 ? typed[0] : null;
}

async function rememberGearUuid(sb: Sb, userId: string, gear: LocalGear, uuid: string) {
  if (gear.garmin_uuid && sameGearKey(gear.garmin_uuid, uuid)) return;
  const { error } = await sb.from("gear").update({ garmin_uuid: uuid }).eq("user_id", userId).eq("id", gear.id);
  if (!error) gear.garmin_uuid = uuid;
}

async function matchGarminGear(
  sb: Sb,
  userId: string,
  token: string,
  summaries: Record<string, unknown>[],
): Promise<{ assigned: number; created: number; note: string }> {
  const catalogResult = await garminGearCatalog(token, summaries);
  if (catalogResult.unavailable) {
    return {
      assigned: 0,
      created: 0,
      note: "Shoes were not linked: Garmin's Personal API does not return which shoe was used.",
    };
  }
  const catalog = catalogResult.items.slice(0, 40);
  const usable = catalog
    .map((item) => ({ item, type: garminGearType(item), key: garminGearKey(item) }))
    .filter((row): row is { item: Record<string, unknown>; type: string; key: string } => !!row.type && !!row.key);
  if (!usable.length) return { assigned: 0, created: 0, note: "" };

  const { items, hasUuid } = await loadLocalGear(sb, userId);
  const index = await loadActivityIndex(sb, userId);
  const byGarminId = new Map<string, ActRef>();
  const byKey = new Map<string, ActRef[]>();
  for (const ref of index) {
    if (ref.garminId && !byGarminId.has(ref.garminId)) byGarminId.set(ref.garminId, ref);
    const list = byKey.get(ref.key) || [];
    list.push(ref);
    byKey.set(ref.key, list);
  }
  const { data: existing, error: assignErr } = await sb
    .from("activity_gear")
    .select("activity")
    .eq("user_id", userId);
  if (assignErr) throw new Error(assignErr.message);
  const assignedKeys = new Set((existing || []).map((row) => String(row.activity)));

  let assigned = 0;
  let created = 0;
  let skipped = 0;

  for (const row of usable) {
    const aliases = garminNameAliases(row.item);
    const found = findLocalGear(items, row.type, row.key, aliases);
    if (found.ambiguous) {
      skipped += 1;
      continue;
    }
    let local = found.gear;
    const uuid = canonicalGearUuid(row.key);
    if (!local) {
      const name = (aliases[0] || "Gear").slice(0, 80);
      const insert: Record<string, unknown> = {
        id: gearRowId(row.key),
        user_id: userId,
        type: row.type,
        name,
        note: "From Garmin",
        retired: garminRetired(row.item),
      };
      if (hasUuid) insert.garmin_uuid = uuid;
      const columns = hasUuid ? "id,type,name,retired,garmin_uuid" : "id,type,name,retired";
      const { data, error } = await sb.from("gear").insert(insert).select(columns).maybeSingle();
      if (error || !data) {
        if (error) throw new Error(error.message);
        continue;
      }
      local = mapLocalGear(data as Record<string, unknown>);
      items.push(local);
      created += 1;
    } else if (hasUuid) {
      await rememberGearUuid(sb, userId, local, uuid);
    }
    if (!local) continue;
    const gearItem = local;

    const uses = await listGearUses(token, row.key);
    const keys: string[] = [];
    for (const use of uses) {
      const ref = resolveGearActivity(use, byGarminId, byKey);
      if (!ref || assignedKeys.has(ref.key)) continue;
      if (!gearFitsActivity(gearItem.type, ref.activityType)) continue;
      assignedKeys.add(ref.key);
      keys.push(ref.key);
    }
    for (let i = 0; i < keys.length; i += 200) {
      const chunk = keys.slice(i, i + 200).map((activity) => ({
        user_id: userId,
        activity,
        gear_id: gearItem.id,
      }));
      const { error } = await sb.from("activity_gear").upsert(chunk);
      if (error) throw new Error(error.message);
    }
    assigned += keys.length;
  }

  return { assigned, created, note: gearNoteText(assigned, created, skipped) };
}

function isoDay(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Date().toISOString().slice(0, 10);
}

function shiftDay(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function garminGetOptional(token: string, path: string): Promise<unknown> {
  try {
    return await garminGet(token, path);
  } catch (err) {
    if (isRateLimitError(err)) throw err;
    return null;
  }
}

async function garminGetBytes(token: string, path: string): Promise<Uint8Array | null> {
  const url = `${GARMIN_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/zip, application/x-zip-compressed, application/octet-stream",
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    if (res.status === 429) throw new Error(garminError(path, res.status, await res.text()));
    return null;
  }
  return new Uint8Array(await res.arrayBuffer());
}

function walkNumbers(node: unknown, into: Record<string, number>, depth = 0) {
  if (!node || typeof node !== "object" || depth > 6) return;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (typeof value === "number" && Number.isFinite(value)) into[key] = value;
    else if (value && typeof value === "object") walkNumbers(value, into, depth + 1);
  }
}

function firstNumber(bag: Record<string, number>, keys: string[]) {
  for (const key of keys) {
    const n = bag[key];
    if (n != null && Number.isFinite(n)) return n;
  }
  return null;
}

function collectDated(payload: unknown, into: Record<string, unknown>[] = [], depth = 0): Record<string, unknown>[] {
  if (!payload || typeof payload !== "object" || depth > 5) return into;
  if (Array.isArray(payload)) {
    payload.forEach((item) => collectDated(item, into, depth + 1));
    return into;
  }
  const row = payload as Record<string, unknown>;
  if (row.calendarDate) into.push(row);
  Object.values(row).forEach((value) => {
    if (value && typeof value === "object") collectDated(value, into, depth + 1);
  });
  return into;
}

function dayKey(row: Record<string, unknown>) {
  const value = pick(row.calendarDate, row.date, row.summaryDate);
  const text = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function nestedNumber(row: Record<string, unknown>, path: string[]) {
  let cur: unknown = row;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[key];
  }
  const n = Number(cur);
  return Number.isFinite(n) ? n : null;
}

function applySleepRow(slot: ReturnType<typeof emptyWellness> | null, row: Record<string, unknown>) {
  if (!slot) return;
  const score = sleepScoreOf(row);
  if (score != null) slot.sleep_score = score;
  const sec = Number(pick(
    row.sleepTimeSeconds,
    row.sleepTimeInSeconds,
    row.sleepDuration,
    row.durationInSeconds,
    dig(row, ["dailySleepDTO", "sleepTimeSeconds"]),
  ));
  if (Number.isFinite(sec) && sec > 60) slot.sleep_sec = Math.round(sec);
  const label = sleepLabelOf(row);
  if (label) slot.sleep_label = label;
}

function sleepScoreOf(row: Record<string, unknown>) {
  const direct = Number(pick(row.sleepScore, row.overallSleepScore, row.value));
  if (direct > 0 && direct <= 100) return Math.round(direct);
  const overall = nestedNumber(row, ["sleepScores", "overall", "value"])
    ?? nestedNumber(row, ["dailySleepDTO", "sleepScores", "overall", "value"]);
  if (overall != null && overall > 0 && overall <= 100) return Math.round(overall);
  return null;
}

function sleepLabelOf(row: Record<string, unknown>) {
  const direct = pick(row.sleepScoreQualifier, row.qualifierKey);
  if (typeof direct === "string" && direct) return direct;
  const nested = dig(row, ["sleepScores", "overall", "qualifierKey"]);
  return typeof nested === "string" ? nested : null;
}

function batteryLevels(row: Record<string, unknown>) {
  const series = pick(row.bodyBatteryValuesArray, row.bodyBatteryValues, row.values);
  const levels: number[] = [];
  if (Array.isArray(series)) {
    for (const item of series) {
      if (Array.isArray(item)) {
        const n = Number(item[1] ?? item[0]);
        if (n >= 0 && n <= 100) levels.push(n);
      } else if (item && typeof item === "object") {
        const n = Number(pick((item as Record<string, unknown>).level, (item as Record<string, unknown>).value));
        if (n >= 0 && n <= 100) levels.push(n);
      } else {
        const n = Number(item);
        if (n >= 0 && n <= 100) levels.push(n);
      }
    }
  }
  return levels;
}

function collectObjects(payload: unknown, into: Record<string, unknown>[] = [], depth = 0): Record<string, unknown>[] {
  if (!payload || typeof payload !== "object" || depth > 5) return into;
  if (Array.isArray(payload)) {
    payload.forEach((item) => collectObjects(item, into, depth + 1));
    return into;
  }
  const row = payload as Record<string, unknown>;
  into.push(row);
  Object.values(row).forEach((value) => {
    if (value && typeof value === "object") collectObjects(value, into, depth + 1);
  });
  return into;
}

function zoneFloors(payload: unknown) {
  const rows = collectObjects(payload);
  const ranked = rows.map((row) => {
    const sport = String(pick(row.sport, row.sportType, row.zoneType) || "").toLowerCase();
    return { row, sport };
  }).sort((a, b) => {
    const score = (sport: string) => sport.includes("run") ? 0 : sport.includes("default") || sport.includes("generic") ? 1 : 2;
    return score(a.sport) - score(b.sport);
  });
  for (const { row } of ranked) {
    const floors = [1, 2, 3, 4, 5].map((n) => {
      const named = Number(pick(row[`zone${n}Floor`], row[`zone${n}Low`], row[`zone${n}Minimum`]));
      return Number.isFinite(named) ? named : null;
    });
    if (floors.every((n) => n != null && n > 40)) return floors as number[];
    const nested = pick(row.zones, row.heartRateZones);
    if (Array.isArray(nested)) {
      const fromBands = nested.map((band) => {
        if (!band || typeof band !== "object") return null;
        const b = band as Record<string, unknown>;
        const n = Number(pick(b.zoneLowBoundary, b.start, b.minimum, b.floor));
        return Number.isFinite(n) ? n : null;
      }).filter((n): n is number => n != null && n > 40);
      if (fromBands.length >= 4) return fromBands.slice(0, 5);
    }
  }
  return null;
}

function activitySignals(
  summary: Record<string, unknown>,
  detail: Record<string, unknown>,
  summaryDto: Record<string, unknown>,
) {
  const bag: Record<string, number> = {};
  walkNumbers(summary, bag);
  walkNumbers(summaryDto, bag);
  walkNumbers(detail, bag);
  const gapSpeed = firstNumber(bag, ["avgGradeAdjustedSpeed", "averageGradeAdjustedSpeed"]);
  const gap = gapSpeed != null && gapSpeed > 0.4 && gapSpeed < 8 ? formatPace(1000 / gapSpeed) : null;
  const anaerobic = firstNumber(bag, ["anaerobicTrainingEffect"]);
  const label = pick(
    summary.trainingEffectLabel,
    summaryDto.trainingEffectLabel,
    detail.trainingEffectLabel,
    dig(detail, ["summaryDTO", "trainingEffectLabel"]),
    summary.aerobicTrainingEffectMessage,
    summaryDto.aerobicTrainingEffectMessage,
  );
  const zoneRaw = pick(
    summary.hrTimeInZone,
    summaryDto.hrTimeInZone,
    detail.hrTimeInZone,
    dig(detail, ["summaryDTO", "hrTimeInZone"]),
  );
  let zoneSeconds: string | null = null;
  if (Array.isArray(zoneRaw)) {
    const secs = zoneRaw.map((n) => Math.round(Number(n))).filter((n) => Number.isFinite(n) && n >= 0);
    if (secs.length >= 3) zoneSeconds = secs.slice(0, 5).join(",");
  }
  const splits: { m: number; sec: number; hr?: number }[] = [];
  const work: { m: number; sec: number; hr?: number }[] = [];
  const laps = pick(detail.lapDTOs, summary.lapDTOs, dig(detail, ["lapDTOs"]));
  if (Array.isArray(laps)) {
    for (const lap of laps) {
      if (!lap || typeof lap !== "object") continue;
      const row = lap as Record<string, unknown>;
      const meters = Number(pick(row.distance, row.totalDistance));
      const sec = Number(pick(row.duration, row.movingDuration, row.elapsedDuration));
      const hr = Number(pick(row.averageHR, row.avgHR));
      if (!(meters >= 800 && meters <= 1600) || !(sec >= 120)) continue;
      const item: { m: number; sec: number; hr?: number } = { m: Math.round(meters), sec: Math.round(sec) };
      if (hr >= 40 && hr <= 230) item.hr = Math.round(hr);
      splits.push(item);
    }
  }
  return {
    gap,
    anaerobic: anaerobic != null ? Math.round(anaerobic * 10) / 10 : null,
    teLabel: label != null ? String(label) : null,
    zoneSeconds,
    splits: splits.length >= 3 ? splits.slice(0, 80) : [],
    work,
  };
}

function emptyWellness(day: string) {
  return {
    day,
    sleep_score: null as number | null,
    sleep_sec: null as number | null,
    sleep_label: null as string | null,
    battery_morning: null as number | null,
    battery_latest: null as number | null,
    stress_avg: null as number | null,
    hrv_night: null as number | null,
    hrv_week: null as number | null,
    hrv_status: null as string | null,
    hrv_low: null as number | null,
    hrv_high: null as number | null,
    resting_hr: null as number | null,
  };
}

async function syncTrainingContext(sb: Sb, userId: string, token: string, todayRaw: string) {
  const today = isoDay(todayRaw);
  const start = shiftDay(today, -13);
  const notes: string[] = [];
  let metrics: Record<string, unknown> | null = null;
  let wellness: ReturnType<typeof emptyWellness>[] = [];
  let splits = 0;
  try {
    metrics = await fetchMetrics(token, today);
    wellness = await fetchWellness(token, start, today);
    metrics = await enrichMetricsFromActivities(sb, userId, metrics, wellness);
    const saved = await storeTrainingContext(sb, userId, metrics, wellness);
    if (!saved) notes.push("Recovery is on this sync. Run the wellness migration to keep it on the account.");
    splits = await enrichRunSplits(sb, userId, token, start);
  } catch (err) {
    if (isRateLimitError(err)) notes.push("Heart rate, recovery and splits paused — Garmin rate limit. Sync again in a minute.");
    else notes.push("Recovery data skipped this sync.");
  }
  return {
    metrics,
    wellness,
    splits,
    note: notes.length ? ` ${notes.join(" ")}` : "",
  };
}

async function fetchMetrics(token: string, today: string) {
  const from = shiftDay(today, -20);
  const [settings, zones, fitness, maxmetLatest, maxmetRange, readiness] = await Promise.all([
    garminGetOptional(token, "/userprofile-service/userprofile/settings"),
    garminGetOptional(token, "/biometric-service/heartRateZones"),
    garminGetOptional(token, `/fitnessage-service/fitnessage/${today}`),
    garminGetOptional(token, `/metrics-service/metrics/maxmet/latest/${today}`),
    garminGetOptional(token, `/metrics-service/metrics/maxmet/daily/${from}/${today}`),
    garminGetOptional(token, `/metrics-service/metrics/trainingreadiness/${shiftDay(today, -6)}/${today}`),
  ]);
  // Fallbacks for Personal API path variants that differ by account/region.
  const zonesAlt = zones == null
    ? await garminGetOptional(token, "/biometric-service/heartRateZones/v2")
    : zones;
  const fitnessAlt = fitness == null
    ? await garminGetOptional(token, `/fitnessage-service/fitnessage/v2/${today}`)
    : fitness;
  const bag: Record<string, number> = {};
  walkNumbers(settings, bag);
  walkNumbers(fitnessAlt, bag);
  walkNumbers(maxmetLatest, bag);
  walkNumbers(maxmetRange, bag);
  const maxHr = firstNumber(bag, ["maxHeartRate", "maximumHeartRate", "maxHr", "userMaxHeartRate"]);
  const resting = firstNumber(bag, ["restingHeartRate", "restingHr", "userRestingHeartRate"]);
  const lthr = firstNumber(bag, ["lactateThresholdHeartRate", "lactateThresholdHR", "thresholdHeartRate"]);
  let ltSpeed = firstNumber(bag, ["lactateThresholdSpeed", "lactateThresholdSpeedMetersPerSecond", "thresholdSpeed"]);
  if (ltSpeed != null && ltSpeed > 150 && ltSpeed < 600) ltSpeed = 1000 / ltSpeed;
  else if (ltSpeed != null && ltSpeed > 8 && ltSpeed < 30) ltSpeed = 1000 / (ltSpeed * 60);
  let vo2 = firstNumber(bag, ["vo2MaxPreciseValue", "vo2MaxValue", "vo2Max", "vO2MaxValue", "runningVO2Max"]);
  if (vo2 == null) {
    const texts = JSON.stringify({ fitnessAlt, maxmetLatest, maxmetRange }).match(/"vo2[^"]*"\s*:\s*([0-9.]+)/i);
    if (texts) vo2 = Number(texts[1]);
  }
  const load = loadBalance(readiness);
  const floors = zoneFloors(zonesAlt);
  if (maxHr == null && resting == null && lthr == null && vo2 == null && !floors && !load) return null;
  return {
    max_hr: maxHr != null ? Math.round(maxHr) : null,
    resting_hr: resting != null ? Math.round(resting) : null,
    lthr: lthr != null ? Math.round(lthr) : null,
    lt_speed_mps: ltSpeed != null && ltSpeed > 1 && ltSpeed < 8 ? Math.round(ltSpeed * 1000) / 1000 : null,
    vo2_run: vo2 != null && vo2 >= 20 && vo2 <= 90 ? Math.round(vo2 * 10) / 10 : null,
    zones: floors,
    load,
  };
}

async function enrichMetricsFromActivities(
  sb: Sb,
  userId: string,
  metrics: Record<string, unknown> | null,
  wellness: ReturnType<typeof emptyWellness>[],
) {
  const next = { ...(metrics || {}) } as Record<string, unknown>;
  const latestRest = [...wellness].reverse().find((row) => row.resting_hr && row.resting_hr > 30);
  if ((next.resting_hr == null || next.resting_hr === "") && latestRest?.resting_hr) {
    next.resting_hr = latestRest.resting_hr;
  }
  if (next.vo2_run == null) {
    const { data } = await sb.from("activities")
      .select("raw")
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .limit(40);
    const bag: Record<string, number> = {};
    for (const row of data || []) {
      walkNumbers(row.raw, bag);
    }
    const vo2 = firstNumber(bag, ["vo2MaxPreciseValue", "vo2MaxValue", "vo2Max", "vO2MaxValue", "runningVO2Max"]);
    if (vo2 != null && vo2 >= 20 && vo2 <= 90) next.vo2_run = Math.round(vo2 * 10) / 10;
  }
  if (Object.keys(next).length === 0) return metrics;
  return next;
}

function loadBalance(payload: unknown) {
  const bag: Record<string, number> = {};
  walkNumbers(payload, bag);
  const low = firstNumber(bag, ["lowAerobic", "lowAerobicLoad", "trainingLoadLowAerobic"]);
  const high = firstNumber(bag, ["highAerobic", "highAerobicLoad", "trainingLoadHighAerobic"]);
  const anaerobic = firstNumber(bag, ["anaerobic", "anaerobicLoad", "trainingLoadAnaerobic"]);
  if (low == null && high == null && anaerobic == null) return null;
  return { low: low || 0, high: high || 0, anaerobic: anaerobic || 0 };
}

async function fetchWellness(token: string, start: string, end: string) {
  const [sleep, hrv, summaries, battery] = await Promise.all([
    garminGetOptional(token, `/sleep-service/sleep/dailySleepSummariesByDate?startDate=${start}&endDate=${end}`),
    garminGetOptional(token, `/hrv-service/hrv/daily/${start}/${end}`),
    garminGetOptional(token, `/usersummary-service/v2/dailysummaries?startDate=${start}&endDate=${end}`),
    garminGetOptional(token, `/wellness-service/wellness/bodyBattery/reports/daily?startDate=${start}&endDate=${end}`),
  ]);
  const byDay = new Map<string, ReturnType<typeof emptyWellness>>();
  const day = (key: string) => {
    if (!key) return null;
    let row = byDay.get(key);
    if (!row) {
      row = emptyWellness(key);
      byDay.set(key, row);
    }
    return row;
  };
  for (const row of collectDated(sleep)) {
    const slot = day(dayKey(row));
    if (!slot) continue;
    applySleepRow(slot, row);
  }
  // Some accounts only fill the single-day sleep endpoint.
  if (![...byDay.values()].some((row) => row.day === end && (row.sleep_score || row.sleep_sec))) {
    const tonight = await garminGetOptional(token, `/wellness-service/wellness/dailySleepData?date=${end}`);
    for (const row of collectDated(tonight)) {
      const slot = day(dayKey(row) || end);
      if (slot) applySleepRow(slot, row);
    }
  }
  for (const row of collectDated(hrv)) {
    const slot = day(dayKey(row));
    if (!slot) continue;
    const night = Number(pick(row.lastNightAvg, row.lastNight, row.value));
    const week = Number(row.weeklyAvg);
    if (Number.isFinite(night) && night > 5) slot.hrv_night = Math.round(night * 10) / 10;
    if (Number.isFinite(week) && week > 5) slot.hrv_week = Math.round(week * 10) / 10;
    if (row.status != null && String(row.status)) slot.hrv_status = String(row.status);
    const baseline = row.baseline && typeof row.baseline === "object" ? row.baseline as Record<string, unknown> : {};
    const low = Number(pick(baseline.balancedLow, row.baselineLowUpper, row.balancedLow));
    const high = Number(pick(baseline.balancedUpper, row.baselineBalancedUpper, row.balancedUpper));
    if (Number.isFinite(low) && low > 5) slot.hrv_low = low;
    if (Number.isFinite(high) && high > 5) slot.hrv_high = high;
  }
  for (const row of collectDated(summaries)) {
    const slot = day(dayKey(row));
    if (!slot) continue;
    const hr = row.heartRate && typeof row.heartRate === "object" ? row.heartRate as Record<string, unknown> : {};
    const stress = row.stress && typeof row.stress === "object" ? row.stress as Record<string, unknown> : {};
    const batt = row.bodyBattery && typeof row.bodyBattery === "object" ? row.bodyBattery as Record<string, unknown> : {};
    const resting = Number(pick(hr.restingValue, hr.restingHeartRate, row.restingHeartRate));
    const stressAvg = Number(pick(stress.avgLevel, stress.avgStressLevel, stress.averageStressLevel));
    const latest = Number(pick(batt.latestValue, batt.currentValue, batt.endOfDayValue));
    const charged = Number(pick(batt.chargedValue, batt.highestValue, batt.bodyBatteryHighestValue));
    if (Number.isFinite(resting) && resting > 30) slot.resting_hr = Math.round(resting);
    if (Number.isFinite(stressAvg) && stressAvg >= 0 && stressAvg <= 100) slot.stress_avg = Math.round(stressAvg);
    if (Number.isFinite(latest) && latest >= 0 && latest <= 100) slot.battery_latest = Math.round(latest);
    if (Number.isFinite(charged) && charged >= 0 && charged <= 100) slot.battery_morning = Math.round(charged);
  }
  for (const row of collectDated(battery)) {
    const slot = day(dayKey(row));
    if (!slot) continue;
    const levels = batteryLevels(row);
    if (levels.length) {
      slot.battery_morning = Math.round(levels[0]);
      slot.battery_latest = Math.round(levels[levels.length - 1]);
    }
  }
  return [...byDay.values()].filter((row) => row.day >= start && row.day <= end).sort((a, b) => a.day < b.day ? -1 : 1);
}

async function storeTrainingContext(sb: Sb, userId: string, metrics: Record<string, unknown> | null, wellness: ReturnType<typeof emptyWellness>[]) {
  let ok = true;
  if (metrics) {
    const { error } = await sb.from("training_metrics").upsert({
      user_id: userId,
      ...metrics,
      updated_at: new Date().toISOString(),
    });
    if (error) ok = false;
  }
  if (wellness.length) {
    const rows = wellness.map((row) => ({ user_id: userId, ...row }));
    const { error } = await sb.from("wellness_days").upsert(rows, { onConflict: "user_id,day" });
    if (error) ok = false;
  }
  return ok;
}

async function enrichRunSplits(sb: Sb, userId: string, token: string, since: string) {
  const { data, error } = await sb.from("activities")
    .select("activity_type,started_at,raw,distance")
    .eq("user_id", userId)
    .gte("started_at", since)
    .limit(60);
  if (error || !data) return 0;
  let added = 0;
  for (const row of data) {
    if (added >= 5) break;
    const raw = row.raw && typeof row.raw === "object" ? row.raw as Record<string, unknown> : {};
    if (Array.isArray(raw.splits) && raw.splits.length >= 3) continue;
    const type = String(row.activity_type || "").toLowerCase();
    if (!type.includes("run")) continue;
    const km = Number(row.distance);
    if (!(km >= 5)) continue;
    const id = raw.garminActivityId;
    if (id == null || id === "") continue;
    let bytes: Uint8Array | null = null;
    try {
      bytes = await garminGetBytes(token, `/download-service/files/activity/${id}`);
    } catch (err) {
      if (isRateLimitError(err)) break;
      continue;
    }
    if (!bytes) continue;
    const fit = await unzipFit(bytes);
    if (!fit) continue;
    const parsed = splitsFromFit(fit);
    if (!parsed.splits.length && !parsed.work.length) continue;
    const next = { ...raw };
    if (parsed.splits.length) next.splits = parsed.splits;
    if (parsed.work.length) next.work = parsed.work;
    const { error: updateErr } = await sb.from("activities").update({ raw: next })
      .eq("user_id", userId)
      .eq("activity_type", row.activity_type)
      .eq("started_at", row.started_at);
    if (!updateErr) added += 1;
  }
  return added;
}

// Minimal FIT reader for kilometre splits and work intervals.
// Inlined so dashboard single-file deploys do not need a sibling module.
const FIT_INVALID: Record<number, number> = { 1: 0xff, 2: 0xff, 4: 0xffffffff };

function fitReadUint(buf: Uint8Array, offset: number, size: number, little: boolean) {
  let n = 0;
  if (little) {
    for (let i = 0; i < size; i++) n += buf[offset + i] * (256 ** i);
  } else {
    for (let i = 0; i < size; i++) n = n * 256 + buf[offset + i];
  }
  return n;
}

function fitFieldNumber(buf: Uint8Array, offset: number, size: number, little: boolean) {
  if (size !== 1 && size !== 2 && size !== 4) return null;
  const n = fitReadUint(buf, offset, size, little);
  if (n === FIT_INVALID[size]) return null;
  return n;
}

type FitDef = {
  global: number;
  little: boolean;
  fields: { num: number; size: number; base: number }[];
  dev: number[];
};

function fitReadData(buf: Uint8Array, offset: number, def: FitDef) {
  const values: Record<number, number> = {};
  let i = offset;
  for (const field of def.fields) {
    if (i + field.size > buf.length) return { next: buf.length, value: { global: def.global, values } };
    const n = fitFieldNumber(buf, i, field.size, def.little);
    if (n != null) values[field.num] = n;
    i += field.size;
  }
  for (const size of def.dev) {
    i += size;
    if (i > buf.length) return { next: buf.length, value: { global: def.global, values } };
  }
  return { next: i, value: { global: def.global, values } };
}

function parseFit(bytes: Uint8Array) {
  if (!bytes || bytes.length < 12 || bytes[8] !== 0x2e) return [] as { global: number; values: Record<number, number> }[];
  const headerSize = bytes[0];
  const dataSize = fitReadUint(bytes, 4, 4, true);
  let i = headerSize;
  const end = Math.min(bytes.length, headerSize + dataSize);
  const defs = new Map<number, FitDef>();
  const messages: { global: number; values: Record<number, number> }[] = [];

  while (i < end) {
    const header = bytes[i];
    i += 1;
    if (header & 0x80) {
      const local = (header >> 5) & 0x03;
      const def = defs.get(local);
      if (!def) break;
      const msg = fitReadData(bytes, i, def);
      i = msg.next;
      messages.push(msg.value);
      continue;
    }
    const local = header & 0x0f;
    if (header & 0x40) {
      if (i + 5 > end) break;
      const little = bytes[i + 1] === 0;
      const global = fitReadUint(bytes, i + 2, 2, little);
      const n = bytes[i + 4];
      i += 5;
      const fields: FitDef["fields"] = [];
      for (let f = 0; f < n; f++) {
        if (i + 3 > end) return messages;
        fields.push({ num: bytes[i], size: bytes[i + 1], base: bytes[i + 2] });
        i += 3;
      }
      const dev: number[] = [];
      if (header & 0x20) {
        if (i >= end) break;
        const nd = bytes[i];
        i += 1;
        for (let f = 0; f < nd; f++) {
          if (i + 3 > end) return messages;
          dev.push(bytes[i + 1]);
          i += 3;
        }
      }
      defs.set(local, { global, little, fields, dev });
      continue;
    }
    const def = defs.get(local);
    if (!def) break;
    const msg = fitReadData(bytes, i, def);
    i = msg.next;
    messages.push(msg.value);
  }
  return messages;
}

function fitScaled(raw: number | null | undefined, scale: number) {
  if (raw == null || !Number.isFinite(raw)) return null;
  return raw / scale;
}

function fitPiece(m: number | null, sec: number | null, hr: number | null | undefined) {
  if (!(m != null && m >= 200) || !(sec != null && sec >= 30) || sec / (m / 1000) < 120 || sec / (m / 1000) > 1200) {
    return null as { m: number; sec: number; hr?: number } | null;
  }
  const row: { m: number; sec: number; hr?: number } = { m: Math.round(m), sec: Math.round(sec) };
  if (hr != null && hr >= 40 && hr <= 230) row.hr = Math.round(hr);
  return row;
}

function fitFromSplit(values: Record<number, number>) {
  const m = fitScaled(values[3], 100);
  let sec = fitScaled(values[2], 1000);
  const speed = fitScaled(values[4], 1000);
  if (!(sec != null && sec > 0) && speed != null && speed > 0 && m != null && m > 0) sec = m / speed;
  return fitPiece(m, sec, values[15]);
}

function fitFromLap(values: Record<number, number>) {
  const m = fitScaled(values[9], 100);
  let sec = fitScaled(values[8], 1000);
  const speed = fitScaled(values[13], 1000);
  if (!(sec != null && sec > 0) && speed != null && speed > 0 && m != null && m > 0) sec = m / speed;
  return fitPiece(m, sec, values[15]);
}

function fitKmFromRecords(records: Record<number, number>[]) {
  const samples: { m: number; t: number; hr: number | null }[] = [];
  for (const values of records) {
    const m = fitScaled(values[5], 100);
    const t = values[253];
    if (!(m != null && m >= 0) || !(t > 0)) continue;
    const hr = values[3];
    samples.push({ m, t, hr: hr >= 40 && hr <= 230 ? hr : null });
  }
  samples.sort((a, b) => a.m - b.m);
  if (samples.length < 8) return [] as { m: number; sec: number; hr?: number }[];
  const last = samples[samples.length - 1].m;
  const out: { m: number; sec: number; hr?: number }[] = [];
  for (let km = 1; km <= Math.floor(last / 1000) && out.length < 80; km++) {
    const lo = (km - 1) * 1000;
    const hi = km * 1000;
    let a: typeof samples[0] | null = null;
    let b: typeof samples[0] | null = null;
    const hrs: number[] = [];
    for (const s of samples) {
      if (s.m >= lo && !a) a = s;
      if (s.m >= hi && !b) b = s;
      if (s.m >= lo && s.m < hi && s.hr) hrs.push(s.hr);
    }
    if (!a || !b || b.t <= a.t) continue;
    const hr = hrs.length ? hrs.reduce((s, n) => s + n, 0) / hrs.length : null;
    const row = fitPiece(1000, b.t - a.t, hr);
    if (row) out.push(row);
  }
  return out.length >= 3 ? out : [];
}

function splitsFromFit(bytes: Uint8Array) {
  const messages = parseFit(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  const km: { m: number; sec: number; hr?: number }[] = [];
  const work: { m: number; sec: number; hr?: number }[] = [];
  const records: Record<number, number>[] = [];
  for (const msg of messages) {
    if (msg.global === 312) {
      const row = fitFromSplit(msg.values);
      if (!row) continue;
      const type = msg.values[0];
      if (type === 3 && row.m >= 400) work.push(row);
      else if (row.m >= 800 && row.m <= 1600) km.push(row);
    } else if (msg.global === 19) {
      if (msg.values[24] != null && msg.values[24] !== 2) continue;
      const row = fitFromLap(msg.values);
      if (row && row.m >= 800 && row.m <= 1600) km.push(row);
    } else if (msg.global === 20) {
      records.push(msg.values);
    }
  }
  const splits = km.length >= 3 ? km.slice(0, 80) : fitKmFromRecords(records);
  return {
    splits: splits.length >= 3 ? splits : [],
    work: work.length >= 2 ? work.slice(0, 40) : [],
  };
}

async function fitInflateRaw(slice: Uint8Array) {
  if (typeof DecompressionStream !== "function") return null;
  const stream = new DecompressionStream("deflate-raw");
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  const write = writer.write(slice).then(() => writer.close());
  const chunks: Uint8Array[] = [];
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    chunks.push(part.value);
  }
  await write;
  const size = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

async function unzipFit(bytes: Uint8Array) {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let i = 0;
  while (i + 30 < buf.length) {
    if (buf[i] !== 0x50 || buf[i + 1] !== 0x4b || buf[i + 2] !== 0x03 || buf[i + 3] !== 0x04) {
      i += 1;
      continue;
    }
    const method = buf[i + 8] + buf[i + 9] * 256;
    const compSize = fitReadUint(buf, i + 18, 4, true);
    const nameLen = buf[i + 26] + buf[i + 27] * 256;
    const extraLen = buf[i + 28] + buf[i + 29] * 256;
    const nameStart = i + 30;
    const dataStart = nameStart + nameLen + extraLen;
    const name = new TextDecoder().decode(buf.slice(nameStart, nameStart + nameLen));
    const slice = buf.slice(dataStart, dataStart + compSize);
    if (/\.fit$/i.test(name)) {
      if (method === 0) return slice;
      if (method === 8) return fitInflateRaw(slice);
    }
    i = dataStart + (Number.isFinite(compSize) ? compSize : 0);
    if (!(compSize > 0)) break;
  }
  return null;
}
