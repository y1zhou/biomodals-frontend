---
status: accepted
---

# Build the MVP frontend against the live API

BioModals will build its first end-to-end remote Tool against the live FastAPI
OpenAPI document. That document is the API source of truth, while the glossary
and owning ADRs record the product and architecture decisions that shape it.
Conflicts are reconciled in those documents rather than left as temporary,
silent deviations.

## Tool and route structure

The typed frontend Tool Catalog remains public and keeps its search interface,
even though the MVP launches with one real Tool. The three placeholder Tools
and all `Starter`, `Example`, and `Example route` labels are removed.

The first Tool has this catalog identity:

- Display name: `GROMACS MD simulation`
- Slug and API workload: `gromacs`
- Tags: `PDB`, `Molecular dynamics`, `Remote compute`, and
  `Protein structure`

The public Tool overview explains its PDB Input, simulation options,
downloadable Result, and durable remote execution before presenting the
primary action. Its signed-out action is `Sign in to start`; its signed-in
action is `Start a simulation`.

Routes have stable, separate purposes:

- `/` is the public Tool Catalog.
- `/tools/gromacs` is the public Tool overview.
- `/tools/gromacs/new` is the protected Submission form.
- `/tools/gromacs/jobs/:jobId` is the protected Job detail.
- `/jobs` is the protected cross-Tool Job History.
- `/login` and `/set-password` own authentication entry points.

A persistent header exposes Tools, My Jobs, and User controls. Signed-out
visitors see Sign in instead of My Jobs and the User menu. Tool and Job
navigation uses real links.

User-facing copy follows sentence case. BioModals, GROMACS, Modal, PDB,
PDBFixer, API, other acronyms, and explicit page names such as My Jobs keep
their meaningful capitalization; generic nouns do not gain domain-specific
capitalization in ordinary prose.

## Accounts and sessions

MVP Users are provisioned by an administrator. There is no self-service signup,
profile editor, or authenticated password-change interface. The original User
menu showed the current display name and email and offered only Sign out;
Administrator navigation and controls are added by ADR 0006. Login and expired
Password Link failures direct the User to an administrator when appropriate.

A one-time Password Link opens `/set-password#token=...`. Keeping the token in
the fragment prevents the static server and reverse proxy from receiving the
credential. The page reads the token into component memory and immediately
removes it from the visible URL; it is never persisted in web storage.
Refreshing the page therefore requires reopening the original link. Password
Setup requires New password and Confirm password fields, a visibility control,
and local validation of matching values and the OpenAPI `15` to `128` character
constraint. The backend owns all other Password Policy and does not publish a
denylist for the frontend to duplicate. A policy rejection returns
`password_policy_rejected` with safe text shown beside the password field; an
unusable Password Link returns `password_link_invalid` and directs the User to
an administrator.

`BIOMODALS_FRONTEND_URL` remains the frontend origin; the backend appends the
stable Password Setup route and fragment. That SPA navigation URL is a
cross-repository contract rather than an OpenAPI operation. It is verified at
both ends without adding another deployment setting or a custom OpenAPI
extension.

Successful login and Password Setup both establish an HTTP-only session cookie
and the readable `biomodals-csrf` cookie. They return the authenticated User;
Password Setup revokes the User's prior sessions and signs the User in with a
fresh session without another login. Token consumption, password replacement,
prior-session revocation, and replacement-session creation commit in one
database transaction. Cookie delivery follows that commit; if the response is
lost, the User can recover through ordinary login with the new password. The
live OpenAPI responses document the session and CSRF cookies established by
both login and Password Setup.

Recoverable API failures whose remedies differ use the flat response envelope
`{"code": "...", "detail": "..."}`. `code` is a stable machine-readable
identifier and `detail` is safe display text. The frontend selects recovery
behavior from the code rather than the HTTP status or display text. The
envelope does not add speculative `field`, `retryable`, or nested `error`
properties; the operation and code already identify the remedy.

Ordinary FastAPI schema validation retains its native validation-error
document. Every error response the frontend handles is part of the OpenAPI
document and therefore the generated TypeScript contract. Each operation's
response schema restricts `code` to the literal values that operation may
return rather than exposing one service-wide error-code enum.

HTTP `422` is reserved for FastAPI's structural request validation. A
structurally valid request whose content fails semantic validation returns a
coded `400` response instead. Invalid PDB content therefore returns
`pdb_invalid` with safe text shown beside the PDB field.

Every authenticated mutation reads the current `biomodals-csrf` value from
`document.cookie` immediately before the request and sends it as the required
`X-CSRF-Token` header. The frontend does not cache this value in React state or
persistent storage. A missing value requires reauthentication rather than a
mutation without CSRF protection.

A server-rejected CSRF value returns `403 csrf_invalid`. The frontend discards
cached authentication state and requires reauthentication so the browser
receives a fresh session/CSRF pair; it does not retry the mutation
automatically. A non-User reauthentication marker keeps the protected route
mounted while the cached User is absent, preserving in-memory form state until
the User signs in again or cancels. A rejected browser origin returns `403
origin_not_allowed` and uses a generic service-configuration failure because
reauthentication cannot repair it. Both codes are declared on affected
operations in OpenAPI. A `401` uniformly means that no usable Session exists,
so its status and operation already identify the reauthentication remedy
without another code.

Unauthenticated visitors may browse the Catalog and Tool overview, but must
authenticate before opening the Submission form or choosing a file. Login
preserves only a validated internal return URL and otherwise returns to `/`.
If a session expires after a PDB has been chosen, an in-place blocking login
dialog preserves the form and File object. Reauthentication never automatically
resumes a mutation; the User explicitly submits again.

Successful Sign out returns to the public Catalog and clears all cached User
and Job data. Public Tool metadata remains because it is frontend-owned.

## GROMACS Submission and Upload

The protected Submission is one responsive screen rather than a wizard. A
compact summary sits beside the form on wider screens. It contains:

- One native `.pdb` file input.
- An optional display name, prefilled from the filename without its `.pdb`
  suffix and still editable or clearable.
- An integer simulation time from `1` to `200` nanoseconds, defaulting to `5`.
- A PDBFixer option, disabled by default.
- A CPU-only option, disabled by default and placed under Advanced.

Simulation times above `100` nanoseconds show a non-blocking long-runtime
notice without inventing an ETA, queue position, or compute cost.

The web interface and API accept exactly one `.pdb` Input up to `10 MiB`. The
frontend validates the extension and size before Upload, while the API enforces
the same size at the trust boundary. The MVP does not direct Users to the API
for larger files because the service currently buffers the complete Input in
memory before submitting it to remote compute.

Raising the limit is deferred until real Inputs require it and the API has a
staged or streaming transfer path with an explicit resource budget.

Upload uses a cancellable multipart `XMLHttpRequest` so the interface can show
determinate transfer progress. While a Submission is pending, internal SPA
navigation is blocked by a confirmation and a document-level exit invokes the
browser's unload warning. If the User confirms navigation or selects `Cancel
upload`, the frontend aborts its local transfer wait and returns control to the
User, but it does not claim that the server stopped: a Job may already have
been created. The inline result links to My Jobs, and the Submission intent
retains its idempotency key in tab-scoped session storage until a definitive
Job or idempotency conflict is returned. Upload progress and cancellation are
separate from the Job lifecycle and Job Cancellation.

The Submission response contract is:

| Status | Code | Meaning and frontend behavior |
| --- | --- | --- |
| `400` | `pdb_invalid` | Show safe text beside the PDB field. |
| `403` | `csrf_invalid` | Reauthenticate without automatically resubmitting. |
| `403` | `origin_not_allowed` | Show a service-configuration failure. |
| `409` | `idempotency_conflict` | Rotate the key and require explicit Submit. |
| `409` | `active_job_limit_reached` | Keep the intent and ask the User to retry later. |
| `413` | `payload_too_large` | Show the 10 MiB boundary beside the PDB field. |
| `503` | `compute_unavailable` | Preserve the key and offer an explicit retry. |
| `422` | _native FastAPI validation_ | Map recognized locations to fields. |
| `401` | _no code_ | Reauthenticate without automatically resubmitting. |

Unrecognized native validation errors use a focused form-level alert.
Correctable errors are not shown only as transient toasts. A proxy or transport
failure may lack the JSON envelope; the frontend falls back safely and never
infers a specific remedy by parsing arbitrary display text.

## Submission idempotency

The frontend creates one random UUID for each Submission intent. It never
derives that UUID from form values or file bytes. The backend scopes a key by
submitter and workload and fingerprints the PDB bytes, normalized display name,
simulation time, PDBFixer setting, and CPU-only setting.

The frontend retains the UUID until the intent changes or the API returns a
definitive Job. Every retry of the same intent reuses it, including explicit
retries after `503`, ambiguous network failures, reauthentication, or an
aborted Upload whose server outcome is unknown. Automatic mutation retries are
disabled.

The backend applies these semantics:

- The same key and fingerprint returns the existing Job.
- The same key with changed Input or settings returns `409` with
  `idempotency_conflict`.
- A failed compute spawn returns `503`; retrying with the same key preserves
  the Job and stable run name.

`503 compute_unavailable` leaves the form intact and offers `Try again` with
the same key. `409 idempotency_conflict` is treated as a defensive
state-tracking failure: the frontend explains that the Submission changed,
rotates the key, and requires another explicit Submit. In contrast,
`409 active_job_limit_reached` retains the current intent and key. Submission
errors remain inline beside the Submit action.

After a `202` response, the frontend immediately navigates to
`/tools/gromacs/jobs/:jobId`; the durable Job page owns all subsequent state.

## Active Job Limit (superseded by ADR 0006)

The original MVP enforced a configurable per-User, per-workload Active Job
Limit. ADR 0006 replaces that overloaded policy with separate User, Tool, and
Global Active Job Limits. A Submission beyond any limit is rejected before a
Job is created with `409 active_job_limit_reached`. This is distinct from an
execution Capacity Limit, where an accepted Job waits for capacity.

A durable admission queue is deferred because the API does not yet retain Input
for later dispatch. Until that storage and recovery path exists, the frontend
explains the Active Job Limit and asks the User to retry after an existing Job
becomes terminal.

## Job states and actions

The MVP adopts the live API's eight Job states and maps them to user-facing
labels and actions as follows:

| API state | User-facing label | Class | Primary action |
| --- | --- | --- | --- |
| `queued` | Queued | Active | Cancel |
| `running` | Running | Active | Cancel |
| `finalizing` | Preparing result | Active | None |
| `cancel_requested` | Cancellation requested | Active | None |
| `succeeded` | Completed | Terminal | Download result |
| `partial` | Completed with warnings | Terminal | Download result |
| `failed` | Failed | Terminal | Start a new simulation |
| `cancelled` | Cancelled | Terminal | Start a new simulation |

`partial` always means that a useful, downloadable Result exists. API warnings
are shown whenever present, regardless of state, but never change the
authoritative state.

Only failed Jobs contain typed `error_code` and display-safe `error_message`
fields; `JobView.detail` is removed. The frontend chooses the next action from
the code, displays the safe message, and falls back to generic failure copy for
an unknown code. It also shows a copyable Job identifier for support and links
to a blank Submission form. Failed and cancelled Jobs do not offer Retry or
reconstruct earlier settings because the API does not retain those values in
`JobView`. The backend never sends a UI action field.

The typed codes are `compute_failed`, `result_invalid`, and
`result_unavailable`. Each currently offers Start a new simulation and the Job
identifier for support. `result_expired` is not used because `expired` is a
separate planned Job Status tied to Result retention.

Cancellation is offered only for `queued` and `running`. It requires a
confirmation explaining that Cancellation is best effort and the Job may still
complete. After confirmation, the action is immediately disabled and the API's
returned state is displayed. `finalizing`, `cancel_requested`, and terminal
Jobs do not expose the action. A repeated request for `cancel_requested` is
idempotent. If a stale active snapshot races with `finalizing` or a terminal
state, the API returns `409 job_not_cancellable`; the frontend closes the
dialog and immediately refetches instead of offering a retry. The coded
response is declared in OpenAPI.

The Job page presents one prominent current-status panel containing the label,
plain-language explanation, last update time, warnings, and available action.
It also presents the fixed GROMACS stage sequence and highlights the current
stage and running Function reported by `JobView.stage`. The stage table shows
the start and completion timestamps retained in `JobView.stage_history`, but
does not invent missing timestamps, durations, completed Functions, or numeric
Progress. An unchanged `updated_at` is not treated as stale because the API
does not provide a heartbeat contract.

Missing and unauthorized Jobs share the same `Job unavailable` screen so a Job
identifier cannot reveal ownership. A structurally invalid Job identifier
returns API `422` but uses that same screen in the SPA. The screen links to My
Jobs and the GROMACS Tool. A `401` remains a distinct authentication case.

## Polling and Job History

An active Job detail is polled every `10` seconds while its page is visible and
every `60` seconds while it is in the background. A Refresh button requests an
immediate update. Polling stops for every terminal state.

If polling fails, the page retains the last known Job state and last successful
update time, shows that refresh failed, keeps Refresh available, and continues
the normal cadence. A transport failure never changes the Job to `failed`.

My Jobs is a responsive semantic table initially sorted newest-first by
`created_at`. Every displayed column is independently sortable and filterable:
Job name or identifier uses text matching, Tool and status use catalog-backed
choices, and created and updated times use local calendar dates. It shows the
display name, catalog-derived Tool name, state, creation time, and last update;
the Job name is a real link to its Tool-scoped detail route. Narrow layouts
preserve every column through horizontal scrolling and retain table semantics.

The collection endpoint is loaded initially, after manual Refresh, and once
when the page regains focus. Between collection loads, only individual active
Jobs are polled through their detail endpoints at the `10`/`60` second cadence.
Terminal rows and the full collection are never periodically polled. When an
individual Job becomes terminal, its polling stops.

`updated_at` is display metadata rather than a strict Job version. When a
collection snapshot and its detail snapshot have equal timestamps, the detail
snapshot wins so a terminal observation cannot be hidden while its polling
stops. A persistent Job revision is deferred until the system has more writers
or update transports that require total ordering.

TanStack Query owns Job and User server state. Polling requests use their abort
signals so navigation can stop unnecessary HTTP work; aborting a read never
means Job Cancellation.

## Contract verification

The backend asserts the exact `/set-password#token=...` link and tests the
complete Password Link flow through authenticated `/api/v1/auth/me`. The
frontend proves that route accepts and immediately scrubs the fragment. It also
tests coded recovery behavior, semantic validation errors, and Job snapshot
merging. Backend frontend-handled responses are documented in OpenAPI, and a
live `api:check` compares that document with the generated TypeScript contract.

A browser E2E harness spanning both repositories is deferred until another Tool
or authentication flow makes its orchestration cost worthwhile.

## Deployment coordination

The backend and frontend contract changes ship in one brief maintenance window
rather than carrying temporary compatibility behavior for the currently broken
Password Link flow. Administrators pause setup and reset link issuance, the
backend deploys first with freshly initialized SQLite state and an empty local
Result cache, and the matching frontend follows immediately. Administrators
then provision fresh test Users. The live OpenAPI check and a complete Password
Link smoke test must pass before normal provisioning begins. All earlier Users,
Jobs, Sessions, Password Links, and cached Results are intentionally discarded
by the reset. Authoritative Modal Volumes are untouched.

The frontend does not add a legacy `/reset-password` route, dual query/fragment
token parsing, or a transitional no-session success path solely for this
release.

This work still precedes the first release, so no data migration or runtime
aliases are added for the retired `invalid_result` and `result_expired` Job
Error codes. This reset allowance ends with the first release; later
persistent-data changes require an explicit migration and rollback plan.

## Result downloads

`succeeded` and `partial` Jobs use a real, authenticated, same-origin link to
`/api/v1/jobs/:jobId/download`. The browser handles the server-provided
`Content-Disposition` filename and streams the `application/zip` Result,
including the API's `206` byte-range support. The frontend neither buffers the
archive into a JavaScript Blob nor depends on the optional `download_url` field.

## Visual and interaction direction

The MVP preserves the restrained, monochrome Nova/Geist design. Job states may
use semantic color, but color is always paired with text and icons. Operational
screens are compact and practical rather than decorative scientific dashboards.
The MVP is light-theme only; existing dark tokens remain unused without a theme
control.

All error messages are associated with their fields or focused alerts, status
changes are announced accessibly, and controls expose visible keyboard focus.
The interface does not manufacture server facts that OpenAPI does not supply.

## Consequences and deferred work

The frontend can ship a complete path from account setup through GROMACS
Submission, durable recovery, Cancellation, and Result download without first
expanding the backend to the longer-term model.

The MVP deliberately omits self-service signup, password changes, numeric Job
Progress, Retry from retained Input, Job Deletion, expiry handling, configuration
recall, Job History pagination, and dark-mode controls because the live API does
not support them or the first vertical slice does not need them.

The glossary and ADR-0002 through ADR-0004 now align with these MVP decisions.
`expired` remains explicitly planned for Result-retention handling. Deferred
features remain recorded as future work rather than competing current
contracts.
