import { describe, expect, test } from "bun:test"

import {
  calendarDays,
  calendarMonth,
  parseDateValue,
  shiftCalendarMonth,
} from "../src/date-picker"

describe("Date picker", () => {
  test("parses only real normalized calendar dates", () => {
    expect(parseDateValue("2026-07-23")).toEqual({
      day: 23,
      month: 6,
      year: 2026,
    })
    expect(parseDateValue("2026-02-30")).toBeNull()
    expect(parseDateValue("07/23/2026")).toBeNull()
    expect(parseDateValue("")).toBeNull()
  })

  test("uses the selected month and crosses year boundaries", () => {
    const today = new Date(2026, 6, 23, 12)

    expect(calendarMonth("2026-02-14", today)).toEqual({
      month: 1,
      year: 2026,
    })
    expect(calendarMonth("", today)).toEqual({ month: 6, year: 2026 })
    expect(shiftCalendarMonth({ month: 0, year: 2026 }, -1)).toEqual({
      month: 11,
      year: 2025,
    })
  })

  test("builds a stable six-week grid with normalized values", () => {
    const days = calendarDays({ month: 6, year: 2026 })

    expect(days).toHaveLength(42)
    expect(days[0]).toMatchObject({
      currentMonth: false,
      day: 28,
      value: "2026-06-28",
    })
    expect(days[3]).toMatchObject({
      currentMonth: true,
      day: 1,
      value: "2026-07-01",
    })
    expect(days.at(-1)).toMatchObject({
      currentMonth: false,
      day: 8,
      value: "2026-08-08",
    })
  })
})
