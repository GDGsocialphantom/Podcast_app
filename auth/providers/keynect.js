// Keynect provider: NOT WIRED UP YET. This is the shape the real one will take.
//
// To switch the site to Keynect:
//   1. Fill in KEYNECT_BASE_URL and the two request bodies below to match Keynect's API.
//   2. In index.html, load this file instead of auth/providers/local.js, and stop loading auth/users.js.
//   3. In auth/auth.js, set AUTH_PROVIDER = KeynectAuthProvider.
// Nothing in js/app.js changes. Users then live in Keynect, not in this repo.
//
// Same contract as every provider:
//   authenticate(email, password) -> Promise<{ name, email, role } | null>
//   signOut(session)              -> Promise<void>
const KEYNECT_BASE_URL = ""; // e.g. "https://api.keynect.example"

const KeynectAuthProvider = {
  name: "keynect",
  async authenticate(email, password) {
    if (!KEYNECT_BASE_URL) throw new Error("Keynect provider is not configured: set KEYNECT_BASE_URL in auth/providers/keynect.js");
    const r = await fetch(`${KEYNECT_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password })
    });
    if (r.status === 401 || r.status === 403) return null;
    if (!r.ok) throw new Error(`Keynect login failed: HTTP ${r.status}`);
    const u = await r.json();
    // Map Keynect's user object onto the shape the site expects. Adjust the field names once the API is known.
    return { name: u.name, email: u.email, role: u.role === "admin" ? "admin" : "user", token: u.token };
  },
  async signOut(session) {
    if (!KEYNECT_BASE_URL || !session || !session.token) return;
    try { await fetch(`${KEYNECT_BASE_URL}/auth/logout`, { method: "POST", headers: { Authorization: `Bearer ${session.token}` } }); } catch (e) {}
  }
};
