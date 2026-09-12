import { expect, test } from "bun:test"
import { paeCellAt, paeColor, paeZoomBounds } from "../src/alphafold3-pae"

test("PAE coordinates preserve asymmetric row/frame and column/scored semantics", () => {
  const data = { prediction_id: "test", aggregation: "mean" as const, x_edges: [0, 4, 8], y_edges: [2, 5, 8], values: [[0, 3], [12, null]], valid_counts: [[12, 12], [12, 0]] }
  const cell = paeCellAt(75, 10, 100, 100, data)
  expect(data.values[cell.y][cell.x]).toBe(3)
  expect(paeZoomBounds(data, { x: 1, y: 1 }, { x: 0, y: 1 })).toEqual({ x_start: 0, x_end: 8, y_start: 5, y_end: 8 })
  expect(paeCellAt(110, -20, 100, 100, data)).toEqual({ x: 1, y: 0 })
  expect(paeColor(null)).not.toEqual(paeColor(0))
  expect(paeColor(32)).toEqual([255, 255, 255])
})
