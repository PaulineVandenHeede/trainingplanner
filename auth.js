// Strava also returns ?code=&state= (or ?error=) on /connections. Stash and strip those
// before Supabase auth can treat them as a login callback.
(function stashStravaOauthCallback() {
  try {
    const base = location.pathname.replace(/^\/+|\/+$/g, "").split("/")[0] || "";
    if (base !== "connections") return;
    const q = new URLSearchParams(location.search);
    const code = q.get("code") || "";
    const state = q.get("state") || "";
    const error = q.get("error") || "";
    if (!code && !error) return;
    if (q.get("type")) return; // Supabase email / recovery links
    const pendingReturn = sessionStorage.getItem("strava-return-to")
      || localStorage.getItem("strava-return-to")
      || sessionStorage.getItem("setup-after-strava");
    // Our Strava state is "<base64url>.<sig>"; auth codes usually aren't.
    const looksLikeStrava = pendingReturn || (state.includes(".") && !q.get("type"));
    if (!looksLikeStrava) return;
    sessionStorage.setItem("strava-oauth-callback", JSON.stringify({
      code,
      state,
      error,
      error_description: q.get("error_description") || "",
    }));
    ["code", "state", "scope", "error", "error_description"].forEach((key) => q.delete(key));
    // Jump straight to the page we came from so /connections doesn’t flash first.
    let returnTo = sessionStorage.getItem("strava-return-to") || localStorage.getItem("strava-return-to") || "";
    if (!returnTo && state.includes(".")) {
      try {
        const body = state.split(".", 2)[0];
        const padded = body + "=".repeat((4 - (body.length % 4)) % 4);
        const payload = JSON.parse(atob(padded.replace(/-/g, "+").replace(/_/g, "/")));
        if (payload?.ret === "/setup" || payload?.ret === "setup") returnTo = "/setup";
      } catch { /* ignore */ }
    }
    const path = returnTo === "/setup" ? "/setup" : "/connections";
    const next = `${path}${q.toString() ? `?${q}` : ""}${location.hash || ""}`;
    history.replaceState(null, "", next);
  } catch { /* ignore */ }
})();

const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
window.sb = sb;

const PASSWORD_RULES = [
  { id: "length", test: (password) => password.length >= 12 && password.length <= 72 },
  { id: "lower", test: (password) => /[a-z]/.test(password) },
  { id: "upper", test: (password) => /[A-Z]/.test(password) },
  { id: "digit", test: (password) => /[0-9]/.test(password) },
  { id: "symbol", test: (password) => /[^A-Za-z0-9\s]/.test(password) },
];

function tt(key, vars) {
  return typeof window.t === "function" ? window.t(key, vars) : key;
}

function passwordRuleLabel(ruleId) {
  return tt(`pw.${ruleId}`);
}

function authRedirectTo(path = "/") {
  const configured = String(window.AUTH_SITE_URL || "https://health.paulinevandenheede.com").trim();
  const base = configured.replace(/\/+$/, "");
  const next = String(path || "/").startsWith("/") ? String(path || "/") : `/${path}`;
  return `${base}${next === "/" ? "/" : next}`;
}

function readAuthLink() {
  const hash = new URLSearchParams(location.hash.startsWith("#") ? location.hash.slice(1) : "");
  const query = new URLSearchParams(location.search);
  const pick = (key) => hash.get(key) || query.get(key) || "";
  // Ignore Strava OAuth errors — those are handled by the Strava callback, not login.
  try {
    if (sessionStorage.getItem("strava-oauth-callback")) return { type: pick("type"), error: "" };
  } catch { /* ignore */ }
  let error = pick("error_description") || pick("error") || "";
  try { error = decodeURIComponent(error.replace(/\+/g, " ")); } catch { /* keep the raw text */ }
  return { type: pick("type"), error };
}

function clearAuthParams() {
  const url = new URL(location.href);
  ["code", "error", "error_code", "error_description", "type"].forEach((key) => url.searchParams.delete(key));
  url.hash = "";
  const next = `${url.pathname}${url.search}`;
  if (next !== `${location.pathname}${location.search}` || location.hash) {
    history.replaceState(null, "", next);
  }
}

function passwordProblems(password, email) {
  const unmet = PASSWORD_RULES.filter((rule) => !rule.test(password)).map((rule) => passwordRuleLabel(rule.id));
  const extras = [];
  if (password !== password.trim()) extras.push(tt("pw.noEdgeSpace"));
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const local = normalizedEmail.split("@")[0];
  if (normalizedEmail && password.trim().toLowerCase() === normalizedEmail) {
    extras.push(tt("pw.notEmail"));
  } else if (local.length >= 4 && password.toLowerCase().includes(local)) {
    extras.push(tt("pw.notEmailLocal"));
  }
  return { unmet, extras };
}

function passwordError(password, confirm, email) {
  if (!password) return tt("pw.enter");
  if (password !== confirm) return tt("pw.mismatch");
  const { unmet, extras } = passwordProblems(password, email);
  if (!unmet.length && !extras.length) return "";
  if (!unmet.length) return `${extras[0]}.`;
  if (extras.length) return `${extras[0]}. ${tt("pw.alsoMeet")}`;
  return tt("pw.meetAll");
}

function paintPasswordRules(form, checked) {
  const list = form.querySelector(".password-rules");
  if (!list || !form.password) return;
  const password = form.password.value;
  list.classList.toggle("checked", Boolean(checked) || password.length > 0);
  list.querySelectorAll("[data-rule]").forEach((item) => {
    const rule = PASSWORD_RULES.find((entry) => entry.id === item.dataset.rule);
    item.classList.toggle("met", Boolean(rule && rule.test(password)));
  });
}

const authLink = readAuthLink();
let pendingRecovery = authLink.type === "recovery" && !authLink.error;
let suppressAuthNavigation = false;

async function getAccessToken() {
  const { data: { session } } = await sb.auth.getSession();
  return session?.access_token || "";
}
window.getAccessToken = getAccessToken;

function authHeaders(extra = {}) {
  return getAccessToken().then((token) => ({
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }));
}
window.authHeaders = authHeaders;

function passwordRulesHtml({ hidden = true, id = "password-rules" } = {}) {
  return `<ul class="password-rules"${id ? ` id="${id}"` : ""}${hidden ? " hidden" : ""}>${PASSWORD_RULES.map((rule) =>
    `<li data-rule="${rule.id}">${passwordRuleLabel(rule.id)}</li>`).join("")}</ul>`;
}

function authLanguagePicker() {
  const lang = typeof window.I18N?.normalizeLang === "function"
    ? window.I18N.normalizeLang(window.I18N?.language || "en")
    : "en";
  return `
    <div class="auth-lang-switch" role="group" aria-label="Language">
      <button class="auth-lang-opt${lang === "en" ? " is-on" : ""}" type="button" data-lang="en" aria-pressed="${lang === "en" ? "true" : "false"}">EN</button>
      <span class="auth-lang-sep" aria-hidden="true">|</span>
      <button class="auth-lang-opt${lang === "nl" ? " is-on" : ""}" type="button" data-lang="nl" aria-pressed="${lang === "nl" ? "true" : "false"}">NL</button>
    </div>`;
}
window.passwordError = passwordError;
window.paintPasswordRules = paintPasswordRules;
window.passwordRulesHtml = passwordRulesHtml;

function renderAuthLoading() {
  document.body.classList.add("logged-out");
  document.body.classList.remove("onboarding");
  const header = document.getElementById("app-header");
  if (header) header.hidden = true;
  document.getElementById("day-dialog")?.close();
  const app = document.getElementById("app");
  if (app) app.innerHTML = `<p class="muted auth-loading">${tt("common.loading")}</p>`;
}

function renderLogin(message = "", options = {}) {
  document.body.classList.add("logged-out");
  const header = document.getElementById("app-header");
  if (header) header.hidden = true;
  document.getElementById("day-dialog")?.close();
  document.getElementById("app").innerHTML = `
    ${authLanguagePicker()}
    <section class="auth-card">
      <div class="auth-brand">
        <picture>
          <source srcset="/assets/app-icon-dark.png" media="(prefers-color-scheme: dark)" />
          <img class="brand-mark" src="/assets/app-icon.png" width="36" height="36" alt="" />
        </picture>
        <div>
          <div class="eyebrow">${tt("brand.eyebrow")}</div>
          <h1>${tt("brand.name")}</h1>
        </div>
      </div>
      <p class="muted auth-lead">${tt("auth.leadSignIn")}</p>
      <div class="auth-tabs">
        <button class="auth-tab active" type="button" data-auth-mode="signin">${tt("auth.signIn")}</button>
        <button class="auth-tab" type="button" data-auth-mode="signup">${tt("auth.signUp")}</button>
      </div>
      <form class="auth-form" data-mode="signin" novalidate>
        <label class="email-row">${tt("auth.email")}<input type="email" name="email" required autocomplete="email" /></label>
        <label class="password-row">${tt("auth.password")}<input type="password" name="password" required autocomplete="current-password" aria-describedby="password-rules" /></label>
        <label class="confirm-row" hidden>${tt("auth.confirmPassword")}<input type="password" name="confirm" autocomplete="new-password" /></label>
        ${passwordRulesHtml()}
        <p class="form-error" role="alert"></p>
        <p class="form-note" role="status"></p>
        <button class="button" type="submit">${tt("auth.signIn")}</button>
        <p class="auth-links">
          <button class="text-button forgot-row" type="button" data-auth-mode="forgot">${tt("auth.forgot")}</button>
          <button class="text-button back-row" type="button" data-auth-mode="signin" hidden>${tt("auth.backSignIn")}</button>
        </p>
      </form>
    </section>`;
  setAuthMode(options.mode || "signin");
  const form = document.querySelector(".auth-form");
  if (form && options.email) form.email.value = options.email;
  if (form && message) {
    const slot = options.tone === "ok" ? ".form-note" : ".form-error";
    form.querySelector(slot).textContent = message;
  }
}

function renderPasswordReset(email = "", message = "") {
  document.body.classList.add("logged-out");
  const header = document.getElementById("app-header");
  if (header) header.hidden = true;
  document.getElementById("day-dialog")?.close();
  document.getElementById("app").innerHTML = `
    ${authLanguagePicker()}
    <section class="auth-card">
      <div class="auth-brand">
        <picture>
          <source srcset="/assets/app-icon-dark.png" media="(prefers-color-scheme: dark)" />
          <img class="brand-mark" src="/assets/app-icon.png" width="36" height="36" alt="" />
        </picture>
        <div>
          <div class="eyebrow">${tt("brand.eyebrow")}</div>
          <h1>${tt("auth.newPasswordTitle")}</h1>
        </div>
      </div>
      <p class="muted auth-lead"></p>
      <form class="auth-form" data-mode="recovery" novalidate>
        <input type="hidden" name="email" value="" />
        <label class="password-row">${tt("auth.newPassword")}<input type="password" name="password" required autocomplete="new-password" aria-describedby="password-rules" /></label>
        <label class="confirm-row">${tt("auth.confirmPassword")}<input type="password" name="confirm" autocomplete="new-password" /></label>
        ${passwordRulesHtml().replace(" hidden", "")}
        <p class="form-error" role="alert"></p>
        <p class="form-note" role="status"></p>
        <button class="button" type="submit">${tt("auth.savePassword")}</button>
        <p class="auth-links">
          <button class="text-button" type="button" data-action="cancel-recovery">${tt("common.cancel")}</button>
        </p>
      </form>
    </section>`;
  const lead = document.querySelector(".auth-lead");
  if (lead) {
    lead.textContent = email
      ? tt("auth.resetLeadFor", { email })
      : tt("auth.resetLead");
  }
  const form = document.querySelector(".auth-form");
  if (form) {
    form.email.value = email || "";
    if (message) form.querySelector(".form-error").textContent = message;
    paintPasswordRules(form);
  }
}

function setAuthMode(mode) {
  const form = document.querySelector(".auth-form");
  if (!form || form.dataset.mode === "recovery") return;
  form.dataset.mode = mode;
  const signup = mode === "signup";
  const forgot = mode === "forgot";
  form.querySelector(".confirm-row").hidden = !signup;
  form.querySelector(".password-row").hidden = forgot;
  form.querySelector(".password-rules").hidden = !signup;
  form.querySelector(".forgot-row").hidden = mode !== "signin";
  form.querySelector(".back-row").hidden = !forgot;
  const tabs = document.querySelector(".auth-tabs");
  if (tabs) tabs.hidden = forgot;
  const lead = document.querySelector(".auth-lead");
  if (lead) {
    lead.textContent = forgot
      ? tt("auth.leadForgot")
      : tt("auth.leadSignIn");
  }
  form.password.required = !forgot;
  form.password.autocomplete = signup ? "new-password" : "current-password";
  form.querySelector("button[type=submit]").textContent = signup
    ? tt("auth.signUp")
    : forgot
      ? tt("auth.sendReset")
      : tt("auth.signIn");
  document.querySelectorAll(".auth-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.authMode === mode));
  form.querySelector(".form-error").textContent = "";
  form.querySelector(".form-note").textContent = "";
  if (signup) paintPasswordRules(form);
}
window.renderLogin = renderLogin;
window.renderPasswordReset = renderPasswordReset;
window.setAuthMode = setAuthMode;

window.CURRENT_PROFILE = null;

function profileLabel(user) {
  const username = window.CURRENT_PROFILE?.username;
  if (username) return username;
  return user?.email || "";
}

function avatarLetter(user) {
  const source = window.CURRENT_PROFILE?.username || user?.email || "?";
  return source.slice(0, 1).toUpperCase();
}

function showUser(user) {
  window.CURRENT_USER_EMAIL = user?.email || "";
  const el = document.getElementById("user-email");
  if (el) {
    el.textContent = profileLabel(user);
    el.dataset.email = user?.email || "";
  }
  const av = document.getElementById("user-avatar");
  if (av) av.textContent = avatarLetter(user);
}
window.showUser = showUser;

async function loadProfile(userId) {
  const fallbackUnits = typeof window.guessUnitsFromLocale === "function"
    ? window.guessUnitsFromLocale()
    : "metric";
  const fallbackLang = typeof window.I18N?.normalizeLang === "function"
    ? window.I18N.normalizeLang(window.I18N.language || "en")
    : "en";
  if (!userId) {
    window.CURRENT_PROFILE = { username: "", units: fallbackUnits, language: fallbackLang };
    return window.CURRENT_PROFILE;
  }
  const { data, error } = await sb.from("profiles").select("username,units,language").eq("user_id", userId).maybeSingle();
  if (error) {
    window.CURRENT_PROFILE = { username: "", units: fallbackUnits, language: fallbackLang };
  } else {
    const units = data?.units === "imperial" || data?.units === "metric"
      ? data.units
      : fallbackUnits;
    const language = typeof window.I18N?.normalizeLang === "function"
      ? window.I18N.normalizeLang(data?.language || fallbackLang)
      : fallbackLang;
    window.CURRENT_PROFILE = { username: data?.username || "", units, language };
    if (typeof window.setLanguage === "function") {
      window.setLanguage(language, { persist: true, silent: true });
      if (typeof window.applyDomI18n === "function") window.applyDomI18n();
    }
  }
  return window.CURRENT_PROFILE;
}
window.loadProfile = loadProfile;

function revealAppChrome() {
  document.body.classList.remove("logged-out");
  const header = document.getElementById("app-header");
  if (header) header.hidden = false;
  if (typeof window.applyDomI18n === "function") window.applyDomI18n();
}

let enterAppInFlight = null;
let enterAppUserId = null;
let enterAppGen = 0;

async function enterApp(session) {
  const uid = session?.user?.id;
  if (!uid) return;
  if (enterAppInFlight && enterAppUserId === uid) return enterAppInFlight;
  const gen = ++enterAppGen;
  enterAppUserId = uid;
  enterAppInFlight = (async () => {
    const stillCurrent = () => gen === enterAppGen && window.CURRENT_USER_ID === uid;
    const hasSetupUi = !!document.querySelector(".setup-form, .setup-connect-step, .setup-creating");
    // Keep a centered loading screen instead of leaving the sign-in card
    // uncentered after logged-out layout is cleared.
    if (!hasSetupUi) renderAuthLoading();
    window.CURRENT_USER_ID = uid;
    await loadProfile(uid);
    if (!stillCurrent()) return;
    showUser(session.user);
    try {
      // Finish Strava OAuth before setup routing can rewrite the URL.
      if (typeof window.maybeHandleStravaCallback === "function") {
        const handled = await window.maybeHandleStravaCallback();
        if (handled || !stillCurrent()) return;
      }
      const routeBase = location.pathname.replace(/^\/+|\/+$/g, "").split("/")[0] || "";
      const stayingOnSetup = document.body.classList.contains("onboarding")
        || routeBase === "setup"
        || routeBase === "create-plan"
        || !!document.querySelector(".setup-form, .setup-connect-step, .setup-creating");
      if (stayingOnSetup) {
        // Full reload of /setup or /create-plan used to return here with only "Loading…".
        const setupUi = document.querySelector(".setup-form, .setup-connect-step, .setup-creating");
        if (!setupUi && routeBase === "create-plan" && typeof window.renderCreatePlan === "function") {
          window.renderCreatePlan();
        } else if (!setupUi && typeof window.renderOnboarding === "function") {
          window.renderOnboarding();
        } else if (!setupUi && typeof window.bootApp === "function") {
          revealAppChrome();
          await window.bootApp();
        }
        return;
      }
      const ready = typeof window.ensurePlan === "function" ? await window.ensurePlan(session.user) : true;
      if (!stillCurrent()) return;
      if (document.body.classList.contains("onboarding") || document.querySelector(".setup-form, .setup-connect-step, .setup-creating")) {
        return;
      }
      if (ready && typeof window.bootApp === "function") {
        revealAppChrome();
        await window.bootApp();
      }
    } catch (err) {
      if (!stillCurrent()) return;
      renderLogin(err.message || "Could not load your plan.");
    }
  })();
  try {
    await enterAppInFlight;
  } finally {
    if (enterAppUserId === uid) {
      enterAppInFlight = null;
      enterAppUserId = null;
    }
  }
}

function resetAuthEntry() {
  enterAppGen += 1;
  enterAppInFlight = null;
  enterAppUserId = null;
}
window.resetAuthEntry = resetAuthEntry;

document.addEventListener("click", (e) => {
  const tab = e.target.closest("[data-auth-mode]");
  if (tab) setAuthMode(tab.dataset.authMode);
  if (e.target.closest("[data-action=cancel-recovery]")) {
    e.preventDefault();
    pendingRecovery = false;
    suppressAuthNavigation = false;
    sb.auth.signOut();
    return;
  }
  if (e.target.closest("[data-action=logout]")) {
    e.preventDefault();
    resetAuthEntry();
    if (typeof window.resetApp === "function") window.resetApp();
    else {
      window.CURRENT_USER_ID = null;
      window.CURRENT_PROFILE = null;
      window.CURRENT_USER_EMAIL = "";
      if (typeof window.clearPlanRow === "function") window.clearPlanRow();
      else window.CURRENT_PLAN = null;
    }
    pendingRecovery = false;
    sb.auth.signOut();
  }
});

document.addEventListener("input", (e) => {
  const form = e.target.closest?.(".auth-form");
  if (!form || form.dataset.mode === "signin" || form.dataset.mode === "forgot") return;
  if (!["password", "confirm", "email"].includes(e.target.name)) return;
  paintPasswordRules(form);
  form.querySelector(".form-error").textContent = "";
});

document.addEventListener("submit", async (e) => {
  const form = e.target.closest(".auth-form");
  if (!form) return;
  e.preventDefault();
  const errorEl = form.querySelector(".form-error");
  const noteEl = form.querySelector(".form-note");
  const mode = form.dataset.mode;
  let email = form.email ? form.email.value.trim() : "";
  errorEl.textContent = "";
  noteEl.textContent = "";
  if (mode === "recovery" && !email) {
    const { data: { session } } = await sb.auth.getSession();
    email = session?.user?.email || "";
  }
  if (mode === "signup" || mode === "recovery") {
    const message = passwordError(form.password.value, form.confirm.value, email);
    if (message) {
      errorEl.textContent = message;
      paintPasswordRules(form, true);
      return;
    }
  }
  if (mode !== "recovery") {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errorEl.textContent = "Enter a valid email.";
      return;
    }
  }
  const password = form.password ? form.password.value : "";
  const submit = form.querySelector("button[type=submit]");
  submit.disabled = true;
  try {
    if (mode === "forgot") {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: authRedirectTo() });
      if (error) throw error;
      noteEl.textContent = "If an account exists for that email, a reset link is on its way.";
      return;
    }
    if (mode === "recovery") {
      suppressAuthNavigation = true;
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw error;
      pendingRecovery = false;
      clearAuthParams();
      const { data: { session } } = await sb.auth.getSession();
      if (session) await enterApp(session);
      return;
    }
    if (mode === "signup") {
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: authRedirectTo("/setup") },
      });
      if (error) throw error;
      try {
        sessionStorage.setItem("setup-pending-connect", "1");
        if (email) localStorage.setItem(`setup-pending-connect-email:${email.toLowerCase()}`, "1");
      } catch { /* ignore */ }
      if (!data.session) {
        renderLogin("Account created. Check your email to confirm, then sign in.", { mode: "signin", tone: "ok", email });
        return;
      }
      renderAuthLoading();
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      try {
        const pending = email && localStorage.getItem(`setup-pending-connect-email:${email.toLowerCase()}`) === "1";
        if (pending) sessionStorage.setItem("setup-pending-connect", "1");
        else sessionStorage.removeItem("setup-pending-connect");
      } catch { /* ignore */ }
      renderAuthLoading();
    }
  } catch (err) {
    errorEl.textContent = err.message || "Could not sign in.";
  } finally {
    suppressAuthNavigation = false;
    submit.disabled = false;
  }
});

sb.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY") pendingRecovery = true;
  if (suppressAuthNavigation) return;
  if (pendingRecovery) {
    renderPasswordReset(session?.user?.email || "");
    return;
  }
  if (session) {
    enterApp(session);
    return;
  }
  if (event !== "SIGNED_OUT" && event !== "INITIAL_SESSION") return;
  // SIGNED_OUT can arrive after a fast re-login; don't wipe the new session.
  if (event === "SIGNED_OUT") {
    sb.auth.getSession().then(({ data: { session: current } }) => {
      if (current) {
        enterApp(current);
        return;
      }
      resetAuthEntry();
      if (typeof window.resetApp === "function") window.resetApp();
      else if (typeof window.clearPlanRow === "function") window.clearPlanRow();
      renderLogin(authLink.error || "", authLink.error ? { mode: authLink.type === "recovery" ? "forgot" : "signin" } : {});
    });
    return;
  }
  renderLogin(authLink.error || "", authLink.error ? { mode: authLink.type === "recovery" ? "forgot" : "signin" } : {});
});

sb.auth.getSession().then(({ data: { session } }) => {
  if (pendingRecovery) {
    if (session) renderPasswordReset(session.user?.email || "");
    else renderLogin("This reset link is invalid or has expired. Request a new one.", { mode: "forgot" });
    clearAuthParams();
    return;
  }
  if (session) {
    enterApp(session).then(() => {
      if (authLink.error) clearAuthParams();
    }).catch(() => {
      if (authLink.error) clearAuthParams();
    });
    return;
  }
  if (authLink.error) {
    renderLogin(authLink.error, { mode: authLink.type === "recovery" ? "forgot" : "signin" });
    clearAuthParams();
    return;
  }
  if (!document.querySelector(".auth-form")) renderLogin();
});
