import { afterEach, expect, test } from "bun:test"
import { nanobodyInputs, nanobodyOptions, nanobodySelection, prepareNanobodies } from "../src/api/client"
import { nextParentId, parseNanobodyCsv } from "../src/nanobody-humanization"

test("single-domain CSV preserves editable invalid rows and rejects malformed whole imports", () => {
  expect(parseNanobodyCsv('\uFEFFid,vhh\r\n"parent, one","a c\nd"\r\nempty,\r\ninvalid,x*')).toEqual([
    { id: "parent, one", vhh: "ACD" }, { id: "empty", vhh: "" }, { id: "invalid", vhh: "X*" },
  ])
  for (const csv of ["id,vh\nparent,ACD", "id,vhh\nparent,ACD,EFG", 'id,vhh\nparent,"ACD', 'id,vhh\nparent,"ACD"suffix', "id,vhh"]) expect(() => parseNanobodyCsv(csv)).toThrow()
  expect(nextParentId([{ id: "nb_001", vhh: "ACD" }, { id: "nb_003", vhh: "EFG" }])).toBe("nb_002")
})

const originalFetch = globalThis.fetch
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document")
afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument)
  else Reflect.deleteProperty(globalThis, "document")
})

test("preparation sends only exact ordered originals with auth, no-store and cancellation", async () => {
  Object.defineProperty(globalThis, "document", { configurable: true, value: { cookie: "biomodals-csrf=local-csrf" } })
  const calls: { path: unknown; init: RequestInit | undefined }[] = []
  globalThis.fetch = (async (path, init) => { calls.push({ path, init }); return Response.json({}) }) as typeof fetch
  const controller = new AbortController()
  const input = { parents: [{ id: "b", vhh: "ACD" }, { id: "a", vhh: "EFG" }] }
  await nanobodyOptions(controller.signal)
  await prepareNanobodies(input, controller.signal)
  expect(calls.map(({ path }) => path)).toEqual(["/api/v1/nanobody-humanization/options", "/api/v1/nanobody-humanization/prepare"])
  expect(calls[1].init).toMatchObject({ method: "POST", credentials: "same-origin", cache: "no-store", signal: controller.signal, headers: { "X-CSRF-Token": "local-csrf", "Content-Type": "application/json" }, body: JSON.stringify(input) })
  expect(calls[0].init).toMatchObject({ cache: "no-store", signal: controller.signal })
})

test("nanobody results restore once with the same bounded query; retained inputs are read-only", async () => {
  Object.defineProperty(globalThis, "document", { configurable: true, value: { cookie: "biomodals-csrf=offline" } })
  const calls: { path: string; init?: RequestInit }[] = []
  globalThis.fetch = (async (path, init) => {
    calls.push({ path: String(path), init })
    return calls.length === 1 ? Response.json({ code: "result_not_cached" }, { status: 409 }) : Response.json({})
  }) as typeof fetch
  const signal = new AbortController().signal
  await nanobodySelection("job/one", { offset: 50, limit: 50, parentId: "a & b", sortBy: "quality_tier", descending: true }, signal)
  const route = "/api/v1/nanobody-humanization/jobs/job%2Fone/selection?offset=50&limit=50&parent_id=a+%26+b&sort_by=quality_tier&descending=true"
  expect(calls.map(({ path }) => path)).toEqual([route, "/api/v1/jobs/job%2Fone/prepare-download", route])
  expect(calls[0].init).toMatchObject({ signal, cache: "no-store", credentials: "same-origin" })
  expect(calls[1].init).toMatchObject({ method: "POST", headers: { "X-CSRF-Token": "offline" } })
  await nanobodyInputs("job/one", signal)
  expect(calls[3]).toMatchObject({ path: "/api/v1/nanobody-humanization/jobs/job%2Fone/inputs", init: { signal, cache: "no-store" } })
  calls.length = 0
  globalThis.fetch = (async (path, init) => { calls.push({ path: String(path), init }); return String(path).endsWith("prepare-download") ? Response.json({}) : Response.json({ code: "result_not_cached" }, { status: 409 }) }) as typeof fetch
  await expect(nanobodySelection("job", { offset: 0, limit: 50, parentId: "", sortBy: "", descending: false })).rejects.toThrow()
  expect(calls).toHaveLength(3)
})
