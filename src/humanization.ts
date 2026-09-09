import type { components } from "@/api/schema"

export type HumanizationPair = components["schemas"]["PairInput"]
export type HumanizationSettings = components["schemas"]["HumanizationSettings"]
export type HumanizationOptions = components["schemas"]["HumanizationOptions"]
export type HumanizationSubmission = components["schemas"]["HumanizationSubmission"]
export type HumanizationInputError = components["schemas"]["InputIssue"]
export type HumanizationSelection = components["schemas"]["SelectionPage"]

export function settingMetadata(options: HumanizationOptions | undefined, name: string) {
  const properties = options?.settings_schema.properties
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

// Strict CSV framing, separate from editable row validation. Never partially
// append an import: malformed quotes/columns throw before any pairs are returned.
export function parsePairCsv(content: string): HumanizationPair[] {
  const text = content.replace(/^\uFEFF/, "")
  const rows: string[][] = []
  let row: string[] = []
  let value = ""
  let quoted = false
  let closed = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { value += '"'; i++ }
        else { quoted = false; closed = true }
      } else value += char
    } else if (char === '"') {
      if (value || closed) throw new Error("Malformed CSV quotation. The batch was not changed.")
      quoted = true
    } else if (char === "," || char === "\n" || char === "\r") {
      row.push(value); value = ""; closed = false
      if (char !== ",") {
        rows.push(row); row = []
        if (char === "\r" && text[i + 1] === "\n") i++
      }
    } else {
      if (closed) throw new Error("Unexpected text after a quoted CSV field. The batch was not changed.")
      value += char
    }
  }
  if (quoted) throw new Error("Unclosed CSV quotation. The batch was not changed.")
  if (value || closed || row.length) rows.push([...row, value])
  if (rows[0]?.join(",") !== "id,vh,vl" || rows[0]?.length !== 3) {
    throw new Error("CSV must start with exactly id,vh,vl. The batch was not changed.")
  }
  if (rows.length < 2) throw new Error("CSV has no pairs. The batch was not changed.")
  return rows.slice(1).map((fields, index) => {
    if (fields.length !== 3) throw new Error(`CSV row ${index + 2} must have three fields. The batch was not changed.`)
    return { id: fields[0], vh: normalizeSequence(fields[1]), vl: normalizeSequence(fields[2]) }
  })
}

export const generalSettingSources: Partial<Record<keyof HumanizationSettings, keyof HumanizationSettings>> = {
  sapiens_mutate_cdrs: "sapiens_mutate_cdrs",
  humatch_mutate_cdrs: "sapiens_mutate_cdrs",
  pabnativ2_mutate_cdrs: "sapiens_mutate_cdrs",
  pabnativ2_seed: "pabnativ2_seed",
  hudiff_ab_seed: "pabnativ2_seed",
}

export const settingGroups = [
  { name: "General", prefix: "", help: "CDR mutations apply to Sapiens, Humatch, and p-AbNatiV2. The root seed applies to p-AbNatiV2 and HuDiff." },
  { name: "Sapiens", prefix: "sapiens_", help: "Numbering and CDR definitions are independent controls." },
  { name: "Humatch", prefix: "humatch_", help: "Protected positions use IMGT. Auto families are resolved separately for each parent." },
  { name: "p-AbNatiV2", prefix: "pabnativ2_", help: "Protected positions use AHo. Pairing decrease controls generation, not the panel-ranking guardrail." },
  { name: "HuDiff", prefix: "hudiff_ab_", help: "Sampling attempts are per parent, not a guaranteed number of unique candidates." },
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
  pabnativ2_num_seeds: "One independent optimization run per derived seed and parent. More attempts increase compute and may return identical sequences, which are deduplicated.",
}
