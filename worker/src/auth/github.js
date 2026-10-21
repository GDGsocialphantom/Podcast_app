// Auth provider: GitHub OAuth. Every provider exposes the same three functions so src/index.js never changes
// when the provider does (Keynect later: same shape in src/auth/keynect.js, switched in index.js).
//
//   authorizeUrl({ env, redirectUri, state }) -> string    where to send the browser to log in
//   exchange({ env, code, redirectUri })      -> Promise<{ login, name } | null>   identity from the callback code
//   isAdmin(identity, env)                    -> boolean   whether this identity may write
export const GitHubAuth = {
  name: "github",

  authorizeUrl({ env, redirectUri, state }) {
    const u = new URL("https://github.com/login/oauth/authorize");
    u.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("scope", "read:user");
    u.searchParams.set("state", state);
    u.searchParams.set("allow_signup", "false");
    return u.toString();
  },

  async exchange({ env, code, redirectUri }) {
    const tok = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json", "User-Agent": "keystone-listens-worker" },
      body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code, redirect_uri: redirectUri })
    }).then(r => r.json()).catch(() => null);
    if (!tok || !tok.access_token) return null;
    const user = await fetch("https://api.github.com/user", {
      headers: { "Authorization": "Bearer " + tok.access_token, "Accept": "application/vnd.github+json", "User-Agent": "keystone-listens-worker" }
    }).then(r => r.ok ? r.json() : null).catch(() => null);
    if (!user || !user.login) return null;
    return { login: user.login, name: user.name || user.login };
  },

  // ADMIN_GITHUB_USERS: comma separated GitHub logins, case-insensitive.
  isAdmin(identity, env) {
    const allowed = String(env.ADMIN_GITHUB_USERS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    return !!identity && allowed.includes(String(identity.login).toLowerCase());
  }
};
