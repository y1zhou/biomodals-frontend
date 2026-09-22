import type { components } from "@/api/schema"

export const ANALYSIS_VERSION = "3"

export const exampleAntibodyFasta = `>pembrolizumab
QVQLVQSGVEVKKPGASVKVSCKASGYTFTNYYMYWVRQAPGQGLEWMGGINPSNGGTNFNEKFKNRVTLTTDSSTTTAYMELKSLQFDDTAVYYCARRDYRFDMGFDYWGQGTTVTVSS:EIVLTQSPATLSLSPGERATLSCRASKGVSTSGYSYLHWYQQKPGQAPRLLIYLASYLESGVPARFSGSGSGTDFTLTISSLEPEDFAVYYCQHSRDLPLTFGGGTKVEIK
>OKT3
QVQLQQSGAELARPGASVKMSCKASGYTFTRYTMHWVKQRPGQGLEWIGYINPSRGYTNYNQKFKDKATLTTDKSSSTAYMQLSSLTSEDSAVYYCARYYDDHYCLDYWGQGTTLTVSS:QIVLTQSPAIMSASPGEKVTMTCSASSSVSYMNWYQQKSGTSPKRWIYDTSKLASGVPAHFRGSGSGTSYSLTISGMEAEDAATYYCQQWSSNPFTFGSGTKLEI
>Ozoralizumab
EVQLVESGGGLVQPGGSLRLSCAASGFTFSDYWMYWVRQAPGKGLEWVSEINTNGLITKYPDSVKGRFTISRDNAKNTLYLQMNSLRPEDTAVYYCARSPSGFNRGQGTLVTVSS`

export type AnalysisOptions = components["schemas"]["AnalysisOptions"]
export type AnalysisRequest = components["schemas"]["AnalysisRequest"]
export type AnalysisResponse = components["schemas"]["AnalysisResponse"]
export type AnalysisEntry = components["schemas"]["AnalysisEntry"]
export type AnalysisGroup = components["schemas"]["AnalysisGroup"]
export type SequenceDetail = components["schemas"]["SequenceDetail"]
export type SequenceRequest = components["schemas"]["SequenceRequest"]
export type GermlinePresentation = components["schemas"]["GermlinePresentation"]
export type GermlineAlignment = components["schemas"]["GermlineAlignment"]
export type ReferenceInfo = components["schemas"]["ReferenceInfo"]

export const analysisColumns = [
  { name: "id", label: "ID", decimals: null },
  { name: "vh_pi", label: "VH pI", decimals: 2 },
  { name: "vl_pi", label: "VL pI", decimals: 2 },
  { name: "vh_vl_pi", label: "VH+VL pI", decimals: 2 },
  { name: "vh_v_gene", label: "VH V gene", decimals: null },
  { name: "vh_j_gene", label: "VH J gene", decimals: null },
  { name: "vl_v_gene", label: "VL V gene", decimals: null },
  { name: "vl_j_gene", label: "VL J gene", decimals: null },
  { name: "vh_germline_pi", label: "VH germline pI", decimals: 2 },
  { name: "vl_germline_pi", label: "VL germline pI", decimals: 2 },
  ...(["vh", "vl", "unassigned"] as const).flatMap((role) => [
    ...(role === "unassigned" ? [{ name: "unassigned_pi", label: "Unassigned chain pI", decimals: 2 }] : []),
    { name: `${role}_molecular_weight_kda`, label: `${role === "unassigned" ? "Unassigned chain" : role.toUpperCase()} mass (kDa)`, decimals: 2 },
    { name: `${role}_gravy`, label: `${role === "unassigned" ? "Unassigned chain" : role.toUpperCase()} GRAVY (BlackMould)`, decimals: 3 },
  ]),
  { name: "issues", label: "Issues", decimals: null },
] as const

export function analysisValues(entry: AnalysisEntry): Record<string, string | number | null> {
  const row: Record<string, string | number | null> = { id: entry.id, vh_vl_pi: entry.vh_vl_pi ?? null }
  for (const role of ["vh", "vl", "unassigned"] as const) {
    const chain = entry[role]
    for (const name of ["pi", "molecular_weight_kda", "gravy"] as const) row[`${role}_${name}`] = chain?.metrics[name] ?? null
    row[`${role}_v_gene`] = chain?.germlines.assignment.v_gene ?? null
    row[`${role}_j_gene`] = chain?.germlines.assignment.j_gene ?? null
    row[`${role}_sequence`] = chain?.sequence ?? null
    if (role !== "unassigned") row[`${role}_germline_pi`] = chain?.germline_pi ?? null
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
  const columns = [...analysisColumns.map((column) => column.name), "vh_sequence", "vl_sequence", "unassigned_sequence"]
  const field = (value: string | number | null) => `"${String(value ?? "").replaceAll('"', '""')}"`
  return [columns.map(field).join(","), ...group.entries.map((entry) => {
    const values = analysisValues(entry)
    return columns.map((name) => field(values[name] ?? null)).join(",")
  })].join("\r\n")
}

export function analysisSequence(entry: AnalysisEntry) {
  if (entry.vh && entry.vl) return `${entry.vh.sequence}:${entry.vl.sequence}`
  return entry.vh?.sequence ?? entry.vl?.sequence ?? entry.unassigned?.sequence ?? null
}

export function analysisFasta(group: AnalysisGroup, selected: ReadonlySet<number>) {
  return group.entries.flatMap((entry, index) => {
    const sequence = analysisSequence(entry)
    return selected.has(index) && sequence ? [`>${entry.id}\n${sequence}`] : []
  }).join("\n")
}

// Map native alignment columns to original coordinates without realigning.
export function germlineAlignmentColumns(alignment: GermlineAlignment) {
  let inputIndex = alignment.query_input_start
  let referenceIndex = alignment.reference_start
  return Array.from(alignment.aligned_query, (query, index) => ({
    query,
    reference: alignment.aligned_reference[index],
    operation: alignment.operations[index],
    inputIndex: query === "-" ? null : inputIndex++,
    referenceIndex: alignment.aligned_reference[index] === "-" ? null : referenceIndex++,
  }))
}
