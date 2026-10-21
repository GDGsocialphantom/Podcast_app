# worker/

The Keystone Listens backend: a Cloudflare Worker named `podcast-app` at https://podcast-app.gwen-031.workers.dev. It logs admins in with GitHub, validates what the admin editor sends with the same rules as `tools/check-data.js` (`tools/rules.js`), and commits to `main` with a repo token. The browser never holds a token, and the role it claims is never trusted.

```
wrangler.toml         name, entry point, public vars (site origin, repo, branch, session days, write limit)
src/index.js          router: auth routes, saves, workflow dispatch, CORS, rate limit
src/session.js        signed HttpOnly cookie (HMAC-SHA256 with SESSION_SECRET)
src/auth/github.js    the auth provider (GitHub OAuth); a Keynect module with the same shape replaces it later
src/github.js         GitHub REST: read a file, commit several files in one commit (Git Data API), dispatch a workflow
```

## Routes
| Route | What it does |
| --- | --- |
| `GET /auth/login?next=<hash>` | Sends the browser to GitHub. A signed state cookie protects the round trip. |
| `GET /auth/callback` | Exchanges the code, checks the login against `ADMIN_GITHUB_USERS`, sets the session cookie (7 days), redirects to the site. A refused login lands on the site with `?auth=denied`. |
| `POST /auth/logout` | Clears the cookie. |
| `GET /auth/me` | `{ name, login, role }` or 401. |
| `POST /save/episode` | `{ episode, editingId?, transcript? }`. Validates, rewrites that episode's object in `data/episodes.js` (or inserts a new one), writes `data/transcripts/<id>.json` if a transcript came along, one commit. Returns `{ commit, url, warnings }`. |
| `POST /save/show` | `{ show, editingId? }`. Same for `data/shows.js`. |
| `POST /save/logo` | `{ show, editingId?, logo: { ext, dataUrl } }`. Writes `assets/shows/<id>.<ext>` and the show object in one commit. |
| `POST /import/run` | `{ workflow: "transcripts" \| "import", inputs? }`. Dispatches that GitHub workflow on `main`. |

All `POST` routes except logout require the session cookie, an `Origin` of the site, and count toward 30 writes per hour per login. Commit messages name the admin: `Update show eko: The EKO System` / `Saved by Gwen (@login) via the site admin`.

## Secrets (Cloudflare dashboard > Workers & Pages > podcast-app > Settings > Variables and Secrets)
`GITHUB_TOKEN` (fine-grained: Contents and Actions read/write on this repo), `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (the "Keystone Listens Admin" OAuth app, callback `<worker>/auth/callback`), `ADMIN_GITHUB_USERS` (comma separated GitHub logins), `SESSION_SECRET` (random, 48 chars). Deploys keep them.

## Deploying
`.github/workflows/deploy-worker.yml` runs `wrangler deploy` on every push to `main` that touches `worker/` or `tools/rules.js`, with the repo secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Locally: `cd worker && npm install && npm run check` bundles without deploying; `npm run dev` runs it on http://127.0.0.1:8787 with secrets from a `.dev.vars` file (ignored by git).

## Limits worth knowing
- The write counter is in the Worker's memory, so it resets when Cloudflare starts a fresh instance. The repo token's own limits are the hard stop.
- The session cookie is cross-site (site on github.io, Worker on workers.dev), so it needs `SameSite=None` and a browser that sends third-party cookies to workers.dev. Chrome and Edge do; Safari with "Prevent cross-site tracking" and Brave's default shields do not, and there the admin can use the generated code by hand. A custom domain for both would remove this.
