import { expect, test } from "bun:test"
import { analysisCsv, analysisIssues, analysisValues, compareAnalysisValues, type AnalysisEntry } from "../src/antibody-analysis"

const unassigned: AnalysisEntry = {
  id: 'unnumbered,"chain"', unassigned: {
    sequence: "ACDE", metrics: { pi: 5.123456789, molecular_weight_kda: 0.456789, gravy: -0.775, extinction_reduced: 0, extinction_oxidized: 125 },
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
})

test("numeric ordering retains sub-display precision and nulls last in both directions", () => {
  const values = [null, 7.004, 7.001, 7.003]
  expect([...values].sort((a, b) => compareAnalysisValues(a, b, false))).toEqual([7.001, 7.003, 7.004, null])
  expect([...values].sort((a, b) => compareAnalysisValues(a, b, true))).toEqual([7.004, 7.003, 7.001, null])
})
