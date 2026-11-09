const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
window.sb = sb;

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

function renderLogin(message = "") {
  document.body.classList.add("logged-out");
  const header = document.getElementById("app-header");
  if (header) header.hidden = true;
  document.getElementById("day-dialog")?.close();
  document.getElementById("app").innerHTML = `
    <section class="auth-card">
      <div class="auth-brand">
        <span class="brand-mark" aria-hidden="true">TP</span>
        <div>
          <div class="eyebrow">Your training</div>
          <h1>Training Plan</h1>
        </div>
      </div>
      <p class="muted">Sign in to open your plan.</p>
      <div class="auth-tabs">
        <button class="auth-tab active" type="button" data-auth-mode="signin">Sign in</button>
        <button class="auth-tab" type="button" data-auth-mode="signup">Create account</button>
      </div>
      <form class="auth-form" data-mode="signin">
        <label>Email<input type="email" name="email" required autocomplete="email" /></label>
        <label>Password<input type="password" name="password" required minlength="8" autocomplete="current-password" /></label>
        <label class="confirm-row" hidden>Confirm password<input type="password" name="confirm" minlength="8" autocomplete="new-password" /></label>
        <p class="form-error">${message}</p>
        <button class="button" type="submit">Sign in</button>
      </form>
    </section>`;
}

function setAuthMode(mode) {
  const form = document.querySelector(".auth-form");
  if (!form) return;
  form.dataset.mode = mode;
  form.querySelector(".confirm-row").hidden = mode !== "signup";
  form.password.autocomplete = mode === "signup" ? "new-password" : "current-password";
  form.querySelector("button[type=submit]").textContent = mode === "signup" ? "Create account" : "Sign in";
  document.querySelectorAll(".auth-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.authMode === mode));
  form.querySelector(".form-error").textContent = "";
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

async function enterApp(session) {
  document.body.classList.remove("logged-out");
  const header = document.getElementById("app-header");
  if (header) header.hidden = false;
  await loadProfile(session.user.id);
  showUser(session.user);
  try {
    const stayingOnSetup = document.body.classList.contains("onboarding")
      || location.pathname.replace(/^\/+|\/+$/g, "").split("/")[0] === "setup";
    const ready = typeof window.ensurePlan === "function" ? await window.ensurePlan(session.user) : true;
    if (stayingOnSetup || document.body.classList.contains("onboarding") || document.querySelector(".setup-form")) {
      return;
    }
    if (ready && typeof window.bootApp === "function") await window.bootApp();
  } catch (err) {
    renderLogin(err.message || "Could not load your plan.");
  }
}

document.addEventListener("click", (e) => {
  const tab = e.target.closest("[data-auth-mode]");
  if (tab) setAuthMode(tab.dataset.authMode);
  if (e.target.closest("[data-action=logout]")) {
    e.preventDefault();
    if (typeof window.resetApp === "function") window.resetApp();
    window.CURRENT_PLAN = null;
    window.CURRENT_USER_ID = null;
    window.CURRENT_PROFILE = null;
    window.CURRENT_USER_EMAIL = "";
    sb.auth.signOut();
  }
});

document.addEventListener("submit", async (e) => {
  const form = e.target.closest(".auth-form");
  if (!form) return;
  e.preventDefault();
  const errorEl = form.querySelector(".form-error");
  const email = form.email.value.trim();
  const password = form.password.value;
  const mode = form.dataset.mode;
  errorEl.textContent = "";
  if (mode === "signup" && password !== form.confirm.value) {
    errorEl.textContent = "Passwords don't match.";
    return;
  }
  const submit = form.querySelector("button[type=submit]");
  submit.disabled = true;
  try {
    if (mode === "signup") {
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: location.origin },
      });
      if (error) throw error;
      try {
        sessionStorage.setItem("setup-pending-connect", "1");
        if (email) localStorage.setItem(`setup-pending-connect-email:${email.toLowerCase()}`, "1");
      } catch { /* ignore */ }
      if (!data.session) {
        errorEl.textContent = "Account created. Check your email to confirm, then sign in.";
        setAuthMode("signin");
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
    submit.disabled = false;
  }
});

sb.auth.onAuthStateChange((event, session) => {
  if (session) enterApp(session);
  else if (event === "SIGNED_OUT" || event === "INITIAL_SESSION") renderLogin();
});

sb.auth.getSession().then(({ data: { session } }) => {
  if (session) enterApp(session);
  else if (!document.querySelector(".auth-form")) renderLogin();
});
