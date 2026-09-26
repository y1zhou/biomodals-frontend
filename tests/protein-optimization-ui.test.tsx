import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import ProteinOptimizationInputs, { ProteinOptimizationMode } from "../src/components/ProteinOptimizationInputs"
import ProteinSequenceValue from "../src/components/ProteinSequenceValue"

const input = {
  measurements: 'id,mutations,label\ninvalid,"A:Y52F,B:S30A",>1000',
  parentalFasta: ">A\nACDM\n>B\nMCAA",
  maxMeasurementBytes: 4096,
  maxFastaBytes: 2048,
  onMeasurementsChange() {},
  onParentalFastaChange() {},
  onReadingChange() {},
}

test("parent entry waits for chain discovery while all original text stays editable", () => {
  const pending = renderToStaticMarkup(<ProteinOptimizationInputs {...input} requiredChains={undefined} />)
  expect(pending).toMatch(/id="optimization-parents"[^>]*disabled=""/)
  expect(pending).toContain("&gt;1000")
  expect(pending).toContain("A:Y52F,B:S30A")
  expect(pending).toContain("ACDM")
  const ready = renderToStaticMarkup(<ProteinOptimizationInputs {...input} requiredChains={["A", "B"]} />)
  expect(ready).toContain("Required chain IDs:")
  expect(ready).toContain("<code>A</code>")
  expect(ready).toContain("<code>B</code>")
  expect(ready).toMatch(/id="optimization-parents"[^>]*spellCheck="false"/)
  expect(ready.match(/<textarea[^>]*disabled/g) ?? []).toHaveLength(0)
})

test("parent-only observations can proceed to explicitly named parental chains", () => {
  const markup = renderToStaticMarkup(<ProteinOptimizationInputs {...input} requiredChains={[]} />)
  expect(markup).toContain("No mutated chains were found")
  expect(markup.match(/<textarea[^>]*disabled/g) ?? []).toHaveLength(0)
})

test("mode chooser checks exactly one mode and explains distinct sampling policies", () => {
  for (const exploration of [false, true]) {
    const markup = renderToStaticMarkup(<ProteinOptimizationMode exploration={exploration} onChange={() => {}} />)
    expect(markup.match(/checked=""/g)).toHaveLength(1)
    expect(markup).toContain("oversized requests are rejected rather than sampled")
    expect(markup).toContain("reproducibly sampled within the evaluation budget")
    expect(markup).toContain("Neither prediction is experimental confirmation")
  }
})

test("generic full-chain result inspection retains terminal and C/M residues safely", () => {
  const sequence = "MCCADEFGHIKLMNPQRSTVWYHHHHHH"
  const markup = renderToStaticMarkup(<ProteinSequenceValue chainId={'protein<alpha>'} sequence={sequence} />)
  expect(markup).toContain(sequence)
  expect(markup).toContain(`${sequence.length} residues`)
  expect(markup).toContain("Copy sequence for chain protein&lt;alpha&gt;")
})
