import { expect, test, type Page } from "@playwright/test"

async function api(page: Page, supported = true) {
  await page.context().addCookies([{ name: "biomodals-csrf", value: "fixture", url: process.env.BIOMODALS_BROWSER_ORIGIN! }])
  await page.route("**/api/**", (route) => route.fulfill({ json: new URL(route.request().url()).pathname.endsWith("/auth/me") ? { user_id: "chemistry-owner", display_name: "Researcher", email: "chemistry@example.test", is_admin: false } : { detail: "Unexpected offline request" } }))
  await page.route("**/alphafold3/capabilities", (route) => route.fulfill({ status: supported ? 200 : 404, json: supported ? { chemistry_preflight: 1 } : { detail: "Not Found" } }))
}

async function editor(page: Page, supported = true) {
  await api(page, supported)
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

test("missing chemistry capability preserves editable input and blocks Continue until explicit check", async ({ page }) => {
  await editor(page, false)
  const posts: string[] = []
  page.on("request", (request) => { if (request.method() === "POST") posts.push(request.url()) })
  await expect(page.getByRole("alert")).toContainText("updated API")
  await expect(page.getByRole("button", { name: "Continue and preview job" })).toBeDisabled()
  await expect(page.getByLabel("Job name", { exact: true })).toHaveValue("Chemistry input")
  await page.route("**/alphafold3/capabilities", (route) => route.fulfill({ json: { chemistry_preflight: 1 } }))
  await page.getByRole("button", { name: "Check again", exact: true }).click()
  await expect(page.getByRole("button", { name: "Continue and preview job" })).toBeEnabled()
  expect(posts).toEqual([])
})

test("preflight rejection, incompatible deployment, busy service and timeout preserve the draft for explicit retry", async ({ page }) => {
  await editor(page)
  let validations = 0
  for (const [status, code] of [[400, "chemistry_invalid"], [409, "deployment_incompatible"], [503, "chemistry_unavailable"], [504, "chemistry_timeout"]] as const) {
    await page.route("**/alphafold3/validations?*", (route) => { validations++; return route.fulfill({ status, json: { code, detail: `Offline ${code}` } }) })
    await page.getByRole("button", { name: "Continue and preview job" }).click()
    await expect(page.getByRole("alert")).toHaveText(`Offline ${code}`)
    await expect(page.getByRole("button", { name: "Continue and preview job" })).toBeEnabled()
    await expect(page.getByLabel("Job name", { exact: true })).toHaveValue("Chemistry input")
  }
  expect(validations).toBe(4)
})

test("checked chemistry details and changed deployment require a fresh explicit Continue", async ({ page }) => {
  await editor(page)
  await page.getByText("Protein modifications and glycans", { exact: true }).click()
  await page.getByRole("button", { name: "Add PTM", exact: true }).click()
  await page.getByRole("group", { name: "PTM 1", exact: true }).getByLabel("Input position", { exact: true }).fill("3")
  await page.getByRole("button", { name: "Add N-linked glycan", exact: true }).click()
  await page.getByLabel("Asn input position", { exact: true }).fill("2")
  await page.getByRole("combobox", { name: "Glycan preset", exact: true }).selectOption("core")
  const documents: object[] = []
  let submissions = 0
  await page.route("**/alphafold3/validations?*", (route) => {
    const document = route.request().postDataJSON()
    documents.push(document)
    return route.fulfill({ status: 201, json: { validation_id: `checked-${documents.length}`, chemistry_checked: true, chemistry: { modifications: [{ ids: ["A"], entity_type: "protein", position: 3, ccd_code: "SEP" }], ligands: [{ ids: ["B"], ccd_codes: ["NAG", "NAG", "BMA", "MAN", "MAN"] }], bonds: document.bondedAtomPairs, custom_ccd: false }, preview: { name: document.name, entities: [], seeds: [1], warnings: [] } } })
  })
  await page.route("**/alphafold3/validations/checked-*", (route) => route.fulfill({ status: 204 }))
  await page.route("**/alphafold3/jobs", (route) => { submissions++; return route.fulfill({ status: 409, json: { code: "chemistry_revalidation_required", detail: "The prediction deployment changed; repeat Continue to check chemistry" } }) })
  await page.getByRole("button", { name: "Continue and preview job" }).click()
  const chemistry = page.getByRole("region", { name: "Chemistry review", exact: true })
  await expect(chemistry).toContainText("Native component and atom checks passed")
  await expect(chemistry.getByRole("table", { name: "Residue modifications", exact: true }).locator("tbody tr")).toHaveText("Aprotein3SEP")
  await expect(chemistry).toContainText("1: NAG · 2: NAG · 3: BMA · 4: MAN · 5: MAN")
  await expect(chemistry).toContainText("A / 2 / ND2 ↔ B / 1 / C1")
  await expect(chemistry).toContainText("B / 3 / O6 ↔ B / 5 / C1")
  await page.getByRole("button", { name: "Submit prediction", exact: true }).click()
  await expect(page.getByRole("alert")).toContainText("checked again")
  await expect(page.getByRole("button", { name: "Submit prediction", exact: true })).toBeDisabled()
  expect(submissions).toBe(1)
  expect(documents).toHaveLength(1)
  await page.getByRole("button", { name: "Back to edit", exact: true }).click()
  await page.getByRole("button", { name: "Continue and preview job" }).click()
  await expect(page.getByRole("button", { name: "Submit prediction", exact: true })).toBeEnabled()
  expect(documents).toHaveLength(2)
  expect(documents[1]).toEqual(documents[0])
  expect(submissions).toBe(1)
})

test("historical retained chemistry without a native receipt must be rechecked", async ({ page }) => {
  await api(page)
  await page.addInitScript(() => sessionStorage.setItem("biomodals:alphafold3:validation:chemistry-owner", "historical"))
  await page.route("**/alphafold3/validations/historical", (route) => route.fulfill({ json: { validation_id: "historical", chemistry: null, chemistry_checked: false, preview: { name: "Historical chemistry", entities: [{ type: "ligand", ids: ["B"], copies: 1 }], seeds: [1], advanced_counts: { modifications: 0, bonds: 1 }, warnings: [] } } }))
  await page.goto("/tools/alphafold3/new")
  await expect(page.getByRole("heading", { name: "Confirm AlphaFold3 job" })).toBeVisible()
  await expect(page.getByRole("alert")).toContainText("checked again")
  await expect(page.getByRole("button", { name: "Submit prediction", exact: true })).toBeDisabled()
  await expect(page.getByRole("button", { name: "Back to edit", exact: true })).toBeEnabled()
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
