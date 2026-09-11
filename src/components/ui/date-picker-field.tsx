import { Popover } from "@base-ui/react/popover"
import { CalendarDays as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react"
import {
  type KeyboardEvent,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  type CalendarMonth,
  calendarDays,
  calendarFocusValue,
  calendarMonth,
  dateFromParts,
  dateValue,
  parseDateValue,
  shiftCalendarMonth,
  shiftDateValue,
} from "@/date-picker"
import { cn } from "@/lib/utils"

const monthFormatter = new Intl.DateTimeFormat(undefined, {
  month: "long",
  year: "numeric",
})
const selectedDateFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
})
const fullDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "full",
})
const shortMonthFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
})
const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const monthLabels = Array.from({ length: 12 }, (_, month) =>
  shortMonthFormatter.format(
    dateFromParts({ day: 1, month, year: 2026 })
  )
)

interface DatePickerFieldProps {
  "aria-label": string
  onValueChange: (value: string) => void
  value: string
}

function DatePickerField({
  "aria-label": ariaLabel,
  onValueChange,
  value,
}: DatePickerFieldProps) {
  const jumpYearId = useId()
  const today = new Date()
  const todayValue = dateValue({
    day: today.getDate(),
    month: today.getMonth(),
    year: today.getFullYear(),
  })
  const [open, setOpen] = useState(false)
  const [visibleMonth, setVisibleMonth] = useState(() => calendarMonth(value))
  const [focusedDayValue, setFocusedDayValue] = useState(() =>
    calendarFocusValue(calendarMonth(value), value, todayValue)
  )
  const [jumpOpen, setJumpOpen] = useState(false)
  const [jumpYear, setJumpYear] = useState(() =>
    String(calendarMonth(value).year)
  )
  const calendarGrid = useRef<HTMLDivElement>(null)
  const pendingDayFocus = useRef<string | null>(null)
  const days = useMemo(() => calendarDays(visibleMonth), [visibleMonth])
  const selected = parseDateValue(value)
  const selectedLabel = selected
    ? selectedDateFormatter.format(dateFromParts(selected))
    : "Any date"
  const monthLabel = monthFormatter.format(
    dateFromParts({ day: 1, ...visibleMonth })
  )
  const previousMonth = shiftCalendarMonth(visibleMonth, -1)
  const nextMonth = shiftCalendarMonth(visibleMonth, 1)
  const parsedJumpYear = Number(jumpYear)
  const validJumpYear =
    Number.isInteger(parsedJumpYear) &&
    parsedJumpYear >= 1 &&
    parsedJumpYear <= 9999

  useLayoutEffect(() => {
    const nextValue = pendingDayFocus.current
    if (!nextValue || jumpOpen) return
    const nextButton = calendarGrid.current?.querySelector<HTMLButtonElement>(
      `[data-date="${nextValue}"]`
    )
    if (!nextButton) return
    pendingDayFocus.current = null
    nextButton.focus()
  }, [days, focusedDayValue, jumpOpen])

  function chooseDate(nextValue: string) {
    onValueChange(nextValue)
    setOpen(false)
  }

  function moveMonth(month: CalendarMonth | null) {
    if (!month) return
    setVisibleMonth(month)
    setFocusedDayValue(calendarFocusValue(month, value, todayValue))
    setJumpYear(String(month.year))
  }

  function chooseMonth(month: number) {
    if (!validJumpYear) return
    const nextMonth = { month, year: parsedJumpYear }
    const nextValue = calendarFocusValue(nextMonth, value, todayValue)
    pendingDayFocus.current = nextValue
    setVisibleMonth(nextMonth)
    setFocusedDayValue(nextValue)
    setJumpOpen(false)
  }

  function moveDayFocus(currentValue: string, offset: number) {
    const nextValue = shiftDateValue(currentValue, offset)
    const nextDate = nextValue ? parseDateValue(nextValue) : null
    if (!nextValue || !nextDate) return
    pendingDayFocus.current = nextValue
    setFocusedDayValue(nextValue)
    setVisibleMonth({ month: nextDate.month, year: nextDate.year })
    setJumpYear(String(nextDate.year))
  }

  function handleDayKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    currentValue: string
  ) {
    const offset = {
      ArrowDown: 7,
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
    }[event.key]
    if (offset === undefined) return
    event.preventDefault()
    moveDayFocus(currentValue, offset)
  }

  return (
    <Popover.Root
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          const nextMonth = calendarMonth(value)
          setVisibleMonth(nextMonth)
          setFocusedDayValue(
            calendarFocusValue(nextMonth, value, todayValue)
          )
          setJumpYear(String(nextMonth.year))
        }
        pendingDayFocus.current = null
        setJumpOpen(false)
        setOpen(nextOpen)
      }}
      open={open}
    >
      <Popover.Trigger
        aria-label={ariaLabel}
        className="flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-2.5 text-sm font-normal normal-case tracking-normal text-foreground outline-none transition-colors hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-[popup-open]:bg-muted/50"
        data-slot="date-picker-trigger"
        type="button"
      >
        <span className="min-w-0 truncate text-left">{selectedLabel}</span>
        <CalendarIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner align="start" className="z-[70]" sideOffset={4}>
          <Popover.Popup
            aria-label={`${ariaLabel} calendar`}
            className="w-72 origin-[var(--transform-origin)] rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg outline-none transition-[scale,opacity] duration-100 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0"
            data-slot="date-picker-popup"
            role="dialog"
          >
            <div className="flex items-center justify-between gap-2">
              <Button
                aria-label="Previous month"
                disabled={!previousMonth}
                onClick={() => moveMonth(previousMonth)}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <ChevronLeft aria-hidden="true" />
              </Button>
              <button
                aria-expanded={jumpOpen}
                aria-label="Choose month and year"
                className="rounded-md px-2 py-1 text-sm font-semibold outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  setJumpYear(String(visibleMonth.year))
                  setJumpOpen((current) => !current)
                }}
                type="button"
              >
                <span aria-live="polite">{monthLabel}</span>
              </button>
              <Button
                aria-label="Next month"
                disabled={!nextMonth}
                onClick={() => moveMonth(nextMonth)}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <ChevronRight aria-hidden="true" />
              </Button>
            </div>
            {jumpOpen ? (
              <div className="mt-2 rounded-lg border bg-muted/30 p-2.5">
                <label
                  className="mb-2 block text-xs font-medium text-muted-foreground"
                  htmlFor={jumpYearId}
                >
                  Year
                </label>
                <Input
                  aria-invalid={!validJumpYear}
                  aria-label="Jump to year"
                  className="h-8 text-center tabular-nums"
                  id={jumpYearId}
                  max={9999}
                  min={1}
                  onChange={(event) => setJumpYear(event.target.value)}
                  step={1}
                  type="number"
                  value={jumpYear}
                />
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Enter a year, then choose a month.
                </p>
                <div
                  aria-label="Choose a month"
                  className="mt-2 grid grid-cols-3 gap-1"
                  role="group"
                >
                  {monthLabels.map((label, month) => (
                    <button
                      aria-pressed={
                        validJumpYear &&
                        parsedJumpYear === visibleMonth.year &&
                        month === visibleMonth.month
                      }
                      className={cn(
                        "rounded-md px-2 py-1.5 text-xs outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                        validJumpYear &&
                          parsedJumpYear === visibleMonth.year &&
                          month === visibleMonth.month &&
                          "bg-primary text-primary-foreground hover:bg-primary/85"
                      )}
                      disabled={!validJumpYear}
                      key={month}
                      onClick={() => chooseMonth(month)}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div
                  aria-hidden="true"
                  className="mt-2 grid grid-cols-7 text-center text-xs font-medium text-muted-foreground"
                >
                  {weekdayLabels.map((weekday) => (
                    <span className="py-1" key={weekday}>
                      {weekday}
                    </span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1" ref={calendarGrid}>
                  {days.map((day) => {
                    const selectedDay = day.value === value
                    const todayDay = day.value === todayValue
                    return (
                      <button
                        aria-hidden={!day.selectable || undefined}
                        aria-current={todayDay ? "date" : undefined}
                        aria-label={
                          day.selectable
                            ? fullDateFormatter.format(dateFromParts(day))
                            : undefined
                        }
                        aria-pressed={day.selectable ? selectedDay : undefined}
                        className={cn(
                          "grid size-8 place-items-center rounded-md text-xs tabular-nums outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-0",
                          !day.currentMonth && "text-muted-foreground/60",
                          todayDay && !selectedDay && "ring-1 ring-ring/60",
                          selectedDay &&
                            "bg-primary text-primary-foreground hover:bg-primary/85 hover:text-primary-foreground"
                        )}
                        data-current-month={day.currentMonth}
                        data-date={day.value}
                        data-selectable={day.selectable}
                        data-slot="calendar-day"
                        data-today={todayDay || undefined}
                        disabled={!day.selectable}
                        key={day.value}
                        onClick={() => chooseDate(day.value)}
                        onFocus={() => setFocusedDayValue(day.value)}
                        onKeyDown={(event) =>
                          handleDayKeyDown(event, day.value)
                        }
                        tabIndex={
                          day.selectable && day.value === focusedDayValue ? 0 : -1
                        }
                        type="button"
                      >
                        {day.selectable ? day.day : null}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
            <div className="mt-3 flex items-center justify-between border-t pt-2">
              <Button
                disabled={!value}
                onClick={() => chooseDate("")}
                size="sm"
                type="button"
                variant="ghost"
              >
                Clear
              </Button>
              <Button
                onClick={() => chooseDate(todayValue)}
                size="sm"
                type="button"
                variant="outline"
              >
                Today
              </Button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

export { DatePickerField }
