import { afterEach, expect, test } from "bun:test"
import { alphaFold3Model, alphaFold3Pae, alphaFold3Prediction, apiErrorCode } from "../src/api/client"

const originalFetch = globalThis.fetch
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document")
afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument)
  else Reflect.deleteProperty(globalThis, "document")
})

test("AF3 result reads restore evicted archives once and retain bounded query parameters", async () => {
  Object.defineProperty(globalThis, "document", { configurable: true, value: { cookie: "biomodals-csrf=offline" } })
  const calls: Array<{ path: string; init?: RequestInit }> = []
  globalThis.fetch = (async (path, init) => {
    calls.push({ path: String(path), init })
    if (String(path).endsWith("prepare-download")) return new Response(null, { status: 204 })
    return new Response(JSON.stringify(calls.length === 1 ? { code: "result_not_cached" } : { prediction_id: "immutable" }), { status: calls.length === 1 ? 409 : 200, headers: { "Content-Type": "application/json" } })
  }) as typeof fetch
  const controller = new AbortController()
  await alphaFold3Pae("job", { x_start: 1, x_end: 3, y_start: 4, y_end: 6 }, controller.signal)
  expect(calls.map((call) => call.path)).toEqual(["/api/v1/alphafold3/jobs/job/prediction/pae?x_start=1&x_end=3&y_start=4&y_end=6", "/api/v1/jobs/job/prepare-download", "/api/v1/alphafold3/jobs/job/prediction/pae?x_start=1&x_end=3&y_start=4&y_end=6"])
  expect(calls[0].init).toMatchObject({ signal: controller.signal, credentials: "same-origin", cache: "no-store" })
  expect(calls[1].init?.headers).toMatchObject({ "X-CSRF-Token": "offline" })
})

test("AF3 preview errors do not loop restoration or request scientific computation", async () => {
  Object.defineProperty(globalThis, "document", { configurable: true, value: { cookie: "biomodals-csrf=offline" } })
  let calls = 0
  globalThis.fetch = (async () => {
    calls++
    return calls === 2 ? new Response(null, { status: 204 }) : new Response(JSON.stringify({ code: "result_not_cached" }), { status: 409, headers: { "Content-Type": "application/json" } })
  }) as typeof fetch
  await expect(alphaFold3Prediction("job")).rejects.toThrow()
  expect(calls).toBe(3)
  calls = 0
  globalThis.fetch = (async () => { calls++; return new Response(JSON.stringify({ code: "preview_too_large" }), { status: 413, headers: { "Content-Type": "application/json" } }) }) as typeof fetch
  try { await alphaFold3Model("job") } catch (error) { expect(apiErrorCode(error)).toBe("preview_too_large") }
  expect(calls).toBe(1)
})
