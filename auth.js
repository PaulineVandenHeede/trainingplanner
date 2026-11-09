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
  { id: "length", label: "12 to 72 characters", test: (password) => password.length >= 12 && password.length <= 72 },
  { id: "lower", label: "One lowercase letter", test: (password) => /[a-z]/.test(password) },
  { id: "upper", label: "One uppercase letter", test: (password) => /[A-Z]/.test(password) },
  { id: "digit", label: "One number", test: (password) => /[0-9]/.test(password) },
  { id: "symbol", label: "One symbol", test: (password) => /[^A-Za-z0-9\s]/.test(password) },
];

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
  const problems = PASSWORD_RULES.filter((rule) => !rule.test(password)).map((rule) => rule.label);
  if (password !== password.trim()) problems.push("No space at the start or end");
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const local = normalizedEmail.split("@")[0];
  if (normalizedEmail && password.trim().toLowerCase() === normalizedEmail) {
    problems.push("Can't be your email address");
  } else if (local.length >= 4 && password.toLowerCase().includes(local)) {
    problems.push("Can't include your email name");
  }
  return problems;
}

function passwordError(password, confirm, email) {
  if (!password) return "Enter a password.";
  if (password !== confirm) return "Passwords don't match.";
  const problems = passwordProblems(password, email);
  if (!problems.length) return "";
  const extras = problems.filter((problem) => !PASSWORD_RULES.some((rule) => rule.label === problem));
  if (extras.length === problems.length) return `${extras[0]}.`;
  if (extras.length) return `${extras[0]}. Also meet every requirement below.`;
  return "Meet every requirement below.";
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
    `<li data-rule="${rule.id}">${rule.label}</li>`).join("")}</ul>`;
}
window.passwordError = passwordError;
window.paintPasswordRules = paintPasswordRules;
window.passwordRulesHtml = passwordRulesHtml;

function renderLogin(message = "", options = {}) {
  document.body.classList.add("logged-out");
  const header = document.getElementById("app-header");
  if (header) header.hidden = true;
  document.getElementById("day-dialog")?.close();
  document.getElementById("app").innerHTML = `
    <section class="auth-card">
      <div class="auth-brand">
        <img class="brand-mark" src="/assets/app-icon.png" width="36" height="36" alt="" />
        <div>
          <div class="eyebrow">Your training</div>
          <h1>Training Pal</h1>
        </div>
      </div>
      <p class="muted auth-lead">Sign in to open your plan.</p>
      <div class="auth-tabs">
        <button class="auth-tab active" type="button" data-auth-mode="signin">Sign in</button>
        <button class="auth-tab" type="button" data-auth-mode="signup">Create account</button>
      </div>
      <form class="auth-form" data-mode="signin" novalidate>
        <label class="email-row">Email<input type="email" name="email" required autocomplete="email" /></label>
        <label class="password-row">Password<input type="password" name="password" required autocomplete="current-password" aria-describedby="password-rules" /></label>
        <label class="confirm-row" hidden>Confirm password<input type="password" name="confirm" autocomplete="new-password" /></label>
        ${passwordRulesHtml()}
        <p class="form-error" role="alert"></p>
        <p class="form-note" role="status"></p>
        <button class="button" type="submit">Sign in</button>
        <p class="auth-links">
          <button class="text-button forgot-row" type="button" data-auth-mode="forgot">Forgot password?</button>
          <button class="text-button back-row" type="button" data-auth-mode="signin" hidden>Back to sign in</button>
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
    <section class="auth-card">
      <div class="auth-brand">
        <img class="brand-mark" src="/assets/app-icon.png" width="36" height="36" alt="" />
        <div>
          <div class="eyebrow">Your training</div>
          <h1>New password</h1>
        </div>
      </div>
      <p class="muted auth-lead"></p>
      <form class="auth-form" data-mode="recovery" novalidate>
        <input type="hidden" name="email" value="" />
        <label class="password-row">New password<input type="password" name="password" required autocomplete="new-password" aria-describedby="password-rules" /></label>
        <label class="confirm-row">Confirm password<input type="password" name="confirm" autocomplete="new-password" /></label>
        ${passwordRulesHtml().replace(" hidden", "")}
        <p class="form-error" role="alert"></p>
        <p class="form-note" role="status"></p>
        <button class="button" type="submit">Save password</button>
        <p class="auth-links">
          <button class="text-button" type="button" data-action="cancel-recovery">Cancel</button>
        </p>
      </form>
    </section>`;
  const lead = document.querySelector(".auth-lead");
  if (lead) lead.textContent = email ? `Choose a new password for ${email}.` : "Choose a new password for your account.";
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
      ? "Enter your email and we'll send a link to choose a new password."
      : "Sign in to open your plan.";
  }
  form.password.required = !forgot;
  form.password.autocomplete = signup ? "new-password" : "current-password";
  form.querySelector("button[type=submit]").textContent = signup ? "Create account" : forgot ? "Send reset link" : "Sign in";
  document.querySelectorAll(".auth-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.authMode === mode));
  form.querySelector(".form-error").textContent = "";
  form.querySelector(".form-note").textContent = "";
  if (signup) paintPasswordRules(form);
}

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
  if (!userId) {
    window.CURRENT_PROFILE = { username: "" };
    return window.CURRENT_PROFILE;
  }
  const { data, error } = await sb.from("profiles").select("username").eq("user_id", userId).maybeSingle();
  if (error) window.CURRENT_PROFILE = { username: "" };
  else window.CURRENT_PROFILE = { username: data?.username || "" };
  return window.CURRENT_PROFILE;
}
window.loadProfile = loadProfile;

let enterAppInFlight = null;
async function enterApp(session) {
  if (enterAppInFlight) return enterAppInFlight;
  enterAppInFlight = (async () => {
    document.body.classList.remove("logged-out");
    const header = document.getElementById("app-header");
    if (header) header.hidden = false;
    window.CURRENT_USER_ID = session.user.id;
    await loadProfile(session.user.id);
    showUser(session.user);
    try {
      // Finish Strava OAuth before setup routing can rewrite the URL.
      if (typeof window.maybeHandleStravaCallback === "function") {
        const handled = await window.maybeHandleStravaCallback();
        if (handled) return;
      }
      const stayingOnSetup = document.body.classList.contains("onboarding")
        || location.pathname.replace(/^\/+|\/+$/g, "").split("/")[0] === "setup"
        || !!document.querySelector(".setup-form, .setup-connect-step");
      if (stayingOnSetup) {
        // Full reload of /setup used to return here with only "Loading…" — paint setup.
        const hasSetupUi = document.querySelector(".setup-form, .setup-connect-step");
        if (!hasSetupUi && typeof window.renderOnboarding === "function") {
          window.renderOnboarding();
        } else if (!hasSetupUi && typeof window.bootApp === "function") {
          await window.bootApp();
        }
        return;
      }
      const ready = typeof window.ensurePlan === "function" ? await window.ensurePlan(session.user) : true;
      if (document.body.classList.contains("onboarding") || document.querySelector(".setup-form, .setup-connect-step")) {
        return;
      }
      if (ready && typeof window.bootApp === "function") await window.bootApp();
    } catch (err) {
      renderLogin(err.message || "Could not load your plan.");
    }
  })();
  try {
    await enterAppInFlight;
  } finally {
    enterAppInFlight = null;
  }
}

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
    if (typeof window.resetApp === "function") window.resetApp();
    window.CURRENT_PLAN = null;
    window.CURRENT_USER_ID = null;
    window.CURRENT_PROFILE = null;
    window.CURRENT_USER_EMAIL = "";
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
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      try {
        const pending = email && localStorage.getItem(`setup-pending-connect-email:${email.toLowerCase()}`) === "1";
        if (pending) sessionStorage.setItem("setup-pending-connect", "1");
        else sessionStorage.removeItem("setup-pending-connect");
      } catch { /* ignore */ }
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
  if (session) enterApp(session);
  else if (event === "SIGNED_OUT" || event === "INITIAL_SESSION") {
    renderLogin(authLink.error && !session ? authLink.error : "", authLink.error ? { mode: authLink.type === "recovery" ? "forgot" : "signin" } : {});
  }
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
