import { useQuery } from "@tanstack/react-query"
import { LoaderCircle, X } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"
import { antibodyAnalysisOptions, antibodySequenceDetail } from "@/api/client"
import type { SequenceDetail, SequenceRequest } from "@/antibody-analysis"
import { authenticatedPrincipal, useCurrentUser, useExpireSession } from "@/auth-state"
import { Button } from "@/components/ui/button"

const schemeLabels = { imgt: "IMGT", kabat: "Kabat", chothia: "Chothia", martin: "Martin", aho: "AHo" }
const liabilityLabels: Record<string, string> = {
  methionine: "Methionine oxidation motif", n_glycosylation: "Potential N-glycosylation motif",
  asn_deamidation: "Potential asparagine deamidation", asp_isomerization: "Potential aspartate isomerization",
  acid_cleavage: "Potential acid cleavage", n_terminal_glutamine: "N-terminal glutamine",
  odd_cysteine_count: "Odd cysteine count", hydrophobic_patch: "Hydrophobic patch",
}
const regionColors: Record<string, string> = { CDR1: "bg-sky-100 text-sky-950", CDR2: "bg-violet-100 text-violet-950", CDR3: "bg-amber-100 text-amber-950" }

function NumberedSequence({ data }: { data: SequenceDetail }) {
  const [hover, setHover] = useState<number | null>(null)
  const selected = hover === null ? null : data.residues.find((residue) => residue.input_index === hover)
  const liabilities = hover === null ? [] : data.liabilities.filter((item) => item.start <= hover && hover < item.end)
  function residues(indices: readonly { input_index: number; label?: string; region?: string }[]) {
    return <div className="flex flex-wrap gap-x-0.5 gap-y-3 font-mono">{indices.map(({ input_index: index, label, region }) => {
      const matches = data.liabilities.filter((item) => item.start <= index && index < item.end)
      const description = `${data.sequence[index]}, input residue ${index + 1}${label ? `, position ${label}, ${region}` : ", unnumbered"}${matches.length ? `; ${matches.map((item) => liabilityLabels[item.kind] ?? item.kind).join("; ")}` : ""}`
      return <span key={index} tabIndex={0} title={description} aria-label={description} onFocus={() => setHover(index)} onMouseEnter={() => setHover(index)} className={`inline-flex min-w-8 flex-col items-center rounded px-0.5 py-1 outline-offset-2 ${regionColors[region?.toUpperCase() ?? ""] ?? "bg-muted/40"} ${matches.length ? "border-b-2 border-rose-500" : "border-b-2 border-transparent"}`}>
        <span className="h-4 text-[10px] text-current/70">{label ?? "·"}</span><span className="text-lg">{data.sequence[index]}</span>
      </span>
    })}</div>
  }
  const span = data.domain_span
  const tail = (start: number, end: number) => Array.from({ length: end - start }, (_, i) => ({ input_index: start + i }))
  return <div className="space-y-5">
    <div className="flex flex-wrap gap-3 text-sm">{Object.entries(regionColors).map(([label, color]) => <span className={`rounded px-2 py-1 ${color}`} key={label}>{label}</span>)}<span className="border-b-2 border-rose-500 px-2 py-1">Potential liability motif</span></div>
    <p className="text-sm leading-6 text-muted-foreground">Positions follow {schemeLabels[data.scheme]} with its matching CDR convention. This display does not change stored IMGT mutation scores or model position settings. Underlines mark potential sequence liabilities, not measured experimental risk.</p>
    <div role="status" className="min-h-14 rounded-lg bg-muted/40 px-3 py-2 text-sm leading-6">
      {hover === null ? "Hover or focus a residue to inspect its original position and potential liabilities." : <><strong>Input residue {hover + 1}: {data.sequence[hover]}</strong>{selected ? ` · ${selected.region} · ${schemeLabels[data.scheme]} ${selected.label}` : " · Unnumbered"}<br />{liabilities.length ? liabilities.map((item) => liabilityLabels[item.kind] ?? item.kind).join("; ") : "No annotated liability motif at this position."}</>}
    </div>
    {span ? <>
      {span[0] > 0 ? <section><h3 className="mb-2 font-medium">Unnumbered prefix</h3>{residues(tail(0, span[0]))}</section> : null}
      <section><h3 className="mb-2 font-medium">Numbered domain · {data.chain_type ?? "unassigned"}</h3>{residues(data.residues)}</section>
      {span[1] < data.sequence.length ? <section><h3 className="mb-2 font-medium">Unnumbered suffix</h3>{residues(tail(span[1], data.sequence.length))}</section> : null}
    </> : <section><h3 className="mb-2 font-medium">Unnumbered input</h3>{residues(tail(0, data.sequence.length))}</section>}
    {data.error ? <p role="status" className="rounded-lg bg-muted p-3 leading-6">{data.error}</p> : null}
    {data.diagnostics.map((text, index) => <p key={index} className="text-sm leading-6 text-muted-foreground">{text}</p>)}
  </div>
}

export default function AntibodySequenceDialog({ sequence, label, onClose }: { sequence: string; label: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const principal = authenticatedPrincipal(useCurrentUser().data)
  const [scheme, setScheme] = useState<SequenceRequest["scheme"]>("imgt")
  const options = useQuery({ queryKey: ["antibody-analysis-options"], queryFn: ({ signal }) => antibodyAnalysisOptions(signal), enabled: !!principal, staleTime: Infinity, retry: false })
  const query = useQuery({
    queryKey: ["antibody-sequence", principal?.user_id, sequence, scheme],
    queryFn: ({ signal }) => antibodySequenceDetail({ sequence, scheme }, signal),
    enabled: !!principal, retry: false, gcTime: 0, staleTime: Infinity,
    refetchOnWindowFocus: false, refetchOnReconnect: false,
  })
  useExpireSession(options.error ?? query.error)
  useEffect(() => {
    const element = dialog.current
    const opener = document.activeElement
    element?.showModal()
    return () => {
      element?.close()
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [])
  return <dialog aria-labelledby={titleId} ref={dialog} onCancel={(event) => { event.preventDefault(); onClose() }} className="m-auto max-h-[90svh] w-[min(76rem,calc(100%-2rem))] overflow-y-auto rounded-xl border bg-background p-6 text-foreground shadow-xl backdrop:bg-foreground/30">
    <div className="mb-5 flex items-start justify-between gap-4"><div><h2 id={titleId} className="text-2xl font-semibold">{label}</h2><p className="mt-2 text-muted-foreground">{sequence.length} residues · Full input retained</p></div><Button aria-label="Close sequence details" variant="ghost" size="icon" onClick={onClose}><X /></Button></div>
    <label className="mb-5 flex items-center gap-3 font-medium">Numbering scheme<select className="h-10 rounded-lg border bg-background px-3" value={scheme} onChange={(event) => setScheme(event.target.value as SequenceRequest["scheme"])}>{(options.data?.schemes ?? ["imgt"]).map((value) => <option value={value} key={value}>{schemeLabels[value]}</option>)}</select></label>
    {query.isFetching ? <p role="status" className="flex gap-2 py-8"><LoaderCircle aria-hidden="true" className="animate-spin" />Numbering this sequence…</p> : query.error ? <div role="alert"><p>Sequence details could not be loaded. {query.error.message}</p><Button className="mt-3" disabled={!principal} variant="outline" onClick={() => void query.refetch()}>Try again</Button></div> : query.data ? <NumberedSequence key={scheme} data={query.data} /> : null}
  </dialog>
}
