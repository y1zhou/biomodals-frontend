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
`cancel_requested`, `succeeded`, `partial`, `failed`, and `cancelled`.
`finalizing` means remote computation has finished but the Result is not yet
validated and ready. A Job becomes `succeeded` only when its complete Result is
retrievable; `partial` is terminal and means a useful Result is retrievable
with warnings. `expired` is a planned retention state and is not returned until
Result expiry handling is implemented. Upload and Submission state occur before
a Job exists and are never represented as Job Status.

Progress is a separate latest snapshot, not a history or log. It may be
determinate when completed and total work are known, or indeterminate with a
phase and message; the frontend must never manufacture a percentage or ETA.
The backend alone decides Job Status, including failure. If updates become
stale, the frontend shows the last update and a warning but does not infer that
the Job has stalled or failed. The warning threshold remains to be chosen.

`JobView.stage` is a workload-specific current-stage snapshot. For GROMACS it
contains a stable stage code and, when a deployed Function is associated with
that stage, its safe Function name. `JobView.stage_history` retains the ordered
start and completion timestamps recorded at backend stage transitions. The
detail page may infer that legacy earlier stages completed because GROMACS
execution is strictly sequential, but it never invents timestamps. Modal call
IDs, App names, Environments, and storage paths remain private.

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
Poll every 10 seconds while the page is visible, back off to every 60 seconds in
the background, refetch on focus, offer manual Refresh, and stop after any
terminal status. This matches the backend's default 10-second remote-state
reconciliation cadence. Long-running Jobs require no email, push, or
service-worker notification in the first version because Job History provides
recovery.

Each polling request passes through the browser request's abort signal so
navigation can stop unnecessary HTTP work. Aborting that request never implies
Cancellation of the durable Job; only an explicit backend action can request
that transition.

The MVP enforces a per-User, per-workload Active Job Limit across non-terminal
Jobs. A Submission beyond it is rejected before a Job is created. A distinct
execution Capacity Limit, where an accepted Job waits in a durable admission
queue, is planned only after the backend can retain Input for later dispatch.
Numeric limits remain an operational decision.

## Transfers, cancellation, and failures

The first remote Tool accepts one GROMACS PDB Input up to 10 MiB; future Tools
define their own Input contracts. Upload is a cancellable multipart transfer
with its own determinate progress, implemented with native `XMLHttpRequest`;
cancelling the Upload is not cancellation of an already-created Job.

Results have no fixed frontend product limit in the MVP. Result download is a
direct, authenticated, same-origin browser navigation or stream rather than
buffering bytes in a JavaScript Blob. The backend cache budget is an operational
capacity setting, not an individual Result-size promise. Any future per-Result
safety ceiling must be chosen from observed workload output sizes and enforced
at the backend trust boundary.

Cancellation is best effort. A Job remains `cancel_requested` until the backend
confirms it stopped, becomes `cancelled` only after confirmation, and may still
become `succeeded` or `partial` if its Result wins the race. Deletion is a
separate action, and an active Job must reach a terminal state through
Cancellation before its record and retained data can be fully removed.

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
| `result_unavailable` | A completed Result could not be recovered from authoritative storage. |

All three produce a terminal `failed` Job. `invalid_result` and
`result_expired` are not public codes; in particular, Result unavailability
must not be confused with the planned `expired` Job Status.
