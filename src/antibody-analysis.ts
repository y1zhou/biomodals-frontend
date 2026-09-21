import type { components } from "@/api/schema"

export type AnalysisOptions = components["schemas"]["AnalysisOptions"]
export type AnalysisRequest = components["schemas"]["AnalysisRequest"]
export type AnalysisResponse = components["schemas"]["AnalysisResponse"]
export type AnalysisEntry = components["schemas"]["AnalysisEntry"]
export type AnalysisGroup = components["schemas"]["AnalysisGroup"]
export type SequenceDetail = components["schemas"]["SequenceDetail"]
export type SequenceRequest = components["schemas"]["SequenceRequest"]
export type GermlinePresentation = components["schemas"]["GermlinePresentation"]
export type ReferenceInfo = components["schemas"]["ReferenceInfo"]

export const analysisColumns = [
  { name: "id", label: "ID", decimals: null },
  { name: "vh_pi", label: "VH pI", decimals: 2 },
  { name: "vl_pi", label: "VL pI", decimals: 2 },
  { name: "vh_vl_pi", label: "VH+VL sequence pI", decimals: 2 },
  { name: "vh_v_gene", label: "VH V gene", decimals: null },
  { name: "vh_j_gene", label: "VH J gene", decimals: null },
  { name: "vl_v_gene", label: "VL V gene", decimals: null },
  { name: "vl_j_gene", label: "VL J gene", decimals: null },
  ...(["vh", "vl", "unassigned"] as const).flatMap((role) => [
    ...(role === "unassigned" ? [{ name: "unassigned_pi", label: "Unassigned chain pI", decimals: 2 }] : []),
    { name: `${role}_molecular_weight_kda`, label: `${role === "unassigned" ? "Unassigned chain" : role.toUpperCase()} mass (kDa)`, decimals: 2 },
    { name: `${role}_gravy`, label: `${role === "unassigned" ? "Unassigned chain" : role.toUpperCase()} GRAVY`, decimals: 3 },
    { name: `${role}_extinction_reduced`, label: `${role === "unassigned" ? "Unassigned chain" : role.toUpperCase()} EC280 reduced`, decimals: 0 },
    { name: `${role}_extinction_oxidized`, label: `${role === "unassigned" ? "Unassigned chain" : role.toUpperCase()} EC280 disulfides`, decimals: 0 },
  ]),
] as const

export function analysisValues(entry: AnalysisEntry): Record<string, string | number | null> {
  const row: Record<string, string | number | null> = { id: entry.id, vh_vl_pi: entry.vh_vl_pi ?? null }
  for (const role of ["vh", "vl", "unassigned"] as const) {
    const chain = entry[role]
    for (const name of ["pi", "molecular_weight_kda", "gravy", "extinction_reduced", "extinction_oxidized"] as const) row[`${role}_${name}`] = chain?.metrics[name] ?? null
    row[`${role}_v_gene`] = chain?.germlines.assignment.v_gene ?? null
    row[`${role}_j_gene`] = chain?.germlines.assignment.j_gene ?? null
    row[`${role}_sequence`] = chain?.sequence ?? null
  }
  row.issues = analysisIssues(entry).join("; ")
  return row
}

export function analysisIssues(entry: AnalysisEntry) {
  return [...new Set([
    ...(entry.issues ?? []).map((issue) => issue.detail),
    ...(["vh", "vl", "unassigned"] as const).flatMap((role) => {
      const assignment = entry[role]?.germlines.assignment
      return assignment ? [assignment.error, ...assignment.diagnostics].filter((value): value is string => Boolean(value)).map((message) => `${role === "unassigned" ? "Unassigned chain" : role.toUpperCase()}: ${message}`) : []
    }),
  ])]
}

export function compareAnalysisValues(a: string | number | null, b: string | number | null, descending: boolean) {
  if (a === null) return b === null ? 0 : 1
  if (b === null) return -1
  const result = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b))
  return descending ? -result : result
}

export function analysisCsv(group: AnalysisGroup) {
  const columns = [...analysisColumns.map((column) => column.name), "vh_sequence", "vl_sequence", "unassigned_sequence", "issues"]
  const field = (value: string | number | null) => `"${String(value ?? "").replaceAll('"', '""')}"`
  return [columns.map(field).join(","), ...group.entries.map((entry) => {
    const values = analysisValues(entry)
    return columns.map((name) => field(values[name] ?? null)).join(",")
  })].join("\r\n")
}
