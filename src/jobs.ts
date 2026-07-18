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

export function jobPollingInterval(job: Job | undefined, visibility: DocumentVisibilityState) {
  if (!job || !isActiveJob(job.state)) return false
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

const jobErrorCodes = new Set(["compute_failed", "result_invalid", "result_unavailable"])

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
  { code: "preparation", label: "Prepare simulation" },
  { code: "nvt_analysis", label: "Analyze NVT equilibration" },
  { code: "npt_analysis", label: "Analyze NPT equilibration" },
  { code: "production", label: "Run production simulation" },
  { code: "production_analysis", label: "Analyze production trajectory" },
  { code: "result_packaging", label: "Prepare Result archive" },
]

export function gromacsStageTimeline(job: Job) {
  const currentIndex = gromacsStageDefinitions.findIndex(
    ({ code }) => code === job.stage?.code
  )
  const completed = job.state === "succeeded" || job.state === "partial"

  return gromacsStageDefinitions.map((stage, index) => ({
    ...stage,
    functionName:
      index === currentIndex ? (job.stage?.function_name ?? null) : null,
    state:
      completed || (currentIndex >= 0 && index < currentIndex)
        ? ("completed" as const)
        : index === currentIndex
          ? ("current" as const)
          : ("upcoming" as const),
  }))
}

export const jobPresentation: Record<
  JobState,
  { label: string; description: string; className: string }
> = {
  queued: {
    label: "Queued",
    description: "This simulation is waiting for remote capacity.",
    className: "border-slate-300 bg-slate-100 text-slate-800",
  },
  running: {
    label: "Running",
    description: "The molecular dynamics simulation is running remotely.",
    className: "border-blue-300 bg-blue-50 text-blue-800",
  },
  finalizing: {
    label: "Preparing result",
    description: "The simulation finished and BioModals is preparing the Result archive.",
    className: "border-blue-300 bg-blue-50 text-blue-800",
  },
  cancel_requested: {
    label: "Cancellation requested",
    description: "BioModals asked the remote work to stop. The simulation may still complete first.",
    className: "border-amber-300 bg-amber-50 text-amber-900",
  },
  succeeded: {
    label: "Completed",
    description: "The complete Result is ready to download.",
    className: "border-emerald-300 bg-emerald-50 text-emerald-800",
  },
  partial: {
    label: "Completed with warnings",
    description: "A useful partial Result is ready. Review the warnings before using it.",
    className: "border-amber-300 bg-amber-50 text-amber-900",
  },
  failed: {
    label: "Failed",
    description: "This simulation could not be completed.",
    className: "border-red-300 bg-red-50 text-red-800",
  },
  cancelled: {
    label: "Cancelled",
    description: "The remote work stopped before producing a Result.",
    className: "border-slate-300 bg-slate-100 text-slate-800",
  },
}
