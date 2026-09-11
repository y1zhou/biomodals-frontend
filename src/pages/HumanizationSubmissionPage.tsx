import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, ChevronLeft, ChevronRight, LoaderCircle, Plus, Trash2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { Link, useBeforeUnload, useBlocker, useNavigate, useSearchParams } from "react-router"

import { ApiError, apiErrorCode, apiRequestId, humanizationOptions, humanizationInputs, submitHumanizationJob, SERVICE_CONFIGURATION_ERROR_MESSAGE } from "@/api/client"
import { authenticatedPrincipal, useCurrentUser, useExpireSession } from "@/auth-state"
import FileDropZone from "@/components/FileDropZone"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { nextPairId, normalizeSequence, pairErrors, parsePairCsv, settingMetadata, settingGroups, settingLabels, generalSettingSources, settingHelp, type HumanizationInputError, type HumanizationPair, type HumanizationSettings, type HumanizationSubmission } from "@/humanization"
import { jobKey, jobListKey, shouldRetryJobQuery } from "@/jobs"
import { humanizationPaths } from "@/tools"

type BatchRow = HumanizationPair & { key: string }
type Intent = { input: HumanizationSubmission; key: string }
const textareaClass = "min-h-20 w-full rounded-lg border border-input bg-background p-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive"
const selectClass = "h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
const batchPageSize = 50

function inputErrors(error: unknown): HumanizationInputError[] {
  if (!(error instanceof ApiError) || apiErrorCode(error) !== "humanization_input_invalid") return []
  const body = error.body as { errors?: HumanizationInputError[] }
  return Array.isArray(body.errors) ? body.errors : []
}

function errorMessage(error: unknown) {
  if (!error) return null
  const code = apiErrorCode(error)
  if (code === "origin_not_allowed") return SERVICE_CONFIGURATION_ERROR_MESSAGE
  if (error instanceof ApiError && (error.status === 401 || code === "csrf_invalid")) return "Sign in again, then retry your action. Your batch stays on this page."
  if (code === "active_job_limit_reached") return "An active-job limit has been reached. Wait for capacity, then retry."
  if (code === "humanization_input_invalid") return (error as ApiError).message
  if (code === "idempotency_conflict") return "This submission key belongs to different input. Check My Jobs before creating another submission."
  return `The request could not be confirmed. You can retry explicitly.${apiRequestId(error) ? ` Support ID: ${apiRequestId(error)}.` : ""}`
}

export default function HumanizationSubmissionPage() {
  const [searchParams] = useSearchParams()
  const sourceJob = searchParams.get("source_job") || ""
  return <HumanizationSubmissionForm key={sourceJob} sourceJob={sourceJob} />
}

function HumanizationSubmissionForm({ sourceJob }: { sourceJob: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useCurrentUser()
  const principal = authenticatedPrincipal(user.data)
  const options = useQuery({
    queryKey: ["humanization", "options"], queryFn: ({ signal }) => humanizationOptions(signal),
    enabled: Boolean(principal), retry: shouldRetryJobQuery,
  })
  useExpireSession(options.error)
  const [pairs, setPairs] = useState<BatchRow[]>([])
  const [batchPage, setBatchPage] = useState(0)
  const batchPageCount = Math.max(1, Math.ceil(pairs.length / batchPageSize))
  const currentBatchPage = Math.min(batchPage, batchPageCount - 1)
  const batchOffset = currentBatchPage * batchPageSize
  const [entry, setEntry] = useState<HumanizationPair>({ id: "ab_001", vh: "", vl: "" })
  const [displayName, setDisplayName] = useState("")
  const [settingsEdits, setSettingsEdits] = useState<Record<string, string | boolean>>({})
  const [importError, setImportError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [previousUnconfirmed, setPreviousUnconfirmed] = useState(false)
  const [inputsLoaded, setInputsLoaded] = useState(!sourceJob)
  const sourceInputs = useQuery({
    queryKey: ["humanization", "inputs", sourceJob],
    queryFn: ({ signal }) => humanizationInputs(sourceJob, signal),
    enabled: Boolean(principal && sourceJob && !inputsLoaded),
    retry: shouldRetryJobQuery, staleTime: Infinity, gcTime: 0,
    refetchOnWindowFocus: false, refetchOnReconnect: false,
  })
  useExpireSession(sourceInputs.error)
  useEffect(() => {
    const input = sourceInputs.data
    if (!input || inputsLoaded) return
    setPairs(input.pairs.map((pair) => ({ ...pair, key: crypto.randomUUID() })))
    setEntry({ id: nextPairId(input.pairs), vh: "", vl: "" })
    setDisplayName(input.display_name ?? "")
    setSettingsEdits(Object.fromEntries(Object.entries(input.settings ?? {}).filter(([, value]) => value !== undefined).map(([name, value]) => [name, typeof value === "boolean" ? value : String(value)])))
    setInputsLoaded(true)
  }, [sourceInputs.data, inputsLoaded])
  const intent = useRef<Intent | null>(null)
  const inFlight = useRef(false)
  const mounted = useRef(true)
  const allowNavigation = useRef(false)
  const importVersion = useRef(0)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const mutation = useMutation({
    mutationFn: (submission: Intent) => submitHumanizationJob(submission.input, submission.key),
    retry: false,
    onSuccess(job) {
      if (!mounted.current) return
      intent.current = null
      allowNavigation.current = true
      queryClient.setQueryData(jobKey(job.job_id), job)
      void queryClient.invalidateQueries({ queryKey: jobListKey })
      navigate(humanizationPaths.job(job.job_id), { replace: true })
    },
    onSettled() { inFlight.current = false },
  })
  useExpireSession(mutation.error)
  const apiErrors = inputErrors(mutation.error)
  const localErrors = useMemo(() => pairErrors(pairs, options.data), [pairs, options.data])
  const firstInvalidRow = localErrors.findIndex((errors, index) => Object.keys(errors).length || apiErrors.some((error) => error.row_index === index))
  const dirty = Boolean(pairs.length || entry.vh || entry.vl || entry.id !== "ab_001" || displayName || Object.keys(settingsEdits).length || importing)
  const shouldBlock = useCallback(() => !allowNavigation.current && (dirty || inFlight.current), [dirty])
  const blocker = useBlocker(shouldBlock)
  useBeforeUnload(useCallback((event) => {
    if (shouldBlock()) { event.preventDefault(); event.returnValue = true }
  }, [shouldBlock]))
  useEffect(() => {
    if (blocker.state !== "blocked") return
    if (window.confirm("Leave this unsent batch? It is kept only on this page and will be lost. A submission already sent may still appear in My Jobs.")) {
      allowNavigation.current = true
      blocker.proceed()
    } else blocker.reset()
  }, [blocker])

  const ambiguous = Boolean(mutation.error && (!(mutation.error instanceof ApiError) || mutation.error.status === 0 || mutation.error.status >= 500))
  function editIntent() {
    if (ambiguous) setPreviousUnconfirmed(true)
    intent.current = null
    mutation.reset()
  }

  function addPair() {
    editIntent()
    const added = { ...entry, vh: normalizeSequence(entry.vh), vl: normalizeSequence(entry.vl), key: crypto.randomUUID() }
    const next = [...pairs, added]
    setPairs(next)
    setBatchPage(Math.floor((next.length - 1) / batchPageSize))
    setEntry({ id: nextPairId(next), vh: "", vl: "" })
  }

  async function importCsv(file: File | null) {
    const version = ++importVersion.current
    setImportError(null)
    if (!file) { setImporting(false); return }
    if (file.size > 10 * 1024 * 1024) {
      setImportError("CSV must be at most 10 MiB. The batch was not changed.")
      setImporting(false)
      return
    }
    setImporting(true)
    try {
      const bytes = await file.arrayBuffer()
      const imported = parsePairCsv(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
      if (!mounted.current || version !== importVersion.current) return
      editIntent()
      setPairs((current) => [...current, ...imported.map((pair) => ({ ...pair, key: crypto.randomUUID() }))])
    } catch (error) {
      if (mounted.current && version === importVersion.current) {
        setImportError(error instanceof Error ? error.message : "Unable to read CSV. The batch was not changed.")
      }
    } finally {
      if (mounted.current && version === importVersion.current) setImporting(false)
    }
  }

  const defaults = options.data?.defaults
  const settingsReady = typeof defaults?.pabnativ2_num_seeds === "number" && typeof options.data?.max_vh_length === "number" && typeof options.data?.max_vl_length === "number"
  const settingNames = Object.keys(settingLabels) as (keyof HumanizationSettings)[]
  const settings: Record<string, string | number | boolean> = {}
  const settingsErrors: Record<string, string> = {}
  for (const name of settingNames) {
    if (!defaults || !settingsReady) break
    const fallback = defaults[name]
    const source = generalSettingSources[name] ?? name
    const value = settingsEdits[name] ?? settingsEdits[source] ?? defaults[source]
    const schema = settingMetadata(options.data, name)
    settings[name] = typeof fallback === "number" ? Number(value) : value
    if (typeof fallback === "number") {
      const numeric = Number(value)
      if (value === "" || !Number.isFinite(numeric) || (schema?.type === "integer" && !Number.isInteger(numeric)) || (schema?.minimum !== undefined && numeric < schema.minimum) || (schema?.maximum !== undefined && numeric > schema.maximum)) {
        settingsErrors[name] = "Enter a valid number within the displayed bounds."
      }
    }
  }
  const name = displayName.trim().replace(/\s+/g, " ") || "Antibody humanization"
  const tooManyPairs = Boolean(options.data && pairs.length > options.data.max_pairs)
  const hasUnaddedEntry = Boolean(entry.vh || entry.vl)
  const invalid = !inputsLoaded || !settingsReady || !pairs.length || tooManyPairs || hasUnaddedEntry || name.length > 120 || localErrors.some((errors) => Object.keys(errors).length) || Object.keys(settingsErrors).length > 0 || apiErrors.length > 0
  const busy = mutation.isPending || importing || !inputsLoaded

  function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    if (inFlight.current || busy || !principal || !defaults || invalid) return
    const submission = intent.current ?? {
      key: crypto.randomUUID(),
      input: { display_name: name, pairs: pairs.map(({ id, vh, vl }) => ({ id, vh: normalizeSequence(vh), vl: normalizeSequence(vl) })), settings: { ...defaults, ...settings } as HumanizationSettings },
    }
    intent.current = submission
    inFlight.current = true
    mutation.mutate(submission)
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10 lg:px-8">
      <Link className={buttonVariants({ variant: "ghost" })} to={humanizationPaths.overview}><ArrowLeft aria-hidden="true" /> Humanization overview</Link>
      <h1 className="mt-8 font-heading text-3xl font-semibold">Humanize antibodies</h1>
      <p className="mt-3 max-w-3xl text-muted-foreground">Add complete paired VH and VL variable domains, or append a CSV batch. Sequences are uppercased and whitespace is removed; review the normalized sequences below.</p>
      {sourceJob ? <div className="mt-4 text-sm">
        {inputsLoaded ? <p>Inputs copied from the <Link className="underline" to={humanizationPaths.job(sourceJob)}>original job</Link>. Review and edit them before submitting a new job using the current workflow.</p> : sourceInputs.error ? <div role="alert"><p>{apiErrorCode(sourceInputs.error) === "job_input_unavailable" || sourceInputs.error instanceof ApiError && sourceInputs.error.status === 404 ? "The original inputs are unavailable or you do not have access to this job." : "Unable to load the original inputs. Sign in if needed, then retry."}</p><Button className="mt-2" onClick={() => void sourceInputs.refetch()} type="button" variant="outline">Retry loading inputs</Button></div> : <p role="status">Loading original inputs…</p>}
      </div> : null}
      {settingsReady && options.data ? <p className="mt-3 text-sm text-muted-foreground">Maximum lengths: VH {options.data.max_vh_length} residues; VL {options.data.max_vl_length} residues. Passing this length check does not guarantee valid antibody numbering.</p> : null}
      {options.isPending ? <p className="mt-6" role="status">Loading scientific defaults and batch limit…</p> : null}
      {options.error ? <div className="mt-6" role="alert"><p>{errorMessage(options.error)}</p><Button className="mt-2" onClick={() => void options.refetch()} variant="outline">Retry options</Button></div> : null}
      {options.data && !settingsReady ? <p className="mt-6 text-sm text-amber-800" role="alert">Humanization submission is awaiting a service update. You can prepare a batch here, but submission is disabled until the update is ready. Existing jobs remain available in My Jobs.</p> : null}
      <form className="mt-8 space-y-6" noValidate onSubmit={submit}>
        <fieldset className="space-y-6" disabled={busy || !principal}>
          <div>
            <label className="block text-sm font-medium" htmlFor="humanization-name">Job name</label>
            <Input aria-invalid={name.length > 120} className="mt-2 max-w-md" id="humanization-name" onChange={(event) => { editIntent(); setDisplayName(event.target.value) }} placeholder="Antibody humanization" value={displayName} />
            {name.length > 120 ? <p className="mt-1 text-sm text-destructive">Use at most 120 characters.</p> : null}
          </div>
          <Card>
            <CardHeader><CardTitle>Add an antibody pair</CardTitle></CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2 md:gap-0">
              <div className="space-y-4 md:pr-8">
                <div className="max-w-sm"><label className="text-sm font-medium" htmlFor="pair-id">ID</label><Input id="pair-id" onChange={(event) => setEntry({ ...entry, id: event.target.value })} value={entry.id} /></div>
                <div className="space-y-4">
                  {(["vh", "vl"] as const).map((field) => <div key={field}>
                    <label className="text-sm font-medium" htmlFor={`pair-${field}`}>{field.toUpperCase()} sequence</label>
                    <textarea className={textareaClass} id={`pair-${field}`} onChange={(event) => setEntry({ ...entry, [field]: event.target.value })} spellCheck={false} value={entry[field]} />
                    <p className="mt-1 text-xs text-muted-foreground">Normalized preview</p><p className="break-all font-mono text-xs">{normalizeSequence(entry[field]) || "—"}</p>
                  </div>)}
                </div>
                <Button onClick={addPair} type="button" disabled={!entry.id && !entry.vh && !entry.vl}><Plus aria-hidden="true" /> Add pair</Button>
              </div>
              <div className="space-y-4 border-t border-border/50 pt-6 md:border-t-0 md:border-l md:pt-0 md:pl-8">
                <p className="leading-7 text-muted-foreground">Import CSV with columns <strong className="font-semibold text-foreground">id,vh,vl</strong> to add multiple pairs to the batch below.</p>
                <FileDropZone accept=".csv,text/csv" disabled={busy} help="UTF-8 CSV, up to 10 MiB." id="humanization-csv" label="CSV file" onSelect={(file) => void importCsv(file)} />
                {importing ? <p role="status">Reading CSV…</p> : null}
                {importError ? <p className="text-sm text-destructive" role="alert">{importError}</p> : null}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Current batch · {pairs.length} {pairs.length === 1 ? "pair" : "pairs"}</CardTitle><p className="text-sm text-muted-foreground">{options.data ? `Current limit: ${options.data.max_pairs} pairs per job. ` : ""}Edit or remove invalid rows before submitting. IDs remain unchanged.</p></CardHeader>
            <CardContent className="space-y-3">
              {!pairs.length ? <p className="text-sm text-muted-foreground">No pairs added yet.</p> : null}
              {firstInvalidRow >= 0 ? <p className="text-sm text-destructive" role="alert">Some rows need correction. <button className="cursor-pointer underline" onClick={() => setBatchPage(Math.floor(firstInvalidRow / batchPageSize))} type="button">Go to first invalid row (pair {firstInvalidRow + 1})</button></p> : null}
              {pairs.slice(batchOffset, batchOffset + batchPageSize).map((pair, pageIndex) => {
                const index = batchOffset + pageIndex
                return <fieldset className="rounded-lg border p-4 has-[[aria-invalid=true]]:border-destructive" key={pair.key}>
                <legend className="px-1 text-sm font-medium">Pair {index + 1}</legend>
                <div className="grid items-start gap-3 md:grid-cols-[12rem_1fr_1fr_auto]">
                  {(["id", "vh", "vl"] as const).map((field) => {
                    const errors = [localErrors[index]?.[field], ...apiErrors.filter((error) => error.row_index === index && error.field === field).map((error) => error.message)].filter(Boolean)
                    const id = `${pair.key}-${field}`
                    const update = (value: string) => { editIntent(); setPairs((current) => current.map((row) => row.key === pair.key ? { ...row, [field]: field === "id" ? value : normalizeSequence(value) } : row)) }
                    return <div key={field}>
                      <label className="text-xs font-medium" htmlFor={id}>{field.toUpperCase()}{field !== "id" ? " · normalized" : ""}</label>
                      {field === "id" ? <Input aria-describedby={errors.length ? `${id}-error` : undefined} aria-invalid={Boolean(errors.length)} id={id} onChange={(event) => update(event.target.value)} value={pair[field]} /> : <textarea aria-describedby={errors.length ? `${id}-error` : undefined} aria-invalid={Boolean(errors.length)} className={textareaClass} id={id} onChange={(event) => update(event.target.value)} spellCheck={false} value={pair[field]} />}
                      {errors.length ? <p className="mt-1 text-sm text-destructive" id={`${id}-error`}>{errors.join(" ")}</p> : null}
                    </div>
                  })}
                  <Button aria-label={`Remove pair ${index + 1}`} onClick={() => { editIntent(); setPairs((current) => current.filter((row) => row.key !== pair.key)) }} type="button" variant="ghost"><Trash2 aria-hidden="true" /></Button>
                </div>
              </fieldset>})}
              {pairs.length > batchPageSize ? <nav aria-label="Batch pages" className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">Pairs {batchOffset + 1}–{Math.min(batchOffset + batchPageSize, pairs.length)} of {pairs.length}</p>
                <div className="flex items-center gap-2">
                  <Button aria-label="Previous batch page" disabled={currentBatchPage === 0} onClick={() => setBatchPage(currentBatchPage - 1)} type="button" variant="outline"><ChevronLeft aria-hidden="true" /></Button>
                  <label className="flex items-center gap-2 text-sm">Page <input aria-label="Batch page" className="h-9 w-24 rounded-lg border border-input px-2" min={1} max={batchPageCount} type="number" value={currentBatchPage + 1} onChange={(event) => { const page = event.target.valueAsNumber; if (Number.isInteger(page) && page >= 1 && page <= batchPageCount) setBatchPage(page - 1) }} /> of {batchPageCount}</label>
                  <Button aria-label="Next batch page" disabled={currentBatchPage === batchPageCount - 1} onClick={() => setBatchPage(currentBatchPage + 1)} type="button" variant="outline"><ChevronRight aria-hidden="true" /></Button>
                </div>
              </nav> : null}
              {tooManyPairs ? <p className="text-sm text-destructive" role="alert">Remove pairs to meet the current limit of {options.data?.max_pairs}.</p> : null}
            </CardContent>
          </Card>
          <details className="rounded-xl border p-5">
            <summary className="cursor-pointer font-medium">Advanced settings</summary>
            <p className="mt-3 text-sm text-muted-foreground">One scientific configuration applies to every pair in the batch.</p>
            {defaults && settingsReady ? settingGroups.map((group) => <fieldset className="mt-6 border-t pt-4" key={group.prefix}>
              <legend className="font-medium">{group.name}</legend><p className="mb-3 text-sm text-muted-foreground">{group.help}</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {settingNames.filter((field) => group.prefix ? field.startsWith(group.prefix) && !generalSettingSources[field] : generalSettingSources[field] === field).map((field) => {
                  const schema = settingMetadata(options.data, field)
                  const value = settingsEdits[field] ?? defaults![field]
                  const error = settingsErrors[field]
                  const related = settingNames.filter((name) => name === field || generalSettingSources[name] === field)
                  const mixed = related.some((name) => settings[name] !== settings[field])
                  const change = (next: string | boolean) => { editIntent(); setSettingsEdits((current) => ({ ...current, ...Object.fromEntries(related.map((name) => [name, next])) })) }
                  return <div key={field}>
                    {typeof value === "boolean" ? <label className="flex gap-2 text-sm"><input aria-checked={mixed ? "mixed" : value} ref={(node) => { if (node) node.indeterminate = mixed }} checked={!mixed && value} id={field} onChange={(event) => change(event.target.checked)} type="checkbox" />{settingLabels[field]}</label> : <>
                      <label className="mb-1 block text-sm" htmlFor={field}>{settingLabels[field]}</label>
                      {schema?.enum ? <select className={selectClass} id={field} onChange={(event) => change(event.target.value)} value={String(value)}>{schema.enum.map((option) => <option key={option} value={option}>{option}</option>)}</select> : <Input aria-describedby={error ? `${field}-error` : undefined} aria-invalid={Boolean(error)} id={field} max={schema?.maximum} min={schema?.minimum} onChange={(event) => change(event.target.value)} step={schema?.type === "integer" ? 1 : "any"} type={typeof defaults![field] === "number" ? "number" : "text"} placeholder={mixed ? "Mixed values" : undefined} value={mixed ? "" : String(value)} />}
                      {schema?.minimum !== undefined || schema?.maximum !== undefined ? <p className="mt-1 text-xs text-muted-foreground">{schema.minimum ?? "No minimum"} – {schema.maximum ?? "no maximum"}</p> : null}
                    </>}
                    {mixed ? <p className="mt-1 text-sm text-muted-foreground">Original model values differ and are preserved until you change this control.</p> : null}
                    {settingHelp[field] ? <p className="mt-1 text-sm text-muted-foreground">{settingHelp[field]}</p> : null}
                    {error ? <p className="text-sm text-destructive" id={`${field}-error`}>{error}</p> : null}
                  </div>
                })}
              </div>
            </fieldset>) : null}
          </details>
        </fieldset>
        <div className="rounded-xl border bg-muted/30 p-5">
          <p className="text-sm">Your batch stays only on this page until submitted. Leaving or reloading loses the draft. A submitted job can be found in <Link className="underline" to="/jobs">My Jobs</Link>.</p>
          {hasUnaddedEntry ? <p className="mt-2 text-sm text-destructive">Add the pair above, or clear its sequences, before submitting the batch.</p> : null}
          {previousUnconfirmed ? <p className="mt-2 text-sm text-amber-800">An earlier submission may already have created a job. Edits create a new submission; check My Jobs to avoid duplicate work.</p> : null}
          {mutation.error ? <div className="mt-3 text-sm text-destructive" role="alert"><p>{errorMessage(mutation.error)}</p>{apiErrors.length ? <ul className="mt-2 list-disc pl-5">{apiErrors.map((error, index) => <li key={index}>{error.row_index === null ? "Batch" : `Pair ${error.row_index + 1}`} · {error.field}: {error.message}</li>)}</ul> : null}</div> : null}
          <Button className="mt-4" disabled={busy || !principal || !defaults || invalid} size="lg" type="submit">{mutation.isPending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}{mutation.isPending ? "Submitting job…" : intent.current && mutation.error ? "Check submission" : "Submit humanization"}</Button>
          {ambiguous ? <p className="mt-2 text-sm text-muted-foreground">Check submission sends the unchanged original request and key. It does not start replacement work.</p> : null}
        </div>
      </form>
    </main>
  )
}
