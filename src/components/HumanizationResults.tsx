import { Menu } from "@base-ui/react/menu"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronDown, ChevronLeft, ChevronRight, Columns3, Copy } from "lucide-react"
import { useState } from "react"

import { apiErrorCode, humanizationSelection } from "@/api/client"
import { authenticatedPrincipal, useCurrentUser, useExpireSession } from "@/auth-state"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { SelectionQuery } from "@/humanization"
import { shouldRetryJobQuery } from "@/jobs"
import { copyText } from "@/lib/clipboard"

function ExpandableCell({ value, sequence = false }: { value: string; sequence?: boolean }) {
  const [copyStatus, setCopyStatus] = useState("")
  return <details className="w-64">
    <summary className="cursor-pointer truncate font-mono text-xs">{sequence ? `${value.slice(0, 16)}${value.length > 16 ? "…" : ""} · ${value.length} residues` : value}</summary>
    <p className="mt-2 break-all font-mono text-xs">{value}</p>
    <Button className="mt-2" onClick={() => void copyText(value).then(() => setCopyStatus("Copied"), () => setCopyStatus("Copy failed; select the text to copy it."))} type="button" variant="outline"><Copy aria-hidden="true" /> Copy {sequence ? "sequence" : "ID"}</Button>
    <p aria-live="polite" className="mt-1 text-sm">{copyStatus}</p>
  </details>
}

function ScoreCell({ name, value }: { name: string; value: number }) {
  const delta = name.endsWith("_delta")
  const score = /_(probability|score|likeness|nativeness)$/.test(name)
  if (!score && !delta) return <span className={name === "cdr_mutations" && value !== 0 ? "rounded bg-red-100 px-1 font-medium tabular-nums text-red-800" : "tabular-nums"}>{value}</span>
  // p-AbNatiV2 nativeness is an affine reconstruction score, not a probability.
  const unbounded = /^pabnativ2_.*_nativeness(?:_delta)?$/.test(name)
  if (unbounded || Math.abs(value) > 1 || (!delta && value < 0)) return <span className={`tabular-nums ${delta ? value < 0 ? "text-red-800" : value > 0 ? "text-green-800" : "" : ""}`} title={String(value)}>{value.toFixed(3)}</span>
  const width = Math.abs(value) * (delta ? 50 : 100)
  return <span className="relative block min-w-24 overflow-hidden rounded px-2 py-1 text-right tabular-nums" title={String(value)}>
    <span aria-hidden="true" className={`absolute inset-y-0 ${value < 0 ? "bg-red-100" : "bg-green-100"}`} style={{ left: `${delta ? value < 0 ? 50 - width : 50 : 0}%`, width: `${width}%` }} />
    {delta ? <span aria-hidden="true" className="absolute inset-y-0 left-1/2 border-l border-foreground/15" /> : null}
    <span className="relative">{value.toFixed(3)}</span>
  </span>
}

export default function HumanizationResults({ jobId }: { jobId: string }) {
  const user = useCurrentUser()
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
  useExpireSession(query.error)
  const data = query.data
  const loadingPage = query.isPending || query.isPlaceholderData
  function columnVisible(name: string) {
    return columnVisibility[name] ?? !(["is_parent", "cdr_preservation"].includes(name) || /^humatch_.*_family$/.test(name) || data?.default_hidden_columns?.includes(name))
  }
  const visibleColumns = data?.columns.filter((column) => columnVisible(column.name)) ?? []
  const pageCount = Math.max(1, Math.ceil((data?.total_rows ?? 0) / view.limit))
  const currentPage = Math.floor((data?.offset ?? 0) / view.limit) + 1
  function sort(column: string) {
    setView((current) => ({ ...current, offset: 0, sortBy: column, descending: current.sortBy === column ? !current.descending : false }))
  }
  const selectClass = "h-9 max-w-full rounded-lg border border-input bg-background px-2 text-sm"

  return <Card className="mt-6 min-w-0">
    <CardHeader>
      <CardTitle>Humanization candidates</CardTitle>
      <p className="text-sm text-muted-foreground">Click a column header to sort; click again to reverse the order. Missing values sort last; ties use parent and candidate IDs. Gray rows are the unchanged parents. The full selection.csv is included in the result archive.</p>
      <p className="text-sm text-muted-foreground"><strong className="text-foreground">quality_tier</strong> groups eligible candidates into Pareto tiers, balancing higher model scores with fewer mutations; lower is better, starting at 1. <strong className="text-foreground">panel_order</strong> is the suggested per-parent testing order, balancing quality with sequence diversity; lower comes first, starting at 1. Missing ranks mean the row is a parent or did not meet ranking requirements, including complete evaluation, preserved CDRs, and parental pairing guardrails. Missing ranks are not zero or the worst tier. These ranks are screening heuristics, not experimental validation.</p>
      <p className="text-sm text-muted-foreground">Green score bars span 0–1. Delta bars span −1 to +1: green to the right means a higher score than the parent, red to the left means lower, and zero means unchanged. Deltas use score units, not percentages. p-AbNatiV2 nativeness can be negative and is shown without a bounded bar; its deltas use color only. Scores and deltas are displayed to 3 decimals; sorting uses the original values. Red CDR mutation counts flag changes to CDRs.</p>
    </CardHeader>
    <CardContent className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid max-w-full gap-1 text-sm">Parent
          <select disabled={loadingPage} aria-label="Parent" className={selectClass} onChange={(event) => setView({ ...view, offset: 0, parentId: event.target.value })} value={view.parentId}>
            <option value="">All parents</option>{data?.parent_ids.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
        <Menu.Root modal={false}>
          <Menu.Trigger aria-label="Columns" className={buttonVariants({ variant: "outline" })} disabled={!data}>
            <Columns3 aria-hidden="true" /> Columns ({visibleColumns.length}/{data?.columns.length ?? 0}) <ChevronDown aria-hidden="true" />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner align="start" className="z-50" sideOffset={8}>
              <Menu.Popup className="max-h-[min(24rem,var(--available-height))] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg outline-none">
                <Menu.Item className="cursor-pointer rounded px-3 py-2 font-medium outline-none data-highlighted:bg-accent" closeOnClick={false} onClick={() => setColumnVisibility(Object.fromEntries(data?.columns.map(({ name }) => [name, true]) ?? []))}>Show all columns</Menu.Item>
                <Menu.Separator className="my-1 border-t" />
                {data?.columns.map((column) => <Menu.CheckboxItem checked={columnVisible(column.name)} className="flex cursor-pointer items-start gap-2 rounded px-3 py-2 text-sm outline-none data-highlighted:bg-accent" closeOnClick={false} key={column.name} onCheckedChange={(checked) => setColumnVisibility((current) => ({ ...current, [column.name]: checked }))}>
                  <span className="mt-1 size-4 shrink-0"><Menu.CheckboxItemIndicator><Check aria-hidden="true" className="size-4" /></Menu.CheckboxItemIndicator></span>
                  <span className="break-all">{column.name}</span>
                </Menu.CheckboxItem>)}
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
        <Button disabled={!view.sortBy || loadingPage} onClick={() => setView({ ...view, offset: 0, sortBy: "", descending: false })} type="button" variant="outline">Restore scientific order</Button>
      </div>
      <p aria-live="polite" className="min-h-12 break-all text-sm text-muted-foreground" role="status">{loadingPage ? "Loading candidate page…" : view.sortBy ? `Sorted by ${view.sortBy} (${view.descending ? "descending" : "ascending"}).` : "Original workflow order."}</p>
      {query.error ? <div role="alert" className="text-sm text-destructive">
        <p>{apiErrorCode(query.error) === "result_not_ready" ? "The candidate table is not ready yet." : "Unable to load this candidate page. Refresh to try again."}</p>
        <Button className="mt-2" onClick={() => void query.refetch()} type="button" variant="outline">Refresh candidate table</Button>
      </div> : null}
      {data ? <>
        <div aria-label="Candidate table; scroll horizontally for all columns" className="max-w-full overflow-x-auto rounded-lg border focus-visible:ring-2 focus-visible:ring-ring" tabIndex={0}>
          <table aria-busy={loadingPage} className="w-full text-left text-sm">
            <caption className="sr-only">Humanization selection.csv, page {Math.floor(data.offset / data.limit) + 1}</caption>
            <thead className="border-b bg-muted/40"><tr>{visibleColumns.map((column) => <th aria-sort={view.sortBy === column.name ? view.descending ? "descending" : "ascending" : "none"} className="whitespace-nowrap px-3 py-2" key={column.name} scope="col">
              <button disabled={loadingPage} className="inline-flex cursor-pointer items-center gap-2 rounded px-1 py-1 font-medium underline decoration-dotted underline-offset-4 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-wait" onClick={() => sort(column.name)} type="button">{column.name}{view.sortBy === column.name ? view.descending ? <ArrowDown aria-hidden="true" className="size-4" /> : <ArrowUp aria-hidden="true" className="size-4" /> : <ArrowUpDown aria-hidden="true" className="size-4 text-muted-foreground" />}</button>
            </th>)}</tr></thead>
            {/* Keep the previous page geometry during requests without exposing stale rows. */}
            <tbody aria-hidden={loadingPage || undefined} className={loadingPage ? "invisible divide-y" : "divide-y"}>{data.rows.map((row, index) => <tr className={row.is_parent === true ? "bg-muted/60" : undefined} key={`${row.parent_id}:${row.candidate_id}:${data.offset + index}`}>
              {visibleColumns.map((column) => <td className="max-w-sm px-3 py-3 align-top" key={column.name}>
                {row[column.name] === null || row[column.name] === undefined ? <span aria-label="Not available" className="text-muted-foreground">—</span> : ["vh", "vl"].includes(column.name) && typeof row[column.name] === "string" ? <ExpandableCell sequence value={String(row[column.name])} /> : column.name === "candidate_id" ? <ExpandableCell value={String(row[column.name])} /> : typeof row[column.name] === "number" ? <ScoreCell name={column.name} value={Number(row[column.name])} /> : <span className={column.type === "number" || column.type === "integer" ? "tabular-nums" : "break-words"}>{String(row[column.name])}</span>}
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
    </CardContent>
  </Card>
}
