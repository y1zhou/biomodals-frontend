import { describe, expect, test } from "bun:test"

import { formatBytes } from "../src/storage"

describe("storage presentation", () => {
  test("formats binary byte totals without hiding exact small values", () => {
    expect(formatBytes(0)).toBe("0 B")
    expect(formatBytes(1023)).toBe("1023 B")
    expect(formatBytes(1024)).toBe("1 KiB")
    expect(formatBytes(1024 ** 4)).toBe("1 TiB")
  })

  test("rejects unusable totals", () => {
    expect(formatBytes(-1)).toBe("—")
    expect(formatBytes(Number.NaN)).toBe("—")
  })
})
