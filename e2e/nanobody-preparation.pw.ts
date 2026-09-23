import { expect, test, type Page } from "@playwright/test"

const principal = { user_id: "nano-user", display_name: "Researcher", email: "nano@example.test", is_admin: false }
const defaults = { root_seed: 0, hudiff_nb_candidate_count: 10, abnativ2_residue_score_threshold: 0.98, abnativ2_rasa_threshold: 0.15, abnativ2_max_relative_vhh_score_decrease: 0.05 }
const options = { max_parents: 100, max_input_length: 512, max_csv_bytes: 10485760, preparation_version: "1|arpeggia=0.10.1|IMGT-202636-7+llama-supplement", defaults, settings_schema: { properties: {
  root_seed: { type: "integer", minimum: 0, maximum: 4294967295 }, hudiff_nb_candidate_count: { type: "integer", minimum: 1, maximum: 25 },
  abnativ2_residue_score_threshold: { type: "number", minimum: 0, maximum: 1 }, abnativ2_rasa_threshold: { type: "number", minimum: 0, maximum: 1 }, abnativ2_max_relative_vhh_score_decrease: { type: "number", minimum: 0, maximum: 1 },
} } }
type Parent = { id: string; vhh: string }
const preview = (parents: Parent[]) => ({ preparation_version: options.preparation_version, rows: parents.map(({ id, vhh }, row_index) => ({ row_index, id, vh: vhh })), errors: [], preparation_digest: "a".repeat(64) })
const job = { job_id: "99999999-1111-4111-8111-111111111111", display_name: "Nanobody humanization", tool: "nanobody_humanization", state: "cancelled", created_at: "2026-09-22T00:00:00Z", updated_at: "2026-09-22T00:01:00Z", stages: [], warnings: [], can_view_logs: false, can_retry_result_preparation: false }

async function mockApi(page: Page, overrides = {}) {
  const requests: string[] = []
  const preparations: Parent[][] = []
  await page.context().addCookies([{ name: "biomodals-csrf", value: "local-csrf", url: process.env.BIOMODALS_BROWSER_ORIGIN! }])
  await page.route("**/api/**", async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    requests.push(`${request.method()} ${url.pathname}`)
    if (url.pathname.endsWith("/auth/me") || url.pathname.endsWith("/auth/login")) return route.fulfill({ json: principal })
    if (url.pathname === `/api/v1/jobs/${job.job_id}`) return route.fulfill({ json: job })
    if (url.pathname.endsWith("/nanobody-humanization/options")) return route.fulfill({ json: { ...options, ...overrides } })
    if (url.pathname.endsWith("/nanobody-humanization/prepare")) {
      preparations.push(request.postDataJSON().parents)
      expect(request.headers()["x-csrf-token"]).toBe("local-csrf")
      return route.fulfill({ json: preview(request.postDataJSON().parents) })
    }
    return route.fulfill({ status: 404, json: { detail: "Unexpected offline request" } })
  })
  return { requests, preparations }
}

async function add(page: Page, sequence = "a c\nd") {
  await page.getByLabel("VH sequence", { exact: true }).fill(sequence)
  await page.getByRole("button", { name: "Add sequence", exact: true }).click()
}

test("large candidate results jump to any page without enumerating page options", async ({ page }) => {
  await mockApi(page)
  await page.route(`**/api/v1/jobs/${job.job_id}`, (route) => route.fulfill({ json: { ...job, state: "succeeded" } }))
  const queries: URLSearchParams[] = []
  await page.route("**/nanobody-humanization/jobs/*/selection?*", (route) => {
    const params = new URL(route.request().url()).searchParams
    queries.push(params)
    const offset = Number(params.get("offset"))
    return route.fulfill({ json: { columns: [{ name: "candidate_id", type: "string" }], rows: Array.from({ length: 50 }, (_, i) => ({ candidate_id: `candidate_${offset + i}` })), total_rows: 2_000_000, offset, limit: 50, parent_ids: [], default_hidden_columns: [], nativeness_ranges: {}, nonparent_count: 1_999_999 } })
  })
  await page.goto(`/tools/nanobody-humanization/jobs/${job.job_id}`)
  await expect(page.getByText("1–50 of 2000000 rows", { exact: true })).toBeVisible()
  const jump = page.getByRole("form", { name: "Jump to candidate page", exact: true })
  await expect(jump.getByRole("spinbutton", { name: "Page", exact: true })).toHaveAttribute("max", "40000")
  await expect(page.getByRole("navigation", { name: "Candidate pages", exact: true }).locator("option")).toHaveCount(0)
  await jump.getByLabel("Page", { exact: true }).fill("40001")
  await jump.getByRole("button", { name: "Go", exact: true }).click()
  expect(queries).toHaveLength(1)
  await jump.getByLabel("Page", { exact: true }).fill("40000")
  await jump.getByLabel("Page", { exact: true }).press("Enter")
  await expect(page.getByText("1999951–2000000 of 2000000 rows", { exact: true })).toBeVisible()
  expect(queries.map((query) => [query.get("offset"), query.get("limit")])).toEqual([["0", "50"], ["1999950", "50"]])
  await expect(page.getByRole("button", { name: "Next page", exact: true })).toBeDisabled()
})

for (const nonparentCount of [0, 2]) test(`no-new-designs notice uses full-result count ${nonparentCount} across pages and filters`, async ({ page }) => {
  await mockApi(page)
  await page.route(`**/api/v1/jobs/${job.job_id}`, (route) => route.fulfill({ json: { ...job, state: "succeeded" } }))
  await page.route("**/nanobody-humanization/jobs/*/selection?*", (route) => {
    const url = new URL(route.request().url())
    const offset = Number(url.searchParams.get("offset"))
    const filtered = url.searchParams.has("parent_id")
    // Both visible pages contain only a parent, even when other designs exist.
    return route.fulfill({ json: { columns: [{ name: "parent_id", type: "string" }, { name: "is_parent", type: "boolean" }], rows: filtered ? [] : [{ parent_id: "parent", is_parent: true }], total_rows: filtered ? 0 : 100, offset, limit: 50, parent_ids: ["parent"], nonparent_count: nonparentCount, default_hidden_columns: [], nativeness_ranges: {}, germlines: null, reference: null } })
  })
  await page.goto(`/tools/nanobody-humanization/jobs/${job.job_id}`)
  const notice = page.getByText("No new designs were produced.", { exact: true })
  await expect(page.getByText("1–1 of 100 rows", { exact: true })).toBeVisible()
  await expect(notice).toHaveCount(nonparentCount === 0 ? 1 : 0)
  await page.getByRole("button", { name: "Next page", exact: true }).click()
  await expect(page.getByText("51–51 of 100 rows", { exact: true })).toBeVisible()
  await expect(notice).toHaveCount(nonparentCount === 0 ? 1 : 0)
  await page.getByRole("button", { name: /^Filter by parent/ }).click()
  await page.getByLabel("Parent", { exact: true }).selectOption("parent")
  await expect(page.getByText("0 of 0 rows", { exact: true })).toBeVisible()
  await expect(notice).toHaveCount(nonparentCount === 0 ? 1 : 0)
})

test("busy local preparation keeps originals and retries only on an explicit click", async ({ page }) => {
  await mockApi(page)
  const calls: Parent[][] = []
  await page.route("**/nanobody-humanization/prepare", (route) => {
    const parents = route.request().postDataJSON().parents
    calls.push(parents)
    return calls.length === 1 ? route.fulfill({ status: 503, json: { code: "local_analysis_busy", detail: "Local sequence analysis is busy. Please try again." } }) : route.fulfill({ json: preview(parents) })
  })
  await page.goto("/tools/nanobody-humanization/new")
  await add(page)
  await page.getByRole("button", { name: "Prepare sequences", exact: true }).click()
  await expect(page.getByRole("alert")).toContainText("Local sequence analysis is busy")
  await expect(page.getByRole("group", { name: "Parent 1", exact: true }).getByLabel("Original VH · normalized", { exact: true })).toHaveValue("ACD")
  await page.evaluate(() => { window.dispatchEvent(new Event("online")); document.dispatchEvent(new Event("visibilitychange")) })
  await page.waitForTimeout(1250) // Cross the shared default query retry interval.
  expect(calls).toHaveLength(1)
  await expect(page.getByRole("button", { name: "Submit humanization", exact: true })).toBeDisabled()
  await page.getByRole("button", { name: "Prepare sequences", exact: true }).click()
  await expect(page.getByRole("button", { name: "Submit humanization", exact: true })).toBeEnabled()
  expect(calls).toEqual([[{ id: "nb_001", vhh: "ACD" }], [{ id: "nb_001", vhh: "ACD" }]])
})

test("busy job admission keeps the reviewed intent for explicit Submit, not Check submission", async ({ page }) => {
  const api = await mockApi(page)
  const submissions: { body: unknown; key: string }[] = []
  await page.route("**/nanobody-humanization/jobs", (route) => {
    const request = route.request()
    submissions.push({ body: request.postDataJSON(), key: request.headers()["idempotency-key"] })
    return submissions.length === 1 ? route.fulfill({ status: 503, json: { code: "local_analysis_busy", detail: "Local sequence analysis is busy. Please try again." } }) : route.fulfill({ status: 202, json: job })
  })
  await page.goto("/tools/nanobody-humanization/new")
  await add(page)
  await page.getByText("Advanced settings", { exact: true }).click()
  await page.getByLabel("Root seed", { exact: true }).fill("42")
  await page.getByRole("button", { name: "Prepare sequences", exact: true }).click()
  await page.getByRole("button", { name: "Submit humanization", exact: true }).click()
  await expect(page.getByRole("alert")).toContainText("Your reviewed batch and settings are unchanged")
  await expect(page.getByRole("status")).toContainText("Batch prepared")
  await expect(page.getByRole("button", { name: "Check submission", exact: true })).toHaveCount(0)
  await expect(page.getByLabel("Root seed", { exact: true })).toHaveValue("42")
  await page.waitForTimeout(1250)
  expect(submissions).toHaveLength(1)
  await page.getByRole("button", { name: "Submit humanization", exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/nanobody-humanization/jobs/${job.job_id}$`))
  expect(api.preparations).toHaveLength(1)
  expect(submissions).toHaveLength(2)
  expect(submissions[1]).toEqual(submissions[0])
  expect(submissions[0].body).toMatchObject({ parents: [{ id: "nb_001", vhh: "ACD" }], settings: { root_seed: 42 }, preparation_digest: "a".repeat(64) })
})

test("manual and CSV inputs share an editable preview without scientific submission", async ({ page }) => {
  const api = await mockApi(page)
  await page.goto("/tools/nanobody-humanization/new")
  await expect(page).toHaveTitle("New job · Nanobody humanization | BioModals")
  await add(page)
  await page.getByLabel("CSV file", { exact: true }).setInputFiles({ name: "parents.csv", mimeType: "text/csv", buffer: Buffer.from("id,vhh\nimported, ef g\n") })
  await expect(page.getByText("Current batch · 2 parents", { exact: true })).toBeVisible()
  expect(api.preparations).toHaveLength(0)
  await page.getByText("Advanced settings", { exact: true }).click()
  await expect(page.getByLabel("Root seed", { exact: true })).toHaveValue("0")
  await expect(page.getByLabel("Sampling attempts per parent", { exact: true })).toHaveValue("10")
  await page.getByLabel("Sampling attempts per parent", { exact: true }).fill("26")
  await expect(page.getByLabel("Sampling attempts per parent", { exact: true })).toHaveAttribute("aria-invalid", "true")
  await page.getByLabel("Sampling attempts per parent", { exact: true }).fill("2")
  await page.getByRole("button", { name: "Prepare sequences", exact: true }).click()
  await expect(page.getByRole("status")).toContainText("Batch prepared")
  expect(api.preparations).toEqual([[{ id: "nb_001", vhh: "ACD" }, { id: "imported", vhh: "EFG" }]])
  await expect(page.getByRole("group", { name: "Parent 2", exact: true })).toContainText("3 residues · parental baseline")
  await page.getByLabel("Root seed", { exact: true }).fill("42")
  await expect(page.getByRole("status")).toContainText("Batch prepared")
  await page.getByLabel("CSV file", { exact: true }).setInputFiles({ name: "malformed.csv", mimeType: "text/csv", buffer: Buffer.from('id,vhh\nbad,"unterminated') })
  await expect(page.getByRole("alert")).toContainText("Unclosed CSV")
  await expect(page.getByText("Current batch · 2 parents", { exact: true })).toBeVisible()
  await expect(page.getByRole("status")).toContainText("Batch prepared")
  expect(api.requests.filter((request) => request.startsWith("POST "))).toEqual(["POST /api/v1/nanobody-humanization/prepare"])
  const leave = page.waitForEvent("dialog")
  const clicking = page.getByRole("link", { name: "Nanobody overview", exact: true }).click()
  await (await leave).dismiss()
  await clicking
  await expect(page).toHaveURL(/\/nanobody-humanization\/new$/)
  page.once("dialog", (dialog) => dialog.accept())
  await page.reload()
  await expect(page.getByText("No sequences added yet.", { exact: true })).toBeVisible()
})

test("uncertain submission checks the exact request and key; edits create a new intent", async ({ page }) => {
  const api = await mockApi(page)
  const submissions: { body: unknown; key: string }[] = []
  await page.route("**/nanobody-humanization/jobs", async (route) => {
    const request = route.request()
    expect(request.headers()["x-csrf-token"]).toBe("local-csrf")
    submissions.push({ body: request.postDataJSON(), key: request.headers()["idempotency-key"] })
    if (submissions.length < 3) return route.abort("failed")
    return route.fulfill({ status: 202, json: job })
  })
  await page.goto("/tools/nanobody-humanization/new")
  await add(page)
  await page.getByRole("button", { name: "Prepare sequences", exact: true }).click()
  await expect(page.getByRole("status")).toContainText("Batch prepared")
  expect(submissions).toHaveLength(0)
  await page.getByRole("button", { name: "Submit humanization", exact: true }).click()
  await page.getByRole("button", { name: "Check submission", exact: true }).click()
  await expect(page.getByRole("button", { name: "Check submission", exact: true })).toBeEnabled()
  expect(submissions).toHaveLength(2)
  expect(submissions[1]).toEqual(submissions[0])
  expect(submissions[0].body).toEqual({ display_name: "Nanobody humanization", parents: [{ id: "nb_001", vhh: "ACD" }], settings: defaults, preparation_digest: "a".repeat(64) })
  expect(submissions[0].key).toMatch(/^[0-9a-f-]{36}$/)
  await page.getByLabel("Job name", { exact: true }).fill("  New   intent  ")
  await expect(page.getByRole("alert")).toContainText("earlier submission was not confirmed")
  await page.getByRole("button", { name: "Submit humanization", exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/nanobody-humanization/jobs/${job.job_id}$`))
  expect(submissions).toHaveLength(3)
  expect(submissions[2].key).not.toBe(submissions[0].key)
  expect(submissions[2].body).toMatchObject({ display_name: "New intent" })
  expect(api.preparations).toHaveLength(1)
  await expect(page.getByRole("link", { name: "Rerun with same inputs", exact: true })).toHaveAttribute("href", `/tools/nanobody-humanization/new?source_job=${job.job_id}`)
})

test("a changed digest requires review again and semantic row errors remain editable", async ({ page }) => {
  const api = await mockApi(page)
  let submits = 0
  await page.route("**/nanobody-humanization/jobs", (route) => {
    submits++
    return submits === 1 ? route.fulfill({ status: 409, json: { code: "preparation_changed", detail: "Preparation changed" } }) : route.fulfill({ status: 422, json: { errors: [{ row_index: 0, field: "id", code: "id_invalid", message: "Correct this ID before submitting" }] } })
  })
  await page.goto("/tools/nanobody-humanization/new")
  await add(page)
  await page.getByRole("button", { name: "Prepare sequences", exact: true }).click()
  await page.getByRole("button", { name: "Submit humanization", exact: true }).click()
  await expect(page.getByRole("alert")).toContainText("Prepare and review the batch again")
  await expect(page.getByRole("button", { name: "Submit humanization", exact: true })).toBeDisabled()
  expect(api.preparations).toHaveLength(1)
  expect(submits).toBe(1)
  await page.getByRole("button", { name: "Prepare sequences", exact: true }).click()
  await page.getByRole("button", { name: "Submit humanization", exact: true }).click()
  await expect(page.getByRole("group", { name: "Parent 1", exact: true })).toContainText("Correct this ID before submitting")
  await expect(page.getByRole("button", { name: "Submit humanization", exact: true })).toBeDisabled()
  await page.getByRole("group", { name: "Parent 1", exact: true }).getByLabel("ID", { exact: true }).fill("corrected")
  await expect(page.getByText("Prepare the batch to review this sequence.", { exact: true })).toBeVisible()
  expect(submits).toBe(2)
})

test("rerun copies originals and saved settings but requires new preparation", async ({ page }) => {
  const api = await mockApi(page)
  await page.route(`**/nanobody-humanization/jobs/${job.job_id}/inputs`, (route) => route.fulfill({ json: { display_name: "Previous name", parents: [{ id: "original", vhh: "ACDE" }], settings: { ...defaults, root_seed: 42, hudiff_nb_candidate_count: 3 }, prepared_parents: [{ row_index: 0, id: "original", vh: "QVQLACDE" }], preparation_version: "old-policy" } }))
  await page.goto(`/tools/nanobody-humanization/jobs/${job.job_id}`)
  await page.getByRole("link", { name: "Rerun with same inputs", exact: true }).click()
  await expect(page.getByLabel("Job name", { exact: true })).toHaveValue("Previous name")
  await expect(page.getByRole("group", { name: "Parent 1", exact: true }).getByLabel("Original VH · normalized", { exact: true })).toHaveValue("ACDE")
  await expect(page.getByText("Prepare the batch to review this sequence.", { exact: true })).toBeVisible()
  await page.getByText("Advanced settings", { exact: true }).click()
  await expect(page.getByLabel("Root seed", { exact: true })).toHaveValue("42")
  await expect(page.getByLabel("Sampling attempts per parent", { exact: true })).toHaveValue("3")
  await expect(page.getByRole("button", { name: "Submit humanization", exact: true })).toBeDisabled()
  expect(api.requests.filter((request) => request.startsWith("POST "))).toEqual([])
  await page.getByRole("button", { name: "Prepare sequences", exact: true }).click()
  await expect(page.getByRole("button", { name: "Submit humanization", exact: true })).toBeEnabled()
  expect(api.preparations).toEqual([[{ id: "original", vhh: "ACDE" }]])
})

test("invalid rows retain valid previews and corrections require fresh preparation", async ({ page }) => {
  await mockApi(page)
  let calls = 0
  await page.route("**/nanobody-humanization/prepare", (route) => {
    calls++
    const parents = route.request().postDataJSON().parents as Parent[]
    const result = preview(parents)
    return route.fulfill({ json: calls === 1 ? { ...result, preparation_digest: null, rows: result.rows.map((row) => ({ ...row, vh: row.row_index === 1 ? null : "QVQLVQSG" })), errors: [{ row_index: 1, field: "vhh", code: "domain_invalid", message: "Provide one heavy-chain variable domain" }] } : result })
  })
  await page.goto("/tools/nanobody-humanization/new")
  await add(page)
  await page.getByLabel("CSV file", { exact: true }).setInputFiles({ name: "batch.csv", mimeType: "text/csv", buffer: Buffer.from("id,vhh\ninvalid,INVALID*") })
  await page.getByRole("button", { name: "Prepare sequences", exact: true }).click()
  const second = page.getByRole("group", { name: "Parent 2", exact: true })
  await expect(second).toContainText("Provide one heavy-chain variable domain")
  await expect(second.getByLabel("Original VH · normalized", { exact: true })).toHaveValue("INVALID*")
  await expect(page.getByRole("group", { name: "Parent 1", exact: true })).toContainText("QVQLVQSG")
  await second.getByLabel("Original VH · normalized", { exact: true }).fill(" q v q l ")
  await expect(second.getByLabel("Original VH · normalized", { exact: true })).toHaveValue("QVQL")
  await expect(page.getByText("Prepare the batch to review this sequence.", { exact: true })).toHaveCount(2)
  expect(calls).toBe(1)
  await page.getByRole("button", { name: "Prepare sequences", exact: true }).click()
  await expect(page.getByRole("status")).toContainText("Batch prepared")
  expect(calls).toBe(2)
  await page.getByRole("button", { name: "Remove parent 1", exact: true }).click()
  await expect(page.getByText("Current batch · 1 parent", { exact: true })).toBeVisible()
  await expect(page.getByText("Prepare the batch to review this sequence.", { exact: true })).toHaveCount(1)
})

test("late preparation responses cannot restore a stale reviewed baseline", async ({ page }) => {
  await mockApi(page)
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  let requests = 0
  let firstResponseFinished = false
  await page.route("**/nanobody-humanization/prepare", async (route) => {
    const parents = route.request().postDataJSON().parents as Parent[]
    requests++
    const first = requests === 1
    if (first) await gate
    await route.fulfill({ json: preview(parents) })
    if (first) firstResponseFinished = true
  })
  await page.goto("/tools/nanobody-humanization/new")
  await add(page)
  await page.getByRole("button", { name: "Prepare sequences", exact: true }).click()
  await expect.poll(() => requests).toBe(1)
  await expect(page.getByRole("button", { name: "Preparing sequences…", exact: true })).toBeDisabled()
  const original = page.getByRole("group", { name: "Parent 1", exact: true }).getByLabel("Original VH · normalized", { exact: true })
  await original.fill("EFGH")
  await page.getByRole("button", { name: "Prepare sequences", exact: true }).click()
  await expect(page.getByRole("status")).toContainText("Batch prepared")
  release()
  await expect.poll(() => firstResponseFinished).toBe(true)
  await expect(original).toHaveValue("EFGH")
  await expect(page.getByRole("group", { name: "Parent 1", exact: true })).toContainText("4 residues · parental baseline")
  expect(requests).toBe(2)
})

test("service bounds block oversized requests without silently losing input", async ({ page }) => {
  const api = await mockApi(page, { max_parents: 1, max_input_length: 4, max_csv_bytes: 32 })
  await page.goto("/tools/nanobody-humanization/new")
  await add(page, "ACDEF")
  await expect(page.getByText("Shorten this original input", { exact: false })).toContainText("4 residues")
  await expect(page.getByRole("button", { name: "Prepare sequences", exact: true })).toBeDisabled()
  const original = page.getByRole("group", { name: "Parent 1", exact: true }).getByLabel("Original VH · normalized", { exact: true })
  await expect(original).toHaveValue("ACDEF")
  await original.fill("ACDE")
  await page.getByLabel("CSV file", { exact: true }).setInputFiles({ name: "large.csv", mimeType: "text/csv", buffer: Buffer.from("id,vhh\n" + "x".repeat(40)) })
  await expect(page.getByRole("alert")).toContainText("The batch was not changed")
  await add(page, "EFG")
  await expect(page.getByRole("alert").filter({ hasText: "exceeds" })).toContainText("limit of 1")
  await expect(page.getByRole("button", { name: "Prepare sequences", exact: true })).toBeDisabled()
  await page.getByRole("button", { name: "Remove parent 2", exact: true }).click()
  await expect(page.getByRole("button", { name: "Prepare sequences", exact: true })).toBeEnabled()
  expect(api.preparations).toHaveLength(0)
})

test("reauthentication preserves a mounted batch and requires explicit preparation retry", async ({ page }) => {
  await mockApi(page)
  let calls = 0
  await page.route("**/nanobody-humanization/prepare", (route) => {
    calls++
    return calls === 1 ? route.fulfill({ status: 401, json: { detail: "Sign in again" } }) : route.fulfill({ json: preview(route.request().postDataJSON().parents) })
  })
  await page.goto("/tools/nanobody-humanization/new")
  await add(page)
  await page.getByRole("button", { name: "Prepare sequences", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Sign in again", exact: true })
  await dialog.getByLabel("Email", { exact: true }).fill(principal.email)
  await dialog.getByLabel("Password", { exact: true }).fill("local-password")
  await dialog.getByRole("button", { name: "Sign in and return", exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole("group", { name: "Parent 1", exact: true }).getByLabel("Original VH · normalized", { exact: true })).toHaveValue("ACD")
  expect(calls).toBe(1)
  await page.getByRole("button", { name: "Prepare sequences", exact: true }).click()
  await expect(page.getByRole("status")).toContainText("Batch prepared")
  expect(calls).toBe(2)
})

test("batch paging retains off-page errors and preparation uses the complete order", async ({ page }) => {
  await mockApi(page)
  let prepared: Parent[] = []
  await page.route("**/nanobody-humanization/prepare", (route) => {
    prepared = route.request().postDataJSON().parents
    return route.fulfill({ json: { ...preview(prepared), preparation_digest: null, errors: [{ row_index: 52, field: "id", code: "id_invalid", message: "Correct this ID" }] } })
  })
  await page.goto("/tools/nanobody-humanization/new")
  await page.getByLabel("CSV file", { exact: true }).setInputFiles({ name: "batch.csv", mimeType: "text/csv", buffer: Buffer.from("id,vhh\n" + Array.from({ length: 55 }, (_, i) => `parent_${i},ACDE`).join("\n")) })
  await expect(page.getByRole("group", { name: /^Parent \d+$/ })).toHaveCount(50)
  await page.getByRole("button", { name: "Prepare sequences", exact: true }).click()
  await page.getByRole("button", { name: "Go to first invalid row", exact: true }).click()
  await expect(page.getByRole("group", { name: /^Parent \d+$/ })).toHaveCount(5)
  await expect(page.getByRole("group", { name: "Parent 53", exact: true })).toContainText("Correct this ID")
  expect(prepared).toHaveLength(55)
  expect(prepared[52].id).toBe("parent_52")
})
