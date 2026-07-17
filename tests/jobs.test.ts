import { describe, expect, test } from "bun:test"

import type { Job } from "../src/api/client"
import {
  isActiveJob,
  jobPollingInterval,
  jobPresentation,
  latestJob,
  newestJobsFirst,
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

  test("uses plain-language labels for API states", () => {
    expect(jobPresentation.finalizing.label).toBe("Preparing result")
    expect(jobPresentation.partial.label).toBe("Completed with warnings")
    expect(jobPresentation.succeeded.label).toBe("Completed")
  })
})
