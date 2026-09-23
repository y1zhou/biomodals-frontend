import { expect, test } from "bun:test"
import { selectChain, selectedEntries, selectedFasta, selectionCounts, type SelectedChain } from "../src/antibody-selection"

const chain = (parentId: string, role: "vh" | "vl", sequence: string, id = sequence): SelectedChain => ({ parentId, role, sequence, candidateIds: [id] })

test("exact chain identity is scoped by parent and role, with origin deduplication", () => {
  let selected = selectChain([], chain("parent-a", "vh", "AAA", "one"), true)
  selected = selectChain(selected, chain("parent-a", "vh", "AAA", "two"), true)
  selected = selectChain(selected, chain("parent-a", "vh", "AAA", "two"), true)
  selected = selectChain(selected, chain("parent-b", "vh", "AAA"), true)
  selected = selectChain(selected, chain("parent-a", "vl", "AAA"), true)
  expect(selected).toHaveLength(3)
  expect(selected[0].candidateIds).toEqual(["one", "two"])
  expect(selectChain(selected, chain("parent-a", "vh", "AAA"), false)).toEqual(selected.slice(1))
})

test("combinations stay within parent, singleton roles stay standalone, and ranks never transfer", () => {
  const selected = [chain("a", "vh", "AAA"), chain("a", "vh", "CCC"), chain("a", "vl", "DDD"), chain("a", "vl", "EEE"), chain("a", "vl", "FFF"), chain("b", "vh", "GGG"), chain("c", "vl", "HHH")]
  expect(selectionCounts(selected)).toEqual({ pairs: 6, singles: 2 })
  const entries = selectedEntries(selected, 8)
  expect(entries[0]).toMatchObject({ parentId: "a", vhOrigins: ["AAA"], vlOrigins: ["DDD"] })
  expect(entries.map(({ vh, vl }) => [vh, vl])).toEqual([["AAA", "DDD"], ["AAA", "EEE"], ["AAA", "FFF"], ["CCC", "DDD"], ["CCC", "EEE"], ["CCC", "FFF"], ["GGG", undefined], [undefined, "HHH"]])
  expect(entries.at(-1)?.parentId).toBe("c")
  expect(entries.every((entry) => !("quality_tier" in entry) && !("panel_order" in entry))).toBe(true)
  expect(selectedFasta(entries)).toContain(">selected_0001\nAAA:DDD")
  expect(selectedFasta(entries)).toEndWith(">selected_0008\nHHH")
})

test("enforces the supplied output limit before Cartesian expansion", () => {
  const selected = ["a", "b"].flatMap((parent) => [
    ...Array.from({ length: 20 }, (_, i) => chain(parent, "vh", `H${i}`)),
    ...Array.from({ length: 25 }, (_, i) => chain(parent, "vl", `L${i}`)),
  ])
  expect(selectedEntries(selected, 1000)).toHaveLength(1000)
  expect(() => selectedEntries([...selected, chain("c", "vh", "AAA")], 1000)).toThrow("1001 entries")
  expect(selectedEntries([], 1000)).toEqual([])
})
