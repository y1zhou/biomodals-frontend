import { useMutation, useQuery } from "@tanstack/react-query"
import { Menu } from "@base-ui/react/menu"
import { ArrowLeft, Check, ChevronDown, Columns3, LoaderCircle, Plus } from "lucide-react"
import { useEffect, useRef, useState, type FormEvent } from "react"
import { Link } from "react-router"
import { analyzeAntibodies, antibodyAnalysisOptions } from "@/api/client"
import { ANALYSIS_VERSION, analysisColumns, exampleAntibodyFasta, type AnalysisRequest } from "@/antibody-analysis"
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
  const resultsHeading = useRef<HTMLHeadingElement>(null)
  const options = useQuery({ queryKey: ["antibody-analysis-options"], queryFn: ({ signal }) => antibodyAnalysisOptions(signal), enabled: !!principal, retry: false, staleTime: Infinity })
  const compatible = options.data?.analysis_version === ANALYSIS_VERSION
  const mutation = useMutation({
    mutationFn: ({ input, signal }: { input: AnalysisRequest; signal: AbortSignal; revealResults: boolean }) => analyzeAntibodies(input, signal),
    retry: false, gcTime: 0,
  })
  useExpireSession(options.error ?? mutation.error)
  useEffect(() => () => { request.current?.abort(); fileVersions.current = {} }, [])
  useEffect(() => {
    if (!mutation.isSuccess || !mutation.variables.revealResults) return
    resultsHeading.current?.focus({ preventScroll: true })
    resultsHeading.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" })
  }, [mutation.isSuccess, mutation.variables])
  // Delay one task so StrictMode's initial setup/cleanup does not send two requests.
  useEffect(() => {
    if (!source || !compatible || !principal || automaticStarted.current) return
    const timer = window.setTimeout(() => {
      if (automaticStarted.current) return
      automaticStarted.current = true
      setTransfer(null)
      runAnalysis([{ id: "Group 1", fasta: selectedFasta(source.entries) }])
    }, 0)
    return () => window.clearTimeout(timer)
  })
  function runAnalysis(inputGroups = groups, revealResults = false) {
    if (!compatible || !options.data || !principal || mutation.isPending) return
    const input = { groups: inputGroups }
    if (new TextEncoder().encode(JSON.stringify(input)).byteLength > options.data.max_request_bytes) {
      setError(`The request exceeds ${(options.data.max_request_bytes / 1024 / 1024).toFixed(0)} MiB. Reduce the FASTA input.`)
      return
    }
    setError(null)
    request.current?.abort()
    request.current = new AbortController()
    mutation.mutate({ input, signal: request.current.signal, revealResults })
  }
  function stopAutomaticAnalysis() { automaticStarted.current = true; setTransfer(null) }
  function submit(event: FormEvent) { event.preventDefault(); stopAutomaticAnalysis(); runAnalysis(groups, true) }
  function edit(id: string, fasta: string) {
    stopAutomaticAnalysis()
    fileVersions.current[id] = (fileVersions.current[id] ?? 0) + 1
    setGroups((current) => current.map((group) => group.id === id ? { ...group, fasta } : group))
    setFileNames((current) => ({ ...current, [id]: "" }))
    setError(null)
  }
  async function importFile(id: string, file: File | null) {
    if (!file || !options.data) return
    stopAutomaticAnalysis()
    const version = (fileVersions.current[id] ?? 0) + 1
    fileVersions.current[id] = version
    if (file.size > options.data.max_request_bytes) { setError("This file is larger than the total request limit."); return }
    try {
      const text = await file.text()
      if (fileVersions.current[id] !== version) return
      edit(id, text)
      setFileNames((current) => ({ ...current, [id]: file.name }))
      setError(null)
    } catch { if (fileVersions.current[id] === version) setError("The FASTA file could not be read. Try pasting its contents instead.") }
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
    {source ? <p className="rounded-lg border bg-muted/40 p-4 leading-7">{source.singleDomain ? "Selected VH sequences were copied from a nanobody result for standalone analysis. Model scores, ranks and parental comparisons remain on the source result page." : "Selected chains were copied from a humanization result. Recombined pairs have no inherited model scores or ranks; pairing compatibility has not been evaluated."}</p> : null}
    <details className="rounded-xl border p-4 leading-7" open={!source}><summary className="cursor-pointer text-lg font-semibold">FASTA input formats</summary>
      <div className="mt-3 grid gap-4 lg:grid-cols-3"><div><p>One pair per record</p><pre className="mt-2 rounded bg-muted p-3 text-sm">{">pair_1\nVH_SEQUENCE:VL_SEQUENCE"}</pre></div><div><p>Matched records with _vh / _vl suffixes</p><pre className="mt-2 rounded bg-muted p-3 text-sm">{">pair_1_vh\nVH_SEQUENCE\n>pair_1_vl\nVL_SEQUENCE"}</pre></div><div><p>Standalone heavy or light domain</p><pre className="mt-2 rounded bg-muted p-3 text-sm">{">domain_1\nSEQUENCE"}</pre></div></div>
      <p className="mt-3 text-sm text-muted-foreground">Use canonical amino acids. Whitespace is removed and letters are uppercased; sequences are never trimmed. The first header token is the ID. IDs must be unique within each group. Paired records require both chains; standalone domains are classified without inventing a missing partner.</p>
      {options.data ? <p className="mt-2 text-sm text-muted-foreground">Up to {options.data.max_entries_per_group.toLocaleString()} output entries per group, {options.data.max_chain_length} residues per chain and {options.data.max_request_bytes / 1024 / 1024} MiB total request.</p> : null}
    </details>
    <form className="space-y-4" onSubmit={submit}>
      <div className={`grid gap-5 ${groups.length === 2 ? "xl:grid-cols-2" : ""}`}>{groups.map((group, index) => <fieldset key={group.id} className="min-w-0 space-y-3 rounded-xl border p-4" disabled={mutation.isPending}>
        <div className="flex items-center justify-between gap-3"><label className="text-lg font-semibold" htmlFor={`fasta-${index}`}>{group.id} FASTA</label>{index ? <Button type="button" variant="ghost" onClick={() => { edit(group.id, ""); setGroups((current) => current.slice(0, 1)) }}>Remove group</Button> : null}</div>
        {index === 0 ? <div className="flex flex-wrap items-center gap-3"><Button type="button" variant="outline" aria-describedby="example-sequences-help" onClick={() => edit(group.id, exampleAntibodyFasta)}>Load example sequences</Button><p id="example-sequences-help" className="text-sm text-muted-foreground">Replaces Group 1 with pembrolizumab, OKT3 and Ozoralizumab. Group 2 stays unchanged. Click Analyze sequences when ready.</p></div> : null}
        <textarea className="min-h-44 w-full rounded-lg border bg-background p-3 font-mono text-sm leading-6" id={`fasta-${index}`} value={group.fasta} spellCheck={false} onChange={(event) => edit(group.id, event.target.value)} required />
        <FileDropZone id={`fasta-file-${index}`} label={`${group.id} FASTA file`} accept=".fa,.fasta,.faa,.txt,text/plain" help="Upload a file to replace the text in this group." fileName={fileNames[group.id]} disabled={!options.data || mutation.isPending} onSelect={(file) => void importFile(group.id, file)} />
      </fieldset>)}</div>
      <div className="flex flex-wrap gap-3">{groups.length < (options.data?.max_groups ?? 1) ? <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => { stopAutomaticAnalysis(); setGroups((current) => [...current, { id: "Group 2", fasta: "" }]) }}><Plus aria-hidden="true" />Add comparison group</Button> : null}<Button disabled={!compatible || !principal || mutation.isPending} type="submit">{mutation.isPending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}{mutation.isPending ? "Analyzing sequences…" : "Analyze sequences"}</Button></div>
      {options.data && !compatible ? <p role="alert">Sequence analysis requires an updated API (analysis version {ANALYSIS_VERSION}). Your input remains editable.</p> : null}
      {options.isPending ? <p role="status">Loading analysis limits…</p> : null}
      {options.error ? <div role="alert"><p>Analysis options could not be loaded. {options.error.message}</p><Button type="button" variant="outline" onClick={() => void options.refetch()}>Reload options</Button></div> : null}
      {error || mutation.error ? <p role="alert" className="rounded-lg bg-destructive/10 p-3 leading-7 text-destructive">{error ?? `Analysis could not be completed. ${mutation.error?.message} Sign in if needed, then try again.`}</p> : null}
    </form>
    {result ? <section className="space-y-5" aria-label="Analysis results">
      <h2 ref={resultsHeading} tabIndex={-1} className="scroll-mt-24 text-2xl font-semibold">Sequence properties and germline matches</h2>
      {inputsChanged ? <p role="status" className="rounded-lg border bg-muted/40 p-3">Inputs changed. Analyze again to update these results.</p> : null}
      <div className="space-y-2 text-sm leading-7 text-muted-foreground">
        <p>pI, mass and GRAVY use the full supplied sequence, including any tags or tails. GRAVY is the mean residue hydrophobicity on Biopython’s BlackMould scale; higher values mean more hydrophobic. VH+VL pI uses VH followed directly by VL, without a linker.</p>
        <p>VH/VL germline pI uses the full representative V and J reference sequences joined without D or a linker, including ends omitted from the local alignments. It uses the first native hit for each segment; all tied references remain in gene details. Unavailable values stay missing.</p>
        <p>Numbering and germline matches describe the detected variable domain. Potential liabilities are checked across the full supplied sequence. Issues report input or annotation diagnostics, not quality scores.</p>
        <p>Click headers to sort using full precision; missing values stay last. Groups have independent orders and pages of 50 entries. Columns controls both groups. CSV includes all metrics at full precision; selected-pair FASTA includes VH:VL pairs and unchanged standalone sequences.</p>
      </div>
      <AntibodyReferenceFaq reference={result.reference} />
      <Menu.Root modal={false}>
        <Menu.Trigger aria-label="Columns" className={buttonVariants({ variant: "outline" })}><Columns3 aria-hidden="true" /> Columns ({columns.length}/{availableColumns.length}) <ChevronDown aria-hidden="true" /></Menu.Trigger>
        <Menu.Portal><Menu.Positioner align="start" className="z-50" sideOffset={8}>
          <Menu.Popup className="max-h-[min(24rem,var(--available-height))] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg outline-none">
            <Menu.Item closeOnClick={false} className="cursor-pointer rounded px-3 py-2 font-medium outline-none data-highlighted:bg-accent" onClick={() => setHidden(new Set())}>Show all columns</Menu.Item>
            <Menu.Separator className="my-1 border-t" />
            {availableColumns.map((column) => <Menu.CheckboxItem key={column.name} checked={!hidden.has(column.name)} closeOnClick={false} className="flex cursor-pointer items-start gap-2 rounded px-3 py-2 text-sm outline-none data-highlighted:bg-accent" onCheckedChange={(checked) => setHidden((current) => { const next = new Set(current); if (checked) next.delete(column.name); else next.add(column.name); return next })}>
              <span className="mt-1 size-4 shrink-0"><Menu.CheckboxItemIndicator><Check aria-hidden="true" className="size-4" /></Menu.CheckboxItemIndicator></span><span>{column.label}</span>
            </Menu.CheckboxItem>)}
          </Menu.Popup>
        </Menu.Positioner></Menu.Portal>
      </Menu.Root>
      <div className={`grid items-start gap-5 ${result.groups.length === 2 ? "xl:grid-cols-2" : ""}`}>{result.groups.map((group) => <AntibodyAnalysisTable key={`${mutation.submittedAt}:${group.id}`} group={group} columns={columns} origins={source && group.id === "Group 1" ? source.entries : undefined} onInspect={(sequence, label) => setInspected({ sequence, label })} />)}</div>
    </section> : null}
    {inspected ? <AntibodySequenceDialog key={inspected.sequence} {...inspected} onClose={() => setInspected(null)} /> : null}
  </main>
}
