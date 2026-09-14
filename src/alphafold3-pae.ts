import type { AlphaFold3Pae, PaeBounds } from "@/api/client"

export function paeColor(value: number | null): [number, number, number] {
  if (value === null) return [224, 224, 224]
  const fraction = Math.max(0, Math.min(32, value)) / 32
  return [Math.round(20 + fraction * 235), Math.round(85 + fraction * 170), Math.round(55 + fraction * 200)]
}

export function paeCellAt(x: number, y: number, width: number, height: number, data: AlphaFold3Pae) {
  return {
    x: Math.max(0, Math.min(data.x_edges.length - 2, Math.floor(x / width * (data.x_edges.length - 1)))),
    y: Math.max(0, Math.min(data.y_edges.length - 2, Math.floor(y / height * (data.y_edges.length - 1)))),
  }
}

export function paeZoomBounds(data: AlphaFold3Pae, start: { x: number; y: number }, end: { x: number; y: number }): PaeBounds {
  return {
    x_start: data.x_edges[Math.min(start.x, end.x)],
    x_end: data.x_edges[Math.max(start.x, end.x) + 1],
    y_start: data.y_edges[Math.min(start.y, end.y)],
    y_end: data.y_edges[Math.max(start.y, end.y) + 1],
  }
}
