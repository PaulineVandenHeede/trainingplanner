window.CURRENT_USER_ID = null;
window.CURRENT_PLAN = null;
window.PLAN_SKIPPED = false;
window.PLAN_START = null;
window.MARATHON_DATE = null;
window.PHASES = [];
window.WEEKS = [];
window.PACES = [];
window.ROADMAP_703 = [];

function skipKey(userId) {
  return `plan-skipped:${userId}`;
}
function hasSkipped(userId) {
  return !!userId && localStorage.getItem(skipKey(userId)) === "1";
}
function markSkipped(userId) {
  window.PLAN_SKIPPED = true;
  if (userId) localStorage.setItem(skipKey(userId), "1");
}
function clearSkipped(userId) {
  window.PLAN_SKIPPED = false;
  if (userId) localStorage.removeItem(skipKey(userId));
}

function applyPlanRow(row) {
  const sources = Array.isArray(row?.sources) && row.sources.length
    ? row.sources
    : (row?.sport === "triathlon" && Array.isArray(window.TRAINING_RESEARCH)
      ? window.TRAINING_RESEARCH.slice()
      : []);
  window.CURRENT_PLAN = { ...row, sources };
  window.PLAN_START = row.start_date;
  window.MARATHON_DATE = row.event_date;
  window.PHASES = row.phases || [];
  window.WEEKS = row.weeks || [];
  window.PACES = row.paces || [];
  window.ROADMAP_703 = row.roadmap || [];
  if (typeof window.syncPlanDates === "function") window.syncPlanDates();
}

function clearPlanRow() {
  window.CURRENT_PLAN = null;
  window.PLAN_SKIPPED = false;
  window.PLAN_START = null;
  window.MARATHON_DATE = null;
  window.PHASES = [];
  window.WEEKS = [];
  window.PACES = [];
  window.ROADMAP_703 = [];
}

async function removeCurrentPlan() {
  const userId = window.CURRENT_USER_ID;
  if (!userId) throw new Error("Sign in required");
  const { error } = await sb.from("plans").delete().eq("user_id", userId);
  if (error) throw error;
  await sb.from("events").delete().eq("user_id", userId).eq("race", true);
  clearSkipped(userId);
  clearPlanRow();
  showAppChrome();
  if (typeof window.go === "function") window.go("/home", { replace: true });
  else {
    history.replaceState(null, "", "/home" + location.search);
    if (typeof window.render === "function") window.render(true);
  }
}
window.removeCurrentPlan = removeCurrentPlan;

function setupFields(sport, preset) {
  const run = sport === "run" || sport === "triathlon";
  const swim = sport === "swim" || sport === "triathlon";
  const bike = sport === "bike" || sport === "triathlon";
  const custom = preset === "custom";
  return { run: run && custom, swim: swim && custom, bike: bike && custom };
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
      <p class="setup-step-label">Step 1 of 2</p>
      <div class="eyebrow">Welcome</div>
      <h1>Set up your account</h1>
      <p class="muted">Choose a name and units, then connect Garmin or Strava if you want past training to shape your first plan.</p>
      <form class="setup-identity-form" novalidate>
        <label>Name
          <input type="text" name="username" maxlength="40" autocomplete="name" spellcheck="false" value="${escAttr(username)}" placeholder="e.g. Jane Doe" required />
        </label>
        <fieldset class="units-field">
          <legend>Units</legend>
          ${unitsRow}
          <p class="setup-hint">Suggested from your location — change anytime in Settings.</p>
        </fieldset>
        <p class="form-error username-error" role="alert"></p>
      </form>
      <section class="setup-connect" id="setup-connect">
        <p class="setup-connect-legend">Connect a source <span class="muted">(optional)</span></p>
        <div id="setup-connect-body"><p class="muted small-text">Checking connections…</p></div>
      </section>
      <div class="setup-actions">
        <button class="button" type="button" data-action="setup-connect-continue">Continue</button>
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

function updateSetupWeeklySyncHint() {
  const hint = document.getElementById("weekly-sync-status");
  if (!hint) return;
  if (isSetupSyncing()) {
    hint.hidden = false;
    hint.textContent = "Syncing activities… weekly volume will fill when ready.";
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
  window._setupSyncInFlight = window.syncConnectedSourcesForSetup()
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
      ${createOnly ? "" : `<p class="setup-step-label" id="setup-plan-step-label">Step 2 of 2</p>`}
      <div class="eyebrow">${createOnly ? "Create plan" : "New plan"}</div>
      <h1>What are you training for?</h1>
      <form class="setup-form" data-create-only="${createOnly ? "1" : ""}" novalidate>
        <fieldset class="goal-field">
          <legend>Goal</legend>
          <div class="choice-row">
            <button class="choice-btn active" type="button" data-goal="race">A race</button>
            <button class="choice-btn" type="button" data-goal="time">A time goal</button>
            <button class="choice-btn" type="button" data-goal="fitness">General fitness</button>
          </div>
          <input type="hidden" name="goal_type" value="race" />
        </fieldset>
        <div class="event-entry" data-for-goal="race">
          <div class="event-search">
            <label>Search public events
              <input type="search" name="event_search" placeholder="e.g. Gent Marathon, Samson 10K" autocomplete="off" />
            </label>
            <ul class="search-results" hidden></ul>
          </div>
          <button class="button ghost" type="button" data-action="add-own-event">Add your own event</button>
          <button class="button ghost" type="button" data-action="cancel-own-event" hidden>Back to search</button>
        </div>
        <div class="picked-event" hidden>
          <div class="eyebrow">Selected event</div>
          <p class="picked-name"></p>
          <p class="muted small-text picked-meta"></p>
          <button class="button ghost small" type="button" data-action="clear-picked-event">Choose a different event</button>
        </div>
        <fieldset data-own-event data-for-goal="race,fitness,time">
          <legend id="sport-legend">Event type</legend>
          <div class="choice-row" id="sport-choices">
            ${["run", "swim", "bike", "triathlon"].map((s) => `
              <button class="choice-btn" type="button" data-sport="${s}">${SPORT_LABEL[s]}</button>`).join("")}
          </div>
          <input type="hidden" name="sport" />
        </fieldset>
        <fieldset data-own-event data-for-goal="race,time">
          <legend>Distance</legend>
          <div class="choice-row" id="distance-choices"><p class="muted">Pick an event type first.</p></div>
          <input type="hidden" name="preset" />
        </fieldset>
        <div class="custom-dists" hidden data-own-event data-for-goal="race,time">
          <label class="custom-run" hidden>Run (<span data-units-label>${typeof window.distUnit === "function" ? window.distUnit() : "km"}</span>)<input type="number" name="custom_run" min="0.1" step="0.1" /></label>
          <label class="custom-swim" hidden>Swim (m)<input type="number" name="custom_swim" min="50" step="50" /></label>
          <label class="custom-bike" hidden>Bike (<span data-units-label>${typeof window.distUnit === "function" ? window.distUnit() : "km"}</span>)<input type="number" name="custom_bike" min="1" step="0.1" /></label>
        </div>
        <label data-own-event data-for-goal="race">Event name<input type="text" name="event_name" required placeholder="e.g. Gent Marathon, Kwart tri Leuven" /></label>
        <label data-own-event data-for-goal="race">Location<input type="text" name="event_location" maxlength="80" placeholder="e.g. Gent, Belgium" /></label>
        <label data-own-event data-for-goal="race,time" id="event-date-wrap">
          <span class="date-label">Event date</span>
          <input type="date" name="event_date" required min="${min}" />
        </label>
        <fieldset data-for-goal="time">
          <legend>Time goal</legend>
          <div class="choice-row" id="time-goal-choices"><p class="muted">Pick a distance first.</p></div>
          <input type="hidden" name="time_goal" />
        </fieldset>
        <fieldset data-for-goal="fitness">
          <legend>How long?</legend>
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
            <button class="info-tip" type="button" aria-label="About weekly volume" title="Use your current typical week of training volume.">i</button>
          </span>
          <input type="number" name="weekly_km" required min="1" max="500" step="0.1" placeholder="e.g. 25" />
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
          <legend>How many run days?</legend>
          <div class="choice-row" id="run-day-choices">
            ${[3, 4, 5, 6].map((n) => `<button class="choice-btn" type="button" data-run-days="${n}">${n} days</button>`).join("")}
          </div>
          <input type="hidden" name="run_days" />
          <p class="setup-hint" id="run-days-hint">Pick a distance to see a research-based minimum.</p>
        </fieldset>
        <fieldset class="strength-field">
          <legend class="field-label-row">Strength sessions
            <button class="info-tip" type="button" aria-label="About strength" title="Recommended as mileage builds: a short session after an easy run helps tendons, hips and running economy.">i</button>
          </legend>
          <div class="choice-row">
            <button class="choice-btn" type="button" data-strength="yes">Yes, add them</button>
            <button class="choice-btn" type="button" data-strength="no">No strength</button>
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
  applyGoalType(form, fieldValue(form, "goal_type") || "race");
  syncRestoredChoices(form);
  paintFitnessWeeks(form);
  fillWeeklyFromSynced(form);
  updateSetupWeeklySyncHint();
  if (typeof window.loadActivities === "function") {
    window.loadActivities().then((acts) => {
      window._setupActs = acts;
      fillWeeklyFromSynced(form, { force: true });
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
  return fieldValue(form, "sport");
}

function setupGoal(form) {
  return fieldValue(form, "goal_type") || "race";
}

function effectivePreset(form) {
  const goal = setupGoal(form);
  if (goal === "time") {
    const g = (window.TIME_GOALS || []).find((t) => t.id === fieldValue(form, "time_goal"));
    return g ? g.preset : fieldValue(form, "preset");
  }
  if (goal === "fitness") {
    const sport = setupSport(form);
    if (sport === "run") return "10k";
    if (sport === "swim") return "1500";
    if (sport === "bike") return "40";
    if (sport === "triathlon") return "halve";
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
    swim: fieldValue(form, "custom_swim"),
    bike: fieldValue(form, "custom_bike"),
  }, fieldValue(form, "experience") || "intermediate");
}

function syncChoiceButtons(root, attr, value) {
  const buttonOnly = new Set(["data-goal", "data-experience", "data-strength", "data-sport"]);
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
  // Keep the week grid the user already edited.
  if (!form.dataset.blocksPicked) delete form.dataset.runDaysPicked;
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
    const n = Number(fieldValue(form, "run_days")) || 3;
    const busy = parseDays(fieldValue(form, "busy_weekdays"));
    const blocks = defaultTrainingBlocks(sport, n, true, busy);
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

function bindSetupForm(form) {
  if (!form || form.dataset.bound === "1") return;
  form.dataset.bound = "1";
  form.addEventListener("click", (e) => {
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
    const days = e.target.closest("[data-run-days]");
    if (days && form.contains(days)) {
      e.preventDefault();
      e.stopPropagation();
      setRunDays(form, days.dataset.runDays, true);
      delete form.dataset.blocksPicked;
      updateTrainingAdvice();
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
      setExtras(form, parseExtras(form).filter((k) => k !== key));
      const field = weekdayField(form, key) || fieldOf(form, `${key}_weekdays`);
      if (field) field.value = "";
      form.dataset.blocksPicked = "1";
      paintWeekBlocks(form);
      saveSetupDraft(form);
    }
  }, true);
}

function primaryDisciplines(sport) {
  if (sport === "triathlon") return ["run", "swim", "bike"];
  if (sport === "swim") return ["swim"];
  if (sport === "bike") return ["bike"];
  if (sport === "run") return ["run"];
  return [];
}

function parseExtras(form) {
  return String(form?.dataset.extraDisciplines || "").split(",").map((s) => s.trim()).filter(Boolean);
}

function setExtras(form, list) {
  form.dataset.extraDisciplines = list.join(",");
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
  form.dataset.blocksPicked = "1";
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
  ["custom_run", "custom_swim", "custom_bike", "event_name", "event_location", "event_date", "weekly_km",
    "run_days", "run_weekdays", "strength_weekdays", "swim_weekdays", "bike_weekdays", "busy_weekdays",
    "long_weekday", "time_goal", "time_custom", "fitness_weeks", "fitness_weeks_custom",
    "goal_type", "is_public", "experience", "strength"].forEach((name) => {
    if (fieldOf(form, name) && draft[name] != null) fieldOf(form, name).value = draft[name];
  });
  syncChoiceButtons(form, "data-goal", fieldValue(form, "goal_type") || "race");
  paintTimeTargets(form);
  paintFitnessWeeks(form);
  syncChoiceButtons(form, "data-time-target", fieldValue(form, "time_goal"));
  syncChoiceButtons(form, "data-fitness-weeks", fieldValue(form, "fitness_weeks") || "12");
  syncChoiceButtons(form, "data-is-public", fieldValue(form, "is_public") || "no");
  syncChoiceButtons(form, "data-experience", fieldValue(form, "experience") || "intermediate");
  syncChoiceButtons(form, "data-strength", fieldValue(form, "strength"));
  if (draft.run_days) setRunDays(form, draft.run_days);
  if (draft.extraDisciplines) form.dataset.extraDisciplines = draft.extraDisciplines;
  if (draft.ownEvent) form.dataset.ownEvent = draft.ownEvent;
  if (draft.pickedEvent && draft.event_name) {
    form.dataset.pickedEvent = "1";
    if (draft.sourceEvent) form.dataset.sourceEvent = draft.sourceEvent;
    const sport = draft.sport || fieldValue(form, "sport") || "run";
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

function applyGoalType(form, goal) {
  if (!form) return;
  if (!["race", "time", "fitness"].includes(goal)) goal = "race";
  setChoice(form, "goal_type", goal, "data-goal");
  const sportLegend = document.getElementById("sport-legend");
  if (sportLegend) {
    sportLegend.textContent = goal === "fitness" ? "Focus" : goal === "time" ? "Sport" : "Event type";
  }
  const dateLabel = form.querySelector(".date-label");
  if (dateLabel) dateLabel.textContent = goal === "time" ? "Target date" : "Event date";
  const picked = !!form.dataset.pickedEvent;
  const adding = form.dataset.ownEvent === "1";
  if (form.event_name) form.event_name.required = false;
  if (form.event_date) form.event_date.required = false;
  form.querySelectorAll("[data-for-goal]").forEach((el) => {
    const allowed = el.getAttribute("data-for-goal").split(",").map((s) => s.trim());
    if (!allowed.includes(goal)) {
      el.hidden = true;
      return;
    }
    if (goal === "race" && el.hasAttribute("data-own-event") && !adding) {
      el.hidden = true;
      return;
    }
    if (picked && goal === "race" && (el.hasAttribute("data-own-event") || el.classList.contains("event-entry"))) {
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
  if (searchBox) searchBox.hidden = picked || (goal === "race" && adding);
  if (form.event_name) form.event_name.required = goal === "race" && adding && !picked;
  if (form.event_date) form.event_date.required = (goal === "race" && adding && !picked) || goal === "time";
  if (goal === "time" || goal === "fitness") {
    const sport = fieldValue(form, "sport");
    const box = document.getElementById("distance-choices");
    if (sport) paintDistances(sport, { keepPreset: true, resetExtras: false });
    else if (box && goal === "time") box.innerHTML = `<p class="muted">Pick an event type first.</p>`;
    if (goal === "time") paintTimeTargets(form);
  } else if (goal === "race") {
    const sport = fieldValue(form, "sport");
    const box = document.getElementById("distance-choices");
    if (sport) paintDistances(sport, { keepPreset: true, resetExtras: false });
    else if (box) box.innerHTML = `<p class="muted">Pick an event type first.</p>`;
  }
  const card = form.querySelector(".picked-event");
  if (card) card.hidden = !(goal === "race" && picked);
  if (goal === "fitness") paintFitnessWeeks(form);
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
  weekly.max = String(maxDisplay);
  form.querySelectorAll("[data-units-label]").forEach((el) => { el.textContent = unit; });
  const hint = document.getElementById("weekly-hint");
  if (!hint) return;
  if (sport === "bike") hint.textContent = `Use your current typical week on the bike (${unit}).`;
  else if (sport === "swim") hint.textContent = `Use your current typical week in the water (${unit}).`;
  else if (sport === "triathlon") hint.textContent = `Use your current typical run volume (${unit}). Swim and bike volume are planned separately.`;
  else if (sport === "run") hint.textContent = `Use your current typical week of running (${unit}).`;
  else hint.textContent = `Use your current typical weekly volume (${unit}).`;
}

const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
  const sport = setupSport(form);
  const preset = effectivePreset(form);
  if (!sport || !preset || typeof window.needsDedicatedLongDay !== "function") return false;
  return window.needsDedicatedLongDay(sport, preset, {
    run: fieldValue(form, "custom_run"),
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
  const n = Number(fieldValue(form, "run_days")) || 3;
  const strength = fieldValue(form, "strength") === "yes";
  const busy = parseDays(fieldValue(form, "busy_weekdays"));
  const blocks = defaultTrainingBlocks(sport, n, strength, busy);
  if (primary.includes("run")) {
    const runEl = fieldOf(form, "run_weekdays");
    if (runEl) runEl.value = (blocks.run || []).join(",");
    if (!form.dataset.runDaysPicked) setRunDays(form, (blocks.run || []).length);
    if (!form.dataset.longPicked) setLongWeekday(form, blocks.long);
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

function applyDefaultBlocks(form) {
  const sport = setupSport(form);
  if (!sport || typeof defaultTrainingBlocks !== "function") {
    paintWeekBlocks(form);
    return;
  }
  const strength = fieldValue(form, "strength") === "yes";
  const n = Number(fieldValue(form, "run_days")) || 3;
  const busy = parseDays(fieldValue(form, "busy_weekdays"));
  const blocks = defaultTrainingBlocks(sport, n, strength, busy);
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
  if (primary.includes("run") && !form.dataset.longPicked) setLongWeekday(form, blocks.long);
  else if (primary.includes("run")) ensureLongWeekday(form, blocks.run, blocks.long);
  paintWeekBlocks(form);
}

function bindWeekBlocksOnce() {
  const box = document.getElementById("week-blocks");
  if (!box || box.dataset.weekBound === "1") return;
  box.dataset.weekBound = "1";
  box.addEventListener("click", (e) => {
    const form = document.querySelector(".setup-form");
    if (!form) return;
    // Keep week clicks local so outside handlers can’t reset the grid.
    const longBtn = e.target.closest("[data-set-long]");
    const removeDisc = e.target.closest("[data-remove-discipline]");
    const dayToggle = e.target.closest("button[data-block][data-day]");
    if (!longBtn && !removeDisc && !dayToggle) return;
    e.preventDefault();
    e.stopPropagation();
    if (longBtn) {
      setLongRunDay(form, Number(longBtn.getAttribute("data-set-long")));
      return;
    }
    if (removeDisc) {
      const key = removeDisc.getAttribute("data-remove-discipline");
      setExtras(form, parseExtras(form).filter((k) => k !== key));
      const field = weekdayField(form, key) || fieldOf(form, `${key}_weekdays`);
      if (field) field.value = "";
      form.dataset.blocksPicked = "1";
      paintWeekBlocks(form);
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
  const locked = form.dataset.blocksPicked === "1" || hasAnyWeekdaySelection(form);
  if (!locked) fillProposedWeek(form, true);
  const sport = setupSport(form);
  const strength = fieldValue(form, "strength") === "yes";
  const extras = parseExtras(form);
  const primary = primaryDisciplines(sport);
  const rows = [];
  [["run", "Run"], ["swim", "Swim"], ["bike", "Bike"]].forEach(([key, label]) => {
    const extra = extras.includes(key) && !primary.includes(key);
    if (primary.includes(key) || extras.includes(key)) rows.push([key, label, extra]);
  });
  releaseBusyDays(form);
  if (strength) rows.push(["strength", "Strength", false]);
  if (sport || rows.length) rows.push(["busy", "Busy", false]);
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
  box.innerHTML = `
    <table class="week-picker">
      <thead><tr><th></th>${WEEKDAY_NAMES.map((d) => `<th>${d}</th>`).join("")}<th></th></tr></thead>
      <tbody>
        ${rows.map(([key, label, extra]) => `
          <tr class="${key === "busy" ? "busy-row" : ""}">
            <th>${label}</th>
            ${WEEKDAY_NAMES.map((_, i) => {
              const on = blocks[key].includes(i);
              const isLong = key === "run" && on && longDay === i;
              const blocked = key !== "busy" && blocks.busy.includes(i);
              const overlap = on && overlapDays.has(i);
              const risky = overlap && notes.warns.some((w) => w.startsWith(WEEKDAY_NAMES[i]));
              const mark = isLong ? "L" : on ? "✓" : "";
              const title = blocked
                ? "Busy — this day stays clear"
                : key === "busy"
                  ? (on ? "Unmark this busy day" : "Mark this day busy")
                  : (on ? `Remove ${label.toLowerCase()} on ${WEEKDAY_NAMES[i]}` : `Add ${label.toLowerCase()} on ${WEEKDAY_NAMES[i]}`);
              return `<td><button class="day-toggle ${on ? "active" : ""} ${isLong ? "long-on" : ""} ${key === "busy" && on ? "busy-on" : ""} ${blocked ? "day-busy" : ""} ${overlap ? (risky ? "overlap-warn" : "overlap-ok") : ""}" type="button" data-block="${key}" data-day="${i}" aria-pressed="${on}" title="${title}" ${blocked ? "disabled" : ""}>${mark}</button></td>`;
            }).join("")}
            <td class="row-end">${extra ? `<button class="row-remove" type="button" data-remove-discipline="${key}" aria-label="Remove ${label} line" title="Remove ${label}">×</button>` : ""}</td>
          </tr>`).join("")}
      </tbody>
    </table>
    ${longRunPicker(blocks, longDay)}`;
  paintExtraDisciplineChoices(form, primary, extras);
  const info = document.getElementById("overlap-info");
  const warn = document.getElementById("overlap-warn");
  const hint = document.getElementById("week-blocks-hint");
  if (hint) {
    const busyLabel = (blocks.busy || []).map((i) => WEEKDAY_NAMES[i]).join(", ");
    const longLabel = longDay != null ? WEEKDAY_NAMES[longDay] : "";
    const longNote = longLabel && primary.includes("run") ? ` Long run: ${longLabel}.` : "";
    if (busyLabel) {
      hint.textContent = `Busy: ${busyLabel}. Those days stay clear of training.${longNote}`;
    } else if (needsLong && primary.includes("run") && !longLabel) {
      hint.textContent = "Tap a run day to add it. This distance needs a long run — pick the day under the week.";
    } else {
      hint.textContent = `Tap a day to add or remove it. Mark busy days you can’t train.${longNote}`;
    }
  }
  if (info) info.textContent = notes.info.join(" ");
  if (warn) {
    const longWarn = needsLong && (longDay == null || !blocks.run.includes(longDay))
      ? "This distance needs a long-run day — tap at least one run day, then choose it under the week."
      : "";
    warn.textContent = [longWarn, ...notes.warns].filter(Boolean).join(" ");
  }
}

function paintExtraDisciplineChoices(form, primary, extras) {
  const bar = document.getElementById("extra-discipline");
  const box = document.getElementById("extra-discipline-choices");
  if (!bar || !box) return;
  const available = ["run", "swim", "bike"].filter((k) => !primary.includes(k) && !extras.includes(k));
  bar.hidden = !available.length;
  if (available.length) bar.removeAttribute("hidden");
  const labels = { run: "Run", swim: "Swim", bike: "Bike" };
  box.innerHTML = available.map((k) => `
    <button class="choice-btn" type="button" data-add-discipline="${k}">${labels[k]}</button>`).join("");
}

function longRunPicker(blocks, longDay) {
  const run = blocks.run || [];
  if (run.length < 2) return "";
  return `
    <div class="long-run-pick">
      <span>Long run</span>
      ${run.map((i) => `<button class="choice-btn${longDay === i ? " active" : ""}" type="button" data-set-long="${i}">${WEEKDAY_NAMES[i]}</button>`).join("")}
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

function toggleBlockDay(form, key, day) {
  const field = weekdayField(form, key) || fieldOf(form, `${key}_weekdays`);
  if (!field) return;
  const days = parseDays(field.value);
  const turningOn = !days.includes(day);
  if (key === "busy" && turningOn) clearDayFromTraining(form, day);
  if (key !== "busy" && turningOn) {
    const busyField = fieldOf(form, "busy_weekdays");
    if (busyField) {
      busyField.value = parseDays(busyField.value).filter((d) => d !== day).join(",");
    }
  }
  const next = turningOn ? [...days, day].sort((a, b) => a - b) : days.filter((d) => d !== day);
  field.value = next.join(",");
  form.dataset.blocksPicked = "1";
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
  form.dataset.blocksPicked = "1";
  paintWeekBlocks(form);
  updateTrainingAdvice();
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
    const thr = typeof window.experienceThresholds === "function" ? window.experienceThresholds(sport) : null;
    const sportLabel = (window.SPORT_LABEL && window.SPORT_LABEL[sport]) || "training";
    const unit = distLabel();
    const fmt = (v) => (typeof window.displayDistValue === "function" ? window.displayDistValue(v, 0) : v);
    const adjusts = (sport === "run" || sport === "triathlon")
      ? "it adjusts recommended run days"
      : "it adjusts how the week is built";
    const band = thr
      ? (level === "beginner"
        ? `usually under ~${fmt(thr.beginner)} ${unit}/week`
        : level === "advanced"
          ? `usually from ~${fmt(thr.intermediate)} ${unit}/week`
          : `usually ~${fmt(thr.beginner)}–${fmt(thr.intermediate)} ${unit}/week`)
      : null;
    hint.textContent = band
      ? `Suggested ${label} for ${sportLabel.toLowerCase()} from ${shown} ${unit}/week (${band}). Change it if that doesn’t fit — ${adjusts}.`
      : `Suggested ${label} from ${shown} ${unit}/week. Change it if that doesn’t fit — ${adjusts}.`;
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
  updateWeeklyVolumeLimits(form);
  updateReachability(form);
  const advice = setupAdvice(form);
  const runField = form.querySelector(".run-days-field");
  const daysHint = document.getElementById("run-days-hint");
  const strengthHint = document.getElementById("strength-hint");
  const expHint = document.getElementById("experience-hint");
  if (expHint && form.dataset.experiencePicked) {
    const sport = setupSport(form);
    expHint.textContent = (sport === "run" || sport === "triathlon")
      ? "This changes how many run days are recommended."
      : "This changes how hard the week is built for your event type.";
  }
  if (!advice) {
    if (runField) runField.hidden = true;
    paintWeekBlocks(form);
    return;
  }
  if (runField) {
    runField.hidden = !advice.showRunDays;
    if (advice.showRunDays) runField.removeAttribute("hidden");
  }
  form.querySelectorAll("[data-run-days]").forEach((b) => {
    const rec = Number(b.dataset.runDays) === advice.recDays;
    b.classList.toggle("recommended", rec);
    if (rec && !b.querySelector(".rec")) b.insertAdjacentHTML("beforeend", `<span class="rec">recommended</span>`);
    if (!rec) b.querySelector(".rec")?.remove();
  });
  if (advice.showRunDays && !form.dataset.runDaysPicked && !form.dataset.blocksPicked) setRunDays(form, advice.recDays);
  const chosen = Number(fieldValue(form, "run_days"));
  if (daysHint) {
    const belowMin = chosen > 0 && chosen < advice.minDays;
    daysHint.classList.toggle("warn", belowMin);
    if (belowMin) {
      daysHint.textContent = `That's below the ${advice.minDays}-day minimum for this distance. You can still continue, but sessions will be longer and injury risk goes up.`;
    } else if (advice.experience === "beginner" && setupGoal(form) === "race") {
      daysHint.textContent = "";
    } else {
      daysHint.textContent = advice.daysHint;
    }
    daysHint.hidden = !daysHint.textContent;
  }
  if (strengthHint) {
    strengthHint.textContent = advice.strengthHint || "";
    strengthHint.hidden = !strengthHint.textContent;
  }
  if (!form.dataset.strengthPicked) {
    if (!fieldValue(form, "strength")) {
      setChoice(form, "strength", advice.strengthRecommended ? "yes" : "no", "data-strength");
    }
  }
  syncChoiceButtons(form, "data-strength", fieldValue(form, "strength"));
  paintStrengthGearBox(form);
  const keepWeek = form.dataset.blocksPicked === "1" || hasAnyWeekdaySelection(form);
  if (!keepWeek) applyDefaultBlocks(form);
  else paintWeekBlocks(form);
  saveSetupDraft(form);
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
  const level = typeof window.strengthAccessLevel === "function" ? window.strengthAccessLevel() : "bodyweight";
  const advice = typeof window.strengthGearAdvice === "function" ? window.strengthGearAdvice() : "";
  hint.textContent = advice;
  if (level === "bodyweight") {
    actions.innerHTML = `
      <button class="choice-btn" type="button" data-action="setup-quick-gear" data-type="kettlebell">Add a kettlebell</button>
      <button class="choice-btn" type="button" data-action="setup-quick-gear" data-type="gym">I have a gym</button>
      <a class="choice-btn" href="/gear">Manage gear</a>`;
  } else {
    actions.innerHTML = `<a class="choice-btn" href="/gear">Update strength kit</a>`;
  }
}

function paintTimeTargets(form) {
  const box = document.getElementById("time-goal-choices");
  if (!box || !form) return;
  const preset = fieldValue(form, "preset");
  const sport = setupSport(form) || "run";
  const savedTime = fieldValue(form, "time_custom");
  const timeInput = (placeholder) => `
    <label class="time-custom-label">Target time
      <input type="text" name="time_custom" inputmode="text" placeholder="${placeholder}" value="${escAttr(savedTime)}" />
    </label>`;
  if (!preset) {
    box.innerHTML = `<p class="muted">Pick a distance first.</p>`;
    return;
  }
  if (preset === "custom") {
    setChoice(form, "time_goal", "custom", "data-time-target");
    box.innerHTML = timeInput("e.g. 28:00 or 1:25:00");
    return;
  }
  const goals = (window.TIME_GOALS || []).filter((g) => g.preset === preset && (!g.sport || g.sport === sport));
  const current = fieldValue(form, "time_goal");
  box.innerHTML = goals.map((g) => `
    <button class="choice-btn" type="button" data-time-target="${g.id}">${g.label}</button>`).join("")
    + `<button class="choice-btn" type="button" data-time-target="custom">Custom</button>`;
  if (current && current !== "custom" && !goals.some((g) => g.id === current)) {
    const el = fieldOf(form, "time_goal");
    if (el) el.value = "";
  }
  if (fieldValue(form, "time_goal") === "custom") {
    box.insertAdjacentHTML("beforeend", timeInput("e.g. 28:00"));
  }
  syncChoiceButtons(form, "data-time-target", fieldValue(form, "time_goal"));
}

function paintDistances(sport, opts = {}) {
  const box = document.getElementById("distance-choices");
  const form = document.querySelector(".setup-form");
  if (!box || !form) return;
  const goal = setupGoal(form);
  let presets = EVENT_PRESETS[sport] || [];
  if (goal === "time") {
    const allowed = Array.isArray(window.TIME_PRESETS)
      ? window.TIME_PRESETS
      : (window.TIME_PRESETS && window.TIME_PRESETS[sport]) || [];
    presets = presets.filter((p) => allowed.includes(p.id));
  }
  box.innerHTML = presets.map((p) => `
    <button class="choice-btn" type="button" data-preset="${p.id}">${p.label}</button>`).join("");
  if (!opts.keepPreset) {
    const presetEl = fieldOf(form, "preset");
    if (presetEl) presetEl.value = "";
    delete form.dataset.runDaysPicked;
    delete form.dataset.strengthPicked;
    delete form.dataset.blocksPicked;
    delete form.dataset.longPicked;
    setLongWeekday(form, "");
    if (opts.resetExtras !== false) form.dataset.extraDisciplines = "";
    toggleCustom(sport, "");
  } else {
    const preset = fieldValue(form, "preset");
    form.querySelectorAll("#distance-choices .choice-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.preset === preset);
    });
    toggleCustom(sport, preset);
  }
  if (goal === "time") paintTimeTargets(form);
  updateWeeklyVolumeLimits(form);
  updateTrainingAdvice();
}

function toggleCustom(sport, preset) {
  const wrap = document.querySelector(".custom-dists");
  if (!wrap) return;
  const fields = setupFields(sport, preset);
  wrap.hidden = !fields.run && !fields.swim && !fields.bike;
  wrap.querySelector(".custom-run").hidden = !fields.run;
  wrap.querySelector(".custom-swim").hidden = !fields.swim;
  wrap.querySelector(".custom-bike").hidden = !fields.bike;
  updateTrainingAdvice();
}

function showAppChrome() {
  document.body.classList.remove("onboarding", "logged-out");
  const header = document.getElementById("app-header");
  if (header) header.hidden = false;
  const hasPlan = !!window.CURRENT_PLAN;
  document.querySelectorAll("[data-route]").forEach((el) => {
    if (el.dataset.route === "home" || el.dataset.route === "profile" || el.dataset.route === "activities") el.hidden = false;
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
    app.dataset.route = "";
  }
  showAppChrome();
  history.replaceState(null, "", "/home" + location.search);
  if (!window.CURRENT_PLAN && window.CURRENT_USER_ID) {
    try { await loadOrCreatePlan({ id: window.CURRENT_USER_ID }); } catch { /* still go home */ }
  }
  showAppChrome();
  history.replaceState(null, "", "/home" + location.search);
  try {
    if (typeof window.bootApp === "function") await window.bootApp();
  } catch { /* still paint home */ }
  if (typeof window.go === "function") window.go("/home", { replace: true });
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

async function saveGeneratedPlan(userId, input) {
  const generated = generateTrainingPlan(input);
  // Client-only / optional fields — strip before insert in case DB columns aren't there yet.
  const { sources, long_weekday, ...persisted } = generated;
  const row = { user_id: userId, ...persisted };
  const { data, error } = await sb.from("plans").insert(row).select("*").single();
  if (error) throw error;
  if (data) {
    data.sources = sources || [];
    if (long_weekday != null) data.long_weekday = long_weekday;
  }
  const raceKm = generated.run_km || generated.bike_km || (generated.swim_m ? generated.swim_m / 1000 : 0);
  const raceRow = {
    date: generated.event_date,
    name: generated.event_name,
    km: raceKm || 0,
    race: true,
    sport: generated.sport,
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

async function loadOrCreatePlan(user) {
  window.CURRENT_USER_ID = user.id;
  const { data, error } = await sb.from("plans").select("*").eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  if (data) {
    applyPlanRow(data);
    showAppChrome();
    return true;
  }
  if (hasSkipped(user.id)) {
    window.PLAN_SKIPPED = true;
    showAppChrome();
    return true;
  }
  renderOnboarding();
  return false;
}

function setupRouteOpen() {
  const base = location.pathname.replace(/^\/+|\/+$/g, "").split("/")[0];
  return base === "setup"
    || document.body.classList.contains("onboarding")
    || !!document.querySelector(".setup-form")
    || !!document.querySelector(".setup-connect-step");
}

let ENSURING = null;
window.ensurePlan = function ensurePlan(user) {
  window.CURRENT_USER_ID = user.id;
  if (setupRouteOpen() && !window.CURRENT_PLAN) {
    const hasSetupUi = document.querySelector(".setup-form, .setup-connect-step");
    if (typeof window.renderOnboarding === "function" && !hasSetupUi) {
      window.renderOnboarding();
    }
    return Promise.resolve(false);
  }
  if (window.CURRENT_PLAN && window.CURRENT_PLAN.user_id === user.id) {
    showAppChrome();
    return Promise.resolve(true);
  }
  if (window.PLAN_SKIPPED && window.CURRENT_USER_ID === user.id && !window.CURRENT_PLAN) {
    showAppChrome();
    return Promise.resolve(true);
  }
  if (ENSURING) return ENSURING;
  ENSURING = loadOrCreatePlan(user).finally(() => { ENSURING = null; });
  return ENSURING;
};

function typicalWeeklyFromActs(sport) {
  if (typeof window.typicalWeeklyKm === "function") return window.typicalWeeklyKm(window.peekActivities?.() || [], sport);
  return null;
}

function fillWeeklyFromSynced(form, { force = false } = {}) {
  if (!form || form.dataset.weeklyPicked) return;
  // Default to run volume before an event/sport is chosen — still refreshes if sport changes later.
  const sport = setupSport(form) || "run";
  const existing = fieldValue(form, "weekly_km");
  // Keep a user-typed value; refresh auto-filled values when sport/sync changes.
  if (!force && existing && form.dataset.weeklyAuto !== "1") return;
  const km = typicalWeeklyFromActs(sport);
  if (!(km > 0)) return;
  setWeeklyKmDisplay(form, km);
  form.dataset.weeklyAuto = "1";
  delete form.dataset.experiencePicked;
  syncExperienceFromWeekly(form);
  updateTrainingAdvice();
  const syncHint = document.getElementById("weekly-sync-status");
  if (syncHint && !isSetupSyncing()) {
    syncHint.hidden = false;
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
  let current = fieldValue(form, "fitness_weeks") || String(cfg.default);
  const isCustom = current === "custom" || (current && !cfg.options.includes(Number(current)) && Number(current) >= 4);
  if (!current || (!isCustom && !cfg.options.includes(Number(current)))) {
    current = String(cfg.default);
    setChoice(form, "fitness_weeks", current, "data-fitness-weeks");
  }
  if (isCustom && current !== "custom") {
    const customEl = fieldOf(form, "fitness_weeks_custom");
    if (customEl && !customEl.value) customEl.value = current;
    setChoice(form, "fitness_weeks", "custom", "data-fitness-weeks");
    current = "custom";
  }
  box.innerHTML = cfg.options.map((n) => `
    <button class="choice-btn" type="button" data-fitness-weeks="${n}">${n} weeks</button>`).join("")
    + `<button class="choice-btn" type="button" data-fitness-weeks="custom">Custom</button>`;
  syncChoiceButtons(form, "data-fitness-weeks", fieldValue(form, "fitness_weeks") || String(cfg.default));
  const showCustom = fieldValue(form, "fitness_weeks") === "custom";
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
  return {
    custom_run: (sport === "run" || sport === "triathlon") && ev.km ? String(ev.km) : "",
    custom_swim: (sport === "swim" || sport === "triathlon") && ev.swim_m ? String(ev.swim_m) : "",
    custom_bike: sport === "bike"
      ? String(ev.bike_km || ev.km || "")
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
  const fromCatalog = !!ev.source_id;
  const date = String(ev.date).slice(0, 10);
  const draft = {
    goal_type: "race",
    sport,
    preset,
    custom_run: custom.custom_run,
    custom_swim: custom.custom_swim,
    custom_bike: custom.custom_bike,
    event_name: ev.name,
    event_date: date,
    is_public: ev.is_public ? "yes" : "no",
    weekly_km: "",
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
    pickedEvent: fromCatalog ? "1" : "",
    ownEvent: fromCatalog ? "" : "1",
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
  const sportEl = fieldOf(form, "sport");
  if (sportEl) sportEl.value = sport;
  syncChoiceButtons(form, "data-sport", sport);
  const preset = typeof inferPresetFromEvent === "function" ? inferPresetFromEvent(sport, ev) : "";
  const presetEl = fieldOf(form, "preset");
  if (presetEl) presetEl.value = preset;
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
  delete form.dataset.blocksPicked;
  lockPickedEvent(form, ev, pickedEventMeta(ev, sport));
  applyGoalType(form, "race");
  fillWeeklyFromSynced(form, { force: true });
  applyDefaultBlocks(form);
  saveSetupDraft(form);
}

function lockPickedEvent(form, ev, metaText) {
  form.dataset.pickedEvent = "1";
  const card = form.querySelector(".picked-event");
  if (card) {
    card.hidden = false;
    card.removeAttribute("hidden");
    const name = card.querySelector(".picked-name");
    const meta = card.querySelector(".picked-meta");
    if (name) name.textContent = ev.name || "Selected event";
    if (meta) {
      const sport = fieldValue(form, "sport") || (typeof window.inferSportFromEvent === "function" ? window.inferSportFromEvent(ev) : "run");
      meta.textContent = metaText || pickedEventMeta(ev, sport);
    }
  }
  form.querySelectorAll("[data-own-event], .event-entry").forEach((el) => { el.hidden = true; });
  const nameEl = fieldOf(form, "event_name");
  const dateEl = fieldOf(form, "event_date");
  if (nameEl) nameEl.required = false;
  if (dateEl) dateEl.required = false;
}

function unlockPickedEvent(form) {
  if (!form) return;
  clearAgendaLink(form);
  delete form.dataset.pickedEvent;
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
  delete form.dataset.blocksPicked;
  delete form.dataset.runDaysPicked;
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
  form.querySelectorAll("[data-own-event]").forEach((el) => { el.hidden = true; });
  applyGoalType(form, "race");
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

document.addEventListener("change", (e) => {
  const form = e.target.closest?.(".setup-form");
  if (!form) return;
  if (e.target.matches?.("input[name=custom_run], input[name=custom_swim], input[name=custom_bike], input[name=event_date]")) {
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
    leaveSetupToHome();
    return;
  }
  const form = e.target.closest(".setup-form");
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
    const search = publicBtn.closest(".event-search")?.querySelector("input[type=search]");
    if (search) search.value = "";
    return;
  }
  if (form && e.target.closest("[data-action=add-own-event]")) {
    form.dataset.ownEvent = "1";
    applyGoalType(form, "race");
    form.querySelector("[name=event_name]")?.focus();
    return;
  }
  if (form && e.target.closest("[data-action=cancel-own-event]")) {
    delete form.dataset.ownEvent;
    applyGoalType(form, "race");
    saveSetupDraft(form);
    return;
  }
  const goalBtn = e.target.closest("button[data-goal]");
  if (goalBtn && form) {
    applyGoalType(form, goalBtn.getAttribute("data-goal"));
    return;
  }
  const sportBtn = e.target.closest("[data-sport]");
  if (sportBtn && form) {
    setChoice(form, "sport", sportBtn.dataset.sport, "data-sport");
    delete form.dataset.experiencePicked;
    delete form.dataset.longPicked;
    delete form.dataset.blocksPicked;
    delete form.dataset.runDaysPicked;
    ["run_weekdays", "swim_weekdays", "bike_weekdays", "strength_weekdays"].forEach((name) => {
      const el = fieldOf(form, name);
      if (el) el.value = "";
    });
    paintDistances(sportBtn.dataset.sport);
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
    setChoice(form, "time_goal", timeBtn.getAttribute("data-time-target"), "data-time-target");
    paintTimeTargets(form);
    updateTrainingAdvice();
    saveSetupDraft(form);
    return;
  }
  const fitBtn = e.target.closest("[data-fitness-weeks]");
  if (fitBtn && form) {
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
  const setupGearBtn = e.target.closest("[data-action=setup-quick-gear]");
  if (setupGearBtn) {
    e.preventDefault();
    const type = setupGearBtn.getAttribute("data-type");
    if (typeof window.quickAddStrengthGear !== "function") return;
    setupGearBtn.disabled = true;
    window.quickAddStrengthGear(type, { insert: true, skipRender: true }).then(() => {
      paintStrengthGearBox(form || document.querySelector(".setup-form"));
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
    const key = removeDisc.dataset.removeDiscipline;
    setExtras(form, parseExtras(form).filter((k) => k !== key));
    if (form[`${key}_weekdays`]) form[`${key}_weekdays`].value = "";
    form.dataset.blocksPicked = "1";
    paintWeekBlocks(form);
    saveSetupDraft(form);
    return;
  }
  const daysBtn = e.target.closest("[data-run-days]");
  if (daysBtn && form) {
    setRunDays(form, daysBtn.dataset.runDays, true);
    delete form.dataset.blocksPicked;
    updateTrainingAdvice();
    return;
  }
  // Week-grid clicks are handled by bindWeekBlocksOnce on #week-blocks.
  if (e.target.closest("#week-blocks")) return;
  if (form && e.target.closest("[data-action=clear-picked-event]")) {
    e.preventDefault();
    unlockPickedEvent(form);
    return;
  }
  const presetBtn = e.target.closest("[data-preset]");
  if (presetBtn && form) {
    const presetEl = fieldOf(form, "preset");
    if (presetEl) presetEl.value = presetBtn.dataset.preset;
    form.querySelectorAll("#distance-choices .choice-btn").forEach((b) => b.classList.toggle("active", b === presetBtn));
    delete form.dataset.runDaysPicked;
    delete form.dataset.blocksPicked;
    delete form.dataset.longPicked;
    toggleCustom(setupSport(form), presetBtn.dataset.preset);
    if (setupGoal(form) === "time") paintTimeTargets(form);
    updateTrainingAdvice();
    saveSetupDraft(form);
  }
});

document.addEventListener("submit", async (e) => {
  const form = e.target.closest(".setup-form");
  if (!form) return;
  e.preventDefault();
  const errorEl = form.querySelector(".form-error");
  const goalType = setupGoal(form);
  const sport = setupSport(form);
  errorEl.textContent = "";
  if (!sport) { errorEl.textContent = goalType === "fitness" ? "Choose a focus." : "Choose an event type."; return; }
  if (goalType === "race" && !form.dataset.pickedEvent && form.dataset.ownEvent !== "1") {
    errorEl.textContent = "Search for a race or add your own event.";
    return;
  }
  if (goalType === "race" && !fieldValue(form, "preset") && !form.dataset.pickedEvent) { errorEl.textContent = "Choose a distance."; return; }
  if (goalType === "time" && !fieldValue(form, "preset")) { errorEl.textContent = "Choose a distance."; return; }
  if (goalType === "time") {
    const presetChoice = fieldValue(form, "preset");
    const timeGoalId = fieldValue(form, "time_goal");
    const customTime = fieldValue(form, "time_custom").trim();
    if (presetChoice === "custom") {
      if (sport === "run" && !(Number(fieldValue(form, "custom_run")) > 0)) {
        errorEl.textContent = `Enter the run distance in ${distLabel()}.`;
        return;
      }
      if (sport === "swim" && !(Number(fieldValue(form, "custom_swim")) > 0)) {
        errorEl.textContent = "Enter the swim distance in metres.";
        return;
      }
      if (sport === "bike" && !(Number(fieldValue(form, "custom_bike")) > 0)) {
        errorEl.textContent = "Enter the bike distance in km.";
        return;
      }
      if (sport === "triathlon" && (!(Number(fieldValue(form, "custom_run")) > 0)
        || !(Number(fieldValue(form, "custom_swim")) > 0)
        || !(Number(fieldValue(form, "custom_bike")) > 0))) {
        errorEl.textContent = "Enter swim, bike and run distances.";
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
  const wantsRunDays = sport === "run" || sport === "triathlon" || visibleWeekdays(form, "run").length;
  if (wantsRunDays && !visibleWeekdays(form, "run").length && !form.run_days.value) {
    errorEl.textContent = "Choose which days you want to run.";
    return;
  }
  if (setupNeedsLongDay(form)) {
    const longDay = currentLongWeekday(form);
    const runDays = visibleWeekdays(form, "run");
    if (longDay == null || !runDays.includes(longDay)) {
      errorEl.textContent = "Choose a run day for your long run.";
      return;
    }
  }
  const strength = fieldValue(form, "strength");
  if (!strength) { errorEl.textContent = "Choose whether you want strength sessions."; return; }
  if (!fieldOf(form, "own_risk")?.checked) {
    errorEl.textContent = "Confirm that you train and race at your own risk.";
    return;
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
  if (goalType === "fitness") {
    eventName = "General fitness";
    preset = sport === "run" ? "10k" : sport === "swim" ? "1500" : sport === "bike" ? "40" : "halve";
    const end = new Date();
    end.setDate(end.getDate() + fitnessWeeks * 7);
    eventDate = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
  }
  const planInput = {
    goalType,
    timeGoal: timeGoalId,
    customTime,
    fitnessWeeks,
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
    otherEvents: [],
    custom: {
      run: fieldValue(form, "custom_run") && typeof window.parseDistInput === "function"
        ? window.parseDistInput(fieldValue(form, "custom_run"))
        : fieldValue(form, "custom_run"),
      swim: fieldValue(form, "custom_swim"),
      bike: fieldValue(form, "custom_bike") && typeof window.parseDistInput === "function"
        ? window.parseDistInput(fieldValue(form, "custom_bike"))
        : fieldValue(form, "custom_bike"),
    },
  };
  showSetupCreatingPlan();
  try {
    const row = await saveGeneratedPlan(window.CURRENT_USER_ID, planInput);
    await finishSetupWithPlan(row);
  } catch (err) {
    renderSetupPlanForm(err.message || "Could not create the plan.", { createOnly: isCreatePlanOnly() });
  }
});
