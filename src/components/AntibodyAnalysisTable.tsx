import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { analysisColumns, analysisCsv, analysisIssues, analysisValues, compareAnalysisValues, type AnalysisGroup } from "@/antibody-analysis"
import type { SelectedEntry } from "@/antibody-selection"
import AntibodyGeneCell from "@/components/AntibodyGeneCell"
import { Button } from "@/components/ui/button"

export default function AntibodyAnalysisTable({ group, columns, origins, onInspect }: {
  group: AnalysisGroup
  columns: readonly typeof analysisColumns[number][]
  origins?: readonly SelectedEntry[]
  onInspect: (sequence: string, label: string) => void
}) {
  const [sort, setSort] = useState<{ name: string; descending: boolean } | null>(null)
  const [page, setPage] = useState(0)
  const url = useRef<string | null>(null)
  useEffect(() => () => { if (url.current) URL.revokeObjectURL(url.current) }, [])
  const rows = useMemo(() => {
    const result = group.entries.map((entry, index) => ({ entry, index, values: analysisValues(entry) }))
    return sort ? result.sort((a, b) => compareAnalysisValues(a.values[sort.name] ?? null, b.values[sort.name] ?? null, sort.descending) || a.index - b.index) : result
  }, [group, sort])
  const pages = Math.max(1, Math.ceil(rows.length / 50))
  const currentPage = Math.min(page, pages - 1)
  function download() {
    if (url.current) URL.revokeObjectURL(url.current)
    url.current = URL.createObjectURL(new Blob([analysisCsv(group)], { type: "text/csv;charset=utf-8" }))
    const link = document.createElement("a")
    link.href = url.current
    link.download = `antibody-analysis-${group.id.replace(/[^a-zA-Z0-9_-]/g, "_")}.csv`
    link.click()
  }
  return <section aria-label={`Analysis results: ${group.id}`} className="min-w-0 space-y-4 rounded-xl border p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-xl font-semibold">{group.id}</h3><Button variant="outline" onClick={download}><Download aria-hidden="true" />Download CSV</Button></div>
    {(group.issues ?? []).map((issue, index) => <p role="status" className="rounded-lg bg-destructive/10 p-3 text-sm leading-6 text-destructive" key={index}>{issue.detail}</p>)}
    <p className="text-sm text-muted-foreground">{rows.length} entries · {sort ? `Sorted by ${columns.find((column) => column.name === sort.name)?.label ?? sort.name}, ${sort.descending ? "descending" : "ascending"}.` : "FASTA order."} {sort ? <button type="button" className="cursor-pointer underline underline-offset-4" onClick={() => { setSort(null); setPage(0) }}>Restore input order</button> : null}</p>
    <div className="overflow-x-auto rounded-lg border" tabIndex={0} aria-label={`${group.id} table; scroll for more columns`}>
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{group.id} antibody analysis, page {currentPage + 1}</caption>
        <thead className="bg-muted/40"><tr>{columns.map((column) => <th key={column.name} scope="col" className="whitespace-nowrap border-b px-3 py-3" aria-sort={sort?.name === column.name ? sort.descending ? "descending" : "ascending" : "none"}>
          <button type="button" className="flex cursor-pointer items-center gap-2 underline decoration-dotted underline-offset-4" onClick={() => { setSort({ name: column.name, descending: sort?.name === column.name ? !sort.descending : false }); setPage(0) }}>{column.label}{sort?.name === column.name ? sort.descending ? <ArrowDown className="size-4" aria-hidden="true" /> : <ArrowUp className="size-4" aria-hidden="true" /> : <ArrowUpDown className="size-4" aria-hidden="true" />}</button>
        </th>)}<th scope="col" className="px-3 py-3">Issues</th></tr></thead>
        <tbody className="divide-y">{rows.slice(currentPage * 50, (currentPage + 1) * 50).map(({ entry, index, values }) => <tr key={index}>
          {columns.map((column) => <td key={column.name} className="px-3 py-3 align-top">
            {column.name === "id" ? <div className="min-w-36 max-w-64 space-y-2">
              <p className="break-words font-medium">{entry.id}</p>
              <div className="flex flex-wrap gap-2">{(["vh", "vl", "unassigned"] as const).map((role) => entry[role] ? <button key={role} className="cursor-pointer rounded border px-2 py-1 text-xs hover:bg-accent" type="button" onClick={() => onInspect(entry[role]!.sequence, `${entry.id} · ${role === "unassigned" ? "Unassigned chain" : role.toUpperCase()}`)}>{role === "unassigned" ? "Unassigned chain" : role.toUpperCase()} sequence</button> : null)}</div>
              {origins?.filter((origin) => origin.id === entry.id && origin.vh === entry.vh?.sequence && origin.vl === entry.vl?.sequence).map((origin) => <details key={origin.id} className="text-xs leading-5 text-muted-foreground"><summary className="cursor-pointer">Source chains</summary><p>Parent: {origin.parentId}<br />VH: {origin.vhOrigins.join(", ") || "Not selected"}<br />VL: {origin.vlOrigins.join(", ") || "Not selected"}</p></details>)}
            </div> : /^(vh|vl)_[vj]_gene$/.test(column.name) ? (() => {
              const role = column.name.startsWith("vh") ? "vh" : "vl"
              return entry[role] ? <AntibodyGeneCell germlines={entry[role].germlines} segment={column.name.includes("_v_") ? "v" : "j"} /> : <span aria-label="Not available">—</span>
            })() : values[column.name] == null ? <span aria-label="Not available" className="text-muted-foreground">—</span> : <span className="tabular-nums" title={String(values[column.name])}>{typeof values[column.name] === "number" && column.decimals !== null ? Number(values[column.name]).toFixed(column.decimals) : values[column.name]}</span>}
          </td>)}
          <td className="min-w-52 max-w-80 px-3 py-3 align-top text-sm leading-6">{analysisIssues(entry).length ? <ul className="space-y-2">{analysisIssues(entry).map((issue, i) => <li key={i}>{issue}</li>)}</ul> : <span className="text-muted-foreground">None</span>}</td>
        </tr>)}</tbody>
      </table>
    </div>
    {!rows.length ? <p>No analyzable entries in this group.</p> : null}
    <nav aria-label={`${group.id} pages`} className="flex flex-wrap items-center justify-end gap-3 text-sm">
      <span>{rows.length ? `${currentPage * 50 + 1}–${Math.min((currentPage + 1) * 50, rows.length)}` : "0"} of {rows.length}</span>
      <Button variant="outline" size="icon" aria-label={`Previous ${group.id} page`} disabled={!currentPage} onClick={() => setPage(currentPage - 1)}><ChevronLeft /></Button>
      <label>Page <select aria-label="Page" className="ml-2 rounded border bg-background p-2" value={currentPage} onChange={(event) => setPage(Number(event.target.value))}>{Array.from({ length: pages }, (_, i) => <option key={i} value={i}>{i + 1}</option>)}</select> of {pages}</label>
      <Button variant="outline" size="icon" aria-label={`Next ${group.id} page`} disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)}><ChevronRight /></Button>
    </nav>
  </section>
}
