import { useQuery } from "@tanstack/react-query"
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  FlaskConical,
  LoaderCircle,
  Plus,
  RefreshCw,
} from "lucide-react"
import { Link } from "react-router"

import { ApiError, inspectJob, listJobs, type Job } from "@/api/client"
import { useExpireSession } from "@/auth-state"
import JobStatusBadge from "@/components/JobStatusBadge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  formatTimestamp,
  isActiveJob,
  jobKey,
  jobListKey,
  jobPollingInterval,
  latestJob,
  newestJobsFirst,
  useDocumentVisibility,
} from "@/jobs"
import { cn } from "@/lib/utils"
import { gromacsPaths, gromacsTool, tools } from "@/tools"

function JobRow({
  job: initialJob,
  updatedAt,
  visibility,
}: {
  job: Job
  updatedAt: number
  visibility: DocumentVisibilityState
}) {
  const jobQuery = useQuery({
    queryKey: jobKey(initialJob.job_id),
    queryFn: ({ signal }) => inspectJob(initialJob.job_id, signal),
    initialData: initialJob,
    initialDataUpdatedAt: updatedAt,
    enabled: isActiveJob(initialJob.state),
    retry(failureCount, error) {
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) return false
      return failureCount < 1
    },
    refetchInterval(query) {
      return jobPollingInterval(query.state.data, visibility)
    },
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
  })
  useExpireSession(jobQuery.error)
  const job = latestJob(initialJob, jobQuery.data)
  const tool = tools.find((candidate) => candidate.slug === job.workload)
  const path = tool?.slug === gromacsTool.slug ? gromacsPaths.job(job.job_id) : "/jobs"

  return (
    <tr className="border-b last:border-0">
      <td className="px-4 py-4 align-top">
        <Link className="group inline-flex items-center gap-1 font-medium hover:underline" to={path}>
          {job.display_name}
          <ArrowRight aria-hidden="true" className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>
        <p className="mt-1 font-mono text-[0.7rem] text-muted-foreground sm:hidden">
          {job.job_id}
        </p>
      </td>
      <td className="hidden px-4 py-4 align-top text-sm text-muted-foreground sm:table-cell">
        {tool?.name ?? job.workload}
      </td>
      <td className="px-4 py-4 align-top">
        <JobStatusBadge state={job.state} />
        {jobQuery.isError ? (
          <p className="mt-1 text-xs text-amber-700">Refresh failed</p>
        ) : null}
      </td>
      <td className="hidden px-4 py-4 align-top text-sm text-muted-foreground md:table-cell">
        {formatTimestamp(job.created_at)}
      </td>
      <td className="hidden px-4 py-4 align-top text-sm text-muted-foreground lg:table-cell">
        {formatTimestamp(job.updated_at)}
      </td>
    </tr>
  )
}

export default function JobsPage() {
  const visibility = useDocumentVisibility()
  const jobsQuery = useQuery({
    queryKey: jobListKey,
    queryFn: ({ signal }) => listJobs(signal),
    refetchInterval: false,
    refetchOnWindowFocus: true,
    retry(failureCount, error) {
      if (error instanceof ApiError && error.status === 401) return false
      return failureCount < 1
    },
  })
  useExpireSession(jobsQuery.error)

  if (jobsQuery.isPending) {
    return (
      <main className="grid min-h-[60svh] place-items-center px-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Loading My Jobs…
        </div>
      </main>
    )
  }

  if (!jobsQuery.data) {
    return (
      <main className="mx-auto max-w-xl px-6 py-24 text-center">
        <AlertTriangle aria-hidden="true" className="mx-auto size-9 text-destructive" />
        <h1 className="mt-5 font-heading text-3xl font-semibold">My Jobs could not be loaded</h1>
        <p className="mt-3 leading-7 text-muted-foreground">
          Check the connection and try again.
        </p>
        <Button className="mt-7" onClick={() => void jobsQuery.refetch()}>
          <RefreshCw aria-hidden="true" />
          Try again
        </Button>
      </main>
    )
  }

  const jobs = newestJobsFirst(jobsQuery.data)

  return (
    <main className="mx-auto max-w-6xl px-6 py-10 lg:px-8 lg:py-14">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-lg bg-muted">
              <BriefcaseBusiness aria-hidden="true" className="size-5" />
            </span>
            <h1 className="font-heading text-3xl font-semibold tracking-tight">My Jobs</h1>
          </div>
          <p className="mt-3 text-muted-foreground">
            Current and past remote computations across BioModals Tools.
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            disabled={jobsQuery.isFetching}
            onClick={() => void jobsQuery.refetch()}
            variant="outline"
          >
            <RefreshCw aria-hidden="true" className={cn(jobsQuery.isFetching && "animate-spin")} />
            Refresh
          </Button>
          <Link className={buttonVariants()} to={gromacsPaths.submission}>
            <Plus aria-hidden="true" data-icon="inline-start" />
            New simulation
          </Link>
        </div>
      </div>

      {jobsQuery.isError ? (
        <div className="mt-6 flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          My Jobs could not be refreshed. Showing the last loaded collection.
        </div>
      ) : null}

      {jobs.length ? (
        <div className="mt-8 overflow-x-auto rounded-xl border bg-card shadow-sm">
          <table className="w-full min-w-[38rem] border-collapse text-left">
            <caption className="sr-only">Your BioModals Jobs, newest first</caption>
            <thead className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium" scope="col">Job</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell" scope="col">Tool</th>
                <th className="px-4 py-3 font-medium" scope="col">Status</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell" scope="col">Created</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell" scope="col">Updated</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <JobRow
                  job={job}
                  key={job.job_id}
                  updatedAt={jobsQuery.dataUpdatedAt}
                  visibility={visibility}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-8 rounded-xl border border-dashed px-6 py-16 text-center">
          <FlaskConical aria-hidden="true" className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-5 font-heading text-lg font-semibold">No Jobs yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Start a GROMACS simulation and it will remain recoverable here.
          </p>
          <Link className={cn(buttonVariants(), "mt-6")} to={gromacsPaths.submission}>
            Start a simulation
          </Link>
        </div>
      )}
    </main>
  )
}
