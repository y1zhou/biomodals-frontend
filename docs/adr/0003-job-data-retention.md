# Retain Job data for recovery and retry

Input is retained for 30 days after a terminal status, and a Result is retained
for 30 days after its Job succeeds. Job metadata is retained for six months.
This gives Users time to download Results and retry failures without keeping
large files as long as the lighter Job History record.

A User may delete a Job and its retained data early. Once a succeeded Job's
Result is no longer retained, its Job Status becomes `expired`; the Job remains
visible until its metadata is deleted or reaches six months. Retained Input
allows an eligible failed Job to be retried without another Upload.

Every remote Job and all of its Input, Progress, status, Result, and metadata
are private to its owner. Job identifiers are not credentials, and the backend
must enforce ownership even though deployment is on a trusted private network.
By contrast, a Client Operation is public and its Input never leaves the
browser or enters analytics, telemetry, logs, or error reporting.
