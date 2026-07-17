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

**Active Job Limit**:
A per-User and workload bound on how many non-terminal Jobs the User may own at
once. A Submission beyond the limit is rejected before a Job is created.
_Avoid_: Capacity Limit, rate limit

**Job Error**:
The stable machine-readable code and safe user-facing explanation of why a Job
failed. The interface derives the next action and includes the Job identifier
for support.
_Avoid_: Raw exception, remote log
