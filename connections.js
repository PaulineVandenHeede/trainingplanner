// Garmin / Strava connection status, sync, and /connections page (extracted from app.js).
async function invokeGarmin(body) {
  const payload = body && body.action === "sync" ? { ...body, today: ymd(today()) } : body;
  const { data, error } = await sb.functions.invoke("garmin-sync", { body: payload });
  if (error) {
    let msg = error.message || "Garmin request failed";
    try {
      const extra = error.context ? await error.context.json() : data;
      if (extra?.error) msg = extra.error;
    } catch {}
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

async function invokeStrava(body) {
  const { data, error } = await sb.functions.invoke("strava-sync", { body: body || {} });
  if (error) {
    let msg = error.message || "Strava request failed";
    try {
      const extra = error.context ? await error.context.json() : data;
      if (extra?.error) msg = extra.error;
    } catch {}
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

function stravaRedirectUri() {
  return `${location.origin}/connections`;
}

window.GARMIN_STATUS = GARMIN;
window.STRAVA_STATUS = STRAVA;

async function loadGarminStatus() {
  if (!CURRENT_USER_ID) {
    GARMIN = { connected: false, lastSyncAt: null, lastSyncStatus: null, lastError: null, loaded: true };
    window.GARMIN_STATUS = GARMIN;
    return GARMIN;
  }
  try {
    const data = await invokeGarmin({ action: "status" });
    GARMIN = {
      connected: !!data.connected,
      lastSyncAt: data.lastSyncAt || null,
      lastSyncStatus: data.lastSyncStatus || null,
      lastError: data.lastError || null,
      loaded: true,
    };
  } catch (err) {
    GARMIN = {
      connected: false,
      lastSyncAt: null,
      lastSyncStatus: null,
      lastError: err.message || "Could not load Garmin status",
      loaded: true,
    };
  }
  window.GARMIN_STATUS = GARMIN;
  return GARMIN;
}

async function loadStravaStatus() {
  if (!CURRENT_USER_ID) {
    STRAVA = {
      connected: false,
      shareWithCoach: false,
      lastSyncAt: null,
      lastSyncStatus: null,
      lastError: null,
      needsReconnectForZones: false,
      loaded: true,
    };
    window.STRAVA_STATUS = STRAVA;
    return STRAVA;
  }
  try {
    const data = await invokeStrava({ action: "status" });
    STRAVA = {
      connected: !!data.connected,
      shareWithCoach: !!data.shareWithCoach,
      lastSyncAt: data.lastSyncAt || null,
      lastSyncStatus: data.lastSyncStatus || null,
      lastError: data.lastError || null,
      needsReconnectForZones: !!data.needsReconnectForZones,
      loaded: true,
    };
  } catch (err) {
    STRAVA = {
      connected: false,
      shareWithCoach: false,
      lastSyncAt: null,
      lastSyncStatus: null,
      lastError: err.message || "Could not load Strava status",
      needsReconnectForZones: false,
      loaded: true,
    };
  }
  window.STRAVA_STATUS = STRAVA;
  return STRAVA;
}

function decodeStravaStateReturnTo(state) {
  try {
    if (!state || !state.includes(".")) return "";
    const body = state.split(".", 2)[0];
    const padded = body + "=".repeat((4 - (body.length % 4)) % 4);
    const payload = JSON.parse(atob(padded.replace(/-/g, "+").replace(/_/g, "/")));
    if (payload?.ret === "/setup" || payload?.ret === "setup") return "/setup";
    if (payload?.ret === "/connections" || payload?.ret === "connections") return "/connections";
  } catch { /* ignore */ }
  return "";
}

function readStravaReturnTo(state = "") {
  const fromState = decodeStravaStateReturnTo(state);
  if (fromState) return fromState;
  try {
    const explicit = sessionStorage.getItem("strava-return-to") || localStorage.getItem("strava-return-to");
    if (explicit === "/setup" || explicit === "/connections") return explicit;
    if (sessionStorage.getItem("setup-after-strava") === "1") return "/setup";
  } catch { /* ignore */ }
  return "/connections";
}

function clearStravaReturnFlags() {
  try {
    sessionStorage.removeItem("strava-return-to");
    localStorage.removeItem("strava-return-to");
    sessionStorage.removeItem("setup-after-strava");
    sessionStorage.removeItem("strava-oauth-callback");
  } catch { /* ignore */ }
}

function takeStravaOauthCallback() {
  // Prefer the early stash from auth.js (params stripped before Supabase can eat them).
  try {
    const raw = sessionStorage.getItem("strava-oauth-callback");
    if (raw) {
      sessionStorage.removeItem("strava-oauth-callback");
      const parsed = JSON.parse(raw);
      if (parsed && (parsed.code || parsed.error)) return parsed;
    }
  } catch { /* ignore */ }
  const params = new URLSearchParams(location.search);
  const code = params.get("code") || "";
  const state = params.get("state") || "";
  const error = params.get("error") || "";
  if (!code && !error) return null;
  return {
    code,
    state,
    error,
    error_description: params.get("error_description") || "",
  };
}

async function returnAfterStrava(returnTo) {
  clearStravaReturnFlags();
  document.getElementById("day-dialog")?.close();
  if (returnTo === "/setup") {
    try {
      sessionStorage.setItem("setup-pending-connect", "1");
      // Clear connect-done so onboarding shows step 1 again.
      localStorage.removeItem(`setup-connect-done:${CURRENT_USER_ID || "anon"}`);
    } catch { /* ignore */ }
    history.replaceState(null, "", "/setup");
    if (typeof window.renderSetupConnectStep === "function") window.renderSetupConnectStep();
    else if (typeof window.renderOnboarding === "function") window.renderOnboarding();
    return;
  }
  history.replaceState(null, "", "/connections");
  if (!APP_READY && typeof window.bootApp === "function") {
    await window.bootApp();
    return;
  }
  if (typeof window.go === "function") window.go("/connections", { replace: true });
  else render(true);
}

async function maybeHandleStravaCallback() {
  if (STRAVA_CALLBACK_HANDLED || !CURRENT_USER_ID) return false;
  const callback = takeStravaOauthCallback();
  if (!callback) return false;
  const code = callback.code || "";
  const state = callback.state || "";
  const oauthError = callback.error || "";
  if (!code && !oauthError) return false;
  STRAVA_CALLBACK_HANDLED = true;
  const returnTo = readStravaReturnTo(state);
  // Drop any leftover OAuth params from the address bar.
  const url = new URL(location.href);
  ["code", "state", "scope", "error", "error_description"].forEach((k) => url.searchParams.delete(k));
  history.replaceState(null, "", url.pathname + (url.searchParams.toString() ? `?${url.searchParams}` : ""));
  if (oauthError) {
    const detail = callback.error_description || "Strava authorization was cancelled.";
    let message = detail;
    try { message = decodeURIComponent(String(detail).replace(/\+/g, " ")); } catch { /* keep */ }
    toast(message, true);
    await returnAfterStrava(returnTo);
    return true;
  }
  try {
    await invokeStrava({
      action: "exchange",
      code,
      state,
      redirectUri: stravaRedirectUri(),
    });
    await loadStravaStatus();
    try {
      await performStravaSync();
      toast("Strava connected and synced.");
    } catch {
      toast("Strava connected.");
    }
    await returnAfterStrava(returnTo);
  } catch (err) {
    STRAVA.lastError = err.message || "Could not finish Strava connect";
    STRAVA.loaded = true;
    toast(STRAVA.lastError, true);
    await returnAfterStrava(returnTo);
  }
  return true;
}
window.maybeHandleStravaCallback = maybeHandleStravaCallback;

window.refreshSetupConnections = async function refreshSetupConnections() {
  await Promise.all([loadGarminStatus(), loadStravaStatus()]);
  try {
    ACTS = await loadActivities();
    window._setupActs = ACTS;
  } catch { /* keep whatever we have */ }
  return { garmin: GARMIN, strava: STRAVA };
};

window.syncConnectedSourcesForSetup = async function syncConnectedSourcesForSetup() {
  await Promise.all([
    GARMIN.loaded ? Promise.resolve() : loadGarminStatus(),
    STRAVA.loaded ? Promise.resolve() : loadStravaStatus(),
  ]);
  const jobs = [];
  if (GARMIN.connected && typeof window.setupGarminSync === "function") {
    jobs.push(window.setupGarminSync({ permission: true }).catch(() => null));
  }
  if (STRAVA.connected) {
    jobs.push(performStravaSync().catch(() => null));
  }
  if (jobs.length) await Promise.all(jobs);
  try {
    ACTS = await loadActivities();
    window._setupActs = ACTS;
  } catch { /* keep whatever we have */ }
  const setupForm = document.querySelector(".setup-form");
  if (setupForm && typeof window.fillWeeklyFromSynced === "function") {
    window.fillWeeklyFromSynced(setupForm, { force: true });
  }
  return ACTS;
};

window.openGarminKeyDialog = function openGarminKeyDialog({ fromSetup = false } = {}) {
  const dialog = document.getElementById("day-dialog");
  if (!dialog) return;
  dialog.innerHTML = `
    <div class="dialog-body">
      <header class="dialog-head">
        <div>
          <div class="eyebrow">Garmin Connect</div>
          <h2>Paste your API key</h2>
        </div>
        <button class="icon-button" type="button" data-action="close-dialog" aria-label="Close">✕</button>
      </header>
      <p class="muted">Create a Personal API key in Garmin Connect, then paste it here. We’ll ask before syncing activities.</p>
      <form class="garmin-form" data-from-setup="${fromSetup ? "1" : "0"}">
        <label>Personal API key
          <input type="password" name="apiKey" required autocomplete="off" spellcheck="false" placeholder="Paste key from Garmin Connect" />
        </label>
        <label class="own-risk-field">
          <input type="checkbox" name="sync_now" value="1" checked />
          <span>After connecting, sync my existing activities once.</span>
        </label>
        <p class="muted small-text">Key from <a href="https://connect.garmin.com/app/settings/personalApiToken" target="_blank" rel="noopener">Garmin Connect → Personal API</a> (shown once; treat it like a password).</p>
        <p class="form-error" role="alert"></p>
        <button class="button" type="submit">Save &amp; connect</button>
      </form>
    </div>`;
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
  dialog.querySelector("[name=apiKey]")?.focus();
};

window.openStravaPasscodeDialog = function openStravaPasscodeDialog({ fromSetup = false } = {}) {
  const dialog = document.getElementById("day-dialog");
  if (!dialog) return;
  dialog.innerHTML = `
    <div class="dialog-body">
      <header class="dialog-head">
        <div>
          <div class="eyebrow">Strava</div>
          <h2>Enter connect passcode</h2>
        </div>
        <button class="icon-button" type="button" data-action="close-dialog" aria-label="Close">✕</button>
      </header>
      <p class="muted">Enter the connect passcode from the app owner. You’ll then sign in on Strava to authorize.</p>
      <form class="strava-form" data-from-setup="${fromSetup ? "1" : "0"}">
        <label>Connect passcode
          <input type="password" name="passcode" required autocomplete="off" spellcheck="false" placeholder="Passcode from the app owner" />
        </label>
        <label class="own-risk-field">
          <input type="checkbox" name="shareWithCoach" />
          <span>Also send Strava session summaries (date, sport, distance, pace, heart rate) to the AI coach.</span>
        </label>
        <p class="form-error" role="alert"></p>
        <button class="button" type="submit">Continue to Strava</button>
      </form>
    </div>`;
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
  dialog.querySelector("[name=passcode]")?.focus();
};

window.startStravaConnect = async function startStravaConnect({ fromSetup = false, shareWithCoach = false, passcode = "" } = {}) {
  if (!passcode) throw new Error("Enter the connect passcode.");
  const returnTo = fromSetup ? "/setup" : "/connections";
  try {
    sessionStorage.setItem("strava-return-to", returnTo);
    localStorage.setItem("strava-return-to", returnTo);
    if (fromSetup) {
      sessionStorage.setItem("setup-after-strava", "1");
      sessionStorage.setItem("setup-pending-connect", "1");
      // Keep username draft across the Strava redirect.
      const draft = document.querySelector(".setup-identity-form [name=username]")?.value || "";
      if (draft) sessionStorage.setItem("setup-username-draft", draft);
    } else {
      sessionStorage.removeItem("setup-after-strava");
    }
  } catch { /* ignore */ }
  const data = await invokeStrava({
    action: "connect_url",
    passcode,
    redirectUri: stravaRedirectUri(),
    shareWithCoach,
    returnTo,
  });
  if (!data?.url) throw new Error("Could not start Strava connect.");
  location.href = data.url;
};

window.setupGarminSync = async function setupGarminSync({ permission = true } = {}) {
  if (!permission) throw new Error("Permission needed to sync existing activities.");
  if (!GARMIN.connected) {
    await loadGarminStatus();
    if (!GARMIN.connected) throw new Error("Connect Garmin first.");
  }
  const fullKey = `garmin-full-gear:${CURRENT_USER_ID || "anon"}`;
  const full = !localStorage.getItem(fullKey);
  const data = await invokeGarmin({ action: "sync", full });
  if (full) localStorage.setItem(fullKey, "1");
  GARMIN = {
    connected: true,
    lastSyncAt: data.lastSyncAt || new Date().toISOString(),
    lastSyncStatus: data.status || null,
    lastError: null,
    loaded: true,
  };
  window.GARMIN_STATUS = GARMIN;
  applyGarminContext(data);
  ACTS = await loadActivities();
  window._setupActs = ACTS;
  const n = data.inserted || 0;
  const msg = n
    ? `Synced ${n} activit${n === 1 ? "y" : "ies"} from Garmin.`
    : (data.total ? `Garmin sync complete — ${data.updated || 0} already known.` : "Garmin sync complete — nothing new in range.");
  toast(msg);
  const setupForm = document.querySelector(".setup-form");
  if (setupForm && typeof window.fillWeeklyFromSynced === "function") {
    window.fillWeeklyFromSynced(setupForm, { force: true });
  }
  if (typeof window.paintSetupConnect === "function" && document.getElementById("setup-connect-body")) {
    window.paintSetupConnect();
  }
  return data;
};

function garminLastSyncLabel() {
  if (!GARMIN.lastSyncAt) return null;
  const day = short(parseDate(String(GARMIN.lastSyncAt).slice(0, 10)));
  const time = String(GARMIN.lastSyncAt).includes("T") ? ` ${String(GARMIN.lastSyncAt).slice(11, 16)}` : "";
  return `${day}${time}`;
}

function garminStatusLine() {
  if (!GARMIN.loaded) return "Checking connection…";
  if (!GARMIN.connected) {
    if (GARMIN.lastError) return GARMIN.lastError;
    return "Not connected. Create a Personal API key on Garmin Connect, then paste it below.";
  }
  const when = garminLastSyncLabel();
  if (GARMIN.lastError) return `Last sync failed${when ? ` (${when})` : ""}: ${GARMIN.lastError}`;
  if (GARMIN.lastSyncStatus) return `${when ? `Last sync ${when} · ` : ""}${GARMIN.lastSyncStatus}`;
  return "Connected. Sync to pull sessions from Garmin Connect.";
}

function stravaLastSyncLabel() {
  if (!STRAVA.lastSyncAt) return null;
  const day = short(parseDate(String(STRAVA.lastSyncAt).slice(0, 10)));
  const time = String(STRAVA.lastSyncAt).includes("T") ? ` ${String(STRAVA.lastSyncAt).slice(11, 16)}` : "";
  return `${day}${time}`;
}

function stravaStatusLine() {
  if (!STRAVA.loaded) return "Checking connection…";
  if (!STRAVA.connected) {
    if (STRAVA.lastError) return STRAVA.lastError;
    return "Not connected. Ask for the connect passcode, then authorize Strava.";
  }
  const when = stravaLastSyncLabel();
  if (STRAVA.lastError) return `Last sync failed${when ? ` (${when})` : ""}: ${STRAVA.lastError}`;
  const zonesHint = STRAVA.needsReconnectForZones
    ? " Disconnect and connect again to allow heart-rate zones."
    : "";
  if (STRAVA.lastSyncStatus) {
    return `${when ? `Last sync ${when} · ` : ""}${STRAVA.lastSyncStatus}${zonesHint}`;
  }
  return `Connected. Sync to pull sessions from Strava.${zonesHint}`;
}

function navSyncLabel() {
  if (GARMIN.connected && STRAVA.connected) return "Sync Garmin and Strava";
  if (GARMIN.connected) return "Sync Garmin";
  if (STRAVA.connected) return "Sync Strava";
  return "Sync activities";
}

function updateNavSyncButton() {
  const btn = document.querySelector(".sync-btn");
  if (!btn) return;
  const label = navSyncLabel();
  btn.title = label;
  btn.setAttribute("aria-label", label);
}

async function performGarminSync() {
  const fullKey = `garmin-full-gear:${CURRENT_USER_ID || "anon"}`;
  const full = localStorage.getItem(fullKey) !== "done";
  const data = await invokeGarmin({ action: "sync", full });
  if (data?.full && !String(data.lastSyncStatus || "").includes("Gear matching paused")) {
    localStorage.setItem(fullKey, "done");
  }
  GARMIN = {
    connected: true,
    lastSyncAt: data.lastSyncAt || null,
    lastSyncStatus: data.lastSyncStatus || null,
    lastError: data.lastError || null,
    loaded: true,
  };
  window.GARMIN_STATUS = GARMIN;
  applyGarminContext(data);
  ACTS = await loadActivities();
  try { await loadWellness(); } catch {}
  try { GEAR = await loadGear(); } catch {}
  try { CHANGES = await loadChanges(); } catch {}
  const n = data.added || 0;
  const base = n
    ? `Synced ${n} new activit${n === 1 ? "y" : "ies"} from Garmin (${data.updated || 0} updated).`
    : (data.total ? `Garmin sync complete — ${data.updated || 0} already known.` : "Garmin sync complete — no activities in range.");
  const gearBits = [];
  if (data.gearAssigned) gearBits.push(`linked gear on ${data.gearAssigned}`);
  if (data.gearCreated) gearBits.push(`added ${data.gearCreated} from Garmin`);
  if (Array.isArray(data.wellness) && data.wellness.length) gearBits.push("recovery updated");
  if (data.metrics?.vo2_run) gearBits.push(`VO2 ${data.metrics.vo2_run}`);
  if (data.splitsAdded) gearBits.push(`${data.splitsAdded} run${data.splitsAdded === 1 ? "" : "s"} with splits`);
  return gearBits.length ? `${base} ${gearBits.join(", ")}.` : base;
}

async function performStravaSync() {
  // One-time deeper lookback after raising FIRST_SYNC_DAYS (90 → 365), so prior races land.
  const deepKey = `strava-deep-sync-365:${CURRENT_USER_ID || "anon"}`;
  const deep = localStorage.getItem(deepKey) !== "done";
  const data = await invokeStrava({ action: "sync", deep });
  if (data?.ok) localStorage.setItem(deepKey, "done");
  STRAVA = {
    connected: true,
    shareWithCoach: STRAVA.shareWithCoach,
    lastSyncAt: data.lastSyncAt || null,
    lastSyncStatus: data.lastSyncStatus || null,
    lastError: data.lastError || null,
    needsReconnectForZones: !!STRAVA.needsReconnectForZones,
    loaded: true,
  };
  window.STRAVA_STATUS = STRAVA;
  if (data?.metrics && typeof applyGarminContext === "function") {
    applyGarminContext({ metrics: data.metrics });
  }
  try { await loadStravaStatus(); } catch { /* keep sync payload */ }
  ACTS = await loadActivities();
  window._setupActs = ACTS;
  try { GEAR = await loadGear(); } catch {}
  try { if (typeof loadWellness === "function") await loadWellness(); } catch {}
  const setupForm = document.querySelector(".setup-form");
  if (setupForm && typeof window.fillWeeklyFromSynced === "function") {
    window.fillWeeklyFromSynced(setupForm, { force: true });
  }
  const n = data.added || 0;
  const bits = [];
  if (data.deep) bits.push("365-day lookback");
  if (data.skippedDup) bits.push(`skipped ${data.skippedDup} already on Garmin`);
  if (data.gearAssigned) bits.push(`linked gear on ${data.gearAssigned}`);
  if (data.gearCreated) bits.push(`added ${data.gearCreated} from Strava`);
  if (data.metrics?.zones) bits.push("HR zones updated");
  const base = n
    ? `Synced ${n} new activit${n === 1 ? "y" : "ies"} from Strava (${data.updated || 0} updated).`
    : (data.total || data.skippedDup
      ? `Strava sync complete — ${data.updated || 0} already known.`
      : "Strava sync complete — no activities in range.");
  return bits.length ? `${base} ${bits.join(", ")}.` : base;
}

function setSyncButtonsDisabled(disabled) {
  document.querySelectorAll(".sync-btn, [data-action=garmin-sync], [data-action=strava-sync]").forEach((el) => {
    el.disabled = disabled;
  });
}

async function runNavSync() {
  if (!GARMIN.loaded || !STRAVA.loaded) {
    await Promise.all([
      GARMIN.loaded ? Promise.resolve() : loadGarminStatus(),
      STRAVA.loaded ? Promise.resolve() : loadStravaStatus(),
    ]);
  }
  updateNavSyncButton();
  if (!GARMIN.connected && !STRAVA.connected) {
    toast("Connect Garmin or Strava on the Connections page.");
    go("/connections");
    return;
  }
  setSyncButtonsDisabled(true);
  const messages = [];
  const errors = [];
  try {
    if (GARMIN.connected) {
      try {
        messages.push(await performGarminSync());
      } catch (err) {
        GARMIN.lastError = err.message;
        errors.push(err.message || "Garmin sync failed.");
      }
    }
    if (STRAVA.connected) {
      try {
        messages.push(await performStravaSync());
      } catch (err) {
        STRAVA.lastError = err.message;
        errors.push(err.message || "Strava sync failed.");
      }
    }
    try {
      if (typeof window.refreshFitnessPaces === "function") await window.refreshFitnessPaces(ACTS);
    } catch { /* keep existing paces */ }
    render(true);
    if (messages.length) toast(messages.join(" "));
    if (errors.length) toast(errors.join(" "), true);
  } finally {
    setSyncButtonsDisabled(false);
    updateNavSyncButton();
  }
}

/** Once per app open: sync connected Garmin/Strava if they haven't synced today. */
window.AUTO_SYNC_TRIED = false;

function connectionNeedsTodaySync(status) {
  if (!status?.connected) return false;
  const last = status.lastSyncAt ? String(status.lastSyncAt).slice(0, 10) : "";
  return last !== ymd(today());
}

async function maybeAutoSyncConnections() {
  if (window.AUTO_SYNC_TRIED) return false;
  const route = typeof currentRoute === "function" ? currentRoute() : "";
  if (route === "setup" || route === "create-plan") return false;
  window.AUTO_SYNC_TRIED = true;

  if (!GARMIN.loaded || !STRAVA.loaded) {
    await Promise.all([
      GARMIN.loaded ? Promise.resolve() : loadGarminStatus(),
      STRAVA.loaded ? Promise.resolve() : loadStravaStatus(),
    ]);
  }
  const needGarmin = connectionNeedsTodaySync(GARMIN);
  const needStrava = connectionNeedsTodaySync(STRAVA);
  if (!needGarmin && !needStrava) return false;

  setSyncButtonsDisabled(true);
  if (typeof updateNavSyncButton === "function") updateNavSyncButton();
  const messages = [];
  try {
    if (needGarmin) {
      try {
        messages.push(await performGarminSync());
      } catch (err) {
        GARMIN.lastError = err?.message || "Garmin sync failed.";
      }
    }
    if (needStrava) {
      try {
        messages.push(await performStravaSync());
      } catch (err) {
        STRAVA.lastError = err?.message || "Strava sync failed.";
      }
    }
    try {
      if (typeof window.refreshFitnessPaces === "function") await window.refreshFitnessPaces(ACTS);
    } catch { /* keep existing paces */ }
    if (typeof render === "function") render(true);
    // Quiet unless something new came in.
    const news = messages.filter((m) => /Synced \d+ new/i.test(m));
    if (news.length && typeof toast === "function") toast(news.join(" "));
  } finally {
    setSyncButtonsDisabled(false);
    if (typeof updateNavSyncButton === "function") updateNavSyncButton();
  }
  return true;
}
window.maybeAutoSyncConnections = maybeAutoSyncConnections;

function syncIconSvg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 0 0-15.5-6.4"/><path d="M3 4.5v5h5"/><path d="M3 12a9 9 0 0 0 15.5 6.4"/><path d="M21 19.5v-5h-5"/></svg>`;
}

function renderGarminConnectionCard() {
  const connected = GARMIN.connected;
  return `
    <section class="card conn-card">
      <div class="card-head">
        <div>
          <div class="eyebrow">${tt("conn.device")}</div>
          <h2>Garmin Connect</h2>
          <p class="muted" style="margin:6px 0 0">${tt("conn.garminLead")}</p>
        </div>
        <span class="conn-label ${connected ? "on" : "off"}">${connected ? tt("common.connected") : tt("common.notConnected")}</span>
      </div>
      <p class="conn-meta ${GARMIN.lastError ? "warn" : ""}">${esc(garminStatusLine())}</p>
      ${connected ? `
        <div class="conn-actions">
          <button class="button" type="button" data-action="garmin-sync">${syncIconSvg()} ${tt("common.sync")}</button>
          <button class="button ghost" type="button" data-action="garmin-disconnect">${tt("common.disconnect")}</button>
        </div>
        <details class="garmin-key-replace">
          <summary class="muted small-text">${tt("conn.replaceKey")}</summary>
          <form class="garmin-form">
            <label>${tt("conn.newKey")}
              <input type="password" name="apiKey" required autocomplete="off" spellcheck="false" placeholder="${esc(tt("conn.keyPlaceholder"))}" />
            </label>
            <p class="form-error"></p>
            <button class="button small" type="submit">${tt("conn.saveKey")}</button>
          </form>
        </details>` : `
        <form class="garmin-form">
          <label>${tt("conn.apiKey")}
            <input type="password" name="apiKey" required autocomplete="off" spellcheck="false" placeholder="${esc(tt("conn.keyPlaceholder"))}" />
          </label>
          <p class="muted small-text">${tt("conn.garminKeyHelp").replace("Garmin Connect → Personal API", `<a href="https://connect.garmin.com/app/settings/personalApiToken" target="_blank" rel="noopener">Garmin Connect → Personal API</a>`)}</p>
          <p class="form-error"></p>
          <button class="button" type="submit">${tt("conn.saveConnect")}</button>
        </form>`}
    </section>`;
}

function renderStravaConnectionCard() {
  const connected = STRAVA.connected;
  return `
    <section class="card conn-card">
      <div class="card-head">
        <div>
          <div class="eyebrow">${tt("conn.service")}</div>
          <h2>Strava</h2>
          <p class="muted" style="margin:6px 0 0">${tt("conn.stravaLead")}</p>
        </div>
        <span class="conn-label ${connected ? "on" : "off"}">${connected ? tt("common.connected") : tt("common.notConnected")}</span>
      </div>
      <p class="conn-meta ${STRAVA.lastError ? "warn" : ""}">${esc(stravaStatusLine())}</p>
      ${connected ? `
        <label class="own-risk-field">
          <input type="checkbox" data-action="strava-share" ${STRAVA.shareWithCoach ? "checked" : ""} />
          <span>${tt("conn.stravaShare")}</span>
        </label>
        <div class="conn-actions">
          <button class="button" type="button" data-action="strava-sync">${syncIconSvg()} ${tt("common.sync")}</button>
          <button class="button ghost" type="button" data-action="strava-disconnect">${tt("common.disconnect")}</button>
        </div>` : `
        <form class="strava-form">
          <label>${tt("conn.passcode")}
            <input type="password" name="passcode" required autocomplete="off" spellcheck="false" placeholder="${esc(tt("conn.passcodePlaceholder"))}" />
          </label>
          <label class="own-risk-field">
            <input type="checkbox" name="shareWithCoach" />
            <span>${tt("conn.stravaShareAlso")}</span>
          </label>
          <p class="muted small-text">${tt("conn.stravaHelp")}</p>
          <p class="form-error"></p>
          <button class="strava-connect" type="submit">
            <img src="/assets/btn_strava_connect_with_orange.svg" width="237" height="48" alt="Connect with Strava" />
          </button>
        </form>`}
    </section>`;
}

function renderConnections() {
  return `
    <section class="hero compact">
      <div>
        <div class="eyebrow">${tt("conn.eyebrow")}</div>
        <h1>${tt("conn.title")}</h1>
        <p class="muted">${tt("conn.lead")}</p>
      </div>
    </section>
    ${renderGarminConnectionCard()}
    ${renderStravaConnectionCard()}
    <p class="footnote">${tt("conn.csvFootnote")}</p>`;
}
