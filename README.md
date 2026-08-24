# BioModals frontend

Static React frontend for the BioModals web tools catalog. It works with the
[BioModals backend](https://github.com/y1zhou/biomodals). This repository owns
the browser application only; FastAPI and Caddy are deployed separately.

## Development

Requires [Bun](https://bun.sh/).

```sh
bun install
cp .env.example .env
bun dev
```

The Vite development server keeps its default port `5173` and listens on
`0.0.0.0` so the MVP can be opened from another machine on the development
network.

`BIOMODALS_PUBLIC_URL` sets the allowed reverse-proxy hostname and the Origin
forwarded to FastAPI. `BIOMODALS_API_PROXY_TARGET` sets the server-only API
upstream, which defaults to `http://127.0.0.1:4144`.

Vite proxies `/api/*`, `/docs`, `/redoc`, and `/openapi.json`. Do not expose
this development server to an untrusted network. Use the same public URL in
the backend's configured `.env` file.

## Production deployment

Build the static site reproducibly from the committed lockfile:

```sh
bun ci
bun run lint
bun test
bun run api:check
bun run build
```

Before publishing, run the manually dispatched `Cross-repository checks`
workflow with the full 40-character frontend and backend candidate commit
hashes.

The workflow verifies generated OpenAPI types and the browser workflow against
that immutable pair without contacting Modal.

Publish the contents of `dist/` at `/srv/biomodals.example.com`. We recommend
[Caddy](https://caddyserver.com/) for the static server, automatic HTTPS, and
the same-origin API proxy. A minimal Caddyfile shape is:

```caddyfile
biomodals.example.com {
	encode zstd gzip
	root * /srv/biomodals.example.com

	route {
		reverse_proxy /api/* 127.0.0.1:4100
		try_files {path} /index.html
		file_server
	}
}
```

The `route` keeps API proxying ahead of the SPA fallback. Browser requests use
relative `/api` URLs, so the build contains no production API hostname.

Caddy configuration remains host-owned; this example does not modify the live
Caddyfile. Review the [production checklist](docs/deployment/production.md)
before publishing a release.

The backend repository contains the corresponding
[API deployment examples](https://github.com/y1zhou/biomodals/tree/main/deploy).

## Commands

```sh
bun dev          # start Vite
bun run lint     # run Oxlint
bun run test     # run Bun unit tests
bun run test:e2e # run the Playwright browser tests
bun run build    # typecheck and build dist/
bun run api:generate # regenerate types from the live local OpenAPI document
bun run api:check    # fail when generated API types are stale
bun run preview  # preview dist/ locally
```

## Current state

The MVP has two available Tools: `GROMACS MD simulation` and `AlphaFold3
structure prediction`. AlphaFold3 accepts a guided protein, DNA, RNA, and
small-molecule entity builder or a native expert JSON document. Both paths
validate on the server and present the same confirmation view before creating
a Job.

The implemented path includes administrator-provisioned accounts, protected
idempotent Submission, durable Job detail, active-only polling, cancellation,
per-stage Job Logs, My Jobs filtering, and direct Result downloads. AlphaFold3
drafts remain in the browser while validated documents are retained briefly by
the backend and never stored in the service database.

Administrators can manage Users, admission and provider-container limits, live
non-secret Modal configuration, unknown remote states, the local Result cache,
and optional Modal billing reports. API types in `src/api/schema.d.ts` come
from the live FastAPI OpenAPI document.

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

Vite's preview server is for local verification, not production hosting.

Whether `/docs` is exposed in production is a deployment-proxy decision
outside this repository.
`BIOMODALS_API_PROXY_TARGET` only configures Vite's local development proxy.
