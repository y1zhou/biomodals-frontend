import type { components } from "@/api/schema"
import { parseCsv } from "@/lib/csv"

export type HumanizationPair = components["schemas"]["PairInput"]
export type HumanizationSettings = components["schemas"]["HumanizationSettings"]
export type HumanizationOptions = components["schemas"]["HumanizationOptions"]
export type HumanizationSubmission = components["schemas"]["HumanizationSubmission"]
export type HumanizationInputError = components["schemas"]["InputIssue"]
export type HumanizationSelection = components["schemas"]["SelectionPage"]

export function settingMetadata(options: { readonly settings_schema?: Record<string, unknown> } | undefined, name: string) {
  const properties = options?.settings_schema?.properties
  const value = properties && typeof properties === "object" && name in properties
    ? (properties as Record<string, unknown>)[name] : null
  const schema = value && typeof value === "object" ? value as Record<string, unknown> : {}
  return {
    type: typeof schema.type === "string" ? schema.type : undefined,
    enum: Array.isArray(schema.enum) && schema.enum.every((entry) => typeof entry === "string") ? schema.enum as string[] : undefined,
    minimum: typeof schema.minimum === "number" ? schema.minimum : undefined,
    maximum: typeof schema.maximum === "number" ? schema.maximum : undefined,
  }
}

export interface SelectionQuery { offset: number; limit: number; parentId: string; sortBy: string; descending: boolean }

export const candidateColumnLabel = (name: string) => name.replace(/_pi$/, "_pI")

// Historical CSVs keep their original names/order; only the webpage changes.
export function candidateColumns(columns: HumanizationSelection["columns"]) {
  const displayed = [...columns]
  const vh = displayed.findIndex(({ name }) => name === "vh")
  const vl = displayed.findIndex(({ name }) => name === "vl")
  if (vh !== -1 && vl !== -1) {
    const [light] = displayed.splice(vl, 1)
    displayed.splice(displayed.findIndex(({ name }) => name === "vh") + 1, 0, light)
  }
  return displayed
}

export function formatCandidateNumber(value: number) {
  const magnitude = Math.abs(value)
  if (magnitude !== 0 && (magnitude < 0.001 || magnitude >= 1_000_000)) return value.toExponential(3)
  return Number.isInteger(value) ? String(value) : value.toFixed(3)
}

// Match the backend's Python whitespace rules. In particular, an embedded BOM
// is not whitespace and must survive normalization so validation rejects it.
// eslint-disable-next-line no-control-regex
const inputWhitespace = /[^\S\uFEFF]|\u0085|[\u001c-\u001f]/g
export const normalizeSequence = (value: string) => value.replace(inputWhitespace, "").toUpperCase()
const fastaId = (id: string) => id.replace(inputWhitespace, "_")

export function nextPairId(pairs: readonly HumanizationPair[]) {
  const ids = new Set(pairs.map((pair) => fastaId(pair.id)))
  let index = 1
  while (ids.has(`ab_${String(index).padStart(3, "0")}`)) index++
  return `ab_${String(index).padStart(3, "0")}`
}

export function pairErrors(pairs: readonly HumanizationPair[], limits?: Pick<HumanizationOptions, "max_vh_length" | "max_vl_length">) {
  const counts = new Map<string, number>()
  for (const pair of pairs) counts.set(fastaId(pair.id), (counts.get(fastaId(pair.id)) ?? 0) + 1)
  return pairs.map((pair) => {
    const errors: Partial<Record<keyof HumanizationPair, string>> = {}
    if (!pair.id || pair.id !== pair.id.trim() || [...pair.id].length > 200 || [...pair.id].some((char) => char.charCodeAt(0) < 32 || char === ">")) {
      errors.id = "Use 1–200 characters without surrounding whitespace, control characters, or >."
    } else if ((counts.get(fastaId(pair.id)) ?? 0) > 1) {
      errors.id = "IDs must be unique, including after whitespace is replaced by underscores."
    }
    for (const field of ["vh", "vl"] as const) {
      const sequence = normalizeSequence(pair[field])
      const maximum = limits?.[field === "vh" ? "max_vh_length" : "max_vl_length"]
      if (!/^[ACDEFGHIKLMNPQRSTVWY]+$/.test(sequence)) {
        errors[field] = "Use canonical amino-acid residues. Other characters are not removed."
      } else if (maximum !== undefined && sequence.length > maximum) {
        errors[field] = `${field.toUpperCase()} has ${sequence.length} residues; the limit is ${maximum}. Provide the correct variable-domain sequence. No residues have been removed.`
      }
    }
    return errors
  })
}

export function parsePairCsv(content: string): HumanizationPair[] {
  return parseCsv(content, ["id", "vh", "vl"]).map(([id, vh, vl]) => ({ id, vh: normalizeSequence(vh), vl: normalizeSequence(vl) }))
}

export const generalSettingSources: Partial<Record<keyof HumanizationSettings, keyof HumanizationSettings>> = {
  sapiens_mutate_cdrs: "sapiens_mutate_cdrs",
  humatch_mutate_cdrs: "sapiens_mutate_cdrs",
  pabnativ2_mutate_cdrs: "sapiens_mutate_cdrs",
  pabnativ2_seed: "pabnativ2_seed",
  hudiff_ab_seed: "pabnativ2_seed",
}

export const settingGroups = [
  { name: "General", prefix: "", help: "CDR mutations apply to Sapiens, Humatch, and p-AbNatiV2. The root seed applies to p-AbNatiV2 and HuDiff, not every model." },
  { name: "Sapiens", prefix: "sapiens_", help: "Separate heavy- and light-chain language models refine the sequences greedily. Iterations follow one refinement path; they are not independent random attempts." },
  { name: "Humatch", prefix: "humatch_", help: "Edits toward human V-family and pairing classifier targets. Returns one endpoint per parent, which can be unchanged when the targets already hold." },
  { name: "p-AbNatiV2", prefix: "pabnativ2_", help: "Optimizes paired nativeness with structural accessibility and pairing-loss constraints. Independent optimizer starts may converge to the same endpoint." },
  { name: "HuDiff", prefix: "hudiff_ab_", help: "Samples paired framework designs around protected CDRs. Invalid or duplicate designs reduce the unique yield. HuDiff has no native evaluation score; candidates are evaluated by the other scorers." },
] as const

export const settingLabels: Record<keyof HumanizationSettings, string> = {
  sapiens_iterations: "Iterations", sapiens_numbering_scheme: "Numbering scheme",
  sapiens_cdr_definition: "CDR definition", sapiens_mutate_cdrs: "Allow CDR mutations",
  humatch_vh_target_family: "VH target family", humatch_vl_target_family: "VL target family",
  humatch_germline_likeness_target: "Germline likeness target", humatch_vh_classifier_target: "VH classifier target",
  humatch_vl_classifier_target: "VL classifier target", humatch_pair_classifier_target: "Pair classifier target",
  humatch_max_edits: "Maximum edits", humatch_mutate_cdrs: "Allow CDR mutations",
  humatch_fixed_vh_positions: "Protected VH positions (IMGT)", humatch_fixed_vl_positions: "Protected VL positions (IMGT)",
  pabnativ2_mutate_cdrs: "Allow CDR mutations", pabnativ2_fixed_vh_positions: "Protected VH positions (AHo)",
  pabnativ2_fixed_vl_positions: "Protected VL positions (AHo)", pabnativ2_residue_score_threshold: "Residue score threshold",
  pabnativ2_rasa_threshold: "RASA threshold", pabnativ2_max_relative_pairing_score_decrease: "Maximum relative pairing score decrease",
  pabnativ2_forbidden_residues: "Forbidden proposed residues", pabnativ2_seed: "Root seed",
  pabnativ2_num_seeds: "Sampling attempts per parent",
  hudiff_ab_candidate_count: "Sampling attempts per parent", hudiff_ab_seed: "Root seed",
  hudiff_ab_sampling_order: "Sampling order", hudiff_ab_upstream_inference_dropout: "Preserve released inference dropout",
}

export const settingHelp: Partial<Record<keyof HumanizationSettings, string>> = {
  sapiens_iterations: "The paired sequences after every iteration are included as candidates, then deduplicated and evaluated with the other models’ outputs.",
  sapiens_numbering_scheme: "Controls residue labels during Sapiens generation. Changing the result viewer’s display scheme does not change these settings.",
  sapiens_cdr_definition: "Controls which regions Sapiens treats as CDRs; it is independent of its numbering scheme.",
  sapiens_mutate_cdrs: "CDR changes can alter binding determinants. Model scores do not validate preserved binding or reduced immunogenicity.",
  humatch_vh_target_family: "Auto chooses a human heavy-chain V-family separately for each parent. A family classifier target is distinct from an individual germline gene match.",
  humatch_vl_target_family: "Auto chooses a human light-chain V-family separately for each parent.",
  humatch_germline_likeness_target: "Target for an observed-residue frequency score, not sequence identity or experimental confidence.",
  humatch_vh_classifier_target: "Target classifier support for the chosen heavy-chain family. Raising it does not request additional candidates.",
  humatch_vl_classifier_target: "Target classifier support for the chosen light-chain family. Raising it does not request additional candidates.",
  humatch_pair_classifier_target: "Target model support for the pair, not an experimental probability of successful pairing.",
  humatch_max_edits: "Limits the editing process for the single endpoint. More allowed edits do not request more endpoints.",
  humatch_fixed_vh_positions: "Protected positions use IMGT, regardless of the result viewer’s display scheme.",
  humatch_fixed_vl_positions: "Protected positions use IMGT, regardless of the result viewer’s display scheme.",
  pabnativ2_fixed_vh_positions: "Protected positions use AHo, regardless of the result viewer’s display scheme.",
  pabnativ2_fixed_vl_positions: "Protected positions use AHo, regardless of the result viewer’s display scheme.",
  pabnativ2_max_relative_pairing_score_decrease: "Constrains generation; it does not change the panel-ranking pairing guardrail.",
  pabnativ2_seed: "Controls p-AbNatiV2 optimizer roots and HuDiff sampling. Reproducible seeds do not guarantee distinct candidate sequences.",
  pabnativ2_num_seeds: "One independent optimization run per derived seed and parent. More attempts increase compute and may return identical sequences, which are deduplicated.",
  hudiff_ab_candidate_count: "A total sampling-attempt budget per parent, not a guaranteed number of distinct valid designs. More attempts can increase generation and evaluation cost.",
}
