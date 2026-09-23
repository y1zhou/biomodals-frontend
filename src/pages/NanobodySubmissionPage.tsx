import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, ChevronLeft, ChevronRight, LoaderCircle, Plus, Trash2 } from "lucide-react"
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { Link, useBeforeUnload, useBlocker, useNavigate, useSearchParams } from "react-router"
import { ApiError, apiErrorCode, nanobodyInputs, nanobodyOptions, prepareNanobodies, submitNanobodyJob } from "@/api/client"
import { authenticatedPrincipal, useCurrentUser, useExpireSession } from "@/auth-state"
import FileDropZone from "@/components/FileDropZone"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { normalizeSequence, settingMetadata } from "@/humanization"
import { randomUUID } from "@/lib/uuid"
import { nanobodySettingGroups, nanobodySettingInfo, nextParentId, parseNanobodyCsv, type NanobodyNumericSetting, type NanobodyParent, type NanobodyPreparation, type NanobodySettings, type NanobodySubmission } from "@/nanobody-humanization"
import { jobKey, jobListKey } from "@/jobs"
import { nanobodyPaths } from "@/tools"

type BatchRow = NanobodyParent & { key: string }
type Intent = { input: NanobodySubmission; key: string }
const textareaClass = "min-h-24 w-full rounded-lg border border-input bg-background p-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive"
const pageSize = 50

export default function NanobodySubmissionPage() {
  const [params] = useSearchParams()
  const sourceJob = params.get("source_job") || ""
  return <NanobodySubmissionForm key={sourceJob} sourceJob={sourceJob} />
}

function NanobodySubmissionForm({ sourceJob }: { sourceJob: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const principal = authenticatedPrincipal(useCurrentUser().data)
  const options = useQuery({ queryKey: ["nanobody-humanization", "options"], queryFn: ({ signal }) => nanobodyOptions(signal), enabled: !!principal, retry: false, staleTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false })
  const [parents, setParents] = useState<BatchRow[]>([])
  const [entry, setEntry] = useState<NanobodyParent>({ id: "nb_001", vhh: "" })
  const [displayName, setDisplayName] = useState("")
  const [settingsEdits, setSettingsEdits] = useState<Partial<Record<NanobodyNumericSetting, string>>>({})
  const [exposureEnabled, setExposureEnabled] = useState<boolean>()
  const [explorationEnabled, setExplorationEnabled] = useState<boolean>()
  const [batchPage, setBatchPage] = useState(0)
  const [importError, setImportError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [fileName, setFileName] = useState("")
  const fileVersion = useRef(0)
  const preparationController = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  const intent = useRef<Intent | null>(null)
  const submitting = useRef(false)
  const allowNavigation = useRef(false)
  const [previousUnconfirmed, setPreviousUnconfirmed] = useState(false)
  const [inputsLoaded, setInputsLoaded] = useState(!sourceJob)
  const sourceInputs = useQuery({ queryKey: ["nanobody-humanization", "inputs", principal?.user_id, sourceJob], queryFn: ({ signal }) => nanobodyInputs(sourceJob, signal), enabled: !!principal && !!sourceJob && !inputsLoaded, retry: false, gcTime: 0, staleTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false })
  useExpireSession(sourceInputs.error)
  useEffect(() => {
    if (!sourceInputs.data || inputsLoaded) return
    const source = sourceInputs.data
    setParents(source.parents.map((parent) => ({ ...parent, key: randomUUID() })))
    setEntry({ id: nextParentId(source.parents), vhh: "" })
    setDisplayName(source.display_name)
    setExposureEnabled(source.settings.abnativ2_rasa_threshold > 0)
    setExplorationEnabled(source.settings.abnativ2_explore ?? false)
    setSettingsEdits(Object.fromEntries(Object.entries(source.settings).filter(([name, value]) => name !== "abnativ2_explore" && (name !== "abnativ2_rasa_threshold" || Number(value) > 0)).map(([name, value]) => [name, String(value)])))
    setInputsLoaded(true)
  }, [sourceInputs.data, inputsLoaded])
  const mutation = useMutation({
    mutationFn: ({ rows, signal }: { rows: BatchRow[]; signal: AbortSignal }) => prepareNanobodies({ parents: rows.map(({ id, vhh }) => ({ id, vhh })) }, signal),
    retry: false, gcTime: 0,
  })
  const submission = useMutation({
    mutationFn: (request: Intent) => submitNanobodyJob(request.input, request.key), retry: false, gcTime: 0,
    onSuccess(job) {
      if (!mounted.current) return
      intent.current = null
      allowNavigation.current = true
      queryClient.setQueryData(jobKey(job.job_id), job)
      void queryClient.invalidateQueries({ queryKey: jobListKey })
      navigate(nanobodyPaths.job(job.job_id), { replace: true })
    },
    onError(error) {
      if (apiErrorCode(error) === "preparation_changed") { mutation.reset(); intent.current = null }
    },
    onSettled() { submitting.current = false },
  })
  useExpireSession(options.error ?? mutation.error ?? submission.error)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; fileVersion.current++; preparationController.current?.abort() }
  }, [])
  const preview = mutation.variables?.rows === parents ? mutation.data : undefined
  const policyChanged = preview && options.data && preview.preparation_version !== options.data.preparation_version
  const errorBody = submission.error instanceof ApiError ? submission.error.body : null
  const submissionIssues = errorBody && typeof errorBody === "object" && "errors" in errorBody && Array.isArray(errorBody.errors) ? errorBody.errors as NanobodyPreparation["errors"] : []
  const errors = [...preview?.errors ?? [], ...submissionIssues]
  const pageCount = Math.max(1, Math.ceil(parents.length / pageSize))
  const currentPage = Math.min(batchPage, pageCount - 1)
  const offset = currentPage * pageSize
  const dirty = Boolean(parents.length || entry.vhh || entry.id !== "nb_001" || displayName || Object.keys(settingsEdits).length || exposureEnabled !== undefined || explorationEnabled !== undefined || importing)
  const blocker = useBlocker(() => !allowNavigation.current && (dirty || submitting.current))
  useBeforeUnload(useCallback((event) => {
    if (!allowNavigation.current && (dirty || submitting.current)) { event.preventDefault(); event.returnValue = true }
  }, [dirty]))
  useEffect(() => {
    if (blocker.state !== "blocked") return
    if (window.confirm("Leave this unsent batch? It is kept only on this page and will be lost.")) blocker.proceed()
    else blocker.reset()
  }, [blocker])

  const submissionBusy = apiErrorCode(submission.error) === "local_analysis_busy"
  const ambiguous = submission.error && !submissionBusy && (!(submission.error instanceof ApiError) || submission.error.status === 0 || submission.error.status >= 500)
  function editIntent() {
    if (ambiguous) setPreviousUnconfirmed(true)
    intent.current = null
    submission.reset()
  }

  function discardPreview() {
    editIntent()
    preparationController.current?.abort()
    mutation.reset()
  }
  function addParent() {
    discardPreview()
    const next = [...parents, { id: entry.id, vhh: normalizeSequence(entry.vhh), key: randomUUID() }]
    setParents(next)
    setBatchPage(Math.floor((next.length - 1) / pageSize))
    setEntry({ id: nextParentId(next), vhh: "" })
  }
  async function importCsv(file: File | null) {
    const version = ++fileVersion.current
    setImportError(null)
    if (!file || !options.data?.max_csv_bytes) { setImporting(false); return }
    if (file.size > options.data.max_csv_bytes) {
      setImportError(`CSV must be at most ${options.data.max_csv_bytes / 1024 / 1024} MiB. The batch was not changed.`)
      setImporting(false)
      return
    }
    setImporting(true)
    try {
      const imported = parseNanobodyCsv(new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()))
      if (fileVersion.current !== version) return
      discardPreview()
      setParents((current) => [...current, ...imported.map((parent) => ({ ...parent, key: randomUUID() }))])
      setFileName(file.name)
    } catch (error) {
      if (fileVersion.current === version) setImportError(error instanceof Error ? error.message : "Unable to read CSV. The batch was not changed.")
    } finally {
      if (fileVersion.current === version) setImporting(false)
    }
  }

  const settingNames = Object.keys(nanobodySettingInfo) as NanobodyNumericSetting[]
  const defaults = options.data?.defaults
  const screenExposure = exposureEnabled ?? (defaults?.abnativ2_rasa_threshold ?? 0) > 0
  const explore = explorationEnabled ?? defaults?.abnativ2_explore ?? false
  const optionsReady = options.data && typeof options.data.max_csv_bytes === "number" && typeof options.data.max_input_length === "number" && typeof options.data.preparation_version === "string" && typeof defaults?.abnativ2_explore === "boolean" && [options.data.max_exploration_candidates_per_parent, options.data.max_exploration_candidates_per_job].every((value) => Number.isSafeInteger(value) && value > 0) && settingNames.every((name) => typeof defaults?.[name] === "number" && Number.isFinite(defaults[name]))
  const numericSettings: Record<string, number> = {}
  const settingErrors: Partial<Record<NanobodyNumericSetting, boolean>> = {}
  for (const name of settingNames) {
    const value = settingsEdits[name] ?? defaults?.[name] ?? ""
    const exposure = name === "abnativ2_rasa_threshold"
    const numeric = exposure && !screenExposure ? 0 : Number(value)
    const metadata = settingMetadata(options.data, name)
    const budget = name === "abnativ2_candidate_budget"
    const invalid = value === "" || !Number.isFinite(numeric) || exposure && numeric <= 0 || (metadata.type === "integer" || budget) && !Number.isInteger(numeric) || metadata.minimum !== undefined && numeric < metadata.minimum || metadata.maximum !== undefined && numeric > metadata.maximum || budget && options.data !== undefined && numeric > options.data.max_exploration_candidates_per_parent
    numericSettings[name] = budget && !explore && invalid ? Number(defaults?.[name]) : numeric
    settingErrors[name] = exposure && !screenExposure || budget && !explore ? false : invalid
  }
  const settings = { ...numericSettings, abnativ2_explore: explore } as NanobodySettings
  const requestedAllowance = parents.length * settings.abnativ2_candidate_budget
  const overBudget = explore && !settingErrors.abnativ2_candidate_budget && options.data && requestedAllowance > options.data.max_exploration_candidates_per_job
  const normalizedName = displayName.trim().replace(/\s+/g, " ") || "Nanobody humanization"
  const oversized = parents.some((parent) => [...parent.id].length > 200 || options.data?.max_input_length !== undefined && parent.vhh.length > options.data.max_input_length)
  const overLimit = options.data && parents.length > options.data.max_parents
  const canPrepare = principal && inputsLoaded && optionsReady && parents.length > 0 && !overLimit && !oversized && !entry.vhh && !importing && !mutation.isPending && !submission.isPending
  const canSubmit = canPrepare && preview?.preparation_digest && !policyChanged && !errors.length && !overBudget && !Object.values(settingErrors).some(Boolean) && normalizedName.length <= 120
  function prepare(event: FormEvent) {
    event.preventDefault()
    if (!canPrepare) return
    editIntent()
    preparationController.current?.abort()
    const controller = new AbortController()
    preparationController.current = controller
    mutation.mutate({ rows: parents, signal: controller.signal })
  }
  function submit(replay = false) {
    if (!principal || submitting.current || submission.isPending || (replay ? !intent.current : !canSubmit)) return
    const request = intent.current ?? { key: randomUUID(), input: { display_name: normalizedName, parents: parents.map(({ id, vhh }) => ({ id, vhh })), settings, preparation_digest: preview!.preparation_digest! } }
    intent.current = request
    submitting.current = true
    submission.mutate(request)
  }

  return <main className="mx-auto max-w-6xl space-y-6 px-6 py-10 lg:px-8">
    <Link className={buttonVariants({ variant: "ghost" })} to={nanobodyPaths.overview}><ArrowLeft aria-hidden="true" />Nanobody overview</Link>
    <header className="max-w-4xl space-y-3">
      <h1 className="text-3xl font-semibold">Humanize single-domain antibodies</h1>
      <p className="text-lg leading-8 text-muted-foreground">Add a VH domain or import a batch. Preparation trims non-variable flanks and completes missing terminal framework residues. Review each prepared sequence before humanization.</p>
      <p className="leading-7 text-muted-foreground">Any valid VH is accepted; recognition does not establish camelid origin or functional single-domain behavior. Original inputs remain editable and are kept separately from the prepared parental baseline.</p>
    </header>
    {sourceJob ? <div className="rounded-lg border bg-muted/30 p-4 leading-7">{inputsLoaded ? <p>Original inputs copied from the <Link className="underline" to={nanobodyPaths.job(sourceJob)}>previous job</Link>. Review the configuration and prepare again before submitting a new job.</p> : sourceInputs.error ? <div role="alert"><p>Retained inputs could not be loaded. {sourceInputs.error instanceof ApiError && sourceInputs.error.status === 404 ? "This job or its original inputs are unavailable to you." : sourceInputs.error.message}</p><Button className="mt-3" variant="outline" onClick={() => void sourceInputs.refetch()}>Retry loading inputs</Button></div> : <p role="status">Loading original inputs…</p>}</div> : null}
    {options.isPending ? <p role="status" className="flex items-center gap-2"><LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />Loading preparation limits and defaults…</p> : null}
    {options.error ? <div role="alert"><p>Preparation options could not be loaded. {options.error.message}</p><Button className="mt-2" onClick={() => void options.refetch()} variant="outline">Retry options</Button></div> : null}
    {options.data && !optionsReady ? <div role="alert"><p>Humanization needs updated service options with exploration settings and limits. Reload the options before continuing.</p><Button className="mt-2" type="button" variant="outline" onClick={() => void options.refetch()}>Reload options</Button></div> : null}
    <form className="space-y-6" noValidate onSubmit={prepare}>
      <fieldset className="space-y-6" disabled={!principal || importing || !inputsLoaded || submission.isPending}>
        <div className="max-w-md"><label htmlFor="nanobody-name" className="text-sm font-medium">Job name</label><Input id="nanobody-name" className="mt-2" value={displayName} placeholder="Nanobody humanization" onChange={(event) => { editIntent(); setDisplayName(event.target.value) }} aria-invalid={normalizedName.length > 120} />{normalizedName.length > 120 ? <p className="text-sm text-destructive">Use at most 120 characters.</p> : null}</div>
        <Card>
          <CardHeader><CardTitle>Add a VH sequence</CardTitle></CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2 md:gap-0">
            <div className="space-y-4 md:pr-8">
              <div><label htmlFor="nanobody-id" className="text-sm font-medium">ID</label><Input id="nanobody-id" value={entry.id} onChange={(event) => setEntry({ ...entry, id: event.target.value })} /></div>
              <div><label htmlFor="nanobody-vhh" className="text-sm font-medium">VH sequence</label><textarea id="nanobody-vhh" className={textareaClass} spellCheck={false} value={entry.vhh} onChange={(event) => setEntry({ ...entry, vhh: event.target.value })} /><p className="mt-1 text-xs text-muted-foreground">Normalized preview</p><p className="break-all font-mono text-xs">{normalizeSequence(entry.vhh) || "—"}</p></div>
              <Button type="button" onClick={addParent} disabled={!entry.id && !entry.vhh}><Plus aria-hidden="true" />Add sequence</Button>
            </div>
            <div className="space-y-4 border-t border-border/50 pt-6 md:border-t-0 md:border-l md:pt-0 md:pl-8">
              <p className="leading-7 text-muted-foreground">Import CSV with columns <strong className="text-foreground">id,vhh</strong> to add multiple sequences to the batch below.</p>
              <FileDropZone id="nanobody-csv" label="CSV file" accept=".csv,text/csv" fileName={fileName} disabled={!optionsReady || importing} help={options.data?.max_csv_bytes ? `UTF-8 CSV, up to ${options.data.max_csv_bytes / 1024 / 1024} MiB.` : "Limits load from the service."} onSelect={(file) => void importCsv(file)} />
              {importing ? <p role="status">Reading CSV…</p> : null}
              {importError ? <p role="alert" className="text-sm text-destructive">{importError}</p> : null}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Current batch · {parents.length} {parents.length === 1 ? "parent" : "parents"}</CardTitle><p className="leading-7 text-muted-foreground">{options.data ? `Current limit: ${options.data.max_parents} parents per job. ` : ""}IDs must be valid and unique. Correct or remove invalid rows; no rows are silently dropped.</p></CardHeader>
          <CardContent className="space-y-4">
            {options.data?.max_input_length ? <p className="text-sm leading-7 text-muted-foreground">Original inputs may contain up to {options.data.max_input_length} residues. Preparation checks native model compatibility, not just sequence length. Letters are uppercased and whitespace is removed.</p> : null}
            {!parents.length ? <p>No sequences added yet.</p> : null}
            {overLimit ? <p role="alert" className="text-destructive">The batch exceeds the service limit of {options.data?.max_parents} parents. Remove rows before preparing.</p> : null}
            {errors.length ? <p role="alert" className="text-destructive">Some rows need correction. Valid prepared sequences are shown below. <button type="button" className="underline" onClick={() => setBatchPage(Math.floor(errors[0].row_index / pageSize))}>Go to first invalid row</button></p> : null}
            {parents.slice(offset, offset + pageSize).map((parent, index) => {
              const rowIndex = offset + index
              const issues = errors.filter((error) => error.row_index === rowIndex)
              const lengthError = options.data?.max_input_length !== undefined && parent.vhh.length > options.data.max_input_length
              const idLengthError = [...parent.id].length > 200
              const prepared = preview?.rows.find((row) => row.row_index === rowIndex)
              function update(field: keyof NanobodyParent, value: string) {
                discardPreview()
                setParents((current) => current.map((row) => row.key === parent.key ? { ...row, [field]: field === "vhh" ? normalizeSequence(value) : value } : row))
              }
              return <fieldset key={parent.key} className="rounded-lg border p-4 has-[[aria-invalid=true]]:border-destructive"><legend className="px-1 text-sm font-medium">Parent {rowIndex + 1}</legend>
                <div className="mb-4 flex items-end gap-3"><div className="max-w-sm flex-1"><label htmlFor={`${parent.key}-id`} className="text-sm font-medium">ID</label><Input id={`${parent.key}-id`} value={parent.id} aria-invalid={idLengthError || issues.some((error) => error.field === "id")} onChange={(event) => update("id", event.target.value)} />{idLengthError ? <p className="text-sm text-destructive">Use at most 200 characters.</p> : null}</div><Button type="button" variant="ghost" aria-label={`Remove parent ${rowIndex + 1}`} onClick={() => { discardPreview(); setParents((current) => current.filter((row) => row.key !== parent.key)) }}><Trash2 aria-hidden="true" /></Button></div>
                <div className="grid gap-4 md:grid-cols-2"><div><label htmlFor={`${parent.key}-vhh`} className="text-sm font-medium">Original VH · normalized</label><textarea id={`${parent.key}-vhh`} className={textareaClass} spellCheck={false} value={parent.vhh} aria-invalid={lengthError || issues.some((error) => error.field === "vhh")} onChange={(event) => update("vhh", event.target.value)} /><p className="text-xs text-muted-foreground">{parent.vhh.length} residues</p>{lengthError ? <p className="text-sm text-destructive">Shorten this original input to the service limit of {options.data?.max_input_length} residues before preparing. No residues have been removed.</p> : null}</div>
                  <div><h3 className="text-sm font-medium">Prepared VH</h3><p className="mt-1 min-h-24 break-all rounded-lg bg-muted/40 p-2 font-mono text-sm">{prepared?.vh ?? (prepared ? "Unavailable for this row" : "Prepare the batch to review this sequence.")}</p>{prepared?.vh ? <p className="text-xs text-muted-foreground">{prepared.vh.length} residues · parental baseline</p> : null}</div>
                </div>
                {issues.map((issue, issueIndex) => <p key={issueIndex} className="mt-2 text-sm text-destructive">{issue.message}</p>)}
              </fieldset>
            })}
            {parents.length > pageSize ? <nav aria-label="Batch pages" className="flex items-center gap-3"><Button type="button" variant="outline" size="icon" aria-label="Previous batch page" disabled={currentPage === 0} onClick={() => setBatchPage(currentPage - 1)}><ChevronLeft /></Button><span>{offset + 1}–{Math.min(parents.length, offset + pageSize)} of {parents.length} parents</span><Button type="button" variant="outline" size="icon" aria-label="Next batch page" disabled={currentPage + 1 === pageCount} onClick={() => setBatchPage(currentPage + 1)}><ChevronRight /></Button></nav> : null}
          </CardContent>
        </Card>
        <details className="rounded-xl border p-5"><summary className="cursor-pointer text-lg font-semibold">Advanced settings</summary>
          <p className="mt-3 leading-7 text-muted-foreground">One configuration applies to the entire batch. Both native CDR masks, all prepared-parent cysteines, and parental IMGT 42/49/50/52 are protected. Other framework positions, including completed termini, may change.</p>
          {nanobodySettingGroups.map((group) => <fieldset key={group.label} className="mt-5 border-t pt-4"><legend className="px-1 text-lg font-medium">{group.label}</legend>
            {group.label === "AbNatiV2 VHH" ? <div className="mb-5 space-y-2">
              <label className="flex items-center gap-2 font-medium"><input type="checkbox" className="size-4" checked={explore} disabled={!optionsReady} onChange={(event) => { editIntent(); setExplorationEnabled(event.target.checked) }} />Explore more candidates</label>
              <p className="text-sm leading-7 text-muted-foreground">{explore ? "Evaluate all allowed nonparent combinations if they fit the budget; otherwise reproducibly sample unique combinations, balancing the allowance across mutation counts and redistributing exhausted groups. Every passing design enters shared ranking with HuDiff. No additional sampling replaces rejected designs." : "Enhanced search returns one best-effort endpoint per parent, which may be unchanged. Enable exploration to evaluate more combinations; additional passing designs are not guaranteed."}</p>
              {explore && optionsReady ? <p className="text-sm leading-7 text-muted-foreground" aria-live="polite">{settingErrors.abnativ2_candidate_budget ? "Enter a valid per-parent budget to calculate the requested allowance." : `Requested exploration allowance: ${parents.length} × ${settings.abnativ2_candidate_budget} = ${requestedAllowance} combinations.`} Service limits: {options.data.max_exploration_candidates_per_parent} per parent and {options.data.max_exploration_candidates_per_job} per job. Actual native space is determined during execution.</p> : null}
              <label className="flex items-center gap-2 font-medium"><input type="checkbox" className="size-4" checked={screenExposure} disabled={!optionsReady} onChange={(event) => { editIntent(); setExposureEnabled(event.target.checked) }} />Screen by solvent exposure</label>
              <p className="text-sm leading-7 text-muted-foreground">Screening uses a predicted parent structure to restrict proposed changes to exposed positions. Turning it off also admits buried positions and can expand the search; sequence protections and model criteria still apply. These scores do not establish fold retention.</p>
            </div> : null}
            <div className="grid gap-5 md:grid-cols-2">{group.names.map((name) => {
            if (name === "abnativ2_candidate_budget" && !explore) return null
            const info = name === "abnativ2_max_relative_vhh_score_decrease" && explore ? { label: "Allowed VHH score decrease from prepared parent", help: "Relative VHH-score loss allowed from the original prepared parent during exploration. This is a total parent-relative allowance, not a per-step tolerance." } : nanobodySettingInfo[name]
            const metadata = settingMetadata(options.data, name)
            const value = settingsEdits[name] ?? defaults?.[name] ?? ""
            const invalid = settingErrors[name]
            return <div key={name}><label className="text-sm font-medium" htmlFor={`nano-${name}`}>{info.label}</label><Input id={`nano-${name}`} type="number" disabled={!optionsReady || name === "abnativ2_rasa_threshold" && !screenExposure} min={metadata.minimum} max={name === "abnativ2_candidate_budget" ? options.data?.max_exploration_candidates_per_parent : metadata.maximum} step={metadata.type === "integer" ? 1 : "any"} value={value} aria-invalid={!!optionsReady && !!invalid} onChange={(event) => { editIntent(); setSettingsEdits((current) => ({ ...current, [name]: event.target.value })) }} /><p className="mt-1 text-sm leading-7 text-muted-foreground">{info.help}</p>{optionsReady && invalid ? <p className="text-sm text-destructive">Enter a valid number within the displayed bounds{name === "abnativ2_rasa_threshold" ? ", greater than zero while screening is on" : ""}.</p> : null}</div>
          })}</div></fieldset>)}
        </details>
        {overBudget ? <p role="alert" className="text-destructive">Requested exploration allowance {requestedAllowance} exceeds the service limit of {options.data?.max_exploration_candidates_per_job} combinations per job. Reduce the batch or per-parent budget before submitting. Nothing has been scaled automatically.</p> : null}
        {entry.vhh ? <p className="text-sm text-muted-foreground">Add or clear the sequence above before preparing the batch.</p> : null}
        {mutation.error ? <p role="alert" className="text-destructive">Preparation could not be completed. {mutation.error.message} Retry explicitly after correcting any input or session problem.</p> : null}
        {policyChanged ? <p role="alert">The preparation policy changed. <button type="button" className="underline" onClick={() => { discardPreview(); void options.refetch() }}>Reload options</button> and prepare again.</p> : null}
        {preview?.preparation_digest && !policyChanged ? <p role="status">Batch prepared. Review the prepared parental sequences above.</p> : null}
        <Button type="submit" disabled={!canPrepare}>{mutation.isPending ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : null}{mutation.isPending ? "Preparing sequences…" : "Prepare sequences"}</Button>
        <Button className="ml-3" type="button" disabled={!canSubmit} onClick={() => submit()}>{submission.isPending ? "Submitting…" : "Submit humanization"}</Button>
        {ambiguous && intent.current ? <Button className="ml-3" type="button" variant="outline" disabled={!principal || submission.isPending} onClick={() => submit(true)}>Check submission</Button> : null}
        {submission.error ? <p role="alert" className="text-destructive">{apiErrorCode(submission.error) === "preparation_changed" ? "Prepared inputs changed. Prepare and review the batch again before submitting." : apiErrorCode(submission.error) === "exploration_budget_exceeded" ? `Submission was rejected. ${submission.error.message} Your reviewed inputs and settings are preserved. Reduce the batch or per-parent budget, then submit explicitly.` : apiErrorCode(submission.error) === "deployment_incompatible" ? `Submission was rejected. ${submission.error.message} Your reviewed batch is preserved. Ask an administrator to update the workflow before trying again.` : submissionBusy ? "Local sequence analysis is busy. Your reviewed batch and settings are unchanged. Click Submit humanization to try again when capacity is available." : ambiguous ? "The submission could not be confirmed. Check submission to reuse the original request without creating another intent." : `Submission was rejected. ${submission.error.message}`}</p> : null}
        {previousUnconfirmed ? <p role="alert">An earlier submission was not confirmed. Check <Link className="underline" to="/jobs">My Jobs</Link> before submitting an edited batch.</p> : null}
        <p className="text-sm leading-7 text-muted-foreground">Only Submit humanization starts a scientific job. Preparation is local to the service. This draft exists only in memory and is lost when you leave or reload.</p>
      </fieldset>
    </form>
  </main>
}
