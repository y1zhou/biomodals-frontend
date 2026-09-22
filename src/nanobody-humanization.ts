import type { components } from "@/api/schema"
import { normalizeSequence } from "@/humanization"
import { parseCsv } from "@/lib/csv"

export type NanobodyOptions = components["schemas"]["NanobodyOptions"]
export type NanobodySettings = components["schemas"]["NanobodySettings"]
export type NanobodyParent = components["schemas"]["VHInput"]
export type NanobodyPreparation = components["schemas"]["NanobodyPreparation"]
export type NanobodyPreparationRequest = components["schemas"]["NanobodyPreparationRequest"]

export function parseNanobodyCsv(content: string): NanobodyParent[] {
  return parseCsv(content, ["id", "vhh"]).map(([id, vhh]) => ({ id, vhh: normalizeSequence(vhh) }))
}

export function nextParentId(parents: readonly NanobodyParent[]) {
  const ids = new Set(parents.map(({ id }) => id))
  let index = 1
  while (ids.has(`nb_${String(index).padStart(3, "0")}`)) index++
  return `nb_${String(index).padStart(3, "0")}`
}

export const nanobodySettingGroups = [
  { label: "General", names: ["root_seed"] },
  { label: "AbNatiV2 VHH", names: ["abnativ2_residue_score_threshold", "abnativ2_rasa_threshold", "abnativ2_max_relative_vhh_score_decrease"] },
  { label: "HuDiff-Nb", names: ["hudiff_nb_candidate_count"] },
] as const

export const nanobodySettingInfo: Record<keyof NanobodySettings, { label: string; help: string }> = {
  root_seed: { label: "Root seed", help: "Controls reproducible sampling. Repeated seeds do not guarantee distinct designs." },
  hudiff_nb_candidate_count: { label: "Sampling attempts per parent", help: "Attempts, not guaranteed unique candidates. Invalid and duplicate designs reduce the final yield; native sampling uses batches of 10." },
  abnativ2_residue_score_threshold: { label: "Humanness threshold", help: "AbNatiV2 considers residues below this native human-VH score threshold for humanization, subject to the fixed protection policy." },
  abnativ2_rasa_threshold: { label: "Solvent exposure threshold", help: "Minimum relative solvent accessibility for proposed changes. Native generator-required structure calculations are retained." },
  abnativ2_max_relative_vhh_score_decrease: { label: "Allowed per-step VHH score decrease", help: "Relative VHH-score loss allowed at each optimization step. This is not a cap on total loss from the prepared parent." },
}
