import { describe, expect, test } from "bun:test"

import { ApiError } from "../src/api/client"
import {
  WEB_UPLOAD_LIMIT_BYTES,
  apiFieldErrors,
  forgetPendingIdempotencyKey,
  normalizedDisplayName,
  pdbFileError,
  readPendingIdempotencyKey,
  rememberPendingIdempotencyKey,
  shouldRotateIdempotencyKey,
  simulationTimeError,
  submissionErrorMessage,
} from "../src/gromacs"

describe("GROMACS Submission validation", () => {
  test("retains an ambiguous Submission key for later navigation", () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => void values.delete(key),
      setItem: (key: string, value: string) => void values.set(key, value),
    }

    rememberPendingIdempotencyKey(storage, "11111111-1111-4111-8111-111111111111")
    expect(readPendingIdempotencyKey(storage)).toBe(
      "11111111-1111-4111-8111-111111111111"
    )
    forgetPendingIdempotencyKey(storage)
    expect(readPendingIdempotencyKey(storage)).toBeNull()
    rememberPendingIdempotencyKey(storage, "not-a-uuid")
    expect(readPendingIdempotencyKey(storage)).toBeNull()
  })

  test("normalizes optional display names", () => {
    expect(normalizedDisplayName("  kinase run  ")).toBe("kinase run")
    expect(normalizedDisplayName("   ")).toBeNull()
  })

  test("accepts one web-sized PDB file", () => {
    expect(pdbFileError(new File(["ATOM"], "kinase.PDB"))).toBeNull()
    expect(pdbFileError(new File(["ATOM"], "kinase.gro"))).toBe("Choose a file ending in .pdb.")

    const largeFile = new File(["ATOM"], "kinase.pdb")
    Object.defineProperty(largeFile, "size", { value: WEB_UPLOAD_LIMIT_BYTES + 1 })
    expect(pdbFileError(largeFile)).toBe("Choose a PDB file up to 10 MiB.")
  })

  test("requires an integer simulation time from 1 to 250", () => {
    expect(simulationTimeError("1")).toBeNull()
    expect(simulationTimeError("250")).toBeNull()
    expect(simulationTimeError("1.5")).not.toBeNull()
    expect(simulationTimeError("251")).not.toBeNull()
    expect(simulationTimeError("0")).not.toBeNull()
    expect(simulationTimeError("")).not.toBeNull()
  })

  test("maps FastAPI validation locations to form fields", () => {
    const error = new ApiError(422, {
      detail: [
        {
          loc: ["body", "simulation_time_ns"],
          msg: "Input should be less than or equal to 250",
          type: "less_than_equal",
        },
      ],
    })

    expect(apiFieldErrors(error)).toEqual({
      simulation_time_ns: "Input should be less than or equal to 250",
    })
  })

  test("maps semantic PDB errors without trusting arbitrary detail shapes", () => {
    expect(
      apiFieldErrors(
        new ApiError(400, { code: "pdb_invalid", detail: "No ATOM records were found" })
      )
    ).toEqual({ pdb: "No ATOM records were found" })
    expect(
      apiFieldErrors(
        new ApiError(413, { code: "payload_too_large", detail: "Request body is too large" })
      )
    ).toEqual({ pdb: "Choose a PDB file up to 10 MiB." })
    expect(apiFieldErrors(new ApiError(422, { detail: "Not an array" }))).toEqual({})
    expect(apiFieldErrors(new ApiError(422, { detail: [{}] }))).toEqual({})
  })

  test("distinguishes retryable Submission failures by contract code", () => {
    const conflict = new ApiError(409, {
      code: "idempotency_conflict",
      detail: "The key was already used for different input",
    })
    const atLimit = new ApiError(409, {
      code: "active_job_limit_reached",
      detail: "Too many active jobs",
    })
    const unavailable = new ApiError(503, {
      code: "compute_unavailable",
      detail: "Compute is unavailable",
    })

    expect(shouldRotateIdempotencyKey(conflict)).toBeTrue()
    expect(shouldRotateIdempotencyKey(atLimit)).toBeFalse()
    expect(submissionErrorMessage(conflict, false)).toContain("different submission")
    expect(submissionErrorMessage(atLimit, false)).toContain("active jobs")
    expect(submissionErrorMessage(unavailable, false)).toContain("temporarily unavailable")
  })

  test("does not show a form alert for coded field errors", () => {
    const invalidPdb = new ApiError(400, {
      code: "pdb_invalid",
      detail: "No ATOM records were found",
    })

    expect(submissionErrorMessage(invalidPdb, true)).toBeNull()
    expect(submissionErrorMessage(new ApiError(422, { detail: [] }), false)).toContain(
      "rejected"
    )
  })

  test("keeps an alert for unrecognized validation and origin failures", () => {
    const mixedValidation = new ApiError(422, {
      detail: [
        { loc: ["body", "simulation_time_ns"], msg: "Invalid time" },
        { loc: ["body", "future_option"], msg: "Invalid option" },
      ],
    })
    const wrongOrigin = new ApiError(403, {
      code: "origin_not_allowed",
      detail: "Origin rejected",
    })

    expect(submissionErrorMessage(mixedValidation, true)).toContain("rejected")
    expect(submissionErrorMessage(wrongOrigin, false)).toContain("not configured")
  })

  test("treats a cancelled upload as an unknown submission outcome", () => {
    const error = new DOMException("cancelled", "AbortError")

    expect(submissionErrorMessage(error, false)).toContain("may already have created")
    expect(submissionErrorMessage(error, false)).toContain("check My Jobs")
  })
})
