import { describe, expect, test } from "bun:test"

import { ApiError, type Job } from "../src/api/client"
import {
  formatTimestamp,
  formatRelativeTimestamp,
  filterAndSortJobs,
  jobStageTimeline,
  isActiveJob,
  isProgressingJob,
  isPollableJob,
  isJobNotCancellableError,
  isJobUnavailableError,
  jobTableSearchParams,
  jobTableViewFromSearchParams,
  jobFailureMessage,
  jobPollingInterval,
  jobPresentation,
  latestJob,
  newestJobsFirst,
  shouldRetryJobQuery,
  visibilityPollingInterval,
} from "../src/jobs"

function job(jobId: string, state: Job["state"], createdAt: string): Job {
  return {
    job_id: jobId,
    tool: "gromacs",
    display_name: `Job ${jobId}`,
    can_view_logs: false,
    can_retry_result_preparation: false,
    state,
    stages: [],
    created_at: createdAt,
    updated_at: createdAt,
  }
}

describe("Job lifecycle presentation", () => {
  test("formats missing timestamps consistently", () => {
    expect(formatTimestamp(null)).toBe("—")
    expect(formatTimestamp(0)).toBe("—")
  })

  test("formats recent checks relative to a fixed current time", () => {
    const now = Date.parse("2026-07-21T12:00:20Z")

    expect(formatRelativeTimestamp("2026-07-21T12:00:00Z", now)).toBe("20s ago")
    expect(formatRelativeTimestamp("2026-07-21T11:58:00Z", now)).toBe("2m ago")
    expect(formatRelativeTimestamp("2026-07-21T10:00:00Z", now)).toBe("2h ago")
  })

  test("classifies active and terminal states", () => {
    expect(isActiveJob("queued")).toBeTrue()
    expect(isActiveJob("cancel_requested")).toBeTrue()
    expect(isActiveJob("state_unknown")).toBeTrue()
    expect(isActiveJob("partial")).toBeFalse()
    expect(isActiveJob("cancelled")).toBeFalse()
    expect(isProgressingJob("state_unknown")).toBeFalse()
    expect(isPollableJob("state_unknown")).toBeFalse()
    expect(isPollableJob("blocked")).toBeTrue()
  })

  test("uses the agreed foreground and background polling cadence", () => {
    const running = job("one", "running", "2026-07-17T00:00:00Z")
    const complete = job("two", "succeeded", "2026-07-17T00:00:00Z")
    const blocked = job("three", "blocked", "2026-07-17T00:00:00Z")

    expect(visibilityPollingInterval("visible")).toBe(60_000)
    expect(visibilityPollingInterval("hidden")).toBe(300_000)
    expect(jobPollingInterval(running, "visible")).toBe(60_000)
    expect(jobPollingInterval(running, "hidden")).toBe(300_000)
    expect(jobPollingInterval(blocked, "visible")).toBe(60_000)
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

  test("does not hide terminal collection state behind an equal active detail", () => {
    const detailJob = job("one", "running", "2026-07-17T00:00:00Z")
    const collectionJob = { ...detailJob, state: "succeeded" as const }

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
    expect(jobFailureMessage(failed)).toBe(failed.error_message)
  })

  test("uses plain-language labels for API states", () => {
    expect(jobPresentation.finalizing.label).toBe("Preparing result")
    expect(jobPresentation.partial.label).toBe("Completed with warnings")
    expect(jobPresentation.succeeded.label).toBe("Completed")
    expect(jobPresentation.blocked.label).toBe("Result temporarily unavailable")
    expect(jobPresentation.state_unknown.label).toBe("Status unknown")
  })

  test("shows completed, parallel active, and upcoming GROMACS stages", () => {
    const running = {
      ...job("one", "running", "2026-07-17T00:00:00Z"),
      stages: [
        {
          code: "prepare_simulation",
          label: "Prepare simulation",
          started_at: "2026-07-17T00:00:00Z",
          ended_at: "2026-07-17T00:02:00Z",
          outcome: "completed" as const,
        },
        {
          code: "analyze_nvt",
          label: "Analyze NVT",
          started_at: "2026-07-17T00:02:00Z",
        },
        {
          code: "analyze_npt",
          label: "Analyze NPT",
          started_at: "2026-07-17T00:02:00Z",
        },
        {
          code: "run_production",
          label: "Run production",
          started_at: "2026-07-17T00:02:00Z",
        },
        { code: "analyze_production", label: "Analyze production" },
        { code: "prepare_result", label: "Prepare result" },
      ],
    }

    expect(jobStageTimeline(running).map((stage) => stage.state)).toEqual([
      "completed",
      "active",
      "active",
      "active",
      "upcoming",
      "upcoming",
    ])
    expect(jobStageTimeline(running)[0]?.label).toBe(
      "Prepare simulation"
    )
    expect(jobStageTimeline(running)[0]).toMatchObject({
      startedAt: "2026-07-17T00:00:00Z",
      endedAt: "2026-07-17T00:02:00Z",
    })
    expect(jobStageTimeline(running)[3]).toMatchObject({
      startedAt: "2026-07-17T00:02:00Z",
      endedAt: null,
    })
  })

  test("distinguishes provider calls waiting for a Modal container", () => {
    const running = {
      ...job("queued-provider", "running", "2026-07-17T00:00:00Z"),
      stages: [
        {
          code: "prepare_environment",
          label: "Prepare environment",
          provider_state: "queued" as const,
          started_at: "2026-07-17T00:00:00Z",
        },
      ],
    }

    expect(jobStageTimeline(running)[0]?.state).toBe("queued")
  })

  test("filters and sorts every Job History column without mutating jobs", () => {
    const older = {
      ...job("older", "running", "2026-07-16T00:00:00Z"),
      display_name: "Kinase trial",
      updated_at: "2026-07-17T04:00:00Z",
    }
    const newer = {
      ...job("newer", "succeeded", "2026-07-17T00:00:00Z"),
      display_name: "Receptor trial",
      updated_at: "2026-07-18T04:00:00Z",
    }
    const input = [older, newer]
    const toolName = () => "GROMACS MD simulation"

    expect(
      filterAndSortJobs(
        input,
        { job: "receptor", tool: "", status: "", created: "", updated: "" },
        { column: "job", direction: "ascending" },
        toolName
      ).map((candidate) => candidate.job_id)
    ).toEqual(["newer"])
    expect(
      filterAndSortJobs(
        input,
        { job: "", tool: "gromacs", status: "running", created: "2026-07-16", updated: "2026-07-17" },
        { column: "updated", direction: "descending" },
        toolName
      ).map((candidate) => candidate.job_id)
    ).toEqual(["older"])
    expect(
      filterAndSortJobs(
        input,
        { job: "", tool: "", status: "", created: "", updated: "" },
        { column: "job", direction: "ascending" },
        toolName
      ).map((candidate) => candidate.job_id)
    ).toEqual(["older", "newer"])
    expect(input.map((candidate) => candidate.job_id)).toEqual(["older", "newer"])
  })

  test("round-trips non-default table state and normalizes malformed parameters", () => {
    const view = jobTableViewFromSearchParams(
      new URLSearchParams(
        "job=kinase&tool=gromacs&status=blocked&created=2026-07-17&sort=updated&direction=ascending&unknown=x"
      ),
      ["gromacs"]
    )

    expect(view.filters).toEqual({
      job: "kinase",
      tool: "gromacs",
      status: "blocked",
      created: "2026-07-17",
      updated: "",
    })
    expect(view.sort).toEqual({ column: "updated", direction: "ascending" })
    expect(view.normalized.toString()).toBe(
      "job=kinase&tool=gromacs&status=blocked&created=2026-07-17&sort=updated&direction=ascending"
    )

    const malformed = jobTableViewFromSearchParams(
      new URLSearchParams(
        "tool=unknown&status=imaginary&created=2026-02-31&sort=nope&direction=sideways"
      ),
      ["gromacs"]
    )
    expect(malformed.filters).toEqual({
      job: "",
      tool: "",
      status: "",
      created: "",
      updated: "",
    })
    expect(malformed.normalized.toString()).toBe("")
    expect(
      jobTableSearchParams(malformed.filters, malformed.sort).toString()
    ).toBe("")

    const mismatched = jobTableViewFromSearchParams(
      new URLSearchParams("sort=nope&direction=ascending"),
      ["gromacs"]
    )
    expect(mismatched.sort).toEqual({ column: "created", direction: "descending" })
    expect(mismatched.normalized.toString()).toBe("")
  })
})
