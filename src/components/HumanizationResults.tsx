import { Popover } from "@base-ui/react/popover"
import { Menu } from "@base-ui/react/menu"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronDown, ChevronLeft, ChevronRight, Columns3, Copy, ListFilter } from "lucide-react"
import { useEffect, useState } from "react"

import { apiErrorCode, humanizationSelection } from "@/api/client"
import { authenticatedPrincipal, useCurrentUser, useExpireSession } from "@/auth-state"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { SelectionQuery } from "@/humanization"
import { shouldRetryJobQuery } from "@/jobs"
import { copyText } from "@/lib/clipboard"

function ExpandableCell({ value, sequence = false }: { value: string; sequence?: boolean }) {
  const [copyStatus, setCopyStatus] = useState("")
  useEffect(() => {
    if (copyStatus !== "Copied") return
    const timer = window.setTimeout(() => setCopyStatus(""), 2000)
    return () => window.clearTimeout(timer)
  }, [copyStatus])
  return <details className="w-64">
    <summary className="cursor-pointer truncate font-mono text-xs">{sequence ? `${value.slice(0, 16)}${value.length > 16 ? "…" : ""}` : value}</summary>
    <p className="mt-2 break-all font-mono text-xs">{value}</p>
    {sequence ? <p className="mt-1 text-xs text-muted-foreground">{value.length} residues</p> : null}
    <Button aria-live="polite" disabled={copyStatus === "Copied"} className="mt-2" onClick={() => void copyText(value).then(() => setCopyStatus("Copied"), () => setCopyStatus("Copy failed; select the text to copy it."))} type="button" variant="outline">{copyStatus === "Copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />} {copyStatus === "Copied" ? "Copied" : sequence ? "Copy sequence" : "Copy ID"}</Button>
    {copyStatus && copyStatus !== "Copied" ? <p role="alert" className="mt-1 text-sm">{copyStatus}</p> : null}
  </details>
}

function ValueBar({ value, signed, small = false }: { value: number; signed: boolean; small?: boolean }) {
  const width = Math.abs(value) * (signed ? 50 : 100)
  return <span aria-hidden="true" className={small ? "relative mt-1 block h-1.5 overflow-hidden rounded bg-muted" : "absolute inset-0 overflow-hidden rounded"}>
    <span className={`absolute inset-y-0 ${value < 0 ? small ? "bg-red-300" : "bg-red-100" : small ? "bg-green-300" : "bg-green-100"}`} style={{ left: `${signed ? value < 0 ? 50 - width : 50 : 0}%`, width: `${width}%` }} />
    {signed ? <span className="absolute inset-y-0 left-1/2 border-l border-foreground/20" /> : null}
  </span>
}

function ScoreCell({ name, value, deltaValue, scales }: { name: string; value: number; deltaValue: unknown; scales: Readonly<Record<string, number>> | undefined }) {
  const delta = name.endsWith("_delta")
  const score = /_(probability|score|likeness|nativeness)$/.test(name)
  if (!score && !delta) return <span className={name === "cdr_mutations" && value !== 0 ? "rounded bg-red-100 px-1 font-medium tabular-nums text-red-800" : "tabular-nums"}>{value}</span>
  const nativeness = /^pabnativ2_.*_nativeness(?:_delta)?$/.test(name)
  function scaled(column: string, raw: number) {
    if (!nativeness) return Math.abs(raw) <= 1 ? raw : undefined
    const scale = scales?.[column]
    return scale === undefined ? undefined : scale === 0 ? 0 : raw / scale
  }
  const barValue = scaled(name, value)
  const deltaBar = typeof deltaValue === "number" ? scaled(`${name}_delta`, deltaValue) : undefined
  return <span className="block min-w-24 tabular-nums" title={String(value)}>
    <span className="relative block rounded px-2 py-1 text-right">
      {barValue !== undefined ? <ValueBar value={barValue} signed={delta || nativeness} /> : null}
      <span className="relative">{value.toFixed(3)}</span>
    </span>
    {!delta && deltaBar !== undefined ? <span className="block" aria-label={`Change from parent: ${deltaValue}`} title={`Change from parent: ${deltaValue}`}><ValueBar value={deltaBar} signed small /></span> : null}
  </span>
}

export default function HumanizationResults({ jobId }: { jobId: string }) {
  const user = useCurrentUser()
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
  useExpireSession(query.error)
  const data = query.data
  const loadingPage = query.isPending || query.isPlaceholderData
  function columnVisible(name: string) {
    return columnVisibility[name] ?? !(["is_parent", "cdr_preservation"].includes(name) || name.endsWith("_delta") || /^humatch_.*_family$/.test(name) || data?.default_hidden_columns?.includes(name))
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
      <p className="text-sm text-muted-foreground"><strong className="text-foreground">quality_tier</strong> groups eligible candidates into Pareto tiers, balancing higher model scores with fewer mutations; lower is better, starting at 1. <strong className="text-foreground">panel_order</strong> is the suggested per-parent testing order, balancing quality with sequence diversity; lower comes first, starting at 1. Missing ranks mean the row is a parent or did not meet ranking requirements, including complete evaluation, preserved CDRs, and parental pairing guardrails. Missing ranks are not zero or the worst tier. These ranks are simple heuristics constructed from the model scores. You may use any other combinatory ranking method to pick out top candidates.</p>
      <p className="text-sm text-muted-foreground">Score backgrounds span 0–1. The thin bar below each score shows its change from the parent: green to the right means higher, red to the left means lower. Nativeness scores and their deltas are scaled separately to −1…+1 by dividing by each column’s largest absolute value in the full result; zero stays zero. This relative scale is not comparable across jobs. Other delta bars span −1…+1 in raw score units. Displayed values remain the original scores, rounded to 3 decimals; sorting uses full precision. Red CDR mutation counts flag changes to CDRs.</p>
    </CardHeader>
    <CardContent className="min-w-0 space-y-4">
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
                {data?.columns.map((column) => <Menu.CheckboxItem checked={columnVisible(column.name)} className="flex cursor-pointer items-start gap-2 rounded px-3 py-2 text-sm outline-none data-highlighted:bg-accent" closeOnClick={false} key={column.name} onCheckedChange={(checked) => setColumnVisibility((current) => ({ ...current, [column.name]: checked }))}>
                  <span className="mt-1 size-4 shrink-0"><Menu.CheckboxItemIndicator><Check aria-hidden="true" className="size-4" /></Menu.CheckboxItemIndicator></span>
                  <span className="break-all">{column.name}</span>
                </Menu.CheckboxItem>)}
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>
      <div aria-live="polite" className="min-h-12 text-sm text-muted-foreground" role="status">
        <p className="truncate" title={view.sortBy || undefined}>{loadingPage ? "Loading candidate page…" : view.sortBy ? `Sorted by ${view.sortBy} (${view.descending ? "descending" : "ascending"}).` : "Original workflow order."}</p>
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
              <button disabled={loadingPage} className="inline-flex cursor-pointer items-center gap-2 rounded px-1 py-1 font-medium underline decoration-dotted underline-offset-4 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-wait" onClick={() => sort(column.name)} type="button">{column.name}{view.sortBy === column.name ? view.descending ? <ArrowDown aria-hidden="true" className="size-4" /> : <ArrowUp aria-hidden="true" className="size-4" /> : <ArrowUpDown aria-hidden="true" className="size-4 text-muted-foreground" />}</button>
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
                {row[column.name] === null || row[column.name] === undefined ? <span aria-label="Not available" className="text-muted-foreground">—</span> : ["vh", "vl"].includes(column.name) && typeof row[column.name] === "string" ? <ExpandableCell sequence value={String(row[column.name])} /> : column.name === "candidate_id" ? <ExpandableCell value={String(row[column.name])} /> : typeof row[column.name] === "number" ? <ScoreCell name={column.name} value={Number(row[column.name])} deltaValue={row[`${column.name}_delta`]} scales={data.nativeness_max_abs} /> : <span className={column.type === "number" || column.type === "integer" ? "tabular-nums" : "break-words"}>{String(row[column.name])}</span>}
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
