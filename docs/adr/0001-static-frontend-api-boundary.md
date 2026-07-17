# Use a static SPA with a separate API boundary

BioModals will use one Vite, React, and TypeScript browser-routed SPA, while a
separate FastAPI service owns authentication, persistence, and remote compute.
Production calls use same-origin `/api/*` URLs routed outside this repository by
Caddy, which keeps the frontend static-friendly without adding a Node
application server or full-stack React framework.

The Tool Catalog is a typed frontend registry. Every Tool opens on an internal
route in the shared SPA, and real Tool route modules are lazy-loaded as they are
introduced. BioModals will not use external Tool links, independently built
per-Tool applications, or a backend-driven catalog for the initial product.

## Consequences

- The production static server must return `index.html` for browser routes that
  do not match real files.
- FastAPI's OpenAPI document is the API source of truth. TypeScript API types
  will be generated after that schema is stable rather than maintained by hand.
- OpenAPI does not describe SPA navigation routes. Any backend-generated
  frontend link is a stable cross-repository contract tested by both the
  producer and the receiving route.
- TanStack Query owns backend state; ordinary React state owns local interface
  state. A second global state system is not justified by the current scope.
- Caddy and FastAPI configuration remain outside this repository.
