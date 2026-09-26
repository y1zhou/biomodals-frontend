import { expect, test, type Page } from "@playwright/test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { optimizationOptions, optimizationReview } from "../tests/fixtures/protein-optimization"
import type { OptimizationReviewRequest } from "../src/protein-optimization"

const url = "/tools/protein-optimization/new"
const csv = "mutations,label\nA:A1V,2"
const fasta = ">A\nACDE"

async function mockApi(page: Page) {
  await page.context().addCookies([{ name: "biomodals-csrf", value: "offline", url: process.env.BIOMODALS_BROWSER_ORIGIN! }])
  const requests: OptimizationReviewRequest[] = []
  const unexpected: string[] = []
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === "/api/v1/auth/me") return route.fulfill({ json: { user_id: "reviewer", display_name: "Researcher", email: "reviewer@example.test", is_admin: false } })
    if (path === "/api/v1/protein-optimization/options") return route.fulfill({ json: optimizationOptions })
    if (path === "/api/v1/protein-optimization/review") {
      const input: OptimizationReviewRequest = route.request().postDataJSON()
      requests.push(input)
      expect(route.request().headers()["x-csrf-token"]).toBe("offline")
      return route.fulfill({ json: input.parental_fasta ? optimizationReview : { ...optimizationReview, chains: [], positions: [], unique_variant_count: null, replicate_rows: null, candidate_space_size: null, evaluation_count: null, warnings: [], review_digest: null } })
    }
    unexpected.push(`${route.request().method()} ${path}`)
    return route.fulfill({ status: 404, json: { detail: "Not found" } })
  })
  return { requests, unexpected }
}

async function discover(page: Page) {
  await page.goto(url)
  await page.getByLabel("Measurements CSV text", { exact: true }).fill(csv)
  await expect(page.getByLabel("Parental FASTA text", { exact: true })).toBeDisabled()
  await page.getByRole("button", { name: "Discover chains", exact: true }).click()
  await expect(page.getByLabel("Parental FASTA text", { exact: true })).toBeEnabled()
}

test("CSV-first review is unlisted, explicit, lossless and mode-specific", async ({ page }) => {
  const { requests, unexpected } = await mockApi(page)
  await page.goto("/")
  await expect(page.getByRole("link", { name: "Protein sequence optimization", exact: true })).toHaveCount(0)
  await discover(page)
  expect(requests).toHaveLength(1)
  expect(requests[0]).toEqual({ measurements_csv: csv, parental_fasta: null, settings: optimizationOptions.defaults!.combination })
  await page.getByLabel("Parental FASTA text", { exact: true }).fill(fasta)
  await page.getByRole("radio", { name: /^Exploration/ }).check()
  await expect(page.getByLabel("Candidate budget", { exact: false })).toHaveValue("5000")
  await page.getByLabel("Improvement direction", { exact: true }).selectOption("minimize")
  await page.getByRole("button", { name: "Review inputs", exact: true }).click()
  await expect(page.getByText("Inputs reviewed. Scientific submission is not yet available.", { exact: true })).toBeVisible()
  await expect(page.getByText("9,007,199,254,740,993", { exact: true })).toBeVisible()
  await page.getByText("Advanced Exploration settings", { exact: true }).click()
  await expect(page.getByLabel("Allowed replacements A:1", { exact: true })).toHaveValue("ADEFGHIKLNPQRSTVWY")
  await page.getByLabel("Allowed replacements A:1", { exact: true }).fill("CM")
  await expect(page.getByText("Inputs or settings changed. Review again before submission.", { exact: true })).toBeVisible()
  await page.getByLabel("Chain to extend", { exact: true }).selectOption("A")
  await page.getByLabel("Position or range", { exact: true }).fill("2-3")
  await page.getByRole("button", { name: "Add positions", exact: true }).click()
  await page.getByLabel("Allowed replacements A:2", { exact: true }).fill("")
  await page.getByRole("button", { name: "Remove position A:3", exact: true }).click()
  await page.getByRole("button", { name: "Review inputs", exact: true }).click()
  await expect.poll(() => requests.at(-1)?.settings).toMatchObject({ direction: "minimize", positions: [{ chain_id: "A", position: 1, amino_acids: "CM" }, { chain_id: "A", position: 2, amino_acids: "" }] })
  await expect(page.getByText("Inputs reviewed. Scientific submission is not yet available.", { exact: true })).toBeVisible()
  await page.getByRole("radio", { name: /^Combination/ }).check()
  await expect(page.getByLabel("Candidate budget", { exact: false })).toHaveValue("1000000")
  await expect(page.getByLabel("Measurements CSV text", { exact: true })).toHaveValue(csv)
  await expect(page.getByLabel("Parental FASTA text", { exact: true })).toHaveValue(fasta)
  await page.getByRole("button", { name: "Review inputs", exact: true }).click()
  await expect.poll(() => requests.at(-1)?.settings).toMatchObject({ mode: "combination", positions: null, direction: "minimize" })
  expect(unexpected).toEqual([])
})

test("edits cancel late review and file reads, and failed review only retries explicitly", async ({ page }) => {
  const { requests, unexpected } = await mockApi(page)
  await page.addInitScript(() => {
    const read = File.prototype.arrayBuffer
    File.prototype.arrayBuffer = function () {
      if (this.name !== "delayed.csv") return read.call(this)
      return new Promise((resolve) => window.addEventListener("finish-csv", () => resolve(new TextEncoder().encode("mutations,label\nB:M1A,9").buffer), { once: true }))
    }
  })
  await discover(page)
  await page.getByLabel("Measurements CSV", { exact: true }).setInputFiles({ name: "delayed.csv", mimeType: "text/csv", buffer: Buffer.from("ignored") })
  await expect(page.getByText("Reading measurements csv…", { exact: true })).toBeVisible()
  await page.getByLabel("Measurements CSV text", { exact: true }).fill(`${csv}\nA:C2S,3`)
  await page.evaluate(async () => { window.dispatchEvent(new Event("finish-csv")); await new Promise(requestAnimationFrame) })
  await expect(page.getByLabel("Measurements CSV text", { exact: true })).toHaveValue(`${csv}\nA:C2S,3`)
  let release!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  await page.route("**/protein-optimization/review", async (route) => {
    await held
    await route.fulfill({ json: optimizationReview }).catch(() => {})
  }, { times: 1 })
  const sent = page.waitForRequest("**/protein-optimization/review")
  await page.getByRole("button", { name: "Discover chains", exact: true }).click()
  await sent
  await page.getByLabel("Measurements CSV text", { exact: true }).fill("mutations,label\nC:D1S,4")
  release()
  await expect(page.getByLabel("Parental FASTA text", { exact: true })).toBeDisabled()
  await expect(page.getByText("Inputs reviewed. Scientific submission is not yet available.", { exact: true })).toHaveCount(0)
  let failed = 0
  await page.route("**/protein-optimization/review", (route) => { failed++; return route.fulfill({ status: 503, json: { code: "local_analysis_busy", detail: "Review capacity is busy" } }) })
  await page.getByRole("button", { name: "Discover chains", exact: true }).click()
  await expect(page.getByRole("alert")).toContainText("Your inputs are unchanged; retry explicitly")
  await expect(page.getByLabel("Measurements CSV text", { exact: true })).toHaveValue("mutations,label\nC:D1S,4")
  expect(failed).toBe(1)
  await page.getByRole("button", { name: "Discover chains", exact: true }).click()
  await expect.poll(() => failed).toBe(2)
  expect(requests).toHaveLength(1)
  expect(unexpected).toEqual([])
})

test("row diagnostics retain raw invalid labels and pagination; byte and numeric limits stop review", async ({ page }) => {
  const { requests } = await mockApi(page)
  await page.route("**/protein-optimization/options", (route) => route.fulfill({ json: { ...optimizationOptions, max_measurements_csv_bytes: 100, max_parental_fasta_bytes: 50 } }))
  await page.route("**/protein-optimization/review", (route) => route.fulfill({ json: { ...optimizationReview, review_digest: null, rows: Array.from({ length: 51 }, (_, row_index) => ({ row_index, id: `row_${row_index + 1}`, mutations: "A:A1V", label: row_index === 50 ? ">1000" : "2", canonical_mutations: "A:A1V" })), errors: [{ row_index: 50, field: "label", code: "invalid_label", message: "Use a finite numeric label, not a bound." }] } }))
  await discover(page)
  await page.getByRole("button", { name: "Next measurement page", exact: true }).click()
  await expect(page.getByRole("row").filter({ hasText: "row_51" })).toContainText(">1000")
  await expect(page.getByRole("row").filter({ hasText: "row_51" })).toContainText("Use a finite numeric label, not a bound.")
  await page.getByLabel("Candidate budget", { exact: false }).fill("1.5")
  await page.getByRole("button", { name: "Review inputs", exact: true }).click()
  await expect(page.getByRole("alert")).toContainText("Use whole numbers")
  await page.getByLabel("Candidate budget", { exact: false }).fill("100")
  await page.getByLabel("Measurements CSV text", { exact: true }).fill("A".repeat(101))
  await page.getByRole("button", { name: "Discover chains", exact: true }).click()
  await expect(page.getByRole("alert")).toContainText("file byte limit")
  expect(requests).toEqual([])
})

test("native review discovers arbitrary chains, diagnoses labels and resolves per-site exploration without a Job", async ({ page, context }) => {
  const statsPath = path.join(process.env.BIOMODALS_BROWSER_ROOT!, "stats.json")
  const before = JSON.parse(await readFile(statsPath, "utf8"))
  await page.goto(before.protein_optimization_password_link)
  await page.getByLabel("New password", { exact: true }).fill("correct horse battery staple")
  await page.getByLabel("Confirm password", { exact: true }).fill("correct horse battery staple")
  await page.getByRole("button", { name: "Set password", exact: true }).click()
  await expect(page).toHaveURL(process.env.BIOMODALS_BROWSER_ORIGIN + "/")
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  const reviews: OptimizationReviewRequest[] = []
  page.on("request", (request) => { if (request.url().endsWith("/protein-optimization/review")) reviews.push(request.postDataJSON()) })
  const valid = "id,mutations,label\nparent,,1\none,A:A1V,2\none_repeat,A:A1V,2.2\ntwo,A:C2S,3\nthree,A:D3N,4"
  await page.goto(url)
  await page.getByLabel("Measurements CSV", { exact: true }).setInputFiles({ name: "measurements.csv", mimeType: "text/csv", buffer: Buffer.from(valid.replace("2.2", ">1000")) })
  await expect(page.getByLabel("Measurements CSV text", { exact: true })).toHaveValue(valid.replace("2.2", ">1000"))
  expect(reviews).toHaveLength(0)
  await page.getByRole("button", { name: "Discover chains", exact: true }).click()
  await expect(page.getByRole("alert")).toContainText("Correct 1 input issue")
  await expect(page.getByRole("row").filter({ hasText: "one_repeat" })).toContainText(">1000")
  await page.getByLabel("Measurements CSV text", { exact: true }).fill(valid)
  await page.getByRole("button", { name: "Discover chains", exact: true }).click()
  await expect(page.getByLabel("Parental FASTA text", { exact: true })).toBeEnabled()
  await page.getByLabel("Parental FASTA", { exact: true }).setInputFiles({ name: "parents.fasta", mimeType: "text/plain", buffer: Buffer.from(">A\nac de\n>B\nMKTV") })
  await expect(page.getByLabel("Parental FASTA text", { exact: true })).toHaveValue(">A\nac de\n>B\nMKTV")
  await page.getByRole("button", { name: "Review inputs", exact: true }).click()
  await expect(page.getByText("Inputs reviewed. Scientific submission is not yet available.", { exact: true })).toBeVisible()
  const summary = page.getByRole("region", { name: "Input review", exact: true })
  await expect(summary.locator("dl")).toContainText("Unique measured variants4")
  await expect(summary.locator("dl")).toContainText("Additional replicate rows1")
  await expect(summary.locator("dl")).toContainText("Novel candidate space3")
  await page.getByLabel("Show full sequence for chain B", { exact: true }).click()
  await page.getByRole("button", { name: "Copy sequence for chain B", exact: true }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("MKTV")
  await page.getByRole("radio", { name: /^Exploration/ }).check()
  await page.getByText("Advanced Exploration settings", { exact: true }).click()
  await expect(page.getByLabel("Allowed replacements A:1", { exact: true })).toHaveValue("ADEFGHIKLNPQRSTVWY")
  await page.getByLabel("Allowed replacements A:1", { exact: true }).fill("CM")
  await page.getByLabel("Chain to extend", { exact: true }).selectOption("B")
  await page.getByLabel("Position or range", { exact: true }).fill("1-2")
  await page.getByRole("button", { name: "Add positions", exact: true }).click()
  await page.getByRole("button", { name: "Review inputs", exact: true }).click()
  await expect(page.getByText("Inputs reviewed. Scientific submission is not yet available.", { exact: true })).toBeVisible()
  expect(reviews.at(-1)?.settings).toMatchObject({ mode: "exploration", candidate_budget: 5000, positions: [
    { chain_id: "A", position: 1, amino_acids: "CM" },
    { chain_id: "A", position: 2, amino_acids: "ADEFGHIKLNPQRSTVWY" },
    { chain_id: "A", position: 3, amino_acids: "ADEFGHIKLNPQRSTVWY" },
    { chain_id: "B", position: 1, amino_acids: "ADEFGHIKLNPQRSTVWY" },
    { chain_id: "B", position: 2, amino_acids: "ADEFGHIKLNPQRSTVWY" },
  ] })
  const after = JSON.parse(await readFile(statsPath, "utf8"))
  expect(after.submit_calls).toBe(before.submit_calls)
  expect(after.provider_calls).toBe(before.provider_calls)
})
