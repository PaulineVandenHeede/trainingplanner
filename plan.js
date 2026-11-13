window.CURRENT_USER_ID = null;
window.CURRENT_PLAN = null;
window.PLAN_SKIPPED = false;
window.PLAN_START = null;
window.MARATHON_DATE = null;
window.PHASES = [];
window.WEEKS = [];
window.PACES = [];
window.ROADMAP_703 = [];

function tt(key, vars) {
  return typeof window.t === "function" ? window.t(key, vars) : key;
}

function skipKey(userId) {
  return `plan-skipped:${userId}`;
}
function storedSkip(userId) {
  if (!userId) return false;
  try {
    return localStorage.getItem(skipKey(userId)) === "1";
  } catch {
    return false;
  }
}
function hasSkipped(userId) {
  if (!userId) return false;
  if (storedSkip(userId)) return true;
  // In-memory only (e.g. private mode where localStorage writes fail).
  return !!(window.PLAN_SKIPPED && window.CURRENT_USER_ID === userId);
}
function markSkipped(userId) {
  window.PLAN_SKIPPED = true;
  if (!userId) return;
  try { localStorage.setItem(skipKey(userId), "1"); } catch { /* private mode */ }
}
function clearSkipped(userId) {
  window.PLAN_SKIPPED = false;
  if (!userId) return;
  try { localStorage.removeItem(skipKey(userId)); } catch { /* ignore */ }
}

function applyPlanRow(row) {
  const goalType = row?.goal_type
    || (/^general fitness$/i.test(String(row?.event_name || "")) ? "fitness"
      : /^start to run$/i.test(String(row?.event_name || "")) ? "fitness" : "race");
  const program = row?.program
    || (/^start to run$/i.test(String(row?.event_name || "")) ? "start_to_run" : "standard");
  const sources = Array.isArray(row?.sources) && row.sources.length
    ? row.sources
    : (typeof window.researchForSport === "function"
      ? window.researchForSport(row?.sport || "run", goalType, program)
      : []);
  window.CURRENT_PLAN = { ...row, goal_type: goalType, program, sources };
  window.PLAN_START = row.start_date;
  window.MARATHON_DATE = row.event_date;
  window.PHASES = row.phases || [];
  window.WEEKS = row.weeks || [];
  window.PACES = row.paces || [];
  window.ROADMAP_703 = row.roadmap || [];
  if (typeof window.syncPlanDates === "function") window.syncPlanDates();
}

function clearPlanRow() {
  const skipped = !!window.CURRENT_USER_ID && (storedSkip(window.CURRENT_USER_ID) || window.PLAN_SKIPPED);
  window.CURRENT_PLAN = null;
  // Preserve skip so remove/cancel stay on Home (ensurePlan must not reopen setup).
  window.PLAN_SKIPPED = skipped;
  window.PLAN_START = null;
  window.MARATHON_DATE = null;
  window.PHASES = [];
  window.WEEKS = [];
  window.PACES = [];
  window.ROADMAP_703 = [];
}
window.clearPlanRow = clearPlanRow;

async function removeCurrentPlan() {
  const userId = window.CURRENT_USER_ID;
  if (!userId) throw new Error("Sign in required");
  const { data, error } = await sb.from("plans").delete().eq("user_id", userId).select("user_id");
  if (error) throw error;
  if (!data?.length) {
    const { data: stillThere, error: checkErr } = await sb.from("plans").select("user_id").eq("user_id", userId).maybeSingle();
    if (checkErr) throw checkErr;
    if (stillThere) throw new Error("Could not remove the plan. Try signing out and back in.");
  }
  const { error: evErr } = await sb.from("events").delete().eq("user_id", userId).eq("race", true);
  if (evErr) throw evErr;
  // Without this, ensurePlan treats "no plan" as first-time setup and reopens onboarding.
  markSkipped(userId);
  clearPlanRow();
  showAppChrome();
  if (typeof window.go === "function") window.go("/home", { replace: true, force: true });
  else {
    history.replaceState(null, "", "/home" + location.search);
    if (typeof window.render === "function") window.render(true);
  }
}
window.removeCurrentPlan = removeCurrentPlan;

function setupFields(sport, preset) {
  const run = sport === "run" || sport === "walk" || sport === "triathlon"
    || sport === "duathlon" || sport === "aquathlon";
  const swim = sport === "swim" || sport === "triathlon" || sport === "aquathlon";
  const bike = sport === "bike" || sport === "ski" || sport === "triathlon" || sport === "duathlon";
  const run2 = sport === "duathlon";
  const custom = preset === "custom";
  return {
    run: run && custom,
    swim: swim && custom,
    bike: bike && custom,
    run2: run2 && custom,
  };
}

function connectDoneKey(id = window.CURRENT_USER_ID || "anon") {
  return `setup-connect-done:${id}`;
}

function markConnectStepDone() {
  try {
    localStorage.setItem(connectDoneKey(), "1");
    sessionStorage.removeItem("setup-pending-connect");
    const email = (window.CURRENT_USER_EMAIL || "").toLowerCase();
    if (email) localStorage.removeItem(`setup-pending-connect-email:${email}`);
  } catch { /* ignore */ }
}

function clearConnectStepDone() {
  try {
    localStorage.removeItem(connectDoneKey());
    sessionStorage.setItem("setup-pending-connect", "1");
  } catch { /* ignore */ }
}

function shouldShowConnectStep() {
  const userId = window.CURRENT_USER_ID;
  if (!userId) return false;
  // Returning users (password recovery on a new device, etc.) already finished this.
  if (window.CURRENT_PROFILE?.username || window.CURRENT_PLAN) {
    try { localStorage.setItem(connectDoneKey(userId), "1"); } catch { /* ignore */ }
    return false;
  }
  try {
    if (localStorage.getItem(connectDoneKey(userId)) === "1") return false;
  } catch { /* ignore */ }
  return true;
}

function prepareSetupShell({ path = "/setup", hideNav = true } = {}) {
  document.body.classList.add("onboarding");
  document.body.classList.remove("logged-out");
  const nextPath = path + location.search;
  if (location.pathname + location.search !== nextPath) {
    history.replaceState(null, "", nextPath);
  }
  const header = document.getElementById("app-header");
  if (header) header.hidden = false;
  document.querySelectorAll(".topbar [data-route], .import-btn, .sync-btn").forEach((el) => {
    el.hidden = hideNav;
  });
  const app = document.getElementById("app");
  if (app) {
    app.dataset.route = path.replace(/^\//, "") || "setup";
    app.hidden = false;
  }
  window.scrollTo(0, 0);
}

function renderSetupConnectStep() {
  prepareSetupShell();
  let username = window.CURRENT_PROFILE?.username || "";
  try {
    const draft = sessionStorage.getItem("setup-username-draft");
    if (!username && draft) username = draft;
    sessionStorage.removeItem("setup-username-draft");
  } catch { /* ignore */ }
  const guessed = typeof window.guessUnitsFromLocale === "function" ? window.guessUnitsFromLocale() : "metric";
  const units = window.CURRENT_PROFILE?.units === "imperial" || window.CURRENT_PROFILE?.units === "metric"
    ? window.CURRENT_PROFILE.units
    : guessed;
  const unitsRow = typeof window.unitsChoiceRow === "function"
    ? window.unitsChoiceRow(units)
    : `<input type="hidden" name="units" value="${escAttr(units)}" />`;
  document.getElementById("app").innerHTML = `
    <section class="auth-card setup-card setup-connect-step">
      <p class="setup-step-label">${tt("setup.step1")}</p>
      <div class="eyebrow">${tt("setup.welcome")}</div>
      <h1>${tt("setup.accountTitle")}</h1>
      <p class="muted">${tt("setup.accountLead")}</p>
      <form class="setup-identity-form" novalidate>
        <label>${tt("setup.name")}
          <input type="text" name="username" maxlength="40" autocomplete="name" spellcheck="false" value="${escAttr(username)}" placeholder="${escAttr(tt("setup.namePlaceholder"))}" required />
        </label>
        <fieldset class="units-field">
          <legend>${tt("setup.units")}</legend>
          ${unitsRow}
          <p class="setup-hint">${tt("setup.unitsHint")}</p>
        </fieldset>
        <p class="form-error username-error" role="alert"></p>
      </form>
      <section class="setup-connect" id="setup-connect">
        <p class="setup-connect-legend">${tt("setup.connectOptional")} <span class="muted">${tt("setup.optional")}</span></p>
        <div id="setup-connect-body"><p class="muted small-text">${tt("setup.checking")}</p></div>
      </section>
      <div class="setup-actions">
        <button class="button" type="button" data-action="setup-connect-continue">${tt("setup.continue")}</button>
      </div>
    </section>`;
  paintSetupConnect();
  if (typeof window.refreshSetupConnections === "function") {
    window.refreshSetupConnections()
      .then(() => paintSetupConnect())
      .catch(() => paintSetupConnect());
  }
}

async function finishSetupConnectStep() {
  const input = document.querySelector(".setup-identity-form [name=username]");
  const errorEl = document.querySelector(".setup-connect-step .username-error");
  const continueBtn = document.querySelector("[data-action=setup-connect-continue]");
  if (errorEl) errorEl.textContent = "";
  const raw = input?.value || "";
  const username = typeof window.normalizeUsername === "function"
    ? window.normalizeUsername(raw)
    : String(raw || "").trim().toLowerCase();
  const invalid = typeof window.usernameError === "function"
    ? window.usernameError(username)
    : (!username ? "Pick a username." : "");
  if (invalid) {
    if (errorEl) errorEl.textContent = invalid;
    input?.focus();
    return;
  }
  if (continueBtn) continueBtn.disabled = true;
  const unitsRaw = document.querySelector(".setup-identity-form [name=units]")?.value
    || (typeof window.guessUnitsFromLocale === "function" ? window.guessUnitsFromLocale() : "metric");
  try {
    if (typeof window.saveUnitsQuiet === "function") await window.saveUnitsQuiet(unitsRaw);
    if (typeof window.saveUsernameQuiet === "function") await window.saveUsernameQuiet(username);
  } catch (err) {
    if (errorEl) errorEl.textContent = err.message || "Could not save account details.";
    input?.focus();
    if (continueBtn) continueBtn.disabled = false;
    return;
  }
  markConnectStepDone();
  try { sessionStorage.setItem("setup-show-plan-step", "1"); } catch { /* ignore */ }
  renderSetupPlanForm();
  // Sync in the background — don't block step 2. Fill weekly volume when done.
  startSetupBackgroundSync();
}
window.finishSetupConnectStep = finishSetupConnectStep;

let SETUP_CONNECT_SYNCING = { garmin: false, strava: false };

function isSetupSyncing() {
  return !!(SETUP_CONNECT_SYNCING.garmin || SETUP_CONNECT_SYNCING.strava);
}

window.setSetupConnectSyncing = function setSetupConnectSyncing(partial = {}) {
  SETUP_CONNECT_SYNCING = {
    garmin: partial.garmin != null ? !!partial.garmin : !!SETUP_CONNECT_SYNCING.garmin,
    strava: partial.strava != null ? !!partial.strava : !!SETUP_CONNECT_SYNCING.strava,
  };
  if (document.getElementById("setup-connect-body")) paintSetupConnect();
  updateSetupWeeklySyncHint();
  return SETUP_CONNECT_SYNCING;
};

function updateSetupWeeklySyncHint() {
  const hint = document.getElementById("weekly-sync-status");
  if (!hint) return;
  if (isSetupSyncing()) {
    hint.hidden = false;
    hint.textContent = tt("setup.syncing");
    return;
  }
  // Keep an existing prefill message; only clear the temporary syncing state.
  if (hint.dataset.prefilled === "1" || hint.textContent.includes("Prefilling")) {
    hint.hidden = false;
    return;
  }
  hint.hidden = true;
  hint.textContent = "";
}

function startSetupBackgroundSync() {
  const g = window.GARMIN_STATUS || window.GARMIN || {};
  const s = window.STRAVA_STATUS || window.STRAVA || {};
  if (!(g.connected || s.connected) || typeof window.syncConnectedSourcesForSetup !== "function") {
    updateSetupWeeklySyncHint();
    return;
  }
  if (window._setupSyncInFlight) return;
  SETUP_CONNECT_SYNCING = { garmin: !!g.connected, strava: !!s.connected };
  updateSetupWeeklySyncHint();
  // If OAuth just queued a Strava sync, reuse it instead of starting a second one.
  const pendingStrava = window._stravaPostConnectSync;
  const job = pendingStrava && !g.connected
    ? Promise.resolve(pendingStrava)
    : window.syncConnectedSourcesForSetup();
  window._setupSyncInFlight = job
    .catch(() => null)
    .finally(() => {
      SETUP_CONNECT_SYNCING = { garmin: false, strava: false };
      window._setupSyncInFlight = null;
      const form = document.querySelector(".setup-form");
      if (form) fillWeeklyFromSynced(form, { force: true });
      updateSetupWeeklySyncHint();
    });
}

function isCreatePlanOnly() {
  try {
    if (sessionStorage.getItem("plan-create-only") === "1") return true;
  } catch { /* ignore */ }
  const base = location.pathname.replace(/^\/+|\/+$/g, "").split("/")[0];
  return base === "create-plan";
}

function renderCreatePlan(message = "") {
  try { sessionStorage.setItem("plan-create-only", "1"); } catch { /* ignore */ }
  markConnectStepDone();
  renderSetupPlanForm(message, { createOnly: true });
}
window.renderCreatePlan = renderCreatePlan;

function renderSetupPlanForm(message = "", opts = {}) {
  const createOnly = opts.createOnly === true || isCreatePlanOnly();
  if (createOnly) {
    try { sessionStorage.setItem("plan-create-only", "1"); } catch { /* ignore */ }
    prepareSetupShell({ path: "/create-plan", hideNav: false });
    showAppChrome();
    document.body.classList.add("onboarding");
  } else {
    try { sessionStorage.removeItem("plan-create-only"); } catch { /* ignore */ }
    prepareSetupShell({ path: "/setup", hideNav: true });
  }
  clearSetupDraft();
  const seed = window._setupSeed || null;
  window._setupSeed = null;
  const minDate = new Date();
  const min = `${minDate.getFullYear()}-${String(minDate.getMonth() + 1).padStart(2, "0")}-${String(minDate.getDate()).padStart(2, "0")}`;
  document.getElementById("app").innerHTML = `
    <section class="auth-card setup-card">
      ${createOnly ? "" : `<p class="setup-step-label" id="setup-plan-step-label">${tt("setup.step2")}</p>`}
      <div class="eyebrow">${createOnly ? tt("setup.createPlan") : tt("setup.newPlan")}</div>
      <h1>${tt("setup.whatFor")}</h1>
      <form class="setup-form" data-create-only="${createOnly ? "1" : ""}" novalidate>
        <fieldset class="goal-field">
          <legend class="field-label-row">${tt("setup.goal")}
            <button class="info-tip" type="button" aria-label="About goals" data-tip="A race: train for a specific event. A time goal: chase a target time on a distance. General fitness: build consistently with no race date.">i</button>
          </legend>
          <div class="choice-row">
            <button class="choice-btn active" type="button" data-goal="race">${tt("setup.goalRace")}</button>
            <button class="choice-btn" type="button" data-goal="time">${tt("setup.goalTime")}</button>
            <button class="choice-btn" type="button" data-goal="fitness">${tt("setup.goalFitness")}</button>
          </div>
          <input type="hidden" name="goal_type" value="race" />
        </fieldset>
        <div class="event-entry" data-for-goal="race">
          <div class="event-search">
            <label>${tt("setup.searchEvents")}
              <input type="search" name="event_search" placeholder="e.g. Gent Marathon, Samson 10K" autocomplete="off" />
            </label>
            <ul class="search-results" hidden></ul>
          </div>
          <button class="button ghost" type="button" data-action="add-own-event">${tt("setup.addOwnEvent")}</button>
          <button class="button ghost" type="button" data-action="cancel-own-event" hidden>${tt("setup.backToSearch")}</button>
        </div>
        <div class="picked-event" hidden>
          <div class="eyebrow">Selected event</div>
          <p class="picked-name"></p>
          <p class="muted small-text picked-meta"></p>
          <button class="button ghost small" type="button" data-action="clear-picked-event">Choose a different event</button>
        </div>
        <fieldset data-for-goal="race,fitness,time" data-setup-sport>
          <legend id="sport-legend">${tt("setup.eventType")}</legend>
          <div class="choice-row" id="sport-choices">
            ${(window.EVENT_SPORTS || ["run", "swim", "bike", "triathlon", "walk", "ski"]).map((s) => `
              <button class="choice-btn" type="button" data-sport="${s}">${tt(`sport.${s}Full`)}</button>`).join("")}
          </div>
          <input type="hidden" name="sport" />
        </fieldset>
        <fieldset data-for-goal="race,time" data-setup-distance>
          <legend>Distance</legend>
          <div class="choice-row" id="distance-choices"><p class="muted">${tt("setup.pickSport")}</p></div>
          <input type="hidden" name="preset" />
        </fieldset>
        <div class="custom-dists" hidden data-for-goal="race,time" data-setup-custom-dist>
          <label class="custom-run" hidden>Run (<span data-units-label>${typeof window.distUnit === "function" ? window.distUnit() : "km"}</span>)<input type="number" name="custom_run" min="0.1" step="0.1" /></label>
          <label class="custom-run2" hidden>2nd run (<span data-units-label>${typeof window.distUnit === "function" ? window.distUnit() : "km"}</span>)<input type="number" name="custom_run2" min="0.1" step="0.1" /></label>
          <label class="custom-swim" hidden>Swim (m)<input type="number" name="custom_swim" min="50" step="50" /></label>
          <label class="custom-bike" hidden>Bike (<span data-units-label>${typeof window.distUnit === "function" ? window.distUnit() : "km"}</span>)<input type="number" name="custom_bike" min="1" step="0.1" /></label>
        </div>
        <label data-own-event data-for-goal="race">Event name<input type="text" name="event_name" required placeholder="e.g. Gent Marathon, Kwart tri Leuven" /></label>
        <label data-own-event data-for-goal="race">Location<input type="text" name="event_location" maxlength="80" placeholder="e.g. Gent, Belgium" /></label>
        <fieldset data-own-event data-for-goal="race" class="event-duration-setup">
          <legend>${typeof window.t === "function" ? window.t("events.duration") : "Duration"}</legend>
          <div class="choice-row">
            <button class="choice-btn active" type="button" data-event-multi="no">${typeof window.t === "function" ? window.t("events.singleDay") : "Single day"}</button>
            <button class="choice-btn" type="button" data-event-multi="yes">${typeof window.t === "function" ? window.t("events.multiDay") : "Multi-day"}</button>
          </div>
          <input type="hidden" name="multi_day" value="no" />
        </fieldset>
        <div class="setup-date-field" data-for-goal="race,time" id="event-date-wrap" data-setup-date>
          <span class="date-label">Event date</span>
          <input type="date" name="event_date" required min="${min}" />
        </div>
        <div class="setup-date-field event-end-wrap" data-own-event data-for-goal="race" id="event-end-wrap" data-setup-end-date hidden>
          <span class="date-label">${typeof window.t === "function" ? window.t("events.endDate") : "End date"}</span>
          <input type="date" name="event_end_date" min="${min}" />
        </div>
        <fieldset data-own-event data-for-goal="race" class="event-kind-setup">
          <legend>${typeof window.t === "function" ? window.t("events.kind") : "Event kind"}</legend>
          <div class="choice-row">
            <button class="choice-btn active" type="button" data-event-kind="race">${typeof window.t === "function" ? window.t("events.kindRace") : "Race"}</button>
            <button class="choice-btn" type="button" data-event-kind="stage">${typeof window.t === "function" ? window.t("events.kindStage") : "Stage"}</button>
            <button class="choice-btn" type="button" data-event-kind="camp">${typeof window.t === "function" ? window.t("events.kindCamp") : "Camp"}</button>
            <button class="choice-btn" type="button" data-event-kind="holiday">${typeof window.t === "function" ? window.t("events.kindHoliday") : "Holiday"}</button>
          </div>
          <input type="hidden" name="event_kind" value="race" />
        </fieldset>
        <div data-own-event data-for-goal="race" id="setup-event-legs" class="setup-event-legs" hidden></div>
        <fieldset data-for-goal="time" data-setup-time-goal>
          <legend>Time goal</legend>
          <div class="choice-row" id="time-goal-choices"><p class="muted">Pick a distance first.</p></div>
          <div id="time-custom-wrap" hidden></div>
          <input type="hidden" name="time_goal" />
        </fieldset>
        <fieldset data-for-goal="fitness" data-setup-program hidden>
          <legend class="field-label-row">${tt("setup.program")}
            <button class="info-tip" type="button" aria-label="About programs" data-tip="${escAttr(tt("setup.programTip"))}">i</button>
          </legend>
          <div class="choice-row" id="fitness-program-choices">
            <button class="choice-btn active" type="button" data-program="standard">${tt("setup.programFitness")}</button>
            <button class="choice-btn" type="button" data-program="start_to_run">${tt("setup.programStartToRun")}</button>
          </div>
          <input type="hidden" name="program" value="" />
          <p class="muted small-text" id="fitness-program-hint"></p>
        </fieldset>
        <div class="start-to-run-box" id="start-to-run-box" hidden>
          <p class="setup-hint" id="start-to-run-hint"></p>
          <div class="choice-row" id="start-to-run-opt">
            <button class="choice-btn" type="button" data-program-override="start_to_run">${tt("setup.programStartToRun")}</button>
            <button class="choice-btn" type="button" data-program-override="standard">${tt("setup.programStandard5k")}</button>
          </div>
        </div>
        <fieldset data-for-goal="fitness" data-setup-fitness-weeks>
          <legend>${tt("setup.howLong")}</legend>
          <div class="choice-row" id="fitness-week-choices"></div>
          <input type="hidden" name="fitness_weeks" value="12" />
          <label class="fitness-custom-label" id="fitness-custom-wrap" hidden>
            Custom weeks
            <input type="number" name="fitness_weeks_custom" min="4" max="32" step="1" placeholder="e.g. 10" />
          </label>
          <p class="muted small-text" id="fitness-weeks-hint"></p>
        </fieldset>
        <fieldset data-own-event data-for-goal="race">
          <legend>Share this event</legend>
          <div class="choice-row">
            <button class="choice-btn active" type="button" data-is-public="no">Private</button>
            <button class="choice-btn" type="button" data-is-public="yes">Public</button>
          </div>
          <input type="hidden" name="is_public" value="no" />
          <p class="muted small-text">Public shares name, date, distance and location only.</p>
        </fieldset>
        <label class="weekly-volume-field">
          <span class="field-label-row">Current weekly volume (<span data-units-label>${typeof window.distUnit === "function" ? window.distUnit() : "km"}</span>)
            <button class="info-tip" type="button" aria-label="About weekly volume" data-tip="Use your current typical week of training volume.">i</button>
          </span>
          <input type="number" name="weekly_km" required min="0" max="500" step="0.1" placeholder="e.g. 25" />
          <p class="setup-hint" id="weekly-hint"></p>
          <p class="setup-hint weekly-sync-status" id="weekly-sync-status" hidden></p>
        </label>
        <fieldset class="level-field">
          <legend>Where are you now?</legend>
          <div class="choice-row" id="experience-choices">
            <button class="choice-btn" type="button" data-experience="beginner">Beginner</button>
            <button class="choice-btn active" type="button" data-experience="intermediate">Intermediate</button>
            <button class="choice-btn" type="button" data-experience="advanced">Advanced</button>
          </div>
          <input type="hidden" name="experience" value="intermediate" />
          <p class="setup-hint" id="experience-hint">Defaults from your weekly volume — change it if that doesn’t fit.</p>
        </fieldset>
        <fieldset class="run-days-field" hidden>
          <legend id="run-days-legend">How many run days?</legend>
          <div class="choice-row" id="run-day-choices">
            ${[3, 4, 5, 6].map((n) => `<button class="choice-btn" type="button" data-run-days="${n}">${n} days</button>`).join("")}
          </div>
          <input type="hidden" name="run_days" />
          <p class="setup-hint" id="run-days-hint">Pick a distance to see a research-based minimum.</p>
        </fieldset>
        <fieldset class="strength-field">
          <legend class="field-label-row">Strength sessions
            <button class="info-tip" type="button" aria-label="About strength" data-tip="Recommended as mileage builds: a short session after an easy run helps tendons, hips and running economy.">i</button>
          </legend>
          <div class="choice-row">
            <button class="choice-btn" type="button" data-strength="yes">Yes</button>
            <button class="choice-btn" type="button" data-strength="no">No</button>
          </div>
          <input type="hidden" name="strength" />
          <p class="setup-hint" id="strength-hint" hidden></p>
          <div class="strength-gear-box" id="strength-gear-box" hidden>
            <p class="muted small-text" id="strength-gear-hint"></p>
            <div class="choice-row" id="strength-gear-actions"></div>
          </div>
        </fieldset>
        <fieldset class="week-blocks-field" hidden>
          <legend>Your week</legend>
          <p class="muted small-text" id="week-blocks-hint">Tap training days, and mark busy days you can’t train.</p>
          <div id="week-blocks"></div>
          <div class="extra-discipline" id="extra-discipline" hidden>
            <p class="muted small-text">Add extra discipline</p>
            <div class="choice-row" id="extra-discipline-choices"></div>
          </div>
          <input type="hidden" name="run_weekdays" />
          <input type="hidden" name="strength_weekdays" />
          <input type="hidden" name="swim_weekdays" />
          <input type="hidden" name="bike_weekdays" />
          <input type="hidden" name="busy_weekdays" />
          <input type="hidden" name="long_weekday" />
          <p class="setup-hint" id="overlap-info"></p>
          <p class="setup-hint warn" id="overlap-warn"></p>
        </fieldset>
        <div class="reachability-box" id="reachability-box" hidden>
          <p class="setup-hint warn" id="reachability-warn"></p>
        </div>
        <label class="own-risk-field">
          <input type="checkbox" name="own_risk" value="1" />
          <span>I understand this plan is guidance only and I train and race at my own risk. I’m responsible for my health and for stopping if something feels wrong.</span>
        </label>
        <p class="form-error">${message}</p>
        <div class="setup-actions setup-actions-row">
          ${createOnly
            ? `<button class="button ghost" type="button" data-action="cancel-create-plan">Cancel</button>`
            : `<button class="button ghost" type="button" data-action="setup-back-to-connect">Back</button>`}
          <button class="button" type="submit">Create my plan</button>
        </div>
        ${createOnly ? "" : `<button class="button ghost setup-skip" type="button" data-action="skip-setup">Skip for now</button>`}
      </form>
    </section>`;
  const form = document.querySelector(".setup-form");
  bindSetupForm(form);
  if (seed) applySetupSeed(form, seed);
  applyGoalType(form, fieldValue(form, "goal_type") || "race", { explicit: true });
  // Re-apply weekday answers after advice refresh — create-failure restores must keep the week.
  if (seed && (seed.run_weekdays || seed.swim_weekdays || seed.bike_weekdays || seed.strength_weekdays || seed.busy_weekdays)) {
    ["run_weekdays", "strength_weekdays", "swim_weekdays", "bike_weekdays", "busy_weekdays", "long_weekday", "run_days"].forEach((name) => {
      if (seed[name] != null && fieldOf(form, name)) fieldOf(form, name).value = seed[name];
    });
    form.dataset.blocksPicked = "1";
    form.dataset.weekEdited = "1";
    if (seed.run_days) setRunDays(form, seed.run_days, !!seed.runDaysPicked);
    paintWeekBlocks(form);
    const risk = fieldOf(form, "own_risk");
    if (risk) risk.checked = seed.own_risk === "1" || seed.own_risk === true;
  }
  syncRestoredChoices(form);
  bindSetupDatePicker(form);
  paintFitnessWeeks(form);
  // Don't overwrite a restored weekly volume after a failed create.
  if (!seed?.weekly_km) fillWeeklyFromSynced(form, { force: true });
  updateSetupWeeklySyncHint();
  if (typeof window.loadActivities === "function") {
    window.loadActivities().then((acts) => {
      window._setupActs = acts;
      if (Array.isArray(acts) && acts.length && typeof ACTS !== "undefined" && (!ACTS || !ACTS.length)) {
        // Keep peekActivities() from ignoring freshly loaded setup activities.
        try { ACTS = acts; } catch { /* ignore */ }
      }
      if (!form.dataset.weeklyPicked && !fieldValue(form, "weekly_km")) {
        fillWeeklyFromSynced(form, { force: true, acts });
      }
    }).catch(() => {});
  }
  // If Continue already kicked off a sync, keep the hint + fill when it lands.
  if (window._setupSyncInFlight) updateSetupWeeklySyncHint();
  else if (isSetupSyncing()) updateSetupWeeklySyncHint();
  try { sessionStorage.removeItem("setup-show-plan-step"); } catch { /* ignore */ }
}

function renderOnboarding(message = "") {
  // Never carry answers from a previous visit into a fresh setup.
  clearSetupDraft();
  try { sessionStorage.removeItem("plan-create-only"); } catch { /* ignore */ }
  if (shouldShowConnectStep()) {
    renderSetupConnectStep();
    return;
  }
  renderSetupPlanForm(message, { createOnly: false });
}
window.renderOnboarding = renderOnboarding;
window.renderSetupPlanForm = renderSetupPlanForm;
window.renderSetupConnectStep = renderSetupConnectStep;

function setupSport(form) {
  const direct = fieldValue(form, "sport");
  if (direct) return direct;
  if (form?.dataset?.pickedSport) return form.dataset.pickedSport;
  return "";
}

function setupGoal(form) {
  return fieldValue(form, "goal_type") || "race";
}

function setupProgramValue(form) {
  return String(fieldValue(form, "program") || "").toLowerCase();
}

/** Whether the current setup answers will generate a Start to Run plan. */
function setupUsesStartToRun(form) {
  if (!form || typeof window.resolveStartToRunProgram !== "function") return false;
  const sport = setupSport(form);
  if (sport !== "run") return false;
  return window.resolveStartToRunProgram({
    sport,
    preset: effectivePreset(form),
    goalType: setupGoal(form),
    experience: fieldValue(form, "experience") || "intermediate",
    weeklyKm: weeklyKmFromForm(form),
    program: setupProgramValue(form),
  }) === "start_to_run";
}

function effectivePreset(form) {
  const goal = setupGoal(form);
  if (goal === "time") {
    const g = (window.TIME_GOALS || []).find((t) => t.id === fieldValue(form, "time_goal"));
    return g ? g.preset : fieldValue(form, "preset");
  }
  if (goal === "fitness") {
    const sport = setupSport(form);
    if (sport === "run" && setupProgramValue(form) === "start_to_run") return "5k";
    if (sport === "run") return "10k";
    if (sport === "walk") return "20";
    if (sport === "swim") return "1500";
    if (sport === "bike") return "40";
    if (sport === "ski") return "full";
    if (sport === "triathlon") return "halve";
    if (sport === "duathlon") return "standard";
    if (sport === "aquathlon") return "standard";
    return "";
  }
  return fieldValue(form, "preset");
}

function fieldOf(form, name) {
  if (!form) return null;
  const byName = form.querySelector(`input[name="${name}"], select[name="${name}"], textarea[name="${name}"]`);
  if (byName) return byName;
  if (form.elements && typeof form.elements.namedItem === "function") {
    const named = form.elements.namedItem(name);
    if (named && !named.length && "value" in named) return named;
    if (named && named[0] && "value" in named[0]) return named[0];
  }
  return null;
}

function fieldValue(form, name) {
  return fieldOf(form, name)?.value || "";
}

function setupAdvice(form) {
  if (!form) return null;
  const sport = setupSport(form);
  if (!sport) return null;
  return trainingAdvice(sport, effectivePreset(form), {
    run: fieldValue(form, "custom_run"),
    run2: fieldValue(form, "custom_run2"),
    swim: fieldValue(form, "custom_swim"),
    bike: fieldValue(form, "custom_bike"),
  }, fieldValue(form, "experience") || "intermediate");
}

function syncChoiceButtons(root, attr, value) {
  const buttonOnly = new Set(["data-goal", "data-experience", "data-strength", "data-sport", "data-program", "data-program-override"]);
  const sel = buttonOnly.has(attr) ? `button[${attr}]` : `[${attr}]`;
  root.querySelectorAll(sel).forEach((b) => {
    b.classList.toggle("active", b.getAttribute(attr) === String(value));
  });
}

function setChoice(form, name, value, attr) {
  const el = fieldOf(form, name);
  if (!el) return;
  el.value = value == null ? "" : String(value);
  syncChoiceButtons(form, attr || `data-${name.replace(/_/g, "-")}`, el.value);
}

function pickExperience(form, value) {
  if (!form || !value) return;
  setChoice(form, "experience", value, "data-experience");
  form.dataset.experiencePicked = "1";
  // Experience changes the recommended day count + default week — refresh unless the athlete locked them.
  if (!form.dataset.runDaysPicked) {
    delete form.dataset.blocksPicked;
    if (!weekEditedByUser(form)) delete form.dataset.weekEdited;
  }
  updateTrainingAdvice();
  saveSetupDraft(form);
}

function pickStrength(form, value) {
  if (!form || !value) return;
  setChoice(form, "strength", value, "data-strength");
  form.dataset.strengthPicked = "1";
  const strengthEl = fieldOf(form, "strength_weekdays");
  if (value === "no" && strengthEl) strengthEl.value = "";
  if (value === "yes" && strengthEl && !parseDays(strengthEl.value).length && typeof defaultTrainingBlocks === "function") {
    const sport = setupSport(form) || "run";
    const startToRun = setupUsesStartToRun(form);
    const n = Number(fieldValue(form, "run_days")) || (startToRun ? 1 : 3);
    const busy = parseDays(fieldValue(form, "busy_weekdays"));
    const blocks = defaultTrainingBlocks(sport, n, true, busy, { startToRun });
    strengthEl.value = (blocks.strength || []).join(",");
  }
  paintWeekBlocks(form);
  updateTrainingAdvice();
  saveSetupDraft(form);
}

function hasAnyWeekdaySelection(form) {
  return ["run_weekdays", "swim_weekdays", "bike_weekdays", "strength_weekdays", "busy_weekdays"]
    .some((name) => parseDays(fieldValue(form, name)).length > 0);
}

function hasTrainingWeekdaySelection(form) {
  return ["run_weekdays", "swim_weekdays", "bike_weekdays", "strength_weekdays"]
    .some((name) => parseDays(fieldValue(form, name)).length > 0);
}

function bindSetupForm(form) {
  if (!form || form.dataset.bound === "1") return;
  form.dataset.bound = "1";
  // Keep disclaimer taps local — they sit under the week grid and must not reset it.
  const riskField = form.querySelector(".own-risk-field");
  if (riskField && riskField.dataset.riskBound !== "1") {
    riskField.dataset.riskBound = "1";
    const keepLocal = (e) => { e.stopPropagation(); };
    riskField.addEventListener("click", keepLocal);
    riskField.addEventListener("pointerdown", keepLocal);
    riskField.addEventListener("change", keepLocal);
  }
  form.addEventListener("click", (e) => {
    if (e.target.closest(".own-risk-field, input[name=own_risk]")) return;
    const tip = e.target.closest(".info-tip");
    if (tip && form.contains(tip)) {
      e.preventDefault();
      e.stopPropagation();
      form.querySelectorAll(".info-tip.is-open").forEach((el) => {
        if (el !== tip) el.classList.remove("is-open");
      });
      tip.classList.toggle("is-open");
      return;
    }
    form.querySelectorAll(".info-tip.is-open").forEach((el) => el.classList.remove("is-open"));
    const clearEv = e.target.closest("[data-action=clear-picked-event]");
    if (clearEv && form.contains(clearEv)) {
      e.preventDefault();
      e.stopPropagation();
      unlockPickedEvent(form);
      return;
    }
    const exp = e.target.closest("button[data-experience]");
    if (exp && form.contains(exp)) {
      e.preventDefault();
      e.stopPropagation();
      pickExperience(form, exp.dataset.experience);
      return;
    }
    const str = e.target.closest("button[data-strength]");
    if (str && form.contains(str)) {
      e.preventDefault();
      e.stopPropagation();
      pickStrength(form, str.dataset.strength);
      return;
    }
    const timeTarget = e.target.closest("[data-time-target]");
    if (timeTarget && form.contains(timeTarget)) {
      e.preventDefault();
      e.stopPropagation();
      pickTimeTarget(form, timeTarget.getAttribute("data-time-target"));
      return;
    }
    const goalPick = e.target.closest(".goal-field button[data-goal]");
    if (goalPick && form.contains(goalPick)) {
      e.preventDefault();
      e.stopPropagation();
      const nextGoal = goalPick.getAttribute("data-goal");
      if (nextGoal !== "time" && timeChromeShielded()) {
        keepTimeDistanceChrome(form);
        return;
      }
      setChoice(form, "program", "", "data-program");
      delete form.dataset.runDaysPicked;
      applyGoalType(form, nextGoal, { explicit: true });
      return;
    }
    const programPick = e.target.closest("[data-program]");
    if (programPick && form.contains(programPick) && !programPick.hasAttribute("data-program-override")) {
      e.preventDefault();
      e.stopPropagation();
      const next = programPick.getAttribute("data-program") === "start_to_run" ? "start_to_run" : "standard";
      setChoice(form, "program", next === "standard" ? "" : next, "data-program");
      delete form.dataset.runDaysPicked;
      paintFitnessProgram(form);
      updateTrainingAdvice();
      saveSetupDraft(form);
      return;
    }
    const programOverride = e.target.closest("[data-program-override]");
    if (programOverride && form.contains(programOverride)) {
      e.preventDefault();
      e.stopPropagation();
      const next = programOverride.getAttribute("data-program-override") === "standard"
        ? "standard"
        : "start_to_run";
      setChoice(form, "program", next, "data-program");
      delete form.dataset.runDaysPicked;
      updateTrainingAdvice();
      saveSetupDraft(form);
      return;
    }
    // Clicks in the distance row that miss a chip must not fall through to other handlers.
    if (e.target.closest("#distance-choices") && !e.target.closest("[data-preset]")) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const strengthMode = e.target.closest("[data-action=setup-strength-mode]");
    if (strengthMode && form.contains(strengthMode)) {
      e.preventDefault();
      e.stopPropagation();
      pickStrengthMode(form, strengthMode.getAttribute("data-mode"));
      return;
    }
    const manageStrength = e.target.closest("[data-action=setup-manage-strength-gear]");
    if (manageStrength && form.contains(manageStrength)) {
      e.preventDefault();
      e.stopPropagation();
      openSetupStrengthGearDialog();
      return;
    }
    const days = e.target.closest("#run-day-choices [data-run-days]");
    if (days && form.contains(days)) {
      e.preventDefault();
      e.stopPropagation();
      pickRunDayCount(form, days.dataset.runDays);
      return;
    }
    const preset = e.target.closest("[data-preset]");
    if (preset && form.contains(preset) && preset.closest("#distance-choices")) {
      e.preventDefault();
      e.stopPropagation();
      pickDistancePreset(form, preset.dataset.preset);
      return;
    }
    const sportPick = e.target.closest("[data-sport]");
    if (sportPick && form.contains(sportPick)) {
      e.preventDefault();
      e.stopPropagation();
      const nextSport = sportPick.dataset.sport;
      // Re-tapping the active sport must not wipe the week overview.
      if (setupSport(form) === nextSport && (form.dataset.blocksPicked === "1" || hasTrainingWeekdaySelection(form))) {
        return;
      }
      setChoice(form, "sport", nextSport, "data-sport");
      form.dataset.pickedSport = nextSport;
      if (setupGoal(form) === "time") {
        form.dataset.timeChrome = "1";
        shieldTimeChrome(1000);
      }
      delete form.dataset.experiencePicked;
      delete form.dataset.longPicked;
      delete form.dataset.weekEdited;
      delete form.dataset.blocksPicked;
      delete form.dataset.runDaysPicked;
      delete form.dataset.strengthPicked;
      delete form.dataset.fitnessWeeksPicked;
      setChoice(form, "program", "", "data-program");
      ["run_weekdays", "swim_weekdays", "bike_weekdays", "strength_weekdays"].forEach((name) => {
        const el = fieldOf(form, name);
        if (el) el.value = "";
      });
      paintDistances(nextSport, { keepPreset: false, skipAdvice: true });
      if (setupGoal(form) === "fitness") paintFitnessWeeks(form);
      fillWeeklyFromSynced(form, { force: true });
      syncExperienceFromWeekly(form);
      updateTrainingAdvice();
      saveSetupDraft(form);
      return;
    }
    const fitPick = e.target.closest("[data-fitness-weeks]");
    if (fitPick && form.contains(fitPick)) {
      e.preventDefault();
      e.stopPropagation();
      form.dataset.fitnessWeeksPicked = "1";
      setChoice(form, "fitness_weeks", fitPick.getAttribute("data-fitness-weeks"), "data-fitness-weeks");
      paintFitnessWeeks(form);
      saveSetupDraft(form);
      return;
    }
    const addDisc = e.target.closest("[data-add-discipline]");
    if (addDisc && form.contains(addDisc)) {
      e.preventDefault();
      e.stopPropagation();
      pickExtraDiscipline(form, addDisc.getAttribute("data-add-discipline"));
      return;
    }
    const removeDisc = e.target.closest("[data-remove-discipline]");
    if (removeDisc && form.contains(removeDisc)) {
      e.preventDefault();
      e.stopPropagation();
      const key = removeDisc.getAttribute("data-remove-discipline");
      if (removeExtraDiscipline(form, key)) {
        paintWeekBlocks(form);
        saveSetupDraft(form);
      }
    }
  }, true);
}

function primaryDisciplines(sport) {
  if (sport === "triathlon") return ["run", "swim", "bike"];
  if (sport === "duathlon") return ["run", "bike"];
  if (sport === "aquathlon") return ["run", "swim"];
  if (sport === "swim") return ["swim"];
  if (sport === "bike" || sport === "ski") return ["bike"];
  if (sport === "run" || sport === "walk") return ["run"];
  return [];
}

/** Week-grid row label: walk/ski keep their own names even though they reuse run/bike slots. */
function disciplineRowLabel(sport, key) {
  if (key === "run" && sport === "walk") {
    return typeof window.t === "function" ? window.t("sport.walk") : "Walk";
  }
  if (key === "bike" && sport === "ski") {
    return typeof window.t === "function" ? window.t("sport.ski") : "Ski";
  }
  if (key === "strength") return typeof window.t === "function" ? window.t("kind.strength") : "Strength";
  if (key === "busy") return "Busy";
  const fallback = { run: "Run", swim: "Swim", bike: "Bike" };
  const i18nKey = ({ run: "sport.run", swim: "sport.swim", bike: "sport.bike" })[key];
  if (i18nKey && typeof window.t === "function") {
    const value = window.t(i18nKey);
    if (value !== i18nKey) return value;
  }
  return fallback[key] || key;
}

function parseExtras(form) {
  return String(form?.dataset.extraDisciplines || "").split(",").map((s) => s.trim()).filter(Boolean);
}

function setExtras(form, list) {
  form.dataset.extraDisciplines = list.join(",");
}

/** Drop extras that are already required by the event sport — those rows stay fixed. */
function syncExtrasToSport(form) {
  const primary = new Set(primaryDisciplines(setupSport(form)));
  if (!primary.size) return parseExtras(form);
  const next = parseExtras(form).filter((k) => !primary.has(k));
  setExtras(form, next);
  return next;
}

function removeExtraDiscipline(form, key) {
  if (!form || !key) return false;
  if (primaryDisciplines(setupSport(form)).includes(key)) return false;
  setExtras(form, parseExtras(form).filter((k) => k !== key));
  const field = weekdayField(form, key) || fieldOf(form, `${key}_weekdays`);
  if (field) field.value = "";
  markWeekEdited(form);
  return true;
}

function weekdayField(form, key) {
  return form?.querySelector?.(`[name="${key}_weekdays"]`) || form?.[`${key}_weekdays`];
}

function addExtraDiscipline(form, key, seedDay = true) {
  if (!["run", "swim", "bike"].includes(key)) return;
  const sport = setupSport(form);
  if (primaryDisciplines(sport).includes(key)) return;
  const extras = parseExtras(form);
  if (!extras.includes(key)) {
    extras.push(key);
    setExtras(form, extras);
  }
  const field = weekdayField(form, key) || fieldOf(form, `${key}_weekdays`);
  if (seedDay && field && !parseDays(field.value).length) {
    field.value = String(defaultExtraDay(form, key));
  }
  markWeekEdited(form);
}

function pickExtraDiscipline(form, key) {
  addExtraDiscipline(form, key, true);
  paintWeekBlocks(form);
  saveSetupDraft(form);
}

function defaultExtraDay(form, key) {
  const used = new Set(["run", "swim", "bike", "strength"].flatMap((k) => {
    if (k === key) return [];
    return parseDays(weekdayField(form, k)?.value);
  }));
  parseDays(fieldValue(form, "busy_weekdays")).forEach((d) => used.add(d));
  const prefer = [2, 1, 3, 0, 4, 6, 5];
  return prefer.find((d) => !used.has(d)) ?? 2;
}

function draftKey(id = window.CURRENT_USER_ID || "anon") {
  return `plan-setup-draft:${id}`;
}

function saveSetupDraft() {
  // Setup answers are intentionally not remembered between visits.
}

function persistSetupDraft() {
  clearSetupDraft();
}
window.saveSetupDraftNow = persistSetupDraft;

function clearSetupDraft() {
  try {
    localStorage.removeItem(draftKey());
    if (window.CURRENT_USER_ID) localStorage.removeItem(draftKey("anon"));
  } catch { /* ignore */ }
}

/** Capture the live setup form so a failed create can restore the week grid and answers. */
function snapshotSetupForm(form) {
  if (!form) return null;
  const val = (name) => fieldValue(form, name);
  const risk = fieldOf(form, "own_risk");
  return {
    goal_type: val("goal_type") || "race",
    sport: val("sport") || form.dataset.pickedSport || "",
    preset: val("preset") || form.dataset.pickedPreset || "",
    custom_run: val("custom_run"),
    custom_run2: val("custom_run2"),
    custom_swim: val("custom_swim"),
    custom_bike: val("custom_bike"),
    event_name: val("event_name"),
    event_location: val("event_location"),
    event_date: val("event_date"),
    event_end_date: val("event_end_date"),
    multi_day: val("multi_day") || "no",
    event_kind: val("event_kind") || "race",
    event_legs_json: val("event_legs_json") || form.dataset.eventLegsJson || "",
    weekly_km: val("weekly_km"),
    run_days: val("run_days"),
    run_weekdays: val("run_weekdays"),
    strength_weekdays: val("strength_weekdays"),
    swim_weekdays: val("swim_weekdays"),
    bike_weekdays: val("bike_weekdays"),
    busy_weekdays: val("busy_weekdays"),
    long_weekday: val("long_weekday"),
    time_goal: val("time_goal"),
    time_custom: val("time_custom"),
    fitness_weeks: val("fitness_weeks") || "12",
    fitness_weeks_custom: val("fitness_weeks_custom"),
    program: val("program") || "",
    is_public: val("is_public") || "no",
    experience: val("experience") || "intermediate",
    strength: val("strength"),
    own_risk: risk?.checked ? "1" : "",
    extraDisciplines: form.dataset.extraDisciplines || "",
    ownEvent: form.dataset.ownEvent || "",
    pickedEvent: form.dataset.pickedEvent || "",
    sourceEvent: form.dataset.sourceEvent || "",
    pickedName: form.querySelector(".picked-name")?.textContent || val("event_name"),
    pickedMeta: form.querySelector(".picked-meta")?.textContent || "",
    agendaEventId: form.dataset.agendaEventId || "",
    agendaEventName: form.dataset.agendaEventName || "",
    agendaEventDate: form.dataset.agendaEventDate || "",
    pickedSport: form.dataset.pickedSport || val("sport") || "",
    pickedPreset: form.dataset.pickedPreset || val("preset") || "",
    timeChrome: form.dataset.timeChrome || "",
    strengthMode: form.dataset.strengthMode || "",
    weekEdited: form.dataset.weekEdited || "",
    blocksPicked: form.dataset.blocksPicked || "",
    runDaysPicked: form.dataset.runDaysPicked || "",
    strengthPicked: form.dataset.strengthPicked || "",
    experiencePicked: form.dataset.experiencePicked || "",
    longPicked: form.dataset.longPicked || "",
    weeklyPicked: form.dataset.weeklyPicked || "",
    weeklyAuto: form.dataset.weeklyAuto || "",
    fitnessWeeksPicked: form.dataset.fitnessWeeksPicked || "",
  };
}

function applySetupSeed(form, draft) {
  if (!form || !draft) return;
  if (draft.agendaEventId) {
    form.dataset.agendaEventId = draft.agendaEventId;
    form.dataset.agendaEventName = draft.agendaEventName || draft.event_name || "";
    form.dataset.agendaEventDate = draft.agendaEventDate || draft.event_date || "";
  }
  if (draft.sport) {
    form.sport.value = draft.sport;
    syncChoiceButtons(form, "data-sport", draft.sport);
    paintDistances(draft.sport, { keepPreset: true });
  }
  if (draft.preset) {
    form.preset.value = draft.preset;
    form.querySelectorAll("#distance-choices .choice-btn").forEach((b) => b.classList.toggle("active", b.dataset.preset === draft.preset));
    toggleCustom(draft.sport, draft.preset);
  }
  ["custom_run", "custom_run2", "custom_swim", "custom_bike", "event_name", "event_location", "event_date", "event_end_date",
    "multi_day", "event_kind", "event_legs_json", "weekly_km",
    "run_days", "run_weekdays", "strength_weekdays", "swim_weekdays", "bike_weekdays", "busy_weekdays",
    "long_weekday", "time_goal", "time_custom", "fitness_weeks", "fitness_weeks_custom", "program",
    "goal_type", "is_public", "experience", "strength"].forEach((name) => {
    if (fieldOf(form, name) && draft[name] != null) fieldOf(form, name).value = draft[name];
  });
  const risk = fieldOf(form, "own_risk");
  if (risk) risk.checked = draft.own_risk === "1" || draft.own_risk === true;
  // Restore lock flags before advice refresh so the week grid is not reseeded away.
  [
    ["weekEdited", "weekEdited"],
    ["blocksPicked", "blocksPicked"],
    ["runDaysPicked", "runDaysPicked"],
    ["strengthPicked", "strengthPicked"],
    ["experiencePicked", "experiencePicked"],
    ["longPicked", "longPicked"],
    ["weeklyPicked", "weeklyPicked"],
    ["weeklyAuto", "weeklyAuto"],
    ["fitnessWeeksPicked", "fitnessWeeksPicked"],
    ["timeChrome", "timeChrome"],
    ["strengthMode", "strengthMode"],
    ["pickedSport", "pickedSport"],
    ["pickedPreset", "pickedPreset"],
  ].forEach(([from, to]) => {
    if (draft[from]) form.dataset[to] = draft[from];
    else delete form.dataset[to];
  });
  // Prefer an explicit lock when weekday answers were restored.
  if (draft.run_weekdays || draft.swim_weekdays || draft.bike_weekdays || draft.strength_weekdays || draft.busy_weekdays) {
    form.dataset.blocksPicked = "1";
    form.dataset.weekEdited = "1";
  }
  syncChoiceButtons(form, "data-goal", fieldValue(form, "goal_type") || "race");
  paintTimeTargets(form);
  paintFitnessWeeks(form);
  paintFitnessProgram(form);
  updateStartToRunChrome(form);
  syncChoiceButtons(form, "data-time-target", fieldValue(form, "time_goal"));
  syncChoiceButtons(form, "data-fitness-weeks", fieldValue(form, "fitness_weeks") || "12");
  syncChoiceButtons(form, "data-program", setupProgramValue(form) === "start_to_run" ? "start_to_run" : "standard");
  syncChoiceButtons(form, "data-program-override", setupProgramValue(form) === "standard" ? "standard" : "start_to_run");
  syncChoiceButtons(form, "data-is-public", fieldValue(form, "is_public") || "no");
  syncChoiceButtons(form, "data-experience", fieldValue(form, "experience") || "intermediate");
  syncChoiceButtons(form, "data-strength", fieldValue(form, "strength"));
  syncChoiceButtons(form, "data-event-kind", fieldValue(form, "event_kind") || "race");
  syncChoiceButtons(form, "data-event-multi", fieldValue(form, "multi_day") || "no");
  if (draft.event_legs_json) form.dataset.eventLegsJson = draft.event_legs_json;
  if (draft.run_days) setRunDays(form, draft.run_days);
  if (draft.extraDisciplines) form.dataset.extraDisciplines = draft.extraDisciplines;
  if (draft.ownEvent) form.dataset.ownEvent = draft.ownEvent;
  paintSetupEventLegs(form);
  if (draft.pickedEvent && draft.event_name) {
    form.dataset.pickedEvent = "1";
    if (draft.sourceEvent) form.dataset.sourceEvent = draft.sourceEvent;
    const sport = draft.sport || fieldValue(form, "sport") || "run";
    form.dataset.pickedSport = sport;
    if (draft.preset) form.dataset.pickedPreset = draft.preset;
    lockPickedEvent(form, {
      name: draft.pickedName || draft.event_name,
      date: draft.event_date,
      km: "",
      sport,
      id: draft.sourceEvent,
    }, draft.pickedMeta || pickedEventMeta({ name: draft.event_name, date: draft.event_date, sport }, sport));
  }
}

function syncRestoredChoices(form) {
  if (!form) return;
  syncChoiceButtons(form, "data-goal", fieldValue(form, "goal_type") || "race");
  syncChoiceButtons(form, "data-sport", fieldValue(form, "sport"));
  syncChoiceButtons(form, "data-experience", fieldValue(form, "experience") || "intermediate");
  syncChoiceButtons(form, "data-strength", fieldValue(form, "strength"));
  syncChoiceButtons(form, "data-is-public", fieldValue(form, "is_public") || "no");
  const preset = fieldValue(form, "preset");
  form.querySelectorAll("#distance-choices .choice-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.preset === preset);
  });
}

// After sport/distance/date use in a time goal, ignore goal→race flips for a beat.
// Those flips hide the distance row and are almost always synthetic clicks.
let _timeChromeShieldUntil = 0;
function shieldTimeChrome(ms = 800) {
  _timeChromeShieldUntil = Math.max(_timeChromeShieldUntil, Date.now() + ms);
}
function timeChromeShielded() {
  return Date.now() < _timeChromeShieldUntil;
}

function applyGoalType(form, goal, opts = {}) {
  if (!form) return;
  if (!["race", "time", "fitness"].includes(goal)) goal = "race";
  const currentGoal = setupGoal(form);
  // Hard rule: after distance/date/sport use in a time goal, ignore goal flips to race/fitness.
  // Those are almost always synthetic clicks and they hide the distance row.
  if (goal !== "time" && currentGoal === "time" && timeChromeShielded()) return;
  const prevGoal = currentGoal;
  if (prevGoal !== goal) delete form.dataset.fitnessWeeksPicked;
  setChoice(form, "goal_type", goal, "data-goal");
  if (goal === "time") form.dataset.timeChrome = "1";
  else if (opts.explicit) delete form.dataset.timeChrome;
  const sportLegend = document.getElementById("sport-legend");
  if (sportLegend) {
    sportLegend.textContent = goal === "fitness" ? "Focus" : goal === "time" ? "Sport" : "Event type";
  }
  const dateLabel = form.querySelector(".date-label");
  if (dateLabel) dateLabel.textContent = goal === "time" ? "Target date" : "Event date";
  const picked = !!form.dataset.pickedEvent;
  const adding = form.dataset.ownEvent === "1";
  // Race own-event fields only while manually adding; time/fitness always show sport/distance/date.
  const showRaceManual = goal === "race" && adding && !picked;
  const keepTimeChrome = goal === "time" || form.dataset.timeChrome === "1" || timeChromeShielded();
  const showSport = keepTimeChrome || goal === "fitness" || showRaceManual;
  const showDistance = keepTimeChrome || showRaceManual;
  const showDate = keepTimeChrome || showRaceManual;
  if (form.event_name) form.event_name.required = false;
  if (form.event_date) form.event_date.required = false;
  form.querySelectorAll("[data-for-goal]").forEach((el) => {
    const allowed = el.getAttribute("data-for-goal").split(",").map((s) => s.trim());
    if (!allowed.includes(goal) && !(keepTimeChrome && el.hasAttribute("data-setup-sport"))
      && !(keepTimeChrome && el.hasAttribute("data-setup-distance"))
      && !(keepTimeChrome && el.hasAttribute("data-setup-date"))
      && !(keepTimeChrome && el.hasAttribute("data-setup-time-goal"))) {
      el.hidden = true;
      return;
    }
    if (el.hasAttribute("data-setup-sport")) {
      el.hidden = !showSport;
      return;
    }
    if (el.hasAttribute("data-setup-distance")) {
      el.hidden = !showDistance;
      return;
    }
    if (el.hasAttribute("data-setup-custom-dist")) {
      // Only force-hide when distance isn't part of this goal; toggleCustom shows it for custom.
      if (!showDistance) el.hidden = true;
      return;
    }
    if (el.hasAttribute("data-setup-date")) {
      el.hidden = !showDate;
      return;
    }
    if (goal === "race" && el.hasAttribute("data-own-event") && !showRaceManual) {
      el.hidden = true;
      return;
    }
    if (picked && goal === "race" && el.classList.contains("event-entry")) {
      el.hidden = true;
      return;
    }
    if (!allowed.includes(goal)) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
  });
  const addBtn = form.querySelector("[data-action=add-own-event]");
  const cancelBtn = form.querySelector("[data-action=cancel-own-event]");
  const searchBox = form.querySelector(".event-search");
  if (addBtn) addBtn.hidden = goal !== "race" || picked || adding;
  if (cancelBtn) cancelBtn.hidden = goal !== "race" || picked || !adding;
  if (searchBox) searchBox.hidden = picked || (goal === "race" && adding) || goal === "time" || goal === "fitness" || keepTimeChrome;
  if (form.event_name) form.event_name.required = showRaceManual;
  if (form.event_date) form.event_date.required = showRaceManual || goal === "time" || keepTimeChrome;
  const sport = setupSport(form);
  const box = document.getElementById("distance-choices");
  if (goal === "time" || keepTimeChrome || showRaceManual) {
    if (sport && goal !== "fitness") paintDistances(sport, { keepPreset: true, resetExtras: false });
    else if (box && (goal === "time" || keepTimeChrome) && !box.querySelector("[data-preset]")) {
      box.innerHTML = `<p class="muted">${tt("setup.pickSport")}</p>`;
    }
    if (goal === "time" || keepTimeChrome) paintTimeTargets(form);
  } else if (goal === "race" && box && !sport && !box.querySelector("[data-preset]")) {
    box.innerHTML = `<p class="muted">${tt("setup.pickSport")}</p>`;
  }
  const card = form.querySelector(".picked-event");
  if (card) card.hidden = !(goal === "race" && picked);
  if (goal === "fitness") paintFitnessWeeks(form);
  paintFitnessProgram(form);
  updateStartToRunChrome(form);
  updateWeeklyVolumeLimits(form);
  fillWeeklyFromSynced(form);
  updateTrainingAdvice();
  saveSetupDraft(form);
}

function distLabel() {
  return typeof window.distUnit === "function" ? window.distUnit() : "km";
}

function weeklyKmFromForm(form) {
  const raw = fieldValue(form, "weekly_km");
  if (!(Number(raw) > 0)) return 0;
  return typeof window.parseDistInput === "function" ? window.parseDistInput(raw) : Number(raw);
}

function setWeeklyKmDisplay(form, kmStorage) {
  const el = fieldOf(form, "weekly_km");
  if (!el) return;
  el.value = typeof window.displayDistValue === "function"
    ? window.displayDistValue(kmStorage, 1)
    : String(kmStorage);
}

function updateWeeklyVolumeLimits(form) {
  const weekly = fieldOf(form, "weekly_km");
  if (!weekly) return;
  const sport = setupSport(form);
  const unit = distLabel();
  const maxKm = sport === "bike" ? 500 : sport === "swim" ? 40 : 200;
  const maxDisplay = typeof window.displayDistValue === "function" ? window.displayDistValue(maxKm, 0) : maxKm;
  const startToRun = setupUsesStartToRun(form);
  weekly.min = startToRun ? "0" : "1";
  weekly.max = String(maxDisplay);
  form.querySelectorAll("[data-units-label]").forEach((el) => { el.textContent = unit; });
  const hint = document.getElementById("weekly-hint");
  if (!hint) return;
  if (startToRun) {
    hint.textContent = `Just starting? Enter 0. Otherwise use your current typical week of running (${unit}).`;
  } else if (sport === "bike") hint.textContent = `Use your current typical week on the bike (${unit}).`;
  else if (sport === "swim") hint.textContent = `Use your current typical week in the water (${unit}).`;
  else if (sport === "triathlon") hint.textContent = `Use your current typical run volume (${unit}). Swim and bike volume are planned separately.`;
  else if (sport === "run") hint.textContent = `Use your current typical week of running (${unit}).`;
  else hint.textContent = `Use your current typical weekly volume (${unit}).`;
}

function paintFitnessProgram(form) {
  const field = form?.querySelector("[data-setup-program]");
  const weeksField = form?.querySelector("[data-setup-fitness-weeks]");
  const hint = document.getElementById("fitness-program-hint");
  if (!form || !field) return;
  const goal = setupGoal(form);
  const sport = setupSport(form);
  const show = goal === "fitness" && sport === "run";
  field.hidden = !show;
  if (!show) {
    if (setupProgramValue(form) === "start_to_run") setChoice(form, "program", "", "data-program");
    if (weeksField) weeksField.hidden = goal !== "fitness";
    return;
  }
  field.hidden = false;
  const selected = setupProgramValue(form) === "start_to_run" ? "start_to_run" : "standard";
  syncChoiceButtons(form, "data-program", selected);
  if (hint) {
    hint.textContent = selected === "start_to_run"
      ? tt("setup.programStartToRunHint")
      : tt("setup.programFitnessHint");
  }
  if (weeksField) {
    const hideWeeks = selected === "start_to_run";
    weeksField.hidden = hideWeeks;
  }
}

function updateStartToRunChrome(form) {
  const box = document.getElementById("start-to-run-box");
  const hint = document.getElementById("start-to-run-hint");
  if (!form || !box) return;
  const goal = setupGoal(form);
  const sport = setupSport(form);
  const preset = effectivePreset(form);
  const experience = fieldValue(form, "experience") || "intermediate";
  const weekly = weeklyKmFromForm(form);
  const explicit = setupProgramValue(form);
  const autoCandidate = sport === "run"
    && (goal === "race" || goal === "time")
    && preset === "5k"
    && (experience === "beginner" || weekly < 10);
  if (!autoCandidate) {
    if ((goal === "race" || goal === "time")
      && (explicit === "start_to_run" || explicit === "standard")
      && !(sport === "run" && preset === "5k" && (experience === "beginner" || weekly < 10))) {
      setChoice(form, "program", "", "data-program");
    }
    box.hidden = true;
    return;
  }
  box.hidden = false;
  box.removeAttribute("hidden");
  const using = explicit === "standard" ? "standard" : "start_to_run";
  if (!explicit) setChoice(form, "program", "start_to_run", "data-program");
  syncChoiceButtons(form, "data-program-override", using);
  if (hint) {
    hint.textContent = using === "start_to_run"
      ? tt("setup.startToRunAutoHint")
      : tt("setup.startToRunOptOutHint");
  }
}

function paintRunDayChoices(form, options) {
  const box = document.getElementById("run-day-choices");
  const legend = document.getElementById("run-days-legend");
  if (!box) return;
  const opts = Array.isArray(options) && options.length ? options : [3, 4, 5, 6];
  const current = Number(fieldValue(form, "run_days")) || opts[0];
  box.innerHTML = opts.map((n) => `
    <button class="choice-btn" type="button" data-run-days="${n}">${n} day${n === 1 ? "" : "s"}</button>`).join("");
  if (legend) {
    const sport = setupSport(form);
    legend.textContent = opts[opts.length - 1] <= 3
      ? tt("setup.runDaysStartToRun")
      : sport === "walk"
        ? tt("setup.walkDays")
        : tt("setup.runDays");
  }
  const next = opts.includes(current) ? current : opts[0];
  setRunDays(form, next, !!form.dataset.runDaysPicked);
}

const WEEKDAY_KEYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function WEEKDAY_NAMES() {
  return typeof window.dayNames === "function" ? window.dayNames() : WEEKDAY_KEYS;
}

function parseDays(value) {
  if (value == null || value === "") return [];
  return String(value)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
}

function setRunDays(form, n, userPicked = false) {
  const el = fieldOf(form, "run_days");
  if (el) el.value = n ? String(n) : "";
  if (userPicked) form.dataset.runDaysPicked = "1";
  form.querySelectorAll("[data-run-days]").forEach((b) => b.classList.toggle("active", Number(b.dataset.runDays) === Number(n)));
}

/** User picked a run-day count — rebuild the week grid to match. */
function pickRunDayCount(form, n) {
  const wanted = Number(n) || 0;
  if (!wanted) return;
  form.dataset.runDaysPicked = "1";
  setRunDays(form, wanted, true);
  delete form.dataset.longPicked;
  // Choosing a day count is a fresh proposal, not a locked custom grid.
  delete form.dataset.weekEdited;
  delete form.dataset.blocksPicked;
  applyDefaultBlocks(form, { force: true });
  setRunDays(form, wanted, true);
  form.dataset.blocksPicked = "1";
  updateTrainingAdvice();
  setRunDays(form, wanted, true);
}

function visibleWeekdays(form, key) {
  if (key === "strength") return fieldValue(form, "strength") === "yes" ? parseDays(form.strength_weekdays.value) : [];
  const sport = setupSport(form);
  const extras = parseExtras(form);
  if (primaryDisciplines(sport).includes(key) || extras.includes(key)) return parseDays(form[`${key}_weekdays`]?.value);
  return [];
}

function currentBlocks(form) {
  const sport = setupSport(form);
  const extras = parseExtras(form);
  const primary = primaryDisciplines(sport);
  const strengthOn = fieldValue(form, "strength") === "yes";
  const show = (key) => primary.includes(key) || extras.includes(key);
  return {
    run: show("run") ? parseDays(fieldValue(form, "run_weekdays")) : [],
    strength: strengthOn ? parseDays(fieldValue(form, "strength_weekdays")) : [],
    swim: show("swim") ? parseDays(fieldValue(form, "swim_weekdays")) : [],
    bike: show("bike") ? parseDays(fieldValue(form, "bike_weekdays")) : [],
    busy: parseDays(fieldValue(form, "busy_weekdays")),
  };
}

function setLongWeekday(form, day) {
  const el = fieldOf(form, "long_weekday");
  if (!el) return;
  el.value = day == null || day === "" ? "" : String(day);
}

function currentLongWeekday(form) {
  const raw = fieldValue(form, "long_weekday");
  if (raw === "" || raw == null) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 6 ? n : null;
}

function ensureLongWeekday(form, runDays, prefer = null) {
  if (!runDays.length) {
    setLongWeekday(form, "");
    return null;
  }
  const cur = currentLongWeekday(form);
  if (cur != null && runDays.includes(cur)) return cur;
  const next = prefer != null && runDays.includes(prefer)
    ? prefer
    : (runDays.includes(5) ? 5 : runDays[runDays.length - 1]);
  setLongWeekday(form, next);
  return next;
}

function setupNeedsLongDay(form) {
  if (setupUsesStartToRun(form)) return false;
  const sport = setupSport(form);
  const preset = effectivePreset(form);
  if (!sport || !preset || typeof window.needsDedicatedLongDay !== "function") return false;
  return window.needsDedicatedLongDay(sport, preset, {
    run: fieldValue(form, "custom_run"),
    run2: fieldValue(form, "custom_run2"),
    swim: fieldValue(form, "custom_swim"),
    bike: fieldValue(form, "custom_bike"),
  });
}

function fillProposedWeek(form, force = false) {
  const sport = setupSport(form);
  if (!sport || typeof defaultTrainingBlocks !== "function") return false;
  if (!form) return false;
  const primary = primaryDisciplines(sport);
  if (!primary.length) return false;
  const mainKey = primary[0];
  const mainEl = fieldOf(form, `${mainKey}_weekdays`);
  if (!mainEl) return false;
  if (!force && (form.dataset.blocksPicked || parseDays(mainEl.value).length)) return false;
  const startToRun = setupUsesStartToRun(form);
  const n = Number(fieldValue(form, "run_days")) || (startToRun ? 1 : 3);
  const strength = fieldValue(form, "strength") === "yes";
  const busy = parseDays(fieldValue(form, "busy_weekdays"));
  const blocks = defaultTrainingBlocks(sport, n, strength, busy, { startToRun });
  if (primary.includes("run")) {
    const runEl = fieldOf(form, "run_weekdays");
    if (runEl) runEl.value = (blocks.run || []).join(",");
    if (!form.dataset.runDaysPicked) setRunDays(form, (blocks.run || []).length);
    if (!form.dataset.longPicked && !startToRun) setLongWeekday(form, blocks.long);
  }
  if (primary.includes("swim")) {
    const swimEl = fieldOf(form, "swim_weekdays");
    if (swimEl) swimEl.value = (blocks.swim || []).join(",");
  }
  if (primary.includes("bike")) {
    const bikeEl = fieldOf(form, "bike_weekdays");
    if (bikeEl) bikeEl.value = (blocks.bike || []).join(",");
  }
  if (strength) {
    const strengthEl = fieldOf(form, "strength_weekdays");
    if (strengthEl && (force || !parseDays(strengthEl.value).length)) {
      strengthEl.value = (blocks.strength || []).join(",");
    }
  }
  return true;
}

function weekEditedByUser(form) {
  return form?.dataset?.weekEdited === "1";
}

function markWeekEdited(form) {
  if (!form) return;
  form.dataset.weekEdited = "1";
  form.dataset.blocksPicked = "1";
}

function applyDefaultBlocks(form, { force = false } = {}) {
  // User-edited grids stay put. Automatic seeds never set weekEdited.
  if (!force && weekEditedByUser(form)) {
    paintWeekBlocks(form);
    return;
  }
  const sport = setupSport(form);
  if (!sport || typeof defaultTrainingBlocks !== "function") {
    paintWeekBlocks(form);
    return;
  }
  const strength = fieldValue(form, "strength") === "yes";
  const startToRun = setupUsesStartToRun(form);
  const n = Number(fieldValue(form, "run_days")) || (startToRun ? 1 : 3);
  const busy = parseDays(fieldValue(form, "busy_weekdays"));
  const blocks = defaultTrainingBlocks(sport, n, strength, busy, { startToRun });
  const extras = parseExtras(form);
  const primary = primaryDisciplines(sport);
  const keep = {
    run: extras.includes("run") ? fieldValue(form, "run_weekdays") : "",
    swim: extras.includes("swim") ? fieldValue(form, "swim_weekdays") : "",
    bike: extras.includes("bike") ? fieldValue(form, "bike_weekdays") : "",
  };
  const setDays = (name, value) => {
    const el = fieldOf(form, name);
    if (el) el.value = value;
  };
  setDays("run_weekdays", primary.includes("run") ? blocks.run.join(",") : keep.run);
  setDays("strength_weekdays", strength ? blocks.strength.join(",") : "");
  setDays("swim_weekdays", primary.includes("swim") ? blocks.swim.join(",") : keep.swim);
  setDays("bike_weekdays", primary.includes("bike") ? blocks.bike.join(",") : keep.bike);
  if (primary.includes("run") && !startToRun && !form.dataset.longPicked) setLongWeekday(form, blocks.long);
  else if (primary.includes("run") && !startToRun) ensureLongWeekday(form, blocks.run, blocks.long);
  else if (startToRun) setLongWeekday(form, null);
  // Seeded — but not user-locked, so recommended day-count changes can reseed.
  form.dataset.blocksPicked = "1";
  paintWeekBlocks(form);
}

function bindWeekBlocksOnce() {
  const box = document.getElementById("week-blocks");
  if (!box || box.dataset.weekBound === "1") return;
  box.dataset.weekBound = "1";
  // Swallow every pointer/click inside the week grid so document-level handlers
  // cannot treat a grid edit as a sport / run-days / distance re-pick.
  const isolate = (e) => {
    e.stopPropagation();
  };
  box.addEventListener("pointerdown", isolate);
  box.addEventListener("mousedown", isolate);
  box.addEventListener("mouseup", isolate);
  box.addEventListener("click", (e) => {
    const form = document.querySelector(".setup-form");
    if (!form) return;
    // Keep week clicks local so outside handlers can’t reset the grid.
    e.preventDefault();
    e.stopPropagation();
    const longBtn = e.target.closest("[data-set-long]");
    const removeDisc = e.target.closest("[data-remove-discipline]");
    const dayToggle = e.target.closest("button[data-block][data-day]");
    if (longBtn) {
      setLongRunDay(form, Number(longBtn.getAttribute("data-set-long")));
      return;
    }
    if (removeDisc) {
      const key = removeDisc.getAttribute("data-remove-discipline");
      if (removeExtraDiscipline(form, key)) paintWeekBlocks(form);
      return;
    }
    if (dayToggle && !dayToggle.disabled) {
      toggleBlockDay(form, dayToggle.getAttribute("data-block"), Number(dayToggle.getAttribute("data-day")));
    }
  });
}

function paintWeekBlocks(form) {
  const box = document.getElementById("week-blocks");
  const wrap = form.querySelector(".week-blocks-field");
  if (!box || !wrap) return;
  bindWeekBlocksOnce();
  // Never auto-seed here — that raced with applyDefaultBlocks and locked an empty grid.
  // Seeding belongs to applyDefaultBlocks / updateTrainingAdvice when !weekEdited.
  const sport = setupSport(form);
  if (sport && !fieldValue(form, "sport")) setChoice(form, "sport", sport, "data-sport");
  const strength = fieldValue(form, "strength") === "yes";
  const primary = primaryDisciplines(sport);
  const extras = syncExtrasToSport(form);
  const rows = [];
  // Event disciplines are always present and never removable.
  ["run", "swim", "bike"].forEach((key) => {
    const label = disciplineRowLabel(sport, key);
    if (primary.includes(key)) rows.push([key, label, false]);
    else if (extras.includes(key)) rows.push([key, label, true]);
  });
  releaseBusyDays(form);
  if (strength) rows.push(["strength", disciplineRowLabel(sport, "strength"), false]);
  if (sport || rows.length) rows.push(["busy", disciplineRowLabel(sport, "busy"), false]);
  const showWeek = !!sport || rows.some(([k]) => k !== "busy");
  wrap.hidden = !showWeek;
  if (!showWeek) wrap.setAttribute("hidden", "");
  else wrap.removeAttribute("hidden");
  if (!showWeek) {
    box.innerHTML = "";
    return;
  }
  const blocks = currentBlocks(form);
  if (primary.includes("run") && blocks.run.length) {
    ensureLongWeekday(form, blocks.run, currentLongWeekday(form));
  }
  const longDay = currentLongWeekday(form);
  const needsLong = setupNeedsLongDay(form);
  const overlapDays = new Set();
  for (let i = 0; i < 7; i++) {
    if (blocks.busy.includes(i)) continue;
    const count = ["run", "strength", "swim", "bike"].filter((k) => blocks[k].includes(i)).length;
    if (count > 1) overlapDays.add(i);
  }
  const notes = typeof trainingOverlapNotes === "function" ? trainingOverlapNotes(sport, blocks) : { warns: [], info: [] };
  const weekdayLabels = WEEKDAY_NAMES();
  box.innerHTML = `
    <table class="week-picker">
      <thead><tr><th></th>${weekdayLabels.map((d) => `<th>${d}</th>`).join("")}<th></th></tr></thead>
      <tbody>
        ${rows.map(([key, label, extra]) => `
          <tr class="${key === "busy" ? "busy-row" : ""}">
            <th>${label}</th>
            ${weekdayLabels.map((_, i) => {
              const on = blocks[key].includes(i);
              const isLong = key === "run" && on && longDay === i;
              const blocked = key !== "busy" && blocks.busy.includes(i);
              const overlap = on && overlapDays.has(i);
              const risky = overlap && notes.warns.some((w) => w.startsWith(WEEKDAY_KEYS[i]));
              const mark = isLong ? "L" : on ? "✓" : "";
              const title = blocked
                ? "Busy — this day stays clear"
                : key === "busy"
                  ? (on ? "Unmark this busy day" : "Mark this day busy")
                  : (on ? `Remove ${label.toLowerCase()} on ${weekdayLabels[i]}` : `Add ${label.toLowerCase()} on ${weekdayLabels[i]}`);
              return `<td><button class="day-toggle ${on ? "active" : ""} ${isLong ? "long-on" : ""} ${key === "busy" && on ? "busy-on" : ""} ${blocked ? "day-busy" : ""} ${overlap ? (risky ? "overlap-warn" : "overlap-ok") : ""}" type="button" data-block="${key}" data-day="${i}" aria-pressed="${on}" title="${title}" ${blocked ? "disabled" : ""}>${mark}</button></td>`;
            }).join("")}
            <td class="row-end">${extra ? `<button class="row-remove" type="button" data-remove-discipline="${key}" aria-label="Remove ${label} line" title="Remove ${label}">×</button>` : ""}</td>
          </tr>`).join("")}
      </tbody>
    </table>
    ${longRunPicker(blocks, longDay, sport)}`;
  paintExtraDisciplineChoices(form, primary, extras);
  const info = document.getElementById("overlap-info");
  const warn = document.getElementById("overlap-warn");
  const hint = document.getElementById("week-blocks-hint");
  if (hint) {
    const longLabel = longDay != null ? weekdayLabels[longDay] : "";
    if (needsLong && primary.includes("run") && !longLabel) {
      hint.textContent = sport === "walk"
        ? "Tap a walk day to add it. This distance needs a long walk — pick the day under the week."
        : "Tap a run day to add it. This distance needs a long run — pick the day under the week.";
    } else {
      hint.textContent = "Tap a day to add or remove it. Mark busy days you can’t train.";
    }
  }
  if (info) info.textContent = notes.info.join(" ");
  if (warn) {
    const longWarn = needsLong && (longDay == null || !blocks.run.includes(longDay))
      ? (sport === "walk"
        ? "This distance needs a long-walk day — tap at least one walk day, then choose it under the week."
        : "This distance needs a long-run day — tap at least one run day, then choose it under the week.")
      : "";
    const pressure = trainingDayPressure(form, sport || setupSport(form));
    const busyWarn = (pressure.tooBusy || pressure.tooFewSport)
      ? `Only ${pressure.free} free day${pressure.free === 1 ? "" : "s"} left (need ~${pressure.minDays}). The plan may fail to place enough sessions.`
      : "";
    warn.textContent = [longWarn, busyWarn, ...notes.warns].filter(Boolean).join(" ");
  }
}

function paintExtraDisciplineChoices(form, primary, extras) {
  const bar = document.getElementById("extra-discipline");
  const box = document.getElementById("extra-discipline-choices");
  if (!bar || !box) return;
  const sport = setupSport(form);
  const available = ["run", "swim", "bike"].filter((k) => !primary.includes(k) && !extras.includes(k));
  bar.hidden = !available.length;
  if (available.length) bar.removeAttribute("hidden");
  box.innerHTML = available.map((k) => `
    <button class="choice-btn" type="button" data-add-discipline="${k}">${disciplineRowLabel(sport, k)}</button>`).join("");
}

function longRunPicker(blocks, longDay, sport = "") {
  const run = blocks.run || [];
  if (run.length < 2) return "";
  const label = sport === "walk" ? (typeof window.t === "function" ? window.t("setup.longWalk") : "Long walk") : (typeof window.t === "function" ? window.t("kind.long") : "Long run");
  return `
    <div class="long-run-pick">
      <span>${label}</span>
      ${run.map((i) => `<button class="choice-btn${longDay === i ? " active" : ""}" type="button" data-set-long="${i}">${WEEKDAY_NAMES()[i]}</button>`).join("")}
    </div>`;
}

function releaseBusyDays(form) {
  parseDays(fieldValue(form, "busy_weekdays")).forEach((day) => clearDayFromTraining(form, day));
}

function clearDayFromTraining(form, day) {
  ["run", "strength", "swim", "bike"].forEach((key) => {
    const field = weekdayField(form, key) || fieldOf(form, `${key}_weekdays`);
    if (!field) return;
    const days = parseDays(field.value).filter((d) => d !== day);
    field.value = days.join(",");
    if (key === "run") {
      setRunDays(form, days.length || "");
      if (currentLongWeekday(form) === day) {
        form.dataset.longPicked = "1";
        ensureLongWeekday(form, days);
      }
    }
  });
}

/** Move any training on `day` to the first free non-busy day (used when marking busy). */
function relocateDayTraining(form, day) {
  const busy = new Set(parseDays(fieldValue(form, "busy_weekdays")));
  busy.add(day);
  const freePrefer = [2, 1, 3, 0, 4, 6, 5].filter((d) => !busy.has(d));
  const freeAny = [0, 1, 2, 3, 4, 5, 6].filter((d) => !busy.has(d));
  if (!freeAny.length) {
    clearDayFromTraining(form, day);
    return;
  }
  ["run", "strength", "swim", "bike"].forEach((key) => {
    const field = weekdayField(form, key) || fieldOf(form, `${key}_weekdays`);
    if (!field) return;
    const days = parseDays(field.value);
    if (!days.includes(day)) return;
    let next = days.filter((d) => d !== day);
    const target = freePrefer.find((d) => !next.includes(d))
      ?? freeAny.find((d) => !next.includes(d))
      ?? freeAny[0];
    if (target != null && !next.includes(target)) {
      next = [...next, target].sort((a, b) => a - b);
    }
    field.value = next.join(",");
    if (key === "run") {
      setRunDays(form, next.length || "");
      if (currentLongWeekday(form) === day) {
        form.dataset.longPicked = "1";
        if (target != null && next.includes(target)) setLongWeekday(form, target);
        else ensureLongWeekday(form, next);
      }
    }
  });
}

function trainingDayPressure(form, sport) {
  const busy = parseDays(fieldValue(form, "busy_weekdays"));
  const free = 7 - busy.length;
  const preset = fieldValue(form, "preset") || form.dataset.pickedPreset || "";
  const experience = fieldValue(form, "experience") || "intermediate";
  const custom = {
    run: fieldValue(form, "custom_run"),
    run2: fieldValue(form, "custom_run2"),
    swim: fieldValue(form, "custom_swim"),
    bike: fieldValue(form, "custom_bike"),
  };
  const advice = typeof window.trainingAdvice === "function"
    ? window.trainingAdvice(sport, preset, custom, experience)
    : { minDays: 3, showRunDays: sport === "run" || sport === "walk" || sport === "triathlon" || sport === "duathlon" || sport === "aquathlon" };
  const startToRun = setupUsesStartToRun(form);
  const minDays = startToRun ? 1 : Math.max(2, Number(advice.minDays) || 3);
  const sportDays = new Set();
  ["run", "swim", "bike", "strength"].forEach((k) => {
    parseDays(fieldValue(form, `${k}_weekdays`)).forEach((d) => sportDays.add(d));
  });
  const primaryCount = advice.showRunDays
    ? parseDays(fieldValue(form, "run_weekdays")).length
    : sport === "swim"
      ? parseDays(fieldValue(form, "swim_weekdays")).length
      : sport === "bike" || sport === "ski"
        ? parseDays(fieldValue(form, "bike_weekdays")).length
        : sportDays.size;
  const tooBusy = free < minDays;
  const tooFewSport = primaryCount < minDays
    || (!startToRun && sportDays.size < Math.min(2, minDays));
  return { tooBusy, tooFewSport, free, minDays, primaryCount, sportCount: sportDays.size, busy: busy.length };
}

function toggleBlockDay(form, key, day) {
  const field = weekdayField(form, key) || fieldOf(form, `${key}_weekdays`);
  if (!field) return;
  // Replacing the grid mid-click can re-enter this handler on the same cell and
  // undo the tap. Busy often looked fine because a second busy toggle was rarer.
  if (toggleBlockDay._busy) return;
  toggleBlockDay._busy = true;
  queueMicrotask(() => { toggleBlockDay._busy = false; });
  const days = parseDays(field.value);
  const turningOn = !days.includes(day);
  if (key === "busy" && turningOn) relocateDayTraining(form, day);
  if (key !== "busy" && turningOn) {
    const busyField = fieldOf(form, "busy_weekdays");
    if (busyField) {
      busyField.value = parseDays(busyField.value).filter((d) => d !== day).join(",");
    }
  }
  const next = turningOn ? [...days, day].sort((a, b) => a - b) : days.filter((d) => d !== day);
  field.value = next.join(",");
  markWeekEdited(form);
  if (key === "run") {
    form.dataset.runDaysPicked = "1";
    setRunDays(form, next.length || "", true);
    if (!turningOn && currentLongWeekday(form) === day) ensureLongWeekday(form, next);
    else ensureLongWeekday(form, next, currentLongWeekday(form));
  }
  // Repaint only — do not run updateTrainingAdvice here (it used to reseed the week).
  paintWeekBlocks(form);
}

function setLongRunDay(form, day) {
  const runDays = parseDays(fieldValue(form, "run_weekdays"));
  if (!runDays.includes(day)) return;
  setLongWeekday(form, day);
  form.dataset.longPicked = "1";
  markWeekEdited(form);
  // Do not call updateTrainingAdvice — that path used to rebuild the week.
  paintWeekBlocks(form);
  updateReachability(form);
  saveSetupDraft(form);
}

function syncExperienceFromWeekly(form) {
  if (!form || form.dataset.experiencePicked) return;
  const km = weeklyKmFromForm(form);
  const shown = fieldValue(form, "weekly_km");
  if (!(km > 0) || typeof window.experienceFromWeeklyKm !== "function") return;
  const sport = setupSport(form) || "run";
  const level = window.experienceFromWeeklyKm(km, sport);
  setChoice(form, "experience", level, "data-experience");
  const hint = document.getElementById("experience-hint");
  if (hint) {
    const label = level === "beginner" ? "beginner" : level === "advanced" ? "advanced" : "intermediate";
    const sportLabel = (window.SPORT_LABEL && window.SPORT_LABEL[sport]) || "training";
    const unit = distLabel();
    hint.textContent = `Suggested ${label} for ${sportLabel.toLowerCase()} from ${shown} ${unit}/week`;
  }
}

function updateReachability(form) {
  const box = document.getElementById("reachability-box");
  const warn = document.getElementById("reachability-warn");
  if (!box || !warn || !form) return;
  if (typeof window.eventReachability !== "function") {
    box.hidden = true;
    return;
  }
  const sport = setupSport(form);
  const preset = effectivePreset(form);
  const parse = (v, convert) => {
    if (!(Number(v) > 0)) return v;
    return convert && typeof window.parseDistInput === "function" ? window.parseDistInput(v) : v;
  };
  const info = window.eventReachability({
    sport,
    presetId: preset,
    custom: {
      run: parse(fieldValue(form, "custom_run"), true),
      run2: parse(fieldValue(form, "custom_run2"), true),
      swim: fieldValue(form, "custom_swim"),
      bike: parse(fieldValue(form, "custom_bike"), true),
    },
    weeklyKm: weeklyKmFromForm(form),
    eventDate: fieldValue(form, "event_date"),
    goalType: setupGoal(form),
  });
  form.dataset.reachLevel = info.level || "ok";
  if (info.level === "ok" || !info.message) {
    box.hidden = true;
    warn.textContent = "";
    return;
  }
  box.hidden = false;
  box.removeAttribute("hidden");
  warn.textContent = `${info.message} You train and race at your own risk — tick the agreement below to continue.`;
}

function updateTrainingAdvice() {
  const form = document.querySelector(".setup-form");
  if (!form) return;
  syncExperienceFromWeekly(form);
  paintFitnessProgram(form);
  updateStartToRunChrome(form);
  updateWeeklyVolumeLimits(form);
  updateReachability(form);
  const advice = setupAdvice(form);
  const startToRun = setupUsesStartToRun(form);
  const runField = form.querySelector(".run-days-field");
  const daysHint = document.getElementById("run-days-hint");
  const strengthHint = document.getElementById("strength-hint");
  const expHint = document.getElementById("experience-hint");
  if (expHint && form.dataset.experiencePicked) {
    const sport = setupSport(form);
    expHint.textContent = startToRun
      ? tt("setup.experienceStartToRunHint")
      : (sport === "run" || sport === "walk" || sport === "triathlon" || sport === "duathlon" || sport === "aquathlon")
        ? (sport === "walk"
          ? "This changes how many walk days are recommended."
          : "This changes how many run days are recommended.")
        : "This changes how hard the week is built for your event type.";
  }
  if (!advice) {
    if (runField) {
      runField.hidden = true;
      runField.setAttribute("hidden", "");
    }
    paintWeekBlocks(form);
    return;
  }
  if (startToRun) {
    advice.minDays = 1;
    advice.recDays = typeof window.startToRunRecommendedFreq === "function"
      ? window.startToRunRecommendedFreq(weeklyKmFromForm(form))
      : 1;
    advice.daysHint = tt("setup.startToRunDaysHint");
    advice.showRunDays = true;
  }
  if (runField) {
    if (advice.showRunDays) {
      runField.hidden = false;
      runField.removeAttribute("hidden");
    } else {
      runField.hidden = true;
      runField.setAttribute("hidden", "");
    }
  }
  const dayOptions = startToRun ? [1, 2, 3] : [3, 4, 5, 6];
  const existingOpts = [...form.querySelectorAll("#run-day-choices [data-run-days]")].map((b) => Number(b.dataset.runDays));
  const optsChanged = dayOptions.length !== existingOpts.length
    || dayOptions.some((n, i) => n !== existingOpts[i]);
  if (optsChanged) paintRunDayChoices(form, dayOptions);
  // Keep the recommended day count selected until the athlete picks another.
  let runDaysChanged = false;
  const recDays = Number(advice.recDays) || 0;
  if (advice.showRunDays && !form.dataset.runDaysPicked) {
    if (recDays && Number(fieldValue(form, "run_days")) !== recDays) {
      setRunDays(form, recDays);
      runDaysChanged = true;
    } else if (recDays) {
      setRunDays(form, recDays);
    }
  } else if (form.dataset.runDaysPicked) {
    setRunDays(form, fieldValue(form, "run_days"), true);
  }
  // Paint the recommended badge after the active day count is set.
  form.querySelectorAll("[data-run-days]").forEach((b) => {
    const isRec = Number(b.dataset.runDays) === recDays;
    b.classList.toggle("recommended", isRec);
    let badge = b.querySelector(".rec");
    if (isRec) {
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "rec";
        b.appendChild(badge);
      }
      badge.textContent = "recommended";
    } else if (badge) {
      badge.remove();
    }
  });
  const chosen = Number(fieldValue(form, "run_days"));
  if (daysHint) {
    const belowMin = chosen > 0 && chosen < advice.minDays;
    daysHint.classList.toggle("warn", belowMin);
    if (belowMin) {
      daysHint.textContent = `That's below the ${advice.minDays}-day minimum for this distance. You can still continue, but sessions will be longer and injury risk goes up.`;
    } else if (advice.showRunDays && recDays) {
      // Always keep a short recommendation visible (including beginner + race).
      daysHint.textContent = advice.daysHint
        || `Recommended: ${recDays} run day${recDays === 1 ? "" : "s"} a week for your level.`;
    } else {
      daysHint.textContent = advice.daysHint || "";
    }
    if (daysHint.textContent) {
      daysHint.hidden = false;
      daysHint.removeAttribute("hidden");
    } else {
      daysHint.hidden = true;
      daysHint.setAttribute("hidden", "");
    }
  }
  if (strengthHint) {
    strengthHint.textContent = advice.strengthHint || "";
    strengthHint.hidden = !strengthHint.textContent;
  }
  // When strength is recommended, default to Yes with a proposed day already placed.
  if (!form.dataset.strengthPicked) {
    const want = advice.strengthRecommended ? "yes" : "no";
    if (fieldValue(form, "strength") !== want) {
      setChoice(form, "strength", want, "data-strength");
    }
    if (want === "yes") {
      const strengthEl = fieldOf(form, "strength_weekdays");
      if (strengthEl && !parseDays(strengthEl.value).length && typeof defaultTrainingBlocks === "function") {
        const sport = setupSport(form) || "run";
        const startToRun = setupUsesStartToRun(form);
        const n = Number(fieldValue(form, "run_days")) || (startToRun ? 1 : 3);
        const busy = parseDays(fieldValue(form, "busy_weekdays"));
        const blocks = defaultTrainingBlocks(sport, n, true, busy, { startToRun });
        strengthEl.value = (blocks.strength || []).join(",");
      }
    }
  }
  syncChoiceButtons(form, "data-strength", fieldValue(form, "strength"));
  paintStrengthGearBox(form);
  // Time-goal flows: date/time edits must never leave sport + distance wiped.
  if (setupGoal(form) === "time") ensureTimeDistanceVisible(form);
  // Seed / refresh the proposal only when the athlete hasn't hand-edited the grid.
  if (!weekEditedByUser(form) && setupSport(form)) {
    const needsSeed = runDaysChanged
      || !hasTrainingWeekdaySelection(form)
      || form.dataset.blocksPicked !== "1";
    if (needsSeed) applyDefaultBlocks(form, { force: true });
    else paintWeekBlocks(form);
  } else {
    paintWeekBlocks(form);
  }
  saveSetupDraft(form);
}

function currentStrengthMode(form) {
  const mode = form?.dataset?.strengthMode || "";
  if (mode === "bodyweight" || mode === "gym" || mode === "home") return mode;
  return typeof window.strengthAccessLevel === "function" ? window.strengthAccessLevel() : "bodyweight";
}

function paintStrengthGearBox(form) {
  const box = document.getElementById("strength-gear-box");
  const hint = document.getElementById("strength-gear-hint");
  const actions = document.getElementById("strength-gear-actions");
  if (!box || !hint || !actions) return;
  const wantStrength = fieldValue(form, "strength") === "yes";
  if (!wantStrength) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  box.removeAttribute("hidden");
  const selected = currentStrengthMode(form);
  const advice = typeof window.strengthGearAdvice === "function" ? window.strengthGearAdvice() : "";
  hint.textContent = advice || "";
  hint.hidden = !hint.textContent;
  actions.innerHTML = `
    <button class="choice-btn${selected === "bodyweight" ? " active" : ""}" type="button" data-action="setup-strength-mode" data-mode="bodyweight">Bodyweight</button>
    <button class="choice-btn${selected === "gym" ? " active" : ""}" type="button" data-action="setup-strength-mode" data-mode="gym">Gym membership</button>
    <button class="choice-btn${selected === "home" ? " active" : ""}" type="button" data-action="setup-strength-mode" data-mode="home">Home gym</button>
    ${selected === "home" ? `<button class="choice-btn" type="button" data-action="setup-manage-strength-gear">Manage gear</button>` : ""}`;
}

/** Switch bodyweight / gym / home gym. Preference updates immediately; gear add is best-effort. */
function pickStrengthMode(form, mode) {
  if (!form || !["bodyweight", "gym", "home"].includes(mode)) return;
  form.dataset.strengthMode = mode;
  paintStrengthGearBox(form);
  saveSetupDraft(form);
  if (mode === "home") {
    openSetupStrengthGearDialog();
    return;
  }
  if (mode === "gym" && typeof window.quickAddStrengthGear === "function") {
    window.quickAddStrengthGear("gym", { insert: true, skipRender: true, silent: true }).then(() => {
      paintStrengthGearBox(form);
    }).catch(() => {
      // Preference already saved — gear inventory can be updated later.
    });
  }
}

function openSetupStrengthGearDialog() {
  const dialog = document.getElementById("day-dialog");
  if (!dialog) return;
  const active = typeof window.activeStrengthGear === "function"
    ? window.activeStrengthGear().filter((g) => g.type !== "gym")
    : [];
  const kinds = ["kettlebell", "dumbbells", "bands", "pullup", "barbell"];
  const labels = {
    kettlebell: "Kettlebell",
    dumbbells: "Dumbbells",
    bands: "Bands",
    pullup: "Pull-up bar",
    barbell: "Barbell",
  };
  const owned = new Set(active.map((g) => g.type));
  const list = active.length
    ? `<ul class="gear-list">${active.map((g) => `<li><strong>${escAttr(g.name)}</strong><span class="muted">${escAttr(g.note || labels[g.type] || g.type)}</span></li>`).join("")}</ul>`
    : `<p class="muted">No home gym gear yet. Add what you train with.</p>`;
  const chips = kinds.map((type) => {
    const has = owned.has(type);
    return `<button class="choice-btn${has ? " is-on" : ""}" type="button" data-action="setup-quick-gear" data-type="${type}">${has ? "✓ " : "+ "}${labels[type]}</button>`;
  }).join("");
  dialog.innerHTML = `
    <div class="dialog-body">
      <header class="dialog-head">
        <div>
          <div class="eyebrow">Strength</div>
          <h2>Home gym gear</h2>
        </div>
        <button class="icon-button" type="button" data-action="close-dialog" aria-label="Close">✕</button>
      </header>
      <p class="muted">Home gym sessions use the strength gear in your inventory.</p>
      ${list}
      <div class="choice-row gear-quick" style="margin-top:12px">${chips}</div>
      <div class="form-actions" style="margin-top:16px">
        <a class="button ghost" href="/gear">Open full gear page</a>
        <button class="button" type="button" data-action="close-dialog">Done</button>
      </div>
    </div>`;
  if (!dialog.open) dialog.showModal();
}

function paintTimeTargets(form) {
  const box = document.getElementById("time-goal-choices");
  const customWrap = document.getElementById("time-custom-wrap");
  if (!box || !form) return;
  // Never let time-goal painting disturb the distance fieldset.
  ensureTimeDistanceVisible(form);
  const preset = fieldValue(form, "preset");
  const sport = setupSport(form) || "run";
  const savedTime = fieldValue(form, "time_custom");
  const timeInput = (placeholder) => `
    <label class="time-custom-label">Target time (hh:mm:ss)
      <input type="text" name="time_custom" inputmode="text" placeholder="${placeholder}" value="${escAttr(savedTime)}" />
    </label>`;
  const showCustomInput = (placeholder) => {
    if (!customWrap) return;
    customWrap.hidden = false;
    customWrap.removeAttribute("hidden");
    customWrap.innerHTML = timeInput(placeholder);
  };
  const hideCustomInput = () => {
    if (!customWrap) return;
    customWrap.hidden = true;
    customWrap.innerHTML = "";
  };
  if (!preset) {
    box.innerHTML = `<p class="muted">Pick a distance first.</p>`;
    hideCustomInput();
    return;
  }
  if (preset === "custom") {
    // Custom distance → only a free-text target time (no Sub-X chips).
    setChoice(form, "time_goal", "custom", "data-time-target");
    box.innerHTML = "";
    showCustomInput("e.g. 0:28:00 or 1:25:00");
    return;
  }
  const goals = (window.TIME_GOALS || []).filter((g) => g.preset === preset && (!g.sport || g.sport === sport));
  let current = fieldValue(form, "time_goal");
  if (current && current !== "custom" && !goals.some((g) => g.id === current)) {
    const el = fieldOf(form, "time_goal");
    if (el) el.value = "";
    current = "";
  }
  box.innerHTML = goals.map((g) => `
    <button class="choice-btn" type="button" data-time-target="${g.id}">${g.label}</button>`).join("")
    + `<button class="choice-btn" type="button" data-time-target="custom">Custom</button>`;
  syncChoiceButtons(form, "data-time-target", current);
  if (current === "custom") showCustomInput("e.g. 0:28:00 or 1:25:00");
  else hideCustomInput();
}

/** Keep sport + distance visible while editing a time goal. */
function ensureTimeDistanceVisible(form) {
  if (!form) return;
  if (setupGoal(form) !== "time" && form.dataset.timeChrome !== "1") return;
  form.querySelectorAll("[data-setup-sport], [data-setup-distance], [data-setup-time-goal]").forEach((el) => {
    el.hidden = false;
    el.removeAttribute("hidden");
  });
  const dateWrap = form.querySelector("[data-setup-date]");
  if (dateWrap?.hidden) {
    dateWrap.hidden = false;
    dateWrap.removeAttribute("hidden");
  }
  const sport = setupSport(form) || form.dataset.pickedSport || "";
  const box = document.getElementById("distance-choices");
  if (!sport || !box) return;
  const hasButtons = box.querySelectorAll("[data-preset]").length > 0;
  const preset = fieldValue(form, "preset") || form.dataset.pickedPreset || "";
  if (!hasButtons) {
    paintDistances(sport, { keepPreset: true, resetExtras: false, skipTimeTargets: true, skipAdvice: true });
  } else if (preset) {
    box.querySelectorAll("[data-preset]").forEach((b) => {
      b.classList.toggle("active", b.dataset.preset === preset);
    });
  }
}

function pickTimeTarget(form, targetId) {
  if (!form || !targetId) return;
  ensureTimeDistanceVisible(form);
  setChoice(form, "time_goal", targetId, "data-time-target");
  paintTimeTargets(form);
  updateTrainingAdvice();
  saveSetupDraft(form);
}

function paintDistances(sport, opts = {}) {
  const box = document.getElementById("distance-choices");
  const form = document.querySelector(".setup-form");
  if (!box || !form) return;
  const goal = setupGoal(form);
  const keepTime = goal === "time" || form.dataset.timeChrome === "1" || timeChromeShielded();
  const distanceWrap = form.querySelector("[data-setup-distance]");
  if (distanceWrap && (keepTime || form.dataset.ownEvent === "1")) {
    distanceWrap.hidden = false;
    distanceWrap.removeAttribute("hidden");
  }
  const hadButtons = !!box.querySelector("[data-preset]");
  if (!sport) {
    // Never wipe existing chips — that is the “distance disappeared” bug.
    if (!hadButtons) box.innerHTML = `<p class="muted">${tt("setup.pickSport")}</p>`;
    return;
  }
  const all = (window.EVENT_PRESETS || {})[sport] || [];
  let presets = all;
  if (keepTime || goal === "time") {
    const allowed = (window.TIME_PRESETS && window.TIME_PRESETS[sport]) || [];
    presets = all.filter((p) => allowed.includes(p.id));
  }
  if (!presets.length) {
    if (!hadButtons) box.innerHTML = `<p class="muted">No distances available for this sport.</p>`;
    return;
  }
  const prevPreset = fieldValue(form, "preset") || form.dataset.pickedPreset || "";
  const existing = [...box.querySelectorAll("[data-preset]")].map((b) => b.dataset.preset);
  const wanted = presets.map((p) => p.id);
  const sameButtons = existing.length === wanted.length && existing.every((id, i) => id === wanted[i]);
  // Keep existing distance labels in place when the set is unchanged.
  if (!sameButtons) {
    box.innerHTML = presets.map((p) => `
      <button class="choice-btn" type="button" data-preset="${p.id}">${p.label}</button>`).join("");
  }
  if (!opts.keepPreset) {
    const presetEl = fieldOf(form, "preset");
    if (presetEl) presetEl.value = "";
    delete form.dataset.pickedPreset;
    delete form.dataset.runDaysPicked;
    delete form.dataset.strengthPicked;
    delete form.dataset.longPicked;
    // Sport changes clear the week before paintDistances; don't blank a locked week here.
    if (!weekEditedByUser(form)) {
      delete form.dataset.weekEdited;
      delete form.dataset.blocksPicked;
      setLongWeekday(form, "");
    }
    if (opts.resetExtras !== false) form.dataset.extraDisciplines = "";
    toggleCustom(sport, "", { skipAdvice: true });
  } else {
    const preset = prevPreset;
    if (preset) {
      const presetEl = fieldOf(form, "preset");
      if (presetEl && !presetEl.value) presetEl.value = preset;
      form.dataset.pickedPreset = preset;
    }
    box.querySelectorAll("[data-preset]").forEach((b) => {
      b.classList.toggle("active", b.dataset.preset === preset);
    });
    toggleCustom(sport, preset, { skipAdvice: true });
  }
  if ((keepTime || goal === "time") && !opts.skipTimeTargets) paintTimeTargets(form);
  updateWeeklyVolumeLimits(form);
  if (!opts.skipAdvice) updateTrainingAdvice();
}

function pickDistancePreset(form, presetId) {
  if (!form || !presetId) return;
  if (setupGoal(form) === "time" || form.dataset.timeChrome === "1") {
    form.dataset.timeChrome = "1";
    shieldTimeChrome(1000);
  }
  const presetEl = fieldOf(form, "preset");
  if (presetEl) presetEl.value = presetId;
  form.dataset.pickedPreset = presetId;
  const box = document.getElementById("distance-choices");
  // Only toggle active — never rebuild / clear the chip list.
  box?.querySelectorAll("[data-preset]").forEach((b) => {
    b.classList.toggle("active", b.dataset.preset === presetId);
  });
  // Distance only changes volume / long-run needs. Never wipe the week grid here —
  // clearing weekdays first caused the schedule to flash empty (and feel "invalidated").
  // updateTrainingAdvice reseeds only when the athlete hasn't locked the week.
  if (!weekEditedByUser(form)) {
    delete form.dataset.runDaysPicked;
    delete form.dataset.longPicked;
  }
  const sport = setupSport(form);
  toggleCustom(sport, presetId, { skipAdvice: true });
  if (setupGoal(form) === "time" || form.dataset.timeChrome === "1") {
    ensureTimeDistanceVisible(form);
    paintTimeTargets(form);
  }
  // Own-event sports editor: distance chips seed day 1 the same way as the agenda form.
  if (form.dataset.ownEvent === "1" && !form.dataset.pickedEvent
    && typeof window.normalizeEventLegs === "function"
    && typeof window.presetToLegItems === "function") {
    const start = fieldValue(form, "event_date");
    if (start) {
      const multi = setupIsMultiDay(form);
      const end = multi ? (fieldValue(form, "event_end_date") || start) : start;
      let legs = [];
      try {
        legs = JSON.parse(form.dataset.eventLegsJson || fieldValue(form, "event_legs_json") || "[]");
      } catch { legs = []; }
      legs = window.normalizeEventLegs(start, end, legs);
      const seed = window.presetToLegItems(sport, presetId);
      legs = legs.map((leg, i) => (i === 0 ? { date: leg.date, items: seed } : leg));
      form.dataset.eventLegsJson = JSON.stringify(legs);
      paintSetupEventLegs(form);
    }
  }
  updateTrainingAdvice();
  saveSetupDraft(form);
}

function toggleCustom(sport, preset, opts = {}) {
  const wrap = document.querySelector(".custom-dists");
  if (!wrap) return;
  const fields = setupFields(sport, preset);
  wrap.hidden = !fields.run && !fields.swim && !fields.bike && !fields.run2;
  wrap.querySelector(".custom-run").hidden = !fields.run;
  const run2 = wrap.querySelector(".custom-run2");
  if (run2) run2.hidden = !fields.run2;
  wrap.querySelector(".custom-swim").hidden = !fields.swim;
  wrap.querySelector(".custom-bike").hidden = !fields.bike;
  if (!opts.skipAdvice) updateTrainingAdvice();
}

function showAppChrome() {
  document.body.classList.remove("onboarding", "logged-out");
  const header = document.getElementById("app-header");
  if (header) header.hidden = false;
  const hasPlan = !!window.CURRENT_PLAN;
  document.querySelectorAll("[data-route]").forEach((el) => {
    if (
      el.dataset.route === "home"
      || el.dataset.route === "plan"
      || el.dataset.route === "profile"
      || el.dataset.route === "activities"
    ) el.hidden = false;
    else el.hidden = !hasPlan;
  });
  const importBtn = document.querySelector(".import-btn");
  if (importBtn) importBtn.hidden = false;
  const syncBtn = document.querySelector(".sync-btn");
  if (syncBtn) syncBtn.hidden = false;
}

async function leaveSetupToHome() {
  clearSetupDraft();
  try { sessionStorage.removeItem("plan-create-only"); } catch { /* ignore */ }
  markConnectStepDone();
  if (!window.CURRENT_PLAN) markSkipped(window.CURRENT_USER_ID);
  const app = document.getElementById("app");
  if (app) {
    app.hidden = false;
    app.dataset.route = "home";
  }
  // Drop setup DOM before any concurrent enterApp can treat us as still onboarding.
  document.body.classList.remove("onboarding");
  showAppChrome();
  history.replaceState(null, "", "/home" + location.search);
  if (!window.CURRENT_PLAN && window.CURRENT_USER_ID) {
    try { await loadOrCreatePlan({ id: window.CURRENT_USER_ID }); } catch { /* still go home */ }
  }
  // loadOrCreatePlan may have opened setup if skip was missing — force Home again.
  if (document.body.classList.contains("onboarding") || document.querySelector(".setup-form, .setup-connect-step, .setup-creating")) {
    markSkipped(window.CURRENT_USER_ID);
    document.body.classList.remove("onboarding");
    if (app) {
      app.dataset.route = "home";
      app.innerHTML = "";
    }
  }
  showAppChrome();
  history.replaceState(null, "", "/home" + location.search);
  try {
    if (typeof window.bootApp === "function") await window.bootApp();
  } catch { /* still paint home */ }
  if (typeof window.go === "function") window.go("/home", { replace: true, force: true });
  else if (typeof window.render === "function") window.render(true);
}
window.leaveSetupToHome = leaveSetupToHome;

function showSetupCreatingPlan() {
  const createOnly = isCreatePlanOnly();
  prepareSetupShell({
    path: createOnly ? "/create-plan" : "/setup",
    hideNav: !createOnly,
  });
  if (createOnly) {
    showAppChrome();
    document.body.classList.add("onboarding");
  }
  const app = document.getElementById("app");
  if (!app) return;
  app.innerHTML = `
    <section class="auth-card setup-card setup-creating" aria-live="polite" aria-busy="true">
      <p class="setup-creating-label">Creating your plan…</p>
      <p class="muted small-text">Building weeks from your goal and current volume.</p>
    </section>`;
  window.scrollTo(0, 0);
}

async function finishSetupWithPlan(row) {
  clearSetupDraft();
  try { sessionStorage.removeItem("plan-create-only"); } catch { /* ignore */ }
  markConnectStepDone();
  clearSkipped(window.CURRENT_USER_ID);
  applyPlanRow(row);
  const app = document.getElementById("app");
  if (app) {
    app.hidden = false;
    app.dataset.route = "home";
  }
  document.body.classList.remove("onboarding");
  showAppChrome();
  history.replaceState(null, "", "/home" + location.search);
  try {
    if (typeof window.bootApp === "function") await window.bootApp();
  } catch { /* still try to paint home */ }
  if (typeof window.go === "function") window.go("/home", { replace: true });
  else if (typeof window.render === "function") window.render(true);
}
window.finishSetupWithPlan = finishSetupWithPlan;


function collectAgendaOtherEvents(goalStart, goalEnd, agendaEventId) {
  const events = typeof window.peekEvents === "function"
    ? window.peekEvents()
    : (typeof EVENTS !== "undefined" ? EVENTS : []);
  const start = String(goalStart || "").slice(0, 10);
  const end = String(goalEnd || start).slice(0, 10);
  if (!start || !Array.isArray(events)) return [];
  return events.filter((ev) => {
    if (!ev || !ev.date || !ev.name) return false;
    if (agendaEventId && String(ev.id) === String(agendaEventId)) return false;
    if (ev.race) return false;
    const evStart = String(ev.date).slice(0, 10);
    const evEnd = typeof window.eventEndYmd === "function" ? window.eventEndYmd(ev) : evStart;
    // Overlap with plan window up to goal end (generator also filters by plan start).
    return evStart <= end && evEnd >= start;
  }).map((ev) => ({
    ...ev,
    existing: true,
  }));
}

function setupIsMultiDay(form) {
  const flag = fieldValue(form, "multi_day");
  if (flag === "yes") return true;
  if (flag === "no") return false;
  const start = fieldValue(form, "event_date");
  const end = fieldValue(form, "event_end_date");
  return !!(start && end && end > start);
}

function paintSetupEventLegs(form) {
  const box = form?.querySelector("#setup-event-legs");
  if (!box) return;
  const start = fieldValue(form, "event_date");
  const multi = setupIsMultiDay(form);
  const multiEl = form.querySelector("[name=multi_day]");
  if (multiEl) multiEl.value = multi ? "yes" : "no";
  form.querySelectorAll("[data-event-multi]").forEach((b) => {
    b.classList.toggle("active", b.dataset.eventMulti === (multi ? "yes" : "no"));
  });
  form.querySelectorAll(".event-end-wrap").forEach((el) => {
    el.toggleAttribute("hidden", !multi);
  });
  const endEl = form.querySelector("[name=event_end_date]");
  if (endEl && start) {
    endEl.min = start;
    if (!multi) endEl.value = start;
    else if (!endEl.value || endEl.value <= start) {
      const d = new Date(`${start}T12:00:00`);
      d.setDate(d.getDate() + 1);
      endEl.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
  }
  const end = multi ? (fieldValue(form, "event_end_date") || start) : start;
  if (!start) {
    box.hidden = true;
    box.innerHTML = "";
    delete form.dataset.eventLegsJson;
    const hidden = form.querySelector("[name=event_legs_json]");
    if (hidden) hidden.value = "[]";
    return;
  }
  box.hidden = false;
  let legs = [];
  try {
    legs = JSON.parse(form.dataset.eventLegsJson || fieldValue(form, "event_legs_json") || "[]");
  } catch { legs = []; }
  if (typeof window.normalizeEventLegs === "function") {
    legs = window.normalizeEventLegs(start, end, legs);
  }
  if (!legs.some((leg) => (leg.items || []).length)) {
    const sport = fieldValue(form, "sport") || "run";
    const seedSport = sport === "triathlon" ? "run" : sport;
    legs = legs.map((leg, i) => (i === 0 ? { date: leg.date, items: [{ sport: seedSport }] } : leg));
  }
  // eventLegsEditorHtml already embeds legs_json; rewrite that name for setup drafts.
  if (typeof window.eventLegsEditorHtml === "function") {
    box.innerHTML = window.eventLegsEditorHtml(legs, { locked: !!form.dataset.pickedEvent })
      .replace(/name="legs_json"/g, 'name="event_legs_json"');
  } else {
    box.innerHTML = `<p class="muted small-text">${legs.length} day(s) · edit distances on the Events page if needed.</p>
      <input type="hidden" name="event_legs_json" value='${JSON.stringify(legs).replace(/'/g, "&#39;")}' />`;
  }
  form.dataset.eventLegsJson = JSON.stringify(legs);
}
window.paintSetupEventLegs = paintSetupEventLegs;

async function saveGeneratedPlan(userId, input) {
  const generated = generateTrainingPlan(input);
  const acts = typeof window.peekActivities === "function" ? window.peekActivities() : [];
  if (typeof window.personalizePlanPaces === "function" && acts.length) {
    generated.paces = window.personalizePlanPaces(generated.paces, acts, generated);
  }
  // Client-only / optional fields — strip before insert in case DB columns aren't there yet.
  const {
    sources, long_weekday, goal_type, program,
    event_end_date, event_kind, event_legs,
    ...persisted
  } = generated;
  const row = { user_id: userId, ...persisted };
  const { data, error } = await sb.from("plans").insert(row).select("*").single();
  if (error) throw error;
  if (data) {
    data.sources = sources || [];
    data.goal_type = goal_type || input.goalType || "race";
    data.program = program || input.program || "standard";
    if (long_weekday != null) data.long_weekday = long_weekday;
  }
  const raceKm = generated.run_km || generated.bike_km || (generated.swim_m ? generated.swim_m / 1000 : 0);
  const raceEnd = generated.event_end_date || generated.event_date;
  const multi = raceEnd && raceEnd > generated.event_date;
  const raceLegs = Array.isArray(generated.event_legs) ? generated.event_legs
    : (Array.isArray(input.legs) ? input.legs : []);
  const hasRaceLegItems = raceLegs.some((leg) => (leg.items || []).length);
  const raceRow = {
    date: generated.event_date,
    end_date: multi ? raceEnd : null,
    name: generated.event_name,
    km: raceKm || 0,
    race: true,
    sport: generated.sport,
    kind: generated.event_kind || input.eventKind || "race",
    legs: hasRaceLegItems ? raceLegs : [],
    swim_m: generated.swim_m,
    bike_km: generated.bike_km,
    location: String(input.eventLocation || "").trim().slice(0, 80),
  };
  let linked = false;
  if (input.agendaEventId) {
    const patch = { ...raceRow };
    if (!input.sourceId) patch.is_public = !!input.isPublic;
    const { data: updated, error: updErr } = await sb.from("events")
      .update(patch)
      .eq("user_id", userId)
      .eq("id", input.agendaEventId)
      .select("id")
      .maybeSingle();
    if (updErr) throw updErr;
    linked = !!updated;
  }
  if (!linked) {
    const insertRow = {
      user_id: userId,
      id: `race-${generated.event_date}`,
      ...raceRow,
      effort: "race",
      note: "",
      is_public: !!input.isPublic,
      source_id: input.sourceId || null,
    };
    let { error: insErr } = await sb.from("events").insert(insertRow);
    if (insErr && /location/i.test(insErr.message || "")) {
      delete insertRow.location;
      ({ error: insErr } = await sb.from("events").insert(insertRow));
    }
    if (insErr) throw insErr;
  }
  const others = (input.otherEvents || []).filter((e) => e && e.date && e.name && !e.existing);
  for (const ev of others) {
    await sb.from("events").upsert({
      user_id: userId,
      id: ev.id || `ev-${ev.date}-${Date.now().toString(36)}`,
      date: ev.date,
      name: ev.name,
      km: Number(ev.km) || 0.1,
      effort: ev.effort || "easy",
      note: ev.note || "",
      race: false,
      is_public: false,
      sport: ev.sport || "run",
      source_id: ev.source_id || ev.id || null,
      swim_m: ev.swim_m || null,
      bike_km: ev.bike_km || null,
    });
  }
  return data;
}

function leaveSetupRouteIfNeeded() {
  const base = setupRouteBase();
  if (base !== "setup" && base !== "create-plan") return;
  document.body.classList.remove("onboarding");
  const next = "/home" + location.search;
  if (location.pathname + location.search !== next) {
    history.replaceState(null, "", next);
  }
  const app = document.getElementById("app");
  if (app) app.dataset.route = "home";
}
window.leaveSetupRouteIfNeeded = leaveSetupRouteIfNeeded;

async function loadOrCreatePlan(user) {
  window.CURRENT_USER_ID = user.id;
  const { data, error } = await sb.from("plans").select("*").eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  // Ignore stale fetches after logout / account switch.
  if (window.CURRENT_USER_ID !== user.id) return false;
  if (data) {
    applyPlanRow(data);
    // A previous no-plan account may have left us on /setup — don't reopen onboarding.
    leaveSetupRouteIfNeeded();
    showAppChrome();
    return true;
  }
  if (hasSkipped(user.id)) {
    window.PLAN_SKIPPED = true;
    leaveSetupRouteIfNeeded();
    showAppChrome();
    return true;
  }
  clearPlanRow();
  renderOnboarding();
  return false;
}

function setupRouteBase() {
  return location.pathname.replace(/^\/+|\/+$/g, "").split("/")[0] || "";
}

function setupRouteOpen() {
  const base = setupRouteBase();
  return base === "setup"
    || base === "create-plan"
    || document.body.classList.contains("onboarding")
    || !!document.querySelector(".setup-form")
    || !!document.querySelector(".setup-connect-step")
    || !!document.querySelector(".setup-creating");
}

let ENSURING = null;
let ENSURING_USER = null;
window.resetPlanLoad = function resetPlanLoad() {
  ENSURING = null;
  ENSURING_USER = null;
  clearPlanRow();
};
window.ensurePlan = function ensurePlan(user) {
  const prevId = window.CURRENT_USER_ID;
  const memorySkip = window.PLAN_SKIPPED && prevId === user.id;
  window.CURRENT_USER_ID = user.id;
  if (window.CURRENT_PLAN && window.CURRENT_PLAN.user_id !== user.id) {
    clearPlanRow();
  }
  // Prefer per-user localStorage; keep same-session in-memory skip (private mode).
  window.PLAN_SKIPPED = storedSkip(user.id) || memorySkip;
  // Hard refresh on /create-plan must reopen the create form — never bounce to /setup.
  if (setupRouteBase() === "create-plan") {
    const hasForm = document.querySelector(".setup-form[data-create-only='1']");
    if (!hasForm && typeof window.renderCreatePlan === "function") {
      window.renderCreatePlan();
    }
    return Promise.resolve(false);
  }
  if (window.CURRENT_PLAN && window.CURRENT_PLAN.user_id === user.id) {
    showAppChrome();
    return Promise.resolve(true);
  }
  // Honor skip/remove before any leftover /setup UI can reopen onboarding.
  if (!window.CURRENT_PLAN && hasSkipped(user.id)) {
    window.PLAN_SKIPPED = true;
    leaveSetupRouteIfNeeded();
    showAppChrome();
    return Promise.resolve(true);
  }
  // Always fetch this user's plan from the DB — even if the URL is still /setup from a
  // previous no-plan account. Short-circuiting here used to stick returning users in setup.
  if (ENSURING && ENSURING_USER === user.id) return ENSURING;
  ENSURING_USER = user.id;
  ENSURING = loadOrCreatePlan(user).finally(() => {
    if (ENSURING_USER === user.id) {
      ENSURING = null;
      ENSURING_USER = null;
    }
  });
  return ENSURING;
};

function typicalWeeklyFromActs(sport, acts) {
  if (typeof window.typicalWeeklyKm !== "function") return null;
  const list = Array.isArray(acts) ? acts : (window.peekActivities?.() || []);
  const preferred = window.typicalWeeklyKm(list, sport);
  if (preferred > 0) return preferred;
  // Before a sport is chosen (or if that sport has no history), fall back to run then any volume.
  if (sport !== "run") {
    const runKm = window.typicalWeeklyKm(list, "run");
    if (runKm > 0) return runKm;
  }
  for (const fallback of ["bike", "swim"]) {
    if (fallback === sport) continue;
    const km = window.typicalWeeklyKm(list, fallback);
    if (km > 0) return km;
  }
  return null;
}

function fillWeeklyFromSynced(form, { force = false, acts = null } = {}) {
  if (!form || form.dataset.weeklyPicked) return;
  // Default to run volume before an event/sport is chosen — still refreshes if sport changes later.
  const sport = setupSport(form) || form.dataset.pickedSport || "run";
  const existing = fieldValue(form, "weekly_km");
  // Keep a user-typed value; refresh auto-filled values when sport/sync changes.
  if (!force && existing && form.dataset.weeklyAuto !== "1") return;
  const km = typicalWeeklyFromActs(sport, acts);
  if (!(km > 0)) return;
  setWeeklyKmDisplay(form, km);
  form.dataset.weeklyAuto = "1";
  // Never wipe a manual Beginner / Intermediate / Advanced pick when sync prefills volume.
  if (!form.dataset.experiencePicked) syncExperienceFromWeekly(form);
  updateTrainingAdvice();
  const syncHint = document.getElementById("weekly-sync-status");
  if (syncHint && !isSetupSyncing()) {
    syncHint.hidden = false;
    syncHint.dataset.prefilled = "1";
    const shown = typeof window.fmtDistWithUnit === "function" ? window.fmtDistWithUnit(km, 1) : `${km} km`;
    syncHint.textContent = `Prefilling ${shown}/week from your synced activities. Change it if needed.`;
  }
}
window.fillWeeklyFromSynced = fillWeeklyFromSynced;
// Keep old name for any callers.
window.fillWeeklyFromCsv = fillWeeklyFromSynced;

function fitnessWeekConfig(sport) {
  const map = window.FITNESS_WEEKS_BY_SPORT || {};
  return map[sport] || { options: window.FITNESS_WEEKS || [8, 12, 16], default: 12, hint: "" };
}

function paintFitnessWeeks(form) {
  const box = document.getElementById("fitness-week-choices");
  const wrap = document.getElementById("fitness-custom-wrap");
  const hint = document.getElementById("fitness-weeks-hint");
  if (!box || !form) return;
  const sport = setupSport(form) || "run";
  const cfg = fitnessWeekConfig(sport);
  const optionSet = new Set((cfg.options || []).map(Number));
  let current = fieldValue(form, "fitness_weeks") || String(cfg.default);
  const isCustom = current === "custom"
    || (current !== "" && !optionSet.has(Number(current)) && Number(current) >= 4);
  // Never overwrite a length the athlete just tapped.
  if (!form.dataset.fitnessWeeksPicked) {
    if (!current || (!isCustom && !optionSet.has(Number(current)))) {
      current = String(cfg.default);
      setChoice(form, "fitness_weeks", current, "data-fitness-weeks");
    }
  }
  if (isCustom && current !== "custom") {
    const customEl = fieldOf(form, "fitness_weeks_custom");
    if (customEl && !customEl.value) customEl.value = current;
    setChoice(form, "fitness_weeks", "custom", "data-fitness-weeks");
    current = "custom";
  }
  const selected = fieldValue(form, "fitness_weeks") || String(cfg.default);
  box.innerHTML = cfg.options.map((n) => `
    <button class="choice-btn" type="button" data-fitness-weeks="${n}">${n} weeks</button>`).join("")
    + `<button class="choice-btn" type="button" data-fitness-weeks="custom">Custom</button>`;
  syncChoiceButtons(form, "data-fitness-weeks", selected);
  const showCustom = selected === "custom";
  if (wrap) {
    wrap.hidden = !showCustom;
    if (showCustom) wrap.removeAttribute("hidden");
  }
  if (hint) hint.textContent = cfg.hint || "";
}

function setupConnLabel(connected, loaded, syncing) {
  if (syncing) return { text: "Syncing", cls: "syncing" };
  if (!loaded) return { text: "…", cls: "off" };
  if (connected) return { text: "Connected", cls: "on" };
  return { text: "Not connected", cls: "off" };
}

function paintSetupConnect() {
  const box = document.getElementById("setup-connect-body");
  if (!box) return;
  const g = window.GARMIN_STATUS || window.GARMIN || { connected: false, loaded: false };
  const s = window.STRAVA_STATUS || window.STRAVA || { connected: false, loaded: false };
  const garmin = setupConnLabel(!!g.connected, !!g.loaded, !!SETUP_CONNECT_SYNCING.garmin);
  const strava = setupConnLabel(!!s.connected, !!s.loaded, !!SETUP_CONNECT_SYNCING.strava);
  const garminBusy = !!g.connected || !!SETUP_CONNECT_SYNCING.garmin;
  const stravaBusy = !!s.connected || !!SETUP_CONNECT_SYNCING.strava;

  box.innerHTML = `
    <div class="setup-connect-grid">
      <button class="setup-connect-btn" type="button" data-action="setup-open-garmin" ${garminBusy ? "disabled" : ""}>
        <span class="setup-connect-btn-title">Connect Garmin</span>
        <span class="conn-label ${garmin.cls}">${garmin.text}</span>
      </button>
      <button class="setup-connect-btn" type="button" data-action="setup-open-strava" ${stravaBusy ? "disabled" : ""}>
        <span class="setup-connect-btn-title">Connect Strava</span>
        <span class="conn-label ${strava.cls}">${strava.text}</span>
      </button>
    </div>`;
}
window.paintSetupConnect = paintSetupConnect;

function pickedEventMeta(ev, sport) {
  const sportLabel = (window.SPORT_LABEL && window.SPORT_LABEL[sport]) || sport;
  const bits = [ev.date, sportLabel];
  if (sport === "swim" && ev.swim_m) bits.push(`${ev.swim_m} m`);
  else if (sport === "bike" && (ev.bike_km || ev.km)) bits.push(`${ev.bike_km || ev.km} km`);
  else if (sport === "triathlon") {
    const tri = [ev.swim_m ? `${ev.swim_m} m` : "", ev.bike_km ? `${ev.bike_km} km` : "", ev.km ? `${ev.km} km run` : ""].filter(Boolean);
    if (tri.length) bits.push(tri.join(" / "));
    else if (ev.km) bits.push(`${ev.km} km`);
  } else if (ev.km) bits.push(`${ev.km} km`);
  return bits.filter(Boolean).join(" · ");
}

function clearAgendaLink(form) {
  if (!form) return;
  delete form.dataset.agendaEventId;
  delete form.dataset.agendaEventName;
  delete form.dataset.agendaEventDate;
}

function customFromAgenda(sport, preset, ev) {
  if (preset !== "custom") return { custom_run: "", custom_swim: "", custom_bike: "" };
  const hardest = Array.isArray(ev.legs) && typeof window.summarizeEventLegs === "function"
    ? window.summarizeEventLegs(ev.legs).hardest
    : 0;
  return {
    custom_run: (sport === "run" || sport === "walk" || sport === "triathlon") && (ev.km || hardest)
      ? String(hardest || ev.km)
      : "",
    custom_swim: (sport === "swim" || sport === "triathlon") && ev.swim_m ? String(ev.swim_m) : "",
    custom_bike: sport === "bike" || sport === "ski"
      ? String(ev.bike_km || hardest || ev.km || "")
      : (sport === "triathlon" && ev.bike_km ? String(ev.bike_km) : ""),
  };
}

window.startPlanForAgendaEvent = async function startPlanForAgendaEvent(ev, { replace = false } = {}) {
  const userId = window.CURRENT_USER_ID;
  if (!userId) throw new Error("Sign in required");
  if (!ev?.id || !ev.date || !ev.name) throw new Error("Pick an event first.");
  if (replace && window.CURRENT_PLAN) {
    const { error } = await sb.from("plans").delete().eq("user_id", userId);
    if (error) throw error;
    const { error: evErr } = await sb.from("events").delete().eq("user_id", userId).eq("race", true).neq("id", ev.id);
    if (evErr) throw evErr;
    clearPlanRow();
  }
  clearSkipped(userId);
  const sport = window.inferSportFromEvent(ev);
  const preset = window.inferPresetFromEvent(sport, ev);
  const custom = customFromAgenda(sport, preset, ev);
  const date = String(ev.date).slice(0, 10);
  const endDate = typeof window.eventEndYmd === "function" ? window.eventEndYmd(ev) : date;
  const draft = {
    goal_type: "race",
    sport,
    preset,
    custom_run: custom.custom_run,
    custom_swim: custom.custom_swim,
    custom_bike: custom.custom_bike,
    event_name: ev.name,
    event_date: date,
    event_end_date: endDate && endDate !== date ? endDate : "",
    multi_day: endDate && endDate > date ? "yes" : "no",
    event_kind: (window.EVENT_KINDS || []).includes(ev.kind) ? ev.kind : "race",
    event_legs_json: Array.isArray(ev.legs) ? JSON.stringify(ev.legs) : "[]",
    is_public: ev.is_public ? "yes" : "no",
    experience: "intermediate",
    run_days: "",
    strength: "",
    run_weekdays: "",
    strength_weekdays: "",
    swim_weekdays: "",
    bike_weekdays: "",
    busy_weekdays: "",
    long_weekday: "",
    time_goal: "",
    time_custom: "",
    fitness_weeks: "12",
    own_risk: "",
    extraDisciplines: "",
    // Existing agenda events are already chosen — don't ask for type/distance again.
    pickedEvent: "1",
    ownEvent: "",
    sourceEvent: ev.source_id || "",
    pickedName: ev.name,
    pickedMeta: pickedEventMeta(ev, sport),
    agendaEventId: ev.id,
    agendaEventName: ev.name,
    agendaEventDate: date,
    runDaysPicked: "",
    strengthPicked: "",
    experiencePicked: "",
    blocksPicked: "",
    weeklyPicked: "",
  };
  // One-shot seed for this visit only — not remembered next time.
  window._setupSeed = draft;
  markConnectStepDone();
  renderSetupPlanForm();
};

function applyPublicEventToForm(form, ev) {
  if (!form || !ev) return;
  clearAgendaLink(form);
  delete form.dataset.ownEvent;
  setChoice(form, "goal_type", "race", "data-goal");
  const sport = typeof window.inferSportFromEvent === "function"
    ? window.inferSportFromEvent(ev)
    : (ev.sport && EVENT_PRESETS[ev.sport] ? ev.sport : "run");
  setChoice(form, "sport", sport, "data-sport");
  form.dataset.pickedSport = sport;
  const preset = typeof window.inferPresetFromEvent === "function"
    ? window.inferPresetFromEvent(sport, ev)
    : (typeof inferPresetFromEvent === "function" ? inferPresetFromEvent(sport, ev) : "");
  const presetEl = fieldOf(form, "preset");
  if (presetEl) presetEl.value = preset;
  if (preset) form.dataset.pickedPreset = preset;
  if (preset === "custom") {
    if (sport === "run" || sport === "triathlon") {
      const runEl = fieldOf(form, "custom_run");
      if (runEl && ev.km) runEl.value = ev.km;
    }
    if (sport === "swim" || sport === "triathlon") {
      const swimEl = fieldOf(form, "custom_swim");
      if (swimEl && ev.swim_m) swimEl.value = ev.swim_m;
    }
    if (sport === "bike" || sport === "triathlon") {
      const bikeEl = fieldOf(form, "custom_bike");
      if (bikeEl && (ev.bike_km || ev.km)) bikeEl.value = ev.bike_km || ev.km;
    }
  }
  paintDistances(sport, { keepPreset: true, resetExtras: false });
  const nameEl = fieldOf(form, "event_name");
  const dateEl = fieldOf(form, "event_date");
  if (nameEl) nameEl.value = ev.name || "";
  if (dateEl) dateEl.value = ev.date || "";
  form.dataset.sourceEvent = ev.id || "";
  delete form.dataset.runDaysPicked;
  delete form.dataset.weekEdited;
  delete form.dataset.blocksPicked;
  delete form.dataset.strengthPicked;
  lockPickedEvent(form, ev, pickedEventMeta(ev, sport));
  applyGoalType(form, "race", { explicit: true });
  fillWeeklyFromSynced(form, { force: true });
  updateTrainingAdvice();
  saveSetupDraft(form);
}

function lockPickedEvent(form, ev, metaText) {
  form.dataset.pickedEvent = "1";
  const sport = fieldValue(form, "sport")
    || form.dataset.pickedSport
    || (typeof window.inferSportFromEvent === "function" ? window.inferSportFromEvent(ev) : "run")
    || "run";
  setChoice(form, "sport", sport, "data-sport");
  form.dataset.pickedSport = sport;
  if (!fieldValue(form, "preset") && typeof window.inferPresetFromEvent === "function") {
    const preset = window.inferPresetFromEvent(sport, ev);
    if (preset) {
      const presetEl = fieldOf(form, "preset");
      if (presetEl) presetEl.value = preset;
      form.dataset.pickedPreset = preset;
    }
  }
  const card = form.querySelector(".picked-event");
  if (card) {
    card.hidden = false;
    card.removeAttribute("hidden");
    const name = card.querySelector(".picked-name");
    const meta = card.querySelector(".picked-meta");
    if (name) name.textContent = ev.name || "Selected event";
    if (meta) meta.textContent = metaText || pickedEventMeta(ev, sport);
  }
  form.querySelectorAll("[data-own-event], [data-setup-sport], [data-setup-distance], [data-setup-date], .event-entry").forEach((el) => {
    el.hidden = true;
  });
  const nameEl = fieldOf(form, "event_name");
  const dateEl = fieldOf(form, "event_date");
  if (nameEl) nameEl.required = false;
  if (dateEl) dateEl.required = false;
}

function unlockPickedEvent(form) {
  if (!form) return;
  clearAgendaLink(form);
  delete form.dataset.pickedEvent;
  delete form.dataset.pickedSport;
  delete form.dataset.pickedPreset;
  delete form.dataset.sourceEvent;
  delete form.dataset.ownEvent;
  const card = form.querySelector(".picked-event");
  if (card) {
    card.hidden = true;
    card.setAttribute("hidden", "");
    const name = card.querySelector(".picked-name");
    const meta = card.querySelector(".picked-meta");
    if (name) name.textContent = "";
    if (meta) meta.textContent = "";
  }
  const nameEl = fieldOf(form, "event_name");
  const dateEl = fieldOf(form, "event_date");
  const presetEl = fieldOf(form, "preset");
  const sportEl = fieldOf(form, "sport");
  if (nameEl) nameEl.value = "";
  if (dateEl) dateEl.value = "";
  if (presetEl) presetEl.value = "";
  if (sportEl) sportEl.value = "";
  ["run_weekdays", "swim_weekdays", "bike_weekdays", "strength_weekdays"].forEach((name) => {
    const el = fieldOf(form, name);
    if (el) el.value = "";
  });
  delete form.dataset.weekEdited;
  delete form.dataset.blocksPicked;
  delete form.dataset.runDaysPicked;
  delete form.dataset.strengthPicked;
  form.querySelectorAll("#distance-choices .choice-btn").forEach((b) => b.classList.remove("active"));
  form.querySelectorAll("[data-sport]").forEach((b) => b.classList.remove("active"));
  const entry = form.querySelector(".event-entry");
  if (entry) {
    entry.hidden = false;
    entry.removeAttribute("hidden");
  }
  const searchBox = form.querySelector(".event-search");
  if (searchBox) {
    searchBox.hidden = false;
    searchBox.removeAttribute("hidden");
  }
  const addBtn = form.querySelector("[data-action=add-own-event]");
  const cancelBtn = form.querySelector("[data-action=cancel-own-event]");
  if (addBtn) addBtn.hidden = false;
  if (cancelBtn) cancelBtn.hidden = true;
  form.querySelectorAll("[data-own-event], [data-setup-sport], [data-setup-distance], [data-setup-date]").forEach((el) => {
    el.hidden = true;
  });
  applyGoalType(form, "race", { explicit: true });
  toggleCustom("", "");
  paintWeekBlocks(form);
  saveSetupDraft(form);
  form.querySelector("input[name=event_search]")?.focus();
}

let SEARCH_T = 0;
async function renderEventSearch(input) {
  const box = input.closest(".event-search, .event-form")?.querySelector(".search-results");
  if (!box || typeof window.searchPublicEvents !== "function") return;
  const q = input.value.trim();
  if (q.length < 2) { box.hidden = true; box.innerHTML = ""; return; }
  const token = ++SEARCH_T;
  const rows = await window.searchPublicEvents(q);
  if (token !== SEARCH_T) return;
  if (!rows.length) {
    box.hidden = false;
    box.innerHTML = `<li class="muted">No public events match “${q}”.</li>`;
    return;
  }
  box.hidden = false;
  window._publicEventHits = rows;
  box.innerHTML = rows.map((ev) => {
    const sport = ev.sport || (typeof window.inferSportFromEvent === "function" ? window.inferSportFromEvent(ev) : "run");
    const sportLabel = (window.SPORT_LABEL && window.SPORT_LABEL[sport]) || sport;
    return `
    <li>
      <button type="button" data-public-id="${escAttr(ev.id)}" data-public-event="${escAttr(JSON.stringify({
        id: ev.id, name: ev.name, date: ev.date, km: ev.km, sport,
        swim_m: ev.swim_m, bike_km: ev.bike_km,
      }))}">
        <strong>${escAttr(ev.name)}</strong>
        <span class="muted">${escAttr(ev.date)} · ${escAttr(sportLabel)}${ev.km ? ` · ${escAttr(ev.km)} km` : ""}</span>
      </button>
    </li>`;
  }).join("");
}

function escAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

document.addEventListener("submit", (e) => {
  const identity = e.target.closest?.(".setup-identity-form");
  if (identity) {
    e.preventDefault();
    finishSetupConnectStep();
  }
});

function setupDateLockActive() {
  return timeChromeShielded();
}

/** Native date input only — no DOM restores around it (those closed the calendar). */
function bindSetupDatePicker(form) {
  const input = form?.querySelector?.("input[name=event_date]");
  if (!input || input.dataset.pickerBound === "1") return;
  input.dataset.pickerBound = "1";
  const arm = () => {
    if (setupGoal(form) === "time" || form.dataset.timeChrome === "1") {
      form.dataset.timeChrome = "1";
      shieldTimeChrome(1200);
      ensureTimeDistanceVisible(form);
    }
  };
  input.addEventListener("pointerdown", arm);
  input.addEventListener("focus", arm);
  input.addEventListener("click", arm);
}

function keepTimeDistanceChrome(form) {
  if (!form) return;
  form.dataset.timeChrome = "1";
  if (fieldValue(form, "goal_type") !== "time") {
    setChoice(form, "goal_type", "time", "data-goal");
  }
  form.querySelectorAll("[data-setup-sport], [data-setup-distance], [data-setup-time-goal]").forEach((el) => {
    el.hidden = false;
    el.removeAttribute("hidden");
  });
  const dateWrap = form.querySelector("[data-setup-date]");
  if (dateWrap) {
    dateWrap.hidden = false;
    dateWrap.removeAttribute("hidden");
  }
  const preset = fieldValue(form, "preset") || form.dataset.pickedPreset || "";
  const box = document.getElementById("distance-choices");
  if (box && preset) {
    box.querySelectorAll("[data-preset]").forEach((b) => {
      b.classList.toggle("active", b.dataset.preset === preset);
    });
  }
  syncChoiceButtons(form, "data-goal", "time");
}

// Swallow synthetic goal→race clicks that land after distance/date use.
document.addEventListener("click", (e) => {
  if (!timeChromeShielded()) return;
  const goalBtn = e.target.closest?.(".goal-field button[data-goal]");
  if (!goalBtn) return;
  const next = goalBtn.getAttribute("data-goal");
  if (next === "time") return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation?.();
  const form = goalBtn.closest(".setup-form") || document.querySelector(".setup-form");
  keepTimeDistanceChrome(form);
}, true);

document.addEventListener("change", (e) => {
  const form = e.target.closest?.(".setup-form");
  if (!form) return;
  if (e.target.matches?.("input[name=custom_run], input[name=custom_run2], input[name=custom_swim], input[name=custom_bike], input[name=event_date], input[name=event_end_date]")) {
    if (e.target.matches?.("input[name=event_date]")) {
      form.dataset.timeChrome = "1";
      shieldTimeChrome(1200);
      keepTimeDistanceChrome(form);
    }
    if (e.target.matches?.("input[name=event_date], input[name=event_end_date]")) {
      paintSetupEventLegs(form);
    }
    updateTrainingAdvice();
  }
  if (e.target.matches?.("input[name=weekly_km]")) {
    form.dataset.weeklyPicked = "1";
    delete form.dataset.weeklyAuto;
    delete form.dataset.experiencePicked;
    delete form.dataset.runDaysPicked;
    syncExperienceFromWeekly(form);
    updateTrainingAdvice();
  }
  if (e.target.matches?.("input[name=fitness_weeks_custom]")) {
    form.dataset.fitnessWeeksPicked = "1";
    setChoice(form, "fitness_weeks", "custom", "data-fitness-weeks");
  }
  if (e.target.matches?.("input[name=own_risk]")) saveSetupDraft(form);
  saveSetupDraft(form);
});

document.addEventListener("input", (e) => {
  if (e.target.matches?.("input[name=event_search]")) {
    clearTimeout(e.target._searchT);
    e.target._searchT = setTimeout(() => renderEventSearch(e.target), 220);
  }
  const form = e.target.closest?.(".setup-form");
  if (form && e.target.matches?.("input[name=weekly_km]")) {
    form.dataset.weeklyPicked = "1";
    delete form.dataset.weeklyAuto;
    delete form.dataset.experiencePicked;
    syncExperienceFromWeekly(form);
  }
  if (form && e.target.matches?.("input[name=fitness_weeks_custom]")) {
    setChoice(form, "fitness_weeks", "custom", "data-fitness-weeks");
  }
  if (form && e.target.matches?.("input, textarea")) saveSetupDraft(form);
});

document.addEventListener("click", (e) => {
  const unitsBtn = e.target.closest("button[data-units]");
  if (unitsBtn) {
    const form = unitsBtn.closest("form");
    const value = unitsBtn.dataset.units;
    if (form && (value === "metric" || value === "imperial")) {
      const hidden = form.querySelector("[name=units]");
      if (hidden) hidden.value = value;
      form.querySelectorAll("[data-units]").forEach((b) => {
        b.classList.toggle("is-on", b.dataset.units === value);
      });
      if (typeof window.normalizeUnits === "function") {
        window.CURRENT_PROFILE = {
          ...(window.CURRENT_PROFILE || {}),
          units: window.normalizeUnits(value),
        };
      }
    }
    return;
  }
  if (e.target.closest("[data-action=setup-connect-continue]")) {
    e.preventDefault();
    finishSetupConnectStep();
    return;
  }
  if (e.target.closest("[data-action=setup-back-to-connect]")) {
    e.preventDefault();
    clearConnectStepDone();
    renderSetupConnectStep();
    return;
  }
  if (e.target.closest("[data-action=setup-open-garmin]")) {
    e.preventDefault();
    if (typeof window.openGarminKeyDialog === "function") window.openGarminKeyDialog({ fromSetup: true });
    return;
  }
  if (e.target.closest("[data-action=setup-open-strava]")) {
    e.preventDefault();
    if (typeof window.openStravaPasscodeDialog === "function") {
      window.openStravaPasscodeDialog({ fromSetup: true });
    }
    return;
  }
  if (e.target.closest("[data-action=skip-setup]") || e.target.closest("[data-action=cancel-create-plan]")) {
    e.preventDefault();
    e.stopPropagation();
    leaveSetupToHome();
    return;
  }
  const form = e.target.closest(".setup-form");
  // Disclaimer sits under the week grid — never treat those taps as sport/goal/skip.
  if (form && e.target.closest(".own-risk-field, input[name=own_risk]")) return;
  const publicBtn = e.target.closest("[data-public-id], [data-public-event]");
  if (publicBtn) {
    e.preventDefault();
    const setupForm = publicBtn.closest(".setup-form");
    const eventForm = publicBtn.closest(".event-form");
    let ev = null;
    const raw = publicBtn.getAttribute("data-public-event");
    if (raw) {
      try { ev = JSON.parse(raw); } catch { ev = null; }
    }
    if (!ev) ev = window._publicEventHits?.find((row) => String(row.id) === String(publicBtn.dataset.publicId));
    if (!ev) return;
    if (setupForm && !eventForm) applyPublicEventToForm(setupForm, ev);
    if (eventForm && typeof window.applyPublicEventToAgenda === "function") window.applyPublicEventToAgenda(eventForm, ev);
    const results = publicBtn.closest(".search-results");
    if (results) results.hidden = true;
    const search = publicBtn.closest(".event-search, .event-entry, .event-form")?.querySelector("input[type=search], input[name=event_search]");
    if (search) search.value = "";
    return;
  }
  if (form && e.target.closest("[data-action=add-own-event]")) {
    form.dataset.ownEvent = "1";
    applyGoalType(form, "race", { explicit: true });
    form.querySelector("[name=event_name]")?.focus();
    return;
  }
  if (form && e.target.closest("[data-action=cancel-own-event]")) {
    delete form.dataset.ownEvent;
    applyGoalType(form, "race", { explicit: true });
    saveSetupDraft(form);
    return;
  }
  const goalBtn = e.target.closest(".goal-field button[data-goal]");
  if (goalBtn && form) {
    const nextGoal = goalBtn.getAttribute("data-goal");
    if (nextGoal !== "time" && timeChromeShielded()) {
      e.preventDefault();
      e.stopPropagation();
      keepTimeDistanceChrome(form);
      return;
    }
    applyGoalType(form, nextGoal, { explicit: true });
    return;
  }
  const sportBtn = e.target.closest("[data-sport]");
  if (sportBtn && form) {
    const nextSport = sportBtn.dataset.sport;
    if (setupSport(form) === nextSport && (form.dataset.blocksPicked === "1" || hasTrainingWeekdaySelection(form))) {
      return;
    }
    setChoice(form, "sport", nextSport, "data-sport");
    form.dataset.pickedSport = nextSport;
    if (setupGoal(form) === "time") {
      form.dataset.timeChrome = "1";
      shieldTimeChrome(1000);
    }
    delete form.dataset.experiencePicked;
    delete form.dataset.longPicked;
    delete form.dataset.weekEdited;
    delete form.dataset.blocksPicked;
    delete form.dataset.runDaysPicked;
    delete form.dataset.strengthPicked;
    delete form.dataset.fitnessWeeksPicked;
    ["run_weekdays", "swim_weekdays", "bike_weekdays", "strength_weekdays"].forEach((name) => {
      const el = fieldOf(form, name);
      if (el) el.value = "";
    });
    paintDistances(nextSport, { keepPreset: false, skipAdvice: true });
    if (setupGoal(form) === "fitness") paintFitnessWeeks(form);
    fillWeeklyFromSynced(form, { force: true });
    syncExperienceFromWeekly(form);
    updateTrainingAdvice();
    return;
  }
  if (e.target.closest("[data-action=setup-garmin-sync]")) {
    e.preventDefault();
    const setupForm = document.querySelector(".setup-form");
    if (typeof window.setupGarminSync === "function") {
      window.setupGarminSync({ permission: true }).then(() => {
        if (setupForm) fillWeeklyFromSynced(setupForm, { force: true });
        paintSetupConnect();
      }).catch((err) => {
        const status = document.getElementById("setup-garmin-status");
        if (status) status.textContent = err.message || "Sync failed.";
        else if (typeof window.toast === "function") window.toast(err.message || "Sync failed.", true);
      });
    }
    return;
  }
  const timeBtn = e.target.closest("[data-time-target]");
  if (timeBtn && form) {
    e.preventDefault();
    e.stopPropagation();
    pickTimeTarget(form, timeBtn.getAttribute("data-time-target"));
    return;
  }
  const fitBtn = e.target.closest("#fitness-week-choices [data-fitness-weeks]");
  if (fitBtn && form) {
    e.preventDefault();
    e.stopPropagation();
    form.dataset.fitnessWeeksPicked = "1";
    setChoice(form, "fitness_weeks", fitBtn.getAttribute("data-fitness-weeks"), "data-fitness-weeks");
    paintFitnessWeeks(form);
    saveSetupDraft(form);
    return;
  }
  const expBtn = e.target.closest("button[data-experience]");
  if (expBtn && form) {
    pickExperience(form, expBtn.dataset.experience);
    return;
  }
  const pubBtn = e.target.closest("[data-is-public]");
  if (pubBtn && form) {
    setChoice(form, "is_public", pubBtn.dataset.isPublic, "data-is-public");
    saveSetupDraft(form);
    return;
  }
  const strBtn = e.target.closest("button[data-strength]");
  if (strBtn && form) {
    pickStrength(form, strBtn.dataset.strength);
    return;
  }
  const strengthModeBtn = e.target.closest("[data-action=setup-strength-mode]");
  if (strengthModeBtn) {
    e.preventDefault();
    e.stopPropagation();
    pickStrengthMode(form || document.querySelector(".setup-form"), strengthModeBtn.getAttribute("data-mode"));
    return;
  }
  if (e.target.closest("[data-action=setup-manage-strength-gear]")) {
    e.preventDefault();
    e.stopPropagation();
    openSetupStrengthGearDialog();
    return;
  }
  const setupGearBtn = e.target.closest("[data-action=setup-quick-gear]");
  if (setupGearBtn) {
    e.preventDefault();
    const type = setupGearBtn.getAttribute("data-type");
    if (typeof window.quickAddStrengthGear !== "function") return;
    const setupForm = form || document.querySelector(".setup-form");
    if (setupForm) setupForm.dataset.strengthMode = "home";
    setupGearBtn.disabled = true;
    window.quickAddStrengthGear(type, { insert: true, skipRender: true }).then(() => {
      paintStrengthGearBox(setupForm);
      if (document.getElementById("day-dialog")?.open) openSetupStrengthGearDialog();
    }).catch((err) => {
      if (typeof window.toast === "function") window.toast(err.message || "Could not add gear.", true);
    }).finally(() => {
      setupGearBtn.disabled = false;
    });
    return;
  }
  const addDisc = e.target.closest("[data-add-discipline]");
  if (addDisc && form) {
    pickExtraDiscipline(form, addDisc.getAttribute("data-add-discipline"));
    return;
  }
  const removeDisc = e.target.closest("[data-remove-discipline]");
  if (removeDisc && form) {
    if (removeExtraDiscipline(form, removeDisc.dataset.removeDiscipline)) {
      paintWeekBlocks(form);
      saveSetupDraft(form);
    }
    return;
  }
  const kindBtn = e.target.closest("[data-event-kind]");
  if (kindBtn && form && form.classList.contains("setup-form")) {
    e.preventDefault();
    setChoice(form, "event_kind", kindBtn.dataset.eventKind || "race", "data-event-kind");
    saveSetupDraft(form);
    return;
  }
  const daysBtn = e.target.closest("#run-day-choices [data-run-days]");
  if (daysBtn && form) {
    e.preventDefault();
    e.stopPropagation();
    pickRunDayCount(form, daysBtn.dataset.runDays);
    return;
  }
  // Week-grid clicks are handled by bindWeekBlocksOnce — never let them fall through.
  if (e.target.closest("#week-blocks, .week-blocks-field")) return;
  // Empty clicks in the distance row must not trigger anything else.
  if (e.target.closest("#distance-choices") && !e.target.closest("[data-preset]")) return;
  if (form && e.target.closest("[data-action=clear-picked-event]")) {
    e.preventDefault();
    unlockPickedEvent(form);
    return;
  }
  const presetBtn = e.target.closest("#distance-choices [data-preset]");
  if (presetBtn && form) {
    pickDistancePreset(form, presetBtn.dataset.preset);
  }
});

document.addEventListener("submit", async (e) => {
  const form = e.target.closest(".setup-form");
  if (!form) return;
  e.preventDefault();
  const errorEl = form.querySelector(".form-error");
  const goalType = setupGoal(form);
  // Picked public/catalog events hide the type controls — recover sport from the selection.
  let sport = setupSport(form) || form.dataset.pickedSport || "";
  if (!sport && form.dataset.pickedEvent && typeof window.inferSportFromEvent === "function") {
    sport = window.inferSportFromEvent({
      name: fieldValue(form, "event_name"),
      date: fieldValue(form, "event_date"),
      sport: form.dataset.pickedSport,
    }) || "run";
  }
  if (sport) setChoice(form, "sport", sport, "data-sport");
  if (!fieldValue(form, "preset") && form.dataset.pickedPreset) {
    const presetEl = fieldOf(form, "preset");
    if (presetEl) presetEl.value = form.dataset.pickedPreset;
  }
  errorEl.textContent = "";
  if (!sport) {
    errorEl.textContent = goalType === "fitness" ? "Choose a focus." : "Choose an event type.";
    return;
  }
  if (goalType === "race" && !form.dataset.pickedEvent && form.dataset.ownEvent !== "1") {
    errorEl.textContent = "Search for a race or add your own event.";
    return;
  }
  const setupStart = fieldValue(form, "event_date");
  const setupMulti = setupIsMultiDay(form);
  if (setupMulti && setupStart) {
    const endEl = fieldOf(form, "event_end_date");
    const setupEnd = fieldValue(form, "event_end_date");
    if (!setupEnd || setupEnd <= setupStart) {
      errorEl.textContent = "Multi-day needs an end date after the start date.";
      return;
    }
    if (endEl) endEl.value = setupEnd;
  }
  if ((setupMulti || form.querySelector(".event-leg-day")) && !fieldValue(form, "preset")) {
    const presetEl = fieldOf(form, "preset");
    if (presetEl) presetEl.value = "custom";
  }
  if (goalType === "race" && !fieldValue(form, "preset") && !form.dataset.pickedEvent) { errorEl.textContent = "Choose a distance."; return; }
  if (goalType === "time" && !fieldValue(form, "preset")) { errorEl.textContent = "Choose a distance."; return; }
  if (goalType === "time") {
    const presetChoice = fieldValue(form, "preset");
    const timeGoalId = fieldValue(form, "time_goal");
    const customTime = fieldValue(form, "time_custom").trim();
    if (presetChoice === "custom") {
      if ((sport === "run" || sport === "walk") && !(Number(fieldValue(form, "custom_run")) > 0)) {
        errorEl.textContent = sport === "walk"
          ? `Enter the walk distance in ${distLabel()}.`
          : `Enter the run distance in ${distLabel()}.`;
        return;
      }
      if (sport === "swim" && !(Number(fieldValue(form, "custom_swim")) > 0)) {
        errorEl.textContent = "Enter the swim distance in metres.";
        return;
      }
      if ((sport === "bike" || sport === "ski") && !(Number(fieldValue(form, "custom_bike")) > 0)) {
        errorEl.textContent = sport === "ski" ? "Enter the ski distance in km." : "Enter the bike distance in km.";
        return;
      }
      if (sport === "triathlon" && (!(Number(fieldValue(form, "custom_run")) > 0)
        || !(Number(fieldValue(form, "custom_swim")) > 0)
        || !(Number(fieldValue(form, "custom_bike")) > 0))) {
        errorEl.textContent = "Enter swim, bike and run distances.";
        return;
      }
      if (sport === "duathlon" && (!(Number(fieldValue(form, "custom_run")) > 0)
        || !(Number(fieldValue(form, "custom_bike")) > 0)
        || !(Number(fieldValue(form, "custom_run2")) > 0))) {
        errorEl.textContent = "Enter first run, bike and second run distances.";
        return;
      }
      if (sport === "aquathlon" && (!(Number(fieldValue(form, "custom_swim")) > 0)
        || !(Number(fieldValue(form, "custom_run")) > 0))) {
        errorEl.textContent = "Enter swim and run distances.";
        return;
      }
    }
    if (presetChoice === "custom" || timeGoalId === "custom") {
      if (!customTime) { errorEl.textContent = "Enter a target time."; return; }
    } else if (!timeGoalId) {
      errorEl.textContent = "Choose a time goal.";
      return;
    }
  }
  if (goalType === "time" && !form.event_date.value) { errorEl.textContent = "Pick a target date."; return; }
  if (goalType === "race" && !form.dataset.pickedEvent && !form.event_name.value) { errorEl.textContent = "Enter the event name."; return; }
  if (goalType === "race" && !form.dataset.pickedEvent && !form.event_date.value) { errorEl.textContent = "Pick an event date."; return; }
  const wantsRunDays = sport === "run" || sport === "walk" || sport === "triathlon"
    || sport === "duathlon" || sport === "aquathlon"
    || visibleWeekdays(form, "run").length;
  if (wantsRunDays && !visibleWeekdays(form, "run").length && !form.run_days.value) {
    errorEl.textContent = sport === "walk"
      ? "Choose which days you want to walk."
      : "Choose which days you want to run.";
    return;
  }
  if (setupNeedsLongDay(form)) {
    const longDay = currentLongWeekday(form);
    const runDays = visibleWeekdays(form, "run");
    if (longDay == null || !runDays.includes(longDay)) {
      errorEl.textContent = sport === "walk"
        ? "Choose a day for your long walk."
        : "Choose a run day for your long run.";
      return;
    }
  }
  const strength = fieldValue(form, "strength");
  if (!strength) { errorEl.textContent = "Choose whether you want strength sessions."; return; }
  if (!fieldOf(form, "own_risk")?.checked) {
    errorEl.textContent = "Confirm that you train and race at your own risk.";
    return;
  }
  const pressure = trainingDayPressure(form, sport);
  if (pressure.tooBusy || pressure.tooFewSport) {
    const ok = window.confirm(
      `With ${pressure.busy} busy day${pressure.busy === 1 ? "" : "s"}, only ${pressure.free} free day${pressure.free === 1 ? "" : "s"} `
      + `and ${pressure.sportCount} training day${pressure.sportCount === 1 ? "" : "s"} left — this is below the ~${pressure.minDays}-day minimum for your goal. `
      + `The plan may fail to generate enough sessions, or sessions may be sparse. Continue anyway?`
    );
    if (!ok) return;
  }
  updateReachability(form);
  const timeGoalId = fieldValue(form, "time_goal");
  const timeGoal = (window.TIME_GOALS || []).find((g) => g.id === timeGoalId);
  const customTime = fieldValue(form, "time_custom");
  let fitnessWeeks = Number(fieldValue(form, "fitness_weeks")) || 12;
  if (goalType === "fitness") {
    if (fieldValue(form, "fitness_weeks") === "custom") {
      fitnessWeeks = Number(fieldValue(form, "fitness_weeks_custom"));
      if (!(fitnessWeeks >= 4 && fitnessWeeks <= 32)) {
        errorEl.textContent = "Enter a custom length between 4 and 32 weeks.";
        return;
      }
    }
  }
  let eventName = fieldValue(form, "event_name");
  let eventDate = fieldValue(form, "event_date");
  let preset = fieldValue(form, "preset");
  if (goalType === "time") {
    if (preset === "custom" || timeGoalId === "custom") {
      eventName = typeof window.timeGoalName === "function"
        ? window.timeGoalName("custom", {
          time: customTime,
          run: fieldValue(form, "custom_run"),
          swim: fieldValue(form, "custom_swim"),
          bike: fieldValue(form, "custom_bike"),
          preset,
          sport,
        })
        : customTime;
    } else if (timeGoal) {
      eventName = typeof window.timeGoalName === "function"
        ? window.timeGoalName(timeGoal, { sport })
        : timeGoal.label;
      preset = timeGoal.preset;
    }
  }
  const program = setupProgramValue(form);
  if (goalType === "fitness") {
    const startToRun = sport === "run" && program === "start_to_run";
    eventName = startToRun ? "Start to Run" : "General fitness";
    preset = startToRun ? "5k"
      : sport === "run" || sport === "walk"
        ? (sport === "walk" ? "20" : "10k")
        : sport === "swim" ? "1500"
          : sport === "bike" || sport === "ski" ? (sport === "ski" ? "full" : "40")
            : sport === "duathlon" ? "standard"
              : sport === "aquathlon" ? "standard"
                : "halve";
    const end = new Date();
    end.setDate(end.getDate() + fitnessWeeks * 7);
    eventDate = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
  }
  if (goalType === "race" && typeof window.readLegsFromEditor === "function" && form.querySelector(".event-leg-day")) {
    const liveLegs = window.readLegsFromEditor(form);
    form.dataset.eventLegsJson = JSON.stringify(liveLegs);
    const hiddenLegs = form.querySelector("[name=event_legs_json]");
    if (hiddenLegs) hiddenLegs.value = JSON.stringify(liveLegs);
    if (typeof window.summarizeEventLegs === "function" && liveLegs.length) {
      const sum = window.summarizeEventLegs(liveLegs);
      if (sum.hardest > 0) {
        if ((sport === "run" || sport === "walk") && !(Number(fieldValue(form, "custom_run")) > 0)) {
          const el = fieldOf(form, "custom_run");
          if (el) el.value = String(sum.hardest);
        }
        if ((sport === "bike" || sport === "ski") && !(Number(fieldValue(form, "custom_bike")) > 0)) {
          const el = fieldOf(form, "custom_bike");
          if (el) el.value = String(sum.hardest);
        }
      }
    }
  }
  const planInput = {
    goalType,
    timeGoal: timeGoalId,
    customTime,
    fitnessWeeks,
    program: program || (setupUsesStartToRun(form) ? "start_to_run" : "standard"),
    sport,
    preset,
    eventName,
    eventDate,
    weeklyKm: weeklyKmFromForm(form),
    runDays: form.run_days.value || visibleWeekdays(form, "run").length,
    runWeekdays: visibleWeekdays(form, "run"),
    strengthWeekdays: visibleWeekdays(form, "strength"),
    swimWeekdays: visibleWeekdays(form, "swim"),
    bikeWeekdays: visibleWeekdays(form, "bike"),
    busyWeekdays: parseDays(fieldValue(form, "busy_weekdays")),
    longWeekday: currentLongWeekday(form),
    strength: strength === "yes",
    isPublic: goalType === "race" && !form.dataset.pickedEvent && fieldValue(form, "is_public") === "yes",
    eventLocation: goalType === "race" ? fieldValue(form, "event_location") : "",
    sourceId: form.dataset.sourceEvent || "",
    agendaEventId: form.dataset.agendaEventId || "",
    notes: "",
    experience: fieldValue(form, "experience") || "intermediate",
    eventEndDate: setupIsMultiDay(form)
      ? (fieldValue(form, "event_end_date") || eventDate)
      : eventDate,
    eventKind: fieldValue(form, "event_kind") || "race",
    legs: (() => {
      try {
        const raw = fieldValue(form, "event_legs_json") || form.dataset.eventLegsJson || "[]";
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch { return []; }
    })(),
    otherEvents: collectAgendaOtherEvents(
      eventDate,
      setupIsMultiDay(form) ? (fieldValue(form, "event_end_date") || eventDate) : eventDate,
      form.dataset.agendaEventId || ""
    ),
    custom: {
      run: fieldValue(form, "custom_run") && typeof window.parseDistInput === "function"
        ? window.parseDistInput(fieldValue(form, "custom_run"))
        : fieldValue(form, "custom_run"),
      run2: fieldValue(form, "custom_run2") && typeof window.parseDistInput === "function"
        ? window.parseDistInput(fieldValue(form, "custom_run2"))
        : fieldValue(form, "custom_run2"),
      swim: fieldValue(form, "custom_swim"),
      bike: fieldValue(form, "custom_bike") && typeof window.parseDistInput === "function"
        ? window.parseDistInput(fieldValue(form, "custom_bike"))
        : fieldValue(form, "custom_bike"),
    },
  };
  // Snapshot before the creating screen replaces the form — a failed create must restore the week.
  const resumeSeed = snapshotSetupForm(form);
  showSetupCreatingPlan();
  try {
    const row = await saveGeneratedPlan(window.CURRENT_USER_ID, planInput);
    await finishSetupWithPlan(row);
  } catch (err) {
    window._setupSeed = resumeSeed;
    renderSetupPlanForm(err.message || "Could not create the plan.", { createOnly: isCreatePlanOnly() });
  }
});
