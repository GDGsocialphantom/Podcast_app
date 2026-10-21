// GitHub provider: the Worker (auth/auth.js, WORKER_URL) runs GitHub OAuth and keeps the session in a signed,
// HttpOnly cookie on its own origin. The browser never sees a token or a password; it only asks the Worker who is
// logged in. Admins are the GitHub logins listed in the Worker's ADMIN_GITHUB_USERS secret.
//
// Every provider exposes the same three functions so auth/auth.js never changes when the provider does:
//   loginUrl(next) -> string                          where the Log in button sends the browser
//   me()           -> Promise<{ name, login, role } | null>   who the backend says is logged in (null = nobody)
//   signOut()      -> Promise<void>
const GitHubAuthProvider = {
  name: "github",
  loginUrl(next) { return `${WORKER_URL}/auth/login?next=${encodeURIComponent((next || "#home").replace(/^#/, ""))}`; },
  async me() {
    const r = await fetch(`${WORKER_URL}/auth/me`, { credentials: "include", cache: "no-store" });
    if (r.status === 401) return null;
    if (!r.ok) throw new Error(`auth: /auth/me returned HTTP ${r.status}`);
    const u = await r.json();
    return { name: u.name, login: u.login, role: u.role === "admin" ? "admin" : "user" };
  },
  async signOut() {
    await fetch(`${WORKER_URL}/auth/logout`, { method: "POST", credentials: "include" });
  }
};
