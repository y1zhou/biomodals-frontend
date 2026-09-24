import { Plus, Trash2 } from "lucide-react"
import { parsePolymerRecords, type AlphaFold3Entity } from "@/alphafold3"
import { commonPtms, glycanPresets, type BondEndpoint, type CovalentBond } from "@/alphafold3-chemistry"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { randomUUID } from "@/lib/uuid"

const selectClass = "h-10 rounded-lg border bg-background px-3"

export function ProteinChemistryEditor({ entity, onChange }: { entity: AlphaFold3Entity; onChange: (entity: AlphaFold3Entity) => void }) {
  const modifications = entity.modifications ?? []
  const glycans = entity.glycans ?? []
  if (entity.type !== "protein" && !modifications.length && !glycans.length) return null
  let sequence = ""
  try { const records = parsePolymerRecords(entity.sequence); if (records.length === 1) sequence = records[0].sequence } catch { /* The sequence editor supplies validation feedback. */ }
  const context = (position: number) => sequence && Number.isInteger(position) && position > 0 && position <= sequence.length
    ? `${sequence.slice(Math.max(0, position - 6), position - 1)}[${sequence[position - 1]}]${sequence.slice(position, position + 5)} · input position ${position}`
    : "Choose a position within a single protein sequence."
  return <details className="mt-4 rounded-lg border bg-background p-4" open={entity.chemistryNeedsReview || undefined}>
    <summary className="cursor-pointer font-medium">Protein modifications and glycans</summary>
    <div className="mt-4 space-y-4">
      <p className="leading-7 text-muted-foreground">Positions are one-based in the supplied sequence. These sites apply to every copy ({entity.chainIds.join(", ")}); use separate entities for asymmetric chemistry. Glycan occupancy is your explicit choice.</p>
      {entity.type !== "protein" ? <p role="alert" className="text-destructive">These annotations require a protein. Change the entity type back or remove them.</p> : null}
      {modifications.map((site, index) => <fieldset className="rounded-lg border p-3" key={site.id}>
        <legend className="px-1 font-medium">PTM {index + 1}</legend>
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1">Input position<Input min={1} max={sequence.length || undefined} type="number" value={site.position || ""} onChange={(event) => onChange({ ...entity, modifications: modifications.map((item) => item.id === site.id ? { ...item, position: Number(event.target.value) } : item) })} /></label>
          <label className="grid gap-1">CCD component<Input list={`ptm-components-${entity.id}`} value={site.ccd} placeholder="SEP" onChange={(event) => onChange({ ...entity, modifications: modifications.map((item) => item.id === site.id ? { ...item, ccd: event.target.value } : item) })} /></label>
          <Button aria-label={`Remove PTM ${index + 1}`} variant="ghost" type="button" onClick={() => onChange({ ...entity, modifications: modifications.filter((item) => item.id !== site.id) })}><Trash2 /></Button>
        </div>
        <p className="mt-2 font-mono text-sm">{context(site.position)}</p>
      </fieldset>)}
      <datalist id={`ptm-components-${entity.id}`}>{commonPtms.map((ccd) => <option value={ccd} key={ccd} />)}</datalist>
      {glycans.map((site, index) => <fieldset className="rounded-lg border p-3" key={site.id}>
        <legend className="px-1 font-medium">N-linked glycan {index + 1}</legend>
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1">Asn input position<Input min={1} max={sequence.length || undefined} type="number" value={site.position || ""} onChange={(event) => onChange({ ...entity, glycans: glycans.map((item) => item.id === site.id ? { ...item, position: Number(event.target.value) } : item) })} /></label>
          <label className="grid gap-1">Glycan preset<select className={selectClass} value={site.preset} onChange={(event) => onChange({ ...entity, glycans: glycans.map((item) => item.id === site.id ? { ...item, preset: event.target.value as "nag" | "core" } : item) })}>{Object.entries(glycanPresets).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <Button aria-label={`Remove glycan ${index + 1}`} variant="ghost" type="button" onClick={() => onChange({ ...entity, glycans: glycans.filter((item) => item.id !== site.id) })}><Trash2 /></Button>
        </div>
        <p className="mt-2 font-mono text-sm">{context(site.position)}</p>
      </fieldset>)}
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" type="button" onClick={() => onChange({ ...entity, modifications: [...modifications, { id: randomUUID(), position: 0, ccd: "SEP" }] })}><Plus />Add PTM</Button>
        <Button variant="outline" type="button" onClick={() => onChange({ ...entity, glycans: [...glycans, { id: randomUUID(), position: 0, preset: "nag" }] })}><Plus />Add N-linked glycan</Button>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">Common PTMs: SEP (phosphoserine), TPO (phosphothreonine), PTR (phosphotyrosine), ALY/MLZ/MLY/M3L (modified lysines), HYP (hydroxyproline). You can enter another CCD code; Continue checks its native component definition.</p>
      {entity.chemistryNeedsReview ? <div role="status" className="space-y-3 rounded-lg border border-amber-300 p-3"><p>The sequence or copies changed. Check all positions and components before continuing.</p><Button variant="outline" type="button" onClick={() => onChange({ ...entity, chemistryNeedsReview: false })}>I reviewed these sites</Button></div> : null}
    </div>
  </details>
}

export function CovalentBondEditor({ entities, bonds, needsReview, onChange }: { entities: AlphaFold3Entity[]; bonds: CovalentBond[]; needsReview: boolean; onChange: (bonds: CovalentBond[], needsReview: boolean) => void }) {
  const choices = entities.flatMap((entity, index) => (entity.copyIds ?? []).map((copyId, copy) => ({ copyId, entityId: entity.id, label: `${entity.chainIds[copy]} · ${entity.type} entity ${index + 1}, copy ${copy + 1}${entity.type === "ligand" && entity.ligandFormat === "smiles" ? " (SMILES: unsupported)" : ""}` })))
  const blank = (): BondEndpoint => ({ entityId: "", copyId: "", position: 0, atom: "" })
  return <details className="rounded-xl border bg-card p-6" open={needsReview || undefined}>
    <summary className="cursor-pointer font-semibold">Advanced covalent bonds</summary>
    <div className="mt-4 space-y-4">
      <p className="leading-7 text-muted-foreground">Connect a CCD ligand to a polymer or another CCD ligand using exact atom names. Residue/component positions are one-based. SMILES endpoints and polymer–polymer bonds, including disulfide constraints, are unsupported. Custom chemistry belongs in Expert JSON with inline userCCD.</p>
      {bonds.map((bond, index) => <fieldset key={bond.id} className="space-y-3 rounded-lg border p-4">
        <legend className="px-1 font-medium">Bond {index + 1}</legend>
        {bond.ends.map((end, side) => <div key={side} className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1">Endpoint {side + 1} chain<select className={selectClass} value={end.copyId} onChange={(event) => { const chosen = choices.find((choice) => choice.copyId === event.target.value); onChange(bonds.map((item) => item.id === bond.id ? { ...item, ends: item.ends.map((value, endpoint) => endpoint === side ? { ...value, copyId: chosen?.copyId ?? "", entityId: chosen?.entityId ?? "" } : value) as [BondEndpoint, BondEndpoint] } : item), needsReview) }}>
            <option value="">Choose chain</option>{end.copyId && !choices.some((choice) => choice.copyId === end.copyId) ? <option value={end.copyId}>Removed copy — choose again</option> : null}{choices.map((choice) => <option value={choice.copyId} key={choice.copyId}>{choice.label}</option>)}
          </select></label>
          <label className="grid gap-1">Endpoint {side + 1} position<Input type="number" min={1} value={end.position || ""} onChange={(event) => onChange(bonds.map((item) => item.id === bond.id ? { ...item, ends: item.ends.map((value, endpoint) => endpoint === side ? { ...value, position: Number(event.target.value) } : value) as [BondEndpoint, BondEndpoint] } : item), needsReview)} /></label>
          <label className="grid gap-1">Endpoint {side + 1} atom<Input value={end.atom} placeholder={side ? "C1" : "ND2"} onChange={(event) => onChange(bonds.map((item) => item.id === bond.id ? { ...item, ends: item.ends.map((value, endpoint) => endpoint === side ? { ...value, atom: event.target.value } : value) as [BondEndpoint, BondEndpoint] } : item), needsReview)} /></label>
        </div>)}
        <Button variant="ghost" type="button" onClick={() => onChange(bonds.filter((item) => item.id !== bond.id), needsReview)}><Trash2 />Remove bond {index + 1}</Button>
      </fieldset>)}
      <Button variant="outline" type="button" onClick={() => onChange([...bonds, { id: randomUUID(), ends: [blank(), blank()] }], needsReview)}><Plus />Add covalent bond</Button>
      {needsReview && bonds.length ? <div role="status" className="space-y-3 rounded-lg border border-amber-300 p-3"><p>Bonded entities changed. Check all endpoints, positions and atom names; missing copies must be selected again.</p><Button type="button" variant="outline" onClick={() => onChange(bonds, false)}>I reviewed these bonds</Button></div> : null}
    </div>
  </details>
}
