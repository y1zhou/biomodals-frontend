import { readFile } from "node:fs/promises"
import path from "node:path"
import { expect, test } from "@playwright/test"

test("humanization uses the real offline API for 100 pairs, bounded Results, and downloads", async ({ page, context, browser }) => {
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
  const csv = "id,vh,vl\n" + Array.from({ length: 100 }, (_, index) => `ab_${String(index).padStart(3, "0")},${"A".repeat(120)},${"G".repeat(110)}`).join("\n")
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
  console.log(`Offline Result first page: ${result.rows.length}/${result.total_rows} rows, ${(await response.body()).length} bytes`)
  await expect(page.getByText("1–50 of 300 rows")).toBeVisible()
  await page.getByRole("button", { name: "Next page", exact: true }).click()
  await expect(page.getByText("51–100 of 300 rows")).toBeVisible()
  await page.getByLabel("Parent", { exact: true }).selectOption("ab_000")
  await expect(page.getByText("1–3 of 3 rows")).toBeVisible()
  for (const expected of [[1, 2, null], [2, 1, null]]) {
    const sortedPage = page.waitForResponse((next) => next.url().includes("sort_by=panel_order"))
    await page.getByRole("button", { name: "panel_order", exact: true }).click()
    expect((await (await sortedPage).json()).rows.map((row: { panel_order: number | null }) => row.panel_order)).toEqual(expected)
  }
  const originalPage = page.waitForResponse((next) => next.url().includes("/selection?") && !next.url().includes("sort_by="))
  await page.getByRole("button", { name: "Restore scientific order" }).click()
  expect((await (await originalPage).json()).rows.map((row: { panel_order: number | null }) => row.panel_order)).toEqual([null, 1, 2])
  await expect(page.getByRole("button", { name: "Download selection.csv" })).toHaveCount(0)
  const archiveDownload = page.waitForEvent("download")
  await page.getByRole("button", { name: "Download result", exact: true }).click()
  expect(await (await archiveDownload).failure()).toBeNull()
  const anonymous = await browser.newContext({ baseURL: process.env.BIOMODALS_BROWSER_ORIGIN })
  expect((await anonymous.request.get(`/api/v1/humanization/jobs/${job.job_id}/selection`)).status()).toBe(401)
  expect((await anonymous.request.get(`/api/v1/humanization/jobs/${job.job_id}/selection.csv`)).status()).toBe(401)
  await anonymous.close()
})
