import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Clipboard,
  Download,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  XCircle,
} from "lucide-react"
import { useRef, useState } from "react"
import { Link, useParams } from "react-router"

import {
  SERVICE_CONFIGURATION_ERROR_MESSAGE,
  cancelJob,
  inspectJob,
  isServiceConfigurationError,
  type Job,
} from "@/api/client"
import { useExpireSession } from "@/auth-state"
import JobStatusBadge from "@/components/JobStatusBadge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  formatTimestamp,
  gromacsStageTimeline,
  isActiveJob,
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
import { gromacsPaths, gromacsTool } from "@/tools"

function JobUnavailable() {
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
        <Link className={buttonVariants({ variant: "outline" })} to={gromacsPaths.overview}>
          GROMACS tool
        </Link>
      </div>
    </main>
  )
}

export default function JobDetailPage() {
  const { jobId = "" } = useParams()
  const queryClient = useQueryClient()
  const confirmationDialog = useRef<HTMLDialogElement>(null)
  const [copied, setCopied] = useState(false)
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
      return Boolean(query.state.data && isActiveJob(query.state.data.state))
    },
  })
  const cancelMutation = useMutation({
    mutationFn: () => cancelJob(jobId),
    retry: false,
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
  useExpireSession(jobQuery.error)
  useExpireSession(cancelMutation.error)

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
    return <JobUnavailable />
  }

  if (!jobQuery.data) {
    return (
      <main className="mx-auto max-w-xl px-6 py-24 text-center">
        <AlertTriangle aria-hidden="true" className="mx-auto size-9 text-destructive" />
        <h1 className="mt-5 font-heading text-3xl font-semibold">Job could not be loaded</h1>
        <p className="mt-3 leading-7 text-muted-foreground">
          Check the connection and try again.
        </p>
        <Button className="mt-7" onClick={() => void jobQuery.refetch()}>
          <RefreshCw aria-hidden="true" />
          Try again
        </Button>
      </main>
    )
  }

  const job = jobQuery.data
  const presentation = jobPresentation[job.state]
  const canCancel = job.state === "queued" || job.state === "running"
  const canDownload = job.state === "succeeded" || job.state === "partial"
  const canStartAgain = job.state === "failed" || job.state === "cancelled"
  const stateDescription =
    job.state === "failed" ? jobFailureMessage(job) : presentation.description
  const stages = gromacsStageTimeline(job)
  const currentStage = stages.find((stage) => stage.state === "current")
  const runningFunction = job.state === "running"
    ? currentStage?.functionName
    : null

  return (
    <>
      <main className="mx-auto max-w-5xl px-6 py-10 lg:px-8 lg:py-14">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link className={buttonVariants({ variant: "ghost" })} to="/jobs">
            <ArrowLeft aria-hidden="true" data-icon="inline-start" />
            My Jobs
          </Link>
          <Button
            disabled={jobQuery.isFetching}
            onClick={() => void jobQuery.refetch()}
            variant="outline"
          >
            <RefreshCw aria-hidden="true" className={cn(jobQuery.isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>

        <section className="mt-8">
          <p aria-atomic="true" aria-live="polite" className="sr-only">
            Job status: {presentation.label}.
            {currentStage ? ` Current stage: ${currentStage.label}.` : ""}
            {runningFunction
              ? ` Running function: ${runningFunction}.`
              : ""}
          </p>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">{gromacsTool.name}</p>
              <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
                {job.display_name}
              </h1>
            </div>
            <JobStatusBadge state={job.state} />
          </div>

          {jobQuery.isError ? (
            <div className="mt-6 flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              Status could not be refreshed. Last successful refresh: {formatTimestamp(jobQuery.dataUpdatedAt)}.
            </div>
          ) : null}

          <Card className={cn("mt-8 border", presentation.className)}>
            <CardHeader>
              <div className="flex items-center gap-3">
                {isActiveJob(job.state) ? (
                  <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
                ) : null}
                <CardTitle className="text-xl">{presentation.label}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="max-w-2xl leading-7">{stateDescription}</p>
              <p className="mt-2 text-xs opacity-80">
                Job updated {formatTimestamp(job.updated_at)} · Last checked {formatTimestamp(jobQuery.dataUpdatedAt)}
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
                  <a
                    className={buttonVariants()}
                    href={`/api/v1/jobs/${encodeURIComponent(job.job_id)}/download`}
                  >
                    <Download aria-hidden="true" data-icon="inline-start" />
                    Download result
                  </a>
                ) : null}
                {canStartAgain ? (
                  <Link className={buttonVariants()} to={gromacsPaths.submission}>
                    <RotateCcw aria-hidden="true" data-icon="inline-start" />
                    Start a new simulation
                  </Link>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Execution stages</CardTitle>
              <p className="text-sm text-muted-foreground">
                The highlighted step is the latest state reported by BioModals. Timestamps show when BioModals recorded each transition.
              </p>
            </CardHeader>
            <CardContent className="px-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[64rem] text-left text-sm">
                  <caption className="sr-only">GROMACS execution stages</caption>
                  <thead className="border-y bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-6 py-3 font-medium" scope="col">
                        Stage
                      </th>
                      <th className="px-6 py-3 font-medium" scope="col">
                        Status
                      </th>
                      <th className="px-6 py-3 font-medium" scope="col">
                        Running function
                      </th>
                      <th className="px-6 py-3 font-medium" scope="col">
                        Started
                      </th>
                      <th className="px-6 py-3 font-medium" scope="col">
                        Completed
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {stages.map((stage, index) => {
                      const current = stage.state === "current"
                      const statusLabel =
                        stage.state === "completed"
                          ? "Completed"
                          : stage.state === "upcoming"
                            ? "Not started"
                            : presentation.label

                      return (
                        <tr
                          aria-current={current ? "step" : undefined}
                          className={cn(current && "bg-muted/50")}
                          key={stage.code}
                        >
                          <th className="px-6 py-4 font-medium" scope="row">
                            <span className="mr-3 text-xs text-muted-foreground">
                              {index + 1}
                            </span>
                            {stage.label}
                          </th>
                          <td
                            className={cn(
                              "px-6 py-4",
                              stage.state === "completed"
                                ? "text-emerald-700"
                                : stage.state === "upcoming"
                                  ? "text-muted-foreground"
                                  : "font-medium"
                            )}
                          >
                            {statusLabel}
                          </td>
                          <td className="px-6 py-4">
                            {current && job.state === "running" && stage.functionName ? (
                              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                                {stage.functionName}
                              </code>
                            ) : current &&
                              stage.code === "result_packaging" ? (
                              <span className="text-muted-foreground">
                                Not applicable (API service)
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-muted-foreground">
                            {formatTimestamp(stage.startedAt)}
                          </td>
                          <td className="px-6 py-4 text-muted-foreground">
                            {formatTimestamp(stage.completedAt)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {!currentStage && isActiveJob(job.state) ? (
                <p className="px-6 pt-4 text-sm text-muted-foreground">
                  BioModals is moving to the next stage. No running function is currently recorded.
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
            Cancellation is best effort. The simulation may complete before the remote work stops.
          </p>
          {cancelMutation.isError && !isJobNotCancellableError(cancelMutation.error) ? (
            <p aria-live="polite" className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {isServiceConfigurationError(cancelMutation.error)
                ? SERVICE_CONFIGURATION_ERROR_MESSAGE
                : "Cancellation could not be requested. Try again."}
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
