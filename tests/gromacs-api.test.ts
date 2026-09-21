import { afterEach, expect, test } from "bun:test"
import { continueGromacsJob } from "../src/api/client"

const originalFetch = globalThis.fetch
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document")
afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument)
  else Reflect.deleteProperty(globalThis, "document")
})

test("continuation sends only explicit settings with CSRF and stable intent, never automatic retry", async () => {
  Object.defineProperty(globalThis, "document", { configurable: true, value: { cookie: "biomodals-csrf=offline" } })
  const calls: Array<{ path: string; init?: RequestInit }> = []
  globalThis.fetch = (async (path, init) => {
    calls.push({ path: String(path), init })
    return new Response(JSON.stringify({ detail: "Unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } })
  }) as typeof fetch
  const input = { display_name: "Extension", additional_time_ns: 250, cpu_only: false }
  await expect(continueGromacsJob("source/id", input, "same-key")).rejects.toThrow()
  expect(calls).toHaveLength(1)
  expect(calls[0].path).toBe("/api/v1/gromacs/jobs/source%2Fid/continue")
  expect(calls[0].init).toMatchObject({ method: "POST", credentials: "same-origin", headers: { "Idempotency-Key": "same-key", "X-CSRF-Token": "offline", "Content-Type": "application/json" }, body: JSON.stringify(input) })
  await expect(continueGromacsJob("source/id", input, "same-key")).rejects.toThrow()
  expect(calls[1]).toEqual(calls[0])
})
