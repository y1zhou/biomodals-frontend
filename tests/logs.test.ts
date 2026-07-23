import { describe, expect, test } from "bun:test"

import {
  ansiLogSegments,
  firstModalLogTimestamp,
  logDownloadFilename,
  modalLogLines,
  styledModalLogLines,
} from "@/logs"

describe("stage logs", () => {
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

  test("turns ANSI styling into safe virtual-DOM segments", () => {
    expect(
      ansiLogSegments("\u001b[1;31mError <unsafe>\u001b[0m plain")
    ).toEqual([
      {
        background: null,
        decorations: ["bold"],
        foreground: "rgb(187 0 0)",
        text: "Error <unsafe>",
      },
      {
        background: null,
        decorations: [],
        foreground: null,
        text: " plain",
      },
    ])
  })

  test("preserves ANSI styling across timestamped log lines", () => {
    expect(
      styledModalLogLines(
        "2026-07-22 14:05:33+08:00 \u001b[31mfirst line\n" +
          "2026-07-22 14:05:34+08:00 second line\u001b[0m\n"
      )
    ).toEqual([
      {
        timestamp: "2026-07-22 14:05:33+08:00",
        message: "\u001b[31mfirst line",
        segments: [
          {
            background: null,
            decorations: [],
            foreground: "rgb(187 0 0)",
            text: "first line",
          },
        ],
      },
      {
        timestamp: "2026-07-22 14:05:34+08:00",
        message: "second line\u001b[0m",
        segments: [
          {
            background: null,
            decorations: [],
            foreground: "rgb(187 0 0)",
            text: "second line",
          },
        ],
      },
    ])
  })

  test("finds the first timestamp after an unstructured prefix", () => {
    expect(
      firstModalLogTimestamp(
        "Following logs…\n2026-07-22 14:05:33+08:00 Running\n"
      )
    ).toBe("2026-07-22 14:05:33+08:00")
  })
})
