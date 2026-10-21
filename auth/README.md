# auth/

Everything about logging in lives here. If a bug involves the login page, the account chip in the header, the admin bar, or who counts as an admin, it is in this folder or in `worker/`.

```
auth.js               session cache, WORKER_URL, login page, admin bar, apiPost() for saves (the code)
auth.css              styles for those pieces
providers/github.js   asks the Worker who is logged in; Log in sends the browser to the Worker's GitHub OAuth route
providers/keynect.js  same interface, for when Keynect replaces GitHub; not wired up
```

## How it fits together
Nothing in the browser checks credentials or holds a token. `auth.js` keeps a cached copy of the last answer from the Worker's `/auth/me` in `localStorage` (`kl.session`) so the page paints the right chrome at once, then asks the Worker again on every load. The cache only decides what is drawn; every write goes to the Worker, which verifies its own HttpOnly cookie and the admin list before touching GitHub. Faking `role: "admin"` in devtools shows the admin forms and nothing else: Save returns 401.

The Worker (`worker/`, deployed as `podcast-app`) runs GitHub OAuth, keeps the session in a signed cookie for 7 days, and allows only the GitHub logins in its `ADMIN_GITHUB_USERS` secret. `WORKER_URL` in `auth.js` is the one place its address lives.

Every browser-side provider has the same three functions:

```
loginUrl(next) -> string
me()           -> Promise<{ name, login, role } | null>
signOut()      -> Promise<void>
```

## Moving to Keynect
1. Add `worker/src/auth/keynect.js` with the same shape as `worker/src/auth/github.js` (`authorizeUrl`, `exchange`, `isAdmin`) and switch `AUTH` in `worker/src/index.js`.
2. In `index.html`, load `auth/providers/keynect.js` instead of `auth/providers/github.js`; in `auth.js`, set `AUTH_PROVIDER = KeynectAuthProvider`.
Nothing in `js/app.js` or `js/admin.js` changes.

## Debugging
- Log in button does nothing: it is a plain link to `WORKER_URL/auth/login`; check the Worker is deployed (open `WORKER_URL/` in a tab, it answers with JSON).
- Logged in on GitHub but sent back with an error: `?auth=denied` means the login is not in `ADMIN_GITHUB_USERS`; `?auth=state` means the login link expired (10 minutes) or was opened in a different browser.
- Admin bar shows but Save says "Log in as an admin first": the cookie expired or the browser blocks third-party cookies for the Worker's domain; log in again.
- Stuck logged in: `localStorage.removeItem("kl.session")` and reload; the Worker cookie clears with Log out.
