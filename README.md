# BioModals frontend

Static React frontend for the BioModals web tools catalog. This repository owns
the browser application only; FastAPI and Caddy are deployed separately.

## Development

Requires [Bun](https://bun.sh/).

```sh
bun install
bun dev
```

The Vite development server proxies `/api/*` to `http://127.0.0.1:8000`.
Production builds use same-origin `/api` URLs and expect the deployment proxy to
route them to FastAPI.

## Commands

```sh
bun dev          # start Vite
bun run lint     # run Oxlint
bun test         # run Bun tests
bun run build    # typecheck and build dist/
bun run preview  # preview dist/ locally
```

## Current state

The app has a searchable landing page, a typed catalog of clearly labelled
example Tools, internal placeholder routes, and TanStack Query at the
application root. The real Tool inventory and the stable FastAPI OpenAPI schema
have not yet been supplied.

To add a real Tool, add its metadata to `src/tools.ts` and introduce a
lazy-loaded internal route module. Keep the card as a real link and prefer
native browser controls for simple interactions such as file selection.

The first recommended vertical slice is one real Tool covering input
validation, upload progress, idempotent Job creation, polling, failure and
cancellation states, recovery through Job History, and direct Result download.
Generate the TypeScript API types from FastAPI only after its OpenAPI schema is
stable.

## Project documentation

- `AGENTS.md` contains repository workflow and implementation conventions.
- `CONTEXT.md` defines the canonical BioModals domain language.
- `docs/adr/` records the frontend boundary, resumable Job model, retention
  policy, and account/session decisions.
- `docs/agents/` configures the issue tracker, triage vocabulary, and domain-doc
  layout used by engineering skills.

The production build is a browser-routed SPA. Its static server must fall back
to `index.html` for paths that do not match real files. Vite's preview server is
for local verification, not production hosting.
