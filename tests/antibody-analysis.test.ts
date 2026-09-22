import { expect, test } from "bun:test"
import { analysisColumns, analysisCsv, analysisFasta, analysisIssues, analysisValues, compareAnalysisValues, type AnalysisEntry } from "../src/antibody-analysis"

const unassigned: AnalysisEntry = {
  id: 'unnumbered,"chain"', unassigned: {
    sequence: "ACDE", metrics: { pi: 5.123456789, molecular_weight_kda: 0.456789, gravy: 0.34175 }, germline_pi: null,
    germlines: { assignment: { chain_type: null, v_gene: null, j_gene: null, v: [], j: [], diagnostics: [], error: "Numbering failed" }, v_usage: [], j_usage: [] },
  }, issues: [],
}

test("unassigned metrics stay independent from VH and pair-only fields", () => {
  const values = analysisValues(unassigned)
  expect(values.vh_pi).toBeNull()
  expect(values.vl_pi).toBeNull()
  expect(values.vh_vl_pi).toBeNull()
  expect(values.unassigned_pi).toBe(5.123456789)
  expect(analysisIssues(unassigned)).toEqual(["Unassigned chain: Numbering failed"])
})

test("CSV preserves full precision, sequences, errors and escaped IDs", () => {
  const csv = analysisCsv({ id: "Group 1", entries: [unassigned] })
  expect(csv).toContain('"unnumbered,""chain"""')
  expect(csv).toContain('"5.123456789"')
  expect(csv).toContain('"ACDE"')
  expect(csv).toContain('"Unassigned chain: Numbering failed"')
  expect(csv).not.toContain("quality_tier")
  expect(csv).toContain('"0.34175"')
  expect(analysisColumns.find((column) => column.name === "vh_gravy")?.label).toBe("VH GRAVY (BlackMould)")
})

test("selected FASTA keeps original order and intact pairs or standalone sequences", () => {
  const chain = unassigned.unassigned!
  const group = { id: "Group 1", entries: [
    { id: "pair", vh: chain, vl: { ...chain, sequence: "GGG" } },
    { id: "heavy", vh: chain },
    { id: "light", vl: { ...chain, sequence: "DDD" } },
    { ...unassigned, id: "unassigned" },
    { id: "invalid", issues: [{ code: "invalid_sequence", detail: "Invalid amino acid" }] },
  ] }
  expect(analysisFasta(group, new Set([3, 4, 2, 0]))).toBe(">pair\nACDE:GGG\n>light\nDDD\n>unassigned\nACDE")
  expect(analysisFasta(group, new Set([1]))).toBe(">heavy\nACDE")
  expect(analysisFasta(group, new Set())).toBe("")
})

test("numeric ordering retains sub-display precision and nulls last in both directions", () => {
  const values = [null, 7.004, 7.001, 7.003]
  expect([...values].sort((a, b) => compareAnalysisValues(a, b, false))).toEqual([7.001, 7.003, 7.004, null])
  expect([...values].sort((a, b) => compareAnalysisValues(a, b, true))).toEqual([7.004, 7.003, 7.001, null])
})

test("germline pI columns preserve raw values for sorting and CSV", () => {
  const entry = { id: "pair", vh: { ...unassigned.unassigned!, germline_pi: 7.123456789 }, vl: { ...unassigned.unassigned!, germline_pi: 5.987654321 } }
  const values = analysisValues(entry)
  expect(values.vh_germline_pi).toBe(7.123456789)
  expect(values.vl_germline_pi).toBe(5.987654321)
  const afterJ = analysisColumns.findIndex((column) => column.name === "vl_j_gene") + 1
  expect(analysisColumns.slice(afterJ, afterJ + 2)).toEqual([
    { name: "vh_germline_pi", label: "VH germline pI", decimals: 2 },
    { name: "vl_germline_pi", label: "VL germline pI", decimals: 2 },
  ])
  const csv = analysisCsv({ id: "Group 1", entries: [entry] })
  expect(csv).toContain('"vh_germline_pi","vl_germline_pi"')
  expect(csv).toContain('"7.123456789","5.987654321"')
  const sorted = [null, values.vh_germline_pi, 7.123456788].sort((a, b) => compareAnalysisValues(a, b, false))
  expect(sorted).toEqual([7.123456788, 7.123456789, null])
})
