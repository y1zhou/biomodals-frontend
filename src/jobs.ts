import { useEffect, useState } from "react"

import {
  ApiError,
  apiErrorCode,
  type Job,
  type JobStage,
  type JobState,
} from "@/api/client"

export const jobListKey = ["jobs"] as const
export const jobKey = (jobId: string) => ["jobs", jobId] as const

const timestamp = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
})

export function formatTimestamp(value: string | number | null | undefined) {
  return value ? timestamp.format(new Date(value)) : "—"
}

export function useDocumentVisibility() {
  const [visibility, setVisibility] = useState<DocumentVisibilityState>(
    () => document.visibilityState
  )

  useEffect(() => {
    const update = () => setVisibility(document.visibilityState)
    document.addEventListener("visibilitychange", update)
    return () => document.removeEventListener("visibilitychange", update)
  }, [])

  return visibility
}

export const activeJobStates = new Set<JobState>([
  "queued",
  "running",
  "finalizing",
  "cancel_requested",
])

export function isActiveJob(state: JobState) {
  return activeJobStates.has(state)
}

export function isPollableJob(state: JobState) {
  return isActiveJob(state) || state === "blocked"
}

export function jobPollingInterval(job: Job | undefined, visibility: DocumentVisibilityState) {
  if (!job || !isPollableJob(job.state)) return false
  return visibility === "hidden" ? 60_000 : 10_000
}

export function newestJobsFirst(jobs: readonly Job[]) {
  return [...jobs].sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))
}

export function latestJob(collectionJob: Job, detailJob: Job | undefined) {
  if (!detailJob) return collectionJob
  return Date.parse(detailJob.updated_at) >= Date.parse(collectionJob.updated_at)
    ? detailJob
    : collectionJob
}

export function isJobUnavailableError(error: unknown) {
  return error instanceof ApiError && [403, 404, 422].includes(error.status)
}

export function shouldRetryJobQuery(failureCount: number, error: unknown) {
  if (isJobUnavailableError(error)) return false
  if (error instanceof ApiError && error.status === 401) return false
  return failureCount < 1
}

export function isJobNotCancellableError(error: unknown) {
  return apiErrorCode(error) === "job_not_cancellable"
}

const jobErrorCodes = new Set(["compute_failed", "result_invalid"])

export function jobFailureMessage(job: Job) {
  if (
    job.state === "failed" &&
    typeof job.error_code === "string" &&
    jobErrorCodes.has(job.error_code) &&
    typeof job.error_message === "string" &&
    job.error_message.trim()
  ) {
    return job.error_message
  }
  return "This simulation could not be completed."
}

const gromacsStageDefinitions: readonly {
  code: JobStage["code"]
  label: string
}[] = [
  { code: "prepare_simulation", label: "Prepare simulation" },
  { code: "analyze_nvt", label: "Analyze NVT" },
  { code: "analyze_npt", label: "Analyze NPT" },
  { code: "run_production", label: "Run production" },
  { code: "analyze_production", label: "Analyze production" },
  { code: "prepare_result", label: "Prepare result" },
]

export function gromacsStageTimeline(job: Job) {
  const currentIndex = gromacsStageDefinitions.findIndex(
    ({ code }) => code === job.stage?.code
  )
  const stageHistory = new Map(
    (job.stage_history ?? []).map((stage) => [stage.code, stage])
  )

  return gromacsStageDefinitions.map((stage, index) => {
    const timing = stageHistory.get(stage.code)
    return {
      ...stage,
      functionName:
        timing?.function_name ??
        (index === currentIndex ? (job.stage?.function_name ?? null) : null),
      startedAt: timing?.started_at ?? null,
      endedAt: timing?.ended_at ?? null,
      outcome: timing?.outcome ?? null,
      state:
        timing?.outcome === "completed"
          ? ("completed" as const)
          : timing?.outcome === "failed"
            ? ("failed" as const)
            : timing?.outcome === "cancelled"
              ? ("cancelled" as const)
          : index === currentIndex
            ? ("current" as const)
            : ("upcoming" as const),
    }
  })
}

export const jobPresentation: Record<
  JobState,
  { label: string; description: string; className: string }
> = {
  queued: {
    label: "Queued",
    description: "This job was accepted and is waiting to start.",
    className: "border-slate-300 bg-slate-100 text-slate-800",
  },
  running: {
    label: "Running",
    description: "The molecular dynamics simulation is running remotely.",
    className: "border-blue-300 bg-blue-50 text-blue-800",
  },
  finalizing: {
    label: "Preparing result",
    description: "The simulation finished and BioModals is preparing the result archive.",
    className: "border-blue-300 bg-blue-50 text-blue-800",
  },
  cancel_requested: {
    label: "Cancellation requested",
    description: "BioModals asked the remote work to stop. The simulation may still complete first.",
    className: "border-amber-300 bg-amber-50 text-amber-900",
  },
  blocked: {
    label: "Result temporarily unavailable",
    description: "The simulation output is preserved while BioModals retries result preparation. An administrator may need to repair the service.",
    className: "border-amber-300 bg-amber-50 text-amber-900",
  },
  succeeded: {
    label: "Completed",
    description: "The complete result is ready to download.",
    className: "border-emerald-300 bg-emerald-50 text-emerald-800",
  },
  partial: {
    label: "Completed with warnings",
    description: "A useful partial result is ready. Review the warnings before using it.",
    className: "border-amber-300 bg-amber-50 text-amber-900",
  },
  failed: {
    label: "Failed",
    description: "This simulation could not be completed.",
    className: "border-red-300 bg-red-50 text-red-800",
  },
  cancelled: {
    label: "Cancelled",
    description: "The remote work stopped before producing a result.",
    className: "border-slate-300 bg-slate-100 text-slate-800",
  },
}

export type JobTableColumn = "job" | "tool" | "status" | "created" | "updated"
export type JobTableFilters = Record<JobTableColumn, string>
export interface JobTableSort {
  column: JobTableColumn
  direction: "ascending" | "descending"
}

export const defaultJobTableSort: JobTableSort = {
  column: "created",
  direction: "descending",
}

export const emptyJobTableFilters: JobTableFilters = {
  job: "",
  tool: "",
  status: "",
  created: "",
  updated: "",
}

const jobTableColumns = new Set<JobTableColumn>([
  "job",
  "tool",
  "status",
  "created",
  "updated",
])
const jobStates = new Set<JobState>([
  "queued",
  "running",
  "finalizing",
  "cancel_requested",
  "blocked",
  "succeeded",
  "partial",
  "failed",
  "cancelled",
])

function validDateFilter(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return ""
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value
    ? ""
    : value
}

export function jobTableViewFromSearchParams(
  searchParams: URLSearchParams,
  workloads: readonly string[]
) {
  const workloadSet = new Set(workloads)
  const rawColumn = searchParams.get("sort")
  const rawDirection = searchParams.get("direction")
  const column = jobTableColumns.has(rawColumn as JobTableColumn)
    ? (rawColumn as JobTableColumn)
    : defaultJobTableSort.column
  const direction = rawDirection === "ascending" || rawDirection === "descending"
    ? rawDirection
    : defaultJobTableSort.direction
  const tool = searchParams.get("tool") ?? ""
  const status = searchParams.get("status") ?? ""
  const filters: JobTableFilters = {
    job: (searchParams.get("job") ?? "").trim(),
    tool: workloadSet.has(tool) ? tool : "",
    status: jobStates.has(status as JobState) ? status : "",
    created: validDateFilter(searchParams.get("created")),
    updated: validDateFilter(searchParams.get("updated")),
  }
  const sort = { column, direction } satisfies JobTableSort
  return {
    filters,
    sort,
    normalized: jobTableSearchParams(filters, sort),
  }
}

export function jobTableSearchParams(
  filters: JobTableFilters,
  sort: JobTableSort
) {
  const params = new URLSearchParams()
  for (const column of ["job", "tool", "status", "created", "updated"] as const) {
    const value = filters[column].trim()
    if (value) params.set(column, value)
  }
  if (
    sort.column !== defaultJobTableSort.column ||
    sort.direction !== defaultJobTableSort.direction
  ) {
    params.set("sort", sort.column)
    params.set("direction", sort.direction)
  }
  return params
}

function jobSortValue(
  job: Job,
  column: JobTableColumn,
  toolName: (workload: string) => string
) {
  switch (column) {
    case "job":
      return job.display_name
    case "tool":
      return toolName(job.workload)
    case "status":
      return jobPresentation[job.state].label
    case "created":
      return job.created_at
    case "updated":
      return job.updated_at
  }
}

function localDate(value: string) {
  const date = new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function filterAndSortJobs(
  jobs: readonly Job[],
  filters: JobTableFilters,
  sort: JobTableSort,
  toolName: (workload: string) => string
) {
  const normalized = Object.fromEntries(
    Object.entries(filters).map(([column, value]) => [
      column,
      value.trim().toLocaleLowerCase(),
    ])
  ) as JobTableFilters
  const visible = jobs.filter((job) => {
    if (
      normalized.job &&
      !`${job.display_name} ${job.job_id}`.toLocaleLowerCase().includes(normalized.job)
    ) {
      return false
    }
    if (
      normalized.tool &&
      !`${toolName(job.workload)} ${job.workload}`
        .toLocaleLowerCase()
        .includes(normalized.tool)
    ) {
      return false
    }
    if (normalized.status && job.state !== normalized.status) return false
    if (normalized.created && localDate(job.created_at) !== normalized.created) return false
    if (normalized.updated && localDate(job.updated_at) !== normalized.updated) return false
    return true
  })
  const direction = sort.direction === "ascending" ? 1 : -1
  return visible.sort((left, right) => {
    const comparison = jobSortValue(left, sort.column, toolName).localeCompare(
      jobSortValue(right, sort.column, toolName),
      undefined,
      { numeric: true, sensitivity: "base" }
    )
    return direction * (comparison || left.job_id.localeCompare(right.job_id))
  })
}
