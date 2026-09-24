import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, LoaderCircle } from "lucide-react"
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { Link, useBeforeUnload, useBlocker, useNavigate, useParams } from "react-router"
import { ApiError, apiErrorCode, apiRequestId, clusterGromacsJob, gromacsClusteringInfo, type GromacsClusteringInfo } from "@/api/client"
import { authenticatedPrincipal, useCurrentUser, useExpireSession } from "@/auth-state"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { normalizedDisplayName, submissionErrorMessage } from "@/gromacs"
import { clusteringCutoffError, clusteringStorageKey, readClusteringIntent, saveClusteringIntent, type ClusteringIntent } from "@/gromacs-clustering"
import { jobKey, jobListKey } from "@/jobs"
import { randomUUID } from "@/lib/uuid"
import { formatBytes } from "@/storage"
import { gromacsPaths } from "@/tools"

export default function GromacsClusteringPage() {
  const { jobId = "" } = useParams()
  const principal = authenticatedPrincipal(useCurrentUser().data)
  const lastOwner = useRef(principal?.user_id ?? "")
  if (principal) lastOwner.current = principal.user_id
  return <ClusteringSource key={`${lastOwner.current}:${jobId}`} ownerId={lastOwner.current} sourceJobId={jobId} />
}

function ClusteringSource({ ownerId, sourceJobId }: { ownerId: string; sourceJobId: string }) {
  const principal = authenticatedPrincipal(useCurrentUser().data)
  const [source, setSource] = useState<GromacsClusteringInfo | null>(null)
  const [pending] = useState(() => readClusteringIntent(window.sessionStorage, clusteringStorageKey(ownerId, sourceJobId)))
  const query = useQuery({
    queryKey: ["gromacs-clustering", ownerId, sourceJobId],
    queryFn: ({ signal }) => gromacsClusteringInfo(sourceJobId, signal),
    enabled: !!sourceJobId && principal?.user_id === ownerId && !source,
    retry: false, staleTime: Infinity, gcTime: 0,
    refetchOnWindowFocus: false, refetchOnReconnect: false,
  })
  useExpireSession(query.error)
  useEffect(() => { if (query.data) setSource(query.data) }, [query.data])
  // A previously sent request can be replayed even if source inspection fails.
  if (source?.eligible || pending) return <ClusteringForm ownerId={ownerId} sourceJobId={sourceJobId} source={source} restored={pending} />
  const failed = !query.isFetching && (!!source || !!query.error)
  const missing = query.error instanceof ApiError && query.error.status === 404
  const code = query.error ? apiErrorCode(query.error) : source?.code
  return <main className="mx-auto max-w-2xl space-y-6 px-6 py-12">
    <Link className={buttonVariants({ variant: "ghost" })} to={gromacsPaths.job(sourceJobId)}><ArrowLeft aria-hidden="true" />Back to source job</Link>
    <Card>
      <CardHeader><CardTitle className="text-2xl">{failed ? "Clustering unavailable" : "Checking source trajectory"}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {failed ? <p role="alert" className="leading-7">{missing ? "This job does not exist or is not available to you." : query.error instanceof ApiError ? query.error.message : query.error ? "The source could not be checked. Sign in if needed, then try again." : source?.detail}</p>
          : <p role="status" className="flex items-start gap-3 leading-7"><LoaderCircle aria-hidden="true" className="mt-1 size-5 shrink-0 animate-spin motion-reduce:animate-none" />Checking retained trajectory availability and estimated resource demand. No analysis is submitted.</p>}
        {failed && code ? <p className="text-sm text-muted-foreground">Code: {code}</p> : null}
        {failed && apiRequestId(query.error) ? <p className="text-sm">Support ID: {apiRequestId(query.error)}</p> : null}
        {failed && !missing ? <Button variant="outline" disabled={!principal} onClick={() => void query.refetch()}>Check again</Button> : null}
      </CardContent>
    </Card>
  </main>
}

function ClusteringForm({ ownerId, sourceJobId, source, restored }: {
  ownerId: string; sourceJobId: string; source: GromacsClusteringInfo | null; restored: ClusteringIntent | null
}) {
  const storageKey = clusteringStorageKey(ownerId, sourceJobId)
  const [initialName] = useState(() => `${source?.source_display_name ?? "Trajectory"} clustering`.slice(0, 120))
  const [initialCutoff] = useState(() => String(source?.default_cutoff_angstrom ?? 2))
  const [name, setName] = useState(restored ? restored.input.display_name ?? "" : initialName)
  const [cutoff, setCutoff] = useState(restored ? String(restored.input.cutoff_angstrom) : initialCutoff)
  const [recovering, setRecovering] = useState(!!restored)
  const [editedUnconfirmed, setEditedUnconfirmed] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const intent = useRef<ClusteringIntent | null>(restored)
  const inFlight = useRef(false)
  const mounted = useRef(true)
  const allowNavigation = useRef(false)
  const principal = authenticatedPrincipal(useCurrentUser().data)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const mutation = useMutation({
    mutationFn: (submission: ClusteringIntent) => clusterGromacsJob(sourceJobId, submission.input, submission.key),
    retry: false,
    onSuccess(job, submission) {
      if (readClusteringIntent(window.sessionStorage, storageKey)?.key === submission.key) saveClusteringIntent(window.sessionStorage, storageKey, null)
      intent.current = null
      allowNavigation.current = true
      if (!mounted.current) return
      queryClient.setQueryData(jobKey(job.job_id), job)
      void queryClient.invalidateQueries({ queryKey: jobListKey })
      navigate(gromacsPaths.job(job.job_id), { replace: true })
    },
    onError(error) {
      if (!mounted.current) return
      if (apiErrorCode(error) === "idempotency_conflict") {
        intent.current = null
        saveClusteringIntent(window.sessionStorage, storageKey, null)
        setRecovering(false)
        setEditedUnconfirmed(true)
      }
    },
    onSettled() { inFlight.current = false },
  })
  useExpireSession(mutation.error)
  const ambiguous = !!mutation.error && (!(mutation.error instanceof ApiError) || mutation.error.status === 0 || mutation.error.status >= 500)
  const pendingCheck = recovering || ambiguous
  const busy = mutation.isPending
  const invalid = clusteringCutoffError(cutoff)
  const eligible = !!source?.eligible
  const dirty = name !== initialName || cutoff !== initialCutoff || pendingCheck
  const shouldBlock = useCallback(() => !allowNavigation.current && (dirty || inFlight.current), [dirty])
  const blocker = useBlocker(shouldBlock)
  useBeforeUnload(useCallback((event) => {
    if (shouldBlock()) { event.preventDefault(); event.returnValue = true }
  }, [shouldBlock]))
  useEffect(() => {
    if (blocker.state !== "blocked") return
    if (window.confirm("Leave this clustering form? Unsubmitted edits will be lost. A sent request may still create a job; check My Jobs before starting another.")) {
      allowNavigation.current = true
      blocker.proceed()
    } else blocker.reset()
  }, [blocker])
  function edit() {
    if (pendingCheck) setEditedUnconfirmed(true)
    intent.current = null
    saveClusteringIntent(window.sessionStorage, storageKey, null)
    setRecovering(false)
    mutation.reset()
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (invalid) { document.getElementById("clustering-cutoff")?.focus(); return }
    if (name.length > 120 || inFlight.current || principal?.user_id !== ownerId || !eligible && !intent.current) return
    const submission = intent.current ?? { key: randomUUID(), input: { display_name: normalizedDisplayName(name), cutoff_angstrom: Number(cutoff) } }
    intent.current = submission
    saveClusteringIntent(window.sessionStorage, storageKey, submission)
    inFlight.current = true
    mutation.mutate(submission)
  }
  const code = apiErrorCode(mutation.error)
  const message = code === "csrf_invalid" || mutation.error instanceof ApiError && mutation.error.status === 401
    ? "Sign in again, then retry explicitly. Your settings stay on this page."
    : mutation.error instanceof ApiError && (mutation.error.status === 409 || code === "source_check_timeout") ? mutation.error.message
    : submissionErrorMessage(mutation.error, false)
  return <main className="mx-auto max-w-3xl space-y-6 px-6 py-10 lg:py-14">
    <Link className={buttonVariants({ variant: "ghost" })} to={gromacsPaths.job(sourceJobId)}><ArrowLeft aria-hidden="true" />Back to source job</Link>
    <div><h1 className="font-heading text-3xl font-semibold">Cluster trajectory</h1><p className="mt-3 leading-7 text-muted-foreground">Create a linked analysis job using every frame of the completed production trajectory, including cumulative extensions. The source simulation stays unchanged; no additional MD runs.</p></div>
    <Card>
      <CardHeader><CardTitle>Source simulation</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <Link className="font-medium underline underline-offset-4" to={gromacsPaths.job(sourceJobId)}>{source?.source_display_name ?? "View source simulation"}</Link>
        <dl className="grid grid-cols-2 gap-2">
          <dt>Production frames</dt><dd>{source?.frame_count?.toLocaleString() ?? "Unavailable"}</dd>
          <dt>Protein atoms</dt><dd>{source?.protein_atoms?.toLocaleString() ?? "Unavailable"}</dd>
          <dt>C-alpha atoms</dt><dd>{source?.ca_atoms?.toLocaleString() ?? "Unavailable"}</dd>
          <dt>Estimated memory</dt><dd>{source?.estimated_memory_bytes == null ? "Unavailable" : formatBytes(source.estimated_memory_bytes)}</dd>
        </dl>
        <p className="leading-7 text-muted-foreground">Estimates are advisory, not a completion guarantee. All frames participate without sampling. The clustering task has a {(source?.deadline_seconds ?? 43200) / 3600}-hour execution deadline; memory or runtime exhaustion can fail this analysis without affecting the source.</p>
        {source?.warnings?.length ? <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950"><h2 className="font-semibold">Resource warnings</h2><ul className="mt-2 list-disc space-y-2 pl-5">{source.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul><p className="mt-3">You can still submit after reviewing these warnings.</p></div> : null}
      </CardContent>
    </Card>
    <form onSubmit={submit} className="space-y-6" noValidate>
      <Card><CardHeader><CardTitle>Clustering settings</CardTitle></CardHeader><CardContent className="space-y-5">
        <label className="grid gap-2 font-medium">Job name (optional)<Input value={name} maxLength={120} disabled={busy || !eligible} onChange={(event) => { edit(); setName(event.target.value) }} /></label>
        <div className="space-y-2"><label htmlFor="clustering-cutoff" className="block font-medium">RMSD cutoff (Å)</label>
          <Input id="clustering-cutoff" type="number" step="any" required value={cutoff} disabled={busy || !eligible} className="max-w-xs" aria-invalid={submitted && !!invalid} aria-describedby="clustering-cutoff-help" onChange={(event) => { edit(); setCutoff(event.target.value) }} />
          <p id="clustering-cutoff-help" className={submitted && invalid ? "text-destructive" : "text-muted-foreground"}>{submitted && invalid ? invalid : "A positive cutoff for GROMOS clustering using fitted C-alpha RMSD. The initial 2 Å is a starting point, not a universal threshold."}</p>
        </div>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Review analysis</CardTitle></CardHeader><CardContent className="space-y-4">
        <p className="leading-7">Download a CSV assigning each frame to a cluster, whole-protein medoid PDBs (actual sampled structures), and provenance. Frame indices start at zero and include time in ns; native cluster IDs start at one. The source trajectory remains in its original archive.</p>
        {pendingCheck ? <p role="status" className="rounded-lg bg-muted p-4">A previous submission is unconfirmed. Check submission reuses its exact request and key.</p> : null}
        {!eligible ? <p role="alert">The source is not confirmed for new analysis. {source?.detail} You can still check the previously sent request.</p> : null}
        {editedUnconfirmed ? <p role="alert" className="rounded-lg bg-amber-50 p-4 text-amber-950">An earlier request may already have created a job. Check <Link to="/jobs" className="underline">My Jobs</Link> before submitting changed settings.</p> : null}
        {message ? <p role="alert" className="text-destructive">{message}</p> : null}
        {code ? <p className="text-sm text-muted-foreground">Code: {code}</p> : null}
        <Button type="submit" size="lg" disabled={busy || principal?.user_id !== ownerId || !eligible && !intent.current}>{busy ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : null}{busy ? "Requesting analysis…" : pendingCheck ? "Check submission" : "Submit clustering"}</Button>
      </CardContent></Card>
    </form>
  </main>
}
