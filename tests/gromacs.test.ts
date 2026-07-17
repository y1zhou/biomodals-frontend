import { describe, expect, test } from "bun:test"

import { ApiError } from "../src/api/client"
import {
  WEB_UPLOAD_LIMIT_BYTES,
  apiFieldErrors,
  normalizedDisplayName,
  pdbFileError,
  shouldRotateIdempotencyKey,
  simulationTimeError,
  submissionErrorMessage,
} from "../src/gromacs"

describe("GROMACS Submission validation", () => {
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

  test("requires an integer simulation time from 1 to 200", () => {
    expect(simulationTimeError("1")).toBeNull()
    expect(simulationTimeError("200")).toBeNull()
    expect(simulationTimeError("1.5")).not.toBeNull()
    expect(simulationTimeError("201")).not.toBeNull()
  })

  test("maps FastAPI validation locations to form fields", () => {
    const error = new ApiError(422, {
      detail: [
        {
          loc: ["body", "simulation_time_ns"],
          msg: "Input should be less than or equal to 200",
          type: "less_than_equal",
        },
      ],
    })

    expect(apiFieldErrors(error)).toEqual({
      simulation_time_ns: "Input should be less than or equal to 200",
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
    expect(submissionErrorMessage(conflict, false)).toContain("different Submission")
    expect(submissionErrorMessage(atLimit, false)).toContain("active Jobs")
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
})
