import { readFile } from "node:fs/promises"
import path from "node:path"
import { expect, test } from "@playwright/test"

test.use({ viewport: { width: 1440, height: 1080 }, launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } })

test("completed offline AF3 publication loads the exact best prediction, native CIF and PAE", async ({ page }) => {
  test.setTimeout(60_000)
  const stats = JSON.parse(await readFile(path.join(process.env.BIOMODALS_BROWSER_ROOT!, "stats.json"), "utf8"))
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  const scientificSubmissions: string[] = []
  page.on("request", (request) => { if (request.method() === "POST" && request.url().endsWith("/alphafold3/jobs")) scientificSubmissions.push(request.url()) })
  await page.goto(stats.alphafold3_password_link)
  await page.getByLabel("New password", { exact: true }).fill("correct horse battery staple")
  await page.getByLabel("Confirm password", { exact: true }).fill("correct horse battery staple")
  await page.getByRole("button", { name: "Set password", exact: true }).click()
  await expect(page).toHaveURL(process.env.BIOMODALS_BROWSER_ORIGIN + "/")
  const summaryResponse = page.waitForResponse((response) => response.url().endsWith(`/alphafold3/jobs/${stats.alphafold3_job_id}/prediction`))
  await page.goto(`/tools/alphafold3/jobs/${stats.alphafold3_job_id}`)
  const summary = await (await summaryResponse).json()
  expect(summary).toMatchObject({ seed: 2, sample_index: 0, ranking_score: 0.91234, ptm: 0.81, iptm: null, has_clash: false })
  await expect(page.getByRole("button", { name: "Residue pLDDT", exact: true })).toBeEnabled({ timeout: 20_000 })
  const matrix = page.getByLabel("PAE matrix, columns scored tokens, rows aligned tokens")
  await expect(matrix).toBeVisible()
  await matrix.focus()
  // Token 2 (X), token 1 (Y) is null, not the transposed value 0.7.
  await page.keyboard.press("ArrowRight")
  await expect(page.getByRole("tooltip")).toContainText("X scored — Token 2: chain A, GLY 2 · residue-mean pLDDT 85.0")
  await expect(page.getByRole("tooltip")).toContainText("PAE of X when aligned on Y: Unavailable")
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight")
  await expect(page.getByRole("tooltip")).toContainText("X scored — Token 6: chain C, LIG 1 · residue-mean pLDDT 70.0")
  await page.keyboard.press("ArrowRight")
  await expect(page.getByRole("tooltip")).toContainText("X scored — Token 7: chain C, LIG 1")
  await expect(page.getByRole("tooltip")).toContainText("PAE of X when aligned on Y: 0.6 Å")
  await page.screenshot({ path: test.info().outputPath("af3-native-offline.png"), fullPage: true })
  expect(scientificSubmissions).toEqual([])
  expect(errors).toEqual([])
})
