export interface CalendarMonth {
  month: number
  year: number
}

export interface CalendarDay {
  currentMonth: boolean
  day: number
  month: number
  selectable: boolean
  value: string
  year: number
}

export interface DateParts {
  day: number
  month: number
  year: number
}

function localDate({ day, month, year }: DateParts) {
  const date = new Date(0)
  date.setHours(12, 0, 0, 0)
  date.setFullYear(year, month, day)
  return date
}

export function dateValue({ day, month, year }: DateParts) {
  return `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

export function parseDateValue(value: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const parts = {
    day: Number(match[3]),
    month: Number(match[2]) - 1,
    year: Number(match[1]),
  }
  if (parts.year < 1) return null
  const date = localDate(parts)
  return date.getFullYear() === parts.year &&
    date.getMonth() === parts.month &&
    date.getDate() === parts.day
    ? parts
    : null
}

export function calendarMonth(value: string, today = new Date()): CalendarMonth {
  const selected = parseDateValue(value)
  return selected
    ? { month: selected.month, year: selected.year }
    : { month: today.getMonth(), year: today.getFullYear() }
}

export function shiftCalendarMonth(
  month: CalendarMonth,
  offset: number
): CalendarMonth | null {
  const shifted = localDate({ day: 1, month: month.month + offset, year: month.year })
  const nextMonth = { month: shifted.getMonth(), year: shifted.getFullYear() }
  return nextMonth.year >= 1 && nextMonth.year <= 9999 ? nextMonth : null
}

export function calendarFocusValue(
  month: CalendarMonth,
  ...preferredValues: string[]
) {
  for (const value of preferredValues) {
    const date = parseDateValue(value)
    if (date?.month === month.month && date.year === month.year) return value
  }
  return dateValue({ day: 1, ...month })
}

export function shiftDateValue(value: string, offset: number): string | null {
  const date = parseDateValue(value)
  if (!date || !Number.isInteger(offset)) return null
  const shifted = localDate({ ...date, day: date.day + offset })
  const parts = {
    day: shifted.getDate(),
    month: shifted.getMonth(),
    year: shifted.getFullYear(),
  }
  return parts.year >= 1 && parts.year <= 9999 ? dateValue(parts) : null
}

export function calendarDays(month: CalendarMonth): CalendarDay[] {
  const first = localDate({ day: 1, ...month })
  const firstVisibleDay = 1 - first.getDay()
  return Array.from({ length: 42 }, (_, index) => {
    const date = localDate({
      day: firstVisibleDay + index,
      month: month.month,
      year: month.year,
    })
    const parts = {
      day: date.getDate(),
      month: date.getMonth(),
      year: date.getFullYear(),
    }
    return {
      ...parts,
      currentMonth: parts.month === month.month && parts.year === month.year,
      selectable: parts.year >= 1 && parts.year <= 9999,
      value: dateValue(parts),
    }
  })
}

export function dateFromParts(parts: DateParts) {
  return localDate(parts)
}
