import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") {
    ref(value)
  } else if (ref) {
    ref.current = value
  }
}

function Input({ className, ref, type, ...props }: React.ComponentProps<"input">) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const setInputRef = React.useCallback(
    (input: HTMLInputElement | null) => {
      inputRef.current = input
      assignRef(ref, input)
    },
    [ref]
  )

  React.useEffect(() => {
    const input = inputRef.current
    if (type !== "number" || !input) return

    const stepFocusedInput = (event: WheelEvent) => {
      if (
        event.deltaY === 0 ||
        input.ownerDocument.activeElement !== input ||
        input.disabled ||
        input.readOnly
      ) {
        return
      }
      event.preventDefault()
      const previousValue = input.value
      try {
        if (event.deltaY < 0) input.stepUp()
        else input.stepDown()
      } catch {
        return
      }
      if (input.value !== previousValue) {
        input.dispatchEvent(new Event("input", { bubbles: true }))
      }
    }

    input.addEventListener("wheel", stepFocusedInput, { passive: false })
    return () => input.removeEventListener("wheel", stepFocusedInput)
  }, [type])

  return (
    <InputPrimitive
      ref={setInputRef}
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
