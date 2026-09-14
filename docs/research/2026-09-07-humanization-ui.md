# Humanization website integration research

## Implementation handoff

Implementation was subsequently approved after the backend stack merged at
`e25d570`. The historical interview notes below retain their original approval
boundaries; they are superseded by the accepted service specification and this
handoff for current implementation status.

Implemented the [memory-only batch editor](../../src/pages/HumanizationSubmissionPage.tsx),
known app-specific Advanced controls, explicit original-request/key recovery,
[public overview](../../src/pages/HumanizationOverviewPage.tsx), Tool Catalog and
lazy routes, and a [bounded server-driven Result table](../../src/components/HumanizationResults.tsx)
inside shared Job detail. API types are generated from the backend-supplied
offline OpenAPI export. Cache misses restore the published Result through shared
download preparation and retry the table read once; CSV downloads also prepare
the cache before a native browser download. No scientific inference is replayed.

Browser testing exposed a shared authentication-cache bug: removing the session
query detached mounted form observers during reauthentication. The
[principal installation helper](../../src/auth-state.ts) now cancels obsolete
session reads and updates the existing session query while clearing private data.
Unit and browser regressions cover mounted observers, late responses, same-User
reauthentication, and account switching. Stage Outcome now includes `partial`.

Final local verification on 2026-09-07:

- `bun run lint`, `bun test` (86 tests), and `bun run build` pass.
- `BIOMODALS_OPENAPI_URL=/tmp/biomodals-humanization-openapi.json bun run api:check`
  passes against the exact supplied schema export.
- Full offline Playwright suite: eight tests pass in 36.9 seconds, including
  [humanization UI regressions](../../e2e/humanization.pw.ts), the
  [real deterministic humanization API workflow](../../e2e/humanization-workflow.pw.ts),
  and existing GROMACS/account/admin coverage. Shared fixture counts use per-test
  deltas; scientific timing was not changed to accommodate failures.
- The deterministic API test submitted 100 pairs and received 300 Result rows;
  the first page transferred only 50 rows, totaling 91,656 bytes. Server sorting,
  null placement in both directions, original-order restoration, parent filtering,
  full CSV/archive downloads and anonymous-access rejection passed.
- A local 100-pair import/render measured 862 ms. A separate 25-sample pure
  parser/validation check for 1,000 pairs (238,898 bytes) measured median 2.49 ms,
  maximum 5.92 ms. These are local observations, not performance guarantees.
- Desktop editor and 360-pixel Result screenshots were inspected; the mobile
  Result table scrolls horizontally without widening the document.

The assigned frontend dev server `wF:p21` remains on port 5173. Backend API 4144
is intentionally still the prior deployment baseline; coordinated backend
activation remains separately owned. Verification above made no paid submissions
or deployments. The User subsequently authorized separate authentication and
humanization checkpoint commits on a new frontend feature branch, without pushing
or opening a PR. Live UI verification will follow the backend readiness signal;
the frontend agent will not independently submit a paid run.

## Original research snapshot

Research only, 2026-09-07. No implementation or new product decisions approved.
Frontend revision inspected: `80c351a8bcfff8087866faf5dac684f1837deb31`.
Backend revision inspected: `0685825de96a375a605535a4c56d7cb3f49d2cb5`.
Source references describe these checkouts; backend service design is being
researched separately. No production API, deployment, or model calls were made.
Coordination update: the backend agent verified service seams against immutable
main `b5c2421734d5238f27393287ff024e45b99745a6`, because its local stack predates
current service changes. It reports that `ToolRegistration`, shared `JobLifecycle`,
and `RemoteExecutionClient` already cover remote launch, polling, cancellation,
and recovery, with adapter seams `stage`, `discard_pending`, and `prepare_result`.
Earlier local-backend concerns about missing remote lifecycle integration do not
apply to that baseline. One verified protocol gap remains: the service's
`RemoteExecutionClient` expects coordinator `run`/`resume` returning
`ExecutionOverview`, while the generic workflow coordinator exposes
`prepare_run`/`drive_prepared` and returns `AppRunResult`, including from `resume`.
Humanization therefore needs a narrow workflow-host protocol adaptation in
addition to `ToolRegistration`. Reuse the existing shared lifecycle; this gap
does not justify another lifecycle implementation. The backend agent owns the
adaptation research and its source evidence.
AlphaFold3's archive uses zstd; use format-neutral
"archive" terminology rather than assuming every Tool delivers ZIP.
These service findings are attributed to the coordinating backend agent; this
frontend investigation directly inspected the scientific workflow checkout above.
See the
[backend service specification](https://github.com/y1zhou/biomodals/blob/main/docs/specs/humanization-service.md).
There was no existing frontend research directory; this note follows the
repository's Markdown-under-`docs/` layout. It is not an ADR or specification.

## Existing integration

- The static SPA, same-origin `/api`, typed frontend Tool Catalog and lazy Tool
  modules are existing decisions, not open design questions. FastAPI owns the
  schema and authorization. See [ADR 0001](../adr/0001-static-frontend-api-boundary.md),
  [App routes](../../src/App.tsx), and [Tool Catalog](../../src/tools.ts).
  Only GROMACS and AlphaFold3 are available. Adding metadata alone is insufficient:
  `toolJobPath` and `toolSubmissionPath` explicitly map those two Tools; unknown
  workloads fall back to My Jobs or the catalog. New routes must be added together.
- Public overviews and protected Submission/Job pages already have separate routes.
  The [shared Job detail](../../src/pages/JobDetailPage.tsx) accepts an expected
  Tool, checks the returned Job, and renders arbitrary server-supplied stages.
  Its AlphaFold3-specific input-document download is a small existing exception;
  it does not otherwise require a separate humanization lifecycle implementation.
- Authentication uses same-origin session cookies and mutation-time CSRF headers,
  with no browser bearer token. [Auth state](../../src/auth-state.ts) distinguishes
  expired authentication from service failures and clears cached queries when a
  principal is installed. [ProtectedRoute and reauthentication](../../src/auth.tsx)
  preserve mounted form state during expiry; retrying a mutation remains explicit.
  New forms need their own accurate reauthentication copy: the default mentions PDB.
  Backend ownership checks remain essential for every Result and preview route.
  See [ADR 0004](../adr/0004-local-account-sessions.md).
- [API client](../../src/api/client.ts) provides GET inspection, explicit refresh,
  cancellation, download preparation, direct archive download, and authorized log
  access. It preserves coded API errors and support request IDs. GROMACS uses XHR
  for multipart Upload progress; AlphaFold3 validates a document first and submits
  its retained identifier. Both send idempotency keys. Neither flow settles what
  humanization should submit or whether it needs Retained Validation.
- [AlphaFold3](../../src/pages/AlphaFold3SubmissionPage.tsx) has owner-scoped
  session-storage validation/idempotency pointers and [IndexedDB drafts](../../src/alphafold3.ts).
  These are precedents, not permission to persist humanization sequences.
  A lost Submission response must preserve the same intent key for explicit
  recovery; changed Input/settings must not accidentally reuse it.
- [Job helpers](../../src/jobs.ts) poll progressing and blocked Jobs at 60 seconds
  visible / 300 seconds hidden, stopping intervals for terminal and state-unknown
  Jobs. Focus/manual refresh remains available for state unknown. The shared page
  consumes Query's AbortSignal and enables background intervals. Transport errors
  preserve the last known status; concurrent stages are already supported.
- Successful or partial Results use CSRF-protected `prepare-download`, then a
  same-origin native browser download. The [generated JobView](../../src/api/schema.d.ts)
  contains delivery metadata and stages, not candidate tables. No existing
  humanization preview endpoint, CSV table viewer, or browser Parquet reader was
  found. A sortable preview requires an agreed additional delivery contract.
- [package.json](../../package.json) generates immutable, alphabetized declarations
  with `openapi-typescript`; the runtime fetch/XHR client is handwritten.
  `api:check` checks schema drift. [Cross-repository CI](../../.github/workflows/cross-repository.yml)
  verifies an immutable frontend/backend revision pair and runs an offline backend
  browser fixture. No generated declaration should be edited before schema agreement.

## Scientific workflow evidence and UI implications

The backend [humanization specification](https://github.com/y1zhou/biomodals/blob/main/docs/specs/humanization-workflow.md)
records complete, explicitly paired VH/VL variable domains, CSV `id,vh,vl`, unique
parent IDs, four parallel generators, exact-pair deduplication within each parent,
the unchanged parental baseline, three independent evaluators, and IMGT annotation.
The original no-ranking language is superseded by its dated panel-order amendment.
These are existing workflow decisions; this research does not approve API exposure.

The same specification records 1,000-parent / 3 MiB parser bounds, native controls,
and HuDiff attempts rather than guaranteed yield. Defaults permit at most fourteen
rows per parent including baseline before deduplication/failures; 25 attempts would
permit at most twenty-nine. Thus 1,000 parents can imply roughly 14,000–29,000 rows
before other applicable limits. This is an upper-bound inference, not a measured
browser benchmark or a recommended API admission limit.

The [selection table builder](https://github.com/y1zhou/biomodals/blob/main/src/biomodals/workflow/humanization/tables.py)
and [ranking code](https://github.com/y1zhou/biomodals/blob/main/src/biomodals/workflow/humanization/ranking.py)
own scientific values and ordering. UI proposals should preserve:

- Parent/candidate identity and both sequences; no chain recombination or
  deduplication across distinct parents.
- Separate numeric scores and deltas, null for unavailable values, explicit
  evaluator errors, baseline identity, and generator provenance.
- Per-parent `quality_tier` and `panel_order`; parental controls consume no ranked
  slot. Unranked candidates remain visible. Changing display sort must not silently
  rewrite panel order or imply a new scientific ranking.
- Preserved/changed/unknown CDR annotation. Unknown is not preserved. A complete
  assessment, a ranked candidate, and a successful Job are different concepts.
- Useful incomplete Results after model failures and zero yield distinguished from
  failed execution. Stage/task-level failures need not erase successful candidates.

The current deliverable is `selection.csv`, score Parquets under `scores/`, IMGT
mutations, manifest, and unique native generation publications. The spec's earlier
live smoke record mentions FASTA, but current Usage explicitly removes duplicate
FASTA and selection Parquet. Follow current output code/Usage, not historical smoke
contents. No browser reimplementation of ranking, scoring, or Parquet analysis is
justified by the current request.

## Options to resolve, not accepted recommendations

Final interview update: the grill is complete. Table pages default to 50 rows.
Custom sorts put nulls last in both directions and use stable parent/candidate ID
tie-breaks. With no custom sort, preserve the workflow's original row order.
Saved experimental panel selections are excluded from this release.

The consolidated implementation plan in the
[backend service spec](https://github.com/y1zhou/biomodals/blob/main/docs/specs/humanization-service.md)
awaits explicit User confirmation: establish the current-main baseline without
disturbing the reviewed stack; agree typed/OpenAPI contracts; adapt the workflow
host protocol and reuse the shared Tool lifecycle; implement bounded Polars
Result reads/cache/downloads; build the frontend batch editor, Advanced controls,
recovery and shared Job Result table; then verify with offline cross-repository
tests and performance checks. No implementation, deployment, or paid run is
authorized yet. Historical alternatives and interview frontiers below do not
reopen the accepted decisions or authorize work.

Closing-round update: the User explicitly selected backend-owned table filtering,
sorting, and pagination to avoid an initial full-table transfer, even when the
table would fit browser memory. Opening Results fetches the first bounded page;
subsequent view changes send query parameters, never table contents. Full-table
fetching and local whole-table sorting are not authorized alternatives. Direct
CSV download remains an explicit download action, not the table-loading strategy.

Sequence normalization is now settled: uppercase and remove whitespace, show a
normalized preview, and reject other invalid characters. Both manual entry and
CSV import submit the same typed JSON containing job name, pairs, and batch-wide
scientific settings. These accepted decisions supersede the unresolved
normalization and proposed API statements below. Implementation remains
unauthorized; the backend service spec remains the authoritative decision record.

Round 3 update (see the authoritative service spec linked below): imported rows
with validation errors remain visible for correction/removal and block Submission;
none are silently dropped. Malformed CSV rejects the entire import without
changing the batch. Drafts stay in memory only, remain mounted through
reauthentication, and trigger a warning before leaving an unsent batch. No browser
sequence persistence or reload restoration is approved. Explicit Check submission
reuses the original idempotency key and unchanged request; edits create a new
Submission intent.

The coordinating agent's closing API proposal, not yet an accepted contract, is
typed JSON pairs/settings for both Input paths; bounded owner-authorized Result
table reads from authoritative `selection.csv`; server-side sorting, parent
filtering and pagination; and direct CSV download. It adds neither scientific
reranking nor saved experimental selections. Sequence normalization remains open.

No additional product conflict is identified in that proposal. Recovery must
respect the accepted memory-only boundary: preserve an immutable in-memory request
snapshot for Check submission while the form remains mounted; do not replay the
edited batch under the prior key. Reload discards that recovery snapshot, so the
UI cannot promise reload-based replay. An ambiguous prior Submission may already
have created a Job even when edits create a new intent; creating the new intent
does not cancel or prove failure of the prior one. Existing Job History remains
available, without assuming a new lookup-by-idempotency-key API. These are
consequences of accepted choices, not proposals to persist sequences or add APIs.

Round 2 update: the authoritative accepted product requirements now live in the
[humanization service spec](https://github.com/y1zhou/biomodals/blob/main/docs/specs/humanization-service.md).
Manual entry has ID/VH/VL fields and editable suggested IDs such as `ab_001`;
CSV appends to the same editable batch, with row edit/remove and valid unique IDs.
One scientific configuration applies to the batch. General exposes job name only;
infrastructure ceilings remain Administrator-owned and CLI execution/deployment/
restart controls are excluded. The Result table exposes all `selection.csv`
columns, pagination, sorting, parent filtering, default scientific order,
null/unranked rows, expandable/copyable sequences, and direct CSV download.
The default admission limit is 100 pairs per Job, controlled by a backend
environment variable with no separate frontend configuration. These decisions
supersede the corresponding alternatives and open questions below. Validation,
draft retention, and lost-Submission recovery remain under discussion; no
implementation is authorized.

Round 1 update, reported by the coordinating backend agent: Users enter VH and
VL in text boxes and use Add to add a pair to a batch; CSV Upload is also supported.
Finished Jobs display `selection.csv` as a webpage table. Advanced settings expose
app-specific controls from `submit_humanization_workflow`, grouped under General
and one subsection per app. These supersede the input, controls, and archive-only
alternatives below. Implementation remains unauthorized. Shared editable-batch
behavior, pair IDs, batch-wide settings, General execution controls, table fidelity
and paging, and website batch cap remain open for the consolidated next round.

| Choice | Minimal proposal | Consequence / unresolved dependency |
| --- | --- | --- |
| Input | Native CSV Upload first | Mirrors existing workflow validation; paste-one-pair convenience is a separate choice. |
| Controls | Scientific defaults with a small named subset | Exact exposed controls and bounds must be agreed with backend; never label attempts as candidate yield. |
| Results | Existing archive download plus a bounded parent-focused sortable preview if required | Preview needs authoritative scalar types, stable identity/order, limits and ownership; archive-only avoids this extra contract. |
| Large tables | Fetch only opened Result views and bounded rows | Do not put full sequences/residue data in every polling response or render tens of thousands of rows at once. |
| Selection | Local sorting/filtering only initially | Persisted experimental selections or custom exports introduce additional product state and need explicit agreement. |
| Recovery | Existing Job lifecycle and explicit Submission recovery | CLI resume/restart are not automatically new browser retry actions. |

## Conflicts and bounded risks

1. [CONTEXT Stage Outcome](../../CONTEXT.md) omits `partial`, while generated
   `JobStageView.outcome` and `jobStageTimeline` support it. Surface this mismatch
   during domain modeling; this note does not silently change the glossary.
2. [ADR 0002](../adr/0002-resumable-remote-jobs.md),
   [ADR 0003](../adr/0003-job-data-retention.md), and sections of
   [ADR 0005](../adr/0005-live-api-mvp-frontend.md) are explicitly superseded by
   backend ADR 0007/current API. Old retention, retry, provider-stage, and
   state-unknown recovery text must not define the new service contract.
3. Job History's client walks all cursor pages before client filtering/sorting.
   The collection does not interval-poll; mounted progressing/blocked rows poll
   individually. Collection refetch cost and total memory still scale with history;
   adding scientific previews to JobView would worsen this. See [listJobs](../../src/api/client.ts)
   and [JobsPage](../../src/pages/JobsPage.tsx). This is a scaling risk, not a
   reproduced performance regression.
4. Log target fetches request the first 100 targets and the log component does not
   expose continuation. Large humanization stages may exceed that if target
   granularity is per parent/candidate. Confirm backend projection before adding
   pagination. See [API client](../../src/api/client.ts) and [JobLogs](../../src/components/JobLogs.tsx).
5. Stage task counts are present in generated types but absent from the timeline
   projection. Existing concurrent stage labels can work for MVP; a determinate
   progress display needs an explicit, honest denominator, not a guessed percent.
6. Keep humanization forms and any Result viewer in lazy modules. Reuse lifecycle
   helpers and native controls without building a generic schema-driven form engine
   or copying entire Submission implementations. No new dependency is selected.

## Coordinated interview tree

Backend agent in Herdr `w1K:p1` should issue the consolidated rounds. Frontend will
not issue competing questions. Recommendations below await answers.
The backend agent has acknowledged ownership of questioning and confirmed one
consolidated first round: CSV/paste/both Input UX, archive versus sortable website
candidate preview, and scientific control exposure. Scientific pairing, ranking,
and partial-result decisions remain settled. Current-main service verification
establishes the shared lifecycle reuse seam and the workflow-host protocol gap
described above. The adaptation does not change the first product-question round.
Frontend waits for User answers without asking parallel questions. This
coordinates the interview; it does not resolve any of its product choices.

First frontier (independent product choices):

1. Must the first website release support CSV batches, a single pasted pair, or
   both? Recommend CSV first; it preserves the existing explicit pairing contract.
2. Must users inspect/sort candidates in the website, or is archive download
   sufficient initially? Recommend a bounded scalar preview if candidate selection
   on the website is the intended workflow, with the full archive always available.
3. Which scientific controls must be exposed initially? Recommend defaults plus
   explicitly chosen controls; distinguish scientific budgets from Admin capacity.

Next frontier only after the relevant answers: API Input/validation shape and
limits; pasted-pair normalization; preview columns and null sorting; parent
navigation and paging; persistent selections/export requirements; sequence draft
retention; approved exposed controls and error remedies. Backend research must
settle service registration/coordinator facts before any question about them.

Concrete scenarios for later rounds: one generator fails but useful candidates
remain; all candidates are unranked; a generator returns the unchanged parent;
the same pair belongs to two parent IDs; login expires before Submission; response
is lost after admission; ranking is null because parental evaluation is missing.

Candidate glossary gaps to discuss only if used by the website: parental pair,
candidate, baseline, candidate set, panel order, quality tier, evaluation
completeness, and CDR preservation. Reconcile with the backend glossary rather than
inventing frontend synonyms. Only resolved terms enter CONTEXT.md; only accepted
architectural trade-offs warrant ADRs.

### Concrete checks for the next frontier

After round 2, the remaining concrete validation/recovery constraints are:

- The shared parser requires uppercase canonical residues, at most 200 per chain,
  and exactly ordered `id,vh,vl` CSV columns. It rejects the entire parse at the
  first invalid row. A forgiving import with editable invalid rows, lower-case
  normalization, or reordered headers is not already supplied by that parser.
  Any chosen normalization must occur before the immutable Submission identity is
  formed, consistently for manual and CSV Input. Method-specific compatibility
  failures must retain the already-settled scientific partial-result behavior.
- Uniqueness is checked after FASTA whitespace normalization, not just exact
  string equality; imported and manual rows must be checked together. Keep
  original valid IDs, which participate in candidate identity and seed derivation.
- A persisted intent UUID alone cannot replay a lost response after editable Input
  or settings change. Recovery needs the original exact request or a retained
  server reference associated with the same owner and key. AF3 supplies this via
  Retained Validation; that is not an existing humanization API capability.
  Choosing no retained draft must not imply that replay across reload is free.
- The backend environment-controlled cap needs authoritative exposure or safe
  rejection handling; the browser must not enforce a separately hardcoded 100.
  The scientific parser also has a 1,000-pair / 3 MiB ceiling, so raising the service
  setting cannot silently promise batches beyond those limits.

Sources: [shared parser](https://github.com/y1zhou/biomodals/blob/main/src/biomodals/app/design/hudiff_ab/validation.py),
[workflow parser reuse](https://github.com/y1zhou/biomodals/blob/main/src/biomodals/workflow/humanization/tables.py),
[AF3 recovery](../../src/pages/AlphaFold3SubmissionPage.tsx), and the service spec
linked above. These are constraints for the coordinating agent, not new questions
or changes to accepted requirements.

The following round-1 checks are retained as research history; round 2 resolves
the input-ID fields and General-control scope:

- Add-only VH/VL fields do not supply the unique `id` required by the existing
  CSV parser. Generated versus explicit IDs remains an open UX decision; row
  indexes must not silently replace imported IDs. IDs participate in candidate
  identity and seed derivation, and whitespace-normalized collisions are rejected.
  See [identifier ADR](https://github.com/y1zhou/biomodals/blob/main/docs/adr/0011-humanization-output-identifiers.md)
  and [parser](https://github.com/y1zhou/biomodals/blob/main/src/biomodals/app/design/hudiff_ab/validation.py).
- Exposing every function argument as an ordinary User setting would include
  deployment identity, coordinator hosting, wait/dry-run and successor-run controls.
  Those are distinct from the settled app-specific scientific knobs and intersect
  existing service/Admin ownership. General must not silently expose all CLI
  arguments. See [workflow entrypoint](https://github.com/y1zhou/biomodals/blob/main/src/biomodals/workflow/humanization/workflow.py)
  and [Admin decisions](../adr/0006-admin-runtime-configuration.md).
- Similar scientific labels are not interchangeable: Humatch protected positions
  use IMGT; p-AbNatiV2 protected positions use AHo; Sapiens numbering and CDR
  definition are independent. HuDiff candidate count denotes attempts. The
  p-AbNatiV2 generation pairing-decrease knob is not the shared panel-ranking
  guardrail. Keep these distinctions in the app subsections rather than combining
  them into ambiguous General controls. Sources: workflow entrypoint above and
  [scientific spec](https://github.com/y1zhou/biomodals/blob/main/docs/specs/humanization-workflow.md).
- Sorting only the visible page conflicts with presenting a globally sorted
  selection table. Whatever paging contract is chosen must define the sort scope;
  preserve authoritative rank values, numeric nulls, and all retained rows. This
  is a constraint on the already-selected table UX, not a proposal to reopen
  scientific ranking or partial-result policy.

## Documentation and verification evidence

Context7 resolved `/tanstack/query` and `/openapi-ts/openapi-typescript` before
querying their current primary sources. Query documentation supports consuming
AbortSignal and explicitly enabling background polling:
[cancellation](https://github.com/TanStack/query/blob/main/docs/framework/react/guides/query-cancellation.md),
[polling](https://github.com/TanStack/query/blob/main/docs/framework/react/guides/polling.md).
OpenAPI TypeScript produces runtime-free types and its CLI checks output freshness:
[project goals](https://github.com/openapi-ts/openapi-typescript/blob/main/docs/about.md),
[CLI](https://github.com/openapi-ts/openapi-typescript/blob/main/packages/openapi-typescript/bin/cli.js).
These are current upstream references, not proof of exact installed-version parity.

Research used source/doc inspection; no application test pass is claimed. Future
implementation should run Bun lint/tests/build, generated-schema drift checking
against an agreed offline backend fixture, and browser coverage for validation,
idempotent recovery, reauthentication, partial Results, route ownership, null
sorting and full archive download. Existing unit tests and `e2e/` supply the
patterns. No paid smoke test is authorized by this research request.
