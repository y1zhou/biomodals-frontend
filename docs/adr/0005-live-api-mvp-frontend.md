---
status: accepted
---

# Build the MVP frontend against the live API

> The execution-ownership, Job-shape, unknown-state, stage-table, and
> provider-log sections below record the original GROMACS MVP. Backend ADR 0007,
> the backend API Tool service spec, and the generated OpenAPI document supersede
> those details. The Tool catalog, account, routing, and visual interaction
> decisions remain current unless updated explicitly below.

BioModals will build its first end-to-end remote Tool against the live FastAPI
OpenAPI document. That document is the API source of truth, while the glossary
and owning ADRs record the product and architecture decisions that shape it.
Conflicts are reconciled in those documents rather than left as temporary,
silent deviations. A contract-affecting backend or frontend change is not
complete until the owning ADR or specification, the live OpenAPI output and
its backend contract tests, and the generated TypeScript contract agree.

## Tool and route structure

The typed frontend Tool Catalog remains public and keeps its search interface.
The three generic placeholder Tools and all `Starter`, `Example`, and `Example
route` labels are removed.

The first Tool has this catalog identity:

- Display name: `GROMACS MD simulation`
- Slug and API workload: `gromacs`
- Tags: `PDB`, `Molecular dynamics`, and `Protein structure`

The Catalog also presents the available `AlphaFold3 structure prediction` Tool
with `Protein structure` and `Structure prediction` tags. It supports a guided
protein, DNA, RNA, and simple ligand builder and native expert JSON through one
retained server-validation and confirmation flow.

The AlphaFold3 builder rejects invalid entity-copy counts instead of silently
changing them and accepts values from `1` through `5120`. Seed expressions are
validated for syntax, integer bounds, and the 1,000-seed UI ceiling before any
range is expanded, so an enormous range cannot allocate browser memory first.
Turning off MSA search also turns off and disables Protein template search
because that search requires an MSA.

Draft restoration never overwrites edits made after the page mounted. Expert
JSON file reads follow latest-selection-wins semantics: completion of an older
asynchronous read cannot replace a newer file or a cleared input.

The public Tool overview explains its PDB Input, simulation options,
downloadable Result, and durable remote execution before presenting the
primary action. Its signed-out action is `Sign in to start`; its signed-in
action is `Start a simulation`.

Its descriptive cards use `Configure the simulation` and `Run in the
background`; the background-execution description contains a real My Jobs link
so a User can immediately understand where to return.

Routes have stable, separate purposes:

- `/` is the public Tool Catalog.
- `/tools/gromacs` is the public Tool overview.
- `/tools/gromacs/new` is the protected Submission form.
- `/tools/gromacs/jobs/:jobId` is the protected Job detail.
- `/tools/alphafold3` is the public AlphaFold3 overview.
- `/tools/alphafold3/new` is the protected AlphaFold3 builder and confirmation.
- `/tools/alphafold3/jobs/:jobId` uses the shared protected Job detail.
- `/jobs` is the protected cross-Tool Job History.
- `/login` and `/set-password` own authentication entry points.

A persistent header exposes Tools, My Jobs, and User controls. Signed-out
visitors see Sign in instead of My Jobs and the User menu. Tool and Job
navigation uses real links.

The Tools link has an icon consistent in weight and alignment with the My Jobs
icon. The avatar menu dismisses on outside pointer or focus interaction,
Escape, or a second trigger activation and restores focus to its trigger after
keyboard dismissal. The Tool Catalog removes its redundant Tools heading,
placing Tool count and cards directly after search.

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

Every API response supplies the OpenAPI-documented `X-Request-ID` header. The
client retains it on an `ApiError` and shows it as a support identifier only for
unexpected failures; ordinary validation, authentication, and known coded
recovery messages remain concise. The identifier contains no User or Job
meaning and is not used as application state.

Login and Password Setup may return `503 authentication_busy` with
`Retry-After` when the backend's small bounded password-work queue is full. The
frontend presents this as a temporary service-busy condition without implying
that the email, password, or Password Link is wrong, and lets the User retry.
The MVP does not add client-side lockout or per-User throttling behavior.

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
Shared number fields accept wheel stepping only while the field has focus and
the pointer remains over it. In that case the wheel is reserved for the number
step and does not move the page; otherwise the wheel scrolls the page without
changing the value. This applies to Simulation time and other numeric controls
so a passing pointer never changes a value during ordinary page scrolling.

The web interface and API accept exactly one `.pdb` Input up to `10 MiB`. The
frontend validates the extension and size before Upload, while the API enforces
the same size at the trust boundary. The MVP does not direct Users to the API
for larger files because the service currently buffers the complete Input in
memory before submitting it to remote compute.

The native Choose file button receives a light neutral rounded treatment that
separates it from the selected-name text. Drag entry visibly changes the whole
drop zone to a ready-to-drop state; drag leave restores it, and a valid drop
uses the same selection and validation path as the native control.

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

That UUID always comes from `crypto.randomUUID()`. BioModals supports current
evergreen browsers on HTTPS, plus local development on `localhost`; arbitrary
non-secure hostnames are not supported. The frontend does not introduce a
custom UUID implementation, package dependency, `getRandomValues` fallback, or
`Math.random()` fallback for unsupported contexts.

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

The MVP adopts the live API's Job states and maps them to user-facing
labels and actions as follows:

| API state | User-facing label | Class | Primary action |
| --- | --- | --- | --- |
| `queued` | Queued | Active | Cancel |
| `running` | Running | Active | Cancel |
| `finalizing` | Preparing result | Active | None |
| `blocked` | Result temporarily unavailable | Recoverable | None |
| `cancel_requested` | Cancellation requested | Active | None |
| `state_unknown` | Status unknown | Active, Admin review required | None |
| `succeeded` | Completed | Terminal | Download result |
| `partial` | Completed with warnings | Terminal | Download result |
| `failed` | Failed | Terminal | Start a new job |
| `cancelled` | Cancelled | Terminal | Start a new job |

`partial` always means that a useful, downloadable Result exists. Succeeded and
partial are terminal in the ordinary compute lifecycle, but either may become
blocked under `result_integrity` if its immutable published Result can no longer
be restored exactly. Exact recovery returns the prior completed state. API
warnings are shown whenever present, regardless of state, but never change the
authoritative state.

A queued AlphaFold3 Job may include the owner-safe
`state_reason=waiting_for_shared_publication` and a `state_message` while an
earlier identical API Job may still be active. The status panel and empty-stage
copy show that message instead of the generic waiting-to-start description.
The frontend does not infer whether the earlier Job completed or whether the
new Job can repair its cache.

Only failed Jobs contain typed `error_code` and display-safe `error_message`
fields; `JobView.detail` is removed. The frontend chooses the next action from
the code, displays the safe message, and falls back to generic failure copy for
an unknown code. It also shows a copyable Job identifier for support and links
to a blank Submission form. Failed and cancelled Jobs do not offer Retry or
reconstruct earlier settings because the API does not retain those values in
`JobView`. The backend never sends a UI action field.

The typed Job Error codes are `compute_failed` and `result_invalid`. Each offers
Start a new job and the Job identifier for support. Post-publication
Result loss uses blocked category `result_integrity`, not a terminal
`result_unavailable` Job Error. `result_expired` is not used because `expired`
is a separate planned Job Status tied to Result retention.

Cancellation is offered only for `queued` and `running`. It requires a
confirmation explaining that Cancellation is best effort and the Job may still
complete. After confirmation, the action is immediately disabled and the API's
returned state is displayed. `finalizing`, `cancel_requested`, and terminal
Jobs do not expose the action. A repeated request for `cancel_requested` is
idempotent. If a stale active snapshot races with `finalizing` or a terminal
state, the API returns `409 job_not_cancellable`; the frontend closes the
dialog and immediately refetches instead of offering a retry. The coded
response is declared in OpenAPI.

`JobView.cancel_requested_at` is set when Cancellation is durably accepted.
The backend retries transient cancellation failures after restart, starts no
later stage, and does not declare success from elapsed time alone. Until Modal
confirms the outcome, `cancel_requested` continues consuming Active Job Limits.
After 15 minutes the status panel shows "Cancellation is taking longer than
expected" without changing the status or claiming that remote execution has
stopped. A fully published Result still wins a Cancellation race.

If Submission, an attached provider call, or Cancellation has an inconclusive
outcome, the backend returns `state_unknown`. The fixed reason is
`submission_outcome_unknown`, `provider_outcome_unknown`, or
`cancellation_outcome_unknown`.

The status panel explains that Administrator review is required, shows
`state_unknown_at`, and notes that the Job continues consuming an Active Job
slot. It has no spinner or owner action. The latest known active Stages remain
visible without invented outcomes.

The Job page presents one prominent current-status panel containing the label,
plain-language explanation, last update time, warnings, and available action.
It also presents the fixed semantic stage display order and highlights every
active stage reported by `JobView.active_stages`. The singular `JobView.stage`
is a compatibility summary rather than the source of parallel state. The stage
table shows Stage, Status, Started, and Finished from `JobView.stage_history`;
provider Function names are intentionally omitted from the end-User table. A
started entry has `started_at`, nullable `ended_at`, and a nullable outcome of
`completed`, `failed`, or `cancelled`; active, state-unknown, and blocked stages
have no end or outcome. The table displays the outcome explicitly and does not
invent missing timestamps, durations, or numeric Progress. An unchanged
`updated_at` is not treated as stale because the API does not provide a
heartbeat contract.

The GROMACS rows are Prepare simulation, Analyze NVT, Analyze NPT, Run
production, Analyze production, and Prepare result. The interface
does not split preparation, minimization, NVT, or NPT execution out of the
Prepare simulation row because they occur inside one deployed Function. It
also does not expose nested App implementation calls as API stages.

After Prepare simulation, Analyze NVT, Analyze NPT, and Run production are
active concurrently. Analyze production starts after Run production and may
overlap the two equilibration analyses. Prepare result starts only after all
three analyses complete. These dependencies do not change the table's fixed
display order; several rows may show the running Job Status at once.

Each Job response includes the backend-computed `can_view_logs` capability. An
enabled Administrator always receives access. A Job owner receives access only
when that Tool's live policy permits owner-visible logs; no other User may read
the Job or its logs. The frontend neither infers nor grants this permission.

When `can_view_logs` is true, each started remote row in the Execution stages
table can expand an inline log viewer. Rows are collapsed by default and only
one is expanded at a time. Selecting another row aborts an earlier live stream;
collapsing the row or leaving the page also aborts it. When the capability is
false, the page shows the ordinary stage table without log interactivity or
log-access copy.

The target API exposes safe Stage codes, diagnostic Function names, operation
state, live-or-historical mode, start time, and nullable end time, but no Modal
Function Call ID. The backend resolves the selected Stage to that private ID
and redacts that exact value if provider output contains it. An active target
streams newline-delimited JSON output. Any other started Stage fetches retained
output for its recorded time range without follow mode. Paired `since` and
`until` parameters select a timezone-aware historical window of at most one
hour and are clamped to the Stage lifetime. The browser uses 10-minute windows
so it can request older output only when needed.

TanStack Query caches every successful terminal window indefinitely for the
current browser page. Reopening a row refreshes the small target selector so a
formerly active Stage is not mistaken for a live one, then reuses identical log
pages without contacting Modal. A full page refresh clears that cache.

The viewer refreshes target metadata every ten seconds only for a live target.
It has a bounded-height viewport, opens at the newest terminal window, and
prepends older windows when the viewer scrolls to the top while
preserving the viewport position. Active streams retain a 500,000-character
tail until older history is requested; the viewer then pins that tail and keeps
new stream output while paging backward.

Provider timestamps use compact sans-serif text beside monospace messages.
ANSI SGR colors and decorations are parsed into structured React spans instead
of provider-generated HTML. Parsing remains continuous across line boundaries,
so a style remains active until the provider emits its reset sequence. Copy and
Download keep the raw loaded text, clearly say when older windows are not yet
loaded, and name downloads
`<current-timestamp>_<tool>_<stage>.log`. A failed provider stream displays
short diagnostic guidance; a live viewer also retains text already received.
Empty, interrupted, or completed log output never changes Job Status or supplies
an invented Stage outcome.

Missing and unauthorized Jobs share the same `Job unavailable` screen so a Job
identifier cannot reveal ownership. A structurally invalid Job identifier
returns API `422` but uses that same screen in the SPA. The screen links to My
Jobs and the GROMACS Tool. A `401` remains a distinct authentication case.

## Polling and Job History

An actively progressing or `blocked` Job detail is polled every `60` seconds
while its page is visible and every `5` minutes while it is in the background.
This makes automatic blocked-Result recovery visible without a manual reload. A
Refresh button requests an immediate update. Interval polling stops for every
terminal state and for `state_unknown`; the latter still refetches on focus and
manual Refresh because an Administrator may resolve it.

If polling fails, the page retains the last known Job state and last successful
update time, shows "Unable to refresh job status," keeps Refresh available,
and continues the normal cadence. A transport failure never changes the Job to
`failed`. Elapsed time without a state change never produces a stale warning.

My Jobs is a responsive semantic table initially sorted newest-first by
`created_at`. Every displayed column is independently sortable and filterable:
Job name or identifier uses text matching, Tool and status use catalog-backed
choices, and created and updated times use local calendar dates. It shows the
display name, catalog-derived Tool name, state, creation time, and last update;
the Job name is a real link to its Tool-scoped detail route. Narrow layouts
preserve every column through horizontal scrolling and retain table semantics.
Each column header keeps sorting directly available and opens a compact
field-specific filter control from a filter icon, avoiding a permanently
expanded second header row. Date filters use a rounded in-app calendar so their
panel has the same visual treatment across supported browsers. Selecting the
month-and-year heading reveals a direct year field and all 12 months for fast
jumps across long date ranges. Choosing a month moves focus into that month's
day grid instead of losing it when the month controls close. Exactly one day is
in the grid's Tab sequence; the arrow keys move by one day horizontally or one
week vertically, including across month and year boundaries. Navigation stops
at the supported years `1` and `9999`; spillover cells outside that range are
inert rather than presenting dates the filter cannot represent.

Its primary creation action is the cross-Tool `New job` link to the Tool
Catalog. Empty-state copy says `Start a new job`; neither action assumes that
every future Job is a GROMACS simulation.

Non-default filters and sort order are encoded in `/jobs` search parameters.
This preserves the table view through refresh, bookmarks, and opening a Job
followed by browser Back. Defaults remain absent from the URL; invalid columns,
choices, directions, and malformed dates are ignored and normalized rather
than breaking the route. The frontend does not duplicate this state in local or
session storage, and the parameters continue to drive client-side behavior
rather than implying an undocumented server filter contract.

The MVP collection endpoint returns stable owner-scoped cursor pages, with 50
records by default and at most 100 per response. The frontend follows every
continuation cursor and assembles all Jobs owned by the authenticated User,
newest-first, without a hidden cap. This bounds each SQLite query and HTTP
response while preserving the client-side table contract. Server filtering,
total-count queries, and visible page controls remain deferred until measured
histories justify them.

The collection endpoint is loaded initially, after manual Refresh, and once
when the page regains focus. Between collection loads, only individual
progressing or blocked Jobs are polled through their detail endpoints at the
60-second/5-minute cadence. Terminal and state-unknown rows and the full
collection are never periodically polled. When an individual Job becomes
terminal or state-unknown, its interval polling stops.

`updated_at` is display metadata rather than a strict Job version. When a
collection snapshot and its detail snapshot have equal timestamps and exactly
one is terminal, the terminal snapshot wins so a stale active response cannot
hide completion after polling stops. Otherwise the detail snapshot wins. A
persistent Job revision is deferred until the system has more writers or update
transports that require total ordering.

TanStack Query owns Job and User server state. Polling requests use their abort
signals so navigation can stop unnecessary HTTP work; aborting a read never
means Job Cancellation.

## Contract verification

The backend asserts the exact `/set-password#token=...` link and tests the
complete Password Link flow through authenticated `/api/v1/auth/me`. The
frontend proves that route accepts and immediately scrubs the fragment. It also
tests coded recovery behavior, semantic validation errors, and Job snapshot
merging.

OpenAPI declares the runtime session-cookie security scheme on every protected
operation as well as required CSRF headers, request and response bodies, Job
states and conditional fields, per-operation frontend-handled error codes,
relevant response headers, and binary and byte-range Result downloads. It also
contains `active_stages`, the `blocked` and `state_unknown` Job fields, and the
Admin Modal preflight, unknown-state resolution, Storage, and authorized Job log
contracts. Backend contract tests assert these details rather than checking
only that paths exist.

A live `api:check` compares the OpenAPI document with the generated TypeScript
contract. The generated file is never edited manually. Backend changes check
and update their OpenAPI output and contract tests; frontend changes check the
live schema before relying on new behavior. A coordinated change cannot merge
or release until `api:check` passes against the intended backend revision.

Only compile-time schema and operation types are generated. The runtime client
remains a small handwritten `fetch`/`XMLHttpRequest` boundary because it owns
same-origin cookies, CSRF, request-ID extraction, coded recovery, and upload
progress that a generator would not remove. Endpoint functions use generated
operation types where practical. A generated runtime-client dependency is
reconsidered after additional Tools make this wrapper materially larger.

A focused Playwright suite is an MVP release gate. It serves the built frontend
against a real local FastAPI HTTP server with temporary SQLite state and the
existing GROMACS adapter seam replaced by a deterministic fake. It never
contacts Modal and adds no test-only production API route. The suite covers
Password Setup and login, one successful Submission through stage advancement
and Result download, a separate Cancellation path, and sign-out. It explicitly
proves that one submission action, including a double click or duplicate
browser event, creates one Job and one initial adapter call. Unit and API tests
retain responsibility for wider permutations; exhaustive browser and visual
testing remains deferred.

The automated merge boundary stays small. The backend uses its committed lock
file, existing `prek` checks, and full pytest suite. The frontend uses its
committed lock file, lint, unit tests, and production build. Cross-repository
verification is manually dispatched with full 40-character candidate frontend
and backend commit hashes; branches, tags, and abbreviated hashes are rejected.
It adds the live `api:check` and focused Playwright suite and records the exact
pair in the workflow summary. The MVP does not add a version matrix, coverage
threshold, new mandatory backend type checker, or any Modal access from CI.

## Deployment coordination

Before deployment, the assisting agent asks the User for the last-deployed
backend and frontend Git commit hashes. The backend hash also anchors the
GROMACS App source in that repository. The agent verifies and compares those
two baselines with the candidates, then gives the Administrator an ordered,
change-aware procedure with prerequisites, configuration and preflight checks,
deployment order, expected observations, stop conditions, targeted smoke
checks, and rollback steps. Unchanged surfaces do not accumulate ritual checks
without a stated reason. When there is no prior deployment, the whole candidate
is the Change Set. The MVP adds no deployment-manifest subsystem.

If the Change Set affects the GROMACS App, backend Modal adapter, or effective
Modal configuration, that procedure includes one paid real-Modal smoke test.
The Administrator explicitly confirms the cost and manually submits the
smallest valid Job; the agent does not run it. The Administrator verifies one
invocation of every expected deployed Function, correct stage reporting,
successful finalization, and the Result archive allowlist. Any unexpected call,
stage, archive member, or configuration/permission failure stops the procedure
instead of prompting a blind paid retry.

The backend and frontend contract changes ship together to the isolated
pre-release environment rather than carrying temporary compatibility behavior
for the currently broken Password Link flow. That environment explicitly
selects its own configuration file, freshly initialized SQLite database,
Result cache, and `https://beta.biomodals.example.com` public origin; production
configuration and host-local data are untouched. The backend deploys first and
the matching frontend follows immediately. Administrators then provision fresh
test Users. The live OpenAPI check and a complete Password Link smoke test must
pass before normal pre-release testing begins. Authoritative Modal Volumes are
untouched, and Modal Environment selection remains separately explicit.

The frontend does not add a legacy `/reset-password` route, dual query/fragment
token parsing, or a transitional no-session success path solely for this
release.

This work still precedes the first release, so no data migration or runtime
aliases are added for the retired `invalid_result` and `result_expired` Job
Error codes. This reset allowance ends with the first release; later
persistent-data changes require an explicit migration and rollback plan.

## Result downloads

`succeeded` and `partial` Jobs first call the idempotent, CSRF-protected
`POST /api/v1/jobs/:jobId/prepare-download`. The action shows
`Preparing download...`, disables duplicate clicks, and remains in the SPA for
coded recovery; a possible integrity transition triggers a Job refetch. A
successful `204` immediately starts the real authenticated same-origin link to
`/api/v1/jobs/:jobId/download`. The browser handles the server-provided
`Content-Disposition` filename and streams the Tool-specific `application/zip`
or `application/zstd` Result, including the API's `206` byte-range support. The
frontend neither buffers the archive into a JavaScript Blob nor depends on the
optional `download_url` field. Aborting one page request does not cancel shared
backend cache preparation.

The server-provided filename contains no Job UUID, Modal run name, or storage
path; the browser handles duplicate-download suffixes.

## Visual and interaction direction

The MVP preserves the restrained, monochrome Nova/Geist design. Job states may
use semantic color, but color is always paired with text and icons. Operational
screens are compact and practical rather than decorative scientific dashboards.
The MVP is light-theme only; existing dark tokens remain unused without a theme
control.

All core workflows remain functional at 360 CSS pixels wide. Navigation and
actions do not clip; authentication, Password Setup, Submission, Job detail,
Cancellation, and Result download remain usable. Wide semantic tables preserve
their columns through horizontal scrolling instead of hiding facts or adding a
second card representation. File upload retains a touch-friendly native Choose
file path in addition to drag-and-drop. There is no separate mobile feature set.

Ordinary link navigation starts at the top of its destination. Browser Back
and Forward restore the previous vertical scroll position; URL-backed My Jobs
state restores the exact filters and sort independently. The MVP does not add
custom persistence for a table's horizontal scroll offset. Dialogs return
keyboard focus to the control that opened them.

The router root provides an error boundary for unexpected render, lazy-route,
and chunk-loading failures. Instead of a blank application, it shows
`BioModals could not load this page` with Reload and Return home actions. Known
authentication, validation, API, Job, and form failures retain their existing
page-level recovery. The boundary reveals no stack, raw response, provider
detail, or secret; it logs technical detail to the development console without
adding external telemetry or an automatic reload loop.

All error messages are associated with their fields or focused alerts, status
changes are announced accessibly, and controls expose visible keyboard focus.
The interface does not manufacture server facts that OpenAPI does not supply.

## Consequences and deferred work

The frontend can ship a complete path from account setup through GROMACS
Submission, durable recovery, Cancellation, and Result download without first
expanding the backend to the longer-term model.

The MVP deliberately omits self-service signup, password changes, numeric Job
Progress, Retry from retained Input, Job Deletion, expiry handling,
configuration recall, server-side Job History filtering and visible pagination
controls, and dark-mode controls because the live API does not support them or
the first vertical slice does not need them.

The glossary and ADR-0002 through ADR-0004 now align with these MVP decisions.
`expired` remains explicitly planned for Result-retention handling. Deferred
features remain recorded as future work rather than competing current
contracts.
