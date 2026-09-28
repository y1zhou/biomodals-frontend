import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query"
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { prepareOptimizationSelectedDownload, proteinOptimizationCandidates, proteinOptimizationOptions } from "@/api/client"
import { authenticatedPrincipal, useCurrentUser, useExpireSession } from "@/auth-state"
import ProteinSequenceValue from "@/components/ProteinSequenceValue"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { optimizationDownloadPath, type OptimizationCandidateQuery } from "@/protein-optimization"

const labels: Record<string, string> = { id: "Candidate ID", mutations: "Mutations", predicted_label: "Predicted label", n_mutations: "Mutations count", n_new_mutations: "New substitutions", warnings: "Warnings" }
const numberFormat = (value: number) => value !== 0 && (Math.abs(value) < 0.001 || Math.abs(value) >= 1e6) ? value.toExponential(3) : value.toLocaleString(undefined, { maximumFractionDigits: 3 })

export default function ProteinOptimizationResults({ jobId }: { jobId: string }) {
  const principal = authenticatedPrincipal(useCurrentUser().data)
  const [view, setView] = useState<OptimizationCandidateQuery>({ offset: 0, limit: 50 })
  const [filters, setFilters] = useState({ mutations: "", n_mutations: "", n_new_mutations: "" })
  const [filterError, setFilterError] = useState("")
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [selectionError, setSelectionError] = useState("")
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const download = useMutation({
    mutationFn: async (ids: readonly string[]) => {
      const ticket = await prepareOptimizationSelectedDownload(jobId, ids)
      return optimizationDownloadPath(jobId, ticket.download_url)
    }, retry: false, gcTime: 0,
    onSuccess(path) {
      if (!mounted.current) return
      const link = document.createElement("a")
      link.href = path; link.download = ""; link.hidden = true
      document.body.append(link); link.click(); link.remove()
    },
  })
  const options = useQuery({ queryKey: ["protein-optimization", "options"], queryFn: ({ signal }) => proteinOptimizationOptions(signal), enabled: !!principal, retry: false, staleTime: Infinity, refetchOnWindowFocus: false })
  const query = useQuery({
    queryKey: ["protein-optimization", "candidates", principal?.user_id, jobId, view],
    queryFn: ({ signal }) => proteinOptimizationCandidates(jobId, view, signal),
    enabled: !!principal, placeholderData: keepPreviousData, retry: false, gcTime: 0,
    staleTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false,
  })
  useExpireSession(options.error ?? query.error ?? download.error)
  const data = query.data
  const pending = query.isFetching || query.isPlaceholderData
  const validation = data?.summary.validation
  const chainByColumn = new Map(Object.entries(data?.summary.chain_columns ?? {}).map(([chain, column]) => [column, chain]))
  const pageIds = data?.rows.flatMap((row) => typeof row.id === "string" ? [row.id] : []) ?? []
  const allPageSelected = !!pageIds.length && pageIds.every((id) => selected.has(id))
  const currentPage = Math.floor((data?.offset ?? 0) / (data?.limit ?? 50)) + 1
  const pageCount = Math.max(1, Math.ceil((data?.total_rows ?? 0) / (data?.limit ?? 50)))

  function choose(ids: readonly string[], checked: boolean) {
    const next = new Set(selected)
    for (const id of ids) if (checked) next.add(id); else next.delete(id)
    if (options.data?.max_selected_candidates === undefined || next.size > options.data.max_selected_candidates) {
      setSelectionError("This selection exceeds the service limit, or selection limits are unavailable.")
      return
    }
    setSelected(next)
    setSelectionError("")
    download.reset()
  }

  return <Card className="mt-6">
    <CardHeader><CardTitle><h2>Protein optimization candidates</h2></CardTitle><p className="leading-7 text-muted-foreground">Novel variants relative to the uploaded measurements. Predictions are on your supplied label scale, not experimental confirmation. Parent and measured variants are excluded from this table.</p></CardHeader>
    <CardContent className="space-y-6">
      {validation ? <section aria-labelledby="optimization-validation-heading" className="space-y-3 rounded-lg border p-4">
        <h3 id="optimization-validation-heading" className="text-lg font-medium">Held-out validation</h3>
        <p className="text-muted-foreground">{validation.regime === "supported_combinations" ? "Supported measured combinations were held out while retaining substitution support in training. Additive ridge does not estimate interactions." : validation.regime === "same_position_alternatives" ? "Exact substitutions were held out while other alternatives at the same positions remained in training. This does not validate entirely unmeasured positions or chains." : validation.regime}</p>
        <dl className="grid gap-3 sm:grid-cols-3">
          {[['Training variants', validation.training_variants], ['Evaluated variants', validation.evaluated_variants], ['Validation folds', validation.folds], ['Mean absolute error', validation.mae], ['Root mean squared error', validation.rmse], ['Spearman correlation', validation.spearman]].map(([label, value]) => <div key={String(label)}><dt className="text-muted-foreground">{label}</dt><dd title={typeof value === "number" ? String(value) : undefined}>{typeof value === "number" ? numberFormat(value) : "Not available"}</dd></div>)}
        </dl>
        <p>Evaluated mutation counts: {validation.evaluated_mutation_counts.length ? validation.evaluated_mutation_counts.join(", ") : "Not available"}.</p>
        {validation.warnings.map((warning) => <p key={warning} className="rounded bg-muted p-3">{warning}</p>)}
        <p className="text-muted-foreground">Final predictions refit on all usable measured variants after replicate averaging. Validation coverage does not establish higher-order or experimental accuracy.</p>
      </section> : null}
      <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => {
        event.preventDefault()
        setFilterError("")
        const counts: { n_mutations?: number; n_new_mutations?: number } = {}
        for (const key of ["n_mutations", "n_new_mutations"] as const) {
          if (!filters[key].trim()) continue
          const value = Number(filters[key])
          if (!Number.isSafeInteger(value) || value < (key === "n_mutations" ? 1 : 0)) { setFilterError("Mutation-count filters require whole numbers in the displayed range."); return }
          counts[key] = value
        }
        setView({ ...view, offset: 0, mutations: filters.mutations || undefined, n_mutations: counts.n_mutations, n_new_mutations: counts.n_new_mutations })
      }}>
        <label className="space-y-2"><span className="block">Mutation text (case-sensitive)</span><Input value={filters.mutations} maxLength={200} onChange={(event) => setFilters({ ...filters, mutations: event.target.value })} /></label>
        <label className="space-y-2"><span className="block">Exact mutation count</span><Input type="number" min={1} step={1} value={filters.n_mutations} onChange={(event) => setFilters({ ...filters, n_mutations: event.target.value })} /></label>
        <label className="space-y-2"><span className="block">Exact new-substitution count</span><Input type="number" min={0} step={1} value={filters.n_new_mutations} onChange={(event) => setFilters({ ...filters, n_new_mutations: event.target.value })} /></label>
        <Button type="submit" variant="outline" disabled={pending}>Apply filters</Button><Button type="button" variant="ghost" disabled={pending} onClick={() => { setFilters({ mutations: "", n_mutations: "", n_new_mutations: "" }); setFilterError(""); setView({ offset: 0, limit: view.limit, sort_by: view.sort_by, descending: view.descending }) }}>Clear filters</Button>
      </form>
      {filterError ? <p role="alert">{filterError}</p> : null}
      <div className="flex flex-wrap items-center gap-3"><p role="status">{selected.size.toLocaleString()} candidates selected across pages and filters.</p><Button type="button" disabled={!selected.size || download.isPending || !principal} onClick={() => download.mutate([...selected])}>{download.isPending ? "Preparing selected CSV…" : "Download selected candidates"}</Button><Button type="button" variant="ghost" disabled={!selected.size || download.isPending} onClick={() => { setSelected(new Set()); setSelectionError(""); download.reset() }}>Clear selection</Button></div>
      {download.error ? <p role="alert">Selected CSV could not be prepared. {download.error.message} Your selection is unchanged; retry the download explicitly.</p> : null}
      {download.isSuccess ? <p role="status">Selected CSV download requested in original scientific order. If its short-lived link expires, request the download again.</p> : null}
      {selectionError ? <p role="alert">{selectionError}</p> : null}
      {options.error ? <p role="alert">Selection and sorting options could not be loaded. <button className="underline" type="button" onClick={() => void options.refetch()}>Retry options</button></p> : null}
      {query.error ? <p role="alert">Candidates could not be loaded. {query.error.message} <button type="button" className="underline" onClick={() => void query.refetch()}>Retry candidates</button></p> : null}
      <div className="flex flex-wrap items-center gap-3 text-muted-foreground"><p role="status">{pending ? "Loading candidate page…" : view.sort_by ? `Sorted by ${labels[view.sort_by]} (${view.descending ? "descending" : "ascending"}).` : `Original scientific order${data ? `: predicted label, ${data.summary.direction === "maximize" ? "higher" : "lower"} first` : ""}.`}</p>{view.sort_by ? <button type="button" className="underline" onClick={() => setView({ ...view, offset: 0, sort_by: undefined, descending: undefined })}>Restore default order</button> : null}</div>
      <p className="text-muted-foreground">Click a sortable column header to change order. Full-precision values are preserved in CSV; displayed numbers are rounded to three decimal places.</p>
      {data ? <>
        <div className="overflow-x-auto rounded-lg border" aria-busy={pending}>
          <table className="w-full text-left"><thead><tr><th className="p-3"><input type="checkbox" aria-label="Select this page" checked={allPageSelected} disabled={pending || download.isPending || !pageIds.length || !options.data} onChange={(event) => choose(pageIds, event.target.checked)} /></th>{data.columns.map((column) => {
            const label = chainByColumn.has(column.name) ? `Chain ${chainByColumn.get(column.name)}` : labels[column.name] ?? column.name
            const sortable = options.data?.sortable_columns?.includes(column.name)
            return <th key={column.name} className="p-3" aria-sort={view.sort_by === column.name ? view.descending ? "descending" : "ascending" : undefined}>{sortable ? <button type="button" disabled={pending} className="flex items-center gap-2 whitespace-nowrap font-semibold" onClick={() => setView({ ...view, offset: 0, sort_by: column.name as OptimizationCandidateQuery["sort_by"], descending: view.sort_by === column.name ? !view.descending : false })}>{label}{view.sort_by !== column.name ? <ArrowUpDown aria-hidden="true" className="size-4" /> : view.descending ? <ArrowDown aria-hidden="true" className="size-4" /> : <ArrowUp aria-hidden="true" className="size-4" />}</button> : label}</th>
          })}</tr></thead><tbody aria-hidden={pending || undefined} className={pending ? "invisible" : undefined}>{data.rows.map((row) => <tr key={String(row.id)} className="border-t"><td className="p-3"><input type="checkbox" disabled={pending || download.isPending || typeof row.id !== "string" || !options.data} aria-label={`Select ${row.id}`} checked={typeof row.id === "string" && selected.has(row.id)} onChange={(event) => choose([String(row.id)], event.target.checked)} /></td>{data.columns.map((column) => {
            const value = row[column.name]
            const chain = chainByColumn.get(column.name)
            return <td key={column.name} className="max-w-lg p-3 align-top">{value === null || value === undefined ? <span className="text-muted-foreground">—</span> : chain && typeof value === "string" ? <ProteinSequenceValue chainId={chain} sequence={value} /> : typeof value === "number" ? <span className="tabular-nums" title={String(value)}>{numberFormat(value)}</span> : <span className="break-words">{value}</span>}</td>
          })}</tr>)}</tbody></table>
        </div>
        {!data.rows.length && !pending ? <p>{data.summary.candidate_count === 0 ? "No novel candidates were produced." : "No candidates match these filters."}</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-3"><p>{data.total_rows ? `${data.offset + 1}–${data.offset + data.rows.length}` : "0"} of {data.total_rows.toLocaleString()} matching candidates · {data.summary.candidate_count.toLocaleString()} total.</p><div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">Rows per page<select aria-label="Rows per page" className="rounded-lg border bg-background p-2" value={view.limit} disabled={pending} onChange={(event) => setView({ ...view, offset: 0, limit: Number(event.target.value) })}>{[25, 50, 100, 200].filter((limit) => limit <= (options.data?.max_page_size ?? 50)).map((limit) => <option key={limit} value={limit}>{limit}</option>)}</select></label>
          <Button type="button" variant="outline" aria-label="Previous candidate page" disabled={pending || data.offset === 0} onClick={() => setView({ ...view, offset: Math.max(0, data.offset - data.limit) })}><ChevronLeft aria-hidden="true" /></Button>
          <form className="flex items-center gap-2" onSubmit={(event) => {
            event.preventDefault()
            const page = Number(new FormData(event.currentTarget).get("page"))
            if (!pending && Number.isInteger(page) && page >= 1 && page <= pageCount) setView({ ...view, offset: (page - 1) * data.limit })
          }}><label className="flex items-center gap-2">Page<Input aria-label="Candidate page" className="w-24" name="page" type="number" min={1} max={pageCount} step={1} required key={currentPage} defaultValue={currentPage} disabled={pending} /></label><span>of {pageCount.toLocaleString()}</span><Button type="submit" variant="outline" disabled={pending}>Go</Button></form>
          <Button type="button" variant="outline" aria-label="Next candidate page" disabled={pending || data.offset + data.rows.length >= data.total_rows} onClick={() => setView({ ...view, offset: data.offset + data.limit })}><ChevronRight aria-hidden="true" /></Button>
        </div></div>
      </> : null}
    </CardContent>
  </Card>
}
