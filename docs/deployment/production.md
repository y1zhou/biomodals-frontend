# Production frontend example

The production frontend is a static build served at `https://biomodals.example.com`
from `/srv/biomodals.example.com`. `beta.biomodals.example.com` remains a development-only
Vite site and is not a production release target.

This repository does not own the live Caddyfile and these instructions do not
perform a deployment. An Administrator should:

1. install the exact dependencies from `bun.lock`;
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
