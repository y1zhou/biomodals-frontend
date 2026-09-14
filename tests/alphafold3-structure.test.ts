import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { CIF } from "molstar/lib/mol-io/reader/cif"
import { trajectoryFromMmCIF } from "molstar/lib/mol-model-formats/structure/mmcif"
import { Structure, StructureElement } from "molstar/lib/mol-model/structure"
import { ElementSymbolColorTheme, ElementSymbolColorThemeProvider } from "molstar/lib/mol-theme/color/element-symbol"
import { alphaFold3ConfidenceTheme, findAlphaFold3Residue, plddtColor } from "../src/alphafold3-structure"

test("native token mapping resolves polymer and ligand auth residue indices without atom-order assumptions", async () => {
  const parsed = await CIF.parseText(readFileSync(new URL("../e2e/fixtures/alphafold3-preview.cif", import.meta.url), "utf8")).run()
  if (parsed.isError) throw new Error(parsed.message)
  const model = (await trajectoryFromMmCIF(parsed.result.blocks[0]).run()).representative
  expect(findAlphaFold3Residue(model, "A", 1)).toEqual({ name: "ALA", plddt: 92 })
  expect(findAlphaFold3Residue(model, "B", 2)?.name).toBe("DC")
  expect(findAlphaFold3Residue(model, "C", 1)).toEqual({ name: "LIG", plddt: 70 })
  expect(findAlphaFold3Residue(model, "C", 99)).toBeUndefined()
  expect(plddtColor(null)).not.toBe(plddtColor(0))
  expect(plddtColor(90)).toBe(0x65cbf3)
  expect(plddtColor(70)).toBe(0xffdb13)
  expect(plddtColor(50)).toBe(0xff7d45)
  const structure = Structure.ofModel(model)
  const unit = structure.units.find((candidate) => Array.from(candidate.elements).includes(5))!
  const ligandCarbon = StructureElement.Location.create(structure, unit, 5)
  const elemental = ElementSymbolColorTheme({ structure }, { ...ElementSymbolColorThemeProvider.defaultValues, carbonColor: { name: "element-symbol", params: {} } })
  expect(alphaFold3ConfidenceTheme.factory({ structure }, {}).color(ligandCarbon, false)).toBe(elemental.color(ligandCarbon, false))
})
