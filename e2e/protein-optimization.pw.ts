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
    if (path === "/api/v1/auth/me" || path === "/api/v1/auth/login") return route.fulfill({ json: { user_id: "reviewer", display_name: "Researcher", email: "reviewer@example.test", is_admin: false } })
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

test("CSV-first review is explicit, lossless and mode-specific", async ({ page }) => {
  const { requests, unexpected } = await mockApi(page)
  await page.goto("/")
  await expect(page.getByRole("link", { name: "Protein sequence optimization", exact: true })).toBeVisible()
  await discover(page)
  expect(requests).toHaveLength(1)
  expect(requests[0]).toEqual({ measurements_csv: csv, parental_fasta: null, settings: optimizationOptions.defaults!.combination })
  await page.getByLabel("Parental FASTA text", { exact: true }).fill(fasta)
  await page.getByRole("radio", { name: /^Exploration/ }).check()
  await expect(page.getByLabel("Candidate budget", { exact: false })).toHaveValue("5000")
  await page.getByLabel("Improvement direction", { exact: true }).selectOption("minimize")
  await page.getByRole("button", { name: "Review inputs", exact: true }).click()
  await expect(page.getByText("Inputs reviewed. Submit explicitly to start scientific computation.", { exact: true })).toBeVisible()
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
  await expect(page.getByText("Inputs reviewed. Submit explicitly to start scientific computation.", { exact: true })).toBeVisible()
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
  await expect(page.getByText("Inputs reviewed. Submit explicitly to start scientific computation.", { exact: true })).toHaveCount(0)
  let failed = 0
  await page.route("**/protein-optimization/review", (route) => { failed++; return route.fulfill({ status: 503, json: { detail: "Service unavailable" } }) })
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

test("admission rejection preserves review; ambiguous submission replays unchanged and edits make a new intent", async ({ page }) => {
  await mockApi(page)
  const submits: { key: string; body: unknown }[] = []
  let response = { status: 409, json: { code: "deployment_incompatible", detail: "Update the deployment" } }
  await page.route("**/protein-optimization/jobs", (route) => {
    submits.push({ key: route.request().headers()["idempotency-key"]!, body: route.request().postDataJSON() })
    return route.fulfill(response)
  })
  await discover(page)
  await page.getByLabel("Parental FASTA text", { exact: true }).fill(fasta)
  await page.getByRole("button", { name: "Review inputs", exact: true }).click()
  const submit = page.getByRole("button", { name: "Submit optimization", exact: true })
  await submit.click()
  await expect(page.getByRole("alert")).toContainText("Update the deployment")
  await expect(submit).toBeEnabled()
  expect(submits).toHaveLength(1)
  response = { status: 503, json: { code: "unavailable", detail: "Unknown server failure" } }
  await submit.click()
  await expect(page.getByRole("button", { name: "Check submission", exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Check submission", exact: true }).click()
  await expect.poll(() => submits.length).toBe(3)
  expect(submits[1]).toEqual(submits[0])
  expect(submits[2]).toEqual(submits[0])
  await page.getByLabel("Job name", { exact: true }).fill("New intent")
  await expect(page.getByText(/An earlier submission was not confirmed/)).toBeVisible()
  response = { status: 409, json: { code: "review_changed", detail: "Review again" } }
  await submit.click()
  await expect(submit).toBeDisabled()
  expect(submits[3]!.key).not.toBe(submits[0]!.key)
  await expect(page.getByLabel("Measurements CSV text", { exact: true })).toHaveValue(csv)
  await page.getByRole("button", { name: "Review inputs", exact: true }).click()
  await expect(submit).toBeEnabled()
  response = { status: 422, json: { code: "invalid_design", detail: "Design rejected before admission" } }
  await submit.click()
  await expect(page.getByText(/Design rejected before admission/)).toBeVisible()
  await expect(submit).toBeEnabled()
  expect(submits).toHaveLength(5)
  response = { status: 409, json: { code: "job_deleted", detail: "The original Job was deleted" } }
  await submit.click()
  await expect(page.getByText(/The original Job was deleted/)).toBeVisible()
  expect(submits[5]).toEqual(submits[4])
})

test("bounded results retain selection through failed paging, download rejection and reauthentication", async ({ page }) => {
  const { unexpected } = await mockApi(page)
  const jobId = "11111111-1111-4111-8111-111111111111"
  let reads = 0, restores = 0, tickets = 0
  let pageFailure = false
  let ticketStatus: "invalid" | "expired" | "ready" = "invalid"
  const selected: unknown[] = []
  await page.route(`**/api/v1/jobs/${jobId}`, (route) => route.fulfill({ json: { job_id: jobId, tool: "protein_optimization", operation: "run", source_job_id: null, display_name: "Bounded result", state: "succeeded", stages: [], warnings: [], can_retry_result_preparation: false, can_view_logs: false, created_at: "2026-09-28T00:00:00Z", updated_at: "2026-09-28T00:00:00Z" } }))
  await page.route(`**/api/v1/jobs/${jobId}/prepare-download`, (route) => { restores++; return route.fulfill({ status: 204, body: "" }) })
  await page.route(`**/protein-optimization/jobs/${jobId}/candidates?*`, (route) => {
    reads++
    if (pageFailure) return route.fulfill({ status: 503, json: { detail: "Candidate page temporarily unavailable" } })
    if (reads === 1) return route.fulfill({ status: 409, json: { code: "result_not_cached", detail: "Restore result" } })
    expect(new URL(route.request().url()).searchParams.get("limit")).toBe("50")
    return route.fulfill({ json: { summary: { mode: "combination", direction: "minimize", candidate_count: 1, chain_columns: { A: "sequence_A" }, validation: { regime: "supported_combinations", training_variants: 3, evaluated_variants: 0, folds: 0, mae: null, rmse: null, spearman: null, evaluated_mutation_counts: [], warnings: ["Insufficient held-out support"] } }, columns: [{ name: "id", type: "string" }, { name: "predicted_label", type: "number" }, { name: "sequence_A", type: "string" }], rows: [{ id: "candidate_000000001", predicted_label: -0.000000123456, sequence_A: "VCDE" }], offset: 0, limit: 50, total_rows: 1 } })
  })
  await page.route(`**/protein-optimization/jobs/${jobId}/prepare-selected-download`, (route) => {
    tickets++; selected.push(route.request().postDataJSON())
    if (ticketStatus === "expired") return route.fulfill({ status: 401, json: { detail: "Session expired" } })
    if (ticketStatus === "ready") return route.fulfill({ json: { download_url: `/api/v1/protein-optimization/jobs/${jobId}/candidates.csv?ticket=offline`, expires_at: "2026-09-28T01:00:00Z" } })
    return route.fulfill({ status: 422, json: { code: "selection_invalid", detail: "Selection cannot be prepared" } })
  })
  await page.goto(`/tools/protein-optimization/jobs/${jobId}`)
  await expect(page.getByText("-1.235e-7", { exact: true })).toBeVisible()
  await expect(page.getByText("Original scientific order: predicted label, lower first.", { exact: true })).toBeVisible()
  await expect(page.getByText("Insufficient held-out support", { exact: true })).toBeVisible()
  expect(restores).toBe(1)
  expect(reads).toBe(2)
  await page.getByRole("checkbox", { name: "Select candidate_000000001", exact: true }).check()
  await page.getByRole("button", { name: "Download selected candidates", exact: true }).click()
  await expect(page.getByRole("alert")).toContainText("Your selection is unchanged")
  expect(tickets).toBe(1)
  await expect(page.getByRole("checkbox", { name: "Select candidate_000000001", exact: true })).toBeChecked()
  await page.getByRole("button", { name: "Download selected candidates", exact: true }).click()
  await expect.poll(() => tickets).toBe(2)
  expect(selected).toEqual([{ ids: ["candidate_000000001"] }, { ids: ["candidate_000000001"] }])
  pageFailure = true
  await page.getByRole("button", { name: "Predicted label", exact: true }).click()
  await expect(page.getByText(/Candidates could not be loaded/)).toContainText("Candidate page temporarily unavailable")
  ticketStatus = "expired"
  await page.getByRole("button", { name: "Download selected candidates", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Sign in again", exact: true })
  await expect(dialog).toBeVisible()
  pageFailure = false
  ticketStatus = "ready"
  await dialog.getByLabel("Email", { exact: true }).fill("reviewer@example.test")
  await dialog.getByLabel("Password", { exact: true }).fill("offline-password")
  await dialog.getByRole("button", { name: "Sign in and return", exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByText("1 candidates selected across pages and filters.", { exact: true })).toBeVisible()
  await expect(page.getByRole("checkbox", { name: "Select candidate_000000001", exact: true })).toBeChecked()
  expect(tickets).toBe(3)
  const download = page.waitForEvent("download")
  await page.getByRole("button", { name: "Download selected candidates", exact: true }).click()
  const requested = await download
  expect(requested.url()).toBe(`${process.env.BIOMODALS_BROWSER_ORIGIN}/api/v1/protein-optimization/jobs/${jobId}/candidates.csv?ticket=offline`)
  await requested.cancel() // Byte delivery is covered by the real-API test below.
  expect(selected).toEqual(Array.from({ length: 4 }, () => ({ ids: ["candidate_000000001"] })))
  expect(unexpected).toEqual([])
})

test("an options failure cannot mask expired retained-input authentication and reauth preserves edits", async ({ page }) => {
  const { requests, unexpected } = await mockApi(page)
  const jobId = "11111111-1111-4111-8111-111111111111"
  let optionsReads = 0
  await page.route("**/protein-optimization/options", (route) => {
    optionsReads++
    return optionsReads === 1 ? route.fulfill({ status: 503, json: { detail: "Options temporarily unavailable" } }) : route.fulfill({ json: optimizationOptions })
  })
  let release!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  let retainedReads = 0
  await page.route(`**/protein-optimization/jobs/${jobId}/inputs`, async (route) => {
    retainedReads++
    if (retainedReads === 1) { await held; return route.fulfill({ status: 401, json: { detail: "Session expired" } }) }
    return route.fulfill({ json: { display_name: "Retained", measurements_csv: csv, parental_fasta: fasta, settings: optimizationOptions.defaults!.combination } })
  })
  let reviews = 0
  await page.route("**/protein-optimization/review", (route) => {
    reviews++
    if (reviews === 1) return route.fulfill({ status: 401, json: { detail: "Session expired" } })
    return route.fallback()
  })
  await page.goto(`${url}?source_job=${jobId}`)
  await expect(page.getByRole("alert")).toContainText("Options temporarily unavailable")
  release()
  const dialog = page.getByRole("dialog", { name: "Sign in again", exact: true })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel("Email", { exact: true }).fill("reviewer@example.test")
  await dialog.getByLabel("Password", { exact: true }).fill("offline-password")
  await dialog.getByRole("button", { name: "Sign in and return", exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByLabel("Measurements CSV text", { exact: true })).toHaveValue(csv)
  expect(reviews).toBe(0)
  const edited = `${csv}\nA:C2S,3`
  await page.getByLabel("Measurements CSV text", { exact: true }).fill(edited)
  await page.getByRole("button", { name: "Discover chains", exact: true }).click()
  await dialog.getByLabel("Email", { exact: true }).fill("reviewer@example.test")
  await dialog.getByLabel("Password", { exact: true }).fill("offline-password")
  await dialog.getByRole("button", { name: "Sign in and return", exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByLabel("Measurements CSV text", { exact: true })).toHaveValue(edited)
  await expect(page.getByLabel("Parental FASTA text", { exact: true })).toHaveValue(fasta)
  expect(reviews).toBe(1)
  await page.getByRole("button", { name: "Discover chains", exact: true }).click()
  await expect(page.getByLabel("Parental FASTA text", { exact: true })).toBeEnabled()
  expect(requests.at(-1)?.measurements_csv).toBe(edited)
  expect(unexpected).toEqual([])
})

test("native both-mode Jobs retain inputs and deliver bounded candidates and native selected CSV", async ({ page, context }) => {
  test.setTimeout(90_000)
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
  await expect(page.getByText("Inputs reviewed. Submit explicitly to start scientific computation.", { exact: true })).toBeVisible()
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
  await expect(page.getByText("Inputs reviewed. Submit explicitly to start scientific computation.", { exact: true })).toBeVisible()
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
  const submissions: unknown[] = []
  const queries: URL[] = []
  const tickets: { ids: string[] }[] = []
  page.on("request", (request) => {
    const target = new URL(request.url())
    if (target.pathname === "/api/v1/protein-optimization/jobs" && request.method() === "POST") submissions.push(request.postDataJSON())
    if (target.pathname.endsWith("/candidates")) queries.push(target)
    if (target.pathname.endsWith("/prepare-selected-download")) tickets.push(request.postDataJSON())
  })
  async function finish() {
    await page.getByRole("button", { name: "Submit optimization", exact: true }).click()
    await expect(page).toHaveURL(/\/tools\/protein-optimization\/jobs\//)
    await expect(async () => {
      if (await page.getByRole("heading", { name: "Protein optimization candidates", exact: true }).isVisible()) return
      await page.getByRole("button", { name: "Refresh", exact: true }).click()
      await expect(page.getByRole("heading", { name: "Protein optimization candidates", exact: true })).toBeVisible({ timeout: 1000 })
    }).toPass({ timeout: 20_000, intervals: [1000] })
  }
  await page.getByLabel("Candidate budget", { exact: false }).fill("61")
  await page.getByRole("button", { name: "Review inputs", exact: true }).click()
  await finish()
  await expect(page.getByText("Offline fixture has no native neural validation", { exact: true })).toBeVisible()
  expect(queries[0]!.searchParams.get("limit")).toBe("50")
  const first = page.getByRole("checkbox", { name: /^Select candidate_/ }).first()
  const firstId = (await first.getAttribute("aria-label"))!.replace("Select ", "")
  await first.check()
  await page.getByRole("button", { name: "Next candidate page", exact: true }).click()
  await expect(page.getByLabel("Candidate page", { exact: true })).toHaveValue("2")
  const second = page.getByRole("checkbox", { name: /^Select candidate_/ }).first()
  const secondId = (await second.getAttribute("aria-label"))!.replace("Select ", "")
  await second.check()
  await page.getByRole("button", { name: "Predicted label", exact: true }).click()
  await expect(page.getByText("Sorted by Predicted label (ascending).", { exact: true })).toBeVisible()
  await expect(page.getByText("2 candidates selected across pages and filters.", { exact: true })).toBeVisible()
  await page.getByLabel("Exact new-substitution count", { exact: true }).fill("0")
  await page.getByRole("button", { name: "Apply filters", exact: true }).click()
  await expect.poll(() => queries.at(-1)!.searchParams.get("n_new_mutations")).toBe("0")
  const selectedDownload = page.waitForEvent("download")
  await page.getByRole("button", { name: "Download selected candidates", exact: true }).click()
  const selectedText = await readFile((await (await selectedDownload).path())!, "utf8")
  expect(tickets).toEqual([{ ids: [firstId, secondId] }])
  expect(selectedText).toContain(firstId)
  expect(selectedText).toContain(secondId)
  expect(selectedText.trim().split("\n")).toHaveLength(3)
  const fullDownload = page.waitForEvent("download")
  await page.getByRole("button", { name: "Download all candidates", exact: true }).click()
  const fullText = await readFile((await (await fullDownload).path())!, "utf8")
  expect(fullText.trim().split("\n")).toHaveLength(62)
  expect(fullText.indexOf(firstId)).toBeLessThan(fullText.indexOf(secondId))
  expect(selectedText.indexOf(firstId)).toBeLessThan(selectedText.indexOf(secondId))
  await page.getByRole("link", { name: "Rerun with same inputs", exact: true }).click()
  await expect(page.getByLabel("Measurements CSV text", { exact: true })).toHaveValue(valid)
  await expect(page.getByLabel("Parental FASTA text", { exact: true })).toHaveValue(">A\nac de\n>B\nMKTV")
  await expect(page.getByLabel("Candidate budget", { exact: false })).toHaveValue("61")
  await expect(page.getByRole("button", { name: "Submit optimization", exact: true })).toBeDisabled()
  expect(submissions).toHaveLength(1)
  await page.getByRole("radio", { name: /^Combination/ }).check()
  await page.getByRole("button", { name: "Discover chains", exact: true }).click()
  await page.getByRole("button", { name: "Review inputs", exact: true }).click()
  await finish()
  await expect(page.getByText("1–3 of 3 matching candidates · 3 total.", { exact: true })).toBeVisible()
  await expect(page.getByRole("columnheader", { name: "Chain B", exact: true })).toBeVisible()
  expect(submissions).toHaveLength(2)
})
