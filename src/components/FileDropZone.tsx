import { CloudUpload } from "lucide-react"
import { useRef, useState, type DragEvent } from "react"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export default function FileDropZone({
  accept,
  describedBy,
  disabled = false,
  fileName,
  help,
  id,
  invalid = false,
  label,
  onSelect,
  required = false,
}: {
  accept: string
  describedBy?: string
  disabled?: boolean
  fileName?: string
  help: string
  id: string
  invalid?: boolean
  label: string
  onSelect: (file: File | null) => void
  required?: boolean
}) {
  const dragDepth = useRef(0)
  const [dragActive, setDragActive] = useState(false)

  function finishDrag() {
    dragDepth.current = 0
    setDragActive(false)
  }

  function dragEnter(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes("Files")) return
    event.preventDefault()
    if (disabled) return
    dragDepth.current += 1
    setDragActive(true)
  }

  function dragLeave(event: DragEvent<HTMLDivElement>) {
    if (dragDepth.current === 0) return
    event.preventDefault()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragActive(false)
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-dashed p-3 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
        dragActive
          ? "border-primary bg-primary/5 ring-3 ring-primary/10"
          : "border-input bg-muted/20"
      )}
      onDragEnter={dragEnter}
      onDragLeave={dragLeave}
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect =
          event.dataTransfer.types.includes("Files") && !disabled ? "copy" : "none"
      }}
      onDrop={(event) => {
        event.preventDefault()
        if (!event.dataTransfer.types.includes("Files")) return
        finishDrag()
        if (!disabled) onSelect(event.dataTransfer.files[0] ?? null)
      }}
    >
      <input
        accept={accept}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        aria-label={label}
        className="sr-only"
        disabled={disabled}
        id={id}
        onChange={(event) => onSelect(event.target.files?.[0] ?? null)}
        required={required}
        type="file"
      />
      {dragActive ? (
        <div className="flex min-h-8 items-center justify-center gap-2 font-medium text-primary">
          <CloudUpload aria-hidden="true" className="size-4" />
          Drop the {label} here
        </div>
      ) : (
        <div className="flex min-h-8 min-w-0 flex-wrap items-center gap-3">
          <label
            aria-disabled={disabled}
            className={cn(
              buttonVariants({ variant: "secondary" }),
              "cursor-pointer",
              disabled && "pointer-events-none opacity-50"
            )}
            htmlFor={id}
          >
            Choose file
          </label>
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            {fileName || "No file chosen"}
          </span>
        </div>
      )}
      <p aria-live="polite" className="mt-2 text-xs text-muted-foreground">
        {dragActive ? "Release to select this file." : help}
      </p>
    </div>
  )
}
