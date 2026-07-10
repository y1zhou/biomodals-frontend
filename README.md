# BioModals frontend

Static React frontend for the BioModals web tools catalog.

## Development

Requires [Bun](https://bun.sh/).

```sh
bun install
bun dev
```

The Vite development server proxies `/api/*` to `http://127.0.0.1:8000`. Production builds use same-origin `/api` URLs and expect the deployment proxy to route them to FastAPI.

## Commands

```sh
bun dev          # start Vite
bun run lint     # run Oxlint
bun test         # run Bun tests
bun run build    # typecheck and build dist/
bun run preview  # preview dist/ locally
```

## Adding a tool

Add its metadata to `src/tools.ts`, then replace the matching placeholder route in `src/App.tsx` with the tool interface. The sample catalog entries are deliberately labeled as examples in the UI.

TanStack Query is provided at the application root in `src/main.tsx`. A polling query can stop itself when the backend reports a terminal job status:

```tsx
useQuery({
  queryKey: ["jobs", jobId],
  queryFn: ({ signal }) => fetch(`/api/jobs/${jobId}`, { signal }).then((response) => response.json()),
  refetchInterval: (query) =>
    ["succeeded", "failed", "cancelled"].includes(query.state.data?.status)
      ? false
      : 2_000,
})
```

The production build is a browser-routed SPA. Its static server must fall back to `index.html` for paths that do not match real files.
