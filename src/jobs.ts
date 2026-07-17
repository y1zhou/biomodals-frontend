import type { Job, JobState } from "@/api/client"

export const jobListKey = ["jobs"] as const
export const jobKey = (jobId: string) => ["jobs", jobId] as const

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

export function latestJob(left: Job, right: Job | undefined) {
  if (!right) return left
  return Date.parse(right.updated_at) > Date.parse(left.updated_at) ? right : left
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
