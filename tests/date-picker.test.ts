import { describe, expect, test } from "bun:test"

import {
  calendarDays,
  calendarFocusValue,
  calendarMonth,
  parseDateValue,
  shiftCalendarMonth,
  shiftDateValue,
} from "../src/date-picker"

describe("Date picker", () => {
  test("parses only real normalized calendar dates", () => {
    expect(parseDateValue("2026-07-23")).toEqual({
      day: 23,
      month: 6,
      year: 2026,
    })
    expect(parseDateValue("0000-01-01")).toBeNull()
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
    expect(shiftCalendarMonth({ month: 0, year: 1 }, -1)).toBeNull()
    expect(shiftCalendarMonth({ month: 11, year: 9999 }, 1)).toBeNull()
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
      selectable: true,
      value: "2026-08-08",
    })

    const firstSupportedMonth = calendarDays({ month: 0, year: 1 })
    expect(firstSupportedMonth[0]).toMatchObject({
      currentMonth: false,
      selectable: false,
      year: 0,
    })
    expect(firstSupportedMonth.find((day) => day.currentMonth)).toMatchObject({
      selectable: true,
      value: "0001-01-01",
    })
  })

  test("chooses one roving focus target for a visible month", () => {
    expect(
      calendarFocusValue(
        { month: 0, year: 2012 },
        "2012-01-17",
        "2012-01-08"
      )
    ).toBe("2012-01-17")
    expect(
      calendarFocusValue(
        { month: 0, year: 2012 },
        "2026-07-23",
        "2012-01-08"
      )
    ).toBe("2012-01-08")
    expect(
      calendarFocusValue(
        { month: 0, year: 2012 },
        "2026-07-23",
        "2026-07-23"
      )
    ).toBe("2012-01-01")
  })

  test("moves keyboard focus across weeks, leap days, and years", () => {
    expect(shiftDateValue("2012-01-01", -1)).toBe("2011-12-31")
    expect(shiftDateValue("2024-02-28", 1)).toBe("2024-02-29")
    expect(shiftDateValue("2024-02-29", 7)).toBe("2024-03-07")
    expect(shiftDateValue("invalid", 1)).toBeNull()
    expect(shiftDateValue("2012-01-01", 1.5)).toBeNull()
  })
})
