import { expect, test, type Page } from "@playwright/test"
import options from "./fixtures/humanization-options.json" with { type: "json" }

const principal = { user_id: "user-one", display_name: "Researcher", email: "researcher@example.test", is_admin: false }
const job = { job_id: "11111111-1111-4111-8111-111111111111", display_name: "Antibody humanization", tool: "humanization", state: "partial", created_at: "2026-09-07T00:00:00Z", updated_at: "2026-09-07T00:01:00Z", stages: [], warnings: ["One evaluator could not score a candidate."], can_view_logs: false }
const columns = ["parent_id", "candidate_id", "quality_tier", "panel_order", "vh", "vl", "score"].map((name) => ({ name, type: ["quality_tier", "panel_order", "score"].includes(name) ? "number" : "string" }))

async function mockApi(page: Page, { lostResponse = false, expired = false, maxPairs = 100 } = {}) {
  const submissions: { body: unknown; key: string | undefined }[] = []
  const selections: URL[] = []
  const requests: string[] = []
  let prepared = 0
  await page.context().addCookies([{ name: "biomodals-csrf", value: "test-csrf", url: process.env.BIOMODALS_BROWSER_ORIGIN! }])
  // Fulfil every API request locally. No submission in these tests reaches a
  // server or a scientific provider, even when an unexpected request is made.
  await page.route("**/api/**", async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    requests.push(`${request.method()} ${url.pathname}${url.search}`)
    const respond = (body: unknown, status = 200) => route.fulfill({ status, json: body })
    if (url.pathname.endsWith("/auth/me") || url.pathname.endsWith("/auth/login")) return respond(principal)
    if (url.pathname.endsWith("/humanization/options")) return respond({ ...options, max_pairs: maxPairs })
    if (url.pathname.endsWith("/humanization/jobs") && request.method() === "POST") {
      submissions.push({ body: request.postDataJSON(), key: request.headers()["idempotency-key"] })
      if (submissions.length === 1 && lostResponse) return route.abort("failed")
      if (submissions.length === 1 && expired) return respond({ detail: "Authentication required" }, 401)
      return respond(job, 202)
    }
    if (url.pathname.endsWith("/prepare-download")) { prepared++; return route.fulfill({ status: 204 }) }
    if (url.pathname.endsWith("/selection.csv")) return route.fulfill({ contentType: "text/csv", headers: { "Content-Disposition": 'attachment; filename="selection.csv"' }, body: "parent_id,candidate_id\nab_001,candidate-0\n" })
    if (url.pathname.endsWith("/selection")) {
      selections.push(url)
      const offset = Number(url.searchParams.get("offset"))
      const limit = Number(url.searchParams.get("limit"))
      const total = url.searchParams.has("parent_id") ? 1 : 51
      const rows = Array.from({ length: Math.min(limit, Math.max(0, total - offset)) }, (_, i) => ({ parent_id: "ab_001", candidate_id: `candidate-${offset + i}`, quality_tier: null, panel_order: null, vh: "ACDEFGHIKLMNPQRSTVWY", vl: "EFG", score: i ? 0.8 : null }))
      return respond({ columns, rows, total_rows: total, offset, limit, parent_ids: ["ab_001", "ab_002"] })
    }
    if (url.pathname === `/api/v1/jobs/${job.job_id}`) return respond(job)
    if (url.pathname === "/api/v1/jobs") return respond({ jobs: [], next_cursor: null })
    return respond({ detail: "Unexpected test request" }, 404)
  })
  return { submissions, selections, requests, prepared: () => prepared }
}

async function addPair(page: Page) {
  await page.getByLabel("VH sequence", { exact: true }).fill("a c\nd")
  await page.getByLabel("VL sequence", { exact: true }).fill("e f g")
  await page.getByRole("button", { name: "Add pair", exact: true }).click()
}

test("editable CSV batch, normalization, malformed imports, and backend limit", async ({ page }) => {
  await mockApi(page, { maxPairs: 2 })
  await page.goto("/tools/humanization/new")
  await addPair(page)
  await page.locator("#humanization-csv").setInputFiles({ name: "pairs.csv", mimeType: "text/csv", buffer: Buffer.from("id,vh,vl\nab_001,x,efg\n") })
  await expect(page.getByText("Batch · 2 pairs")).toBeVisible()
  await expect(page.getByRole("button", { name: "Submit humanization" })).toBeDisabled()
  const second = page.getByRole("group", { name: "Pair 2", exact: true })
  await second.getByLabel("ID", { exact: true }).fill("ab_002")
  await second.getByLabel("VH · normalized", { exact: true }).fill(" acd ")
  await expect(second.getByLabel("VH · normalized", { exact: true })).toHaveValue("ACD")
  await expect(page.getByRole("button", { name: "Submit humanization" })).toBeEnabled()
  await page.screenshot({ path: test.info().outputPath("humanization-editor.png"), fullPage: true })
  await page.locator("#humanization-csv").setInputFiles({ name: "broken.csv", mimeType: "text/csv", buffer: Buffer.from('id,vh,vl\na,"unterminated,EFG') })
  await expect(page.getByText("Unclosed CSV quotation.", { exact: false })).toBeVisible()
  await expect(page.getByText("Batch · 2 pairs")).toBeVisible()
  await page.locator("#humanization-csv").setInputFiles({ name: "extra.csv", mimeType: "text/csv", buffer: Buffer.from("id,vh,vl\nab_003,ACD,EFG") })
  await expect(page.getByText("Remove pairs to meet the current limit of 2.")).toBeVisible()
  await page.getByRole("button", { name: "Remove pair 3", exact: true }).click()
  await expect(page.getByRole("button", { name: "Submit humanization" })).toBeEnabled()
  const leavePrompt = page.waitForEvent("dialog")
  const clickOverview = page.getByRole("link", { name: "Humanization overview" }).click()
  await (await leavePrompt).dismiss()
  await clickOverview
  await expect(page).toHaveURL(/\/humanization\/new$/)
  page.once("dialog", (dialog) => dialog.accept())
  await page.reload()
  await expect(page.getByText("No pairs added yet.")).toBeVisible()
})

test("lost response replays the unchanged in-memory intent", async ({ page }) => {
  const api = await mockApi(page, { lostResponse: true })
  await page.goto("/tools/humanization/new")
  await addPair(page)
  await page.getByRole("button", { name: "Submit humanization" }).click()
  await page.getByRole("button", { name: "Check submission" }).click()
  await expect(page).toHaveURL(new RegExp(`/jobs/${job.job_id}$`))
  expect(api.submissions).toHaveLength(2)
  expect(api.submissions[1]).toEqual(api.submissions[0])
  expect(api.submissions[0].body).toMatchObject({ pairs: [{ id: "ab_001", vh: "ACD", vl: "EFG" }], display_name: "Antibody humanization", settings: options.defaults })
})

test("editing an ambiguous submission creates a new intent and retains the warning", async ({ page }) => {
  const api = await mockApi(page, { lostResponse: true })
  await page.goto("/tools/humanization/new")
  await addPair(page)
  await page.getByRole("button", { name: "Submit humanization" }).click()
  await expect(page.getByRole("button", { name: "Check submission" })).toBeVisible()
  await page.getByRole("group", { name: "Pair 1", exact: true }).getByLabel("ID", { exact: true }).fill("edited-parent")
  await expect(page.getByText("An earlier submission may already have created a job.", { exact: false })).toBeVisible()
  await page.getByRole("button", { name: "Submit humanization" }).click()
  await expect.poll(() => api.submissions.length).toBe(2)
  expect(api.submissions[1].key).not.toBe(api.submissions[0].key)
  expect(api.submissions[1].body).toMatchObject({ pairs: [{ id: "edited-parent", vh: "ACD", vl: "EFG" }] })
})

test("default-size batch remains editable and Advanced controls submit server defaults", async ({ page }) => {
  const api = await mockApi(page)
  await page.goto("/tools/humanization/new")
  const csv = "id,vh,vl\n" + Array.from({ length: 100 }, (_, index) => `ab_${index},${"A".repeat(120)},${"G".repeat(110)}`).join("\n")
  const start = performance.now()
  await page.locator("#humanization-csv").setInputFiles({ name: "batch.csv", mimeType: "text/csv", buffer: Buffer.from(csv) })
  await expect(page.getByText("Batch · 100 pairs")).toBeVisible()
  console.log(`100-pair import and render: ${Math.round(performance.now() - start)} ms`)
  await page.getByText("Advanced settings", { exact: true }).click()
  await page.getByLabel("Sampling attempts per parent", { exact: true }).fill("3")
  await page.getByLabel("Job name", { exact: true }).fill("  Batch   experiment  ")
  await page.getByRole("button", { name: "Submit humanization" }).click()
  await expect.poll(() => api.submissions.length).toBe(1)
  expect(api.submissions[0].body).toMatchObject({ display_name: "Batch experiment", settings: { ...options.defaults, hudiff_ab_candidate_count: 3 } })
})

test("reauthentication keeps the batch mounted and never automatically submits", async ({ page }) => {
  const api = await mockApi(page, { expired: true })
  await page.goto("/tools/humanization/new")
  await addPair(page)
  await page.getByRole("button", { name: "Submit humanization" }).click()
  const dialog = page.getByRole("dialog", { name: "Sign in again" })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel("Email", { exact: true }).fill("researcher@example.test")
  await dialog.getByLabel("Password", { exact: true }).fill("correct horse battery staple")
  await dialog.getByRole("button", { name: "Sign in and return" }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByText("Batch · 1 pair")).toBeVisible()
  expect(api.submissions).toHaveLength(1)
  await page.getByRole("button", { name: "Check submission" }).click()
  await expect.poll(() => api.submissions.length).toBe(2)
  expect(api.submissions[1]).toEqual(api.submissions[0])
})

test("Result table fetches one page, delegates sorting/filtering, and downloads CSV natively", async ({ page }) => {
  const api = await mockApi(page)
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto(`/tools/humanization/jobs/${job.job_id}`)
  await expect(page.getByText("1–50 of 51 rows")).toBeVisible()
  expect(api.selections).toHaveLength(1)
  expect(api.selections[0].search).toBe("?offset=0&limit=50")
  await page.getByRole("button", { name: "Next", exact: true }).click()
  await expect(page.getByText("51–51 of 51 rows")).toBeVisible()
  await page.getByRole("button", { name: "score", exact: true }).click()
  await expect.poll(() => api.selections.at(-1)?.searchParams.get("sort_by")).toBe("score")
  expect(api.selections.at(-1)?.searchParams.get("offset")).toBe("0")
  await page.getByRole("button", { name: "score", exact: true }).click()
  await expect.poll(() => api.selections.at(-1)?.searchParams.get("descending")).toBe("true")
  await page.getByLabel("Parent", { exact: true }).selectOption("ab_001")
  await expect(page.getByText("1–1 of 1 rows")).toBeVisible()
  await page.getByRole("button", { name: "Restore scientific order" }).click()
  await expect.poll(() => api.selections.at(-1)?.searchParams.has("sort_by")).toBe(false)
  const downloadEvent = page.waitForEvent("download")
  await page.getByRole("button", { name: "Download selection.csv" }).click()
  expect((await downloadEvent).suggestedFilename()).toBe("selection.csv")
  expect(api.prepared()).toBe(1)
  expect(api.requests.some((request) => request.startsWith("POST") && request.includes("/selection"))).toBe(false)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: test.info().outputPath("humanization-results-mobile.png"), fullPage: true })
})
