import { afterEach, expect, test } from "bun:test"
import { prepareOptimizationSelectedDownload, proteinOptimizationCandidates, proteinOptimizationInputs, proteinOptimizationOptions, reviewProteinOptimization, submitProteinOptimization } from "../src/api/client"
import { addOptimizationPositions, defaultReplacementResidues, formatCandidateSpace, optimizationDownloadPath, optimizationNumericBounds, optimizationOptionsReady, optimizationRowErrors } from "../src/protein-optimization"
import { optimizationOptions } from "./fixtures/protein-optimization"

test("candidate-space strings retain digits beyond safe JavaScript integers", () => {
  expect(formatCandidateSpace("9007199254740993").replace(/[^\d]/g, "")).toBe("9007199254740993")
  expect(formatCandidateSpace("0")).toBe("0")
})

test("dense diagnostics keep every message in row order without changing raw issues", () => {
  const errors = Object.freeze([
    { row_index: null, field: "parental_fasta", code: "invalid_parents", message: "Check the FASTA" },
    ...Array.from({ length: 100_000 }, (_, index) => ({ row_index: 0, field: "mutations", code: "position_out_of_range", message: `Position ${index + 2} exceeds chain length` })),
    { row_index: 1, field: "label", code: "invalid_label", message: "Provide a finite label" },
  ])
  const grouped = optimizationRowErrors(errors)
  expect(grouped.size).toBe(2)
  expect(grouped.get(0)).toHaveLength(100_000)
  expect(grouped.get(0)?.[0]).toBe("mutations: Position 2 exceeds chain length")
  expect(grouped.get(0)?.at(-1)).toBe("mutations: Position 100001 exceeds chain length")
  expect(grouped.get(1)).toEqual(["label: Provide a finite label"])
  expect(errors[1]?.message).toBe("Position 2 exceeds chain length")
  expect(errors).toHaveLength(100_002)
})

test("review uses mode-specific service bounds and rejects incomplete options", () => {
  expect(optimizationOptionsReady(optimizationOptions)).toBe(true)
  expect(optimizationNumericBounds(optimizationOptions, "exploration", "candidate_budget")).toEqual({ minimum: 1, maximum: 20000 })
  expect(optimizationNumericBounds(optimizationOptions, "exploration", "max_mutations")).toEqual({ minimum: 1, maximum: 10 })
  expect(optimizationOptionsReady({ ...optimizationOptions, defaults: {} })).toBe(false)
  expect(optimizationOptionsReady({ ...optimizationOptions, review_version: "1" })).toBe(false)
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

test("candidate paging and selected preparation restore cache once without buffering CSV", async () => {
  Object.defineProperty(globalThis, "document", { configurable: true, value: { cookie: "biomodals-csrf=offline" } })
  const calls: { path: string; init?: RequestInit }[] = []
  globalThis.fetch = (async (path, init) => {
    calls.push({ path: String(path), init })
    return calls.length === 1 ? Response.json({ code: "result_not_cached" }, { status: 409 }) : Response.json({})
  }) as typeof fetch
  const signal = new AbortController().signal
  await proteinOptimizationCandidates("job/one", { offset: 50, limit: 50, sort_by: "predicted_label", descending: true, mutations: "A:A1V,B:M2S", n_new_mutations: 0 }, signal)
  expect(calls.map(({ path }) => path)).toEqual([
    "/api/v1/protein-optimization/jobs/job%2Fone/candidates?offset=50&limit=50&sort_by=predicted_label&descending=true&mutations=A%3AA1V%2CB%3AM2S&n_new_mutations=0",
    "/api/v1/jobs/job%2Fone/prepare-download",
    "/api/v1/protein-optimization/jobs/job%2Fone/candidates?offset=50&limit=50&sort_by=predicted_label&descending=true&mutations=A%3AA1V%2CB%3AM2S&n_new_mutations=0",
  ])
  expect(calls[0].init).toMatchObject({ signal, cache: "no-store", credentials: "same-origin" })
  calls.length = 0
  await prepareOptimizationSelectedDownload("job", ["candidate_000000009", "candidate_000000001"])
  expect(calls.map(({ path }) => path)).toEqual(["/api/v1/protein-optimization/jobs/job/prepare-selected-download", "/api/v1/jobs/job/prepare-download", "/api/v1/protein-optimization/jobs/job/prepare-selected-download"])
  expect(calls[0].init).toMatchObject({ method: "POST", headers: { "X-CSRF-Token": "offline" }, body: JSON.stringify({ ids: ["candidate_000000009", "candidate_000000001"] }) })
  expect(calls[2].init?.body).toBe(calls[0].init?.body)
})

test("submission binds original review and UUID while retained input reads never submit", async () => {
  Object.defineProperty(globalThis, "document", { configurable: true, value: { cookie: "biomodals-csrf=offline" } })
  const calls: { path: string; init?: RequestInit }[] = []
  globalThis.fetch = (async (path, init) => { calls.push({ path: String(path), init }); return Response.json({}) }) as typeof fetch
  const input = { measurements_csv: "mutations,label\nA:A1V,2", parental_fasta: null, settings: optimizationOptions.defaults!.combination, review_digest: "a".repeat(64), display_name: "" }
  await submitProteinOptimization(input, "exact-key")
  await submitProteinOptimization(input, "exact-key")
  expect(calls[0]).toEqual(calls[1])
  expect(calls[0].init).toMatchObject({ method: "POST", body: JSON.stringify(input), headers: { "Idempotency-Key": "exact-key", "X-CSRF-Token": "offline" } })
  await proteinOptimizationInputs("source/job")
  expect(calls[2]).toMatchObject({ path: "/api/v1/protein-optimization/jobs/source%2Fjob/inputs", init: { cache: "no-store" } })
})

test("selected-download tickets only navigate to this Job's native CSV", () => {
  const path = "/api/v1/protein-optimization/jobs/job/candidates.csv?ticket=token"
  expect(optimizationDownloadPath("job", path)).toBe(path)
  for (const url of [`https://outside.test${path}`, path.replace("/job/", "/other/"), "javascript:alert(1)", path.split("?")[0]]) expect(() => optimizationDownloadPath("job", url)).toThrow()
})
