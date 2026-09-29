// Auth: session state and the login/admin UI. This is the only file the rest of the site talks to.
// It never looks at passwords itself; it asks AUTH_PROVIDER (see auth/providers/) and stores the answer.
//
// Exposed to js/app.js and js/admin.js:  session, isAdmin(), renderChrome(), renderLogin(next), REQUIRE_LOGIN
// Expects from js/app.js at call time:  app, esc, setNav, route, showById, EPISODES, SHOWS

const AUTH_PROVIDER = LocalAuthProvider; // swap for KeynectAuthProvider when Keynect is ready (see auth/README.md)
const REQUIRE_LOGIN = false;             // true = visitors must log in to see anything
const SKEY = "kl.session";               // localStorage key for the current session

const LOGO_SVG = `<svg class="mark" viewBox="0 0 32 32" aria-hidden="true"><path d="M6 4 L14 16 L6 28" fill="none" stroke="#BFD730" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M26 4 L18 16 L26 28" fill="none" stroke="#76CED9" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/* ---------- session ---------- */
let session = null;
try { session = JSON.parse(localStorage.getItem(SKEY) || "null"); } catch (e) { session = null; }
const isAdmin = () => !!session && session.role === "admin";

async function login(email, password) {
  const user = await AUTH_PROVIDER.authenticate(email, password);
  if (!user) return null;
  session = user;
  try { localStorage.setItem(SKEY, JSON.stringify(session)); } catch (e) {}
  return session;
}

async function logout() {
  const old = session;
  session = null;
  try { localStorage.removeItem(SKEY); } catch (e) {}
  try { await AUTH_PROVIDER.signOut(old); } catch (e) { console.warn("auth: signOut failed", e); }
  location.hash = "#home";
  renderChrome();
  route();
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
  document.getElementById("shownav").innerHTML = SHOWS.map(s => `<a href="#show-${s.id}" style="--show:${s.color}"><span class="dot"></span><span class="txt">${esc(s.name)}</span></a>`).join("");
}

/* ---------- login page ---------- */
function renderLogin(next) {
  const devHint = AUTH_PROVIDER.name === "local" && typeof DEV_ACCOUNTS !== "undefined"
    ? `<div class="dev"><span>Development accounts (auth/users.js):</span>${DEV_ACCOUNTS.map(a => `<span>${esc(a.role)} · ${esc(a.email)} / ${esc(a.password)}</span>`).join("")}</div>`
    : "";
  app.innerHTML = `<div class="login-logo">${LOGO_SVG}<span>Keystone Listens</span></div><form class="login card" id="login-form">
    <div><h1>Log in to your account</h1><p class="sub">Enter your credentials to access your account</p></div>
    <label>Email<input type="email" id="login-email" name="email" autocomplete="username" required></label>
    <label>Password<input type="password" id="login-password" name="password" autocomplete="current-password" required></label>
    <p class="err" id="login-err" hidden></p>
    <div><button class="btn" type="submit" id="login-submit">Log in</button></div>
    ${devHint}
  </form>`;
  const f = document.getElementById("login-form"), err = document.getElementById("login-err"), btn = document.getElementById("login-submit");
  f.onsubmit = async ev => {
    ev.preventDefault();
    btn.disabled = true; err.hidden = true;
    try {
      const ok = await login(f.email.value, f.password.value);
      if (ok) {
        renderChrome();
        const target = next && next !== "#login" ? next : "#home";
        if (location.hash === target) route(); else location.hash = target;
        return;
      }
      err.textContent = "That email and password don't match. Try again.";
    } catch (e) {
      console.error("auth: login error", e);
      err.textContent = "Couldn't reach the login service. Try again in a moment.";
    } finally {
      btn.disabled = false;
    }
    err.hidden = false;
  };
  setNav(null);
}
