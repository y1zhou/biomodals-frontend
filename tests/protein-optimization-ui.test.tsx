import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import ProteinOptimizationInputs, { ProteinOptimizationMode, ProteinOptimizationParents } from "../src/components/ProteinOptimizationInputs"
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

test("measurement guidance uses normalized mutant labels and keeps original rows editable", () => {
  const markup = renderToStaticMarkup(<ProteinOptimizationInputs {...input} />)
  expect(markup).toContain("already-normalized labels")
  expect(markup).toContain("plate or batch effects")
  expect(markup).toContain("log10(mutant KD) - log10(parent KD)")
  expect(markup).toContain("Lower label is better")
  expect(markup).toContain("variant_1,A:Y52F,-0.3")
  expect(markup).toContain("&gt;1000")
  expect(markup).toContain("A:Y52F,B:S30A")
})

test("Exploration parent entry waits for discovery and preserves full supplied chains", () => {
  const pending = renderToStaticMarkup(<ProteinOptimizationParents {...input} requiredChains={undefined} />)
  expect(pending).toMatch(/id="optimization-parents"[^>]*disabled=""/)
  expect(pending).toContain("ACDM")
  const ready = renderToStaticMarkup(<ProteinOptimizationParents {...input} requiredChains={["A", "B"]} />)
  expect(ready).toContain("Required chain IDs:")
  expect(ready).toContain("<code>A</code>")
  expect(ready).toContain("<code>B</code>")
  expect(ready).toMatch(/id="optimization-parents"[^>]*spellCheck="false"/)
  expect(ready.match(/<textarea[^>]*disabled/g) ?? []).toHaveLength(0)
})

test("parent-only observations can proceed to explicitly named parental chains", () => {
  const markup = renderToStaticMarkup(<ProteinOptimizationParents {...input} requiredChains={[]} />)
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
    expect(markup).toContain("Table-only additive ridge at observed mutated sites")
  }
})

test("generic full-chain result inspection retains terminal and C/M residues safely", () => {
  const sequence = "MCCADEFGHIKLMNPQRSTVWYHHHHHH"
  const markup = renderToStaticMarkup(<ProteinSequenceValue chainId={'protein<alpha>'} sequence={sequence} />)
  expect(markup).toContain(sequence)
  expect(markup).toContain(`${sequence.length} residues`)
  expect(markup).toContain("Copy sequence for chain protein&lt;alpha&gt;")
})
