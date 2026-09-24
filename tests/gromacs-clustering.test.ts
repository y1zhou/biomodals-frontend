import { expect, test } from "bun:test"
import { clusteringCutoffError, clusteringStorageKey, readClusteringIntent, saveClusteringIntent } from "../src/gromacs-clustering"

test("clustering accepts finite positive cutoffs without an arbitrary upper ceiling", () => {
  for (const value of ["0.01", "2", "1e3", "10000000"]) expect(clusteringCutoffError(value)).toBeNull()
  for (const value of ["", " ", "0", "-2", "Infinity", "1e999", "bad"]) expect(clusteringCutoffError(value)).toBeTruthy()
})

test("clustering recovery preserves exact inputs privately per owner/source and rejects corrupt storage", () => {
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
  const key = clusteringStorageKey("owner", "source")
  const intent = { key: "11111111-1111-4111-8111-111111111111", input: { display_name: "Clusters", cutoff_angstrom: 0.25 } }
  saveClusteringIntent(storage, key, intent)
  expect(readClusteringIntent(storage, key)).toEqual(intent)
  expect(readClusteringIntent(storage, clusteringStorageKey("other", "source"))).toBeNull()
  expect(readClusteringIntent(storage, clusteringStorageKey("owner", "other"))).toBeNull()
  for (const input of [{ ...intent.input, cutoff_angstrom: 0 }, { ...intent.input, cutoff_angstrom: "2" }, { ...intent.input, display_name: 3 }]) {
    expect(readClusteringIntent({ getItem: () => JSON.stringify({ ...intent, input }) }, key)).toBeNull()
  }
  expect(readClusteringIntent({ getItem: () => "{" }, key)).toBeNull()
  expect(readClusteringIntent({ getItem: () => { throw Error("blocked") } }, key)).toBeNull()
  saveClusteringIntent(storage, key, null)
  expect(readClusteringIntent(storage, key)).toBeNull()
})
