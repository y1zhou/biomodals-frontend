# Production frontend example

The production frontend is a static build served at `https://biomodals.example.com`
from `/srv/biomodals.example.com`. `beta.biomodals.example.com` remains a development-only
Vite site and is not a production release target.

This repository does not own the live Caddyfile and these instructions do not
perform a deployment. An Administrator should:

1. install the exact dependencies from `bun.lock` with `bun ci`;
2. run `bun run lint`, `bun run test`, and `bun run build`;
3. run `bun run api:check` against the intended backend revision;
4. run `bun run test:e2e` with the Playwright Chromium dependency installed;
5. stage `dist/` as a new static release and review its contents; and
6. only after the API is ready, atomically publish that reviewed directory at
   `/srv/biomodals.example.com`.

The manually triggered `Cross-repository checks` GitHub Actions workflow makes
steps 3 and 4 repeatable for an immutable revision pair. Supply the full
40-character candidate frontend and backend commit hashes as `frontend_sha`
and `backend_sha`. Branches, tags, and abbreviated hashes are rejected. Record
the successful workflow URL with that exact pair in the release notes. Its
deterministic backend never resolves a deployed Function or contacts Modal.

The reverse proxy must route same-origin `/api/*`, `/docs*`, `/redoc*`, and
`/openapi.json` to the one FastAPI process, fall back to `index.html` for
browser routes, cache hashed `/assets/*` immutably, and prevent persistent
caching of `index.html`. The documentation routes support the API Docs link in
the primary navigation. The proxy must add the production headers recorded in
the backend MVP runbook. Verify that the served site contains no
`/@vite/client`, React Refresh, HMR websocket, or source-module requests.

The frontend has no runtime API-host setting: relative requests deliberately
make the public origin the single browser configuration. The development and
preview proxy target in `.env.production.example` is server-side Vite
configuration only and is not included in the built JavaScript.

## Browser routes and password links

`/set-password` and `/login` are React routes registered in `src/App.tsx`, not
FastAPI endpoints or separate HTML files. Publish the contents of `dist/` so
the configured static root contains `index.html` and `assets/` directly.
Use the [README Caddy example](../../README.md#production-deployment): API
requests have a separate proxy handler, hashed assets have a file handler, and
the remaining browser requests use `try_files {path} /index.html` before
`file_server`. The HTML cache header must apply after that rewrite. See
[Caddy's SPA patterns](https://caddyserver.com/docs/caddyfile/patterns#single-page-apps-spas).

A root page that loads while direct `/login` and `/set-password` requests return
404 indicates a missing or ineffective SPA fallback. A successful Vite dev or
preview check alone does not verify the production Caddy configuration. Do not
add a backend password-page route or copy `index.html` into per-route folders.

For a token-free diagnostic, substitute the public origin below and issue only
GET requests:

```sh
SITE_ORIGIN=https://biomodals.example.com
curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' "$SITE_ORIGIN/"
curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' "$SITE_ORIGIN/login"
curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' "$SITE_ORIGIN/set-password"
curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' "$SITE_ORIGIN/openapi.json"
```

Expect 200 HTML for the three browser routes and 200 JSON for OpenAPI. Inspect
the referenced `/assets/` JavaScript and CSS requests too: they must return
actual assets, not fallback HTML. If all browser routes fail, verify the static
root and file permissions. If HTML succeeds but the screen stays blank, inspect
asset status/content type, browser errors and the deployed build revision.

Opening `/set-password` without a token should render the password-link error
message, which confirms that routing and the built application loaded. A real
Password Link uses a URL fragment; fragments are not sent to Caddy. Do not
include real links, fragments, cookies or passwords in diagnostics, screenshots
or logs. This routing check does not validate or consume a Password Link.

The September 2026 local Caddy reproduction served the same production build
with and without the fallback: both served `/` as 200, but only the fallback
served `/login` and `/set-password` as 200 with identical `index.html` bytes.
A browser rendered the token-free password-link error, and a mock API response
stayed outside the fallback. This verifies the configuration mechanism, not
that any production configuration has been changed. The backend deployment
owner must review and apply any host-owned Caddy change separately.
