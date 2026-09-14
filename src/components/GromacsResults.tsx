import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { apiErrorCode, apiRequestId, gromacsTrajectoryMetrics, gromacsTrajectoryPlots } from "@/api/client"
import { authenticatedPrincipal, useCurrentUser, useExpireSession } from "@/auth-state"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const plots = [
  { title: "RMSD", caption: "Structural deviation from the initial frame over simulation time, after alignment." },
  { title: "Radius of gyration", caption: "How the structure’s overall compactness changes over simulation time." },
  { title: "RMSF", caption: "Per-residue Cα fluctuations across the aligned production trajectory." },
]

export default function GromacsResults({ jobId }: { jobId: string }) {
  const ownerId = authenticatedPrincipal(useCurrentUser().data)?.user_id
  const query = useQuery({
    queryKey: ["gromacs-trajectory", ownerId, jobId],
    queryFn: ({ signal }) => gromacsTrajectoryPlots(jobId, signal),
    enabled: !!ownerId, staleTime: Infinity, gcTime: 0, retry: false,
  })
  return <Card className="mt-6">
    <CardHeader><CardTitle>Trajectory overview</CardTitle><p className="text-muted-foreground">Production trajectory figures from this job’s result archive.</p></CardHeader>
    <CardContent className="grid gap-6 lg:grid-cols-2">
      {plots.map((plot, index) => <TrajectoryPlot key={gromacsTrajectoryMetrics[index]} {...plot} result={query.data?.[index]} />)}
    </CardContent>
  </Card>
}

function TrajectoryPlot({ title, caption, result }: { title: string; caption: string; result?: PromiseSettledResult<Blob> }) {
  const error = result?.status === "rejected" ? result.reason : null
  useExpireSession(error)
  return <figure className="min-w-0 space-y-3">
    <figcaption><h3 className="font-semibold">{title}</h3><p className="mt-1 leading-6 text-muted-foreground">{caption}</p></figcaption>
    {!result ? <p className="rounded-lg bg-muted p-6" role="status">Loading {title}…</p> : result.status === "fulfilled" ? <PlotImage blob={result.value} title={title} /> : <div className="rounded-lg bg-muted p-4" role="alert">
      <p>{apiErrorCode(error) === "trajectory_plot_too_large" ? `${title} is too large to preview.` : `${title} could not be loaded.`} The full result archive can still be requested above.</p>
      {apiErrorCode(error) ? <p className="mt-2 text-sm">Code: {apiErrorCode(error)}</p> : null}
      {apiRequestId(error) ? <p className="mt-2 break-all text-xs">Support ID: {apiRequestId(error)}</p> : null}
    </div>}
  </figure>
}

function PlotImage({ blob, title }: { blob: Blob; title: string }) {
  const [url, setUrl] = useState<string>()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob)
    setUrl(objectUrl)
    setFailed(false)
    return () => URL.revokeObjectURL(objectUrl)
  }, [blob])
  return failed ? <p role="alert">{title} could not be displayed.</p> : url ? <img className="h-auto w-full rounded-lg border bg-white" src={url} alt={`${title} production trajectory plot`} onError={() => setFailed(true)} /> : <p role="status">Loading {title} image…</p>
}
