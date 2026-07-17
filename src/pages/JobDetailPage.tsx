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

import { ApiError, cancelJob, inspectJob, type Job } from "@/api/client"
import { useExpireSession } from "@/auth-state"
import JobStatusBadge from "@/components/JobStatusBadge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  isActiveJob,
  jobKey,
  jobListKey,
  jobPollingInterval,
  jobPresentation,
} from "@/jobs"
import { cn } from "@/lib/utils"

const timestamp = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
})

function formatTimestamp(value: string | null | undefined) {
  return value ? timestamp.format(new Date(value)) : "—"
}

async function copyText(value: string) {
  if (navigator.clipboard) return navigator.clipboard.writeText(value)

  const textarea = document.createElement("textarea")
  textarea.value = value
  textarea.style.position = "fixed"
  textarea.style.opacity = "0"
  document.body.append(textarea)
  textarea.select()
  document.execCommand("copy")
  textarea.remove()
}

function JobUnavailable() {
  return (
    <main className="mx-auto max-w-xl px-6 py-24 text-center">
      <XCircle aria-hidden="true" className="mx-auto size-9 text-muted-foreground" />
      <h1 className="mt-5 font-heading text-3xl font-semibold">Job unavailable</h1>
      <p className="mt-3 leading-7 text-muted-foreground">
        This Job does not exist or is not available to your User.
      </p>
      <div className="mt-7 flex justify-center gap-3">
        <Link className={buttonVariants()} to="/jobs">
          My Jobs
        </Link>
        <Link className={buttonVariants({ variant: "outline" })} to="/tools/gromacs">
          GROMACS Tool
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
  const jobQuery = useQuery({
    queryKey: jobKey(jobId),
    queryFn: ({ signal }) => inspectJob(jobId, signal),
    enabled: Boolean(jobId),
    retry(failureCount, error) {
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) return false
      return failureCount < 1
    },
    refetchInterval(query) {
      return jobPollingInterval(query.state.data, document.visibilityState)
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
  })
  useExpireSession(jobQuery.error ?? cancelMutation.error)

  if (jobQuery.isPending) {
    return (
      <main className="grid min-h-[60svh] place-items-center px-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Loading Job…
        </div>
      </main>
    )
  }

  const queryError = jobQuery.error
  if (
    queryError instanceof ApiError &&
    (queryError.status === 403 || queryError.status === 404)
  ) {
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
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">GROMACS MD simulation</p>
              <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
                {job.display_name}
              </h1>
            </div>
            <JobStatusBadge state={job.state} />
          </div>

          {jobQuery.isError ? (
            <div className="mt-6 flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              Status could not be refreshed. Showing the last known state from {formatTimestamp(job.updated_at)}.
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
              <p className="max-w-2xl leading-7">{presentation.description}</p>
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
                    Cancel Job
                  </Button>
                ) : null}
                {canDownload ? (
                  <a
                    className={buttonVariants()}
                    href={`/api/v1/jobs/${encodeURIComponent(job.job_id)}/download`}
                  >
                    <Download aria-hidden="true" data-icon="inline-start" />
                    Download Result
                  </a>
                ) : null}
                {canStartAgain ? (
                  <Link className={buttonVariants()} to="/tools/gromacs/new">
                    <RotateCcw aria-hidden="true" data-icon="inline-start" />
                    Start a new simulation
                  </Link>
                ) : null}
              </div>
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
                    <dt className="text-muted-foreground">Last updated</dt>
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
                  {copied ? "Copied" : "Copy Job ID"}
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
            Cancel this Job?
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Cancellation is best effort. The simulation may complete before the remote work stops.
          </p>
          {cancelMutation.isError ? (
            <p aria-live="polite" className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Cancellation could not be requested. Try again.
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
              Request Cancellation
            </Button>
          </div>
        </div>
      </dialog>
    </>
  )
}
