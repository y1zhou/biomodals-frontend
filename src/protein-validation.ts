import type { components } from "@/api/schema"

export type ValidationPoint = components["schemas"]["ValidationPoint"]

// One common domain makes measured and predicted distances comparable.
export function validationGeometry(points: readonly ValidationPoint[]) {
  if (!points.length) return { positions: [], ticks: [] }
  let min = Infinity, max = -Infinity
  for (const point of points) {
    min = Math.min(min, point.measured_label, point.predicted_label)
    max = Math.max(max, point.measured_label, point.predicted_label)
  }
  // Normalize before subtraction to avoid overflow for large finite labels.
  const scale = Math.max(Math.abs(min), Math.abs(max)) || 1
  const padding = min === max ? 0.1 : (max / scale - min / scale) * 0.05
  const low = Math.max(-Number.MAX_VALUE / scale, min / scale - padding)
  const high = Math.min(Number.MAX_VALUE / scale, max / scale + padding)
  const fraction = (value: number) => (value / scale - low) / (high - low)
  return {
    positions: points.map((point) => ({ x: fraction(point.measured_label), y: fraction(point.predicted_label) })),
    ticks: Array.from({ length: 5 }, (_, index) => ({ fraction: index / 4, value: (low + (high - low) * index / 4) * scale })),
  }
}

export function nearestValidationPoint(positions: readonly { x: number; y: number }[], x: number, y: number, radius: number) {
  let nearest: number | null = null, distance = radius * radius
  for (let index = 0; index < positions.length; index++) {
    const point = positions[index]
    const next = (point.x - x) ** 2 + (point.y - y) ** 2
    if (next <= distance && (next < distance || nearest === null)) { nearest = index; distance = next }
  }
  return nearest
}
