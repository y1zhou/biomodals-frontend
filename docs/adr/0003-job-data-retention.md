# Retain Job data for recovery and retry

> Superseded before the first release by backend ADR 0007 and the backend API
> Tool service specification. Current Jobs do not retain submitted Input for
> retry and cannot be deleted through the product. Remote Tool publications are
> authoritative; the local Result Cache is rebuildable. The text below remains
> only as design history.

Input is retained for 30 days after a terminal status, and a Result is retained
for 30 days after its Job becomes `succeeded` or `partial`. Job metadata is
retained for six months. This gives Users time to download Results and retry
failures without keeping large files as long as the lighter Job History record.

A User may delete a Job and its retained data early. Once expiry handling is
implemented, a `succeeded` or `partial` Job whose Result is no longer retained
becomes `expired`; the Job remains visible until its metadata is deleted or
reaches six months. Retained Input allows an eligible failed Job to be retried
without another Upload.

Every remote Job and all of its Input, Progress, status, Result, and metadata
are private to its owner. Job identifiers are not credentials, and the backend
must enforce ownership even though deployment is on a trusted private network.
By contrast, a Client Operation is public and its Input never leaves the
browser or enters analytics, telemetry, logs, or error reporting.
