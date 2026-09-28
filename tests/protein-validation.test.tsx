import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import ProteinValidationPlot from "../src/components/ProteinValidationPlot"
import { nearestValidationPoint, validationGeometry, type ValidationPoint } from "../src/protein-validation"

const point = (measured_label: number, predicted_label: number): ValidationPoint => ({ mutations: "A:A1V", measured_label, predicted_label, prediction_count: 1 })

test("validation geometry uses measured X and predicted Y with a shared domain", () => {
  const geometry = validationGeometry([point(-2, 4), point(4, -2), point(1, 1)])
  expect(geometry.positions[0]!.x).toBeCloseTo(geometry.positions[1]!.y)
  expect(geometry.positions[0]!.y).toBeCloseTo(geometry.positions[1]!.x)
  expect(geometry.positions[0]!.x).toBeLessThan(geometry.positions[0]!.y)
  expect(geometry.positions[2]).toEqual({ x: 0.5, y: 0.5 })
  expect(geometry.ticks[0]!.value).toBeLessThan(-2)
  expect(geometry.ticks.at(-1)!.value).toBeGreaterThan(4)
  expect(nearestValidationPoint(geometry.positions, 0.5, 0.5, 0.02)).toBe(2)
  expect(nearestValidationPoint(geometry.positions, 0, 0, 0.02)).toBeNull()
})

test("empty, constant and extreme finite labels have usable plot geometry", () => {
  expect(validationGeometry([])).toEqual({ positions: [], ticks: [] })
  for (const value of [0, -3, 2, Number.MAX_VALUE, -Number.MAX_VALUE, Number.MIN_VALUE]) {
    const geometry = validationGeometry([point(value, value)])
    expect(geometry.positions[0]!.x).toBe(geometry.positions[0]!.y)
    expect(geometry.ticks.every((tick) => Number.isFinite(tick.value))).toBe(true)
    expect(geometry.positions.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1)).toBe(true)
  }
  const extreme = validationGeometry([point(-Number.MAX_VALUE, Number.MAX_VALUE)])
  expect(extreme.positions).toEqual([{ x: 0, y: 1 }])
  expect(extreme.ticks.every((tick) => Number.isFinite(tick.value))).toBe(true)
})

test("all 10000 evidence points remain individually addressable including overlap", () => {
  const points = Array.from({ length: 10000 }, (_, index) => point(index, -index))
  const geometry = validationGeometry(points)
  expect(geometry.positions).toHaveLength(10000)
  const last = geometry.positions[9999]!
  expect(nearestValidationPoint(geometry.positions, last.x, last.y, 0.01)).toBe(9999)
  expect(nearestValidationPoint([{ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }], 0.5, 0.5, 0.01)).toBe(0)
})

test("historical aggregate-only and unevaluated results explain missing plots", () => {
  expect(renderToStaticMarkup(<ProteinValidationPlot points={[]} evaluatedVariants={4} />)).toContain("Per-variant held-out predictions were not retained")
  expect(renderToStaticMarkup(<ProteinValidationPlot points={[]} evaluatedVariants={0} />)).toContain("No held-out predictions are available")
  expect(renderToStaticMarkup(<ProteinValidationPlot points={[point(-2, 1)]} evaluatedVariants={1} />)).toContain("Both axes use the same scale")
})
