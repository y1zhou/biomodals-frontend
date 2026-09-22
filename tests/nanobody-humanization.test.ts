import { afterEach, expect, test } from "bun:test"
import { nanobodyOptions, prepareNanobodies } from "../src/api/client"
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
