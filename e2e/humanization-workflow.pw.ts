import { readFile } from "node:fs/promises"
import path from "node:path"
import { expect, test } from "@playwright/test"

const vh = "QVQLVQSGAEVKKPGASVKVSCKASGYTFTSYAMHWVRQAPGQGLEWMGWINPNSGGTNYAQKFQGRVTMTRDTSISTAYMELSRLRSDDTAVYYCARGGYFDYWGQGTLVTVSS"
const vl = "DIQMTQSPSSLSASVGDRVTITCRASQDVNTAVAWYQQKPGKAPKLLIYSASFLYSGVPSRFSGSRSGTDFTLTISSLQPEDFATYYCQQHYTTPPTFGQGTKVEIK"

test("humanization uses the real offline API for 100 pairs, bounded Results, and downloads", async ({ page, context, browser }) => {
  await page.addInitScript(() => Object.defineProperty(crypto, "randomUUID", { value: undefined }))
  test.setTimeout(90_000)
  const root = process.env.BIOMODALS_BROWSER_ROOT!
  let setup = ""
  await expect.poll(async () => {
    const stats = JSON.parse(await readFile(path.join(root, "stats.json"), "utf8"))
    setup = stats.humanization_password_link ?? ""
    return setup
  }).not.toBe("")
  await page.goto(setup)
  await page.getByLabel("New password", { exact: true }).fill("correct horse battery staple")
  await page.getByLabel("Confirm password", { exact: true }).fill("correct horse battery staple")
  await page.getByRole("button", { name: "Set password", exact: true }).click()
  await expect(page).toHaveURL(process.env.BIOMODALS_BROWSER_ORIGIN + "/")
  await page.goto("/tools/humanization/new")
  const csv = "id,vh,vl\n" + Array.from({ length: 100 }, (_, index) => `ab_${String(index).padStart(3, "0")},${index ? "A".repeat(120) : vh},${index ? "G".repeat(110) : vl}`).join("\n")
  await page.locator("#humanization-csv").setInputFiles({ name: "batch.csv", mimeType: "text/csv", buffer: Buffer.from(csv) })
  const submitted = page.waitForResponse((response) => response.url().endsWith("/api/v1/humanization/jobs") && response.request().method() === "POST")
  await page.getByRole("button", { name: "Submit humanization" }).click()
  const submission = await submitted
  const submittedAt = performance.now()
  expect(submission.status()).toBe(202)
  const job = await submission.json()
  await expect(page).toHaveURL(new RegExp(`/tools/humanization/jobs/${job.job_id}$`))
  // The offline provider completes Sapiens at 1s and Humatch at 2s,
  // while HuDiff and p-AbNatiV2 remain active until 3s and 4s.
  await page.waitForTimeout(Math.max(0, 2200 - (performance.now() - submittedAt)))
  await page.getByRole("button", { name: "Refresh", exact: true }).click()
  const stages = page.getByRole("table", { name: "Execution stages", exact: true })
  await expect(stages.locator("tbody tr")).toHaveCount(6)
  for (const model of ["Sapiens", "Humatch"]) await expect(stages.getByRole("row").filter({ hasText: model })).toContainText("Completed")
  for (const model of ["HuDiff", "p-AbNatiV2"]) await expect(stages.getByRole("row").filter({ hasText: model })).toContainText("Running")
  await page.screenshot({ path: test.info().outputPath("humanization-concurrent-stages.png"), fullPage: true })
  await expect.poll(async () => (await (await context.request.get(`/api/v1/jobs/${job.job_id}`)).json()).state, { timeout: 30_000 }).toBe("succeeded")
  const firstPage = page.waitForResponse((response) => response.url().includes(`/humanization/jobs/${job.job_id}/selection?`))
  await page.getByRole("button", { name: "Refresh", exact: true }).click()
  const response = await firstPage
  const result = await response.json()
  expect(result.rows).toHaveLength(50)
  expect(result.total_rows).toBe(300)
  expect(result.columns.length).toBeGreaterThan(20)
  const columnNames = result.columns.map((column: { name: string }) => column.name)
  const piAndGenes = ["vh_pI", "vl_pI", "vh_vl_pI", "vh_v_gene", "vh_j_gene", "vl_v_gene", "vl_j_gene"]
  expect(columnNames.slice(columnNames.indexOf("vh"), columnNames.indexOf("vh") + 9)).toEqual(["vh", "vl", ...piAndGenes])
  for (const name of piAndGenes.slice(0, 3)) expect(result.rows[0][name]).toEqual(expect.any(Number))
  expect(Object.keys(result.germlines)).toHaveLength(50)
  expect(result.reference.status).toBe("available")
  await expect(page.getByText("How are germline matches and therapeutic frequencies interpreted?", { exact: true })).toHaveCount(1)
  console.log(`Offline Result first page: ${result.rows.length}/${result.total_rows} rows, ${(await response.body()).length} bytes`)
  await expect(page.getByText("1–50 of 300 rows")).toBeVisible()
  await page.getByRole("button", { name: "Next page", exact: true }).click()
  await expect(page.getByText("51–100 of 300 rows")).toBeVisible()
  await page.getByRole("button", { name: /^Filter by parent/ }).click()
  await page.getByLabel("Parent", { exact: true }).selectOption("ab_000")
  await expect(page.getByText("1–3 of 3 rows")).toBeVisible()
  for (const expected of [[1, 2, null], [2, 1, null]]) {
    const sortedPage = page.waitForResponse((next) => next.url().includes("sort_by=panel_order"))
    await page.getByRole("button", { name: "panel_order", exact: true }).click()
    expect((await (await sortedPage).json()).rows.map((row: { panel_order: number | null }) => row.panel_order)).toEqual(expected)
  }
  const originalPage = page.waitForResponse((next) => next.url().includes("/selection?") && !next.url().includes("sort_by="))
  await page.getByRole("button", { name: "Restore default order" }).click()
  expect((await (await originalPage).json()).rows.map((row: { panel_order: number | null }) => row.panel_order)).toEqual([null, 1, 2])
  await expect(page.getByRole("button", { name: "Download selection.csv" })).toHaveCount(0)
  const archiveDownload = page.waitForEvent("download")
  await page.getByRole("button", { name: "Download result", exact: true }).click()
  expect(await (await archiveDownload).failure()).toBeNull()
  const anonymous = await browser.newContext({ baseURL: process.env.BIOMODALS_BROWSER_ORIGIN })
  expect((await anonymous.request.get(`/api/v1/humanization/jobs/${job.job_id}/selection`)).status()).toBe(401)
  expect((await anonymous.request.get(`/api/v1/humanization/jobs/${job.job_id}/selection.csv`)).status()).toBe(401)
  await anonymous.close()
  // Analyze selected native fixture chains without creating another Job.
  const beforeAnalysis = JSON.parse(await readFile(path.join(root, "stats.json"), "utf8")).submit_calls
  const table = page.getByRole("table", { name: "Humanization selection.csv, page 1", exact: true })
  const visibleNames = await table.locator("thead th > button").allTextContents()
  expect(visibleNames.slice(visibleNames.indexOf("vh"), visibleNames.indexOf("vh") + 9)).toEqual(["vh", "vl", ...piAndGenes])
  const parentDetail = page.waitForResponse((response) => response.url().endsWith("/antibody-sequence-analysis/sequence"))
  await table.getByRole("button", { name: /^Inspect VH from/ }).nth(1).click()
  const detailResponse = await parentDetail
  expect(detailResponse.request().postDataJSON().parental_sequence).toBe(vh)
  const detail = await detailResponse.json()
  const dialog = page.getByRole("dialog")
  const alignmentRows = dialog.getByRole("region", { name: "Sequence alignment", exact: true }).locator("tbody tr")
  async function checkAlignment(body: typeof detail) {
    await expect(alignmentRows.locator("th")).toHaveText(["Germline (humanized)", "Humanized relative to its germline", "Humanized", "Humanized relative to parental", "Parental", "Parental relative to its germline", "Germline (parental)"])
    for (const [index, name] of ["germline", "germline_diffs", "input", "parental_diffs", "parental", "parental_germline_diffs", "parental_germline"].entries()) expect((await alignmentRows.nth(index).locator("td").allTextContents()).join("")).toBe(body.alignment[name])
    expect(body.parental_germlines).toHaveLength(2)
    for (const reference of body.parental_germlines) for (const name of reference.reference_names) await expect(dialog.getByText(name, { exact: false }).first()).toBeVisible()
  }
  await checkAlignment(detail)
  for (const scheme of ["kabat", "chothia", "martin", "aho"]) {
    const changed = page.waitForResponse((response) => response.url().endsWith("/antibody-sequence-analysis/sequence"))
    await dialog.getByLabel("Numbering scheme").selectOption(scheme)
    await checkAlignment(await (await changed).json())
  }
  await dialog.getByRole("button", { name: "Close sequence details" }).click()
  await table.getByRole("checkbox", { name: /^Select VH from/ }).first().check()
  await table.getByRole("checkbox", { name: /^Select VL from/ }).first().check()
  await table.getByRole("checkbox", { name: /^Select VH from/ }).nth(1).check()
  await table.getByRole("checkbox", { name: /^Select VL from/ }).nth(2).check()
  await expect(page.getByRole("region", { name: "Selected antibody chains" })).toContainText("4 pairs")
  const analysis = page.waitForResponse((response) => response.url().endsWith("/antibody-sequence-analysis/analyze"))
  await page.getByRole("button", { name: "Analyze selected sequences", exact: true }).click()
  expect((await analysis).status()).toBe(200)
  await expect(page).toHaveURL(/\/tools\/antibody-sequence-analysis$/)
  await expect(page.getByRole("region", { name: "Analysis results: Group 1", exact: true }).locator("tbody tr")).toHaveCount(4)
  expect(JSON.parse(await readFile(path.join(root, "stats.json"), "utf8")).submit_calls).toBe(beforeAnalysis)
})
