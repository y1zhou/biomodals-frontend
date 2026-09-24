import type { AlphaFold3Draft, AlphaFold3Entity } from "./alphafold3"

export interface ProteinModification { id: string; position: number; ccd: string }
export interface GlycanAttachment { id: string; position: number; preset: "nag" | "core" }
export interface BondEndpoint { entityId: string; copyId: string; position: number; atom: string }
export interface CovalentBond { id: string; ends: [BondEndpoint, BondEndpoint] }
type NativeAtom = [string, number, string]
type NativeBond = [NativeAtom, NativeAtom]

export const commonPtms = ["SEP", "TPO", "PTR", "ALY", "MLZ", "MLY", "M3L", "HYP"] as const
export const glycanPresets = { nag: "Single NAG", core: "NAG2Man3 core" }

export function proteinModifications(entity: AlphaFold3Entity, sequence: string) {
  const modifications = entity.modifications ?? []
  const glycans = entity.glycans ?? []
  if (!modifications.length && !glycans.length) return {}
  if (entity.type !== "protein") throw new Error("Protein modifications and glycans require a protein entity. Remove or repair its annotations.")
  if (entity.chemistryNeedsReview) throw new Error("Review protein modifications and glycan sites after changing the sequence or copies.")
  const positions = new Set<number>()
  for (const site of [...modifications, ...glycans]) {
    if (!Number.isInteger(site.position) || site.position < 1 || site.position > sequence.length) throw new Error("Protein annotation positions must be one-based positions within the sequence.")
    if (positions.has(site.position)) throw new Error("Use only one protein modification or glycan attachment at each position.")
    positions.add(site.position)
  }
  for (const glycan of glycans) {
    if (!(glycan.preset in glycanPresets)) throw new Error("Choose a supported glycan preset.")
    if (sequence[glycan.position - 1] !== "N") throw new Error("N-linked glycan attachments require an Asn (N) residue.")
  }
  if (modifications.some((modification) => !modification.ccd.trim())) throw new Error("Enter a CCD component for each protein modification.")
  return modifications.length ? { modifications: modifications.map(({ ccd, position }) => ({ ptmType: ccd.trim().toUpperCase(), ptmPosition: position })) } : {}
}

export function regularChemistry(draft: AlphaFold3Draft, copies: ReadonlyMap<string, string>, nextChain: () => string) {
  const ligands: object[] = []
  const bonds: NativeBond[] = []
  const entities = new Map(draft.entities.map((entity) => [entity.id, entity]))
  if (draft.bonds?.length && draft.bondsNeedReview) throw new Error("Review covalent bond endpoints after editing their entities.")
  function endpoint(end: BondEndpoint): NativeAtom {
    const entity = entities.get(end.entityId)
    const chain = copies.get(end.copyId)
    if (!entity || !entity.copyIds?.includes(end.copyId) || !chain) throw new Error("A covalent bond refers to a removed entity or copy. Choose its endpoint again or remove the bond.")
    if (entity.type === "ligand" && entity.ligandFormat === "smiles") throw new Error("SMILES ligands cannot be covalent bond endpoints. Use CCD components or Expert JSON with inline userCCD.")
    const length = entity.type === "ligand" ? entity.sequence.trim().split(/[\s,]+/).length : entity.sequence.replace(/\s/g, "").length
    if (!Number.isInteger(end.position) || end.position < 1 || end.position > length) throw new Error("Bond positions must be one-based residue/component positions within their entity.")
    if (!end.atom.trim()) throw new Error("Enter a CCD atom name for each bond endpoint.")
    return [chain, end.position, end.atom.trim()]
  }
  for (const bond of draft.bonds ?? []) {
    const ends: NativeBond = [endpoint(bond.ends[0]), endpoint(bond.ends[1])]
    if (bond.ends.every((end) => entities.get(end.entityId)?.type !== "ligand")) throw new Error("Polymer–polymer bonds, including disulfide constraints, are not supported.")
    bonds.push(ends)
  }
  for (const entity of draft.entities) {
    for (const site of entity.glycans ?? []) {
      for (const copy of entity.copyIds ?? []) {
        const parent = copies.get(copy)
        if (!parent) throw new Error("The glycan parent copy is unavailable. Review the entity.")
        const id = nextChain()
        ligands.push({ ligand: { id, ccdCodes: site.preset === "nag" ? ["NAG"] : ["NAG", "NAG", "BMA", "MAN", "MAN"] } })
        bonds.push([[parent, site.position, "ND2"], [id, 1, "C1"]])
        if (site.preset === "core") bonds.push([[id, 1, "O4"], [id, 2, "C1"]], [[id, 2, "O4"], [id, 3, "C1"]], [[id, 3, "O3"], [id, 4, "C1"]], [[id, 3, "O6"], [id, 5, "C1"]])
      }
    }
  }
  const seen = new Set<string>()
  for (const bond of bonds) {
    const ends = bond.map((end) => JSON.stringify(end)).sort()
    if (ends[0] === ends[1]) throw new Error("A covalent bond cannot connect an atom to itself.")
    const key = JSON.stringify(ends)
    if (seen.has(key)) throw new Error("Remove duplicate covalent bonds.")
    seen.add(key)
  }
  return { ligands, bonds }
}
