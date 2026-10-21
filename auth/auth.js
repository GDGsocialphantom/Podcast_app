// Auth: session state and the login/admin UI. This is the only file the rest of the site talks to.
// It never sees passwords or tokens; the Worker at WORKER_URL does the login (GitHub OAuth today) and keeps the
// session in an HttpOnly cookie on its own origin. This file asks AUTH_PROVIDER who is logged in and caches the answer.
//
// Exposed to js/app.js and js/admin.js:  session, isAdmin(), renderChrome(), renderLogin(next), REQUIRE_LOGIN, WORKER_URL, apiPost()
// Expects from js/app.js at call time:  app, esc, setNav, route, showById, EPISODES, SHOWS

const WORKER_URL = "https://podcast-app.gwen-031.workers.dev";   // the one place the backend address lives
const AUTH_PROVIDER = GitHubAuthProvider; // swap for KeynectAuthProvider when Keynect is ready (see auth/README.md)
const REQUIRE_LOGIN = false;              // true = visitors must log in to see anything
const SKEY = "kl.session";                // localStorage cache of the last answer from /auth/me, for a flicker-free first paint

const LOGO_SVG = `<svg class="mark" viewBox="0 0 32 32" aria-hidden="true"><path d="M6 4 L14 16 L6 28" fill="none" stroke="#BFD730" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M26 4 L18 16 L26 28" fill="none" stroke="#76CED9" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/* ---------- session ---------- */
// `session` is only a cache for rendering. Nothing that writes trusts it: the Worker checks its own cookie on every save.
let session = null;
try { session = JSON.parse(localStorage.getItem(SKEY) || "null"); } catch (e) { session = null; }
const isAdmin = () => !!session && session.role === "admin";
const storeSession = s => { session = s; try { if (s) localStorage.setItem(SKEY, JSON.stringify(s)); else localStorage.removeItem(SKEY); } catch (e) {} };

// Ask the backend who is logged in. Called once on load (and after returning from the login redirect);
// re-renders the chrome and the current page if the answer differs from the cache.
async function refreshSession() {
  if (location.protocol === "file:") return;
  let fresh;
  try { fresh = await AUTH_PROVIDER.me(); } catch (e) { console.warn("auth: could not reach the login service", e); return; }
  const changed = JSON.stringify(fresh) !== JSON.stringify(session);
  storeSession(fresh);
  if (changed) { renderChrome(); route(); }
}

async function logout() {
  storeSession(null);
  try { await AUTH_PROVIDER.signOut(); } catch (e) { console.warn("auth: signOut failed", e); }
  location.hash = "#home";
  renderChrome();
  route();
}

// POST JSON to the Worker with the session cookie. Resolves with the parsed body; rejects with an Error whose
// message is the Worker's { error } text, so callers can show it as is.
async function apiPost(path, data) {
  const r = await fetch(WORKER_URL + path, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data || {}) });
  let body = null; try { body = await r.json(); } catch (e) { body = null; }
  if (!r.ok) {
    if (r.status === 401) storeSession(null), renderChrome();
    throw new Error(body && body.error ? body.error : `HTTP ${r.status}`);
  }
  return body;
}

/* ---------- sidebar account chip, show list and admin bar ---------- */
function renderChrome() {
  const acct = document.getElementById("acct"), bar = document.getElementById("adminbar");
  if (session) {
    acct.innerHTML = `<div class="row"><span class="name">${esc(session.name)}</span><span class="role ${esc(session.role)}">${esc(session.role)}</span></div><button type="button" id="logout">Log out</button>`;
    document.getElementById("logout").onclick = logout;
  } else {
    acct.innerHTML = `<a href="#login">Log in</a>`;
  }
  bar.hidden = !isAdmin();
  document.getElementById("shownav").innerHTML = SHOWS.map(s => `<a href="#show-${s.id}" style="${showVars(s)}">${showLogo(s, "xs")}<span class="txt">${esc(s.name)}</span></a>`).join("");
}

/* ---------- login page ---------- */
const LOGIN_ERRORS = {
  denied: "That GitHub account is not on the admin list for this site.",
  state: "The login link expired or was opened in another browser. Try again.",
  failed: "GitHub did not complete the login. Try again."
};
function renderLogin(next) {
  const reason = new URLSearchParams(location.search).get("auth");
  if (reason) history.replaceState(null, "", location.pathname + location.hash);   // the error shows once
  const offline = location.protocol === "file:";
  app.innerHTML = `<div class="login-logo">${LOGO_SVG}<span>Keystone Listens</span></div><div class="login card" id="login-card">
    <div><h1>Admin log in</h1><p class="sub">Editing the site is for Keystone staff. You will be sent to GitHub to sign in and come straight back.</p></div>
    <p class="err" id="login-err" ${reason && LOGIN_ERRORS[reason] ? "" : "hidden"}>${esc(LOGIN_ERRORS[reason] || "")}</p>
    <div><a class="btn" id="login-go" href="${offline ? "#login" : esc(AUTH_PROVIDER.loginUrl(next))}" ${offline ? 'aria-disabled="true"' : ""}>Log in with GitHub</a></div>
    ${offline ? `<p class="sub">Logging in needs the site served over http, not opened from a file.</p>` : ""}
  </div>`;
  setNav(null);
}
