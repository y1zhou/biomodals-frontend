---
status: accepted
---

# Build the MVP frontend against the live API

BioModals will build its first end-to-end remote Tool against the live FastAPI
OpenAPI document. For the MVP, that document is authoritative wherever it
conflicts with the current glossary or earlier ADRs because a working vertical
slice is more valuable than reconciling the intended long-term model first.
The conflicting domain and architecture decisions must be revisited after the
MVP rather than silently treated as permanent.

This ADR temporarily takes precedence over the Job Status, polling, transfer,
and failure details in ADR-0002 and the account-provisioning details in
ADR-0004. It does not change ADR-0001's static SPA and API boundary or the data
ownership and retention decisions in ADR-0003.

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

## Accounts and sessions

MVP Users are provisioned by an administrator. There is no self-service signup,
profile editor, or authenticated password-change interface. The User menu shows
the current display name and email and offers only Sign out. Login and expired
password-link failures direct the User to an administrator when appropriate.

A one-time password link opens `/set-password?token=...`. The page reads the
token into component memory and immediately removes it from the visible URL;
it is never persisted in web storage. Refreshing the page therefore requires
reopening the original link. Password setup requires New password and Confirm
password fields, a visibility control, and local validation of the OpenAPI
`15` to `128` character constraint.

Successful login and password setup both establish an HTTP-only session cookie
and the readable `biomodals-csrf` cookie. They return the authenticated User;
password setup signs the User in without another login. The password-setup
OpenAPI response must document the same cookie behavior already documented by
the login response.

Every authenticated mutation reads the current `biomodals-csrf` value from
`document.cookie` immediately before the request and sends it as the required
`X-CSRF-Token` header. The frontend does not cache this value in React state or
persistent storage. A missing value requires reauthentication rather than a
mutation without CSRF protection.

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

The web interface accepts exactly one `.pdb` file up to `100 MiB` and validates
the extension and size before Upload. This is intentionally a frontend product
limit, not an API limit: power Users may submit larger Inputs directly to the
API. The oversized-file message explains that distinction and links to
`/docs`.

Upload uses a cancellable multipart `XMLHttpRequest` so the interface can show
determinate transfer progress. `Cancel upload` aborts the transfer and returns
to the editable form. Upload progress and cancellation are separate from the
Job lifecycle and Job Cancellation.

Known `422` errors appear beside their corresponding form fields. Unknown
validation errors use a focused form-level alert. Correctable errors are not
shown only as transient toasts.

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
- The same key with changed Input or settings returns `409`.
- A failed compute spawn returns `503`; retrying with the same key preserves
  the Job and stable run name.

A `503` leaves the form intact and offers `Try again` with the same key. A
`409` is treated as defensive state-tracking failure: the frontend explains
that the Submission changed, rotates the key, and requires another explicit
Submit. Submission errors remain inline beside the Submit action.

After a `202` response, the frontend immediately navigates to
`/tools/gromacs/jobs/:jobId`; the durable Job page owns all subsequent state.

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
authoritative state. `JobView.detail` is opaque under the current contract and
must not be rendered verbatim.

Failed Jobs use generic copy, show a copyable Job identifier for support, and
link to a blank Submission form. Failed and cancelled Jobs do not offer Retry
or reconstruct earlier settings because the API does not retain those values
in `JobView`.

Cancellation is offered only for `queued` and `running`. It requires a
confirmation explaining that Cancellation is best effort and the Job may still
complete. After confirmation, the action is immediately disabled and the API's
returned state is displayed. `finalizing`, `cancel_requested`, and terminal
Jobs do not expose the action.

The Job page presents one prominent current-status panel containing the label,
plain-language explanation, last update time, warnings, and available action.
It does not fabricate a lifecycle timeline or numeric Progress from the current
state alone. An unchanged `updated_at` is not treated as stale because the API
does not provide a heartbeat contract.

Missing and unauthorized Jobs share the same `Job unavailable` screen so a Job
identifier cannot reveal ownership. That screen links to My Jobs and the
GROMACS Tool. A `401` remains a distinct authentication case.

## Polling and Job History

An active Job detail is polled every `10` seconds while its page is visible and
every `60` seconds while it is in the background. A Refresh button requests an
immediate update. Polling stops for every terminal state.

If polling fails, the page retains the last known Job state and last successful
update time, shows that refresh failed, keeps Refresh available, and continues
the normal cadence. A transport failure never changes the Job to `failed`.

My Jobs is a responsive semantic table sorted newest-first by `created_at`.
It is initially unpaginated and has no search or status filters. It shows the
display name, catalog-derived Tool name, state, creation time, and last update;
the Job name is a real link to its Tool-scoped detail route. Narrow layouts
reduce nonessential columns while preserving table semantics.

The collection endpoint is loaded initially, after manual Refresh, and once
when the page regains focus. Between collection loads, only individual active
Jobs are polled through their detail endpoints at the `10`/`60` second cadence.
Terminal rows and the full collection are never periodically polled. When an
individual Job becomes terminal, its polling stops.

TanStack Query owns Job and User server state. Polling requests use their abort
signals so navigation can stop unnecessary HTTP work; aborting a read never
means Job Cancellation.

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

## Consequences and deferred reconciliation

The frontend can ship a complete path from account setup through GROMACS
Submission, durable recovery, Cancellation, and Result download without first
expanding the backend to the longer-term model.

The MVP deliberately omits self-service signup, password changes, numeric Job
Progress, Retry from retained Input, Job Deletion, expiry handling, configuration
recall, Job History pagination and filters, and dark-mode controls because the
live API does not support them or the first vertical slice does not need them.

The live Job vocabulary conflicts with `CONTEXT.md` and ADR-0002, while
administrator provisioning conflicts with ADR-0004. After the MVP, the team
must decide whether to revise the glossary and earlier ADRs or change the API
to the intended long-term model. Until then, this ADR records the deviation so
future frontend work does not silently mix the two contracts.
