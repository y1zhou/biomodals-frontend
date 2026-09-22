import { Popover } from "@base-ui/react/popover"
import { Menu } from "@base-ui/react/menu"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronDown, ChevronLeft, ChevronRight, Columns3, Copy, ListFilter } from "lucide-react"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router"

import { antibodyAnalysisOptions, apiErrorCode, humanizationInputs, humanizationSelection } from "@/api/client"
import { ANALYSIS_VERSION } from "@/antibody-analysis"
import { selectedEntries, selectChain, type SelectedChain } from "@/antibody-selection"
import { useAntibodyTransfer } from "@/antibody-transfer"
import { authenticatedPrincipal, useCurrentUser, useExpireSession } from "@/auth-state"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { candidateColumnLabel, candidateColumns, formatCandidateNumber, type HumanizationSelection, type SelectionQuery } from "@/humanization"
import { shouldRetryJobQuery } from "@/jobs"
import { copyText } from "@/lib/clipboard"
import AntibodyGeneCell from "@/components/AntibodyGeneCell"
import AntibodyReferenceFaq from "@/components/AntibodyReferenceFaq"
import AntibodySequenceDialog from "@/components/AntibodySequenceDialog"
import { ChainSelectionCell, ChainSelectionPanel } from "@/components/HumanizationChainSelection"
import { antibodyAnalysisPath } from "@/tools"

function ExpandableCell({ value }: { value: string }) {
  const [copyStatus, setCopyStatus] = useState("")
  useEffect(() => {
    if (copyStatus !== "Copied") return
    const timer = window.setTimeout(() => setCopyStatus(""), 2000)
    return () => window.clearTimeout(timer)
  }, [copyStatus])
  return <details className="w-64">
    <summary className="cursor-pointer truncate font-mono text-xs">{value}</summary>
    <p className="mt-2 break-all font-mono text-xs">{value}</p>
    <Button aria-live="polite" disabled={copyStatus === "Copied"} className="mt-2" onClick={() => void copyText(value).then(() => setCopyStatus("Copied"), () => setCopyStatus("Copy failed; select the text to copy it."))} type="button" variant="outline">{copyStatus === "Copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />} {copyStatus === "Copied" ? "Copied" : "Copy ID"}</Button>
    {copyStatus && copyStatus !== "Copied" ? <p role="alert" className="mt-1 text-sm">{copyStatus}</p> : null}
  </details>
}

function ValueBar({ value, signed, small = false }: { value: number; signed: boolean; small?: boolean }) {
  const width = Math.abs(value) * (signed ? 50 : 100)
  return <span aria-hidden="true" className={small ? "relative mt-1 block h-1.5 overflow-hidden rounded bg-muted" : "absolute inset-0 overflow-hidden rounded"}>
    <span className={`absolute inset-y-0 ${small || signed ? value < 0 ? "bg-red-200" : "bg-emerald-200/60" : "bg-neutral-200/70"}`} style={{ left: `${signed ? value < 0 ? 50 - width : 50 : 0}%`, width: `${width}%` }} />
    {signed ? <span className="absolute inset-y-0 left-1/2 border-l border-foreground/20" /> : null}
  </span>
}

function ScoreCell({ name, value, deltaValue, ranges }: { name: string; value: number; deltaValue: unknown; ranges: HumanizationSelection["nativeness_ranges"] | undefined }) {
  const delta = name.endsWith("_delta")
  const score = /_(probability|score|likeness|nativeness)$/.test(name)
  if (!score && !delta) return <span title={String(value)} className={name === "cdr_mutations" && value !== 0 ? "rounded bg-red-100 px-1 font-medium tabular-nums text-red-800" : "tabular-nums"}>{formatCandidateNumber(value)}</span>
  const nativeness = /^pabnativ2_.*_nativeness(?:_delta)?$/.test(name)
  function scaled(column: string, raw: number) {
    if (!nativeness) return Math.abs(raw) <= 1 ? raw : undefined
    const range = ranges?.[column.replace(/_delta$/, "")]
    if (!range) return undefined
    const difference = column.endsWith("_delta")
    const width = range.max - range.min
    return width === 0 ? difference ? 0 : 0.5 : difference ? raw / width : (raw - range.min) / width
  }
  const barValue = scaled(name, value)
  const deltaBar = typeof deltaValue === "number" ? scaled(`${name}_delta`, deltaValue) : undefined
  return <span className="block min-w-24 tabular-nums" title={String(value)}>
    <span className="relative block rounded px-2 py-1 text-center">
      {barValue !== undefined ? <ValueBar value={barValue} signed={delta} /> : null}
      <span className="relative">{formatCandidateNumber(value)}</span>
    </span>
    {!delta && deltaBar !== undefined ? <span className="block" aria-label={`Change from parent: ${deltaValue}`} title={`Change from parent: ${deltaValue}`}><ValueBar value={deltaBar} signed small /></span> : null}
  </span>
}

export default function HumanizationResults({ jobId }: { jobId: string }) {
  const user = useCurrentUser()
  const principal = authenticatedPrincipal(user.data)
  const navigate = useNavigate()
  const { setTransfer } = useAntibodyTransfer()
  const [selection, setSelection] = useState<SelectedChain[]>([])
  const [selectionError, setSelectionError] = useState<string | null>(null)
  const [inspected, setInspected] = useState<{ sequence: string; label: string; parentId: string; role: "vh" | "vl" } | null>(null)
  const analysisOptions = useQuery({ queryKey: ["antibody-analysis-options"], queryFn: ({ signal }) => antibodyAnalysisOptions(signal), enabled: !!authenticatedPrincipal(user.data), staleTime: Infinity, retry: false })
  const inputs = useQuery({
    queryKey: ["humanization", "parent-inputs", principal?.user_id, jobId],
    queryFn: ({ signal }) => humanizationInputs(jobId, signal),
    enabled: !!principal && !!inspected && analysisOptions.data?.analysis_version === ANALYSIS_VERSION,
    staleTime: Infinity, gcTime: 0, retry: false,
    refetchOnWindowFocus: false, refetchOnReconnect: false,
  })
  const parentalSequence = inspected ? inputs.data?.pairs.find((pair) => pair.id === inspected.parentId)?.[inspected.role] : undefined
  useExpireSession(inputs.error)
  const [parentFilterOpen, setParentFilterOpen] = useState(false)
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({})
  const [view, setView] = useState<SelectionQuery>({ offset: 0, limit: 50, parentId: "", sortBy: "", descending: false })
  const query = useQuery({
    queryKey: ["humanization", "selection", jobId, view],
    queryFn: ({ signal }) => humanizationSelection(jobId, view, signal),
    enabled: Boolean(authenticatedPrincipal(user.data)),
    retry: (count, error) => apiErrorCode(error) !== "result_not_cached" && shouldRetryJobQuery(count, error),
    staleTime: Infinity,
    gcTime: 0,
    placeholderData: keepPreviousData,
  })
  useExpireSession(query.error ?? analysisOptions.error)
  const data = query.data
  const loadingPage = query.isPending || query.isPlaceholderData
  function columnVisible(name: string) {
    return columnVisibility[name] ?? !(["is_parent", "cdr_preservation"].includes(name) || name.endsWith("_delta") || /^humatch_.*_family$/.test(name) || data?.default_hidden_columns?.includes(name))
  }
  const columns = candidateColumns(data?.columns ?? [])
  const visibleColumns = columns.filter((column) => columnVisible(column.name))
  const pageCount = Math.max(1, Math.ceil((data?.total_rows ?? 0) / view.limit))
  const currentPage = Math.floor((data?.offset ?? 0) / view.limit) + 1
  function sort(column: string) {
    setView((current) => ({ ...current, offset: 0, sortBy: column, descending: current.sortBy === column ? !current.descending : false }))
  }
  const selectClass = "h-9 max-w-full rounded-lg border border-input bg-background px-2 text-sm"

  function analyzeSelection() {
    if (!analysisOptions.data) return
    try {
      const entries = selectedEntries(selection, analysisOptions.data.max_entries_per_group)
      setTransfer({ sourceJobId: jobId, entries })
      navigate(antibodyAnalysisPath)
    } catch (error) { setSelectionError(error instanceof Error ? error.message : "The selection could not be analyzed.") }
  }

  return <Card className="mt-6 min-w-0">
    <CardHeader>
      <CardTitle>Humanization candidates</CardTitle>
      <p className="text-sm leading-7 text-muted-foreground">Compare candidates with their unchanged parents, shown as gray rows.</p>
      <section aria-labelledby="candidate-scores-heading" className="mt-3 w-full space-y-3">
          <h3 className="text-lg font-semibold" id="candidate-scores-heading">Understand the ranking and scores</h3>
          <details className="text-sm leading-7 text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground underline decoration-dotted underline-offset-4">Understand the ranking</summary>
          <dl className="mt-3 space-y-3">
            <div><dt className="font-medium text-foreground">quality_tier · lower is better</dt><dd>Per-parent Pareto tiers balance higher model scores with fewer mutations. Tier 1 is best.</dd></div>
            <div><dt className="font-medium text-foreground">panel_order · lower comes first</dt><dd>A suggested testing order for each parent, balancing quality and sequence diversity. Starts at 1.</dd></div>
            <div><dt className="font-medium text-foreground">Missing ranks</dt><dd>Parents and candidates that fail ranking requirements remain unranked. Missing values do not mean zero or the worst tier.</dd></div>
          </dl>
          <p className="mt-3">These ranks are simple heuristics constructed from the model scores. You may use any other combinatory ranking method to pick out top candidates.</p>
          </details>
          <details className="text-sm leading-7 text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground underline decoration-dotted underline-offset-4">What are the color bars</summary>
            <dl className="mt-3 space-y-3">
            <div><dt className="font-medium text-foreground">Gray bar · model score</dt><dd>Bars span 0–1. Numbers show the original score, rounded to 3 decimals.</dd></div>
            <div><dt className="font-medium text-foreground">Thin bar · change from parent</dt><dd>Green to the right means higher; red to the left means lower. Zero means unchanged.</dd></div>
            <div><dt className="font-medium text-foreground">Red CDR mutation counts</dt><dd>Flag candidates with changes to CDRs.</dd></div>
            </dl>
            <div className="mt-3 space-y-3">
              <h4 className="font-medium text-foreground">How nativeness bars are scaled</h4>
              <p>Nativeness bars map the full column’s minimum and maximum to 0–1. Their deltas use that same range, spanning −1 to +1. This relative scale is not comparable across jobs.</p>
              <p>Constant columns use a half-width score bar and zero delta. Other delta bars use raw score units from −1 to +1. Displayed numbers and sorting retain the original scale.</p>
            </div>
          </details>
          <details className="text-sm leading-7 text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground underline decoration-dotted underline-offset-4">Sapiens scores</summary>
            <div className="mt-3 space-y-3">
              <p>The VH and VL mean probabilities average the probabilities Sapiens assigns to the sequence’s observed amino acids. Values range from 0 to 1; higher means the residues are more likely under the model.</p>
              <p>Each chain is scored separately. This is a sequence-model score, not the probability that the antibody will work experimentally.</p>
            </div>
          </details>
          <details className="text-sm leading-7 text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground underline decoration-dotted underline-offset-4">p-AbNatiV2 scores</summary>
            <div className="mt-3 space-y-3">
              <p><strong className="font-medium text-foreground">Nativeness</strong> scores describe how well the model reconstructs the pair or individual VH and VL chains. Higher is better in the model’s scoring direction. These rescaled scores can be negative and are not probabilities or restricted to 0–1.</p>
              <p><strong className="font-medium text-foreground">Pairing score</strong> is a separate 0–1 model score for the VH–VL pair. Higher means stronger model support for the pair; it does not measure experimental success.</p>
              <p>The table displays the original scores. Nativeness bars use a scale relative to this job’s candidates, as explained under “What are the color bars”.</p>
            </div>
          </details>
          <details className="text-sm leading-7 text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground underline decoration-dotted underline-offset-4">Humatch scores</summary>
            <div className="mt-3 space-y-3">
              <p><strong className="font-medium text-foreground">Target probability</strong> measures the classifier’s support for the selected human V-gene family, separately for VH and VL. Values range from 0 to 1; higher means stronger support for that family.</p>
              <p>With an automatic target, the workflow selects a human family from the parent sequence and keeps it fixed when scoring that parent’s candidates.</p>
              <p><strong className="font-medium text-foreground">Best-family probability</strong> is the score for the candidate’s highest-scoring human family. It can be high even when the fixed target’s score is low. Enable the target_family and best_family columns in Columns to compare them.</p>
            </div>
          </details>
          <details className="text-sm leading-7 text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground underline decoration-dotted underline-offset-4">Why Humatch probabilities can be near zero</summary>
            <div className="mt-3 space-y-3">
              <p><strong className="font-medium text-foreground">Small probabilities:</strong> values such as 0.00012 display as 1.200e-4, rather than rounding to zero. The archive’s selection.csv retains the unrounded values.</p>
              <p><strong className="font-medium text-foreground">Low support for the target:</strong> the classifier may favor another human family or its negative class. Compare target and best-family probabilities to distinguish these possibilities.</p>
              <p>Zero is a score, not a missing-value marker. Missing scores appear as —. These probabilities do not measure sequence identity or the chance of experimental success.</p>
            </div>
          </details>
          <details className="text-sm leading-7 text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground underline decoration-dotted underline-offset-4">Humatch pairing and germline likeness</summary>
            <div className="mt-3 space-y-3">
              <p><strong className="font-medium text-foreground">Pairing score</strong> is the paired classifier’s score for the VH–VL pair, on a 0–1 scale. Higher means stronger model support for the pair.</p>
              <p><strong className="font-medium text-foreground">Germline likeness</strong> averages the observed residue frequencies for the target family over the padded sequence length. It ranges from 0 to 1 and is a frequency-based score, not sequence identity or classifier confidence.</p>
              <p>Deltas subtract the same parent’s score from the candidate’s score. Positive means a higher model score; it is not a percentage improvement or measured experimental benefit.</p>
            </div>
          </details>
      </section>
      <section aria-labelledby="candidate-controls-heading" className="mt-3 space-y-2 border-t pt-4">
        <h3 className="text-lg font-semibold" id="candidate-controls-heading">Explore the table</h3>
        {columns.some((column) => candidateColumnLabel(column.name) === "vh_pI") ? <p className="text-sm leading-7 text-muted-foreground">VH and VL pI describe each supplied chain. VH+VL pI uses the heavy sequence followed directly by the light sequence, without a linker; it is not an average or a whole-antibody estimate.</p> : null}
        <p className="text-sm leading-7 text-muted-foreground">Numbers use up to 3 decimal places. Nonzero magnitudes below 0.001 or at least 1,000,000 use scientific notation. Hover over a number to see its full value.</p>
        <p className="text-sm leading-7 text-muted-foreground">Click a column header to sort; click again to reverse. Sorting uses full precision, with missing values last and ties resolved by parent and candidate IDs. Use the parent filter icon and Columns menu to narrow the view. The full selection.csv is in the result archive.</p>
      </section>
    </CardHeader>
    <CardContent className="min-w-0 space-y-4">
      {data?.reference ? <AntibodyReferenceFaq reference={data.reference} /> : null}
      <ChainSelectionPanel selection={selection} maxEntries={analysisOptions.data?.max_entries_per_group} onClear={(parentId) => { setSelection((current) => parentId ? current.filter((chain) => chain.parentId !== parentId) : []); setSelectionError(null) }} onAnalyze={analyzeSelection} busy={!authenticatedPrincipal(user.data)} error={selectionError ?? (analysisOptions.error ? "Analysis limits could not be loaded. Reload them to analyze selected chains." : null)} />
      {analysisOptions.error ? <Button variant="outline" onClick={() => void analysisOptions.refetch()}>Reload analysis limits</Button> : null}
      <div className="flex flex-wrap items-end gap-3">
        <Menu.Root modal={false}>
          <Menu.Trigger aria-label="Columns" className={buttonVariants({ variant: "outline" })} disabled={!data}>
            <Columns3 aria-hidden="true" /> Columns ({visibleColumns.length}/{data?.columns.length ?? 0}) <ChevronDown aria-hidden="true" />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner align="start" className="z-50" sideOffset={8}>
              <Menu.Popup className="max-h-[min(24rem,var(--available-height))] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg outline-none">
                <Menu.Item className="cursor-pointer rounded px-3 py-2 font-medium outline-none data-highlighted:bg-accent" closeOnClick={false} onClick={() => setColumnVisibility(Object.fromEntries(data?.columns.map(({ name }) => [name, true]) ?? []))}>Show all columns</Menu.Item>
                <Menu.Separator className="my-1 border-t" />
                {columns.map((column) => <Menu.CheckboxItem checked={columnVisible(column.name)} className="flex cursor-pointer items-start gap-2 rounded px-3 py-2 text-sm outline-none data-highlighted:bg-accent" closeOnClick={false} key={column.name} onCheckedChange={(checked) => setColumnVisibility((current) => ({ ...current, [column.name]: checked }))}>
                  <span className="mt-1 size-4 shrink-0"><Menu.CheckboxItemIndicator><Check aria-hidden="true" className="size-4" /></Menu.CheckboxItemIndicator></span>
                  <span className="break-all">{candidateColumnLabel(column.name)}</span>
                </Menu.CheckboxItem>)}
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>
      <div aria-live="polite" className="min-h-12 text-sm text-muted-foreground" role="status">
        <p className="truncate" title={candidateColumnLabel(view.sortBy) || undefined}>{loadingPage ? "Loading candidate page…" : view.sortBy ? `Sorted by ${candidateColumnLabel(view.sortBy)} (${view.descending ? "descending" : "ascending"}).` : "Original workflow order."}</p>
        {view.sortBy && !loadingPage ? <button className="cursor-pointer text-foreground underline underline-offset-4" onClick={() => setView({ ...view, offset: 0, sortBy: "", descending: false })} type="button">Restore default order</button> : null}
      </div>
      {query.error ? <div role="alert" className="text-sm text-destructive">
        <p>{apiErrorCode(query.error) === "result_not_ready" ? "The candidate table is not ready yet." : "Unable to load this candidate page. Refresh to try again."}</p>
        <Button className="mt-2" onClick={() => void query.refetch()} type="button" variant="outline">Refresh candidate table</Button>
      </div> : null}
      {data ? <>
        <div aria-label="Candidate table; scroll horizontally for all columns" className="max-w-full overflow-x-auto rounded-lg border focus-visible:ring-2 focus-visible:ring-ring" tabIndex={0}>
          <table aria-busy={loadingPage} className="w-full text-left text-sm">
            <caption className="sr-only">Humanization selection.csv, page {Math.floor(data.offset / data.limit) + 1}</caption>
            <thead className="border-b bg-muted/40"><tr>{visibleColumns.map((column) => <th aria-sort={view.sortBy === column.name ? view.descending ? "descending" : "ascending" : "none"} className="whitespace-nowrap px-3 py-2" key={column.name} scope="col">
              <button disabled={loadingPage} className="inline-flex cursor-pointer items-center gap-2 rounded px-1 py-1 font-medium underline decoration-dotted underline-offset-4 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-wait" onClick={() => sort(column.name)} type="button">{candidateColumnLabel(column.name)}{view.sortBy === column.name ? view.descending ? <ArrowDown aria-hidden="true" className="size-4" /> : <ArrowUp aria-hidden="true" className="size-4" /> : <ArrowUpDown aria-hidden="true" className="size-4 text-muted-foreground" />}</button>
              {column.name === "parent_id" ? <Popover.Root open={parentFilterOpen} onOpenChange={setParentFilterOpen}>
                <Popover.Trigger aria-label={view.parentId ? `Filter by parent (active: ${view.parentId})` : "Filter by parent"} className={`ml-1 inline-flex size-7 cursor-pointer items-center justify-center rounded hover:bg-accent ${view.parentId ? "bg-primary/10 text-primary" : "text-muted-foreground"}`} disabled={loadingPage}>
                  <ListFilter aria-hidden="true" className="size-4" />
                </Popover.Trigger>
                <Popover.Portal><Popover.Positioner align="start" className="z-50" sideOffset={6}>
                  <Popover.Popup className="max-w-[calc(100vw-2rem)] rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg">
                    <Popover.Title className="mb-2 text-sm font-medium">Filter by parent</Popover.Title>
                    <select aria-label="Parent" className={selectClass} onChange={(event) => { setView({ ...view, offset: 0, parentId: event.target.value }); setParentFilterOpen(false) }} value={view.parentId}>
                      <option value="">All parents</option>{data.parent_ids.map((id) => <option key={id} value={id}>{id}</option>)}
                    </select>
                  </Popover.Popup>
                </Popover.Positioner></Popover.Portal>
              </Popover.Root> : null}
            </th>)}</tr></thead>
            {/* Keep the previous page geometry during requests without exposing stale rows. */}
            <tbody aria-hidden={loadingPage || undefined} className={loadingPage ? "invisible divide-y" : "divide-y"}>{data.rows.map((row, index) => <tr className={row.is_parent === true ? "bg-muted/60" : undefined} key={`${row.parent_id}:${row.candidate_id}:${data.offset + index}`}>
              {visibleColumns.map((column) => <td className="max-w-sm px-3 py-3 align-top" key={column.name}>
                {(column.name === "vh" || column.name === "vl") && typeof row[column.name] === "string" && typeof row.parent_id === "string" && typeof row.candidate_id === "string" ? <ChainSelectionCell chain={{ parentId: row.parent_id, role: column.name, sequence: String(row[column.name]), candidateIds: [row.candidate_id] }} selection={selection} onChange={(chain, selected) => { setSelection((current) => selectChain(current, chain, selected)); setSelectionError(null) }} onInspect={(sequence, label) => setInspected({ sequence, label, parentId: String(row.parent_id), role: column.name === "vh" ? "vh" : "vl" })} /> : /^(vh|vl)_[vj]_gene$/.test(column.name) && data.germlines?.[String(row.candidate_id)] ? <AntibodyGeneCell germlines={data.germlines[String(row.candidate_id)][column.name.startsWith("vh") ? "vh" : "vl"]} segment={column.name.includes("_v_") ? "v" : "j"} /> : row[column.name] === null || row[column.name] === undefined ? <span aria-label="Not available" className="text-muted-foreground">—</span> : column.name === "candidate_id" ? <ExpandableCell value={String(row[column.name])} /> : typeof row[column.name] === "number" ? <ScoreCell name={column.name} value={Number(row[column.name])} deltaValue={row[`${column.name}_delta`]} ranges={data.nativeness_ranges} /> : <span className={column.type === "number" || column.type === "integer" ? "tabular-nums" : "break-words"}>{String(row[column.name])}</span>}
              </td>)}
            </tr>)}</tbody>
          </table>
        </div>
        {!visibleColumns.length ? <p>Select columns from the Columns menu to display the table.</p> : null}
        {!data.rows.length ? <p className="text-sm">No candidates match this parent filter.</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p aria-live="polite" className="text-sm text-muted-foreground">{data.total_rows ? `${data.offset + 1}–${data.offset + data.rows.length}` : "0"} of {data.total_rows} rows</p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">Rows per page
              <select aria-label="Rows per page" className={selectClass} disabled={loadingPage} onChange={(event) => setView({ ...view, offset: 0, limit: Number(event.target.value) })} value={view.limit}>{[25, 50, 100, 200].map((limit) => <option key={limit} value={limit}>{limit}</option>)}</select>
            </label>
            <nav aria-label="Candidate pages" className="flex items-center gap-2">
              <Button aria-label="Previous page" disabled={data.offset === 0 || query.isFetching} onClick={() => setView({ ...view, offset: Math.max(0, view.offset - view.limit) })} size="icon" title="Previous page" type="button" variant="outline"><ChevronLeft aria-hidden="true" /></Button>
              <label className="flex items-center gap-2 text-sm">Page
                <select aria-label="Page" className={selectClass} disabled={loadingPage || pageCount === 1} onChange={(event) => setView({ ...view, offset: (Number(event.target.value) - 1) * view.limit })} value={currentPage}>{Array.from({ length: pageCount }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select>
                <span>of {pageCount}</span>
              </label>
              <Button aria-label="Next page" disabled={data.offset + data.rows.length >= data.total_rows || query.isFetching} onClick={() => setView({ ...view, offset: view.offset + view.limit })} size="icon" title="Next page" type="button" variant="outline"><ChevronRight aria-hidden="true" /></Button>
            </nav>
          </div>
        </div>
      </> : null}
      {inspected ? <AntibodySequenceDialog key={`${inspected.parentId}:${inspected.role}:${inspected.sequence}`} sequence={inspected.sequence} label={inspected.label} parentalSequence={parentalSequence} parentLoading={inputs.isPending} parentUnavailable={!inputs.isPending && !parentalSequence} onClose={() => setInspected(null)} /> : null}
    </CardContent>
  </Card>
}
