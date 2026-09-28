import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ChevronLeft, ChevronRight, LoaderCircle, Plus, Trash2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useBeforeUnload, useBlocker, useNavigate, useSearchParams } from "react-router"
import { ApiError, apiErrorCode, apiRequestId, proteinOptimizationInputs, proteinOptimizationOptions, reviewProteinOptimization, submitProteinOptimization } from "@/api/client"
import { authenticatedPrincipal, useCurrentUser, useExpireSession } from "@/auth-state"
import ProteinOptimizationInputs, { ProteinOptimizationMode, ProteinOptimizationParents } from "@/components/ProteinOptimizationInputs"
import ProteinSequenceValue from "@/components/ProteinSequenceValue"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { addOptimizationPositions, defaultReplacementResidues, formatCandidateSpace, optimizationNumericBounds, optimizationOptionsReady, optimizationRowErrors, type OptimizationMode, type OptimizationNumericSetting, type OptimizationPosition, type OptimizationReviewRequest, type OptimizationSettings, type OptimizationSubmission } from "@/protein-optimization"
import { randomUUID } from "@/lib/uuid"
import { jobKey, jobListKey } from "@/jobs"
import { proteinOptimizationPaths } from "@/tools"

const settingLabels: Record<OptimizationNumericSetting, string> = {
  max_mutations: "Maximum total mutations",
  candidate_budget: "Candidate budget",
  max_new_mutations: "Maximum new substitutions",
  seed: "Random seed",
}

export default function ProteinOptimizationPage() {
  const [params] = useSearchParams()
  const sourceJob = params.get("source_job") ?? ""
  return <ProteinOptimizationForm key={sourceJob} sourceJob={sourceJob} />
}

type Intent = { input: OptimizationSubmission; key: string }

function ProteinOptimizationForm({ sourceJob }: { sourceJob: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const principal = authenticatedPrincipal(useCurrentUser().data)
  const options = useQuery({ queryKey: ["protein-optimization", "options"], queryFn: ({ signal }) => proteinOptimizationOptions(signal), enabled: !!principal, retry: false, staleTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false })
  const [measurements, setMeasurements] = useState("")
  const [parentalFasta, setParentalFasta] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [inputsLoaded, setInputsLoaded] = useState(!sourceJob)
  const [previousUnconfirmed, setPreviousUnconfirmed] = useState(false)
  const [mode, setMode] = useState<OptimizationMode>("combination")
  const [direction, setDirection] = useState<OptimizationSettings["direction"]>()
  const [edits, setEdits] = useState<Partial<Record<OptimizationMode, Partial<Record<OptimizationNumericSetting, string>>>>>({})
  const [positions, setPositions] = useState<readonly OptimizationPosition[] | null>(null)
  const [chainToAdd, setChainToAdd] = useState("")
  const [rangeToAdd, setRangeToAdd] = useState("")
  const [positionError, setPositionError] = useState("")
  const [reading, setReading] = useState({ measurements: false, parents: false })
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState("")
  const [rowPage, setRowPage] = useState(0)
  const controller = useRef<AbortController | null>(null)
  const intent = useRef<Intent | null>(null)
  const submitting = useRef(false)
  const mounted = useRef(true)
  const allowNavigation = useRef(false)
  const retained = useQuery({ queryKey: ["protein-optimization", "inputs", principal?.user_id, sourceJob], queryFn: ({ signal }) => proteinOptimizationInputs(sourceJob, signal), enabled: !!principal && !!sourceJob && !inputsLoaded, retry: false, staleTime: Infinity, gcTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false })
  useEffect(() => {
    if (!retained.data || inputsLoaded) return
    const input = retained.data
    if (!input.settings) return
    setMeasurements(input.measurements_csv)
    setParentalFasta(input.parental_fasta ?? "")
    setDisplayName(input.display_name)
    setMode(input.settings.mode)
    setDirection(input.settings.direction)
    setPositions(input.settings.positions ?? null)
    setEdits({ [input.settings.mode]: { max_mutations: String(input.settings.max_mutations), candidate_budget: String(input.settings.candidate_budget), max_new_mutations: String(input.settings.max_new_mutations), seed: String(input.settings.seed) } })
    setInputsLoaded(true)
  }, [retained.data, inputsLoaded])
  const mutation = useMutation({ mutationFn: ({ input, signal }: { input: OptimizationReviewRequest; signal: AbortSignal; revision: number }) => reviewProteinOptimization(input, signal), retry: false, gcTime: 0 })
  const submission = useMutation({
    mutationFn: (request: Intent) => submitProteinOptimization(request.input, request.key), retry: false, gcTime: 0,
    onSuccess(job) {
      if (!mounted.current) return
      intent.current = null
      allowNavigation.current = true
      queryClient.setQueryData(jobKey(job.job_id), job)
      void queryClient.invalidateQueries({ queryKey: jobListKey })
      navigate(proteinOptimizationPaths.job(job.job_id), { replace: true })
    },
    onError(error) {
      if (apiErrorCode(error) === "review_changed") { intent.current = null; setRevision((value) => value + 1) }
    },
    onSettled() { submitting.current = false },
  })
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; controller.current?.abort() }
  }, [])
  useExpireSession(options.error)
  useExpireSession(mutation.error)
  useExpireSession(submission.error)
  useExpireSession(retained.error)

  const dirty = !!(measurements || parentalFasta || displayName)
  const blocker = useBlocker(() => !allowNavigation.current && (dirty || reading.measurements || reading.parents || submitting.current))
  useBeforeUnload(useCallback((event) => {
    if (!allowNavigation.current && (dirty || reading.measurements || reading.parents || submitting.current)) { event.preventDefault(); event.returnValue = true }
  }, [dirty, reading]))
  useEffect(() => {
    if (blocker.state !== "blocked") return
    if (window.confirm("Leave these unsent inputs? They are kept only on this page and will be lost.")) blocker.proceed()
    else blocker.reset()
  }, [blocker])

  const knownRejection = submission.error instanceof ApiError && (
    [401, 403].includes(submission.error.status) ||
    submission.error.status === 409 && ["review_changed", "idempotency_conflict", "job_conflict", "job_deleted", "deployment_incompatible"].includes(apiErrorCode(submission.error) ?? "") ||
    submission.error.status === 422 && apiErrorCode(submission.error) === "invalid_design"
  )
  const ambiguous = !!submission.error && !knownRejection
  function editIntent() {
    if (ambiguous) setPreviousUnconfirmed(true)
    intent.current = null
    submission.reset()
  }
  function invalidate() {
    editIntent()
    controller.current?.abort()
    setRevision((current) => current + 1)
    setError("")
  }

  const compatible = !!options.data && optimizationOptionsReady(options.data)
  const defaults = options.data?.defaults?.[mode]
  const numericSettings: Partial<Record<OptimizationNumericSetting, number>> = {}
  const invalidSettings: string[] = []
  for (const name of ["max_mutations", "candidate_budget", "max_new_mutations", "seed"] as const) {
    const raw = edits[mode]?.[name] ?? String(defaults?.[name] ?? "")
    const value = Number(raw)
    const { minimum, maximum } = options.data ? optimizationNumericBounds(options.data, mode, name) : {}
    if (!raw.trim() || !Number.isSafeInteger(value) || minimum === undefined || maximum === undefined || value < minimum || value > maximum) invalidSettings.push(settingLabels[name])
    numericSettings[name] = value
  }
  const settings: OptimizationSettings | undefined = defaults ? { ...defaults, ...numericSettings, mode, direction: direction ?? defaults.direction, positions: mode === "exploration" ? positions : null } : undefined
  const sameMeasurements = mutation.variables?.input.measurements_csv === measurements
  const sameInputs = sameMeasurements && (mode === "combination" || (mutation.variables?.input.parental_fasta ?? "") === parentalFasta)
  const data = mutation.data
  const requiredChains = sameMeasurements ? data?.required_chain_ids : undefined
  const chains = mode === "exploration" && sameInputs ? data?.chains ?? [] : []
  const effectivePositions = positions ?? (sameInputs ? data?.positions ?? [] : [])
  const current = mutation.variables?.revision === revision
  const reviewed = current && data?.review_digest && data.errors.length === 0 && data.review_version === options.data?.review_version
  const pending = current && mutation.isPending
  const readPending = reading.measurements || mode === "exploration" && reading.parents
  const canSubmit = !!principal && inputsLoaded && reviewed && (mode === "combination" || !!parentalFasta.trim()) && !readPending && !pending && !submission.isPending && !ambiguous && !invalidSettings.length && [...displayName].length <= 200 && typeof options.data?.max_selected_candidates === "number"
  const rows = sameMeasurements ? data?.rows ?? [] : []
  const pages = Math.max(1, Math.ceil(rows.length / 50))
  const page = Math.min(rowPage, pages - 1)
  const rowErrors = useMemo(() => optimizationRowErrors(data?.errors ?? []), [data])

  function review() {
    if (!compatible || !options.data || !settings || !principal || !inputsLoaded || readPending || pending || submitting.current || ambiguous) return
    setError("")
    if (!measurements.trim()) { setError("Upload or enter measurements before reviewing."); return }
    if (invalidSettings.length) { setError(`Check ${invalidSettings.join(", ")}. Use whole numbers within the displayed limits.`); return }
    const encoder = new TextEncoder()
    if (encoder.encode(measurements).byteLength > options.data.max_measurements_csv_bytes! || mode === "exploration" && encoder.encode(parentalFasta).byteLength > options.data.max_parental_fasta_bytes!) {
      setError("An input exceeds its file byte limit. Reduce the input before reviewing."); return
    }
    const input: OptimizationReviewRequest = { measurements_csv: measurements, parental_fasta: mode === "exploration" && requiredChains !== undefined ? parentalFasta || null : null, settings }
    controller.current?.abort()
    controller.current = new AbortController()
    setRowPage(0)
    mutation.mutate({ input, revision, signal: controller.current.signal })
  }

  function submit(replay = false) {
    if (!principal || submitting.current || (replay ? !intent.current : !canSubmit)) return
    const input = mutation.variables?.input
    if (!intent.current && (!input || !data?.review_digest || mode === "exploration" && !input.parental_fasta)) return
    const request = intent.current ?? { key: randomUUID(), input: {
      measurements_csv: input!.measurements_csv, parental_fasta: input!.parental_fasta ?? null, settings: input!.settings,
      review_digest: data!.review_digest!, display_name: displayName,
    } }
    intent.current = request
    submitting.current = true
    submission.mutate(request)
  }

  function numberInput(name: OptimizationNumericSetting) {
    const bounds = options.data ? optimizationNumericBounds(options.data, mode, name) : { minimum: undefined, maximum: undefined }
    return <label className="block space-y-2" key={name}>
      <span className="font-medium">{settingLabels[name]}</span>
      <Input type="number" step={1} min={bounds.minimum} max={bounds.maximum} value={edits[mode]?.[name] ?? defaults?.[name] ?? ""} onChange={(event) => { invalidate(); setEdits((current) => ({ ...current, [mode]: { ...current[mode], [name]: event.target.value } })) }} />
      <span className="block text-sm text-muted-foreground">{bounds.minimum}–{bounds.maximum?.toLocaleString()}</span>
    </label>
  }

  return <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
    <header className="space-y-3">
      <h1 className="text-3xl font-semibold">Protein sequence optimization</h1>
      <p className="text-muted-foreground">Review normalized measurements and design settings before submitting an optimization Job. Only Exploration requires parental chains. Review itself does not fit a model or start scientific computation.</p>
      {sourceJob ? <p className="rounded-lg border bg-muted/30 p-3">Inputs copied from a previous Job. Review the retained measurements and settings before submitting a new Job; the original remains unchanged.</p> : null}
    </header>
    {options.isPending ? <p role="status"><LoaderCircle aria-hidden="true" className="mr-2 inline size-4 animate-spin motion-reduce:animate-none" />Loading optimization options…</p> : null}
    {options.error ? <div role="alert"><p>Options could not be loaded. {options.error.message}</p><Button type="button" variant="outline" onClick={() => void options.refetch()}>Reload options</Button></div> : null}
    {options.data && !compatible ? <p role="alert">The API does not supply compatible review options and complete limits. Update the API before reviewing inputs.</p> : null}
    {sourceJob && !inputsLoaded ? retained.error || retained.data && !retained.data.settings ? <div role="alert" className="space-y-3 rounded-xl border p-6"><h2 className="text-xl font-medium">Retained inputs could not be loaded</h2><p>{retained.error?.message ?? "The API did not return the original settings."}</p><Button type="button" variant="outline" onClick={() => void retained.refetch()}>Try again</Button><Link className="ml-4 underline" to={proteinOptimizationPaths.submission}>Start with new inputs</Link></div> : <p role="status">Loading retained inputs…</p> : null}
    {compatible && options.data && inputsLoaded ? <fieldset disabled={submission.isPending} className="space-y-6">
      <label className="block max-w-xl space-y-2"><span className="font-medium">Job name</span><Input value={displayName} placeholder="Protein optimization" maxLength={200} onChange={(event) => { editIntent(); setDisplayName(event.target.value) }} /></label>
      <ProteinOptimizationInputs measurements={measurements} maxMeasurementBytes={options.data.max_measurements_csv_bytes!}
        disabled={submission.isPending} onMeasurementsChange={(text) => { invalidate(); setMeasurements(text) }}
        onReadingChange={(active) => { if (active) invalidate(); setReading((current) => ({ ...current, measurements: active })) }} />
      <Card><CardHeader><CardTitle><h2>2. Design settings</h2></CardTitle></CardHeader><CardContent className="space-y-6 text-base">
        <ProteinOptimizationMode exploration={mode === "exploration"} onChange={(exploration) => { invalidate(); setMode(exploration ? "exploration" : "combination"); setReading((current) => ({ ...current, parents: false })); setPositionError("") }} />
        {mode === "exploration" ? <ProteinOptimizationParents parentalFasta={parentalFasta} requiredChains={requiredChains} maxFastaBytes={options.data.max_parental_fasta_bytes!}
          disabled={submission.isPending} discoveryAction={requiredChains === undefined ? <Button type="button" disabled={!principal || readPending || pending || ambiguous} onClick={review}>{pending ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : null}{pending ? "Discovering chains…" : "Discover chains"}</Button> : null}
          onParentalFastaChange={(text) => { invalidate(); setParentalFasta(text) }}
          onReadingChange={(active) => { if (active) invalidate(); setReading((current) => ({ ...current, parents: active })) }} /> : null}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2"><label htmlFor="optimization-direction" className="block font-medium">Improvement direction</label><select id="optimization-direction" className="h-9 w-full rounded-lg border bg-background px-2" value={settings?.direction} onChange={(event) => { invalidate(); setDirection(event.target.value === "minimize" ? "minimize" : "maximize") }}><option value="maximize">Higher label is better</option><option value="minimize">Lower label is better</option></select></div>
          {numberInput("max_mutations")}{numberInput("candidate_budget")}
        </div>
        <p className="text-muted-foreground">Maximum mutations is the total number of substitutions across all chain IDs. {mode === "combination" ? "Combination uses only observed substitutions, including measured C/M replacements. It can score many additive combinations cheaply, but enumeration and CSV size still impose limits." : "The evaluation budget limits sampled Exploration candidates. It is not a runtime or cost estimate."}</p>
        {mode === "exploration" ? <details className="rounded-lg border p-4"><summary className="cursor-pointer font-medium">Advanced Exploration settings</summary><div className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">{numberInput("max_new_mutations")}{numberInput("seed")}</div>
          <h3 className="text-lg font-medium">Per-position replacements</h3>
          <p className="text-muted-foreground">Start with measured positions and 18 replacements excluding C/M. Edit each allowed set or clear it to freeze a position. You can add positions in supplied chains. Leaving a residue unchanged is always permitted; C/M in parental sequences or training measurements is not removed.</p>
          <p className="text-muted-foreground">{positions === null ? "Using measured positions from input review." : "Using your explicit position list."} Positions are one-based coordinates in the full parental sequence.</p>
          <Button type="button" variant="outline" onClick={() => { invalidate(); setPositions(null); setPositionError("") }}>Use measured positions</Button>
          {effectivePositions.length ? <div className="max-h-96 overflow-auto rounded-lg border"><table className="w-full text-left"><thead><tr><th className="p-2">Chain</th><th className="p-2">Position</th><th className="p-2">Allowed replacements</th><th><span className="sr-only">Remove</span></th></tr></thead><tbody>{effectivePositions.map((site, index) => <tr key={`${site.chain_id}:${site.position}`} className="border-t"><td className="p-2">{site.chain_id}</td><td className="p-2">{site.position}</td><td className="p-2"><Input aria-label={`Allowed replacements ${site.chain_id}:${site.position}`} className="min-w-56 font-mono" value={site.amino_acids ?? ""} onChange={(event) => { invalidate(); setPositions(effectivePositions.map((entry, i) => i === index ? { ...entry, amino_acids: event.target.value } : entry)) }} /></td><td className="p-2"><Button type="button" variant="ghost" aria-label={`Remove position ${site.chain_id}:${site.position}`} onClick={() => { invalidate(); setPositions(effectivePositions.filter((_, i) => i !== index)) }}><Trash2 aria-hidden="true" /></Button></td></tr>)}</tbody></table></div> : <p className="text-muted-foreground">Review complete measurements and parental FASTA to load default positions.</p>}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2"><label htmlFor="optimization-add-chain" className="block">Chain to extend</label><select id="optimization-add-chain" className="h-9 rounded-lg border bg-background px-2" value={chainToAdd} onChange={(event) => setChainToAdd(event.target.value)}><option value="">Choose a chain</option>{chains.map((chain) => <option key={chain.chain_id} value={chain.chain_id}>{chain.chain_id}</option>)}</select></div>
            <label className="space-y-2"><span className="block">Position or range</span><Input placeholder="5 or 5-12" value={rangeToAdd} onChange={(event) => setRangeToAdd(event.target.value)} /></label>
            <Button type="button" variant="outline" disabled={!chainToAdd || !rangeToAdd} onClick={() => {
              try {
                const chain = chains.find((entry) => entry.chain_id === chainToAdd)
                if (!chain) throw new Error("Review parental inputs before adding positions.")
                const next = addOptimizationPositions(effectivePositions, chain.chain_id, rangeToAdd, chain.sequence.length, options.data!.max_design_positions!, defaultReplacementResidues(options.data!)!)
                invalidate(); setPositions(next); setRangeToAdd(""); setPositionError("")
              } catch (error) { setPositionError(error instanceof Error ? error.message : "Could not add positions.") }
            }}><Plus aria-hidden="true" />Add positions</Button>
          </div>
          {positionError ? <p role="alert" className="text-destructive">{positionError}</p> : null}
        </div></details> : null}
      </CardContent></Card>
      <div className="space-y-3">
        {mode === "combination" || requiredChains !== undefined ? <Button type="button" disabled={!principal || readPending || pending || ambiguous} onClick={review}>{pending ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : null}{pending ? "Reviewing inputs…" : "Review inputs"}</Button> : null}
        {error ? <p role="alert" className="text-destructive">{error}</p> : null}
        {current && mutation.error ? <p role="alert" className="text-destructive">Review failed. {mutation.error.message} Your inputs are unchanged; retry explicitly.{apiRequestId(mutation.error) ? ` Support ID: ${apiRequestId(mutation.error)}.` : ""}</p> : null}
        {data && !current ? <p role="status">Inputs or settings changed. Review again before submission.</p> : null}
        {current && data?.review_version !== undefined && data.review_version !== options.data.review_version ? <p role="alert">The review policy changed. Reload options and review again.</p> : null}
        {reviewed ? <p role="status" className="rounded-lg border p-3">Inputs reviewed. Submit explicitly to start scientific computation.</p> : null}
        <div className="flex flex-wrap gap-3"><Button type="button" disabled={!canSubmit} onClick={() => submit()}>{submission.isPending ? "Submitting optimization…" : "Submit optimization"}</Button>{ambiguous && intent.current ? <Button type="button" variant="outline" disabled={!principal || submission.isPending} onClick={() => submit(true)}>Check submission</Button> : null}</div>
        {submission.error ? <p role="alert" className="text-destructive">{apiErrorCode(submission.error) === "review_changed" ? "The reviewed inputs or policy changed. Review again before submitting." : ambiguous ? "Submission could not be confirmed. Check submission reuses the original request and key; it never starts replacement work automatically." : `Submission was rejected. ${submission.error.message} Your inputs are preserved.`}</p> : null}
        {previousUnconfirmed ? <p role="alert">An earlier submission was not confirmed before you edited the form. Check My Jobs before submitting another Job.</p> : null}
        {typeof options.data.max_selected_candidates !== "number" ? <p role="alert">The full optimization API is unavailable. Update the API and reload options before submitting.</p> : null}
      </div>
      {data && current ? <section aria-labelledby="optimization-review-heading" className="space-y-4">
        <h2 id="optimization-review-heading" className="text-2xl font-medium">Input review</h2>
        {data.errors.length ? <p role="alert">Correct {data.errors.length} input issue{data.errors.length === 1 ? "" : "s"} in the text above and review again. No invalid row is silently dropped.</p> : null}
        {data.errors.filter((issue) => issue.row_index === null).map((issue, index) => <p key={index} className="text-destructive">{issue.field}: {issue.message}</p>)}
        {data.warnings?.map((warning) => <p key={warning} className="rounded-lg bg-muted p-3">{warning}</p>)}
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {data.unique_variant_count !== null && data.unique_variant_count !== undefined ? <div><dt>Unique measured variants</dt><dd>{data.unique_variant_count.toLocaleString()}</dd></div> : null}
          {data.replicate_rows !== null && data.replicate_rows !== undefined ? <div><dt>Additional replicate rows</dt><dd>{data.replicate_rows.toLocaleString()}</dd></div> : null}
          {data.candidate_space_size !== null && data.candidate_space_size !== undefined ? <div><dt>Novel candidate space</dt><dd className="break-all tabular-nums">{formatCandidateSpace(data.candidate_space_size)}</dd></div> : null}
          {data.evaluation_count !== null && data.evaluation_count !== undefined && Number.isSafeInteger(data.evaluation_count) ? <div><dt>Candidate evaluations</dt><dd>{data.evaluation_count.toLocaleString()}</dd></div> : null}
        </dl>
        <p className="text-muted-foreground">Replicate labels are averaged on the supplied scale. Usable measured variants train the model. The unchanged parent and already measured variants are excluded from candidate results. The review does not fit or validate prediction accuracy.</p>
        {data.chains.map((chain) => <ProteinSequenceValue key={chain.chain_id} chainId={chain.chain_id} sequence={chain.sequence} />)}
      </section> : null}
      {rows.length ? <section aria-label="Measurement rows" className="space-y-3">
        <h2 className="text-xl font-medium">Measurement rows</h2>
        <div className="overflow-x-auto rounded-lg border"><table className="w-full text-left"><thead><tr>{["Row", "ID", "Mutations", "Label", "Issues from last review"].map((name) => <th className="p-2" key={name}>{name}</th>)}</tr></thead><tbody>{rows.slice(page * 50, (page + 1) * 50).map((row) => <tr key={row.row_index} className={rowErrors.has(row.row_index) ? "border-t bg-destructive/5" : "border-t"}><td className="p-2">{row.row_index + 1}</td><td className="p-2">{row.id}</td><td className="max-w-lg break-words p-2 font-mono text-sm">{row.mutations || "Parent"}</td><td className="p-2">{row.label}</td><td className="p-2 text-destructive">{rowErrors.get(row.row_index)?.join("; ")}</td></tr>)}</tbody></table></div>
        <div className="flex items-center gap-3"><Button type="button" variant="outline" aria-label="Previous measurement page" disabled={page === 0} onClick={() => setRowPage(page - 1)}><ChevronLeft aria-hidden="true" /></Button><span>Page {page + 1} of {pages} · {rows.length} measurement rows</span><Button type="button" variant="outline" aria-label="Next measurement page" disabled={page + 1 === pages} onClick={() => setRowPage(page + 1)}><ChevronRight aria-hidden="true" /></Button></div>
      </section> : null}
    </fieldset> : null}
  </main>
}
