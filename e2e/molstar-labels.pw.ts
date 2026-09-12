import { readFileSync } from "node:fs"
import { expect, test } from "@playwright/test"
import { renderToStaticMarkup } from "react-dom/server"
import { CIF } from "molstar/lib/mol-io/reader/cif.js"
import { trajectoryFromMmCIF } from "molstar/lib/mol-model-formats/structure/mmcif.js"
import { Structure, StructureElement } from "molstar/lib/mol-model/structure.js"
import { elementLabel } from "molstar/lib/mol-theme/label.js"
import { LociLabels } from "molstar/lib/mol-plugin-ui/controls.js"
import { MeasurementControls } from "molstar/lib/mol-plugin-ui/structure/measurements.js"

test("native CCD identifiers cannot execute script in Molstar hover or measurement history", async ({ page }) => {
  const identifier = "<img/src/onerror=window.af3LabelExecuted=true>"
  const source = readFileSync(new URL("./fixtures/alphafold3-preview.cif", import.meta.url), "utf8").replaceAll("LIG", identifier)
  const parsed = await CIF.parseText(source).run()
  if (parsed.isError) throw new Error(parsed.message)
  const model = (await trajectoryFromMmCIF(parsed.result.blocks[0]).run()).representative
  const structure = Structure.ofModel(model)
  const unit = structure.units.find((candidate) => Array.from(candidate.elements).includes(5))!
  const label = elementLabel(StructureElement.Location.create(structure, unit, 5), { granularity: "residue" })
  expect(label).toContain(identifier)
  const hover = renderToStaticMarkup(Reflect.apply(LociLabels.prototype.render, { state: { labels: [label] } }, []))
  const history = renderToStaticMarkup(Reflect.apply(Reflect.get(MeasurementControls.prototype, "historyEntry"), { plugin: { managers: { structure: { selection: { additionsHistory: [] } } } } }, [{ id: "test", label }, 1]))
  await page.route("**/*", (route) => route.abort())
  await page.setContent(`<div id="labels">${hover}${history}</div>`)
  await expect(page.locator("#labels")).toContainText("1")
  await expect(page.locator("#labels img, #labels svg[onload]")).toHaveCount(0)
  expect(await page.evaluate(() => Reflect.get(window, "af3LabelExecuted"))).toBeUndefined()
})
