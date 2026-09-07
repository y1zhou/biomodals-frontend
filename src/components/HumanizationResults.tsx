import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query"
import { ArrowDown, ArrowUp, Copy, Download } from "lucide-react"
import { useState } from "react"

import { apiErrorCode, humanizationCsvUrl, humanizationSelection, prepareJobDownload } from "@/api/client"
import { authenticatedPrincipal, useCurrentUser, useExpireSession } from "@/auth-state"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { SelectionQuery } from "@/humanization"
import { shouldRetryJobQuery } from "@/jobs"
import { copyText } from "@/lib/clipboard"

function SequenceCell({ sequence }: { sequence: string }) {
  const [copyStatus, setCopyStatus] = useState("")
  return <details className="w-64">
    <summary className="cursor-pointer font-mono text-xs">{sequence.slice(0, 16)}{sequence.length > 16 ? "…" : ""} · {sequence.length} residues</summary>
    <p className="mt-2 break-all font-mono text-xs">{sequence}</p>
    <Button className="mt-2" onClick={() => void copyText(sequence).then(() => setCopyStatus("Copied"), () => setCopyStatus("Copy failed; select the sequence to copy it."))} type="button" variant="outline"><Copy aria-hidden="true" /> Copy sequence</Button>
    <p aria-live="polite" className="mt-1 text-xs">{copyStatus}</p>
  </details>
}

export default function HumanizationResults({ jobId }: { jobId: string }) {
  const user = useCurrentUser()
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
  const download = useMutation({
    mutationFn: () => prepareJobDownload(jobId),
    retry: false,
    onSuccess() {
      const link = document.createElement("a")
      link.href = humanizationCsvUrl(jobId)
      link.download = ""
      document.body.append(link)
      link.click()
      link.remove()
    },
  })
  useExpireSession(download.error)
  const data = query.data
  const loadingPage = query.isPending || query.isPlaceholderData
  function sort(column: string) {
    setView((current) => ({ ...current, offset: 0, sortBy: column, descending: current.sortBy === column ? !current.descending : false }))
  }
  const selectClass = "h-9 max-w-full rounded-lg border border-input bg-background px-2 text-sm"

  return <Card className="mt-6 min-w-0">
    <CardHeader>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle>Humanization candidates</CardTitle>
        <Button disabled={download.isPending} onClick={() => download.mutate()} type="button" variant="outline"><Download aria-hidden="true" /> {download.isPending ? "Preparing CSV…" : "Download selection.csv"}</Button>
      </div>
      <p className="text-sm text-muted-foreground">All selection.csv columns are available. Sorting changes presentation only; panel order remains the workflow’s per-parent ranking. Unranked rows and missing scores are retained.</p>
    </CardHeader>
    <CardContent className="min-w-0 space-y-4">
      {download.error ? <p className="text-sm text-destructive" role="alert">Unable to prepare the CSV download. Sign in again if prompted, then retry.</p> : null}
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid max-w-full gap-1 text-sm">Parent
          <select aria-label="Parent" className={selectClass} onChange={(event) => setView({ ...view, offset: 0, parentId: event.target.value })} value={view.parentId}>
            <option value="">All parents</option>{data?.parent_ids.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm">Rows per page
          <select aria-label="Rows per page" className={selectClass} onChange={(event) => setView({ ...view, offset: 0, limit: Number(event.target.value) })} value={view.limit}>{[25, 50, 100, 200].map((limit) => <option key={limit} value={limit}>{limit}</option>)}</select>
        </label>
        <Button disabled={!view.sortBy} onClick={() => setView({ ...view, offset: 0, sortBy: "", descending: false })} type="button" variant="outline">Restore scientific order</Button>
      </div>
      <p className="text-xs text-muted-foreground">{view.sortBy ? `Sorted by ${view.sortBy}, ${view.descending ? "descending" : "ascending"}. Missing values last; ties use parent and candidate IDs.` : "Original workflow order."}</p>
      {query.error ? <div role="alert" className="text-sm text-destructive">
        <p>{apiErrorCode(query.error) === "result_not_ready" ? "The candidate table is not ready yet." : "Unable to load this candidate page. Refresh to try again."}</p>
        <Button className="mt-2" onClick={() => void query.refetch()} type="button" variant="outline">Refresh candidate table</Button>
      </div> : null}
      {loadingPage ? <p role="status">Loading candidate page…</p> : data ? <>
        <div aria-label="Candidate table; scroll horizontally for all columns" className="max-w-full overflow-x-auto rounded-lg border focus-visible:ring-2 focus-visible:ring-ring" tabIndex={0}>
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Humanization selection.csv, page {Math.floor(data.offset / data.limit) + 1}</caption>
            <thead className="border-b bg-muted/40"><tr>{data.columns.map((column) => <th aria-sort={view.sortBy === column.name ? view.descending ? "descending" : "ascending" : "none"} className="whitespace-nowrap px-3 py-2" key={column.name} scope="col">
              <button className="inline-flex items-center gap-1 rounded font-medium focus-visible:outline-2 focus-visible:outline-ring" onClick={() => sort(column.name)} type="button">{column.name}{view.sortBy === column.name ? view.descending ? <ArrowDown aria-hidden="true" className="size-3" /> : <ArrowUp aria-hidden="true" className="size-3" /> : null}</button>
            </th>)}</tr></thead>
            <tbody className="divide-y">{data.rows.map((row, index) => <tr key={`${row.parent_id}:${row.candidate_id}:${data.offset + index}`}>
              {data.columns.map((column) => <td className="max-w-sm px-3 py-3 align-top" key={column.name}>
                {row[column.name] === null || row[column.name] === undefined ? <span aria-label="Not available" className="text-muted-foreground">—</span> : ["vh", "vl"].includes(column.name) && typeof row[column.name] === "string" ? <SequenceCell sequence={String(row[column.name])} /> : <span className={column.type === "number" || column.type === "integer" ? "tabular-nums" : "break-words"}>{String(row[column.name])}</span>}
              </td>)}
            </tr>)}</tbody>
          </table>
        </div>
        {!data.rows.length ? <p className="text-sm">No candidates match this parent filter.</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p aria-live="polite" className="text-sm text-muted-foreground">{data.total_rows ? `${data.offset + 1}–${data.offset + data.rows.length}` : "0"} of {data.total_rows} rows</p>
          <div className="flex gap-2"><Button disabled={data.offset === 0 || query.isFetching} onClick={() => setView({ ...view, offset: Math.max(0, view.offset - view.limit) })} type="button" variant="outline">Previous</Button><Button disabled={data.offset + data.rows.length >= data.total_rows || query.isFetching} onClick={() => setView({ ...view, offset: view.offset + view.limit })} type="button" variant="outline">Next</Button></div>
        </div>
      </> : null}
    </CardContent>
  </Card>
}
