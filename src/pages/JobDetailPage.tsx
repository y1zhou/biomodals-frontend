import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  Clipboard,
  Download,
  LoaderCircle,
  RotateCcw,
  XCircle,
} from "lucide-react"
import { Fragment, lazy, Suspense, useEffect, useRef, useState } from "react"
import { Link, useParams } from "react-router"

import {
  ApiError,
  SERVICE_CONFIGURATION_ERROR_MESSAGE,
  alphaFold3JobDocumentUrl,
  apiErrorCode,
  apiRequestId,
  cancelJob,
  inspectJob,
  isServiceConfigurationError,
  jobDownloadUrl,
  prepareJobDownload,
  refreshJob,
  retryJobResultPreparation,
  type Job,
} from "@/api/client"
import { adminStorageKey } from "@/admin"
import { useExpireSession } from "@/auth-state"
import StageLogs from "@/components/JobLogs"
import JobStatusBadge from "@/components/JobStatusBadge"
import { RefreshButton } from "@/components/RefreshButton"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  formatTimestamp,
  formatRelativeTimestamp,
  jobStageTimeline,
  isProgressingJob,
  isPollableJob,
  isJobNotCancellableError,
  isJobUnavailableError,
  jobFailureMessage,
  jobKey,
  jobListKey,
  jobPollingInterval,
  jobPresentation,
  shouldRetryJobQuery,
  useDocumentVisibility,
} from "@/jobs"
import { copyText } from "@/lib/clipboard"
import { cn } from "@/lib/utils"
import { formatBytes } from "@/storage"
import {
  availableTools,
  toolSubmissionPath,
  humanizationPaths,
} from "@/tools"

const HumanizationResults = lazy(() => import("@/components/HumanizationResults"))
const AlphaFold3Results = lazy(() => import("@/components/AlphaFold3Results"))

function RelativeTimestamp({ value }: { value: number }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <time dateTime={new Date(value).toISOString()} title={formatTimestamp(value)}>
      {formatRelativeTimestamp(value, now)}
    </time>
  )
}

function JobUnavailable({ tool }: { tool: string }) {
  const selected = availableTools.find((candidate) => candidate.slug === tool)
  return (
    <main className="mx-auto max-w-xl px-6 py-24 text-center">
      <XCircle aria-hidden="true" className="mx-auto size-9 text-muted-foreground" />
      <h1 className="mt-5 font-heading text-3xl font-semibold">Job unavailable</h1>
      <p className="mt-3 leading-7 text-muted-foreground">
        This job does not exist or is not available to you.
      </p>
      <div className="mt-7 flex justify-center gap-3">
        <Link className={buttonVariants()} to="/jobs">
          My Jobs
        </Link>
        <Link className={buttonVariants({ variant: "outline" })} to={selected ? `/tools/${selected.slug}` : "/"}>
          {selected?.name ?? "Tools"}
        </Link>
      </div>
    </main>
  )
}

export default function JobDetailPage({ tool: expectedTool }: { tool: string }) {
  const { jobId = "" } = useParams()
  const queryClient = useQueryClient()
  const confirmationDialog = useRef<HTMLDialogElement>(null)
  const [copied, setCopied] = useState(false)
  const [expandedLogStage, setExpandedLogStage] = useState<string | null>(null)
  const visibility = useDocumentVisibility()
  const jobQuery = useQuery({
    queryKey: jobKey(jobId),
    queryFn: ({ signal }) => inspectJob(jobId, signal),
    enabled: Boolean(jobId),
    retry: shouldRetryJobQuery,
    refetchInterval(query) {
      return jobPollingInterval(query.state.data, visibility)
    },
    refetchIntervalInBackground: true,
    refetchOnWindowFocus(query) {
      return Boolean(
        query.state.data &&
          (isPollableJob(query.state.data.state) ||
            query.state.data.state === "state_unknown")
      )
    },
  })
  const cancelMutation = useMutation({
    mutationFn: () => cancelJob(jobId),
    retry: false,
    onMutate: () => queryClient.cancelQueries({ queryKey: jobKey(jobId) }),
    onSuccess(job) {
      queryClient.setQueryData(jobKey(jobId), job)
      queryClient.setQueryData<Job[]>(jobListKey, (jobs) =>
        jobs?.map((candidate) => (candidate.job_id === job.job_id ? job : candidate))
      )
      confirmationDialog.current?.close()
    },
    onError(error) {
      if (isJobNotCancellableError(error)) {
        confirmationDialog.current?.close()
        void jobQuery.refetch()
      }
    },
  })
  const downloadMutation = useMutation({
    mutationFn: () => prepareJobDownload(jobId),
    retry: false,
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: adminStorageKey })
      const download = document.createElement("a")
      download.href = jobDownloadUrl(jobId)
      download.download = ""
      download.hidden = true
      document.body.append(download)
      download.click()
      download.remove()
    },
    onError(error) {
      if (apiErrorCode(error) === "result_invalid") {
        void jobQuery.refetch()
      }
    },
  })
  useExpireSession(jobQuery.error)
  useExpireSession(cancelMutation.error)
  useExpireSession(downloadMutation.error)
  const preparationMutation = useMutation({
    mutationFn: () => retryJobResultPreparation(jobId),
    retry: false,
    onMutate: () => queryClient.cancelQueries({ queryKey: jobKey(jobId) }),
    onSuccess(job) {
      queryClient.setQueryData(jobKey(jobId), job)
      queryClient.setQueryData<Job[]>(jobListKey, (jobs) =>
        jobs?.map((candidate) => candidate.job_id === job.job_id ? job : candidate)
      )
    },
    onError() { void jobQuery.refetch() },
  })
  useExpireSession(preparationMutation.error)

  if (jobQuery.isPending) {
    return (
      <main className="grid min-h-[60svh] place-items-center px-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Loading job…
        </div>
      </main>
    )
  }

  const queryError = jobQuery.error
  if (isJobUnavailableError(queryError)) {
    return <JobUnavailable tool={expectedTool} />
  }

  if (!jobQuery.data) {
    return (
      <main className="mx-auto max-w-xl px-6 py-24 text-center">
        <AlertTriangle aria-hidden="true" className="mx-auto size-9 text-destructive" />
        <h1 className="mt-5 font-heading text-3xl font-semibold">Job could not be loaded</h1>
        <p className="mt-3 leading-7 text-muted-foreground">
          Check the connection and try again.
          {apiRequestId(queryError) ? ` Support ID: ${apiRequestId(queryError)}.` : ""}
        </p>
        <RefreshButton
          className="mt-7"
          idleLabel="Try again"
          onRefresh={async () => {
            const result = await jobQuery.refetch()
            if (result.isError) throw result.error
          }}
          variant="default"
        />
      </main>
    )
  }

  const job = jobQuery.data
  if (job.tool !== expectedTool) return <JobUnavailable tool={expectedTool} />
  const tool = availableTools.find((candidate) => candidate.slug === job.tool)
  const presentation = jobPresentation[job.state]
  const canCancel = job.state === "queued" || job.state === "running"
  const canDownload = job.state === "succeeded" || job.state === "partial"
  const canStartAgain = job.state === "failed" || job.state === "cancelled"
  const relativeLastChecked =
    job.state !== "succeeded" &&
    job.state !== "partial" &&
    job.state !== "cancelled"
  const stateDescription =
    job.state === "failed"
      ? jobFailureMessage(job)
      : job.state_message ?? presentation.description
  const stages = jobStageTimeline(job)
  const currentStages = stages.filter((stage) =>
    stage.state === "active" || stage.state === "queued"
  )
  const activeStages = stages.filter((stage) => stage.state === "active")
  const downloadError = downloadMutation.error
    ? apiErrorCode(downloadMutation.error) === "result_invalid"
      ? "The result could not be verified. BioModals will keep the job output for an administrator to recover."
      : apiErrorCode(downloadMutation.error) === "result_storage_unavailable"
        ? "Result storage is temporarily unavailable. Try again shortly."
        : downloadMutation.error instanceof ApiError && downloadMutation.error.status === 409
          ? "This result is not currently available to download. Refresh the job status."
          : `The download could not be prepared.${
              apiRequestId(downloadMutation.error)
                ? ` Support ID: ${apiRequestId(downloadMutation.error)}.`
                : " Try again."
            }`
    : null

  return (
    <>
      <main className={cn("mx-auto px-6 py-10 lg:px-8 lg:py-14", job.tool === "alphafold3" && job.state === "succeeded" ? "max-w-7xl" : "max-w-5xl")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link className={buttonVariants({ variant: "ghost" })} to="/jobs">
            <ArrowLeft aria-hidden="true" data-icon="inline-start" />
            My Jobs
          </Link>
          <RefreshButton
            disabled={jobQuery.isFetching}
            onRefresh={async () => {
              await queryClient.cancelQueries({ queryKey: jobKey(jobId) })
              const refreshed = await refreshJob(jobId)
              queryClient.setQueryData(jobKey(jobId), refreshed)
              queryClient.setQueryData<Job[]>(jobListKey, (jobs) =>
                jobs?.map((candidate) =>
                  candidate.job_id === refreshed.job_id ? refreshed : candidate
                )
              )
            }}
          />
        </div>

        <section className="mt-8">
          <p aria-atomic="true" aria-live="polite" className="sr-only">
            Job status: {presentation.label}.
            {currentStages.length
              ? ` Current stages: ${currentStages.map((stage) => stage.label).join(", ")}.`
              : ""}
          </p>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {tool?.name ?? job.tool}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
                  {job.display_name}
                </h1>
                {job.tool === "alphafold3" && job.state !== "cancelled" ? (
                  <a
                    className={buttonVariants({ variant: "outline" })}
                    download
                    href={alphaFold3JobDocumentUrl(job.job_id)}
                  >
                    <Download aria-hidden="true" />
                    Download input JSON
                  </a>
                ) : null}
              </div>
            </div>
            <JobStatusBadge state={job.state} />
          </div>

          {jobQuery.isError ? (
            <div
              className="mt-6 flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
              role="alert"
            >
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              Unable to refresh job status. Showing the last known state from {formatTimestamp(jobQuery.dataUpdatedAt)}.
              {apiRequestId(jobQuery.error) ? ` Support ID: ${apiRequestId(jobQuery.error)}.` : ""}
            </div>
          ) : null}

          <Card className={cn("mt-8 border", presentation.className)}>
            <CardHeader>
              <div className="flex items-center gap-3">
                {isProgressingJob(job.state) ? (
                  <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
                ) : null}
                <CardTitle className="text-xl">{presentation.label}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="max-w-2xl leading-7">
                {stateDescription}
                {canDownload && job.result_size_bytes ? (
                  <> The downloadable result archive is {formatBytes(job.result_size_bytes)}.</>
                ) : null}
              </p>
              <p className="mt-2 text-xs opacity-80">
                Job updated {formatTimestamp(job.updated_at)} · Last checked{" "}
                {relativeLastChecked ? (
                  <RelativeTimestamp value={jobQuery.dataUpdatedAt} />
                ) : (
                  formatTimestamp(jobQuery.dataUpdatedAt)
                )}
              </p>
              {job.warnings?.length ? (
                <div className="mt-5 rounded-lg border border-current/20 bg-background/70 p-4">
                  <h2 className="text-sm font-semibold">Warnings</h2>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6">
                    {job.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="mt-6 flex flex-wrap gap-3">
                {job.can_retry_result_preparation ? <Button disabled={preparationMutation.isPending} onClick={() => preparationMutation.mutate()}>
                  {preparationMutation.isPending ? "Requesting preparation…" : "Retry result preparation"}
                </Button> : null}
                {canCancel ? (
                  <Button
                    onClick={() => {
                      cancelMutation.reset()
                      confirmationDialog.current?.showModal()
                    }}
                    variant="destructive"
                  >
                    Cancel job
                  </Button>
                ) : null}
                {canDownload ? (
                  <Button
                    disabled={downloadMutation.isPending}
                    onClick={() => {
                      downloadMutation.reset()
                      downloadMutation.mutate()
                    }}
                  >
                    {downloadMutation.isPending ? (
                      <LoaderCircle aria-hidden="true" className="animate-spin" />
                    ) : (
                      <Download aria-hidden="true" />
                    )}
                    {downloadMutation.isPending
                      ? "Preparing download…"
                      : "Download result"}
                  </Button>
                ) : null}
                {job.tool === "humanization" ? <Link className={buttonVariants({ variant: "outline" })} to={humanizationPaths.rerun(job.job_id)}>
                  <RotateCcw aria-hidden="true" /> Rerun with same inputs
                </Link> : null}
                {canStartAgain && job.tool !== "humanization" ? (
                  <Link className={buttonVariants()} to={toolSubmissionPath(job.tool)}>
                    <RotateCcw aria-hidden="true" data-icon="inline-start" />
                    Start a new job
                  </Link>
                ) : null}
              </div>
              {job.can_retry_result_preparation ? <p className="mt-3 text-muted-foreground">Retry preparing the existing scientific outputs for this job. This does not rerun scientific computation or submit a new job.</p> : null}
              {preparationMutation.error ? <p className="mt-4 text-destructive" role="alert">
                {apiErrorCode(preparationMutation.error) === "result_retry_not_allowed" ? "Result preparation cannot be retried in the current job state." : "The preparation request could not be confirmed. Check the job status before trying again."}
                {apiRequestId(preparationMutation.error) ? ` Support ID: ${apiRequestId(preparationMutation.error)}.` : ""}
              </p> : null}
              {downloadError ? (
                <p className="mt-4 text-sm text-destructive" role="alert">
                  {downloadError}
                </p>
              ) : null}
              {job.state === "state_unknown" ? (
                <div className="mt-5 text-sm">
                  <p>
                    This job continues to use an active-job slot until an administrator resolves it.
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {job.tool === "alphafold3" && job.state === "succeeded" ? <Suspense fallback={<p className="mt-6" role="status">Loading prediction viewer…</p>}><AlphaFold3Results jobId={job.job_id} key={job.job_id} /></Suspense> : null}

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Execution stages</CardTitle>
              <p className="text-sm text-muted-foreground">
                Highlighted rows are queued or active stages last reported by BioModals.
                Timestamps show when BioModals recorded each transition.
                {job.can_view_logs
                  ? " Click a started remote stage to view its logs."
                  : null}
              </p>
            </CardHeader>
            <CardContent className="px-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[44rem] table-fixed text-left text-sm">
                  <caption className="sr-only">Execution stages</caption>
                  <colgroup>
                    <col className="w-[30%]" />
                    <col className="w-[18%]" />
                    <col className="w-[26%]" />
                    <col className="w-[26%]" />
                  </colgroup>
                  <thead className="border-y bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-6 py-3 font-medium" scope="col">
                        Stage
                      </th>
                      <th className="px-6 py-3 font-medium" scope="col">
                        Status
                      </th>
                      <th className="px-3 py-3 font-medium" scope="col">
                        Started
                      </th>
                      <th className="px-3 py-3 font-medium" scope="col">
                        Finished
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {stages.map((stage, index) => {
                      const active = stage.state === "active"
                      const queued = stage.state === "queued"
                      const canInspectLogs = Boolean(
                        job.can_view_logs &&
                        stage.startedAt
                      )
                      const logsExpanded =
                        canInspectLogs && expandedLogStage === stage.code
                      const toggleLogs = () => {
                        if (!canInspectLogs) return
                        setExpandedLogStage((current) =>
                          current === stage.code ? null : stage.code
                        )
                      }
                      const statusLabel =
                        stage.state === "completed"
                          ? "Completed"
                          : stage.state === "partial"
                            ? "Partial"
                            : stage.state === "failed"
                              ? "Failed"
                            : stage.state === "cancelled"
                              ? "Cancelled"
                              : stage.state === "upcoming"
                                ? "Not started"
                                : stage.state === "queued"
                                  ? "Queued"
                                  : presentation.label

                      return (
                        <Fragment key={stage.code}>
                          <tr
                            className={cn(
                              (active || queued) && "bg-muted/50",
                              canInspectLogs &&
                                "cursor-pointer transition-colors hover:bg-muted/60 active:bg-muted",
                              logsExpanded && "bg-muted/60"
                            )}
                            onClick={toggleLogs}
                          >
                            <th className="px-6 py-4 font-medium" scope="row">
                              {canInspectLogs ? (
                                <button
                                  aria-controls={`stage-logs-${stage.code}`}
                                  aria-expanded={logsExpanded}
                                  className="flex w-full items-center gap-3 text-left outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-ring"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    toggleLogs()
                                  }}
                                  type="button"
                                >
                                  <span className="text-xs text-muted-foreground">
                                    {index + 1}
                                  </span>
                                  <span>{stage.label}</span>
                                  <ChevronDown
                                    aria-hidden="true"
                                    className={cn(
                                      "ml-auto size-4 text-muted-foreground transition-transform",
                                      logsExpanded && "rotate-180"
                                    )}
                                  />
                                </button>
                              ) : (
                                <>
                                  <span className="mr-3 text-xs text-muted-foreground">
                                    {index + 1}
                                  </span>
                                  {stage.label}
                                </>
                              )}
                            </th>
                            <td
                              className={cn(
                                "px-6 py-4",
                                stage.state === "completed"
                                  ? "text-emerald-700"
                                  : stage.state === "partial"
                                    ? "text-amber-700"
                                  : stage.state === "failed"
                                    ? "text-destructive"
                                    : stage.state === "cancelled"
                                      ? "text-muted-foreground"
                                      : stage.state === "upcoming"
                                        ? "text-muted-foreground"
                                        : "font-medium"
                              )}
                            >
                              {statusLabel}
                            </td>
                            <td className="px-3 py-4 text-muted-foreground">
                              {formatTimestamp(stage.startedAt)}
                            </td>
                            <td className="px-3 py-4 text-muted-foreground">
                              {formatTimestamp(stage.endedAt)}
                            </td>
                          </tr>
                          {logsExpanded ? (
                            <tr>
                              <td
                                className="max-w-0 bg-muted/20 px-6 py-4"
                                colSpan={4}
                              >
                                <StageLogs
                                  jobId={job.job_id}
                                  stageCode={stage.code}
                                  stageLabel={stage.label}
                                  toolSlug={job.tool}
                                />
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {!activeStages.length && isProgressingJob(job.state) ? (
                <p className="px-6 pt-4 text-sm text-muted-foreground">
                  {job.state === "queued"
                    ? job.state_message ??
                      "BioModals accepted this job and is waiting to start the first stage."
                    : job.state === "cancel_requested"
                      ? "No remote function is currently recorded while cancellation is being resolved."
                      : "BioModals is moving to the next stage. No running function is currently recorded."}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Timing</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Created</dt>
                    <dd className="text-right font-medium">{formatTimestamp(job.created_at)}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Job updated</dt>
                    <dd className="text-right font-medium">{formatTimestamp(job.updated_at)}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Completed</dt>
                    <dd className="text-right font-medium">{formatTimestamp(job.completed_at)}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Support reference</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="break-all font-mono text-xs">{job.job_id}</p>
                <Button
                  className="mt-4"
                  onClick={() => {
                    void copyText(job.job_id)
                      .then(() => {
                        setCopied(true)
                        window.setTimeout(() => setCopied(false), 2000)
                      })
                      .catch(() => setCopied(false))
                  }}
                  size="sm"
                  variant="outline"
                >
                  {copied ? <Check aria-hidden="true" /> : <Clipboard aria-hidden="true" />}
                  {copied ? "Copied" : "Copy job ID"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>
        {job.tool === "humanization" && canDownload ? <Suspense fallback={<p className="mt-6" role="status">Loading candidates…</p>}><HumanizationResults key={job.job_id} jobId={job.job_id} /></Suspense> : null}
      </main>

      <dialog
        aria-labelledby="cancel-job-title"
        className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-xl border bg-background p-0 text-foreground shadow-2xl backdrop:bg-foreground/30"
        onCancel={(event) => {
          if (cancelMutation.isPending) event.preventDefault()
        }}
        ref={confirmationDialog}
      >
        <div className="p-6">
          <h2 className="font-heading text-xl font-semibold" id="cancel-job-title">
            Cancel this job?
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Cancellation is best effort. The job may complete before the remote work stops.
          </p>
          {cancelMutation.isError && !isJobNotCancellableError(cancelMutation.error) ? (
            <p aria-live="polite" className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {isServiceConfigurationError(cancelMutation.error)
                              ? SERVICE_CONFIGURATION_ERROR_MESSAGE
                              : `Cancellation could not be requested. Try again.${
                                  apiRequestId(cancelMutation.error)
                                    ? ` Support ID: ${apiRequestId(cancelMutation.error)}.`
                                    : ""
                                }`}
            </p>
          ) : null}
          <div className="mt-6 flex justify-end gap-3">
            <Button
              disabled={cancelMutation.isPending}
              onClick={() => confirmationDialog.current?.close()}
              variant="ghost"
            >
              Keep running
            </Button>
            <Button
              disabled={cancelMutation.isPending}
              onClick={() => cancelMutation.mutate()}
              variant="destructive"
            >
              {cancelMutation.isPending ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : null}
              Request cancellation
            </Button>
          </div>
        </div>
      </dialog>
    </>
  )
}
