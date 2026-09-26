import { afterEach, expect, test } from "bun:test"
import { proteinOptimizationOptions, reviewProteinOptimization } from "../src/api/client"
import { addOptimizationPositions, defaultReplacementResidues, formatCandidateSpace, optimizationNumericBounds, optimizationOptionsReady } from "../src/protein-optimization"
import { optimizationOptions } from "./fixtures/protein-optimization"

test("candidate-space strings retain digits beyond safe JavaScript integers", () => {
  expect(formatCandidateSpace("9007199254740993").replace(/[^\d]/g, "")).toBe("9007199254740993")
  expect(formatCandidateSpace("0")).toBe("0")
})

test("review uses mode-specific service bounds and rejects incomplete options", () => {
  expect(optimizationOptionsReady(optimizationOptions)).toBe(true)
  expect(optimizationNumericBounds(optimizationOptions, "exploration", "candidate_budget")).toEqual({ minimum: 1, maximum: 20000 })
  expect(optimizationNumericBounds(optimizationOptions, "exploration", "max_mutations")).toEqual({ minimum: 1, maximum: 10 })
  expect(optimizationOptionsReady({ ...optimizationOptions, defaults: {} })).toBe(false)
  expect(optimizationOptionsReady({ ...optimizationOptions, settings_schema: {} })).toBe(false)
  expect(defaultReplacementResidues(optimizationOptions)).toBe("ADEFGHIKLNPQRSTVWY")
})

test("ranges preserve explicit per-site overrides and raw chain coordinates", () => {
  const current = [{ chain_id: "a", position: 2, amino_acids: "CM" }]
  const result = addOptimizationPositions(current, "a", "1-3", 4, 4, "ADEFGHIKLNPQRSTVWY")
  expect(result).toEqual([...current, { chain_id: "a", position: 1, amino_acids: "ADEFGHIKLNPQRSTVWY" }, { chain_id: "a", position: 3, amino_acids: "ADEFGHIKLNPQRSTVWY" }])
  expect(addOptimizationPositions(current, "A", "2", 4, 4, "SV")[1]).toEqual({ chain_id: "A", position: 2, amino_acids: "SV" })
  expect(current).toHaveLength(1)
  for (const range of ["0", "4-2", "2.5", "5", "1-9007199254740993"]) expect(() => addOptimizationPositions([], "a", range, 4, 4, "SV")).toThrow()
  expect(() => addOptimizationPositions(current, "b", "1-4", 4, 4, "SV")).toThrow("at most 4")
})

const originalFetch = globalThis.fetch
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document")
afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument)
  else Reflect.deleteProperty(globalThis, "document")
})

test("discovery and review preserve exact input bytes and use the unsafe-session guard", async () => {
  Object.defineProperty(globalThis, "document", { configurable: true, value: { cookie: "biomodals-csrf=offline-csrf" } })
  const calls: { path: string; init?: RequestInit }[] = []
  globalThis.fetch = (async (path, init) => { calls.push({ path: String(path), init }); return Response.json({}) }) as typeof fetch
  const signal = new AbortController().signal
  const input = { measurements_csv: 'mutations,label\r\n"A:A1V,B:M1A",>3', parental_fasta: null, settings: optimizationOptions.defaults!.combination }
  await proteinOptimizationOptions(signal)
  await reviewProteinOptimization(input, signal)
  expect(calls.map(({ path }) => path)).toEqual(["/api/v1/protein-optimization/options", "/api/v1/protein-optimization/review"])
  expect(calls[0].init).toMatchObject({ credentials: "same-origin", cache: "no-store", signal })
  expect(calls[1].init).toMatchObject({ credentials: "same-origin", cache: "no-store", signal, method: "POST", body: JSON.stringify(input), headers: { "Content-Type": "application/json", "X-CSRF-Token": "offline-csrf" } })
})
