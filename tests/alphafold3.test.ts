import { describe, expect, test } from "bun:test"

import {
  chainId,
  expertAlphaFold3Document,
  expertAlphaFold3ModelSeeds,
  expandEntityRecords,
  MAX_ENTITY_COPIES,
  newAlphaFold3Entity,
  parsePolymerRecords,
  parseModelSeeds,
  reindexEntities,
  regularAlphaFold3Document,
  resizeEntityCopies,
} from "../src/alphafold3"

describe("AlphaFold3 input builder", () => {
  test("allocates sequential spreadsheet-style chain IDs", () => {
    expect([0, 25, 26, 27, 701].map(chainId)).toEqual([
      "A",
      "Z",
      "AA",
      "AB",
      "ZZ",
    ])
    const first = resizeEntityCopies(newAlphaFold3Entity("protein"), 2)
    const second = newAlphaFold3Entity("dna")
    const expanded = reindexEntities([first, second])
    const shrunk = reindexEntities([
      resizeEntityCopies(expanded[0], 1),
      expanded[1],
    ])
    const reordered = reindexEntities([shrunk[1], shrunk[0]])

    expect(expanded.map((entity) => entity.chainIds)).toEqual([["A", "B"], ["C"]])
    expect(shrunk.map((entity) => entity.chainIds)).toEqual([["A"], ["B"]])
    expect(reordered.map((entity) => entity.chainIds)).toEqual([["A"], ["B"]])
  })

  test("parses multi-record FASTA descriptions", () => {
    expect(parsePolymerRecords(">alpha chain\nac de\n>beta chain\nfg hi")).toEqual([
      { description: "alpha chain", sequence: "ACDE" },
      { description: "beta chain", sequence: "FGHI" },
    ])
    expect(parsePolymerRecords("ac de\nfg")).toEqual([
      { description: "", sequence: "ACDEFG" },
    ])
  })

  test("expands FASTA records into sequential one-copy entities", () => {
    const entities = reindexEntities([
      newAlphaFold3Entity("protein"),
      newAlphaFold3Entity("dna"),
    ])
    const expanded = expandEntityRecords(
      entities,
      0,
      parsePolymerRecords(">first\nACDE\n>second\nFGHI\n>third\nKLMN")
    )

    expect(expanded.map((entity) => ({
      description: entity.description,
      ids: entity.chainIds,
      sequence: entity.sequence,
      type: entity.type,
    }))).toEqual([
      { description: "first", ids: ["A"], sequence: "ACDE", type: "protein" },
      { description: "second", ids: ["B"], sequence: "FGHI", type: "protein" },
      { description: "third", ids: ["C"], sequence: "KLMN", type: "protein" },
      { description: "", ids: ["D"], sequence: "", type: "dna" },
    ])
  })

  test("expands compact model seed ranges", () => {
    expect(parseModelSeeds("1, 3-5, 3")).toEqual([1, 3, 4, 5])
    expect(parseModelSeeds("0-999")).toHaveLength(1000)
    expect(() => parseModelSeeds("0-1000")).toThrow("1,000")
    expect(() => parseModelSeeds("0-4294967295")).toThrow("1,000")
    expect(() => parseModelSeeds("5-3")).toThrow("ascending")
  })

  test("retains supported three-digit entity copy counts", () => {
    expect(resizeEntityCopies(newAlphaFold3Entity("protein"), 100).copies).toBe(100)
    expect(
      resizeEntityCopies(newAlphaFold3Entity("protein"), MAX_ENTITY_COPIES + 1).copies
    ).toBe(MAX_ENTITY_COPIES)
  })

  test("constructs a native regular-mode document", () => {
    const entity = newAlphaFold3Entity("dna")
    const document = regularAlphaFold3Document({
      entities: [{ ...entity, description: "DNA target", sequence: "acgt" }],
      jobName: "Example",
      mode: "regular",
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
      sequences: [{ dna: { description: "DNA target", id: ["A"], sequence: "ACGT" } }],
      version: 1,
    })
  })

  test("writes FASTA headers into native entity descriptions", () => {
    const document = regularAlphaFold3Document({
      entities: [{
        ...newAlphaFold3Entity("protein"),
        sequence: ">heavy chain\nACDE\n>light chain\nFGHI",
      }],
      jobName: "Antibody",
      mode: "regular",
      recycle: 10,
      sample: 5,
      searchMsa: true,
      searchProteinTemplates: true,
      seeds: "1",
    })

    expect(document.sequences).toEqual([
      { protein: { description: "heavy chain", id: ["A"], sequence: "ACDE" } },
      { protein: { description: "light chain", id: ["B"], sequence: "FGHI" } },
    ])
  })

  test("constructs CCD-code and SMILES ligand entities", () => {
    const document = regularAlphaFold3Document({
      entities: reindexEntities([
        {
          ...newAlphaFold3Entity("ligand"),
          copies: 2,
          ligandFormat: "ccd",
          sequence: "ATP, MG",
        },
        {
          ...newAlphaFold3Entity("ligand"),
          ligandFormat: "smiles",
          sequence: "CC(=O)O",
        },
      ]),
      jobName: "Ligands",
      mode: "regular",
      recycle: 10,
      sample: 5,
      searchMsa: true,
      searchProteinTemplates: true,
      seeds: "1",
    })

    expect(document.sequences).toEqual([
      { ligand: { ccdCodes: ["ATP", "MG"], id: ["A", "B"] } },
      { ligand: { id: ["C"], smiles: "CC(=O)O" } },
    ])
  })

  test("loads and applies expert document model seeds", () => {
    const input = '{"name":"old","modelSeeds":[7,11],"sequences":[]}'

    expect(expertAlphaFold3ModelSeeds(input)).toBe("7,11")
    expect(
      expertAlphaFold3Document(
        input,
        "New name",
        "2-3"
      )
    ).toEqual({ name: "New name", modelSeeds: [2, 3], sequences: [] })
  })
})
