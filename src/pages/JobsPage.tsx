import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Popover } from "@base-ui/react/popover"
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  BriefcaseBusiness,
  FlaskConical,
  ListFilter,
  LoaderCircle,
  Plus,
} from "lucide-react"
import { useEffect, type ReactNode } from "react"
import { Link, useSearchParams } from "react-router"

import { ApiError, apiRequestId, inspectJob, listJobs, type Job } from "@/api/client"
import { useExpireSession } from "@/auth-state"
import JobStatusBadge from "@/components/JobStatusBadge"
import { RefreshButton } from "@/components/RefreshButton"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SelectField } from "@/components/ui/select-field"
import {
  filterAndSortJobs,
  emptyJobTableFilters,
  formatTimestamp,
  isPollableJob,
  jobKey,
  jobListKey,
  jobPollingInterval,
  latestJob,
  jobPresentation,
  jobTableSearchParams,
  jobTableViewFromSearchParams,
  shouldRetryJobQuery,
  useDocumentVisibility,
  type JobTableColumn,
  type JobTableSort,
} from "@/jobs"
import { cn } from "@/lib/utils"
import { availableTools, gromacsPaths, gromacsTool, toolName } from "@/tools"

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
    enabled: isPollableJob(initialJob.state),
    retry: shouldRetryJobQuery,
    refetchInterval(query) {
      return jobPollingInterval(query.state.data, visibility)
    },
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
  })
  useExpireSession(jobQuery.error)
  const job = latestJob(initialJob, jobQuery.data)
  const tool = availableTools.find((candidate) => candidate.slug === job.workload)
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
          <p className="mt-1 text-xs text-amber-700" role="alert">
            Refresh failed{apiRequestId(jobQuery.error) ? ` · Support ID ${apiRequestId(jobQuery.error)}` : ""}
          </p>
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

const toolFilterOptions = [
  { label: "All tools", value: "" },
  ...availableTools.map((tool) => ({ label: tool.name, value: tool.slug })),
]

const statusFilterOptions = [
  { label: "All statuses", value: "" },
  ...Object.entries(jobPresentation).map(([value, presentation]) => ({
    label: presentation.label,
    value,
  })),
]

function SortableHeader({
  children,
  column,
  filterActive,
  filterLabel,
  label,
  onSort,
  sort,
}: {
  children: ReactNode
  column: JobTableColumn
  filterActive: boolean
  filterLabel: string
  label: string
  onSort: (column: JobTableColumn) => void
  sort: JobTableSort
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
      <div className="flex items-center gap-1">
        <button
          className="inline-flex items-center gap-1.5 rounded-sm transition-all hover:text-foreground active:scale-[0.97] active:text-foreground active:brightness-90 motion-reduce:active:scale-100"
          onClick={() => onSort(column)}
          type="button"
        >
          {label}
          <Icon aria-hidden="true" className="size-3.5" />
        </button>
        <Popover.Root>
          <Popover.Trigger
            aria-label={`${filterLabel}${filterActive ? " (active)" : ""}`}
            className={cn(
              "grid size-6 place-items-center rounded-md outline-none transition-all hover:bg-background hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95 active:bg-background active:text-foreground active:brightness-90 motion-reduce:active:scale-100 data-[popup-open]:bg-background data-[popup-open]:text-foreground",
              filterActive && "bg-primary/10 text-primary"
            )}
            title={filterLabel}
            type="button"
          >
            <ListFilter aria-hidden="true" className="size-3.5" />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner align="start" className="z-50" sideOffset={6}>
              <Popover.Popup className="w-64 rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg outline-none data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
                <Popover.Title className="mb-2 text-sm font-medium normal-case tracking-normal">
                  {filterLabel}
                </Popover.Title>
                {children}
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      </div>
    </th>
  )
}

export default function JobsPage() {
  const visibility = useDocumentVisibility()
  const [searchParams, setSearchParams] = useSearchParams()
  const { filters, normalized, sort } = jobTableViewFromSearchParams(
    searchParams,
    availableTools.map((tool) => tool.slug)
  )
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

  useEffect(() => {
    if (searchParams.toString() === normalized.toString()) return
    setSearchParams(normalized, { replace: true, preventScrollReset: true })
  }, [normalized, searchParams, setSearchParams])

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
          {apiRequestId(jobsQuery.error) ? ` Support ID: ${apiRequestId(jobsQuery.error)}.` : ""}
        </p>
        <RefreshButton
          className="mt-7"
          idleLabel="Try again"
          onRefresh={async () => {
            const result = await jobsQuery.refetch()
            if (result.isError) throw result.error
          }}
          variant="default"
        />
      </main>
    )
  }

  const jobs = filterAndSortJobs(jobsQuery.data, filters, sort, toolName)
  const filtersActive = Object.values(filters).some(Boolean)

  function updateFilter(column: JobTableColumn, value: string) {
    setSearchParams(
      jobTableSearchParams({ ...filters, [column]: value }, sort),
      { replace: true, preventScrollReset: true }
    )
  }

  function updateSort(column: JobTableColumn) {
    const nextSort: JobTableSort = {
      column,
      direction:
        sort.column === column && sort.direction === "ascending"
          ? "descending"
          : "ascending",
    }
    setSearchParams(jobTableSearchParams(filters, nextSort), {
      replace: true,
      preventScrollReset: true,
    })
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
          <RefreshButton
            disabled={jobsQuery.isFetching}
            onRefresh={async () => {
              const result = await jobsQuery.refetch()
              if (result.isError) throw result.error
            }}
          />
          <Link className={buttonVariants()} to="/">
            <Plus aria-hidden="true" data-icon="inline-start" />
            New job
          </Link>
        </div>
      </div>

      {jobsQuery.isError ? (
        <div
          className="mt-6 flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
          role="alert"
        >
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          My Jobs could not be refreshed. Showing the last loaded collection.
          {apiRequestId(jobsQuery.error) ? ` Support ID: ${apiRequestId(jobsQuery.error)}.` : ""}
        </div>
      ) : null}

      {jobsQuery.data.length ? (
        <div className="mt-8 overflow-x-auto rounded-xl border bg-card shadow-sm">
          <table className="w-full min-w-[64rem] border-collapse text-left">
            <caption className="sr-only">Your BioModals jobs</caption>
            <thead className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <SortableHeader
                  column="job"
                  filterActive={Boolean(filters.job)}
                  filterLabel="Filter jobs by name or ID"
                  label="Job"
                  onSort={updateSort}
                  sort={sort}
                >
                  <Input
                    aria-label="Filter jobs by name or ID"
                    onChange={(event) => updateFilter("job", event.target.value)}
                    placeholder="Filter jobs"
                    type="search"
                    value={filters.job}
                  />
                </SortableHeader>
                <SortableHeader
                  column="tool"
                  filterActive={Boolean(filters.tool)}
                  filterLabel="Filter jobs by tool"
                  label="Tool"
                  onSort={updateSort}
                  sort={sort}
                >
                  <SelectField
                    aria-label="Filter jobs by tool"
                    onValueChange={(value) => updateFilter("tool", value)}
                    options={toolFilterOptions}
                    value={filters.tool}
                  />
                </SortableHeader>
                <SortableHeader
                  column="status"
                  filterActive={Boolean(filters.status)}
                  filterLabel="Filter jobs by status"
                  label="Status"
                  onSort={updateSort}
                  sort={sort}
                >
                  <SelectField
                    aria-label="Filter jobs by status"
                    onValueChange={(value) => updateFilter("status", value)}
                    options={statusFilterOptions}
                    value={filters.status}
                  />
                </SortableHeader>
                <SortableHeader
                  column="created"
                  filterActive={Boolean(filters.created)}
                  filterLabel="Filter jobs by creation date"
                  label="Created"
                  onSort={updateSort}
                  sort={sort}
                >
                  <Input
                    aria-label="Filter jobs by creation date"
                    onChange={(event) => updateFilter("created", event.target.value)}
                    type="date"
                    value={filters.created}
                  />
                </SortableHeader>
                <SortableHeader
                  column="updated"
                  filterActive={Boolean(filters.updated)}
                  filterLabel="Filter jobs by update date"
                  label="Updated"
                  onSort={updateSort}
                  sort={sort}
                >
                  <Input
                    aria-label="Filter jobs by update date"
                    onChange={(event) => updateFilter("updated", event.target.value)}
                    type="date"
                    value={filters.updated}
                  />
                </SortableHeader>
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
                        onClick={() =>
                          setSearchParams(
                            jobTableSearchParams(emptyJobTableFilters, sort),
                            { replace: true, preventScrollReset: true }
                          )
                        }
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
