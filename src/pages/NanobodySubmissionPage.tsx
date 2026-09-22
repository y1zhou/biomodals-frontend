import { useMutation, useQuery } from "@tanstack/react-query"
import { ArrowLeft, ChevronLeft, ChevronRight, LoaderCircle, Plus, Trash2 } from "lucide-react"
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { Link, useBeforeUnload, useBlocker } from "react-router"
import { nanobodyOptions, prepareNanobodies } from "@/api/client"
import { authenticatedPrincipal, useCurrentUser, useExpireSession } from "@/auth-state"
import FileDropZone from "@/components/FileDropZone"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { normalizeSequence, settingMetadata } from "@/humanization"
import { randomUUID } from "@/lib/uuid"
import { nanobodySettingGroups, nanobodySettingInfo, nextParentId, parseNanobodyCsv, type NanobodyParent, type NanobodySettings } from "@/nanobody-humanization"

type BatchRow = NanobodyParent & { key: string }
const textareaClass = "min-h-24 w-full rounded-lg border border-input bg-background p-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive"
const pageSize = 50

export default function NanobodySubmissionPage() {
  const principal = authenticatedPrincipal(useCurrentUser().data)
  const options = useQuery({ queryKey: ["nanobody-humanization", "options"], queryFn: ({ signal }) => nanobodyOptions(signal), enabled: !!principal, retry: false, staleTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false })
  const [parents, setParents] = useState<BatchRow[]>([])
  const [entry, setEntry] = useState<NanobodyParent>({ id: "nb_001", vhh: "" })
  const [displayName, setDisplayName] = useState("")
  const [settingsEdits, setSettingsEdits] = useState<Partial<Record<keyof NanobodySettings, string>>>({})
  const [batchPage, setBatchPage] = useState(0)
  const [importError, setImportError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [fileName, setFileName] = useState("")
  const fileVersion = useRef(0)
  const preparationController = useRef<AbortController | null>(null)
  const mutation = useMutation({
    mutationFn: ({ rows, signal }: { rows: BatchRow[]; signal: AbortSignal }) => prepareNanobodies({ parents: rows.map(({ id, vhh }) => ({ id, vhh })) }, signal),
    retry: false, gcTime: 0,
  })
  useExpireSession(options.error ?? mutation.error)
  useEffect(() => () => { fileVersion.current++; preparationController.current?.abort() }, [])
  const preview = mutation.variables?.rows === parents ? mutation.data : undefined
  const policyChanged = preview && preview.preparation_version !== options.data?.preparation_version
  const pageCount = Math.max(1, Math.ceil(parents.length / pageSize))
  const currentPage = Math.min(batchPage, pageCount - 1)
  const offset = currentPage * pageSize
  const dirty = Boolean(parents.length || entry.vhh || entry.id !== "nb_001" || displayName || Object.keys(settingsEdits).length || importing)
  const blocker = useBlocker(dirty)
  useBeforeUnload(useCallback((event) => {
    if (dirty) { event.preventDefault(); event.returnValue = true }
  }, [dirty]))
  useEffect(() => {
    if (blocker.state !== "blocked") return
    if (window.confirm("Leave this unsent batch? It is kept only on this page and will be lost.")) blocker.proceed()
    else blocker.reset()
  }, [blocker])

  function discardPreview() {
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

  const settingNames = Object.keys(nanobodySettingInfo) as (keyof NanobodySettings)[]
  const defaults = options.data?.defaults
  const optionsReady = options.data && typeof options.data.max_csv_bytes === "number" && typeof options.data.max_input_length === "number" && typeof options.data.preparation_version === "string" && settingNames.every((name) => typeof defaults?.[name] === "number")
  const oversized = parents.some((parent) => [...parent.id].length > 200 || options.data?.max_input_length !== undefined && parent.vhh.length > options.data.max_input_length)
  const overLimit = options.data && parents.length > options.data.max_parents
  const canPrepare = principal && optionsReady && parents.length > 0 && !overLimit && !oversized && !entry.vhh && !importing && !mutation.isPending
  function prepare(event: FormEvent) {
    event.preventDefault()
    if (!canPrepare) return
    preparationController.current?.abort()
    const controller = new AbortController()
    preparationController.current = controller
    mutation.mutate({ rows: parents, signal: controller.signal })
  }

  return <main className="mx-auto max-w-6xl space-y-6 px-6 py-10 lg:px-8">
    <Link className={buttonVariants({ variant: "ghost" })} to="/"><ArrowLeft aria-hidden="true" />All tools</Link>
    <header className="max-w-4xl space-y-3">
      <h1 className="text-3xl font-semibold">Humanize single-domain antibodies</h1>
      <p className="text-lg leading-8 text-muted-foreground">Add a VH domain or import a batch. Preparation trims non-variable flanks and completes missing terminal framework residues. Review each prepared sequence before humanization.</p>
      <p className="leading-7 text-muted-foreground">Any valid VH is accepted; recognition does not establish camelid origin or functional single-domain behavior. Original inputs remain editable and are kept separately from the prepared parental baseline.</p>
    </header>
    {options.isPending ? <p role="status" className="flex items-center gap-2"><LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />Loading preparation limits and defaults…</p> : null}
    {options.error ? <div role="alert"><p>Preparation options could not be loaded. {options.error.message}</p><Button className="mt-2" onClick={() => void options.refetch()} variant="outline">Retry options</Button></div> : null}
    {options.data && !optionsReady ? <p role="alert">Preparation needs updated service options. Reload the options before continuing.</p> : null}
    <form className="space-y-6" noValidate onSubmit={prepare}>
      <fieldset className="space-y-6" disabled={!principal || importing}>
        <div className="max-w-md"><label htmlFor="nanobody-name" className="text-sm font-medium">Job name</label><Input id="nanobody-name" className="mt-2" value={displayName} placeholder="Nanobody humanization" onChange={(event) => setDisplayName(event.target.value)} aria-invalid={displayName.trim().replace(/\s+/g, " ").length > 120} />{displayName.trim().replace(/\s+/g, " ").length > 120 ? <p className="text-sm text-destructive">Use at most 120 characters.</p> : null}</div>
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
            {preview?.errors.length ? <p role="alert" className="text-destructive">Some rows need correction. Valid prepared sequences are shown below. <button type="button" className="underline" onClick={() => setBatchPage(Math.floor(preview.errors[0].row_index / pageSize))}>Go to first invalid row</button></p> : null}
            {parents.slice(offset, offset + pageSize).map((parent, index) => {
              const rowIndex = offset + index
              const issues = preview?.errors.filter((error) => error.row_index === rowIndex) ?? []
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
          {nanobodySettingGroups.map((group) => <fieldset key={group.label} className="mt-5 border-t pt-4"><legend className="px-1 text-lg font-medium">{group.label}</legend><div className="grid gap-5 md:grid-cols-2">{group.names.map((name) => {
            const info = nanobodySettingInfo[name]
            const metadata = settingMetadata(options.data, name)
            const value = settingsEdits[name] ?? defaults?.[name] ?? ""
            const numeric = Number(value)
            const invalid = value === "" || !Number.isFinite(numeric) || metadata.type === "integer" && !Number.isInteger(numeric) || metadata.minimum !== undefined && numeric < metadata.minimum || metadata.maximum !== undefined && numeric > metadata.maximum
            return <div key={name}><label className="text-sm font-medium" htmlFor={`nano-${name}`}>{info.label}</label><Input id={`nano-${name}`} type="number" disabled={!optionsReady} min={metadata.minimum} max={metadata.maximum} step={metadata.type === "integer" ? 1 : "any"} value={value} aria-invalid={!!optionsReady && invalid} onChange={(event) => setSettingsEdits((current) => ({ ...current, [name]: event.target.value }))} /><p className="mt-1 text-sm leading-7 text-muted-foreground">{info.help}</p>{optionsReady && invalid ? <p className="text-sm text-destructive">Enter a valid number within the displayed bounds.</p> : null}</div>
          })}</div></fieldset>)}
        </details>
        {entry.vhh ? <p className="text-sm text-muted-foreground">Add or clear the sequence above before preparing the batch.</p> : null}
        {mutation.error ? <p role="alert" className="text-destructive">Preparation could not be completed. {mutation.error.message} Retry explicitly after correcting any input or session problem.</p> : null}
        {policyChanged ? <p role="alert">The preparation policy changed. <button type="button" className="underline" onClick={() => { discardPreview(); void options.refetch() }}>Reload options</button> and prepare again.</p> : null}
        {preview?.preparation_digest && !policyChanged ? <p role="status">Batch prepared. Review the prepared parental sequences above.</p> : null}
        <Button type="submit" disabled={!canPrepare}>{mutation.isPending ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : null}{mutation.isPending ? "Preparing sequences…" : "Prepare sequences"}</Button>
        <p className="text-sm leading-7 text-muted-foreground">Preparation does not start a scientific job. This draft exists only in memory and is lost when you leave or reload.</p>
      </fieldset>
    </form>
  </main>
}
