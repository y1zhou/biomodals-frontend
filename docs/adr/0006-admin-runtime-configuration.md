---
status: accepted
---

# Add administrator-managed runtime configuration

> Backend ADR 0007 and the backend API Tool service spec supersede the original
> Job execution-state and unknown-state action details in this ADR. Current
> resolution can resume a known root call, requeue only after confirming no
> launch occurred, or cancel. It does not mark the Job failed locally. Runtime
> setting, storage, and billing UI decisions below are current.

BioModals adds an Administrator role and a protected Admin interface. An
Administrator is an ordinary User with additional authorization; the backend,
not the visibility of frontend navigation, enforces that authorization. The
User menu links Administrators to `/admin/users`, while `/admin/modal` owns
Modal-related service and Tool configuration.

The API CLI bootstraps the first Administrator with `create-user --admin` and
supports promotion and demotion. The backend rejects disabling or demoting the
last enabled Administrator. A pending-setup Administrator does not satisfy that
safeguard. These invariants are transactional in SQLite and apply equally to
CLI and HTTP administration.

The offline Admin CLI shares configuration-file and process-override semantics
with the service for the state path and public URL, but loads only what its
account command requires. It does not require Modal credentials or initialize
the web server, reconciler, Modal client, or deployed-resource preflight. Full
credential and resource validation remains an `api serve` startup requirement.

## User administration

The Users page lists every User and supports provisioning, enabling, disabling,
issuing a fresh Password Link, granting or removing Administrator access, and
changing the display name and User Active Job Limit. The display name is an
editable presentation field; normalized email remains the immutable, muted
login identity. The table separates those values into centered User and Email
columns. Disabling a User continues to revoke their Sessions and Password Links.
Password Links are shown once for delivery through a trusted channel; no email
service is introduced.

Successful User creation or replacement-link issuance opens a focused dialog
that identifies the affected User by display name and email. It contains a
read-only link and one-click Copy control with visible copied feedback. The
plaintext link exists only in page memory until the Administrator closes the
dialog; closing clears it, and it cannot be refetched. OpenAPI supplies an
absolute `expires_at` beside the URL. The dialog displays it in the local time
zone with "Valid for approximately one hour" and no live countdown; the Admin
CLI prints the same expiration alongside its single copy of the URL. Before
issuing a replacement, the row asks for confirmation and states that all
earlier Password Links for that User will become invalid. The interface does
not place reset links in the shared Create User card.

The page and API expose User Status as `pending_setup`, `enabled`, or
`disabled` rather than an ambiguous active flag. Re-enabling a User with an
established password produces `enabled`; re-enabling one without a password
produces `pending_setup`.

The MVP Users endpoint returns stable cursor pages, with 50 records by default
and at most 100 per response. The frontend follows every continuation cursor to
assemble the complete small-department collection without a hidden cap. Visible
page controls, total counts, and server-side filtering remain deferred until
measured User count or response latency requires them.

The Disable action confirms that Sessions and Password Links will be revoked
and new Submissions refused, while already admitted Jobs will continue and
retain their owner. Those Jobs continue consuming applicable Active Job Limits,
including while state-unknown, until they finish or become blocked. Their
Results are unavailable to the disabled User until re-enabling; Administrators
do not gain access to them.

Disable User, Remove Administrator role, replacement Password Link issuance,
Clear Result Cache, bulk restoration of every Tool setting, and state-unknown
Job resolution are the only actions requiring confirmation. Their dialogs
identify the exact User, Job, or affected setting scope, explain the
consequence, and use the destructive red confirmation style without a typed
phrase. Saving or restoring an individual setting, enabling a User, granting
Administrator role, and copying a value remain immediate.

Every User-row action uses the same control height, padding, typography, and
spacing. Disable User and Remove Administrator role remain red destructive
buttons; Password Link, Enable, and Grant Administrator use one consistent
secondary treatment instead of unrelated button styles.

The User Active Job Limit counts Active Jobs owned by one User across all
Tools. Blocked Jobs are recoverable but do not consume this limit. Its default
is copied onto the User at provisioning and the resulting per-User value is
stored in SQLite.

Job admission requires the owner still be enabled inside the same SQLite write
transaction that applies idempotency and Active Job Limits. Authentication
earlier in an upload request is not sufficient authorization to admit paid
work after a concurrent disable.

Table mutations are serialized so one shared mutation cannot reassign an
earlier failure to a different User row. Create-form errors remain with the
Create User form, and row mutation errors and pending state remain with the
initiating row. The link dialog receives focus, returns focus to its initiating
control when closed, and announces copy success without relying on color.

## Modal administration

The Modal page has Environment and Tools sections. Environment displays the
Modal service-user token ID, the effective Modal Environment, and the Global
Active Job Limit. It never returns or stores the Modal token secret.

The token ID appears in a visually muted read-only field with an in-field Copy
button and visible copied feedback. The Environment form has one Save action on
its own bottom row aligned right, making its form-wide scope clear. It submits
only fields whose values changed.

The Modal page also shows aggregate blocked-Job counts grouped by safe Blocking
Category and the age of the oldest blocked Job. Those aggregates expose no
owner identity, Job identifier, Input, Result, Modal exception, Volume path, or
private Job detail; Administrator access still does not grant inspection of
another User's Jobs.

A separate `Jobs with unknown remote status` table is the narrow operational
exception. It exposes only Job ID, Tool display name, Job display name, safe
run name, `state_unknown_at`, and one fixed ambiguity reason:
`submission_in_progress`, `submission_outcome_unknown`,
`provider_outcome_unknown`, or `deployment_unavailable`. This lets an
Administrator locate the work in Modal without exposing private Job data.

After checking Modal, an Administrator may attach a known root Function Call
and resume reconciliation, requeue only when no launch occurred, or request
cancellation. Each resolution is confirmed and preserves the remote
coordinator as execution authority.

## Storage administration

The protected Admin interface adds a Storage page showing total published
Result bytes recorded in SQLite, completed local Result Cache bytes, active
staging bytes, filesystem free space, and the configured soft-warning
threshold. The default warning threshold is 1 TiB and comes from process/file
configuration, not an Administrator Runtime Setting. It warns on completed
local cache plus active staging usage and never rejects a Result.

A `Clear cache` action removes every unleased completed local Result archive
and reports the entries and bytes reclaimed. The Storage view also supplies the
latest reclaimable entry count and byte estimate for its confirmation dialog.
If a download lease begins while the dialog is open, the successful response
may report less reclaimed space than the estimate. Each cleared Job is marked
as not locally cached so future local-usage calculations exclude its Result size.
Successful staging or later reconstruction marks it cached again. Active
staging files and archives currently leased to downloads are protected.
Abandoned staging files are cleaned automatically rather than presented as
individual administrator choices. Startup reconciles database cache-presence
markers with actual files.

Storage metrics load on page entry and focus and expose manual Refresh with a
last-updated time. They do not poll every 10 seconds because computing
filesystem totals is not time-critical. A cleanup or successful Result cache
fill in the same frontend session invalidates the snapshot; changes from other
browsers appear on focus or manual Refresh. Selecting Clear cache first
refreshes its reclaimable estimate with a pending indicator, then opens the
confirmation. Success refreshes all metrics and reports actual reclaimed
entries and bytes.

Clearing the Result Cache never deletes a Job or its authoritative remote Modal
Volume data. A later User download restores or reconstructs the Result locally
without rerunning scientific compute.

The Tools section is a five-column table whose first header row contains the
user-facing Tool name, combined Active Jobs / Tool Active Job Limit, a `Modal`
group spanning exact deployment version and Job Logs, and a visually unlabeled
row-action column. The final column's accessible label and independent
placement make clear that Save applies to every changed field in the row.
Modal App names are deliberately absent because they are startup-only
configuration.

Job Log access uses an icon-only switch. `Admins only` is a black track with a
locked icon and the thumb on the right; `Job owners` is a gray track with an
unlocked icon and the thumb on the left. The current state text appears on
pointer hover and keyboard focus rather than occupying table width, while the
control retains a stable accessible name and switch state.
Administrators always retain access; enabling it grants access only to the
authenticated owner of that Job, never another User or an anonymous browser.
GROMACS defaults to Job-owner access. New Tools default to Administrator-only
logs until their provider output has been reviewed. The API property is
`active_jobs`; it counts exactly the `queued`, `running`, `finalizing`,
`cancel_requested`, and `state_unknown` states consumed by admission limits,
while `blocked` and terminal Jobs are excluded. The backend's fixed workload
descriptor supplies the display name and stable workload key. The key remains
code-owned because workload routes and compute adapters are registered code,
not dynamic catalog records.

While the page is visible, its operational snapshot refreshes every 60 seconds.
It backs off to every 5 minutes when the document is hidden and refetches
immediately on focus and after a successful setting mutation. A manual Refresh
control and small last-updated indicator make the snapshot age explicit.
Refetches update counts and committed setting values without overwriting unsaved
Environment or Tool form edits. No push or streaming transport is introduced.

Tool-row saves are likewise serialized and display failures in the initiating
row. Environment-setting failures remain inside the Environment section.
Each save sends only fields whose values actually changed. A restore control
inside every editable setting removes that field's Administrator override and
reveals its configured-file or built-in default. Restore controls and
provenance are field-specific: changing or restoring a Tool Active Job Limit
does not affect the deployment version or Job Log policy.
The Job Log toggle participates in the same row-wide Save action, and its
adjacent restore control removes only its database override.
The table-wide Restore all to defaults action confirms before removing every
Tool-setting override and discarding unsaved Tool edits.
Toggle tracks and thumbs transition smoothly between states. Restore controls
rotate their counter-clockwise arrow counter-clockwise when activated, while
still replacing it with the ordinary pending spinner for a server mutation.

The MVP does not add ETags, setting revisions, or concurrent-edit conflict
dialogs. Changed-field PATCH requests avoid overwriting unrelated settings;
two Administrators editing the same field receive ordinary last-commit-wins
behavior. Revisit this only if concurrent administration becomes common.

Changing the Modal Environment performs a read-only backend preflight of every
registered Tool coordinator in that Environment at its startup-configured App
name and effective deployment version before the database update commits.
Changing a deployment version preflights that version with the configured App
name in the current effective Environment. Limit-only and Job-log changes do
not validate unrelated Modal fields. A failed preflight leaves every prior
Runtime Setting intact and returns a stable configuration error; validation
never invokes a paid Function.

Within one API process, provider-identity mutations serialize their effective
setting read, preflight, and database commit. Concurrent Environment and Tool
edits therefore cannot commit a combined identity that was never preflighted.

Only the fields participating in the preflight display a spinner and disabled
save/restore controls while validation is pending. Other field provenance and
pending state remain unchanged.

A failed Tool save opens a field-aware error popover above that row's Save
button. It identifies the rejected deployment-version field and retains the
backend's safe diagnostic detail. The popover has a top-right close button and
also clears when the Administrator edits or retries the row.

The Tool Active Job Limit counts Active Jobs for one workload across all Users.
The Global Active Job Limit counts Active Jobs across all Users and Tools.
State-unknown Jobs consume both limits until Administrator resolution; blocked
Jobs consume neither limit. Admission reads the User limit and database-backed
Runtime Settings, checks User, Tool, and Global counts, and writes the Job
snapshot within the same SQLite write transaction. Reusing an idempotency key
still returns the original Job after rechecking that the User remains enabled
but before applying current limits.

These policies reject excess Submissions with
`409 active_job_limit_reached`. They are admission controls, not Capacity
Limits: the backend still does not retain uploaded Input for later dispatch,
and therefore does not claim to provide a durable execution queue or an exact
cross-Tool running-call concurrency cap.

All three limit types accept non-negative integers, including zero. A saved
limit may be lower than its current Active Job count. Existing Jobs continue
unchanged, while new Submissions in that scope are rejected until the count
falls below the limit. The UI treats a display such as `5 / 2` as an intentional
over-limit state and shows "Over limit; new jobs are blocked" rather than a
validation error. Setting zero pauses new Submissions in that scope without
disabling Users or cancelling admitted Jobs.

These counts are local to one backend and its SQLite database. Global means
every User and Tool admitted by this deployment, not a combined count across
beta, production, or the Modal account. Separate deployments may share a Modal
Environment and App but do not coordinate limits. Pre-release configuration
examples set User, Tool, and Global defaults to one to bound test cost; a true
provider-account cap is outside the MVP.

## Cost administration

The Modal page includes an optional Administrator-only Costs section. Its
default current-month interval is followed by Today, last seven days, last 30
days, previous month, and a custom date range. A successful report shows Total
workspace cost and Current environment cost for the effective Modal Environment
reported by the backend, followed by Tool and Environment breakdowns separated
by a subtle divider.

Unknown or untagged Tool usage appears as `Other / untagged` in the Tool
breakdown. It is not a separate Environment category: every billing row still
contributes to its reported Environment. Reports are cached for five minutes.
An unsupported workspace plan or provider failure displays an explicit failure
with Refresh rather than a synthetic zero.

## Responsive administration

Administrator workflows remain functional at 360 CSS pixels wide. Forms stack
vertically, navigation and actions do not clip, and semantic tables retain all
columns through horizontal scrolling. The interface does not add separate
mobile administration components or hide operational fields on narrow screens.

## Configuration sources and secrets

`BIOMODALS_API_CONF_ENV` names an explicit `.env` file. For service and Tool
Runtime Settings, effective precedence is:

1. an explicit process environment variable;
2. an Administrator value stored in SQLite;
3. a value from the configured `.env` file;
4. a built-in default.

An explicit process environment variable makes the corresponding Admin field
read-only. Database edits otherwise take effect immediately. The configured
file is parsed without overwriting process environment values.

The service snapshots file and process values at startup and does not watch or
hot-reload them. Editing either source requires an API restart, after which
startup validation and Modal preflight must succeed before readiness returns.
SQLite-backed Administrator Runtime Settings still apply immediately. The
Admin API displays values loaded by the running process; it does not reparse
disk and present an edited but inactive value.

Job-owner log access has no process or configuration-file override. Its
effective precedence is the per-Tool database value over the safe Tool-owned
default, so future Tools remain Administrator-only unless their code or an
Administrator explicitly opts owners in.

For the Admin PATCH contract, omission means unchanged and an explicit JSON
`null` means remove that one database override. The interface does not render
the built-in default or Administrator source as a badge. It uses the in-field
restore control for editable overrides and plain explanatory text only when a
configuration file or process environment controls the effective value.

`MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET` are exceptions because they are
secrets/bootstrap credentials rather than Runtime Settings. They must come
from the process environment or configured `.env` file, are never stored in
SQLite, and both are required for API startup. Only the token ID appears in the
Administrator API.

`BIOMODALS_PUBLIC_URL` is the single static public browser origin. It constructs
Password Links and defines the accepted browser Origin. The frontend continues
to use relative `/api` URLs: Vite supplies the development proxy, while the
production reverse proxy serves the SPA and API under one origin. No backend
URL is embedded in the frontend or stored as an Administrator setting.

## Live changes and existing Jobs

Modal Environment and exact deployment-version changes apply to newly admitted
Jobs. Each Job stores a Modal Configuration Snapshot at admission. Submission,
later deployed-Function lookups, and Volume access use that snapshot, so
existing Jobs remain attached to the environment, startup-configured App name,
and version under which they were accepted.

Job-owner log access is an authorization policy rather than provider identity,
so it is evaluated for each new log request and is not included in the Modal
Configuration Snapshot. Changing the toggle affects existing Jobs without
changing their scientific execution or retained Stage History. An already-open
HTTP stream may continue until it naturally closes; later target or stream
requests enforce the current policy.

Backend startup applies the same read-only preflight to effective
process/file-controlled Modal settings before accepting traffic.

The OpenAPI document includes the Administrator flag, all Admin operations,
setting provenance and editable state, the per-Tool Job Log policy, the
caller-specific `can_view_logs` capability, and the owner-and-Administrator log
routes. Generated TypeScript remains the only frontend API schema; the frontend
does not maintain a parallel hand-written contract.

## Pre-release persistence reset

The pre-release backend supports only its current SQLite schema and performs no
development migration from earlier versions. On mismatch it identifies the
configured database location and refuses to start; it never automatically
deletes or rewrites state. An Administrator may stop the service and explicitly
remove or relocate that exact pre-release database before starting fresh. The
first new User must be provisioned as an Administrator.

Pre-release and production use distinct backend service configurations whose
state and cache settings point to different host-local locations.
Pre-release uses `https://beta.biomodals.example.com` as its public URL; production
uses `https://biomodals.example.com`. Reset and Clear Result Cache guidance is scoped
only to the pre-release configuration and must not touch production. The Modal
Environment remains an independent explicit setting and may still be
`production` when deliberately authorized. This reset allowance ends at the
first release.
