# Model remote computation as resumable Jobs

Remote computations can run for hours, so a Job is durable backend state rather
than the lifetime of a browser request. A User can leave and later recover Jobs
from a global My Jobs page or a stable Tool-scoped route at
`/tools/:toolSlug/jobs/:jobId`.

Job creation is idempotent: retries of the same Submission intent return the
original Job instead of spawning duplicate remote work. Retrying a failed Job
is different; it creates a new linked Job from retained Input and leaves the
original unchanged.

## Lifecycle and Progress

The live Job Status vocabulary is `queued`, `running`, `finalizing`,
`blocked`, `cancel_requested`, `state_unknown`, `succeeded`, `partial`,
`failed`, and `cancelled`.
`finalizing` means remote computation has finished but the Result is not yet
validated and ready. A Job becomes `succeeded` only when its complete Result is
retrievable; `partial` is terminal and means a useful Result is retrievable
with warnings. `expired` is a planned retention state and is not returned until
Result expiry handling is implemented. Upload and Submission state occur before
a Job exists and are never represented as Job Status.

Succeeded and partial are terminal during the ordinary compute lifecycle. The
one recovery exception is loss of their immutable published Result: if neither
the recorded ZIP nor an exact reconstruction remains retrievable, the Job moves
to `blocked` under `result_integrity`. Restoring the exact recorded bytes returns
it to its prior completed state; recovery never creates a new Result identity.

`blocked` means scientific compute is preserved but finalization or exact
published-Result recovery cannot continue until an Administrator fixes a
permanent service configuration, permission, storage, or integrity problem. It
is recoverable and non-terminal, but it does not count
against User, Tool, or Global Active Job Limits. Resuming a blocked Job retries
only finalization against its existing outputs; it must never replay scientific
compute. Transient publication failures remain `finalizing` and retry with
bounded backoff.

Blocked recovery is automatic. The backend persists an exponential retry
schedule capped at approximately 15 minutes and retries only finalization
against the Job's original Modal Configuration Snapshot. API restart resumes
that reconciliation. Administrators may see blocked counts and safe operational
categories, but the role still does not grant access to another User's Input,
Result, or private Job detail. The MVP has no per-Job rerun or unblock action.

Authentication, permission, invalid service configuration, and missing
configured Modal resources block immediately. Connection, internal-service,
resource-exhaustion, and upload-timeout failures remain `finalizing` for a
persisted 30-minute retry window before becoming blocked. Missing, corrupt, or
scientifically invalid required output instead produces terminal
`failed/result_invalid`, because an operator configuration repair cannot
reconstruct it before initial publication. Loss or mutation detected after a
Result was published uses blocked category `result_integrity` instead of
silently redefining that Result. A blocked Job may remain blocked indefinitely
while its low-frequency automatic finalization retries continue.

An owner-visible blocked Job supplies generic recovery copy, `blocked_at`, and
`next_retry_at`. Existing `error_code` and `error_message` remain exclusive
to terminal failed Jobs. Raw provider details and Blocking Categories are not
part of owner-visible Job detail.

`state_unknown` means remote work may still exist but BioModals no longer has a
durable Function Call identity or status sufficient for safe automatic
reconciliation. It is entered immediately when a direct submission outcome is
explicitly ambiguous, after an interrupted submission lease expires, or when
Cancellation status expires and no verified final Result can be recovered. The
backend never resubmits that operation automatically.

A state-unknown Job consumes every applicable Active Job Limit and is excluded
from interval polling and backend reconciliation. Job detail labels it
`Status unknown`, exposes `state_unknown_at`, leaves manual Refresh and focus refetch
available, and offers no Cancel, Download, or Start Again action. The latest
recorded Stage remains visible without a spinner or invented terminal outcome.
An Administrator must inspect Modal, stop remote work there when necessary, and
then use the Admin-only `Mark failed` action. That action does not contact Modal;
it records safe terminal `failed/compute_failed` and releases capacity.

Progress is a separate latest snapshot, not a history or log. It may be
determinate when completed and total work are known, or indeterminate with a
phase and message; the frontend must never manufacture a percentage or ETA.
The backend alone decides Job Status, including failure. If updates become
infrequent, the frontend continues to show the last recorded update but does
not infer that the Job is stale, stalled, or failed. A long-running deployed
Function may legitimately leave `updated_at` unchanged for hours, and the API
does not provide a heartbeat contract.

`JobView.stage` is a workload-specific current-stage snapshot. For GROMACS it
contains a stable stage code and, when a deployed Function is associated with
that stage, its safe Function name. `JobView.stage_history` retains the ordered
started stages. Each entry has `started_at`, nullable `ended_at`, and a nullable
outcome of `completed`, `failed`, or `cancelled`. Active, state-unknown, and
blocked stages have no end or outcome. The detail page merges these entries
into the fixed sequence but never invents timestamps or outcomes. Modal call IDs, App names,
Environments, and storage paths remain private.

The fixed GROMACS sequence is `prepare_simulation`, `analyze_nvt`,
`analyze_npt`, `run_production`, `analyze_production`, and `prepare_result`.
Their labels are Prepare simulation, Analyze NVT, Analyze NPT, Run production,
Analyze production, and Prepare result. The first five rows display their exact
directly orchestrated Function: `prepare_tpr_cpu|gpu`, `collect_traj_stats`,
`collect_traj_stats`, `production_run_cpu|gpu`, and `collect_traj_stats`.
Prepare result is local backend work and displays no Running Function.
Preparation, minimization, NVT, and NPT execution inside `prepare_tpr_*`, and
nested implementation calls such as `postprocess_traj`, are not separate
timeline stages.

The deployed GROMACS App uses one `run_name` for both its Volume directory and
scientific filenames. The API therefore derives each new run name from a
sanitized, readable display-name slug followed by the full Job UUID. The slug
makes filenames recognizable, while the UUID prevents a repeated display name
from reusing another Job's checkpoints or outputs. This preserves the
established App interface; separating the directory identity from filenames
would require an explicit future App contract change. Existing `api-<UUID>`
run names remain readable for legacy Result recovery but are not created for
new Jobs.

## Polling and capacity

The first version uses HTTP polling instead of server-sent events or WebSockets.
Poll progressing and blocked Jobs every 10 seconds while the page is visible,
back off to every 60 seconds in the background, refetch on focus, and offer
manual Refresh. Stop interval polling after a terminal or `state_unknown`
status; focus and manual refetch remain available for the latter. This matches
the backend's default 10-second remote-state reconciliation cadence.
Long-running Jobs require no email, push, or service-worker notification in the
first version because Job History provides recovery.

When a refresh request fails, retain the last known Job state, show "Unable to
refresh job status," keep manual Refresh available, and continue the normal
polling cadence. A transport failure never changes the Job's durable status.

Each polling request passes through the browser request's abort signal so
navigation can stop unnecessary HTTP work. Aborting that request never implies
Cancellation of the durable Job; only an explicit backend action can request
that transition.

The MVP enforces per-User, per-Tool, and Global Active Job Limits across
`queued`, `running`, `finalizing`, `cancel_requested`, and `state_unknown` Jobs.
A blocked Job does not consume those limits. A Submission beyond a limit is
rejected before a Job is created. A distinct
execution Capacity Limit, where an accepted Job waits in a durable admission
queue, is planned only after the backend can retain Input for later dispatch.
Numeric limits remain an operational decision.

## Transfers, cancellation, and failures

The first remote Tool accepts one GROMACS PDB Input up to 10 MiB; future Tools
define their own Input contracts. Upload is a cancellable multipart transfer
with its own determinate progress, implemented with native `XMLHttpRequest`;
cancelling the Upload is not cancellation of an already-created Job.

Results have no fixed frontend product limit in the MVP. Result download is a
prepared, authenticated, same-origin browser download rather than buffering
bytes in a JavaScript Blob. The frontend first calls the idempotent,
CSRF-protected prepare-download operation and shows an indeterminate spinner
while the backend restores and verifies the local cache. A `204` starts the
ordinary GET download. The backend imposes neither a per-Result ceiling nor an
automatic local-cache eviction ceiling. It records every finalized Result's
byte size and uses a configurable 1 TiB local-usage threshold for an
Administrator warning rather than rejecting or deleting Results.

Repeated preparation joins the per-Job cache fill. Leaving the page or aborting
one request stops that browser wait but does not cancel or corrupt shared cache
work. Coded preparation failure remains in the SPA and refetches the Job instead
of navigating the User to a raw API error document.

The subsequent GET uses the backend's safe `Content-Disposition` filename:
`<sanitized display name>-results.zip`, or `gromacs-results.zip` when the Job
has no usable display name. It does not expose the Job UUID, Modal run name, or
storage path. The browser owns any suffix needed for repeated downloads.

The Result Cache is rebuildable local storage, never the authoritative Result.
Clearing an unleased cached archive is safe because a later download restores
or reconstructs it from the recorded Modal Volume without rerunning scientific
compute. Active staging and in-progress downloads are protected from cleanup.
Each finalized Job records whether its Result currently has a local cached
copy. Cleanup removes that Result from local-usage totals; successful staging or
later reconstruction adds it back. Startup reconciles those database markers
with actual cache files after interrupted cleanup or manual filesystem changes.

On a cache miss, the backend first restores the published Modal ZIP and marker.
If either is missing or corrupt, it deterministically reconstructs from the
allowlisted raw Volume outputs and persisted provenance timestamp. It republishes
only bytes whose size and SHA-256 equal the Job's recorded Result. A different
digest never replaces the published identity or triggers scientific compute;
the Job becomes blocked under `result_integrity` until exact recovery succeeds.

Cancellation is best effort. A Job remains `cancel_requested` until the backend
confirms it stopped, becomes `cancelled` only after confirmation, and may still
become `succeeded` or `partial` if its fully published Result wins the race.
The backend persists `cancel_requested_at`, starts no successor stage after the
request, retries transient Modal failures, and resumes reconciliation after a
restart. A stage that completed before Cancellation is recorded as completed,
but its successor is not submitted. Pending Cancellation continues consuming
every applicable Active Job Limit. The MVP has no Job Deletion action.

If Modal's call status expires before Cancellation is confirmed, the backend
recovers a verified final Result when possible. Otherwise the Job becomes
`state_unknown`; elapsed time or an expired provider handle never proves that
remote work stopped.

After 15 minutes in `cancel_requested`, the page shows "Cancellation is taking
longer than expected." This warning is derived from `cancel_requested_at`; it
does not create a timeout, change Job Status, or imply that remote work stopped.

Only `queued` and `running` Jobs accept a new Cancellation request. Repeating a
request for `cancel_requested` is idempotent and returns that Job. A
`finalizing` or terminal Job returns `409 job_not_cancellable` because its
latest authoritative state has already removed the action.

A failed Job exposes its Job Error through typed `error_code` and display-safe
`error_message` fields in `JobView`; those fields are absent for every other
state. The frontend derives a useful next action from the code and shows the
Job identifier for support. An unknown code receives generic failure copy. Raw
Modal exceptions, logs, stack traces, paths, and environment details stay on
the backend, and the API does not prescribe a UI action.

The current Job Error codes are:

| Code | Meaning |
| --- | --- |
| `compute_failed` | Remote computation did not complete successfully. |
| `result_invalid` | The returned Result archive failed validation. |

`result_invalid` applies when the submitted Input, a required end-User output,
a required CSV/PNG analysis pair, or service-generated metadata is missing or
invalid at first publication. Missing optional diagnostic GROMACS logs or MDP
files does not fail the Job.

Both produce a terminal `failed` Job. `result_unavailable`, `invalid_result`,
and `result_expired` are not public Job Error codes: recoverable
post-publication unavailability is represented by blocked category
`result_integrity`, while Result retention will use the planned `expired` Job
Status.
