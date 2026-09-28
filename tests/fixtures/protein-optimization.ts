import type { OptimizationOptions, OptimizationReview } from "../../src/protein-optimization"

export const optimizationOptions: OptimizationOptions = {
  review_version: "2", max_measurements_csv_bytes: 10485760, max_parental_fasta_bytes: 10485760,
  max_measurement_rows: 10000, max_mutation_tokens: 100000, max_chains: 16, max_total_residues: 16384,
  max_exploration_chain_length: 2046, max_design_positions: 1024, max_measured_substitutions: 4096,
  max_combination_candidates: 1000000, max_exploration_candidates: 20000, max_exploration_mutations: 10, max_result_bytes: 2147483648,
  max_page_size: 200, max_selected_candidates: 1000000, sortable_columns: ["id", "mutations", "predicted_label", "n_mutations", "n_new_mutations"],
  defaults: {
    combination: { mode: "combination", direction: "maximize", max_mutations: 2, candidate_budget: 1000000, max_new_mutations: 1, seed: 0, positions: null },
    exploration: { mode: "exploration", direction: "maximize", max_mutations: 2, candidate_budget: 5000, max_new_mutations: 1, seed: 0, positions: null },
  },
  settings_schema: {
    properties: {
      max_mutations: { minimum: 1, maximum: 1024 }, candidate_budget: { minimum: 1, maximum: 1000000 },
      max_new_mutations: { minimum: 1, maximum: 10 }, seed: { minimum: 0, maximum: 4294967295 },
    },
    $defs: { PositionChoices: { properties: { amino_acids: { default: "ADEFGHIKLNPQRSTVWY" } } } },
  },
}

export const optimizationReview: OptimizationReview = {
  review_version: "2", required_chain_ids: ["A"], rows: [{ row_index: 0, id: "one", mutations: "A:A1V", label: "2", canonical_mutations: "A:A1V" }],
  chains: [{ chain_id: "A", sequence: "ACDE" }], errors: [], positions: [{ chain_id: "A", position: 1, amino_acids: "ADEFGHIKLNPQRSTVWY" }],
  unique_variant_count: 1, replicate_rows: 0, candidate_space_size: "9007199254740993", evaluation_count: 5000,
  warnings: [], review_digest: "a".repeat(64),
}
