import type { components } from "@/api/schema"

export type OptimizationOptions = components["schemas"]["ProteinOptimizationOptions"]
export type OptimizationReviewRequest = components["schemas"]["OptimizationReviewRequest"]
export type OptimizationReview = components["schemas"]["OptimizationReview"]
export type OptimizationSettings = components["schemas"]["OptimizationSettings"]
export type OptimizationPosition = components["schemas"]["PositionChoices"]
export type OptimizationMode = NonNullable<OptimizationSettings["mode"]>
export type OptimizationNumericSetting = "max_mutations" | "candidate_budget" | "max_new_mutations" | "seed"

export const proteinOptimizationPath = "/tools/protein-optimization/new"
export function defaultReplacementResidues(options: OptimizationOptions) {
  const definitions = options.settings_schema?.$defs
  const value = definitions && typeof definitions === "object" ? Reflect.get(definitions, "PositionChoices")?.properties?.amino_acids?.default : undefined
  return typeof value === "string" ? value : undefined
}

// Do not round combinatorial counts through a JavaScript Number.
export function formatCandidateSpace(value: string) {
  return /^\d+$/.test(value) ? BigInt(value).toLocaleString() : value
}

export function optimizationNumericBounds(options: OptimizationOptions, mode: OptimizationMode, name: OptimizationNumericSetting) {
  const properties = options.settings_schema?.properties
  const property = properties && typeof properties === "object" ? Reflect.get(properties, name) : undefined
  const minimum = typeof property?.minimum === "number" ? property.minimum : undefined
  const schemaMaximum = typeof property?.maximum === "number" ? property.maximum : undefined
  const maximum = name === "candidate_budget"
    ? mode === "combination" ? options.max_combination_candidates : options.max_exploration_candidates
    : name === "max_mutations" && mode === "exploration" ? options.max_exploration_mutations : schemaMaximum
  return { minimum, maximum }
}

export function optimizationOptionsReady(options: OptimizationOptions): boolean {
  return options.review_version === "1"
    && defaultReplacementResidues(options) !== undefined
    && [options.max_measurements_csv_bytes, options.max_parental_fasta_bytes, options.max_design_positions].every((value) => typeof value === "number" && Number.isSafeInteger(value) && value > 0)
    && (["combination", "exploration"] as const).every((mode) => {
      const defaults = options.defaults?.[mode]
      return defaults?.mode === mode && ["maximize", "minimize"].includes(defaults.direction ?? "")
        && (["max_mutations", "candidate_budget", "max_new_mutations", "seed"] as const).every((name) => {
          const bounds = optimizationNumericBounds(options, mode, name)
          const value = defaults[name]
          return typeof value === "number" && Number.isSafeInteger(value) && bounds.minimum !== undefined && bounds.maximum !== undefined && value >= bounds.minimum && value <= bounds.maximum
        })
    })
}

// Expanding UI ranges does not infer biological coordinates or allowed sites.
export function addOptimizationPositions(current: readonly OptimizationPosition[], chainId: string, range: string, chainLength: number, maxPositions: number, defaultResidues: string): OptimizationPosition[] {
  const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(range.trim())
  if (!match) throw new Error("Enter a one-based position or inclusive range, such as 5 or 5–12 (using a hyphen).")
  const start = Number(match[1])
  const end = Number(match[2] ?? match[1])
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || end > chainLength) throw new Error(`Positions must be within chain ${chainId}: 1–${chainLength}.`)
  // Bound work before expanding a potentially very large range.
  if (end - start + 1 > maxPositions) throw new Error(`Use at most ${maxPositions} design positions.`)
  const existing = new Set(current.filter((site) => site.chain_id === chainId).map((site) => site.position))
  const added: OptimizationPosition[] = []
  for (let position = start; position <= end; position++) {
    if (!existing.has(position)) added.push({ chain_id: chainId, position, amino_acids: defaultResidues })
  }
  if (current.length + added.length > maxPositions) throw new Error(`Use at most ${maxPositions} design positions.`)
  return [...current, ...added]
}
