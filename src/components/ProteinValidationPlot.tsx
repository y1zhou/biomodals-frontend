import { useEffect, useId, useMemo, useRef, useState } from "react"
import { nearestValidationPoint, validationGeometry, type ValidationPoint } from "@/protein-validation"

const size = 600, left = 80, top = 30, extent = 490
const format = (value: number) => value !== 0 && (Math.abs(value) < 0.001 || Math.abs(value) >= 1e6) ? value.toExponential(3) : value.toLocaleString(undefined, { maximumFractionDigits: 3 })

export default function ProteinValidationPlot({ points, evaluatedVariants }: { points: readonly ValidationPoint[]; evaluatedVariants: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const descriptionId = useId()
  const selectedId = useId()
  const [active, setActive] = useState<number | null>(null)
  const geometry = useMemo(() => validationGeometry(points), [points])
  const point = active === null ? undefined : points[active]
  const position = active === null ? undefined : geometry.positions[active]

  useEffect(() => {
    const context = canvas.current?.getContext("2d")
    if (!context || !points.length) return
    context.setTransform(2, 0, 0, 2, 0, 0)
    context.clearRect(0, 0, size, size)
    context.fillStyle = "white"; context.fillRect(0, 0, size, size)
    context.font = "14px sans-serif"
    for (const tick of geometry.ticks) {
      const x = left + tick.fraction * extent, y = top + (1 - tick.fraction) * extent
      context.strokeStyle = "#e5e7eb"; context.beginPath()
      context.moveTo(x, top); context.lineTo(x, top + extent)
      context.moveTo(left, y); context.lineTo(left + extent, y); context.stroke()
      context.fillStyle = "#374151"; context.textAlign = "center"
      context.fillText(format(tick.value), x, top + extent + 24, 100)
      context.textAlign = "right"; context.fillText(format(tick.value), left - 10, y + 5, 65)
    }
    context.strokeStyle = "#6b7280"; context.setLineDash([5, 5]); context.beginPath()
    context.moveTo(left, top + extent); context.lineTo(left + extent, top); context.stroke(); context.setLineDash([])
    context.fillStyle = "#2563eb"; context.globalAlpha = 0.55
    context.beginPath()
    for (const position of geometry.positions) {
      const x = left + position.x * extent, y = top + (1 - position.y) * extent
      context.moveTo(x + 3, y); context.arc(x, y, 3, 0, 2 * Math.PI)
    }
    context.fill(); context.globalAlpha = 1
    context.fillStyle = "#111827"; context.textAlign = "center"; context.font = "16px sans-serif"
    context.fillText("Measured label", left + extent / 2, size - 15)
    context.save(); context.translate(18, top + extent / 2); context.rotate(-Math.PI / 2)
    context.fillText("Held-out predicted label", 0, 0); context.restore()
  }, [geometry, points.length])

  if (!points.length) return <p className="text-muted-foreground">{evaluatedVariants > 0 ? "Per-variant held-out predictions were not retained for this result; the scatter plot is unavailable." : "No held-out predictions are available for a scatter plot."}</p>

  return <figure className="space-y-3" aria-label="Measured versus held-out predicted labels">
    <figcaption id={descriptionId} className="text-muted-foreground">{points.length.toLocaleString()} evaluated variants. Measured labels are replicate means; repeated held-out predictions are averaged per variant. Both axes use the same scale; the dashed line is y = x. Hover a point or focus the plot and use arrow keys to inspect variants, including overlapping points.</figcaption>
    <div className="relative aspect-square w-full max-w-xl rounded border bg-white">
      <canvas ref={canvas} width={size * 2} height={size * 2} className="h-full w-full rounded focus-visible:outline-2 focus-visible:outline-ring" role="img" tabIndex={0} aria-label="Held-out validation scatter plot" aria-describedby={`${descriptionId} ${selectedId}`}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          const x = ((event.clientX - rect.left) / rect.width * size - left) / extent
          const y = 1 - ((event.clientY - rect.top) / rect.height * size - top) / extent
          setActive(nearestValidationPoint(geometry.positions, x, y, 10 / rect.width * size / extent))
        }}
        onPointerLeave={(event) => { if (document.activeElement !== event.currentTarget) setActive(null) }}
        onFocus={() => setActive((current) => current ?? 0)}
        onKeyDown={(event) => {
          if (event.key === "Escape") { setActive(null); return }
          if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return
          event.preventDefault()
          setActive((current) => event.key === "Home" ? 0 : event.key === "End" ? points.length - 1 : Math.max(0, Math.min(points.length - 1, (current ?? 0) + (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1))))
        }} />
      {position ? <span aria-hidden="true" className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black bg-transparent" style={{ left: `${(left + position.x * extent) / size * 100}%`, top: `${(top + (1 - position.y) * extent) / size * 100}%` }} /> : null}
    </div>
    <div id={selectedId} role="status" className="min-h-24 break-words rounded-lg bg-muted/40 p-3">
      {point ? <><p className="font-medium">Variant {active! + 1} of {points.length}: {point.mutations || "Unchanged parent"}</p><p>Measured label: <span title={String(point.measured_label)}>{format(point.measured_label)}</span> · Held-out predicted label: <span title={String(point.predicted_label)}>{format(point.predicted_label)}</span></p><p>Held-out prediction count: {point.prediction_count}</p></> : "Hover or use the keyboard to inspect a held-out variant."}
    </div>
  </figure>
}
