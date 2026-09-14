import { Bond, StructureElement, Unit, type Model } from "molstar/lib/mol-model/structure"
import { ColorTheme } from "molstar/lib/mol-theme/color"
import { ElementSymbolColorTheme, ElementSymbolColorThemeProvider } from "molstar/lib/mol-theme/color/element-symbol"
import { Color } from "molstar/lib/mol-util/color"
import type { ThemeDataContext } from "molstar/lib/mol-theme/theme"

export interface AlphaFold3Residue {
  name: string
  plddt: number | null
}

const residueMeans = new WeakMap<Model, Array<number | null>>()

function meansForModel(model: Model) {
  let means = residueMeans.get(model)
  if (means) return means
  const { offsets, count } = model.atomicHierarchy.residueAtomSegments
  const scores = model.atomicConformation.B_iso_or_equiv
  means = Array.from({ length: count }, (_, residue) => {
    let sum = 0
    let count = 0
    for (let atom = offsets[residue]; atom < offsets[residue + 1]; atom++) {
      const score = scores.value(atom)
      if (scores.valueKind(atom) === 0 && Number.isFinite(score)) { sum += score; count++ }
    }
    return count ? sum / count : null
  })
  residueMeans.set(model, means)
  return means
}

/** AF3 token IDs use label chains but auth residue indices, including ligands. */
export function findAlphaFold3Residue(model: Model, chainId: string, residueId: number): AlphaFold3Residue | undefined {
  const hierarchy = model.atomicHierarchy
  const chains = hierarchy.chains
  for (let chain = 0; chain < chains._rowCount; chain++) {
    if (chains.label_asym_id.value(chain) !== chainId) continue
    const residue = hierarchy.index.findResidue({
      label_entity_id: chains.label_entity_id.value(chain),
      label_asym_id: chainId,
      auth_seq_id: residueId,
      pdbx_PDB_ins_code: "",
    })
    if (residue < 0) return undefined
    const atom = hierarchy.residueAtomSegments.offsets[residue]
    return { name: hierarchy.atoms.label_comp_id.value(atom), plddt: meansForModel(model)[residue] }
  }
  return undefined
}

export function plddtColor(value: number | null) {
  return Color(value === null || value < 0 ? 0x999999 : value > 90 ? 0x0053d6 : value > 70 ? 0x65cbf3 : value > 50 ? 0xffdb13 : 0xff7d45)
}

function confidenceTheme(ctx: ThemeDataContext, props: Record<string, never>): ColorTheme<Record<string, never>> {
  const elementTheme = ElementSymbolColorTheme(ctx, {
    ...ElementSymbolColorThemeProvider.defaultValues,
    carbonColor: { name: "element-symbol", params: {} },
  })
  return {
    factory: confidenceTheme, props, granularity: "group",
    color(location, secondary) {
      const unit = StructureElement.Location.is(location) ? location.unit : Bond.isLocation(location) ? location.aUnit : undefined
      const atom = StructureElement.Location.is(location) ? location.element : Bond.isLocation(location) ? location.aUnit.elements[location.aIndex] : undefined
      if (!unit || atom === undefined || !Unit.isAtomic(unit)) return Color(0x999999)
      const hierarchy = unit.model.atomicHierarchy
      const entity = hierarchy.index.getEntityFromChain(hierarchy.chainAtomSegments.index[atom])
      if (unit.model.entities.data.type.value(entity) !== "polymer") return elementTheme.color(location, secondary)
      return plddtColor(meansForModel(unit.model)[hierarchy.residueAtomSegments.index[atom]])
    },
    description: "Polymer residue-mean pLDDT from AF3 CIF atom scores; nonpolymers use element colors.",
  }
}

export const alphaFold3ConfidenceTheme: ColorTheme.Provider<Record<string, never>, "af3-residue-confidence"> = {
  name: "af3-residue-confidence", label: "AF3 residue pLDDT / ligand element", category: ColorTheme.Category.Validation,
  factory: confidenceTheme, getParams: () => ({}), defaultValues: {}, isApplicable: (ctx) => !!ctx.structure,
}
