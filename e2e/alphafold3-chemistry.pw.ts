import { expect, test, type Page } from "@playwright/test"

async function editor(page: Page) {
  await page.context().addCookies([{ name: "biomodals-csrf", value: "fixture", url: process.env.BIOMODALS_BROWSER_ORIGIN! }])
  await page.route("**/api/**", (route) => route.fulfill({ json: new URL(route.request().url()).pathname.endsWith("/auth/me") ? { user_id: "chemistry-owner", display_name: "Researcher", email: "chemistry@example.test", is_admin: false } : { detail: "Unexpected offline request" } }))
  await page.goto("/tools/alphafold3/new")
  await page.getByLabel("Job name", { exact: true }).fill("Chemistry input")
  await page.getByLabel("Sequence or FASTA records", { exact: true }).fill("ANSNTK")
  await page.getByLabel("Job name", { exact: true }).click()
}

test("Regular chemistry applies to all copies, retains sites for review and freezes during preflight", async ({ page }) => {
  await editor(page)
  await page.getByLabel("Copies", { exact: true }).fill("2")
  await page.getByText("Protein modifications and glycans", { exact: true }).click()
  await page.getByRole("button", { name: "Add PTM", exact: true }).click()
  await page.getByRole("group", { name: "PTM 1", exact: true }).getByLabel("Input position", { exact: true }).fill("3")
  await page.getByRole("button", { name: "Add N-linked glycan", exact: true }).click()
  await page.getByLabel("Asn input position", { exact: true }).fill("2")
  await expect(page.getByText(/AN\[S\]NTK/)).toBeVisible()
  await expect(page.getByText(/A\[N\]SNTK/)).toBeVisible()
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const documents: unknown[] = []
  await page.route("**/alphafold3/validations?*", async (route) => {
    documents.push(route.request().postDataJSON())
    await gate
    await route.fulfill({ status: 422, json: { detail: "Offline chemistry check stopped before prediction" } })
  })
  await page.getByRole("button", { name: "Continue and preview job" }).click()
  await expect(page.getByRole("status", { name: "" }).filter({ hasText: "Checking modifications and covalent bonds" })).toBeVisible()
  await expect(page.getByLabel("Job name", { exact: true })).toBeDisabled()
  await expect.poll(() => documents.length).toBe(1)
  expect(documents[0]).toMatchObject({ sequences: [
    { protein: { id: ["A", "B"], sequence: "ANSNTK", modifications: [{ ptmType: "SEP", ptmPosition: 3 }] } },
    { ligand: { id: "C", ccdCodes: ["NAG"] } }, { ligand: { id: "D", ccdCodes: ["NAG"] } },
  ], bondedAtomPairs: [[["A", 2, "ND2"], ["C", 1, "C1"]], [["B", 2, "ND2"], ["D", 1, "C1"]]] })
  release()
  await expect(page.getByText("Offline chemistry check stopped before prediction", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: /6 residues · click to edit/ }).click()
  await page.getByLabel("Sequence or FASTA records", { exact: true }).fill("ANSTNK")
  await page.getByLabel("Job name", { exact: true }).click()
  await expect(page.getByText("The sequence or copies changed. Check all positions and components before continuing.", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Continue and preview job" }).click()
  await expect(page.getByText("Review protein modifications and glycan sites after changing the sequence or copies.", { exact: true })).toBeVisible()
  expect(documents).toHaveLength(1)
  await page.getByRole("button", { name: "I reviewed these sites", exact: true }).click()
  await page.getByRole("button", { name: "Continue and preview job" }).click()
  await expect.poll(() => documents.length).toBe(2)
  expect(documents[1]).toMatchObject({ sequences: [{ protein: { sequence: "ANSTNK", modifications: [{ ptmType: "SEP", ptmPosition: 3 }] } }, { ligand: { ccdCodes: ["NAG"] } }, { ligand: { ccdCodes: ["NAG"] } }] })
})

test("advanced bond targets survive entity reorder and removed endpoints stay explicit", async ({ page }) => {
  await editor(page)
  await page.getByRole("button", { name: "Add entity", exact: true }).click()
  await page.getByRole("combobox", { name: "Entity type", exact: true }).nth(1).click()
  await page.getByRole("option", { name: "Ligand", exact: true }).click()
  await page.getByLabel("Ligand definition", { exact: true }).fill("NAG")
  await page.getByText("Advanced covalent bonds", { exact: true }).click()
  await page.getByRole("button", { name: "Add covalent bond", exact: true }).click()
  await page.getByRole("combobox", { name: "Endpoint 1 chain", exact: true }).selectOption({ label: "A · protein entity 1, copy 1" })
  await page.getByLabel("Endpoint 1 position", { exact: true }).fill("2")
  await page.getByLabel("Endpoint 1 atom", { exact: true }).fill("ND2")
  await page.getByRole("combobox", { name: "Endpoint 2 chain", exact: true }).selectOption({ label: "B · ligand entity 2, copy 1" })
  await page.getByLabel("Endpoint 2 position", { exact: true }).fill("1")
  await page.getByLabel("Endpoint 2 atom", { exact: true }).fill("C1")
  await page.getByRole("button", { name: "Move entity up", exact: true }).nth(1).click()
  const documents: { bondedAtomPairs: unknown }[] = []
  await page.route("**/alphafold3/validations?*", async (route) => { documents.push(route.request().postDataJSON()); await route.fulfill({ status: 422, json: { detail: "Stopped before prediction" } }) })
  await page.getByRole("button", { name: "Continue and preview job" }).click()
  await expect.poll(() => documents.length).toBe(1)
  expect(documents[0].bondedAtomPairs).toEqual([[["B", 2, "ND2"], ["A", 1, "C1"]]])
  await expect(page.getByText("Stopped before prediction", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Remove entity", exact: true }).first().click()
  await expect(page.getByRole("combobox", { name: "Endpoint 2 chain", exact: true }).locator("option:checked")).toHaveText("Removed copy — choose again")
  await page.getByRole("button", { name: "I reviewed these bonds", exact: true }).click()
  await page.getByRole("button", { name: "Continue and preview job" }).click()
  await expect(page.getByText("A covalent bond refers to a removed entity or copy. Choose its endpoint again or remove the bond.", { exact: true })).toBeVisible()
  expect(documents).toHaveLength(1)
})
