# auth/

Everything about logging in lives here. If a bug involves the login page, the account chip in the header, the admin bar, or who counts as an admin, it is in this folder.

```
auth.js               session state, login/logout, the login page and admin bar (the code)
auth.css              styles for those pieces
users.js              the user store: development accounts only (the "database" today)
providers/local.js    checks credentials against users.js
providers/keynect.js  same interface, calls Keynect instead; not configured yet
```

## How it fits together
`js/app.js` never touches passwords or providers. It only reads `session`, calls `isAdmin()`, and hands off to `renderLogin()` / `renderAdminStub()`. `auth.js` asks whichever provider is set in `AUTH_PROVIDER` and stores the result in `localStorage` under `kl.session`.

Every provider has the same two functions, so swapping one for another is a one-line change in `auth.js`:

```
authenticate(email, password) -> Promise<{ name, email, role } | null>
signOut(session)              -> Promise<void>
```

## Current state: development only
Accounts are checked in the browser, so anyone can read `users.js` in the page source. This is a placeholder for layout and role testing, not security. Do not put real people or real passwords in `users.js`.

## Moving to Keynect
1. Fill in `KEYNECT_BASE_URL` and the request/response mapping in `providers/keynect.js`.
2. In `index.html`, load `auth/providers/keynect.js` instead of `auth/providers/local.js`, and drop the `auth/users.js` script tag.
3. In `auth.js`, set `AUTH_PROVIDER = KeynectAuthProvider`.

After that, users live in Keynect and nothing in this repo stores them. Admin status should come from Keynect's user object (see the `role` mapping in `keynect.js`), not from a list in this repo.

## Debugging
- Login form does nothing: open the console; `auth.js` logs `auth: login error` with the cause.
- Logged in but no admin bar: check `localStorage.getItem("kl.session")` in the console; `role` must be exactly `"admin"`.
- Stuck logged in: `localStorage.removeItem("kl.session")` and reload.
