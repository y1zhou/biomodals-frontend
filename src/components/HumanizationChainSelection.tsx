import { ArrowRight, Trash2 } from "lucide-react"
import { sameChain, selectedParents, selectionCounts, type SelectedChain } from "@/antibody-selection"
import { Button } from "@/components/ui/button"

export function ChainSelectionCell({ chain, selection, onChange, onInspect }: {
  chain: SelectedChain
  selection: readonly SelectedChain[]
  onChange: (chain: SelectedChain, checked: boolean) => void
  onInspect: (sequence: string, label: string) => void
}) {
  const label = `${chain.role.toUpperCase()} from ${chain.candidateIds.join(", ")} (parent ${chain.parentId})`
  return <div className="flex w-64 items-start gap-3">
    <input aria-label={`Select ${label}`} checked={selection.some((selected) => sameChain(selected, chain))} className="mt-1 size-4 shrink-0" onChange={(event) => onChange(chain, event.target.checked)} type="checkbox" />
    <button aria-label={`Inspect ${label}`} className="cursor-pointer break-all text-left font-mono text-xs underline decoration-dotted underline-offset-4 hover:text-primary" onClick={() => onInspect(chain.sequence, label)} type="button">
      {chain.sequence.slice(0, 18)}{chain.sequence.length > 18 ? "…" : ""}
    </button>
  </div>
}

export function ChainSelectionPanel({ selection, maxEntries, onClear, onAnalyze, busy, error, singleDomain = false }: {
  singleDomain?: boolean
  selection: readonly SelectedChain[]
  maxEntries?: number
  onClear: (parentId?: string) => void
  onAnalyze: () => void
  busy: boolean
  error?: string | null
}) {
  const counts = selectionCounts(selection)
  const total = counts.pairs + counts.singles
  const tooMany = maxEntries !== undefined && total > maxEntries
  return <section aria-label="Selected antibody chains" className="space-y-3 rounded-lg border bg-muted/20 p-4">
    <h3 className="text-lg font-semibold">Analyze selected sequences</h3>
    <p className="leading-7 text-muted-foreground">{singleDomain ? "Select individual VH sequences for standalone analysis. Exact duplicates within a parent share selection; different parents remain separate. Selection survives pages and filters." : "Select VH and VL independently. Each parent’s selected heavy and light chains form all combinations; a selection with only one role stays single-chain. Selection survives pages and filters."}</p>
    <p aria-live="polite">{singleDomain ? null : <><strong>{counts.pairs} pairs</strong> and </>}<strong>{counts.singles} single chains</strong>{maxEntries !== undefined ? ` · ${total}/${maxEntries} entries` : ""}</p>
    {selection.length ? <ul className="space-y-2">
      {selectedParents(selection).map((parent) => <li className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" key={parent.parentId}>
        <span className="break-all font-medium">{parent.parentId}</span>
        <span>{singleDomain ? `${parent.vh.length} VH sequences` : `${parent.vh.length} VH · ${parent.vl.length} VL → ${parent.pairs} pairs, ${parent.singles} single chains`}</span>
        <button aria-label={`Clear selections for ${parent.parentId}`} className="cursor-pointer underline underline-offset-4" onClick={() => onClear(parent.parentId)} type="button">Clear</button>
      </li>)}
    </ul> : null}
    <p className="text-sm leading-7 text-muted-foreground">{singleDomain ? "Only sequences and origin details transfer; model scores, ranks and parental comparisons stay on this result page." : "New combinations have no inherited model scores or ranks. Recombination does not establish pairing compatibility."} Analysis stays in memory and creates no Job.</p>
    {tooMany ? <p className="text-destructive" role="alert">This selection exceeds {maxEntries} entries. Remove chains before analyzing.</p> : null}
    {error ? <p className="text-destructive" role="alert">{error}</p> : null}
    <div className="flex flex-wrap gap-3">
      <Button disabled={!total || maxEntries === undefined || tooMany || busy} onClick={onAnalyze} type="button"><ArrowRight aria-hidden="true" />Analyze selected sequences</Button>
      <Button disabled={!selection.length || busy} onClick={() => onClear()} type="button" variant="outline"><Trash2 aria-hidden="true" />Clear selections</Button>
    </div>
  </section>
}
