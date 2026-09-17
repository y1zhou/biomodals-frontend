import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, LoaderCircle } from "lucide-react"
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { Link, useBeforeUnload, useBlocker, useNavigate, useParams } from "react-router"
import { ApiError, apiErrorCode, apiRequestId, continueGromacsJob, gromacsContinuationInfo, type GromacsContinuationInfo } from "@/api/client"
import { authenticatedPrincipal, useCurrentUser, useExpireSession } from "@/auth-state"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { normalizedDisplayName, simulationTimeError, submissionErrorMessage } from "@/gromacs"
import { continuationStorageKey, readContinuationIntent, saveContinuationIntent, type ContinuationIntent } from "@/gromacs-continuation"
import { jobKey, jobListKey } from "@/jobs"
import { randomUUID } from "@/lib/uuid"
import { gromacsPaths } from "@/tools"

export default function GromacsContinuationPage() {
  const { jobId = "" } = useParams()
  const principal = authenticatedPrincipal(useCurrentUser().data)
  const lastOwner = useRef(principal?.user_id ?? "")
  if (principal) lastOwner.current = principal.user_id
  return <ContinuationSourcePage key={`${lastOwner.current}:${jobId}`} ownerId={lastOwner.current} sourceJobId={jobId} />
}

function ContinuationSourcePage({ ownerId, sourceJobId }: { ownerId: string; sourceJobId: string }) {
  const principal = authenticatedPrincipal(useCurrentUser().data)
  // Capture immutable source defaults once so reauthentication preserves the form.
  const [source, setSource] = useState<GromacsContinuationInfo | null>(null)
  const query = useQuery({
    queryKey: ["gromacs-continuation", ownerId, sourceJobId],
    queryFn: ({ signal }) => gromacsContinuationInfo(sourceJobId, signal),
    enabled: !!sourceJobId && principal?.user_id === ownerId && !source,
    retry: false, staleTime: Infinity, gcTime: 0,
    refetchOnWindowFocus: false, refetchOnReconnect: false,
  })
  useExpireSession(query.error)
  useEffect(() => { if (query.data) setSource(query.data) }, [query.data])
  const pending = source ? readContinuationIntent(window.sessionStorage, continuationStorageKey(ownerId, sourceJobId)) : null
  const canStart = !!source?.eligible && source.simulation_time_ns !== null && source.cpu_only !== null
  if (source && (canStart || pending)) {
    return <ContinuationForm ownerId={ownerId} sourceJobId={sourceJobId} sourceName={source.source_display_name} sourceTimeNs={source.simulation_time_ns} sourceCpuOnly={source.cpu_only ?? pending!.input.cpu_only} parentJobId={source.parent_job_id} eligible={canStart} sourceDetail={source.detail} />
  }
  const failed = !!source || !!query.error
  const missing = query.error instanceof ApiError && query.error.status === 404
  return <main className="mx-auto max-w-2xl space-y-6 px-6 py-12">
    <Link className={buttonVariants({ variant: "ghost" })} to={gromacsPaths.job(sourceJobId)}><ArrowLeft aria-hidden="true" />Back to source job</Link>
    <Card>
      <CardHeader><CardTitle className="text-2xl">{failed ? "Continuation unavailable" : "Checking continuation source"}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p role={failed ? "alert" : "status"} className="leading-7">{source?.detail || (missing ? "This job does not exist or is not available to you." : query.error ? "The source could not be checked. Sign in if needed, then try again." : "Checking the completed job and its retained native restart state. No simulation is submitted.")}</p>
        {source?.code || apiErrorCode(query.error) ? <p className="text-sm text-muted-foreground">Code: {source?.code || apiErrorCode(query.error)}</p> : null}
        {apiRequestId(query.error) ? <p className="text-sm">Support ID: {apiRequestId(query.error)}</p> : null}
        {failed && !missing ? <Button variant="outline" disabled={query.isFetching || !principal} onClick={() => void query.refetch()}>Check again</Button> : null}
        <Link className={buttonVariants({ variant: "outline" })} to="/jobs">My Jobs</Link>
      </CardContent>
    </Card>
  </main>
}

function ContinuationForm({ ownerId, sourceJobId, sourceName, sourceTimeNs, sourceCpuOnly, parentJobId, eligible, sourceDetail }: {
  ownerId: string
  sourceJobId: string
  sourceName: string
  sourceTimeNs: number | null
  sourceCpuOnly: boolean
  parentJobId: string | null
  eligible: boolean
  sourceDetail: string
}) {
  const storageKey = continuationStorageKey(ownerId, sourceJobId)
  const [restored] = useState(() => readContinuationIntent(window.sessionStorage, storageKey))
  const intent = useRef<ContinuationIntent | null>(restored)
  const inFlight = useRef(false)
  const mounted = useRef(true)
  const allowNavigation = useRef(false)
  const [name, setName] = useState(restored ? restored.input.display_name ?? "" : `${sourceName} continuation`.slice(0, 120))
  const [duration, setDuration] = useState(restored ? String(restored.input.additional_time_ns) : "")
  const [cpuOnly, setCpuOnly] = useState(restored ? restored.input.cpu_only : sourceCpuOnly)
  const [recovering, setRecovering] = useState(!!restored)
  const [editedUnconfirmed, setEditedUnconfirmed] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const principal = authenticatedPrincipal(useCurrentUser().data)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  const mutation = useMutation({
    mutationFn: (submission: ContinuationIntent) => continueGromacsJob(sourceJobId, submission.input, submission.key),
    retry: false,
    onSuccess(job, submission) {
      if (readContinuationIntent(window.sessionStorage, storageKey)?.key === submission.key) {
        saveContinuationIntent(window.sessionStorage, storageKey, null)
      }
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
        saveContinuationIntent(window.sessionStorage, storageKey, null)
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
  const invalidDuration = simulationTimeError(duration)
  const dirty = !!duration || cpuOnly !== sourceCpuOnly || name !== `${sourceName} continuation`.slice(0, 120)
  const shouldBlock = useCallback(() => !allowNavigation.current && (dirty || inFlight.current), [dirty])
  const blocker = useBlocker(shouldBlock)
  useBeforeUnload(useCallback((event) => {
    if (shouldBlock()) { event.preventDefault(); event.returnValue = true }
  }, [shouldBlock]))
  useEffect(() => {
    if (blocker.state !== "blocked") return
    if (window.confirm("Leave this continuation form? Unsubmitted edits will be lost. A request already sent may still create a job; check My Jobs before starting another.")) {
      allowNavigation.current = true
      blocker.proceed()
    } else blocker.reset()
  }, [blocker])

  function editIntent() {
    if (pendingCheck) setEditedUnconfirmed(true)
    intent.current = null
    saveContinuationIntent(window.sessionStorage, storageKey, null)
    setRecovering(false)
    mutation.reset()
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (invalidDuration) { document.getElementById("additional-time")?.focus(); return }
    if (name.length > 120 || inFlight.current || principal?.user_id !== ownerId || !eligible && !intent.current) return
    const submission = intent.current ?? {
      key: randomUUID(),
      input: { display_name: normalizedDisplayName(name), additional_time_ns: Number(duration), cpu_only: cpuOnly },
    }
    intent.current = submission
    saveContinuationIntent(window.sessionStorage, storageKey, submission)
    inFlight.current = true
    mutation.mutate(submission)
  }

  const code = apiErrorCode(mutation.error)
  const message = code === "csrf_invalid" || mutation.error instanceof ApiError && mutation.error.status === 401
    ? "Sign in again, then check this submission. Your settings stay on this page."
    : mutation.error instanceof ApiError && mutation.error.status === 409 && code !== "active_job_limit_reached" && code !== "idempotency_conflict"
    ? mutation.error.message
    : submissionErrorMessage(mutation.error, false)
  return <main className="mx-auto max-w-3xl space-y-6 px-6 py-10 lg:py-14">
    <Link className={buttonVariants({ variant: "ghost" })} to={gromacsPaths.job(sourceJobId)}><ArrowLeft aria-hidden="true" />Back to source job</Link>
    <div><h1 className="font-heading text-3xl font-semibold">Extend simulation</h1>
      <p className="mt-3 leading-7 text-muted-foreground">Create a new linked GROMACS job from the completed molecular state. The source job and its results stay unchanged.</p></div>
    <Card>
      <CardHeader><CardTitle>Source simulation</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <Link className="font-medium underline underline-offset-4" to={gromacsPaths.job(sourceJobId)}>{sourceName}</Link>
        <p>Completed production: <strong>{sourceTimeNs === null ? "Unavailable" : `${sourceTimeNs} ns`}</strong></p>
        {parentJobId ? <p>This source is itself a continuation. <Link className="underline" to={gromacsPaths.job(parentJobId)}>View its parent job</Link>.</p> : null}
        <p className="leading-7 text-muted-foreground">Physical settings and checkpoint state are inherited. Preparation and equilibration are not repeated.</p>
      </CardContent>
    </Card>
    <form onSubmit={submit} className="space-y-6" noValidate>
      <Card>
        <CardHeader><CardTitle>New continuation job</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <label className="grid gap-2 font-medium">Job name (optional)
            <Input value={name} maxLength={120} disabled={busy || !eligible} onChange={(event) => { editIntent(); setName(event.target.value) }} />
          </label>
          <div className="space-y-2">
            <label className="block font-medium" htmlFor="additional-time">Additional production time (ns)</label>
            <Input id="additional-time" value={duration} className="max-w-xs" type="number" min={1} max={250} step={1} required disabled={busy || !eligible} aria-invalid={submitted && !!invalidDuration} aria-describedby="additional-time-help" onChange={(event) => { editIntent(); setDuration(event.target.value) }} />
            <p id="additional-time-help" className={submitted && invalidDuration ? "text-destructive" : "text-muted-foreground"}>{submitted && invalidDuration ? invalidDuration : "Add 1–250 whole ns. Cumulative history may exceed 250 ns."}</p>
          </div>
          <div className="grid max-w-xs gap-2">
            <label className="font-medium" htmlFor="continuation-mode">Execution mode</label>
            <select id="continuation-mode" className="rounded-lg border bg-background px-3 py-2" value={cpuOnly ? "cpu" : "gpu"} disabled={busy || !eligible} onChange={(event) => { editIntent(); setCpuOnly(event.target.value === "cpu") }}>
              <option value="gpu">GPU accelerated</option><option value="cpu">CPU only</option>
            </select>
          </div>
          <p className="text-muted-foreground">Defaults to the source job’s execution mode.</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Review continuation</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {!invalidDuration && sourceTimeNs !== null ? <p className="text-lg"><strong>{sourceTimeNs} ns</strong> completed + <strong>{Number(duration)} ns</strong> additional = <strong>{sourceTimeNs + Number(duration)} ns</strong> cumulative production</p> : <p>{sourceTimeNs === null ? "The source endpoint is currently unavailable." : "Enter the additional duration to review the new endpoint."}</p>}
          <p className="leading-7 text-muted-foreground">The new archive and plots cover the full cumulative production trajectory. RMSD keeps the original reference; RMSF is recalculated over the full history. Longer histories also increase copying and analysis work.</p>
          {pendingCheck ? <p role="status" className="rounded-lg bg-muted p-4">A previous submission is unconfirmed. Check submission reuses its original request and key; it does not intentionally create a second job.</p> : null}
          {!eligible ? <p role="alert">New continuations are unavailable: {sourceDetail} You can still check the previously sent request.</p> : null}
          {editedUnconfirmed ? <p role="alert" className="rounded-lg bg-amber-50 p-4 text-amber-950">An earlier request may already have created a job. Check <Link to="/jobs" className="underline">My Jobs</Link> before submitting these changed settings.</p> : null}
          {message ? <p role="alert" className="text-destructive">{message}</p> : null}
          <Button type="submit" size="lg" disabled={busy || principal?.user_id !== ownerId || !eligible && !intent.current}>
            {busy ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}
            {busy ? "Requesting continuation…" : pendingCheck ? "Check submission" : "Submit continuation"}
          </Button>
        </CardContent>
      </Card>
    </form>
  </main>
}
