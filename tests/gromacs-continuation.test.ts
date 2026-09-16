import { expect, test } from "bun:test"
import { continuationStorageKey, readContinuationIntent, saveContinuationIntent } from "../src/gromacs-continuation"
import { readPendingIdempotencyKey, rememberPendingIdempotencyKey } from "../src/gromacs"

test("continuation recovery keeps exact input isolated by owner and source", () => {
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
  const uuid = "11111111-1111-4111-8111-111111111111"
  rememberPendingIdempotencyKey(storage, uuid)
  const key = continuationStorageKey("owner", "source")
  const intent = { key: uuid, input: { display_name: "More MD", additional_time_ns: 250, cpu_only: true } }
  saveContinuationIntent(storage, key, intent)
  expect(readContinuationIntent(storage, key)).toEqual(intent)
  expect(readContinuationIntent(storage, continuationStorageKey("other", "source"))).toBeNull()
  expect(readContinuationIntent(storage, continuationStorageKey("owner", "other"))).toBeNull()
  saveContinuationIntent(storage, key, null)
  expect(readContinuationIntent(storage, key)).toBeNull()
  expect(readPendingIdempotencyKey(storage)).toBe(uuid)
})

test("unusable stored continuation cannot become a submission", () => {
  for (const input of [null, { additional_time_ns: 251, cpu_only: false, display_name: null }, { additional_time_ns: 1.5, cpu_only: false, display_name: null }, { additional_time_ns: 5, cpu_only: "false", display_name: null }]) {
    expect(readContinuationIntent({ getItem: () => JSON.stringify({ key: "11111111-1111-4111-8111-111111111111", input }) }, "key")).toBeNull()
  }
  expect(readContinuationIntent({ getItem: () => "{" }, "key")).toBeNull()
  expect(readContinuationIntent({ getItem: () => { throw new Error("Storage disabled") } }, "key")).toBeNull()
})
