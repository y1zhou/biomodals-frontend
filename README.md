# BioModals frontend

Static React frontend for the BioModals web tools catalog. This repository owns
the browser application only; FastAPI and Caddy are deployed separately.

## Development

Requires [Bun](https://bun.sh/).

```sh
bun install
bun dev
```

The Vite development server listens on `0.0.0.0` so the MVP can be opened from
another machine on the development network. It proxies `/api/*`, `/docs`, and
`/openapi.json` to `http://127.0.0.1:8000`; do not expose this development
server to an untrusted network.
Production builds use same-origin `/api` URLs and expect the deployment proxy to
route them to FastAPI.

## Commands

```sh
bun dev          # start Vite
bun run lint     # run Oxlint
bun test         # run Bun tests
bun run build    # typecheck and build dist/
bun run api:generate # regenerate types from the live local OpenAPI document
bun run api:check    # fail when generated API types are stale
bun run preview  # preview dist/ locally
```

## Current state

The MVP has a searchable typed Tool Catalog and one real Tool, `GROMACS MD
simulation`. It includes administrator-provisioned account flows, a protected
multipart Submission with upload progress and idempotency, durable Job detail,
active-only polling, cancellation, a responsive My Jobs table, and direct
Result downloads. Administrators can manage Users, admission limits, and live
non-secret Modal configuration through protected Admin routes. API types in
`src/api/schema.d.ts` are generated from the live FastAPI OpenAPI document.

To add another Tool, add its metadata to `src/tools.ts` and introduce a
lazy-loaded internal route module. Keep Tool cards as real links and prefer
native browser controls for simple interactions such as file selection.

## Project documentation

- `AGENTS.md` contains repository workflow and implementation conventions.
- `CONTEXT.md` defines the canonical BioModals domain language.
- `docs/adr/` records the frontend boundary, resumable Job model, retention
  policy, and account/session decisions.
- `docs/agents/` configures the issue tracker, triage vocabulary, and domain-doc
  layout used by engineering skills.

The production build is a browser-routed SPA. Its static server must fall back
to `index.html` for paths that do not match real files. Vite's preview server is
for local verification, not production hosting. Whether `/docs` is exposed in
production is a deployment-proxy decision outside this repository.

The frontend intentionally has no backend URL environment variable. It always
uses relative `/api` URLs: Vite owns the single development proxy target, and
the production reverse proxy serves the frontend and API under one origin.
