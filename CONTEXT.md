# BioModals

BioModals is a catalog of first-party biological workflows that run either in
the browser or as durable remote computations owned by a User.

## Language

**Tool**:
A complete, first-party workflow offered by BioModals. A Tool may contain
Client Operations, create Jobs, or do both.
_Avoid_: App, external tool

**Tool Catalog**:
The curated set of Tools that Users can discover and open.
_Avoid_: Marketplace, external catalog

**Client Operation**:
A computation that completes entirely in the browser without creating a Job.
_Avoid_: Local Job, client-side Job

**User**:
A person with a BioModals account who owns and can return to Jobs.
_Avoid_: Client, account

**Administrator**:
An active User trusted to provision and manage Users and change non-secret
Runtime Settings through the Admin interface.
_Avoid_: service user, operator token

**Password Link**:
A one-time credential that authorizes a User to choose a password during initial
Password Setup or an administrator-assisted Password Reset.
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

**Job**:
A durable, owner-scoped record of one remote computation. It can outlive the
browser session that created it and is successful only when its Result is ready.
_Avoid_: Task, Modal call

**Job Status**:
The authoritative lifecycle state of a Job. The live states are queued,
running, finalizing, cancel_requested, succeeded, partial, failed, and
cancelled. Expired is planned for a retained Job whose Result has passed its
retention period.
_Avoid_: Upload state, progress state

**Progress**:
The latest known observation about active Job work, expressed as determinate
completed/total work or an indeterminate phase and message.
_Avoid_: Job Status, progress log

**Job Stage**:
The current workload-specific step of a Job and, when applicable, the deployed
function associated with that step.
_Avoid_: Job Status, Modal call

**Stage History**:
The ordered start and completion times that the backend retained while a Job
moved through its workload-specific stages. It is a timing record, not a Modal
call graph, provider log, or source of raw provider identifiers.
_Avoid_: Job Status, audit log, Modal call graph

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

**Retry**:
A new Submission that creates a linked Job using retained Input from an earlier
failed Job.
_Avoid_: Restart, rerun in place

**Cancellation**:
A best-effort request to stop an active Job without deleting its record.
_Avoid_: Deletion, request abort

**Deletion**:
The irreversible removal of a Job and its retained data.
_Avoid_: Cancellation, archival

**Capacity Limit**:
An operational bound on how many Jobs may execute concurrently. Accepted Jobs
wait when execution capacity is full.
_Avoid_: Active Job Limit, rate limit

**User Active Job Limit**:
A per-User bound on how many non-terminal Jobs the User may own across all
Tools. A Submission beyond the limit is rejected before a Job is created.
_Avoid_: Tool Active Job Limit, Capacity Limit, rate limit

**Tool Active Job Limit**:
A per-Tool bound on how many non-terminal Jobs may exist across all Users. A
Submission beyond the limit is rejected before a Job is created.
_Avoid_: User Active Job Limit, Modal container limit

**Global Active Job Limit**:
A service-wide bound on how many non-terminal Jobs may exist across all Users
and Tools. A Submission beyond the limit is rejected before a Job is created.
_Avoid_: Capacity Limit, concurrency limit

**Runtime Setting**:
A non-secret service or Tool value that an Administrator may change in the
database and that takes effect without restarting the backend unless an
explicit process environment variable controls it.
_Avoid_: Modal credential, frontend API URL

**Modal Configuration Snapshot**:
The Modal Environment and deployed Modal app name captured on a Job when it is
admitted, so later Runtime Setting changes affect only subsequent Jobs.
_Avoid_: current Modal config, mutable Job config

**Job Error**:
The stable machine-readable code and safe user-facing explanation of why a Job
failed. The interface derives the next action and includes the Job identifier
for support.
_Avoid_: Raw exception, remote log
