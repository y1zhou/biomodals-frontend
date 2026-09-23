import { useQuery } from "@tanstack/react-query"
import { Check, Copy, LoaderCircle, X } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"
import { antibodyAnalysisOptions, antibodySequenceDetail } from "@/api/client"
import { ANALYSIS_VERSION, type SequenceDetail, type SequenceRequest } from "@/antibody-analysis"
import { authenticatedPrincipal, useCurrentUser, useExpireSession } from "@/auth-state"
import { Button } from "@/components/ui/button"
import { copyText } from "@/lib/clipboard"

const schemeLabels = { imgt: "IMGT", kabat: "Kabat", chothia: "Chothia", martin: "Martin", aho: "AHo" }
const liabilityLabels: Record<string, string> = {
  methionine: "Methionine oxidation motif", n_glycosylation: "Potential N-glycosylation motif",
  asn_deamidation: "Potential asparagine deamidation", asp_isomerization: "Potential aspartate isomerization",
  acid_cleavage: "Potential acid cleavage", odd_cysteine_count: "Odd cysteine count",
}
const regionColors: Record<string, string> = { CDR1: "bg-sky-100 text-sky-950", CDR2: "bg-violet-100 text-violet-950", CDR3: "bg-amber-100 text-amber-950" }

function NumberedSequence({ data, highlightHallmarks }: { data: SequenceDetail; highlightHallmarks: boolean }) {
  // Scrolling can trigger pointer entry without movement; keep keyboard details.
  const [hover, setHover] = useState<number | null>(null)
  const positions = new Map(data.residues.map((residue) => [residue.input_index, residue]))
  const selected = hover === null ? null : positions.get(hover)
  const liabilities = hover === null ? [] : data.liabilities.filter((item) => item.start <= hover && hover < item.end)
  const span = data.domain_span
  const unnumbered = (index: number) => span ? index < span[0] ? "Unnumbered prefix" : index >= span[1] ? "Unnumbered suffix" : "Unnumbered" : "Unnumbered"
  function annotation(index: number) {
    const position = positions.get(index)
    const matches = data.liabilities.filter((item) => item.start <= index && index < item.end)
    return {
      label: position?.label,
      description: `${data.sequence[index]}, input residue ${index + 1}${position ? `, position ${position.label}, ${position.region}` : `, ${unnumbered(index).toLowerCase()}`}${matches.length ? `; ${matches.map((item) => liabilityLabels[item.kind] ?? item.kind).join("; ")}` : ""}`,
      colors: `${regionColors[position?.region.toUpperCase() ?? ""] ?? "bg-muted/40"} ${matches.length ? "border-b-2 border-rose-500" : "border-b-2 border-transparent"}`,
    }
  }
  function residues(indices: readonly { input_index: number }[]) {
    return <div className="flex flex-wrap gap-x-0.5 gap-y-3 font-mono">{indices.map(({ input_index: index }) => {
      const info = annotation(index)
      return <span key={index} tabIndex={0} title={info.description} aria-label={info.description} onFocus={() => setHover(index)} onPointerMove={() => setHover(index)} className={`inline-flex min-w-8 flex-col items-center rounded px-0.5 py-1 outline-offset-2 ${info.colors}`}>
        <span className="h-4 text-[10px] text-current/70">{info.label ?? "·"}</span><span className="text-lg">{data.sequence[index]}</span>
      </span>
    })}</div>
  }
  const tail = (start: number, end: number) => Array.from({ length: end - start }, (_, i) => ({ input_index: start + i }))
  const alignment = data.alignment
  const hasParent = alignment?.parental != null
  function differences(values: string, description: string) {
    return <tr className="leading-none"><th scope="row" className="pr-3 text-left font-normal"><span className="sr-only">{description}</span></th>{Array.from(values, (operation, index) => <td key={index} className="whitespace-pre text-center">{operation}</td>)}</tr>
  }
  return <div className="space-y-5">
    <p className="text-sm leading-6 text-muted-foreground">Potential liabilities are checked across the full supplied sequence, including unnumbered tails. Odd cysteine count uses the full sequence, but conserved cysteines at IMGT 23 and 104 are not marked. Underlines flag potential motifs, not measured experimental risk.</p>
    <div role="status" className="min-h-14 rounded-lg bg-muted/40 px-3 py-2 text-sm leading-6">
      {hover === null ? "Hover or focus a residue to inspect its original position and potential liabilities." : <><strong>Input residue {hover + 1}: {data.sequence[hover]}</strong>{selected ? ` · ${selected.region} · ${schemeLabels[data.scheme]} ${selected.label}` : ` · ${unnumbered(hover)}`}<br />{liabilities.length ? liabilities.map((item) => liabilityLabels[item.kind] ?? item.kind).join("; ") : "No annotated liability motif at this position."}</>}
    </div>
    {alignment ? <section aria-label="Sequence alignment" className="space-y-3">
      <h3 className="font-medium">Numbered domain · {data.chain_type ?? "unassigned"}</h3>
      {(hasParent ? [{ label: "Humanized", references: data.germlines }, { label: "Parental", references: data.parental_germlines }] : [{ label: "", references: data.germlines }]).map(({ label, references }) => <div key={label} className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
        {label ? <strong className="font-medium text-foreground">{label} V/J:</strong> : null}
        {references.map((reference) => <p key={reference.segment} title={`Reference IDs: ${reference.reference_ids.join(", ")}`}><strong className="font-medium text-foreground">{reference.segment.toUpperCase()}: </strong>{reference.reference_names.join("; ")}</p>)}
      </div>)}
      {data.parental_germline_error ? <p role="status" className="rounded-lg bg-muted p-3 text-sm leading-6">Parental germline could not be assigned. {data.parental_germline_error} The sequence comparison remains available.</p> : null}
      <div className="overflow-x-auto rounded-lg border p-3" tabIndex={0} aria-label="Sequence alignment; scroll for more residues">
        <table className="w-max border-collapse font-mono text-sm leading-7">
          <caption className="sr-only">{hasParent ? "Humanized and parental sequences with their independently assigned germlines" : "Native germline and input alignment"}</caption>
          <colgroup><col />{alignment.input_indices.map((inputIndex, column) => <col key={column} className={highlightHallmarks && inputIndex !== null && data.imgt_hallmark_indices?.includes(inputIndex) ? "border border-gray-400" : undefined} />)}</colgroup>
          <tbody>
            <tr><th scope="row" className="pr-3 text-left font-normal">{hasParent ? "Germline (humanized)" : "Germline"}</th>{Array.from(alignment.germline, (residue, index) => <td key={index} className="min-w-[1.5ch] whitespace-pre text-center">{residue}</td>)}</tr>
            {differences(alignment.germline_diffs, hasParent ? "Humanized relative to its germline" : "Input relative to its germline")}
            <tr className="font-bold"><th scope="row" className="pr-3 text-left">{hasParent ? "Humanized" : "Input"}</th>{alignment.input_indices.map((inputIndex, column) => {
              if (inputIndex === null) return <td key={column} className="whitespace-pre text-center" title={alignment.input[column] === "-" ? "Input gap" : "No input residue"}>{alignment.input[column]}</td>
              const info = annotation(inputIndex)
              return <td key={column} className="text-center"><span tabIndex={0} title={info.description} aria-label={info.description} onFocus={() => setHover(inputIndex)} onPointerMove={() => setHover(inputIndex)} className={`inline-block w-full rounded outline-offset-2 ${info.colors}`}>{alignment.input[column]}</span></td>
            })}</tr>
            {alignment.parental !== null ? <>
              {differences(alignment.parental_diffs ?? "", "Humanized relative to parental")}
              <tr><th scope="row" className="pr-3 text-left font-normal">Parental</th>{Array.from(alignment.parental, (residue, index) => <td key={index} className="whitespace-pre text-center">{residue}</td>)}</tr>
              {alignment.parental_germline_diffs !== null ? differences(alignment.parental_germline_diffs, "Parental relative to its germline") : null}
              <tr><th scope="row" className="pr-3 text-left font-normal">Germline (parental){alignment.parental_germline === null ? <span className="block text-muted-foreground">Not available</span> : null}</th>{Array.from(alignment.parental_germline ?? " ".repeat(alignment.input.length), (residue, index) => <td key={index} className="whitespace-pre text-center">{residue}</td>)}</tr>
            </> : null}
          </tbody>
        </table>
      </div>
      <details className="text-sm leading-6 text-muted-foreground"><summary className="cursor-pointer">Read sequence alignments</summary><p className="mt-2">{hasParent ? "The three difference strips describe Humanized relative to its germline, Humanized relative to Parental, and Parental relative to its own germline, from top to bottom." : "The difference strip describes Input relative to its germline."} + = insertion; - = deletion; : = positive-BLOSUM62 substitution; x = other mismatch. Blank differences at aligned residues mean exact matches. Unmatched germline junctions and uncovered ends have blank differences without asserting a match or deletion. Reference-only gaps are kept separate; the grid does not assert homology between germlines. Hover or focus {hasParent ? "Humanized" : "Input"} to identify numbered positions and unnumbered tails.</p></details>
    </section> : span ? <>
      {span[0] > 0 ? <section><h3 className="mb-2 font-medium">Unnumbered prefix</h3>{residues(tail(0, span[0]))}</section> : null}
      <section className="space-y-4"><h3 className="font-medium">Numbered domain · {data.chain_type ?? "unassigned"}</h3>{residues(data.residues)}
      </section>
      {span[1] < data.sequence.length ? <section><h3 className="mb-2 font-medium">Unnumbered suffix</h3>{residues(tail(span[1], data.sequence.length))}</section> : null}
    </> : <section><h3 className="mb-2 font-medium">Unnumbered input</h3>{residues(tail(0, data.sequence.length))}</section>}
    {data.error ? <p role="status" className="rounded-lg bg-muted p-3 leading-6">{data.error}</p> : null}
    {data.diagnostics.map((text, index) => <p key={index} className="text-sm leading-6 text-muted-foreground">{text}</p>)}
  </div>
}

export default function AntibodySequenceDialog({ sequence, label, parentalSequence, parentSource = "original", parentLoading = false, parentUnavailable = false, highlightHallmarks = false, onClose }: { sequence: string; label: string; parentalSequence?: string; parentSource?: "original" | "prepared"; parentLoading?: boolean; parentUnavailable?: boolean; highlightHallmarks?: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const principal = authenticatedPrincipal(useCurrentUser().data)
  const [scheme, setScheme] = useState<SequenceRequest["scheme"]>("imgt")
  const [copyStatus, setCopyStatus] = useState("")
  const backdropPressed = useRef(false)
  useEffect(() => {
    if (copyStatus !== "Copied") return
    const timer = window.setTimeout(() => setCopyStatus(""), 2000)
    return () => window.clearTimeout(timer)
  }, [copyStatus])
  function outsideDialog(event: React.PointerEvent<HTMLDialogElement> | React.MouseEvent<HTMLDialogElement>) {
    if (event.target !== event.currentTarget) return false
    const bounds = event.currentTarget.getBoundingClientRect()
    return event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom
  }
  const options = useQuery({ queryKey: ["antibody-analysis-options"], queryFn: ({ signal }) => antibodyAnalysisOptions(signal), enabled: !!principal, staleTime: Infinity, retry: false })
  const compatible = options.data?.analysis_version === ANALYSIS_VERSION
  const query = useQuery({
    queryKey: ["antibody-sequence", principal?.user_id, sequence, scheme, parentalSequence],
    queryFn: ({ signal }) => antibodySequenceDetail({ sequence, scheme, parental_sequence: parentalSequence }, signal),
    enabled: !!principal && compatible && !parentLoading, retry: false, gcTime: 0, staleTime: Infinity,
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
  return <dialog aria-labelledby={titleId} ref={dialog} onPointerDown={(event) => { backdropPressed.current = outsideDialog(event) }} onClick={(event) => { if (backdropPressed.current && outsideDialog(event)) onClose(); backdropPressed.current = false }} onCancel={(event) => { event.preventDefault(); onClose() }} className="m-auto max-h-[90svh] w-[min(76rem,calc(100%-2rem))] overflow-y-auto rounded-xl border bg-background p-6 text-foreground shadow-xl backdrop:bg-foreground/30">
    <div className="mb-5 flex items-start justify-between gap-4"><div><h2 id={titleId} className="text-2xl font-semibold">{label}</h2><p className="mt-2 text-muted-foreground">{sequence.length} residues · Full input retained</p></div><Button aria-label="Close sequence details" variant="ghost" size="icon" onClick={onClose}><X /></Button></div>
    <div className="mb-5 flex flex-wrap items-center gap-4"><label className="flex items-center gap-3 font-medium">Numbering scheme<select className="h-10 rounded-lg border bg-background px-3" value={scheme} onChange={(event) => setScheme(event.target.value as SequenceRequest["scheme"])}>{(options.data?.schemes ?? ["imgt"]).map((value) => <option value={value} key={value}>{schemeLabels[value]}</option>)}</select></label>
      <Button aria-live="polite" variant="outline" disabled={copyStatus === "Copied"} onClick={() => void copyText(sequence).then(() => setCopyStatus("Copied"), () => setCopyStatus("Copy failed. Try again."))}>{copyStatus === "Copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copyStatus === "Copied" ? "Copied" : "Copy sequence"}</Button>
      <div className="flex flex-wrap gap-2 text-sm">{Object.entries(regionColors).map(([label, color]) => <span className={`rounded px-2 py-1 ${color}`} key={label}>{label}</span>)}<span className="border-b-2 border-rose-500 px-2 py-1">Potential liability motif</span></div>
      {highlightHallmarks ? <span className="border border-gray-400 px-2 py-1 text-sm">Gray outlines: IMGT hallmarks 42, 49, 50, 52</span> : null}
      {copyStatus && copyStatus !== "Copied" ? <p role="alert" className="text-sm text-destructive">{copyStatus}</p> : null}
    </div>
    {parentUnavailable ? <p role="status" className="mb-4 rounded-lg bg-muted p-3 text-sm leading-6">Parental comparison is unavailable because the retained parent sequence could not be loaded. Numbering, germline details and full-sequence copy remain available.</p> : null}
    {options.data && !compatible ? <p role="alert">Sequence details require an updated API (analysis version {ANALYSIS_VERSION}). You can still copy the full sequence.</p> : options.error ? <div role="alert"><p>Sequence options could not be loaded. {options.error.message}</p><Button variant="outline" onClick={() => void options.refetch()}>Try again</Button></div> : options.isPending || parentLoading || query.isFetching ? <p role="status" className="flex gap-2 py-8"><LoaderCircle aria-hidden="true" className="animate-spin" />{parentLoading ? `Loading the ${parentSource} parent sequence…` : "Numbering this sequence…"}</p> : query.error ? <div role="alert"><p>Sequence details could not be loaded. {query.error.message}</p><Button className="mt-3" disabled={!principal || !compatible} variant="outline" onClick={() => void query.refetch()}>Try again</Button></div> : query.data ? <NumberedSequence key={scheme} data={query.data} highlightHallmarks={highlightHallmarks} /> : null}
  </dialog>
}
