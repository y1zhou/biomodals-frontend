import { useMutation, useQuery } from "@tanstack/react-query"
import { ArrowLeft, LoaderCircle, Plus } from "lucide-react"
import { useEffect, useRef, useState, type FormEvent } from "react"
import { Link } from "react-router"
import { analyzeAntibodies, antibodyAnalysisOptions } from "@/api/client"
import { analysisColumns, type AnalysisRequest } from "@/antibody-analysis"
import { selectedFasta } from "@/antibody-selection"
import { useAntibodyTransfer } from "@/antibody-transfer"
import { authenticatedPrincipal, useCurrentUser, useExpireSession } from "@/auth-state"
import AntibodyAnalysisTable from "@/components/AntibodyAnalysisTable"
import AntibodyReferenceFaq from "@/components/AntibodyReferenceFaq"
import AntibodySequenceDialog from "@/components/AntibodySequenceDialog"
import FileDropZone from "@/components/FileDropZone"
import { Button, buttonVariants } from "@/components/ui/button"

export default function AntibodyAnalysisPage() {
  const principal = authenticatedPrincipal(useCurrentUser().data)
  const { transfer, setTransfer } = useAntibodyTransfer()
  const [source] = useState(transfer)
  const [groups, setGroups] = useState(() => [{ id: "Group 1", fasta: transfer ? selectedFasta(transfer.entries) : "" }])
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set())
  const [error, setError] = useState<string | null>(null)
  const [inspected, setInspected] = useState<{ sequence: string; label: string } | null>(null)
  const [fileNames, setFileNames] = useState<Record<string, string>>({})
  const request = useRef<AbortController | null>(null)
  const fileVersions = useRef<Record<string, number>>({})
  const automaticStarted = useRef(false)
  const options = useQuery({ queryKey: ["antibody-analysis-options"], queryFn: ({ signal }) => antibodyAnalysisOptions(signal), enabled: !!principal, retry: false, staleTime: Infinity })
  const mutation = useMutation({
    mutationFn: ({ input, signal }: { input: AnalysisRequest; signal: AbortSignal }) => analyzeAntibodies(input, signal),
    retry: false, gcTime: 0,
  })
  useExpireSession(options.error ?? mutation.error)
  useEffect(() => () => { request.current?.abort(); fileVersions.current = {} }, [])
  // Delay one task so StrictMode's initial setup/cleanup does not send two requests.
  useEffect(() => {
    if (!source || !options.data || !principal || automaticStarted.current) return
    const timer = window.setTimeout(() => {
      automaticStarted.current = true
      setTransfer(null)
      runAnalysis([{ id: "Group 1", fasta: selectedFasta(source.entries) }])
    }, 0)
    return () => window.clearTimeout(timer)
  })
  function runAnalysis(inputGroups = groups) {
    if (!options.data || !principal || mutation.isPending) return
    const input = { groups: inputGroups }
    if (new TextEncoder().encode(JSON.stringify(input)).byteLength > options.data.max_request_bytes) {
      setError(`The request exceeds ${(options.data.max_request_bytes / 1024 / 1024).toFixed(0)} MiB. Reduce the FASTA input.`)
      return
    }
    setError(null)
    request.current?.abort()
    request.current = new AbortController()
    mutation.mutate({ input, signal: request.current.signal })
  }
  function submit(event: FormEvent) { event.preventDefault(); automaticStarted.current = true; runAnalysis() }
  function edit(id: string, fasta: string) {
    fileVersions.current[id] = (fileVersions.current[id] ?? 0) + 1
    setGroups((current) => current.map((group) => group.id === id ? { ...group, fasta } : group))
  }
  async function importFile(id: string, file: File | null) {
    if (!file || !options.data) return
    if (file.size > options.data.max_request_bytes) { setError("This file is larger than the total request limit."); return }
    const version = (fileVersions.current[id] ?? 0) + 1
    fileVersions.current[id] = version
    try {
      const text = await file.text()
      if (fileVersions.current[id] !== version) return
      edit(id, text)
      setFileNames((current) => ({ ...current, [id]: file.name }))
      setError(null)
    } catch { setError("The FASTA file could not be read. Try pasting its contents instead.") }
  }
  const result = mutation.data
  const hasUnassigned = result?.groups.some((group) => group.entries.some((entry) => entry.unassigned))
  const availableColumns = analysisColumns.filter((column) => !column.name.startsWith("unassigned_") || hasUnassigned)
  const columns = availableColumns.filter((column) => !hidden.has(column.name))
  const analyzedGroups = mutation.variables?.input.groups
  const inputsChanged = result && (groups.length !== analyzedGroups?.length || groups.some((group, index) => group.id !== analyzedGroups?.[index]?.id || group.fasta !== analyzedGroups?.[index]?.fasta))
  return <main className="mx-auto max-w-[100rem] space-y-8 px-6 py-10 lg:px-8">
    <header className="max-w-4xl space-y-4">
      <Link className={buttonVariants({ variant: "ghost" })} to="/"><ArrowLeft aria-hidden="true" />All tools</Link>
      <h1 className="text-3xl font-semibold tracking-tight">Antibody sequence analysis</h1>
      <p className="text-lg leading-8 text-muted-foreground">Inspect antibody domains, germline matches and physicochemical properties. Analyze one FASTA group or compare two independent groups side by side.</p>
      <p className="text-sm leading-7 text-muted-foreground">Analysis runs on the service without creating a job. Inputs and results stay in this page’s memory and are lost when you leave or reload.</p>
    </header>
    {source ? <p className="rounded-lg border bg-muted/40 p-4 leading-7">Selected chains were copied from a humanization result and analyzed automatically. Recombined pairs have no inherited model scores or ranks; pairing compatibility has not been evaluated.</p> : null}
    <details className="rounded-xl border p-4 leading-7" open={!source}><summary className="cursor-pointer text-lg font-semibold">FASTA input formats</summary>
      <div className="mt-3 grid gap-4 lg:grid-cols-3"><div><p>One pair per record</p><pre className="mt-2 rounded bg-muted p-3 text-sm">{">pair_1\nVH_SEQUENCE:VL_SEQUENCE"}</pre></div><div><p>Matched records with _vh / _vl suffixes</p><pre className="mt-2 rounded bg-muted p-3 text-sm">{">pair_1_vh\nVH_SEQUENCE\n>pair_1_vl\nVL_SEQUENCE"}</pre></div><div><p>Standalone heavy or light domain</p><pre className="mt-2 rounded bg-muted p-3 text-sm">{">domain_1\nSEQUENCE"}</pre></div></div>
      <p className="mt-3 text-sm text-muted-foreground">Use canonical amino acids. Whitespace is removed and letters are uppercased; sequences are never trimmed. The first header token is the ID. IDs must be unique within each group. Paired records require both chains; standalone domains are classified without inventing a missing partner.</p>
      {options.data ? <p className="mt-2 text-sm text-muted-foreground">Up to {options.data.max_entries_per_group.toLocaleString()} output entries per group, {options.data.max_chain_length} residues per chain and {options.data.max_request_bytes / 1024 / 1024} MiB total request.</p> : null}
    </details>
    <form className="space-y-4" onSubmit={submit}>
      <div className={`grid gap-5 ${groups.length === 2 ? "xl:grid-cols-2" : ""}`}>{groups.map((group, index) => <fieldset key={group.id} className="min-w-0 space-y-3 rounded-xl border p-4" disabled={mutation.isPending}>
        <div className="flex items-center justify-between gap-3"><label className="text-lg font-semibold" htmlFor={`fasta-${index}`}>{group.id} FASTA</label>{index ? <Button type="button" variant="ghost" onClick={() => { edit(group.id, ""); setGroups((current) => current.slice(0, 1)) }}>Remove group</Button> : null}</div>
        <textarea className="min-h-44 w-full rounded-lg border bg-background p-3 font-mono text-sm leading-6" id={`fasta-${index}`} value={group.fasta} spellCheck={false} onChange={(event) => edit(group.id, event.target.value)} required />
        <FileDropZone id={`fasta-file-${index}`} label={`${group.id} FASTA file`} accept=".fa,.fasta,.faa,.txt,text/plain" help="Upload a file to replace the text in this group." fileName={fileNames[group.id]} disabled={!options.data || mutation.isPending} onSelect={(file) => void importFile(group.id, file)} />
      </fieldset>)}</div>
      <div className="flex flex-wrap gap-3">{groups.length < (options.data?.max_groups ?? 1) ? <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => setGroups((current) => [...current, { id: "Group 2", fasta: "" }])}><Plus aria-hidden="true" />Add comparison group</Button> : null}<Button disabled={!options.data || !principal || mutation.isPending} type="submit">{mutation.isPending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}{mutation.isPending ? "Analyzing sequences…" : "Analyze sequences"}</Button></div>
      {options.isPending ? <p role="status">Loading analysis limits…</p> : null}
      {options.error ? <div role="alert"><p>Analysis options could not be loaded. {options.error.message}</p><Button type="button" variant="outline" onClick={() => void options.refetch()}>Reload options</Button></div> : null}
      {error || mutation.error ? <p role="alert" className="rounded-lg bg-destructive/10 p-3 leading-7 text-destructive">{error ?? `Analysis could not be completed. ${mutation.error?.message} Sign in if needed, then try again.`}</p> : null}
    </form>
    {result ? <section className="space-y-5" aria-label="Analysis results">
      <h2 className="text-2xl font-semibold">Sequence properties and germline matches</h2>
      {inputsChanged ? <p role="status" className="rounded-lg border bg-muted/40 p-3">Inputs changed. Analyze again to update these results.</p> : null}
      <p className="text-sm leading-7 text-muted-foreground">Click headers to sort using full precision; missing values stay last. Each group has its own order and pages of 50 entries. VH+VL sequence pI uses concatenated chains as a sequence-level approximation, not a modeled complex. EC280 assumes either reduced cysteines or disulfides (M⁻¹ cm⁻¹). CSV downloads retain full precision.</p>
      <AntibodyReferenceFaq reference={result.reference} />
      <details className="rounded-lg border p-4"><summary className="cursor-pointer font-medium">Columns · shared across groups</summary><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{availableColumns.filter((column) => column.name !== "id").map((column) => <label className="flex items-center gap-2 text-sm" key={column.name}><input type="checkbox" checked={!hidden.has(column.name)} onChange={(event) => setHidden((current) => { const next = new Set(current); if (event.target.checked) next.delete(column.name); else next.add(column.name); return next })} />{column.label}</label>)}</div></details>
      <div className={`grid items-start gap-5 ${result.groups.length === 2 ? "xl:grid-cols-2" : ""}`}>{result.groups.map((group) => <AntibodyAnalysisTable key={`${mutation.submittedAt}:${group.id}`} group={group} columns={columns} origins={source && group.id === "Group 1" ? source.entries : undefined} onInspect={(sequence, label) => setInspected({ sequence, label })} />)}</div>
    </section> : null}
    {inspected ? <AntibodySequenceDialog key={inspected.sequence} {...inspected} onClose={() => setInspected(null)} /> : null}
  </main>
}
