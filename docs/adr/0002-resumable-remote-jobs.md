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

The exact Job Status vocabulary is `queued`, `running`, `cancelling`,
`succeeded`, `failed`, `cancelled`, and `expired`. A Job becomes `succeeded`
only when its Result is retrievable. Upload and Submission state occur before a
Job exists and are never represented as Job Status.

Progress is a separate latest snapshot, not a history or log. It may be
determinate when completed and total work are known, or indeterminate with a
phase and message; the frontend must never manufacture a percentage or ETA.
The backend alone decides Job Status, including failure. If updates become
stale, the frontend shows the last update and a warning but does not infer that
the Job has stalled or failed. The warning threshold remains to be chosen.

## Polling and capacity

The first version uses HTTP polling instead of server-sent events or WebSockets.
Poll about every two seconds while the page is visible, back off to about every
15 seconds in the background, refetch on focus, and stop after any terminal
status. Long-running Jobs require no email, push, or service-worker notification
in the first version because Job History provides recovery.

Each polling request passes through the browser request's abort signal so
navigation can stop unnecessary HTTP work. Aborting that request never implies
Cancellation of the durable Job; only an explicit backend action can request
that transition.

The backend enforces both per-User and global running Capacity Limits. A
Submission accepted while either limit is full creates a queued Job instead of
being rejected. The numeric limits remain an operational decision.

## Transfers, cancellation, and failures

Inputs and Results are each limited to 100 MiB in the first version. Upload is
a cancellable multipart transfer with its own determinate progress, implemented
with native `XMLHttpRequest`; cancelling the Upload is not cancellation of an
already-created Job. Result download is a direct, authenticated, same-origin
browser navigation or stream rather than buffering bytes in a JavaScript Blob.

Cancellation is best effort. A Job remains `cancelling` until the backend
confirms it stopped, becomes `cancelled` only after confirmation, and may still
become `succeeded` if its Result wins the race. Deletion is a separate action,
and an active Job must reach a terminal state through Cancellation before its
record and retained data can be fully removed.

A Job Error exposes a stable code, concise message, Job identifier, and useful
next action. Raw Modal exceptions, logs, stack traces, paths, and environment
details stay on the backend.
