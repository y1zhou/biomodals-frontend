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
The authoritative lifecycle state of a Job: queued, running, cancelling,
succeeded, failed, cancelled, or expired.
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
The retrievable output of a succeeded Job.
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
A per-User or system-wide bound on how many Jobs may run concurrently.
_Avoid_: Submission limit, rate limit

**Job Error**:
The safe, user-facing explanation of why a Job failed and what the User can do
next.
_Avoid_: Raw exception, remote log
