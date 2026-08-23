import { describe, expect, test } from "bun:test"

import {
  chainId,
  expertAlphaFold3Document,
  newPolymerEntity,
  parseModelSeeds,
  parsePolymerSequence,
  regularAlphaFold3Document,
  resizeEntityCopies,
} from "../src/alphafold3"

describe("AlphaFold3 input builder", () => {
  test("allocates monotonic spreadsheet-style chain IDs", () => {
    expect([0, 25, 26, 27, 701].map(chainId)).toEqual([
      "A",
      "Z",
      "AA",
      "AB",
      "ZZ",
    ])
    const original = newPolymerEntity("protein", 0)
    const expanded = resizeEntityCopies(original, 3, 1)
    const shrunk = resizeEntityCopies(expanded.entity, 1, expanded.nextChainIndex)

    expect(expanded.entity.chainIds).toEqual(["A", "B", "C"])
    expect(shrunk.nextChainIndex).toBe(3)
  })

  test("normalizes one sequence or FASTA record", () => {
    expect(parsePolymerSequence(">chain A\nac de\nfg")).toBe("ACDEFG")
    expect(() => parsePolymerSequence(">a\nAC\n>b\nDE")).toThrow(
      "one FASTA record"
    )
  })

  test("expands compact model seed ranges", () => {
    expect(parseModelSeeds("1, 3-5, 3")).toEqual([1, 3, 4, 5])
    expect(parseModelSeeds("0-5000")).toHaveLength(5001)
    expect(() => parseModelSeeds("5-3")).toThrow("ascending")
  })

  test("constructs a native regular-mode document", () => {
    const entity = newPolymerEntity("dna", 0)
    const document = regularAlphaFold3Document({
      entities: [{ ...entity, sequence: "acgt" }],
      jobName: "Example",
      mode: "regular",
      nextChainIndex: 1,
      recycle: 10,
      sample: 5,
      searchMsa: true,
      searchProteinTemplates: true,
      seeds: "1-2",
    })

    expect(document).toEqual({
      dialect: "alphafold3",
      modelSeeds: [1, 2],
      name: "Example",
      sequences: [{ dna: { id: ["A"], sequence: "ACGT" } }],
      version: 1,
    })
  })

  test("replaces an expert document name without changing other fields", () => {
    expect(
      expertAlphaFold3Document(
        '{"name":"old","modelSeeds":[1],"sequences":[]}',
        "New name"
      )
    ).toEqual({ name: "New name", modelSeeds: [1], sequences: [] })
  })
})
