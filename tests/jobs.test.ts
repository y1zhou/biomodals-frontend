import { describe, expect, test } from "bun:test"

import { ApiError, type Job } from "../src/api/client"
import {
  formatTimestamp,
  gromacsStageTimeline,
  isActiveJob,
  isJobNotCancellableError,
  isJobUnavailableError,
  jobFailureMessage,
  jobPollingInterval,
  jobPresentation,
  latestJob,
  newestJobsFirst,
  shouldRetryJobQuery,
} from "../src/jobs"

function job(jobId: string, state: Job["state"], createdAt: string): Job {
  return {
    job_id: jobId,
    workload: "gromacs",
    display_name: `Job ${jobId}`,
    state,
    created_at: createdAt,
    updated_at: createdAt,
  }
}

describe("Job lifecycle presentation", () => {
  test("formats missing timestamps consistently", () => {
    expect(formatTimestamp(null)).toBe("—")
    expect(formatTimestamp(0)).toBe("—")
  })

  test("classifies active and terminal states", () => {
    expect(isActiveJob("queued")).toBeTrue()
    expect(isActiveJob("cancel_requested")).toBeTrue()
    expect(isActiveJob("partial")).toBeFalse()
    expect(isActiveJob("cancelled")).toBeFalse()
  })

  test("uses the agreed active polling cadence", () => {
    const running = job("one", "running", "2026-07-17T00:00:00Z")
    const complete = job("two", "succeeded", "2026-07-17T00:00:00Z")

    expect(jobPollingInterval(running, "visible")).toBe(10_000)
    expect(jobPollingInterval(running, "hidden")).toBe(60_000)
    expect(jobPollingInterval(complete, "visible")).toBeFalse()
  })

  test("sorts the Job History newest first without mutating it", () => {
    const older = job("old", "failed", "2026-07-16T00:00:00Z")
    const newer = job("new", "running", "2026-07-17T00:00:00Z")
    const input = [older, newer]

    expect(newestJobsFirst(input).map((candidate) => candidate.job_id)).toEqual(["new", "old"])
    expect(input.map((candidate) => candidate.job_id)).toEqual(["old", "new"])
  })

  test("uses a fresher active-row response without hiding a newer collection value", () => {
    const collectionJob = job("one", "running", "2026-07-17T00:00:00Z")
    const detailJob = {
      ...collectionJob,
      state: "succeeded" as const,
      updated_at: "2026-07-17T00:01:00Z",
    }

    expect(latestJob(collectionJob, detailJob).state).toBe("succeeded")
    expect(latestJob(detailJob, collectionJob).state).toBe("succeeded")
  })

  test("prefers the detail snapshot when timestamps are equal", () => {
    const collectionJob = job("one", "running", "2026-07-17T00:00:00Z")
    const detailJob = { ...collectionJob, state: "succeeded" as const }

    expect(latestJob(collectionJob, detailJob).state).toBe("succeeded")
  })

  test("treats malformed and inaccessible Job IDs as unavailable", () => {
    expect(isJobUnavailableError(new ApiError(403))).toBeTrue()
    expect(isJobUnavailableError(new ApiError(404))).toBeTrue()
    expect(isJobUnavailableError(new ApiError(422))).toBeTrue()
    expect(isJobUnavailableError(new ApiError(500))).toBeFalse()
    expect(shouldRetryJobQuery(0, new ApiError(422))).toBeFalse()
    expect(shouldRetryJobQuery(0, new ApiError(401))).toBeFalse()
    expect(shouldRetryJobQuery(0, new ApiError(500))).toBeTrue()
    expect(shouldRetryJobQuery(1, new ApiError(500))).toBeFalse()
  })

  test("recognizes cancellation races by code", () => {
    expect(
      isJobNotCancellableError(
        new ApiError(409, { code: "job_not_cancellable", detail: "Already finalizing" })
      )
    ).toBeTrue()
    expect(isJobNotCancellableError(new ApiError(409, { detail: "Conflict" }))).toBeFalse()
  })

  test("only presents safe structured failure messages", () => {
    const failed = {
      ...job("one", "failed", "2026-07-17T00:00:00Z"),
      error_code: "compute_failed" as const,
      error_message: "Remote compute failed before producing a Result.",
    }
    const unknown = {
      ...failed,
      error_code: "provider_trace" as never,
      error_message: "secret traceback",
    }

    expect(jobFailureMessage(failed)).toBe(failed.error_message)
    expect(jobFailureMessage(unknown)).toBe("This simulation could not be completed.")
  })

  test("uses plain-language labels for API states", () => {
    expect(jobPresentation.finalizing.label).toBe("Preparing result")
    expect(jobPresentation.partial.label).toBe("Completed with warnings")
    expect(jobPresentation.succeeded.label).toBe("Completed")
  })

  test("shows completed, current, and upcoming GROMACS stages", () => {
    const running = {
      ...job("one", "running", "2026-07-17T00:00:00Z"),
      stage: {
        code: "npt_analysis" as const,
        function_name: "collect_traj_stats" as const,
      },
    }

    expect(gromacsStageTimeline(running).map((stage) => stage.state)).toEqual([
      "completed",
      "completed",
      "current",
      "upcoming",
      "upcoming",
      "upcoming",
    ])
    expect(gromacsStageTimeline(running)[0]?.label).toBe(
      "Prepare and equilibrate simulation"
    )
    expect(gromacsStageTimeline(running)[2]?.functionName).toBe(
      "collect_traj_stats"
    )

    expect(
      gromacsStageTimeline({
        ...running,
        state: "succeeded",
        stage: { code: "result_packaging" },
      }).every((stage) => stage.state === "completed")
    ).toBeTrue()
  })
})
