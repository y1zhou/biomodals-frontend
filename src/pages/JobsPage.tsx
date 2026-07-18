import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  BriefcaseBusiness,
  FlaskConical,
  LoaderCircle,
  Plus,
  RefreshCw,
} from "lucide-react"
import { useEffect, useState } from "react"
import { Link } from "react-router"

import { ApiError, inspectJob, listJobs, type Job } from "@/api/client"
import { useExpireSession } from "@/auth-state"
import JobStatusBadge from "@/components/JobStatusBadge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  filterAndSortJobs,
  formatTimestamp,
  isActiveJob,
  jobKey,
  jobListKey,
  jobPollingInterval,
  latestJob,
  jobPresentation,
  shouldRetryJobQuery,
  useDocumentVisibility,
  type JobTableColumn,
  type JobTableFilters,
  type JobTableSort,
} from "@/jobs"
import { cn } from "@/lib/utils"
import { gromacsPaths, gromacsTool, toolName, tools } from "@/tools"

function JobRow({
  job: initialJob,
  updatedAt,
  visibility,
}: {
  job: Job
  updatedAt: number
  visibility: DocumentVisibilityState
}) {
  const queryClient = useQueryClient()
  const jobQuery = useQuery({
    queryKey: jobKey(initialJob.job_id),
    queryFn: ({ signal }) => inspectJob(initialJob.job_id, signal),
    initialData: initialJob,
    initialDataUpdatedAt: updatedAt,
    enabled: isActiveJob(initialJob.state),
    retry: shouldRetryJobQuery,
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

  useEffect(() => {
    if (!jobQuery.data) return
    queryClient.setQueryData<Job[]>(jobListKey, (jobs) => {
      if (!jobs) return jobs
      let changed = false
      const updated = jobs.map((candidate) => {
        if (candidate.job_id !== jobQuery.data?.job_id) return candidate
        const latest = latestJob(candidate, jobQuery.data)
        changed ||= latest !== candidate
        return latest
      })
      return changed ? updated : jobs
    })
  }, [jobQuery.data, queryClient])

  return (
    <tr className="border-b last:border-0">
      <td className="px-4 py-4 align-top">
        <Link className="group inline-flex items-center gap-1 font-medium hover:underline" to={path}>
          {job.display_name}
          <ArrowRight aria-hidden="true" className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>
        <p className="mt-1 font-mono text-[0.7rem] text-muted-foreground">
          {job.job_id}
        </p>
      </td>
      <td className="px-4 py-4 align-top text-sm text-muted-foreground">
        {tool?.name ?? job.workload}
      </td>
      <td className="px-4 py-4 align-top">
        <JobStatusBadge state={job.state} />
        {jobQuery.isError ? (
          <p className="mt-1 text-xs text-amber-700">Refresh failed</p>
        ) : null}
      </td>
      <td className="px-4 py-4 align-top text-sm text-muted-foreground">
        {formatTimestamp(job.created_at)}
      </td>
      <td className="px-4 py-4 align-top text-sm text-muted-foreground">
        {formatTimestamp(job.updated_at)}
      </td>
    </tr>
  )
}

const emptyFilters: JobTableFilters = {
  job: "",
  tool: "",
  status: "",
  created: "",
  updated: "",
}

function SortableHeader({
  column,
  label,
  sort,
  onSort,
}: {
  column: JobTableColumn
  label: string
  sort: JobTableSort
  onSort: (column: JobTableColumn) => void
}) {
  const active = sort.column === column
  const Icon = !active
    ? ArrowUpDown
    : sort.direction === "ascending"
      ? ArrowUp
      : ArrowDown

  return (
    <th
      aria-sort={active ? sort.direction : "none"}
      className="px-4 py-3 font-medium"
      scope="col"
    >
      <button
        className="inline-flex items-center gap-1.5 hover:text-foreground"
        onClick={() => onSort(column)}
        type="button"
      >
        {label}
        <Icon aria-hidden="true" className="size-3.5" />
      </button>
    </th>
  )
}

export default function JobsPage() {
  const visibility = useDocumentVisibility()
  const [filters, setFilters] = useState<JobTableFilters>(emptyFilters)
  const [sort, setSort] = useState<JobTableSort>({
    column: "created",
    direction: "descending",
  })
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

  const jobs = filterAndSortJobs(jobsQuery.data, filters, sort, toolName)
  const filtersActive = Object.values(filters).some(Boolean)

  function updateFilter(column: JobTableColumn, value: string) {
    setFilters((current) => ({ ...current, [column]: value }))
  }

  function updateSort(column: JobTableColumn) {
    setSort((current) => ({
      column,
      direction:
        current.column === column && current.direction === "ascending"
          ? "descending"
          : "ascending",
    }))
  }

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
            Current and past remote computations across BioModals tools.
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
          <Link className={buttonVariants()} to="/">
            <Plus aria-hidden="true" data-icon="inline-start" />
            New job
          </Link>
        </div>
      </div>

      {jobsQuery.isError ? (
        <div className="mt-6 flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          My Jobs could not be refreshed. Showing the last loaded collection.
        </div>
      ) : null}

      {jobsQuery.data.length ? (
        <div className="mt-8 overflow-x-auto rounded-xl border bg-card shadow-sm">
          <table className="w-full min-w-[64rem] border-collapse text-left">
            <caption className="sr-only">Your BioModals jobs</caption>
            <thead className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <SortableHeader column="job" label="Job" onSort={updateSort} sort={sort} />
                <SortableHeader column="tool" label="Tool" onSort={updateSort} sort={sort} />
                <SortableHeader column="status" label="Status" onSort={updateSort} sort={sort} />
                <SortableHeader column="created" label="Created" onSort={updateSort} sort={sort} />
                <SortableHeader column="updated" label="Updated" onSort={updateSort} sort={sort} />
              </tr>
              <tr className="border-t bg-card normal-case tracking-normal">
                <th className="px-4 pb-3" scope="col">
                  <Input
                    aria-label="Filter jobs by name or ID"
                    onChange={(event) => updateFilter("job", event.target.value)}
                    placeholder="Filter jobs"
                    type="search"
                    value={filters.job}
                  />
                </th>
                <th className="px-4 pb-3" scope="col">
                  <select
                    aria-label="Filter jobs by tool"
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm text-foreground"
                    onChange={(event) => updateFilter("tool", event.target.value)}
                    value={filters.tool}
                  >
                    <option value="">All tools</option>
                    {tools.map((tool) => (
                      <option key={tool.slug} value={tool.slug}>{tool.name}</option>
                    ))}
                  </select>
                </th>
                <th className="px-4 pb-3" scope="col">
                  <select
                    aria-label="Filter jobs by status"
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm text-foreground"
                    onChange={(event) => updateFilter("status", event.target.value)}
                    value={filters.status}
                  >
                    <option value="">All statuses</option>
                    {Object.entries(jobPresentation).map(([state, presentation]) => (
                      <option key={state} value={state}>{presentation.label}</option>
                    ))}
                  </select>
                </th>
                <th className="px-4 pb-3" scope="col">
                  <Input
                    aria-label="Filter jobs by creation date"
                    onChange={(event) => updateFilter("created", event.target.value)}
                    type="date"
                    value={filters.created}
                  />
                </th>
                <th className="px-4 pb-3" scope="col">
                  <Input
                    aria-label="Filter jobs by update date"
                    onChange={(event) => updateFilter("updated", event.target.value)}
                    type="date"
                    value={filters.updated}
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {jobs.length ? (
                jobs.map((job) => (
                  <JobRow
                    job={job}
                    key={job.job_id}
                    updatedAt={jobsQuery.dataUpdatedAt}
                    visibility={visibility}
                  />
                ))
              ) : (
                <tr>
                  <td className="px-4 py-10 text-center text-sm text-muted-foreground" colSpan={5}>
                    No jobs match these filters.
                    {filtersActive ? (
                      <Button
                        className="ml-3"
                        onClick={() => setFilters(emptyFilters)}
                        size="sm"
                        variant="outline"
                      >
                        Clear filters
                      </Button>
                    ) : null}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-8 rounded-xl border border-dashed px-6 py-16 text-center">
          <FlaskConical aria-hidden="true" className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-5 font-heading text-lg font-semibold">No jobs yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Start a new job and it will remain recoverable here.
          </p>
          <Link className={cn(buttonVariants(), "mt-6")} to="/">
            Start a new job
          </Link>
        </div>
      )}
    </main>
  )
}
