// Browser-only selection identity. Scientific scores belong to the original
// pair and deliberately do not travel with newly combined chains.
export type ChainRole = "vh" | "vl"
export interface SelectedChain {
  parentId: string
  role: ChainRole
  sequence: string
  candidateIds: readonly string[]
}

export interface SelectedEntry {
  id: string
  parentId: string
  vh?: string
  vl?: string
  vhOrigins: readonly string[]
  vlOrigins: readonly string[]
}

export function sameChain(a: Pick<SelectedChain, "parentId" | "role" | "sequence">, b: Pick<SelectedChain, "parentId" | "role" | "sequence">) {
  return a.parentId === b.parentId && a.role === b.role && a.sequence === b.sequence
}

export function selectChain(current: readonly SelectedChain[], chain: SelectedChain, selected: boolean): SelectedChain[] {
  const existing = current.find((item) => sameChain(item, chain))
  if (!selected) return current.filter((item) => !sameChain(item, chain))
  if (!existing) return [...current, { ...chain, candidateIds: [...new Set(chain.candidateIds)] }]
  return current.map((item) => item === existing ? { ...item, candidateIds: [...new Set([...item.candidateIds, ...chain.candidateIds])] } : item)
}

export function selectedParents(selection: readonly SelectedChain[]) {
  const parents = new Map<string, { parentId: string; vh: SelectedChain[]; vl: SelectedChain[] }>()
  for (const chain of selection) {
    let parent = parents.get(chain.parentId)
    if (!parent) { parent = { parentId: chain.parentId, vh: [], vl: [] }; parents.set(chain.parentId, parent) }
    parent[chain.role].push(chain)
  }
  return [...parents.values()].map((parent) => ({
    ...parent,
    pairs: parent.vh.length * parent.vl.length,
    singles: parent.vh.length && parent.vl.length ? 0 : parent.vh.length + parent.vl.length,
  }))
}

export function selectionCounts(selection: readonly SelectedChain[]) {
  return selectedParents(selection).reduce((total, parent) => ({ pairs: total.pairs + parent.pairs, singles: total.singles + parent.singles }), { pairs: 0, singles: 0 })
}

export function selectedEntries(selection: readonly SelectedChain[], maxEntries: number): SelectedEntry[] {
  const parents = selectedParents(selection)
  const count = parents.reduce((total, parent) => total + parent.pairs + parent.singles, 0)
  // Bound the Cartesian product before allocating any output entries.
  if (count > maxEntries) throw new Error(`Selection produces ${count} entries; the limit is ${maxEntries}. Remove selected chains before analyzing.`)
  const entries: SelectedEntry[] = []
  function add(parentId: string, vh?: SelectedChain, vl?: SelectedChain) {
    entries.push({ id: `selected_${String(entries.length + 1).padStart(4, "0")}`, parentId,
      vh: vh?.sequence, vl: vl?.sequence, vhOrigins: vh?.candidateIds ?? [], vlOrigins: vl?.candidateIds ?? [] })
  }
  for (const parent of parents) {
    if (parent.vh.length && parent.vl.length) {
      for (const vh of parent.vh) for (const vl of parent.vl) add(parent.parentId, vh, vl)
    } else {
      for (const vh of parent.vh) add(parent.parentId, vh)
      for (const vl of parent.vl) add(parent.parentId, undefined, vl)
    }
  }
  return entries
}

export function selectedFasta(entries: readonly SelectedEntry[]) {
  return entries.map((entry) => `>${entry.id}\n${entry.vh && entry.vl ? `${entry.vh}:${entry.vl}` : entry.vh ?? entry.vl}`).join("\n")
}
