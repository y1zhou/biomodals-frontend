import { describe, expect, test } from "bun:test"

import { ApiError } from "../src/api/client"
import {
  WEB_UPLOAD_LIMIT_BYTES,
  apiFieldErrors,
  normalizedDisplayName,
  pdbFileError,
  simulationTimeError,
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
    expect(pdbFileError(largeFile)).toBe("The web uploader supports files up to 100 MiB.")
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
})
