# BioModals

BioModals is a catalog of first-party biological workflows that run either in
the browser or as durable remote computations owned by a User.

## Language

**Tool**:
A complete, first-party workflow offered by BioModals. A Tool may contain
Client Operations, create Jobs, or do both.
_Avoid_: App, external tool

**Tool Catalog**:
A curated set of available Tools that Users can discover and open, plus any
explicitly announced Tool Catalog Placeholders.
_Avoid_: Marketplace, external catalog

**Tool Catalog Placeholder**:
A visibly muted, non-interactive preview of a planned Tool. It is labelled WIP,
has no route or Submission, and is excluded from available-Tool navigation and
filters until the workflow exists.
_Avoid_: Tool, disabled Tool, fake route

**Client Operation**:
A computation that completes entirely in the browser without creating a Job.
_Avoid_: Local Job, client-side Job

**User**:
A person with a BioModals account who owns and can return to Jobs.
_Avoid_: Client, account

**User Status**:
The account-access state of a User: pending setup, enabled, or disabled.
Disabling access is prospective: it preserves the User's existing Jobs and
ownership while preventing authentication, Password Link use, and new
Submissions.
_Avoid_: Active flag, inactive User

**Administrator**:
An enabled User trusted to provision and manage Users and change non-secret
Runtime Settings through the Admin interface.
_Avoid_: service user, operator token

**Password Link**:
A one-time credential that authorizes a User to choose a password during initial
Password Setup or an administrator-assisted Password Reset. It expires one hour
after issuance and cannot be retrieved again after its handoff is closed.
_Avoid_: Login link, invitation link

**Password Setup**:
The act of consuming a Password Link to choose a password and establish a fresh
authenticated Session, replacing any prior Sessions for that User.
_Avoid_: Login, signup

**Submission**:
A User's single intent to create a Job from selected Input.
_Avoid_: Request, run

**Upload**:
The transfer of Input for a Submission before its Job is created.
_Avoid_: Job Progress

**Retained Validation**:
An owner-private, short-lived server resource created after AlphaFold3 input
passes native schema and Tool validation. Its identifier lets the confirmation
page submit the exact bytes the server already validated without placing the
document in `service.sqlite3` or uploading it twice.
_Avoid_: Job, draft, database input record

**Job**:
A durable, owner-scoped record of one remote computation. It can outlive the
browser session that created it and is successful only when its Result is ready.
_Avoid_: Task, Modal call

**Job Status**:
The authoritative lifecycle state of a Job. The live states are queued,
running, finalizing, blocked, cancel_requested, state_unknown, succeeded,
partial, failed, and cancelled. Expired is planned for a retained Job whose
Result has passed its retention period.
_Avoid_: Upload state, progress state

**Active Job**:
A queued, running, finalizing, cancel_requested, or state_unknown Job that
counts against admission limits. A blocked Job is recoverable but is not an
Active Job.
_Avoid_: Non-terminal Job, Modal call

**Blocked Job**:
A recoverable Job whose scientific compute is preserved but whose Result needs
an Administrator-fixable service problem resolved before finalization or exact
published-Result recovery can continue. A previously succeeded Job may become
blocked if its immutable Result can no longer be restored exactly.
_Avoid_: Failed Job, stalled Job, queued Job

**State-unknown Job**:
A Job for which remote work may still exist but BioModals cannot safely confirm
or reconcile it. It consumes Active Job Limits until an Administrator checks
Modal and returns it to remote reconciliation. The UI label is Status unknown.

The Administrator view identifies whether uncertainty came from an ambiguous
Submission or an unavailable exact deployment. The fixed reason codes are
`submission_outcome_unknown` and `deployment_unavailable`.
_Avoid_: Blocked Job, stalled Job, provider-unknown Job

**Blocking Category**:
An Administrator-visible classification of the service problem preventing
blocked Jobs from finalizing or restoring their exact published Result,
reported only as aggregate operational data.
_Avoid_: Job Error, Modal exception, User Job detail

**Progress**:
The latest known observation about active Job work, expressed as determinate
completed/total work or an indeterminate phase and message.
_Avoid_: Job Status, progress log

**Job Stage**:
One workload-specific step of a Job and, when applicable, the deployed function
associated with that step. Several Job Stages may be active concurrently.
_Avoid_: Job Status, Modal call

**Active Job Stages**:
The complete set of started Job Stages whose outcomes are not yet known. They
may overlap and finish in a different order from their display rows. The API
returns all semantic stages in `JobView.stages`.
_Avoid_: Current Stage, Modal call graph

**Stage History**:
The ordered started and finished times plus terminal outcomes projected from
the Tool coordinator into workload-specific stages. Active, state-unknown, and
blocked stages have no finish time or outcome. Concurrent entries may overlap.
It is not a Modal call graph, provider log, or source of raw provider
identifiers.
_Avoid_: Job Status, audit log, Modal call graph

**Job Logs**:
Provider output for one started remote Job Stage, available to Administrators
and, when the Tool policy permits it, the authenticated Job owner. Active Stage
output is streamed; terminal Stage output is fetched as retained history. Job
Logs do not determine Job Status, Progress, Stage History, Cancellation, or
Result validity. The browser receives only an opaque log target selector, not
the provider Function Call identifier used by the backend.
_Avoid_: Job History, Stage History, audit log, Progress

**Stage Outcome**:
How a started Job Stage ended: completed, failed, or cancelled. It remains
absent while that Stage is active, state-unknown, or blocked.
_Avoid_: Job Status, Progress

**Job History**:
The retained record through which a User finds current and past Jobs across all
Tools.
_Avoid_: Activity log, audit log

**Input**:
User-supplied data consumed by a Tool.
_Avoid_: Payload

**Result**:
The retrievable output of a succeeded or partial Job.
_Avoid_: Response, artifact

**Result Cache**:
A rebuildable local copy of finalized Result data whose authoritative source
remains on a remote Modal Volume.
_Avoid_: Result retention, authoritative Result, Job deletion

**Retry**:
A new Submission that creates a linked Job using retained Input from an earlier
failed Job.
_Avoid_: Restart, rerun in place

**Cancellation**:
A durable best-effort request to stop an Active Job without deleting its
record. It continues consuming Active Job Limits until the remote outcome is
known and never becomes cancelled solely because time elapsed.
If the provider status expires before BioModals can confirm the outcome, the
Job becomes state_unknown for Administrator review.
_Avoid_: Deletion, request abort

**Deletion**:
The irreversible removal of a Job and its retained data.
_Avoid_: Cancellation, archival

**Capacity Limit**:
An operational bound on how many Jobs may execute concurrently. Accepted Jobs
wait when execution capacity is full.
_Avoid_: Active Job Limit, rate limit

**User Active Job Limit**:
A per-User bound on how many Active Jobs the User may own across all Tools. A
Submission beyond the limit is rejected before a Job is created.
_Avoid_: Tool Active Job Limit, Capacity Limit, rate limit

**Tool Active Job Limit**:
A per-Tool bound on how many Active Jobs may exist across all Users. A
Submission beyond the limit is rejected before a Job is created.
_Avoid_: User Active Job Limit, Modal container limit

**Global Active Job Limit**:
A deployment-local bound on how many Active Jobs may exist across all Users and
Tools in one backend database. A Submission beyond the limit is rejected before
a Job is created. It does not coordinate beta, production, or the Modal account.
_Avoid_: Capacity Limit, concurrency limit

**Runtime Setting**:
A non-secret service or Tool value that an Administrator may change in the
database and that takes effect without restarting the backend unless an
explicit process environment variable controls it.
_Avoid_: Modal credential, frontend API URL

**Modal Configuration Snapshot**:
The Modal Environment, deployed Modal app name, and exact positive deployment
version captured on a Job when it is admitted, so later Runtime Setting changes
or App redeployments affect only subsequent Jobs.
_Avoid_: current Modal config, mutable Job config

**Job Error**:
The stable machine-readable code and safe user-facing explanation of why a Job
failed. The interface derives the next action and includes the Job identifier
for support.
_Avoid_: Raw exception, remote log
