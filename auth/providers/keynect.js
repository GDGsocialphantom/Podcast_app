// Keynect provider: NOT WIRED UP YET. This is the shape the real one will take.
//
// The site never checks credentials itself. When Keynect replaces GitHub, the Worker gets a Keynect auth module with
// the same interface as worker/src/auth/github.js (authorizeUrl, exchange, isAdmin), and this file only needs to
// point the Log in button at the Worker's Keynect login route. Nothing in js/app.js or js/admin.js changes.
//
// Same contract as every browser-side provider:
//   loginUrl(next) -> string
//   me()           -> Promise<{ name, login, role } | null>
//   signOut()      -> Promise<void>
const KeynectAuthProvider = {
  name: "keynect",
  loginUrl(next) { return `${WORKER_URL}/auth/login?provider=keynect&next=${encodeURIComponent((next || "#home").replace(/^#/, ""))}`; },
  me: () => GitHubAuthProvider.me(),          // the session lookup is provider-agnostic: the Worker owns the cookie
  signOut: () => GitHubAuthProvider.signOut()
};
