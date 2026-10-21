// Keystone Listens backend: a Cloudflare Worker that logs admins in with GitHub, validates what the admin editor sends
// with the same rules as tools/check-data.js, and commits to the repo with GITHUB_TOKEN. The browser never holds a
// repo token and its claimed role is never trusted: every write re-reads the signed cookie and ADMIN_GITHUB_USERS.
//
// Routes
//   GET  /auth/login?next=#hash     start GitHub OAuth
//   GET  /auth/callback             finish it, set the session cookie, redirect to the site
//   POST /auth/logout               clear the cookie
//   GET  /auth/me                   { name, login, role } or 401
//   POST /save/episode              { episode, editingId?, transcript? }  -> { commit, url }
//   POST /save/show                 { show, editingId? }                  -> { commit, url }
//   POST /save/logo                 { show, editingId?, logo: { ext, dataUrl } } -> one commit with the file and the show
//   POST /import/run                { workflow: "transcripts" | "import", inputs? } -> dispatches the GitHub workflow
import RULES from "../../tools/rules.js";
import { GitHubAuth } from "./auth/github.js";
import { COOKIE, sign, verify, readCookie, setCookie, clearCookie, randomToken } from "./session.js";
import { readFile, commitFiles, dispatchWorkflow } from "./github.js";

const AUTH = GitHubAuth;          // swap for a Keynect provider with the same shape when it exists
const STATE_COOKIE = "kl_oauth";
const LOGO_EXT = { png: "image/png", svg: "image/svg+xml", jpg: "image/jpeg", webp: "image/webp" };
const LOGO_MAX_BYTES = 1024 * 1024;
const WORKFLOWS = { transcripts: "transcripts.yml", import: "import.yml" };

// Per-user write counter. Lives in the isolate's memory, so it is a best-effort limit (a new isolate starts at zero);
// GITHUB_TOKEN's own rate limit is the hard backstop.
const writes = new Map();
function overLimit(login, env) {
  const limit = Number(env.WRITES_PER_HOUR) || 30, now = Date.now();
  const list = (writes.get(login) || []).filter(t => now - t < 3600e3);
  if (list.length >= limit) { writes.set(login, list); return true; }
  list.push(now); writes.set(login, list);
  return false;
}

/* ---------- responses ---------- */
function cors(env, request) {
  const origin = request.headers.get("Origin");
  const h = { "Vary": "Origin" };
  if (origin === env.SITE_ORIGIN) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Credentials"] = "true";
    h["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    h["Access-Control-Allow-Headers"] = "Content-Type";
    h["Access-Control-Max-Age"] = "600";
  }
  return h;
}
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra } });
const fail = (message, status = 400, extra = {}) => json({ error: message }, status, extra);

/* ---------- auth ---------- */
async function currentUser(request, env) {
  const payload = await verify(readCookie(request, COOKIE), env.SESSION_SECRET);
  if (!payload || !AUTH.isAdmin(payload, env)) return null;   // the allow list is checked on every request, not only at login
  return { login: payload.login, name: payload.name, role: "admin" };
}

async function authLogin(request, env, url) {
  const state = randomToken();
  const next = (url.searchParams.get("next") || "").replace(/[^\w#-]/g, "").slice(0, 80);
  const redirectUri = url.origin + "/auth/callback";
  const stateCookie = await sign({ state, next, exp: Math.floor(Date.now() / 1000) + 600 }, env.SESSION_SECRET);
  return new Response(null, { status: 302, headers: { "Location": AUTH.authorizeUrl({ env, redirectUri, state }), "Set-Cookie": setCookie(STATE_COOKIE, stateCookie, 600, { path: "/auth", sameSite: "Lax" }) } });
}

async function authCallback(request, env, url) {
  const back = (reason, next) => new Response(null, { status: 302, headers: { "Location": env.SITE_URL + (reason ? `?auth=${reason}` : "") + "#" + (next || (reason ? "login" : "home")), "Set-Cookie": clearCookie(STATE_COOKIE, { path: "/auth", sameSite: "Lax" }) } });
  const st = await verify(readCookie(request, STATE_COOKIE), env.SESSION_SECRET);
  const code = url.searchParams.get("code"), state = url.searchParams.get("state");
  if (!st || !code || !state || state !== st.state) return back("state");
  const identity = await AUTH.exchange({ env, code, redirectUri: url.origin + "/auth/callback" });
  if (!identity) return back("failed");
  if (!AUTH.isAdmin(identity, env)) return back("denied");
  const days = Number(env.SESSION_DAYS) || 7;
  const token = await sign({ login: identity.login, name: identity.name, role: "admin", exp: Math.floor(Date.now() / 1000) + days * 86400 }, env.SESSION_SECRET);
  const res = back(null, st.next && st.next.replace(/^#/, ""));
  res.headers.append("Set-Cookie", setCookie(COOKIE, token, days * 86400));
  return res;
}

/* ---------- saves ---------- */
async function body(request) {
  try { return await request.json(); } catch (e) { return null; }
}
const who = user => `${user.name} (@${user.login}) via the site admin`;

async function saveEpisode(request, env, user) {
  const b = await body(request);
  if (!b || !b.episode) return fail("Send { episode } as JSON.");
  const e = b.episode, editingId = b.editingId || null;
  const [showsSrc, episodesSrc] = await Promise.all([readFile(env, "data/shows.js"), readFile(env, "data/episodes.js")]);
  if (!showsSrc || !episodesSrc) return fail("Could not read the data files from GitHub.", 502);
  const showIds = new Set(RULES.idsIn(showsSrc)), episodeIds = new Set(RULES.idsIn(episodesSrc));
  if (editingId && !episodeIds.has(editingId)) return fail(`No episode with id "${editingId}" to replace.`, 404);
  const todoName = editingId ? RULES.hasTodoName(episodesSrc, editingId) : false;
  const r = RULES.validateEpisode(e, { showIds, episodeIds, editingId, todoName });
  if (r.problems.length) return fail(r.problems.join(" "), 422);
  const files = [];
  const source = RULES.episodeSource(e, { todoName: todoName && r.warnings.length > 0 });
  files.push({ path: "data/episodes.js", text: editingId ? RULES.replaceBlock(episodesSrc, editingId, source) : RULES.insertBlock(episodesSrc, "EPISODES", source) });
  if (Array.isArray(b.transcript) && b.transcript.length) {
    const tp = RULES.validateTranscript(b.transcript);
    if (tp.length) return fail(tp.join(" "), 422);
    files.push({ path: `data/transcripts/${e.id}.json`, text: RULES.transcriptSource(b.transcript) });
  }
  const msg = `${editingId ? "Update" : "Add"} episode ${e.id}: ${e.title}\n\nSaved by ${who(user)}.`;
  const c = await commitFiles(env, files, msg);
  return json({ ok: true, commit: c.sha, url: c.url, warnings: r.warnings, files: files.map(f => f.path) });
}

async function saveShow(request, env, user, withLogo) {
  const b = await body(request);
  if (!b || !b.show) return fail("Send { show } as JSON.");
  const s = b.show, editingId = b.editingId || null;
  const showsSrc = await readFile(env, "data/shows.js");
  if (!showsSrc) return fail("Could not read data/shows.js from GitHub.", 502);
  const showIds = new Set(RULES.idsIn(showsSrc));
  if (editingId && !showIds.has(editingId)) return fail(`No show with id "${editingId}" to replace.`, 404);
  if (editingId && s.id !== editingId) return fail("A show's id cannot change; episodes reference it.", 422);
  const files = [];
  if (withLogo) {
    const l = b.logo || {};
    const mime = LOGO_EXT[l.ext];
    const m = typeof l.dataUrl === "string" && l.dataUrl.match(/^data:([\w/+.-]+);base64,([A-Za-z0-9+/=]+)$/);
    if (!mime || !m) return fail("Send logo as { ext: png|svg|jpg|webp, dataUrl: data:<type>;base64,... }.", 422);
    if (m[1] !== mime) return fail(`The logo data is ${m[1]} but ext says ${l.ext}.`, 422);
    if (m[2].length * 3 / 4 > LOGO_MAX_BYTES) return fail("Logo is over 1 MB. Scale it down and try again.", 413);
    s.logo = `assets/shows/${s.id}.${l.ext}`;
    files.push({ path: s.logo, base64: m[2] });
  }
  const problems = RULES.validateShow(s, { showIds, editingId });
  if (problems.length) return fail(problems.join(" "), 422);
  const source = RULES.showSource(s);
  files.push({ path: "data/shows.js", text: editingId ? RULES.replaceBlock(showsSrc, editingId, source) : RULES.insertBlock(showsSrc, "SHOWS", source) });
  const msg = `${editingId ? "Update" : "Add"} show ${s.id}${withLogo ? " with logo" : ""}: ${s.name}\n\nSaved by ${who(user)}.`;
  const c = await commitFiles(env, files, msg);
  return json({ ok: true, commit: c.sha, url: c.url, files: files.map(f => f.path) });
}

async function importRun(request, env, user) {
  const b = await body(request);
  const file = WORKFLOWS[b && b.workflow];
  if (!file) return fail(`workflow should be one of: ${Object.keys(WORKFLOWS).join(", ")}.`);
  const inputs = {};
  if (b.inputs && typeof b.inputs === "object") for (const [k, v] of Object.entries(b.inputs)) if (/^\w+$/.test(k) && typeof v === "string") inputs[k] = v.slice(0, 100);
  const d = await dispatchWorkflow(env, file, inputs);
  return json({ ok: true, workflow: file, url: d.url, by: user.login });
}

/* ---------- router ---------- */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const h = cors(env, request);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
    const p = url.pathname.replace(/\/+$/, "") || "/";
    const withCors = res => { for (const [k, v] of Object.entries(h)) res.headers.set(k, v); return res; };
    try {
      if (p === "/" && request.method === "GET") return withCors(json({ ok: true, service: "keystone-listens", routes: ["/auth/login", "/auth/callback", "/auth/logout", "/auth/me", "/save/episode", "/save/show", "/save/logo", "/import/run"] }));
      if (p === "/auth/login" && request.method === "GET") return authLogin(request, env, url);
      if (p === "/auth/callback" && request.method === "GET") return authCallback(request, env, url);
      if (p === "/auth/logout" && request.method === "POST") return withCors(json({ ok: true }, 200, { "Set-Cookie": clearCookie(COOKIE) }));
      if (p === "/auth/me" && request.method === "GET") {
        const user = await currentUser(request, env);
        return withCors(user ? json(user) : fail("Not logged in.", 401));
      }
      // everything below writes: cookie verified server-side, allow list rechecked, same-origin only, rate limited
      if (request.method !== "POST") return withCors(fail("Not found.", 404));
      if (request.headers.get("Origin") !== env.SITE_ORIGIN) return withCors(fail("Origin not allowed.", 403));
      const user = await currentUser(request, env);
      if (!user) return withCors(fail("Log in as an admin first.", 401));
      if (overLimit(user.login, env)) return withCors(fail(`Limit of ${env.WRITES_PER_HOUR || 30} saves per hour reached. Try again later.`, 429));
      if (p === "/save/episode") return withCors(await saveEpisode(request, env, user));
      if (p === "/save/show") return withCors(await saveShow(request, env, user, false));
      if (p === "/save/logo") return withCors(await saveShow(request, env, user, true));
      if (p === "/import/run") return withCors(await importRun(request, env, user));
      return withCors(fail("Not found.", 404));
    } catch (err) {
      return withCors(fail("Server error: " + (err && err.message ? err.message : String(err)), 500));
    }
  }
};
