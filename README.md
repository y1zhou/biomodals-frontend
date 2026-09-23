# BioModals frontend

Static React frontend for the BioModals web tools catalog. It works with the
[BioModals backend](https://github.com/y1zhou/biomodals). This repository owns
the browser application only; FastAPI and Caddy are deployed separately.

## Development

Requires [Bun](https://bun.sh/).

```sh
bun install
cp .env.example .env
bun dev
```

The Vite development server keeps its default port `5173` and listens on
`0.0.0.0` so the MVP can be opened from another machine on the development
network.

`BIOMODALS_PUBLIC_URL` accepts comma-separated public URLs, such as
`https://biomodals.example.com,192.168.1.10:5173`. Bare hostnames/IPs use HTTP.
Vite allows the configured hostnames and forwards the first URL's Origin
to FastAPI. `BIOMODALS_API_PROXY_TARGET` sets the server-only API
upstream, which defaults to `http://127.0.0.1:4144`.

Vite proxies `/api/*`, `/docs`, `/redoc`, and `/openapi.json`. Do not expose
this development server to an untrusted network. Use the same public URL
list in the backend's configured `.env` file. Any HTTP origin requires the
backend's `BIOMODALS_SECURE_COOKIES=false` setting. Admin Users displays one Password
Link per configured origin; choose the URL the recipient can reach. All choices
share a single-use token, so consuming one invalidates the others.

## Production deployment

Build the static site reproducibly from the committed lockfile:

```sh
bun ci
bun run lint
bun test
bun run api:check
bun run build
```

Before publishing, run the manually dispatched `Cross-repository checks`
workflow with the full 40-character frontend and backend candidate commit
hashes.

The workflow verifies generated OpenAPI types and the browser workflow against
that immutable pair without contacting Modal.

Publish the contents of `dist/` at `/srv/biomodals.example.com`. We recommend
[Caddy](https://caddyserver.com/) for the static server, automatic HTTPS, and
the same-origin API proxy. A minimal Caddyfile shape is:

```caddyfile
biomodals.example.com {
	encode zstd gzip
	root * /srv/biomodals.example.com

	@backend path /api/* /docs* /openapi.json /redoc*
	handle @backend {
		reverse_proxy 127.0.0.1:4100
	}
	handle /assets/* {
		header Cache-Control "public, max-age=31536000, immutable"
		file_server
	}
	handle {
		route {
			try_files {path} /index.html
			header /index.html Cache-Control "no-cache"
			file_server
		}
	}
}
```

The separate `handle` blocks keep API requests and hashed assets out of the
SPA fallback. Inside the fallback, `route` applies the HTML cache header after
rewriting. Browser requests use relative `/api` URLs, so the build contains no
production API hostname. Direct visits to `/login` and `/set-password` must
serve `index.html`; these React routes are not separate files in `dist/`.

Caddy configuration remains host-owned; this example does not modify the live
Caddyfile. Review the [production checklist](docs/deployment/production.md)
before publishing a release.

The backend repository contains the corresponding
[API deployment examples](https://github.com/y1zhou/biomodals/tree/main/deploy).

## Commands

```sh
bun dev          # start Vite
bun run lint     # run Oxlint
bun run test     # run Bun unit tests
bun run test:e2e # run the Playwright browser tests
bun run build    # typecheck and build dist/
bun run api:generate # regenerate types from the live local OpenAPI document
bun run api:check    # fail when generated API types are stale
bun run preview  # preview dist/ locally
```

## Current state

The available Tools are `GROMACS MD simulation`, `AlphaFold3 structure
prediction`, `Antibody humanization`, and `Antibody sequence analysis`.
AlphaFold3 accepts a guided protein, DNA, RNA, and
small-molecule entity builder or a native expert JSON document. Both paths
validate on the server and present the same confirmation view before creating
a Job.

Antibody humanization accepts an editable ID/VH/VL batch through manual entry
or CSV import, with one set of scientific settings for the batch. The editor
renders 50 pairs per page while retaining every imported row and validating the
whole batch, including duplicate IDs across pages. The backend
supplies defaults, the pair limit, and chain length limits (currently VH 142
and VL 126 residues). Oversized sequences remain editable and block submission;
the form never trims domains or treats length as proof of valid numbering.
“Rerun with same inputs” retrieves an authorized original request into an
editable memory-only draft. It preserves historical settings, including differing
model seeds or CDR controls until the shared control is edited. Only explicit
submission creates a new job and idempotency intent under the current workflow.
General CDR mutation and root-seed
controls apply to supported models; p-AbNatiV2 offers independent optimization
attempts, and Sapiens contributes each iteration before deduplication. New
submissions stay disabled until the service advertises these settings.
Drafts remain in memory; explicit Check
submission replays the unchanged request and idempotency key after a lost
response. Finished Jobs show bounded server-filtered, server-sorted candidate
pages with column visibility controls and page navigation. Whole-result metadata
keeps error and incomplete-evaluation columns visible when needed, including
when the affected row is on another page. Parent rows are shaded; bounded
scores include parental delta bars beneath them. Nativeness bars use a
0–1 scale based on each full column’s minimum and maximum, with parental
deltas using that same range;
displayed numbers use up to three decimal places, with scientific notation for
nonzero magnitudes below 0.001 or at least 1,000,000. Hover values, server-side
sorting, and the archive retain full precision. The complete CSV
is included in the result archive download. The table never fetches the
whole CSV to sort it in the browser.

New schema-6 humanization publications put `vh` and `vl` together, followed by
`vh_pI`, `vl_pI`, `vh_vl_pI`, `vh_v_gene`, `vh_j_gene`, `vl_v_gene` and
`vl_j_gene` in the native CSV and table. The three pIs describe the supplied
candidate chains and their literal VH+VL concatenation without a linker;
they are not germline pIs.
Gene details include page-bounded species, allele ties and therapeutic
reference frequencies. Historical webpages also display adjacent chains and
`_pI` labels, while sorting uses their original raw keys. Historical CSVs and
archives stay unchanged; missing pI/gene columns are not backfilled.
Clicking a sequence opens a numbered dialog with
IMGT, Kabat, Chothia, Martin or AHo conventions, CDR backgrounds and potential
liability motifs. Copy sequence includes the full input; clicking outside or
pressing Escape dismisses the dialog. These display choices do not alter
workflow mutation scores. Humanization inspection lazily reads retained inputs
once per mounted Job view, matching the exact parent ID and chain role. Its
parental comparison is computed by the analysis API; missing retained input
leaves ordinary numbering, germline details and full-sequence copy available.
Independent VH/VL selections survive pages and filters. **Analyze selected
sequences** forms combinations within each parent; a parent with one selected
role contributes standalone chains. The entry limit is checked before expansion,
and no original ranks or paired scores accompany recombined entries.

Antibody sequence analysis accepts one or two independent FASTA groups: paired
`VH:VL` records, matched `_vh`/`_vl` records, or standalone domains. The service
advertises limits of 1000 entries per group, 512 residues per chain and 4 MiB
per request. Analysis creates no Job or Modal work. Invalid entries stay visible
alongside usable results; failed numbering leaves computable metrics labeled as
unassigned rather than assuming a heavy chain. Tables share column visibility,
sort independently at full precision, and page locally in groups of 50. Each
group has a full-precision CSV download and **Download selected pairs** for
FASTA export. Row selections survive sorting and paging independently per
group, then reset when new analysis results arrive. Selected FASTA follows the
original input order, using `VH:VL` for pairs and the supplied sequence for
standalone chains. Entries without a usable sequence remain visible but cannot
be selected for export.

**Load example sequences** replaces only Group 1 with the supplied pembrolizumab
and OKT3 pairs plus standalone Ozoralizumab. It preserves Group 2 and waits for
**Analyze sequences**. Sequences are kept exactly as supplied; OKT3's light-chain
partial-domain diagnostic remains visible. Editing the input cancels any pending
automatic analysis of transferred chains. After an explicit analysis succeeds,
the results heading receives focus and scrolls into view, respecting reduced
motion. Sorting, paging and sequence inspection do not repeat this navigation;
request errors remain at the form.

Analysis version 5 reports pI, molecular weight and mean residue hydrophobicity
on Biopython's **BlackMould** scale (the API key remains `gravy`). Extinction
metrics are no longer included. Metrics and liability checks use the full
supplied sequence, including tags and tails; numbering and germline assignment
describe the detected variable domain. Odd cysteine counting includes every
supplied residue, but annotated IMGT 23/104 conserved cysteines are not marked.
No conserved positions are guessed when numbering fails. N-terminal glutamine
and hydrophobic-patch liability flags are omitted. Issues are input/annotation
diagnostics, not quality scores. A shared FAQ records the therapeutic
snapshot and its counting policy; unavailable frequencies remain missing.
VH/VL germline pI uses each chain's full representative V and J reference
sequences, including locally unaligned ends, joined without D or a linker.
The first native hit for each segment supplies both this estimate and the
dialog's local alignment; all tied assignments remain in gene details. Local
analysis tables display two decimals while sorting and CSV retain full
precision. Presentation CSV downloads prefix an apostrophe to text starting
with `=`, `+`, `-` or `@`, including after whitespace/control characters, before
CSV quote escaping. Numeric values, internal IDs, FASTA and canonical
humanization CSVs remain unchanged. Standalone inspection presents native
Germline and bold Input rows, separated by a compact, unlabeled difference
strip, with combined V/J reference
identities. Humanization shows
Germline (humanized), bold Humanized, Parental and Germline (parental), with
both sequences' independently assigned V/J species and genes above. Three
compact, unlabeled, accessibly described difference strips compare Humanized
to its germline, Humanized to Parental, and Parental to its own germline. If parental
numbering fails, the original sequence comparison remains usable and its
germline is marked unavailable. The API supplies the common axis and original
input indices; independent reference-only gaps stay separate. Unmatched
germline junctions and uncovered ends have blank diffs without asserting a
match or deletion. The full supplied sequence, including tails, appears once,
with CDR/liability overlays and numbering or tail identity on hover/focus.
Alignment headers retain the displayed representative's gene/species identities
without tie-count annotations; no browser alignment or germline reconstruction
is performed.

The updated interface requires analysis API version 5 before requesting
metrics or sequence annotations, avoiding mislabeled older-scale results.

Analysis drafts, results and chain handoff exist only in memory. They survive
mounted same-user reauthentication, but leaving or reloading loses them. Inputs
never travel in URLs, browser history or persistent browser storage. The
[accepted sequence-analysis specification](https://github.com/y1zhou/biomodals/blob/main/docs/specs/antibody-sequence-analysis.md)
owns scientific semantics and API behavior. Rollout requires the matching API,
frontend assets and updated humanization workflow deployment/pin for new pI/gene
publications; historical results are not backfilled.

Nanobody humanization is a separate Tool at `/tools/nanobody-humanization`.
Manual ID/VH input and `id,vhh` CSV imports append to one editable, memory-only
batch; service options supply the batch, construct and file limits. Preparation
shows originals beside prepared parental sequences, retaining valid previews
when other rows need correction. Input edits invalidate the entire reviewed
preview and abort pending preparation; settings edits do not change the prepared
sequence. Only explicit Submit starts a scientific Job. Check submission reuses
the exact original request and idempotency key after an uncertain response.
A changed preparation digest requires fresh preparation and review. Rerun with
same inputs loads editable originals and settings, then requires preparation;
it never submits automatically.

AbNatiV2 enhanced search remains the default: one best-effort endpoint, possibly
unchanged. **Explore more candidates** evaluates all allowed nonparent
combinations when they fit the per-parent budget, otherwise a reproducible
sample balanced across mutation counts. All passing designs join HuDiff
candidates for shared ranking; the budget limits evaluations, not retained
outputs, and does not guarantee more passing designs or a runtime/cost.
Service options supply the default and measured per-parent and whole-job
limits (currently 1,000 by default, up to 5,000 per parent and 10,000 per job).
The form shows the requested parent-count-times-budget allowance;
over-budget requests require an explicit edit, never silent scaling.
Root seed controls exploration sampling without changing HuDiff behavior.

Solvent-exposure screening starts on. Turning it off sends a zero threshold
while preserving the edited positive value in the mounted form; turning it
back on restores that value. An old zero-threshold rerun starts off and uses
the positive service default as its dormant threshold. Screening is the only
reason to predict the parent structure; unused candidate structure reports
are omitted in either mode. VHH-loss tolerance is per-step in enhanced mode
and relative to the original prepared parent in exploration. Settings edits
create a new submission intent while keeping the reviewed sequence preparation.
An `exploration_budget_exceeded` rejection preserves that review for an explicit
budget/batch correction. `deployment_incompatible` preserves it while an
administrator updates the workflow; neither becomes an ambiguous submission.
Older service options block submission until the matching API is available.

Both generators are concurrently eligible within the shared scheduler. Capacity
and the existing dispatch order determine their start times; method interleaving
or simultaneous progress is not guaranteed. Local analysis, inspection and
preparation retain inputs after a `local_analysis_busy` response and require an
explicit retry; the browser does not automatically repeat these operations.
The same coded response during job submission is a known rejection before
admission: the reviewed batch stays ready for explicit Submit, rather than
showing the uncertain-submission recovery action.

Nanobody Results use bounded server-side sorting, filtering and paging, native
CSV and archive downloads, and the shared Job lifecycle and recovery actions.
Tables with more than 100 pages use an explicit page-number jump instead of
allocating a dropdown option for every page; smaller tables retain the dropdown.
The single VH table uses VH2/VHH2 scores and the saved prepared parent as its
comparison baseline, including in sequence inspection. It never re-imputes
historical inputs. Selected VH sequences survive table navigation and transfer
to local analysis as standalone FASTA entries, without inherited ranks or
parent comparisons; the analysis limit blocks oversized transfers without
truncation. Missing scores remain visible as missing, and nativeness bars are
scaled within the Job while displayed numbers retain their raw units.
Nanobody transfers initially hide VL columns in local analysis; Columns can
re-enable them and CSV retains all fields. Unless the user chose a column set,
an edited analysis containing light chains restores those columns. Nanobody
result and transferred-analysis dialogs outline each IMGT hallmark (42, 49,
50, 52) in gray across the full alignment stack. Native full-input indices
keep the outlines on the same biological residues in all five display schemes;
the browser does not translate numbering labels or infer missing positions.
When full-result `nonparent_count` is zero, the page states that no new designs
were produced. This notice uses job-wide metadata, never the current page or
parent filter; prepared parental references and downloads remain available.
The [nanobody specification](https://github.com/y1zhou/biomodals/blob/main/docs/specs/nanobody-humanization.md)
owns preparation, protection, ranking and model policies. Rollout requires the
matching API/frontend and a deployed, pinned nanobody workflow before restarting
the API, whose startup checks cover every registered Tool. Offline verification
uses native local preparation/annotation and deterministic fake remote science;
it does not verify generator GPU inference or image installation.

Ranking v2 adds the arithmetic mean of `humatch_vh_best_family_probability`
and `humatch_vl_best_family_probability` as a fifth Pareto objective to
maximize. The backend derives this mean during ranking; no extra model call,
selection column, or frontend calculation is introduced. Score tie-break order
is p-AbNatiV2 pair nativeness, p-AbNatiV2 pairing, Humatch pairing, then the
Humatch best-family mean, followed by fewer edits and candidate ID. Pairing
guardrails still apply only to the two pairing scores. Stored v1 results retain
their original ranks; v2 requires a run using the updated workflow, not a page
refresh. This frontend change does not deploy that workflow. See the
[accepted service specification](https://github.com/y1zhou/biomodals/blob/main/docs/specs/humanization-service.md).

The implemented path includes administrator-provisioned accounts, protected
idempotent Submission, durable Job detail, active-only polling, cancellation,
per-stage Job Logs, My Jobs filtering, and direct Result downloads. AlphaFold3
drafts remain in the browser while validated documents are retained briefly by
the backend and never stored in the service database.

When available on a failed Job, **Retry fetching results** prepares its
existing scientific outputs again in the same Job. It does not rerun models or
submit a new Job. The page shows preparation progress; use **Refresh** to check
before the next automatic update. Eligibility and recovery behavior follow the
[shared service specification](https://github.com/y1zhou/biomodals/blob/main/docs/specs/api-tool-service.md#explicit-preparation-retry).
AlphaFold3 preview errors show the service error code and detail. **Retry
preview** is offered for transient read or cache failures; fixed size limits
and invalid source data need the underlying issue resolved first.

Failed or cancelled AlphaFold3 Jobs offer **Rerun with same inputs**. This
copies only the original JSON into an isolated editable Expert form, preserving
its name, model seeds, and other fields. Settings outside the JSON use current
form defaults and may differ from the original run. Review and submit
explicitly to create a new Job; opening the
form does not submit or recover an earlier Submission. Completed AlphaFold3
Jobs offer **Download all results** for the full archive. Humanization candidate
tables appear before Execution stages.

Use **Edit JSON** to change a loaded document, then **Apply JSON changes** to
check its syntax and update the summary. Typing does not parse the full file.
Unapplied edits must be applied or discarded before continuing. File replacement
remains available after applying or discarding edits. Rerun validation, Clear,
and submission leave unrelated browser drafts and recovery references intact.

Completed GROMACS Jobs show a **Trajectory overview** before Execution stages:
the existing production RMSD, radius-of-gyration, and RMSF PNG figures. The
browser fetches only these images, restoring the Result cache once if needed;
it does not download the full archive or recompute the plots. An unavailable
plot leaves the other figures usable.

Use **Extend simulation** on a completed GROMACS Job to check whether its
native restart state is available. An eligible source opens a new continuation
form with an editable name and additional duration. CPU/GPU mode defaults to
the source's mode and can be changed. Fresh simulations and additional
segments each accept whole durations of 1–250 ns; cumulative history may
exceed 250 ns.

The read-only source check runs on Modal and returns small availability
metadata, without downloading source file contents to the API. It shows
progress and can take up to 45 seconds. If it times out, **Check again**
repeats only that check; it never submits a simulation.

Submitting creates a new linked Job and preserves the source. Only after
submission does Modal copy the required files into the child directory,
validate them, and continue production with native append. The archive and
plots cover the full cumulative production history, keeping the original
RMSD reference and recalculating RMSF over the full history. Completed
continuations can themselves be continued, and a source can have multiple
children.
**Check submission** reuses an unconfirmed request's key and exact settings;
opening the form never submits work. Continuation recovery is isolated from
fresh GROMACS submissions. Availability and scientific behavior follow the
[continuation specification](https://github.com/y1zhou/biomodals/blob/main/docs/specs/gromacs-continuation.md).

Administrators can manage Users, active-Job admission limits, the effective
Modal Environment, exact Tool deployment versions, Job-log access, unknown
remote states, the local Result cache, and optional Modal billing reports.
Per-Job provider-call ceilings are derived from each Tool's active-Job limit,
not the Global limit. For a positive Tool limit `N`, the updated backend admits
humanization jobs with up to `5N` concurrent GPU calls and `8N` total calls;
other Tools retain `N` GPU calls and `8N` total calls. These are per-Job bounds,
not a shared per-Tool pool. Zero pauses admission. Existing Jobs retain their
saved limits; the new humanization multiplier requires the updated API process.
Deployed Modal App names remain backend startup configuration. API types in
`src/api/schema.d.ts` come from the live FastAPI OpenAPI document.

To add another Tool, add its metadata to `src/tools.ts` and introduce a
lazy-loaded internal route module. Keep Tool cards as real links and prefer
native browser controls for simple interactions such as file selection.

## Project documentation

- `AGENTS.md` contains repository workflow and implementation conventions.
- `CONTEXT.md` defines the canonical BioModals domain language.
- `docs/adr/` records the frontend boundary, resumable Job model, retention
  policy, and account/session decisions.
- `docs/agents/` configures the issue tracker, triage vocabulary, and domain-doc
  layout used by engineering skills.

Vite's preview server is for local verification, not production hosting.

The primary navigation links power users to FastAPI's `/docs` interface, so a
production deployment must proxy `/docs*` to the backend. `/redoc*` and
`/openapi.json` are useful companion routes for API consumers.
`BIOMODALS_API_PROXY_TARGET` only configures Vite's local development proxy.
