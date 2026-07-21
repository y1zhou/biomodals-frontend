import { Check, LoaderCircle, RefreshCw, TriangleAlert } from "lucide-react"
import { useEffect, useRef, useState, type ComponentProps } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type RefreshState = "idle" | "refreshing" | "refreshed" | "failed"

type RefreshButtonProps = Omit<
  ComponentProps<typeof Button>,
  "children" | "onClick"
> & {
  idleLabel?: string
  onRefresh: () => Promise<unknown>
}

const minimumSpinnerTime = 400
const resultDisplayTime = 1_200

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds))
}

export function RefreshButton({
  className,
  disabled,
  idleLabel = "Refresh",
  onRefresh,
  variant = "outline",
  ...props
}: RefreshButtonProps) {
  const [state, setState] = useState<RefreshState>("idle")
  const resetTimer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current)
    },
    []
  )

  async function refresh() {
    if (state === "refreshing") return
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current)
    setState("refreshing")

    const [result] = await Promise.allSettled([
      onRefresh(),
      delay(minimumSpinnerTime),
    ])
    setState(result.status === "fulfilled" ? "refreshed" : "failed")
    resetTimer.current = window.setTimeout(() => {
      setState("idle")
      resetTimer.current = null
    }, resultDisplayTime)
  }

  const refreshing = state === "refreshing"

  return (
    <Button
      {...props}
      aria-live="polite"
      className={cn(
        state === "refreshed" &&
          "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
        state === "failed" &&
          "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15",
        className
      )}
      disabled={disabled || refreshing}
      onClick={() => void refresh()}
      variant={variant}
    >
      {state === "refreshing" ? (
        <LoaderCircle aria-hidden="true" className="animate-spin" />
      ) : state === "refreshed" ? (
        <Check aria-hidden="true" />
      ) : state === "failed" ? (
        <TriangleAlert aria-hidden="true" />
      ) : (
        <RefreshCw aria-hidden="true" />
      )}
      {state === "refreshing"
        ? "Refreshing…"
        : state === "refreshed"
          ? "Refreshed"
          : state === "failed"
            ? "Refresh failed"
            : idleLabel}
    </Button>
  )
}
