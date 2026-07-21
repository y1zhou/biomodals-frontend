# Repository instructions

## Scope and architecture

- This repository owns only the static BioModals frontend. FastAPI and Caddy
  configuration live elsewhere unless the scope is explicitly changed.
- Production API requests use same-origin `/api/*` URLs. The external static
  server must fall back to `index.html` for browser routes.
- Keep one Vite/React SPA. Every available Tool is an internal route, and real
  Tool route modules should be lazy-loaded as they are introduced. An explicit
  WIP Tool Catalog Placeholder is non-interactive and has no route until its
  workflow exists.
- Keep Tool metadata in the typed frontend Tool Catalog rather than duplicating
  it in card markup or fetching a catalog from the backend.
- Read `CONTEXT.md` before naming domain concepts. Read relevant files in
  `docs/adr/` before changing architecture or backend contracts.

## Frontend conventions

- Use Bun and `bunx`; do not introduce an npm, pnpm, or Yarn lockfile.
  `package.json` and `bun.lock` are the dependency source of truth.
- The selected stack is Vite, React, TypeScript, Tailwind CSS, shadcn/ui's Nova
  preset with Base UI primitives, Lucide icons, Geist Variable, React Router,
  and TanStack Query.
- TanStack Query owns server state. Keep local interface state in React unless
  a concrete need justifies another state library. The shared QueryClient
  currently retries queries once; do not add automatic Submission mutation
  retries until the backend's idempotency contract is implemented.
- Do not add TanStack Start, Next.js, an application Node server, a monorepo
  orchestrator, Redux, or Zustand without an explicit architecture change.
- Use shadcn components selectively and preserve the `base-nova` style in
  `components.json`. Prefer native browser controls where they are sufficient,
  including a file input for uploads.
- Use real links for available Tool cards so keyboard navigation,
  open-in-new-tab, and browser history work normally. WIP Tool Catalog
  Placeholders must be visibly muted, labelled WIP, and excluded from available
  Tool navigation and filters.
- Do not add a TypeScript `baseUrl`. TypeScript 6 rejects the deprecated option;
  the project aliases work through `paths` alone.
- Keep generated shadcn variant exports allowed by the Oxlint Fast Refresh
  rule. Do not rewrite generated component patterns solely to satisfy that
  rule.
- Keep the current small shell together until the first real Tool arrives;
  then move real Tool screens into lazy route modules rather than growing
  `src/App.tsx` indefinitely.
- Treat FastAPI's OpenAPI document as the API source of truth and generate
  TypeScript API types after that schema is stable. Do not invent permanent API
  fields in the frontend while it remains unsettled.

## Current library documentation

Use Context7 whenever work depends on a library, framework, SDK, API, CLI, or
cloud service. Resolve the library ID first, then query that ID with the full
question. Prefer those current primary docs over memory or general web search.

## Verification

Run the checks relevant to the changed files. The full frontend verification
set is:

```sh
bun run lint
bun test
bun run build
```

If `.pre-commit-config.yaml` or `prek.toml` is added, run
`prek run --files <changed files>` before committing.

## Git and publishing

- Commit titles use `subsystem: description`, preferably under 50 characters.
  Wrap commit body text at 72 characters and put breaking changes in a
  `BREAKING CHANGE: ` footer.
- The configured remote is `git@github.com:y1zhou/biomodals-frontend.git`.
  The user pushes manually. Do not inspect local SSH directories or push unless
  the user explicitly asks.
- Preserve unrelated user changes and never discard worktree changes to make a
  task easier.

## Agent skills

### Issue tracker

Issues and PRDs live in this repository's GitHub Issues; external pull requests
are not a triage request surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage labels without aliases. See
`docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository with a root glossary and system ADRs. See
`docs/agents/domain.md`.
