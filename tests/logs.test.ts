import { describe, expect, test } from "bun:test"

import { logDownloadFilename, modalLogLines } from "@/logs"

describe("administrator stage logs", () => {
  test("separates Modal timestamps from monospace log messages", () => {
    expect(
      modalLogLines(
        "2026-07-22 14:05:33+08:00 Preparing simulation\nplain continuation\n"
      )
    ).toEqual([
      {
        timestamp: "2026-07-22 14:05:33+08:00",
        message: "Preparing simulation",
      },
      { timestamp: null, message: "plain continuation" },
    ])
  })

  test("creates a filesystem-safe timestamped stage-log filename", () => {
    expect(
      logDownloadFilename(
        new Date("2026-07-22T06:07:08.999Z"),
        "gromacs",
        "prepare_simulation"
      )
    ).toBe("2026-07-22T06-07-08Z_gromacs_prepare_simulation.log")
  })
})
