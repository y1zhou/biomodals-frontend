import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useEffect, useRef, useState, type PointerEvent } from "react"
import { alphaFold3Pae, apiErrorCode, type AlphaFold3Prediction, type PaeBounds } from "@/api/client"
import { useExpireSession } from "@/auth-state"
import { paeCellAt, paeColor, paeZoomBounds } from "@/alphafold3-pae"
import type { AlphaFold3Residue } from "@/alphafold3-structure"
import { Button } from "@/components/ui/button"

type Cell = { x: number; y: number }

export default function AlphaFold3Pae({ jobId, ownerId, prediction, residue }: {
  jobId: string
  ownerId: string
  prediction: AlphaFold3Prediction
  residue: (chain: string, index: number) => AlphaFold3Residue | undefined
}) {
  const [bounds, setBounds] = useState<PaeBounds | null>(null)
  const [hover, setHover] = useState<Cell | null>(null)
  const [drag, setDrag] = useState<Cell | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const query = useQuery({
    queryKey: ["alphafold3-pae", ownerId, jobId, prediction.prediction_id, bounds],
    queryFn: ({ signal }) => alphaFold3Pae(jobId, bounds, signal),
    enabled: !prediction.pae_error,
    placeholderData: keepPreviousData,
    staleTime: Infinity, gcTime: 0, retry: false,
  })
  useExpireSession(query.error)
  const data = query.data?.prediction_id === prediction.prediction_id ? query.data : undefined

  useEffect(() => {
    const context = canvas.current?.getContext("2d")
    if (!data || !context) return
    const pixels = context.createImageData(data.x_edges.length - 1, data.y_edges.length - 1)
    for (let y = 0; y < data.values.length; y++) {
      for (let x = 0; x < data.values[y].length; x++) {
        const offset = (y * pixels.width + x) * 4
        pixels.data.set([...paeColor(data.values[y][x]), 255], offset)
      }
    }
    context.putImageData(pixels, 0, 0)
  }, [data])

  function cellAt(event: PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    return paeCellAt(event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height, data!)
  }
  function zoom(next: PaeBounds | null) { setHover(null); setDrag(null); setBounds(next) }
  function describeToken(token: number) {
    const chain = prediction.token_chain_ids[token]
    const index = prediction.token_res_ids[token]
    const annotation = residue(chain, index)
    return `Token ${token + 1}: chain ${chain}, ${annotation?.name ?? "residue name unavailable"} ${index}${annotation?.plddt != null ? ` · residue-mean pLDDT ${annotation.plddt.toFixed(1)}` : " · residue pLDDT unavailable"}`
  }
  const errorCode = prediction.pae_error ?? apiErrorCode(query.error)
  const mismatch = !!query.data && !data
  const tokenCount = prediction.token_chain_ids.length

  return <section className="space-y-4" aria-labelledby="af3-pae-title">
    <div className="flex items-center justify-between gap-4"><h3 className="font-heading text-xl font-semibold" id="af3-pae-title">Predicted aligned error (PAE)</h3><Button disabled={!bounds} onClick={() => zoom(null)} variant="outline">Reset zoom</Button></div>
    <p className="text-muted-foreground">Lower PAE means greater confidence in relative positions. X is the scored token; Y is the token used for alignment. Drag a rectangle to zoom. Hover for values; arrow keys move the focused cell.</p>
    {errorCode || query.error || mismatch ? <p className="rounded-lg bg-muted p-4" role="alert">{errorCode === "pae_too_large" || errorCode === "preview_too_large" ? "This prediction is too large for the PAE preview." : "PAE preview is unavailable for this prediction."} The structure and native result download remain available.</p> : null}
    {query.isPending && !prediction.pae_error ? <p role="status">Loading PAE…</p> : null}
    {data ? <>
      <p className="font-medium">{data.aggregation === "mean" ? "Block mean PAE · reduced-resolution overview" : "Exact PAE"}</p>
      {data.aggregation === "mean" ? <p className="text-muted-foreground">Each cell averages available values in its token ranges and excludes missing values. This can smooth isolated high errors. Zoom in for exact values.</p> : null}
      <div className="max-w-3xl">
        <p className="mb-2 text-sm">Y: aligned/frame tokens {data.y_edges[0] + 1}–{data.y_edges.at(-1)}</p>
        <div className="relative aspect-square" aria-busy={query.isFetching}>
          <canvas ref={canvas} width={data.x_edges.length - 1} height={data.y_edges.length - 1} className="h-full w-full touch-none border [image-rendering:pixelated]" tabIndex={0} aria-label="PAE matrix, columns scored tokens, rows aligned tokens"
            onPointerDown={(event) => { if (event.button !== 0 || query.isPlaceholderData) return; event.currentTarget.setPointerCapture(event.pointerId); const cell = cellAt(event); setDrag(cell); setHover(cell) }}
            onPointerMove={(event) => { if (!query.isPlaceholderData) setHover(cellAt(event)) }}
            onPointerLeave={() => { if (!drag) setHover(null) }}
            onPointerCancel={() => setDrag(null)}
            onPointerUp={(event) => { if (!drag) return; const end = cellAt(event); event.currentTarget.releasePointerCapture(event.pointerId); if (drag.x !== end.x || drag.y !== end.y || data.aggregation === "mean") zoom(paeZoomBounds(data, drag, end)); else setDrag(null) }}
            onKeyDown={(event) => { if (query.isPlaceholderData) return; const current = hover ?? { x: 0, y: 0 }; if (event.key === "Escape") { setDrag(null); setHover(null); return } if (!event.key.startsWith("Arrow")) return; event.preventDefault(); setHover({ x: Math.max(0, Math.min(data.x_edges.length - 2, current.x + (event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0))), y: Math.max(0, Math.min(data.y_edges.length - 2, current.y + (event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0))) }) }} />
          {query.isPlaceholderData ? <div className="absolute inset-0 grid place-items-center bg-background/60" role="status">Loading PAE window…</div> : null}
          {drag && hover ? <div className="pointer-events-none absolute border-2 border-sky-600 bg-sky-400/20" style={{ left: `${Math.min(drag.x, hover.x) / (data.x_edges.length - 1) * 100}%`, top: `${Math.min(drag.y, hover.y) / (data.y_edges.length - 1) * 100}%`, width: `${(Math.abs(drag.x - hover.x) + 1) / (data.x_edges.length - 1) * 100}%`, height: `${(Math.abs(drag.y - hover.y) + 1) / (data.y_edges.length - 1) * 100}%` }} /> : null}
          {hover && !drag ? <div role="tooltip" className="pointer-events-none absolute left-3 right-3 bottom-3 space-y-1 rounded-lg border bg-background/95 p-3 text-sm shadow-md">
            {data.aggregation === "exact" ? <><p>X scored — {describeToken(data.x_edges[hover.x])}</p><p>Y aligned — {describeToken(data.y_edges[hover.y])}</p></> : <><p>X scored tokens {data.x_edges[hover.x] + 1}–{data.x_edges[hover.x + 1]}</p><p>Y aligned tokens {data.y_edges[hover.y] + 1}–{data.y_edges[hover.y + 1]}</p></>}
            <p className="font-medium">{data.aggregation === "mean" ? "Block mean PAE" : "PAE of X when aligned on Y"}: {data.values[hover.y][hover.x] === null ? "Unavailable" : `${data.values[hover.y][hover.x]!.toFixed(data.aggregation === "exact" ? 1 : 3)} Å`}</p>
            <p>{data.valid_counts[hover.y][hover.x]} available / {(data.x_edges[hover.x + 1] - data.x_edges[hover.x]) * (data.y_edges[hover.y + 1] - data.y_edges[hover.y])} values; missing values excluded.</p>
          </div> : null}
        </div>
        <p className="mt-2 text-right text-sm">X: scored tokens {data.x_edges[0] + 1}–{data.x_edges.at(-1)}</p>
        <div className="mt-3 flex items-center gap-3 text-sm"><span>0 Å</span><div className="h-3 w-48 rounded" style={{ background: "linear-gradient(to right, rgb(20,85,55), white)" }} /><span>32 Å</span><span className="ml-3 inline-block size-3 bg-[#e0e0e0]" />Missing</div>
      </div>
      <details><summary className="cursor-pointer font-medium">Zoom to a token range</summary><form className="mt-3 flex flex-wrap items-end gap-3" key={JSON.stringify(bounds)} onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const next = { x_start: Number(form.get("x_start")) - 1, x_end: Number(form.get("x_end")), y_start: Number(form.get("y_start")) - 1, y_end: Number(form.get("y_end")) }; if (next.x_start < next.x_end && next.y_start < next.y_end) zoom(next) }}>
        {(["x_start", "x_end", "y_start", "y_end"] as const).map((name) => <label className="text-sm" key={name}>{name.startsWith("x") ? "X scored" : "Y aligned"} {name.endsWith("start") ? "first" : "last"}<input className="mt-1 block w-28 rounded border bg-background px-2 py-1" name={name} type="number" min={1} max={tokenCount} required defaultValue={name.endsWith("start") ? (bounds?.[name] ?? 0) + 1 : bounds?.[name] ?? tokenCount} /></label>)}
        <Button type="submit" variant="outline">Zoom</Button>
      </form></details>
    </> : null}
  </section>
}
