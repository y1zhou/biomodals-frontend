import { afterEach, describe, expect, test } from "bun:test"

import { ApiError, humanizationInputs, humanizationSelection, submitHumanizationJob } from "../src/api/client"
import { nextPairId, normalizeSequence, pairErrors, parsePairCsv } from "../src/humanization"

describe("humanization batch input", () => {
  test("normalizes sequences without dropping invalid characters or changing IDs", () => {
    expect(normalizeSequence("a c\nr\tt*")).toBe("ACRT*")
    expect(normalizeSequence("a\u0085c\u001cd")).toBe("ACD")
    expect(normalizeSequence("a\uFEFFc")).toBe("A\uFEFFC")
    const rows = parsePairCsv('\uFEFFid,vh,vl\r\n"parent, one","a c\nd",efg\r\nparent_2,,x\r\n')
    expect(rows).toEqual([{ id: "parent, one", vh: "ACD", vl: "EFG" }, { id: "parent_2", vh: "", vl: "X" }])
    expect(pairErrors(rows)[0]).toEqual({})
    expect(Object.keys(pairErrors(rows)[1])).toEqual(["vh", "vl"])
  })

  test("checks normalized chain lengths against service limits without trimming", () => {
    const limits = { max_vh_length: 142, max_vl_length: 126 }
    expect(pairErrors([{ id: "one", vh: " a ".repeat(142), vl: "g".repeat(126) }], limits)).toEqual([{}])
    const pair = { id: "one", vh: "A".repeat(143), vl: "G".repeat(127) }
    const errors = pairErrors([pair], limits)[0]
    expect(errors.vh).toContain("143 residues; the limit is 142")
    expect(errors.vl).toContain("127 residues; the limit is 126")
    expect(pair.vh).toHaveLength(143)
    expect(pair.vl).toHaveLength(127)
  })

  test("rejects the whole import for malformed framing and preserves escaped quotes", () => {
    for (const csv of ['id,vh,vl\na,ACD', 'id,vh,vl\na,"ACD,EFG', 'id,vh,vl\na,"ACD"oops,EFG', 'id,vh,vl\na,A"CD,EFG', 'vh,vl,id\na,ACD,EFG']) {
      expect(() => parsePairCsv(csv)).toThrow()
    }
    expect(parsePairCsv('id,vh,vl\n"a""b",ACD,EFG')[0].id).toBe('a"b')
  })

  test("detects both sides of normalized ID collisions and generates unused IDs", () => {
    const rows = [{ id: "ab 001", vh: "ACD", vl: "EFG" }, { id: "ab_001", vh: "ACD", vl: "EFG" }]
    expect(pairErrors(rows).every((row) => Boolean(row.id))).toBe(true)
    expect(nextPairId(rows)).toBe("ab_002")
    expect(pairErrors([{ id: " invalid ", vh: "A".repeat(201), vl: "EFG" }], { max_vh_length: 142, max_vl_length: 126 })[0]).toHaveProperty("vh")
  })
})

const originalFetch = globalThis.fetch
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document")
afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument)
  else Reflect.deleteProperty(globalThis, "document")
})
function csrf() { Object.defineProperty(globalThis, "document", { configurable: true, value: { cookie: "biomodals-csrf=test-csrf" } }) }
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }) }

describe("humanization request boundaries", () => {
  test("retrieves original inputs with a private read and no submission", async () => {
    const calls: { path: string; init: RequestInit | undefined }[] = []
    const input = { pairs: [{ id: "old", vh: "A".repeat(192), vl: "EFG" }], settings: { pabnativ2_seed: 7 } }
    globalThis.fetch = (async (path, init) => { calls.push({ path: String(path), init }); return json(input) }) as typeof fetch
    expect(await humanizationInputs("job/one")).toEqual(input)
    expect(calls).toHaveLength(1)
    expect(calls[0].path).toBe("/api/v1/humanization/jobs/job%2Fone/inputs")
    expect(calls[0].init).toMatchObject({ cache: "no-store", credentials: "same-origin" })
    expect(calls[0].init?.body).toBeUndefined()
    expect(calls[0].init?.method ?? "GET").toBe("GET")
  })

  test("recovers an evicted cache once without sending table contents or changing query", async () => {
    csrf()
    const requests: { path: string; method: string; body: unknown }[] = []
    globalThis.fetch = (async (path, init) => {
      requests.push({ path: String(path), method: init?.method ?? "GET", body: init?.body })
      return requests.length === 1 ? json({ code: "result_not_cached" }, 409) : json({ rows: [] })
    }) as typeof fetch
    await humanizationSelection("job/one", { offset: 50, limit: 50, parentId: "a & b", sortBy: "quality_tier", descending: true })
    expect(requests.map((request) => request.method)).toEqual(["GET", "POST", "GET"])
    expect(requests[0].path).toBe("/api/v1/humanization/jobs/job%2Fone/selection?offset=50&limit=50&parent_id=a+%26+b&sort_by=quality_tier&descending=true")
    expect(requests[2].path).toBe(requests[0].path)
    expect(requests[1].path).toBe("/api/v1/jobs/job%2Fone/prepare-download")
    expect(requests.every((request) => request.body === undefined)).toBe(true)
  })

  test("does not loop on persistent cache failure or restore an unauthorized Result", async () => {
    csrf()
    let calls = 0
    globalThis.fetch = (async () => { calls++; return calls === 2 ? json({}) : json({ code: "result_not_cached" }, 409) }) as typeof fetch
    const view = { offset: 0, limit: 50, parentId: "", sortBy: "", descending: false }
    await expect(humanizationSelection("job", view)).rejects.toBeInstanceOf(ApiError)
    expect(calls).toBe(3)
    calls = 0
    globalThis.fetch = (async () => { calls++; return json({}, 404) }) as typeof fetch
    await expect(humanizationSelection("private", view)).rejects.toBeInstanceOf(ApiError)
    expect(calls).toBe(1)
  })

  test("submits the same typed snapshot and UUID for explicit recovery", async () => {
    csrf()
    const calls: RequestInit[] = []
    globalThis.fetch = (async (_path, init) => { calls.push(init!); return json({ job_id: "same-job" }) }) as typeof fetch
    const input = { display_name: "Antibody humanization", pairs: [{ id: "ab_001", vh: "ACD", vl: "EFG" }] }
    const key = crypto.randomUUID()
    await submitHumanizationJob(input, key)
    await submitHumanizationJob(input, key)
    expect(calls[0].body).toBe(calls[1].body)
    expect(calls[0].credentials).toBe("same-origin")
    expect(calls[0].headers).toMatchObject({ "Idempotency-Key": key, "X-CSRF-Token": "test-csrf" })
  })
})
