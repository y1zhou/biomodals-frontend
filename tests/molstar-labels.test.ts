import { expect, test } from "bun:test"
import { readFileSync, readdirSync } from "node:fs"
import { renderToStaticMarkup } from "react-dom/server"
import { LociLabels } from "molstar/lib/mol-plugin-ui/controls"
import { MeasurementControls } from "molstar/lib/mol-plugin-ui/structure/measurements"

test("patched Molstar hover and measurement history render labels as text", () => {
  const label = '<b>LIG 1</b><img/src/onerror=alert(1)> &lt;svg/onload=alert(1)&gt;'
  const hover = renderToStaticMarkup(Reflect.apply(LociLabels.prototype.render, { state: { labels: [label, "LIG\n![image](https://example.test/private)"] } }, []))
  const history = renderToStaticMarkup(Reflect.apply(Reflect.get(MeasurementControls.prototype, "historyEntry"), { plugin: { managers: { structure: { selection: { additionsHistory: [] } } } } }, [{ id: "test", label }, 1]))
  for (const markup of [hover, history]) {
    expect(markup).toContain("LIG 1")
    expect(markup).not.toMatch(/<img\b|<svg[^>]*onload/)
    expect(markup).toContain("&amp;lt;svg")
  }
  expect(hover).toContain("![image]")
})

test("the pinned Molstar ESM and CommonJS UI have no raw HTML rendering sinks", () => {
  // Guard the dependency patch on clean installs and future version upgrades,
  // including measurement entries, help and toast labels beyond hover alone.
  for (const base of ["lib", "lib/commonjs"]) {
    const directory = new URL(`../node_modules/molstar/${base}/mol-plugin-ui/`, import.meta.url)
    for (const file of readdirSync(directory, { recursive: true })) {
      if (typeof file === "string" && file.endsWith(".js")) {
        expect(readFileSync(new URL(file, directory), "utf8")).not.toContain("dangerouslySetInnerHTML")
      }
    }
  }
})
