import { expect, test } from "bun:test"
import { expandEntityRecords, newAlphaFold3Draft, newAlphaFold3Entity, regularAlphaFold3Document, reindexEntities, resizeEntityCopies } from "../src/alphafold3"
import type { CovalentBond } from "../src/alphafold3-chemistry"

function input() {
  const protein = { ...newAlphaFold3Entity("protein"), sequence: "ANSNTK" }
  const ligand = { ...newAlphaFold3Entity("ligand"), sequence: "NAG,NAG" }
  const bond: CovalentBond = { id: "bond", ends: [{ entityId: protein.id, copyId: protein.copyIds![0], position: 2, atom: "ND2" }, { entityId: ligand.id, copyId: ligand.copyIds![0], position: 1, atom: "C1" }] }
  return { ...newAlphaFold3Draft(), jobName: "Chemistry", entities: reindexEntities([protein, ligand]), bonds: [bond] }
}

test("protein PTMs and glycan attachments apply to every entity copy", () => {
  const entity = { ...resizeEntityCopies(newAlphaFold3Entity("protein"), 2), sequence: "NSN", modifications: [{ id: "ptm", position: 2, ccd: "sep" }], glycans: [{ id: "glycan", position: 1, preset: "nag" as const }] }
  const document = regularAlphaFold3Document({ ...newAlphaFold3Draft(), jobName: "Symmetric", entities: [entity] })
  expect(document.sequences).toEqual([
    { protein: { id: ["A", "B"], sequence: "NSN", modifications: [{ ptmPosition: 2, ptmType: "SEP" }] } },
    { ligand: { id: "C", ccdCodes: ["NAG"] } },
    { ligand: { id: "D", ccdCodes: ["NAG"] } },
  ])
  expect(document.bondedAtomPairs).toEqual([[["A", 1, "ND2"], ["C", 1, "C1"]], [["B", 1, "ND2"], ["D", 1, "C1"]]])
})

test("advanced bonds follow stable entity and copy identities across reorder", () => {
  const draft = input()
  expect(regularAlphaFold3Document(draft).bondedAtomPairs).toEqual([[["A", 2, "ND2"], ["B", 1, "C1"]]])
  draft.entities.reverse()
  expect(regularAlphaFold3Document(draft).bondedAtomPairs).toEqual([[["B", 2, "ND2"], ["A", 1, "C1"]]])
  draft.entities.unshift({ ...newAlphaFold3Entity("dna"), sequence: "ACT" })
  expect(regularAlphaFold3Document(draft).bondedAtomPairs).toEqual([[["C", 2, "ND2"], ["B", 1, "C1"]]])
})

test("NAG2Man3 core uses the pinned RNase B branch linkages", () => {
  const entity = { ...newAlphaFold3Entity("protein"), sequence: "ANSN", glycans: [{ id: "glycan", position: 2, preset: "core" as const }] }
  const document = regularAlphaFold3Document({ ...newAlphaFold3Draft(), jobName: "Core", entities: [entity] })
  expect(document.sequences[1]).toEqual({ ligand: { id: "B", ccdCodes: ["NAG", "NAG", "BMA", "MAN", "MAN"] } })
  // Native rnaseb_glycosylated.json at AF3 8f8abfed, remapped to A:2 / B.
  expect(document.bondedAtomPairs).toEqual([
    [["A", 2, "ND2"], ["B", 1, "C1"]],
    [["B", 1, "O4"], ["B", 2, "C1"]],
    [["B", 2, "O4"], ["B", 3, "C1"]],
    [["B", 3, "O3"], ["B", 4, "C1"]],
    [["B", 3, "O6"], ["B", 5, "C1"]],
  ])
})

test("removed copies cannot silently revive an old bond after copy growth", () => {
  const draft = input()
  draft.entities[0] = resizeEntityCopies(draft.entities[0], 2)
  draft.bonds[0].ends[0].copyId = draft.entities[0].copyIds![1]
  expect(regularAlphaFold3Document(draft).bondedAtomPairs![0][0][0]).toBe("B")
  draft.entities[0] = resizeEntityCopies(resizeEntityCopies(draft.entities[0], 1), 2)
  expect(() => regularAlphaFold3Document(draft)).toThrow("removed entity or copy")
  draft.bonds[0].ends[0].copyId = draft.entities[0].copyIds![1]
  expect(regularAlphaFold3Document(draft).bondedAtomPairs![0][0][0]).toBe("B")
  draft.entities.splice(1, 1)
  expect(() => regularAlphaFold3Document(draft)).toThrow("removed entity or copy")
})

test("bonds reject unsupported polymers, SMILES, invalid endpoints and duplicates", () => {
  const draft = input()
  draft.entities[1].type = "protein"
  draft.entities[1].sequence = "AC"
  expect(() => regularAlphaFold3Document(draft)).toThrow("Polymer–polymer")
  draft.entities[1].type = "ligand"
  draft.entities[1].sequence = "NAG,NAG"
  draft.entities[1].ligandFormat = "smiles"
  expect(() => regularAlphaFold3Document(draft)).toThrow("SMILES")
  draft.entities[1].ligandFormat = "ccd"
  draft.bonds[0].ends[0].position = 20
  expect(() => regularAlphaFold3Document(draft)).toThrow("positions")
  draft.bonds[0].ends[0].position = 2
  draft.bonds[0].ends[0].atom = ""
  expect(() => regularAlphaFold3Document(draft)).toThrow("atom name")
  draft.bonds[0].ends[0].atom = "ND2"
  draft.bonds.push({ ...draft.bonds[0], id: "duplicate", ends: [draft.bonds[0].ends[1], draft.bonds[0].ends[0]] })
  expect(() => regularAlphaFold3Document(draft)).toThrow("duplicate")
  draft.bonds = [{ ...draft.bonds[0], ends: [draft.bonds[0].ends[1], draft.bonds[0].ends[1]] }]
  expect(() => regularAlphaFold3Document(draft)).toThrow("itself")
})

test("changed chemistry is explicitly reviewed; malformed or overlapping sites remain invalid", () => {
  const draft = input()
  draft.bondsNeedReview = true
  expect(() => regularAlphaFold3Document(draft)).toThrow("Review covalent")
  draft.bondsNeedReview = false
  draft.entities[0].modifications = [{ id: "ptm", position: 3, ccd: "SEP" }]
  draft.entities[0].chemistryNeedsReview = true
  expect(() => regularAlphaFold3Document(draft)).toThrow("Review protein")
  draft.entities[0].chemistryNeedsReview = false
  draft.entities[0].glycans = [{ id: "glycan", position: 3, preset: "nag" }]
  expect(() => regularAlphaFold3Document(draft)).toThrow("only one")
  draft.entities[0].glycans[0].position = 1
  expect(() => regularAlphaFold3Document(draft)).toThrow("Asn")
  draft.entities[0].glycans[0].position = 4
  expect(regularAlphaFold3Document(draft).bondedAtomPairs).toHaveLength(2)
})

test("legacy drafts gain copy identities without changing their scientific JSON", () => {
  const old = { ...newAlphaFold3Entity("protein"), sequence: "ACDE", copies: 2, copyIds: undefined }
  const restored = reindexEntities([old])
  expect(restored[0].copyIds).toHaveLength(2)
  expect(regularAlphaFold3Document({ ...newAlphaFold3Draft(), jobName: "Restored", entities: restored }).sequences).toEqual([{ protein: { id: ["A", "B"], sequence: "ACDE" } }])
  const annotated = { ...restored[0], modifications: [{ id: "ptm", position: 2, ccd: "SEP" }] }
  expect(() => expandEntityRecords([annotated], 0, [{ description: "first", sequence: "AS" }, { description: "second", sequence: "AT" }])).toThrow("separately")
})
