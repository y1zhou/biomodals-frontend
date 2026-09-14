import { expect, test, type Page } from "@playwright/test"
import { readFileSync } from "node:fs"

test.use({ viewport: { width: 1440, height: 1080 }, launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } })

const jobId = "11111111-1111-4111-8111-111111111111"
const principal = { user_id: "af3-test", display_name: "Researcher", email: "researcher@example.test", is_admin: false }
const document = { name: "Imported complex", modelSeeds: [7, 42], sequences: [{ protein: { id: ["A", "B"], sequence: "ACD", unpairedMsa: "", templates: [] } }, { ligand: { id: "L", ccdCodes: ["ATP"] } }] }
const prediction = { prediction_id: "fixture-identity", seed: 42, sample_index: 0, prediction_count: 2, ranking_score: 0.87, ptm: 0.7, iptm: null, has_clash: false, summary_error: null, pae_error: null, max_pae_grid_size: 512, token_chain_ids: ["A", "A", "L", "L"], token_res_ids: [1, 2, 1, 1] }

test("failed AF3 rerun restores editable inputs and exact settings without automatic POST", async ({ page }) => {
  await mockApi(page, { state: "failed" })
  const posts: string[] = []
  page.on("request", (request) => { if (request.method() === "POST") posts.push(request.url()) })
  await page.addInitScript(() => {
    sessionStorage.setItem("biomodals:alphafold3:validation:af3-test", "stale-validation")
    sessionStorage.setItem("biomodals:alphafold3:submission:af3-test:stale-validation", "old-intent")
  })
  await page.route("**/alphafold3/jobs/*/inputs", (route) => route.fulfill({ json: {
    document_json: JSON.stringify({ ...document, userCCD: "preserved native extension" }),
    settings: { recycle: 7, sample: 3, search_msa: false, search_protein_templates: false },
  } }))
  await page.goto(`/tools/alphafold3/jobs/${jobId}`)
  await expect(page.getByRole("link", { name: "Start a new job" })).toHaveCount(0)
  await page.getByRole("link", { name: "Rerun with same inputs" }).click()
  await expect(page.getByLabel("Edit retained JSON")).toContainText("preserved native extension")
  await expect(page.getByLabel("Job name", { exact: true })).toHaveValue("Imported complex")
  await page.getByText("Advanced prediction settings", { exact: true }).click()
  await expect(page.getByLabel("Recycles", { exact: true })).toHaveValue("7")
  await expect(page.getByLabel("Samples per seed", { exact: true })).toHaveValue("3")
  await expect(page.getByLabel("Model seeds", { exact: true })).toHaveValue("7,42")
  await expect(page.getByLabel("Search MSAs", { exact: true })).not.toBeChecked()
  await page.getByLabel("Edit retained JSON").fill(JSON.stringify({ ...document, userCCD: "edited native extension" }))
  await page.getByLabel("Job name", { exact: true }).fill("Edited rerun")
  expect(posts).toEqual([])
  await page.route("**/alphafold3/validations?*", (route) => route.fulfill({ status: 422, json: { detail: "Offline validation stopped before submission" } }))
  const validationRequest = page.waitForRequest((request) => new URL(request.url()).pathname.endsWith("/alphafold3/validations"))
  await page.getByRole("button", { name: "Continue and preview job" }).click()
  const request = await validationRequest
  expect(Object.fromEntries(new URL(request.url()).searchParams)).toEqual({ recycle: "7", sample: "3", search_msa: "false", search_protein_templates: "false" })
  expect(request.postDataJSON()).toMatchObject({ name: "Edited rerun", modelSeeds: [7, 42], userCCD: "edited native extension" })
  expect(posts).toHaveLength(1)
})

test("unavailable retained AF3 input does not open a blank submission", async ({ page }) => {
  await mockApi(page)
  await page.route("**/alphafold3/jobs/*/inputs", (route) => route.fulfill({ status: 404, json: { code: "job_input_unavailable", detail: "Input unavailable" } }))
  await page.goto(`/tools/alphafold3/new?source_job=${jobId}`)
  await expect(page.getByRole("alert")).toContainText("Retained inputs could not be loaded")
  await expect(page.getByRole("button", { name: "Continue and preview job" })).toHaveCount(0)
})

for (const tool of ["alphafold3", "humanization", "gromacs"]) test(`${tool} same-job preparation recovery never submits scientific work`, async ({ page }) => {
  await mockApi(page)
  let retried = false
  const posts: string[] = []
  page.on("request", (request) => { if (request.method() === "POST") posts.push(new URL(request.url()).pathname) })
  await page.route((url) => url.pathname === `/api/v1/jobs/${jobId}` || url.pathname === `/api/v1/jobs/${jobId}/retry-result-preparation`, async (route) => {
    const retry = route.request().url().endsWith("/retry-result-preparation")
    if (retry) {
      expect(route.request().headers()["x-csrf-token"]).toBe("test-csrf")
      retried = true
    }
    await route.fulfill({ status: retry ? 202 : 200, json: {
      job_id: jobId, display_name: "Recovered job", tool, state: retried ? "finalizing" : "failed",
      can_retry_result_preparation: !retried, can_view_logs: false,
      created_at: "2026-09-12T00:00:00Z", updated_at: "2026-09-12T00:01:00Z", stages: [], warnings: [],
      error_code: retried ? null : "result_preparation_failed", error_message: retried ? null : "Local preparation failed",
    } })
  })
  await page.goto(`/tools/${tool}/jobs/${jobId}`)
  await expect(page.getByText("This does not rerun scientific computation", { exact: false })).toBeVisible()
  await page.getByRole("button", { name: "Retry fetching results", exact: true }).click()
  await expect(page.getByRole("button", { name: "Retry fetching results", exact: true })).toHaveCount(0)
  await expect(page.getByText("Preparing result", { exact: true }).first()).toBeVisible()
  expect(posts).toEqual([`/api/v1/jobs/${jobId}/retry-result-preparation`])
})

test("transient preview retry exposes evidence and uses cache restoration", async ({ page }) => {
  await mockApi(page)
  let reads = 0
  await page.route("**/prediction", async (route) => {
    reads++
    await route.fulfill(reads === 1 ? { status: 503, headers: { "X-Request-ID": "offline-support" }, json: { code: "result_storage_unavailable", detail: "Temporary result storage failure" } } : reads === 2 ? { status: 409, json: { code: "result_not_cached" } } : { json: prediction })
  })
  await page.goto(`/tools/alphafold3/jobs/${jobId}`)
  await expect(page.getByText("result_storage_unavailable: Temporary result storage failure", { exact: false })).toBeVisible()
  await expect(page.getByText("Support ID: offline-support", { exact: false })).toBeVisible()
  await page.getByRole("button", { name: "Retry preview", exact: true }).click()
  await expect(page.getByLabel("PAE matrix, columns scored tokens, rows aligned tokens")).toBeVisible()
  await expect(page.getByText("preview_too_large: Test structure fallback")).toBeVisible()
  await expect(page.getByRole("button", { name: "Retry preview", exact: true })).toHaveCount(0)
  expect(reads).toBe(3)
})

async function mockApi(page: Page, { paeError = false, cacheMiss = false, state = "succeeded", structure = false } = {}) {
  const requests: URL[] = []
  let restores = 0
  await page.context().addCookies([{ name: "biomodals-csrf", value: "test-csrf", url: process.env.BIOMODALS_BROWSER_ORIGIN! }])
  await page.route((url) => url.pathname.startsWith("/api/"), async (route) => {
    const url = new URL(route.request().url())
    requests.push(url)
    const respond = (body: unknown, status = 200) => route.fulfill({ status, json: body })
    if (url.pathname.endsWith("/auth/me")) return respond(principal)
    if (url.pathname.endsWith("/prepare-download")) { restores++; return route.fulfill({ status: 204 }) }
    if (url.pathname.endsWith("/prediction")) {
      if (cacheMiss && restores === 0) return respond({ code: "result_not_cached", detail: "Evicted" }, 409)
      return respond({ ...prediction, pae_error: paeError ? "pae_too_large" : null })
    }
    if (url.pathname.endsWith("/model.cif")) return structure ? route.fulfill({ contentType: "chemical/x-mmcif", body: readFileSync(new URL("./fixtures/alphafold3-preview.cif", import.meta.url), "utf8") }) : respond({ code: "preview_too_large", detail: "Test structure fallback" }, 413)
    if (url.pathname.endsWith("/pae")) {
      const zoom = url.searchParams.has("x_end")
      const xs = Number(url.searchParams.get("x_start") ?? 0)
      const ys = Number(url.searchParams.get("y_start") ?? 0)
      const xe = Number(url.searchParams.get("x_end") ?? 4)
      const ye = Number(url.searchParams.get("y_end") ?? 4)
      const x_edges = zoom ? Array.from({ length: xe - xs + 1 }, (_, i) => xs + i) : [0, 2, 4]
      const y_edges = zoom ? Array.from({ length: ye - ys + 1 }, (_, i) => ys + i) : [0, 2, 4]
      return respond({ prediction_id: prediction.prediction_id, aggregation: zoom ? "exact" : "mean", x_edges, y_edges, values: zoom ? Array.from({ length: ye - ys }, (_, y) => Array.from({ length: xe - xs }, (_, x) => (ys + y) * 4 + xs + x)) : [[0, 3], [12, null]], valid_counts: zoom ? Array.from({ length: ye - ys }, () => Array.from({ length: xe - xs }, () => 1)) : [[4, 3], [4, 0]] })
    }
    if (url.pathname === `/api/v1/jobs/${jobId}`) return respond({ job_id: jobId, display_name: "AF3 test", tool: "alphafold3", state, created_at: "2026-09-12T00:00:00Z", updated_at: "2026-09-12T00:01:00Z", stages: [], warnings: [], can_view_logs: false })
    if (url.pathname === "/api/v1/jobs") return respond({ jobs: [], next_cursor: null })
    return respond({ detail: "Unexpected offline test request" }, 404)
  })
  return { requests, restores: () => restores }
}

test("Expert upload feedback preserves visible overrides and resolves failed replacements", async ({ page }) => {
  await mockApi(page)
  await page.goto("/tools/alphafold3/new")
  await page.getByText("Expert mode", { exact: true }).click()
  await page.locator("#alphafold3-json").setInputFiles({ name: "complex.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) })
  await expect(page.getByText("JSON loaded: complex.json", { exact: true })).toBeVisible()
  await expect(page.getByLabel("Job name", { exact: true })).toHaveValue("Imported complex")
  await expect(page.getByText("protein · A, B · 3 residues", { exact: true })).toBeVisible()
  await page.getByText("Preview loaded JSON", { exact: true }).click()
  await expect(page.locator("pre")).toContainText('"unpairedMsa": ""')
  await page.getByLabel("Job name", { exact: true }).fill("My chosen name")
  await page.locator("#alphafold3-json").setInputFiles({ name: "replacement.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ ...document, name: "Another name" })) })
  await expect(page.getByLabel("Job name", { exact: true })).toHaveValue("My chosen name")
  await page.locator("#alphafold3-json").setInputFiles({ name: "broken.json", mimeType: "application/json", buffer: Buffer.from("{broken") })
  await expect(page.getByRole("alert")).toContainText("previous file (replacement.json) is still loaded")
  await expect(page.getByRole("button", { name: "Continue and preview job" })).toBeDisabled()
  await page.getByRole("button", { name: "Keep loaded JSON" }).click()
  await expect(page.getByRole("button", { name: "Continue and preview job" })).toBeEnabled()
})

test("Expert replacement blocks Continue, latest read wins and Clear cancels pending read", async ({ page }) => {
  await mockApi(page)
  await page.addInitScript(() => {
    const original = File.prototype.text
    File.prototype.text = async function () { if (this.name === "slow.json") await new Promise((resolve) => setTimeout(resolve, 800)); return original.call(this) }
  })
  await page.goto("/tools/alphafold3/new")
  await page.getByText("Expert mode", { exact: true }).click()
  const input = page.locator("#alphafold3-json")
  await input.setInputFiles({ name: "first.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) })
  await expect(page.getByText("JSON loaded: first.json", { exact: true })).toBeVisible()
  await input.setInputFiles({ name: "slow.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ ...document, name: "Slow" })) })
  await expect(page.getByRole("button", { name: "Continue and preview job" })).toBeDisabled()
  await input.setInputFiles({ name: "latest.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) })
  await page.waitForTimeout(900)
  await expect(page.getByText("JSON loaded: latest.json", { exact: true })).toBeVisible()
  await input.setInputFiles({ name: "slow.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) })
  await page.getByRole("button", { name: "Clear", exact: true }).click()
  await page.waitForTimeout(900)
  await page.getByText("Expert mode", { exact: true }).click()
  await expect(page.getByText("JSON loaded:", { exact: false })).toHaveCount(0)
})

test("PAE cache restoration, directional hover, missing blocks, zoom and reset", async ({ page }) => {
  const api = await mockApi(page, { cacheMiss: true })
  await page.goto(`/tools/alphafold3/jobs/${jobId}`)
  const matrix = page.getByLabel("PAE matrix, columns scored tokens, rows aligned tokens")
  await expect(matrix).toBeVisible()
  expect(api.restores()).toBe(1)
  await matrix.scrollIntoViewIfNeeded()
  const rect = (await matrix.boundingBox())!
  await page.mouse.move(rect.x + rect.width * 0.75, rect.y + rect.height * 0.25)
  await expect(page.getByRole("tooltip")).toContainText("Block mean PAE: 3.000 Å")
  await expect(page.getByRole("tooltip")).toContainText("3 available / 4 values")
  const initial = api.requests.filter((url) => url.pathname.endsWith("/pae")).length
  await page.mouse.move(rect.x + rect.width * 0.75, rect.y + rect.height * 0.75)
  await expect(page.getByRole("tooltip")).toContainText("Unavailable")
  expect(api.requests.filter((url) => url.pathname.endsWith("/pae"))).toHaveLength(initial)
  await page.mouse.move(rect.x + rect.width * 0.1, rect.y + rect.height * 0.1)
  await page.mouse.down()
  await page.mouse.move(rect.x + rect.width * 0.4, rect.y + rect.height * 0.4)
  await page.mouse.up()
  await expect(page.getByText("Exact PAE", { exact: true })).toBeVisible()
  const last = api.requests.filter((url) => url.pathname.endsWith("/pae")).at(-1)!
  expect(Object.fromEntries(last.searchParams)).toEqual({ x_start: "0", x_end: "2", y_start: "0", y_end: "2" })
  await matrix.focus()
  await page.keyboard.press("ArrowRight")
  await expect(page.getByRole("tooltip")).toContainText("X scored — Token 2: chain A")
  await expect(page.getByRole("tooltip")).toContainText("PAE of X when aligned on Y: 1.0 Å")
  await page.getByRole("button", { name: "Reset zoom" }).click()
  await expect(page.getByText("Block mean PAE · reduced-resolution overview", { exact: true })).toBeVisible()
})

test("oversized PAE is a preview fallback and unfinished jobs never request predictions", async ({ page }) => {
  const api = await mockApi(page, { paeError: true })
  await page.goto(`/tools/alphafold3/jobs/${jobId}`)
  await expect(page.getByText("This prediction is too large for the PAE preview.", { exact: false })).toBeVisible()
  await expect(page.getByRole("button", { name: "Download all results", exact: true })).toBeVisible()
  expect(api.requests.some((url) => url.pathname.endsWith("/pae"))).toBe(false)
  await page.unrouteAll()
  const running = await mockApi(page, { state: "running" })
  await page.reload()
  await expect(page.getByRole("heading", { name: "AF3 test" })).toBeVisible()
  expect(running.requests.some((url) => url.pathname.includes("/prediction"))).toBe(false)
})

test("Molstar loads privately with curated controls, accurate legends and navigation cleanup", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  const outbound: string[] = []
  page.on("request", (request) => { if (new URL(request.url()).origin !== process.env.BIOMODALS_BROWSER_ORIGIN) outbound.push(request.url()) })
  await mockApi(page, { structure: true })
  await page.goto(`/tools/alphafold3/jobs/${jobId}`)
  const confidence = page.getByRole("button", { name: "Residue pLDDT", exact: true })
  await expect(confidence).toBeEnabled({ timeout: 20_000 })
  await expect(page.getByLabel("Residue pLDDT legend")).toBeVisible()
  await expect(page.locator(".af3-molstar .msp-layout-top")).toBeVisible()
  await expect(page.locator(".af3-molstar .msp-layout-left")).toHaveCount(0)
  await expect(page.getByText("Quick Styles", { exact: true })).toBeVisible()
  await expect(page.getByText("Measurements", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Chain", exact: true }).click()
  await expect(page.getByLabel("Residue pLDDT legend")).toHaveCount(0)
  await expect(page.getByText("Colored by chain.", { exact: false })).toBeVisible()
  await confidence.click()
  await expect(page.getByLabel("Residue pLDDT legend")).toBeVisible()
  await page.getByRole("button", { name: "Cartoon", exact: true }).click()
  await expect(page.getByLabel("Residue pLDDT legend")).toHaveCount(0)
  await confidence.click()
  await expect(page.getByLabel("Residue pLDDT legend")).toBeVisible()
  await page.screenshot({ path: test.info().outputPath("af3-structure-pae.png"), fullPage: true })
  await page.getByRole("link", { name: "My Jobs", exact: true }).first().click()
  await expect(page.locator(".msp-plugin")).toHaveCount(0)
  expect(errors).toEqual([])
  expect(outbound).toEqual([])
})

test("unavailable WebGL does not prevent the PAE preview or native download", async ({ page }) => {
  await mockApi(page, { structure: true })
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (kind: string, ...args: unknown[]) {
      return kind.includes("webgl") ? null : Reflect.apply(original, this, [kind, ...args])
    } as typeof original
  })
  await page.goto(`/tools/alphafold3/jobs/${jobId}`)
  await expect(page.getByText("The structure viewer could not load.", { exact: false })).toBeVisible()
  await expect(page.getByLabel("PAE matrix, columns scored tokens, rows aligned tokens")).toBeVisible()
  await expect(page.getByRole("button", { name: "Download all results", exact: true })).toBeVisible()
})
