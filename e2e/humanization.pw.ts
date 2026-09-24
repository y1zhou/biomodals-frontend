import { expect, test, type Page } from "@playwright/test"
import options from "./fixtures/humanization-options.json" with { type: "json" }

const principal = { user_id: "user-one", display_name: "Researcher", email: "researcher@example.test", is_admin: false }
const job = { job_id: "11111111-1111-4111-8111-111111111111", display_name: "Antibody humanization", tool: "humanization", state: "partial", created_at: "2026-09-07T00:00:00Z", updated_at: "2026-09-07T00:01:00Z", stages: [
  { code: "generate_sapiens", label: "Sapiens", outcome: "completed", started_at: "2026-09-07T00:00:00Z", ended_at: "2026-09-07T00:00:10Z" },
  { code: "generate_humatch", label: "Humatch", outcome: "completed", started_at: "2026-09-07T00:00:00Z", ended_at: "2026-09-07T00:00:20Z" },
  { code: "generate_pabnativ2", label: "p-AbNatiV2", outcome: "completed", started_at: "2026-09-07T00:00:00Z", ended_at: "2026-09-07T00:00:40Z" },
  { code: "generate_hudiff_ab", label: "HuDiff", outcome: "completed", started_at: "2026-09-07T00:00:00Z", ended_at: "2026-09-07T00:00:30Z" },
  { code: "union", label: "Collect unique candidates", outcome: "completed", started_at: "2026-09-07T00:00:40Z", ended_at: "2026-09-07T00:00:45Z" },
  { code: "evaluate", label: "Evaluate and rank candidates", outcome: "partial", started_at: "2026-09-07T00:00:45Z", ended_at: "2026-09-07T00:01:00Z" },
], warnings: ["One evaluator could not score a candidate."], can_view_logs: false }
const columns = ["parent_id", "candidate_id", "quality_tier", "panel_order", "vh", "vl", "sapiens_vh_mean_probability"].map((name) => ({ name, type: ["quality_tier", "panel_order", "sapiens_vh_mean_probability"].includes(name) ? "number" : "string" }))
const analysisOptions = { max_groups: 2, max_entries_per_group: 1000, max_chain_length: 512, max_request_bytes: 4194304, schemes: ["imgt", "kabat", "chothia", "martin", "aho"], default_scheme: "imgt", analysis_version: "5", arpeggia_version: "0.10.1" }
const emptyAnalysis = { groups: [{ id: "Group 1", entries: [], issues: [] }], reference: { status: "unavailable", source_url: "https://example.test/reference.csv", detail: "Offline reference unavailable" } }

for (const suffix of ["pi", "pI"]) test(`candidate headers keep chains adjacent and preserve ${suffix} sorting keys`, async ({ page }) => {
  await mockApi(page)
  const names = suffix === "pi" ? ["vh", "vh_pi", "vl_pi", "vh_vl_pi", "vh_v_gene", "vl"] : ["vh", "vl", "vh_pI", "vl_pI", "vh_vl_pI", "vh_v_gene"]
  await page.route("**/selection?*", (route) => route.fulfill({ json: {
    columns: names.map((name) => ({ name, type: name.endsWith(suffix) ? "number" : "string" })),
    rows: [{ vh: "ACDE", vl: "EFGH", [`vh_${suffix}`]: 6.78912 }], total_rows: 1, offset: 0, limit: 50, parent_ids: [], default_hidden_columns: [], nativeness_ranges: {}, germlines: null, reference: null,
  } }))
  await page.goto(`/tools/humanization/jobs/${job.job_id}`)
  const table = page.getByRole("table", { name: "Humanization selection.csv, page 1", exact: true })
  await expect(table.locator("thead th > button")).toHaveText(["vh", "vl", "vh_pI", "vl_pI", "vh_vl_pI", "vh_v_gene"])
  const sorted = page.waitForResponse((response) => new URL(response.url()).searchParams.get("sort_by") === `vh_${suffix}`)
  await table.getByRole("button", { name: "vh_pI", exact: true }).click()
  await sorted
  await expect(page.getByText("Sorted by vh_pI (ascending).", { exact: true })).toBeVisible()
  await expect(table.getByTitle("6.78912", { exact: true })).toHaveText("6.789")
  await page.getByRole("button", { name: "Columns", exact: true }).click()
  await page.getByRole("menuitemcheckbox", { name: "vh_pI", exact: true }).click()
  await page.keyboard.press("Escape")
  await expect(table.locator("thead th > button")).toHaveText(["vh", "vl", "vl_pI", "vh_vl_pI", "vh_v_gene"])
})

for (const version of ["1", "2", "3", "4"]) test(`analysis version ${version} requires an API update before displaying current metrics`, async ({ page }) => {
  const api = await mockApi(page)
  await page.route("**/antibody-sequence-analysis/options", (route) => route.fulfill({ json: { ...analysisOptions, analysis_version: version } }))
  await page.goto("/tools/antibody-sequence-analysis")
  await page.getByLabel("Group 1 FASTA", { exact: true }).fill(">test\nACDE")
  await expect(page.getByRole("button", { name: "Analyze sequences", exact: true })).toBeDisabled()
  await expect(page.getByRole("alert")).toContainText("updated API")
  await page.goto(`/tools/humanization/jobs/${job.job_id}`)
  await page.getByRole("button", { name: /^Inspect VH from/ }).first().click()
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("updated API")
  expect(api.requests.some((request) => /POST .*antibody-sequence-analysis\/(sequence|analyze)/.test(request))).toBe(false)
})

test("common native alignment preserves full input, separate gaps and three difference strips", async ({ page }) => {
  await mockApi(page)
  const sequence = "ACDEFGHIKLMNPQRSTVWY"
  const inputIndices = [0, 1, 2, null, 3, 4, null, null, ...Array.from({ length: sequence.length - 5 }, (_, i) => i + 5)]
  const aligned = {
    input_indices: inputIndices,
    input: inputIndices.map((index, column) => index === null ? column === 7 ? " " : "-" : sequence[index]).join(""),
    germline: inputIndices.map((index, column) => index === null ? column === 3 ? "K" : " " : index < 2 || index >= 18 ? " " : index === 4 || index === 11 || index === 12 ? "-" : sequence[index]).join(""),
    germline_diffs: inputIndices.map((index, column) => column === 3 ? "-" : index === 4 ? "+" : " ").join(""),
    parental: inputIndices.map((index, column) => index === null ? column === 6 ? "R" : column === 7 ? "-" : " " : index === 10 ? "V" : sequence[index]).join(""),
    parental_diffs: inputIndices.map((index, column) => column === 6 ? "-" : index === 10 ? "x" : " ").join(""),
    parental_germline: inputIndices.map((index, column) => index === null ? column === 7 ? "W" : " " : index === 2 ? "A" : sequence[index]).join(""),
    parental_germline_diffs: inputIndices.map((index, column) => column === 7 ? "-" : index === 2 ? "x" : " ").join(""),
  }
  let parentalNumberingFailed = false
  await page.route("**/antibody-sequence-analysis/sequence", (route) => {
    const input = route.request().postDataJSON()
    return route.fulfill({ json: { ...input, cdr_definition: input.scheme, chain_type: "H", domain_span: [2, 18], residues: Array.from({ length: 16 }, (_, index) => ({ input_index: index + 2, label: String(index + 102), region: index >= 8 && index < 11 ? "CDR1" : "FR1" })), liabilities: [{ kind: "methionine", start: 10, end: 11 }], diagnostics: [], error: null, germlines: [{ segment: "v", reference_ids: ["test-reference"], reference_names: ["Homo sapiens IGHV1*01"], tied_reference_count: 3 }, { segment: "j", reference_ids: ["j-reference"], reference_names: ["Homo sapiens IGHJ1*01"], tied_reference_count: 1 }], parental_germlines: parentalNumberingFailed ? [] : [{ segment: "v", reference_ids: ["parent-v"], reference_names: ["Mus musculus IGHV2*01"], tied_reference_count: 1 }, { segment: "j", reference_ids: ["parent-j"], reference_names: ["Mus musculus IGHJ2*01"], tied_reference_count: 1 }], parental_germline_error: parentalNumberingFailed ? "The parental domain could not be numbered." : null, alignment: parentalNumberingFailed ? { ...aligned, parental_germline: null, parental_germline_diffs: null } : aligned } })
  })
  await page.goto(`/tools/humanization/jobs/${job.job_id}`)
  await page.getByRole("button", { name: /^Inspect VH from/ }).first().click()
  const dialog = page.getByRole("dialog")
  const alignment = dialog.getByRole("region", { name: "Sequence alignment", exact: true })
  await expect(alignment).toContainText("Homo sapiens IGHV1*01")
  await expect(alignment.locator("col.border")).toHaveCount(0)
  await expect(alignment).toContainText("Homo sapiens IGHJ1*01")
  await expect(alignment).toContainText("Humanized V/J:")
  await expect(alignment).toContainText("Parental V/J:")
  await expect(alignment).toContainText("Mus musculus IGHV2*01")
  await expect(alignment).toContainText("Mus musculus IGHJ2*01")
  const rows = alignment.locator("tbody tr")
  await expect(rows.locator("th")).toHaveText(["Germline (humanized)", "Humanized relative to its germline", "Humanized", "Humanized relative to parental", "Parental", "Parental relative to its germline", "Germline (parental)"])
  for (const index of [1, 3, 5]) await expect(rows.nth(index).locator("th > span")).toHaveClass("sr-only")
  for (const [index, value] of [aligned.germline, aligned.germline_diffs, aligned.input, aligned.parental_diffs, aligned.parental, aligned.parental_germline_diffs, aligned.parental_germline].entries()) expect((await rows.nth(index).locator("td").allTextContents()).join("")).toBe(value)
  await expect(rows.nth(2)).toHaveClass(/font-bold/)
  await expect(alignment.getByTitle("Input gap", { exact: true })).toHaveCount(2)
  await expect(alignment.getByTitle("No input residue", { exact: true })).toHaveText(" ")
  const residues = alignment.locator('span[tabindex="0"]')
  await expect(residues).toHaveCount(sequence.length)
  const methionine = residues.nth(10)
  await expect(methionine).toHaveAttribute("aria-label", /M, input residue 11, position 110, CDR1; Methionine oxidation motif/)
  await expect(methionine).toHaveClass(/border-rose-500/)
  await methionine.focus()
  await expect(dialog.getByRole("status").filter({ hasText: "Input residue" })).toContainText("Input residue 11: M")
  await residues.first().focus()
  await expect(dialog.getByRole("status").filter({ hasText: "Input residue" })).toContainText("Unnumbered prefix")
  await residues.last().focus()
  await expect(dialog.getByRole("status").filter({ hasText: "Input residue" })).toContainText("Unnumbered suffix")
  parentalNumberingFailed = true
  await dialog.getByLabel("Numbering scheme").selectOption("kabat")
  await expect(dialog.getByRole("status").filter({ hasText: "Parental germline" })).toContainText("The sequence comparison remains available")
  await expect(rows).toHaveCount(6)
  expect((await rows.nth(4).locator("td").allTextContents()).join("")).toBe(aligned.parental)
  await expect(rows.nth(5)).toContainText("Not available")
})

test("parent lookup is lazy, role-matched and reused across candidates of different parents", async ({ page }) => {
  const api = await mockApi(page)
  const rows = ["parent_a", "parent_b"].map((parent_id, index) => ({ parent_id, candidate_id: `candidate-${index}`, vh: "ACDE", vl: "ACDE" }))
  await page.route("**/selection?*", (route) => route.fulfill({ json: { columns, rows, total_rows: 2, offset: 0, limit: 50, parent_ids: ["parent_a", "parent_b"], default_hidden_columns: [], nativeness_ranges: {}, germlines: null, reference: null } }))
  let inputReads = 0
  let releaseInputs!: () => void
  const inputGate = new Promise<void>((resolve) => { releaseInputs = resolve })
  await page.route(`**/humanization/jobs/${job.job_id}/inputs`, async (route) => {
    inputReads++
    await inputGate
    return route.fulfill({ json: { display_name: job.display_name, settings: options.defaults, pairs: [{ id: "parent_b", vh: "GGG", vl: "TTT" }, { id: "parent_a", vh: "AAA", vl: "CCC" }] } })
  })
  const details: { sequence: string; parental_sequence?: string }[] = []
  await page.route("**/antibody-sequence-analysis/sequence", (route) => {
    const input = route.request().postDataJSON()
    details.push(input)
    return route.fulfill({ json: { ...input, cdr_definition: input.scheme, chain_type: null, domain_span: null, residues: [], germlines: [], parental_germlines: [], parental_germline_error: null, alignment: null, liabilities: [], diagnostics: [], error: null } })
  })
  await page.goto(`/tools/humanization/jobs/${job.job_id}`)
  await expect(page.getByRole("button", { name: /^Inspect VH from/ }).first()).toBeVisible()
  expect(inputReads).toBe(0)
  const dialog = page.getByRole("dialog")
  for (const [candidate, role, expected] of [[0, "VH", "AAA"], [0, "VL", "CCC"], [1, "VH", "GGG"], [1, "VL", "TTT"]] as const) {
    await page.getByRole("button", { name: new RegExp(`^Inspect ${role} from candidate-${candidate} `) }).click()
    if (!details.length) {
      await expect(dialog.getByRole("status")).toContainText("Loading the original parent sequence")
      expect(details).toHaveLength(0)
      releaseInputs()
    }
    await expect(dialog.getByRole("heading", { name: "Unnumbered input" })).toBeVisible()
    expect(details.at(-1)).toMatchObject({ sequence: "ACDE", parental_sequence: expected })
    await dialog.getByRole("button", { name: "Close sequence details" }).click()
  }
  expect(inputReads).toBe(1)
  expect(details).toHaveLength(4)
  expect(api.submissions).toHaveLength(0)
})

test("missing retained parent preserves ordinary inspection and full-sequence copy", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  const api = await mockApi(page)
  await page.route(`**/humanization/jobs/${job.job_id}/inputs`, (route) => route.fulfill({ status: 404, json: { code: "job_input_unavailable", detail: "Retained input unavailable" } }))
  const sequenceResponse = page.waitForResponse((response) => response.url().endsWith("/antibody-sequence-analysis/sequence"))
  await page.goto(`/tools/humanization/jobs/${job.job_id}`)
  await page.getByRole("button", { name: /^Inspect VH from/ }).first().click()
  const response = await sequenceResponse
  expect(response.request().postDataJSON()).toEqual({ sequence: "ACDEFGHIKLMNPQRSTVWY", scheme: "imgt" })
  const dialog = page.getByRole("dialog")
  await expect(dialog).toContainText("Parental comparison is unavailable")
  await expect(dialog.getByRole("heading", { name: "Unnumbered input" })).toBeVisible()
  await dialog.getByRole("button", { name: "Copy sequence", exact: true }).click()
  await expect(dialog.getByRole("button", { name: "Copied", exact: true })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("ACDEFGHIKLMNPQRSTVWY")
  expect(api.submissions).toHaveLength(0)
})

async function mockApi(page: Page, { lostResponse = false, expired = false, maxPairs = 100, selectionDelay = 0, legacyOptions = false } = {}) {
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
    if (url.pathname.endsWith("/antibody-sequence-analysis/options")) return respond(analysisOptions)
    if (url.pathname.endsWith("/antibody-sequence-analysis/sequence")) {
      const input = request.postDataJSON()
      return respond({ ...input, cdr_definition: input.scheme, chain_type: null, domain_span: null, residues: [], germlines: [], parental_germlines: [], parental_germline_error: null, alignment: null, liabilities: [], diagnostics: [], error: "No antibody domain in this short fixture sequence." })
    }
    if (url.pathname.endsWith(`/humanization/jobs/${job.job_id}/inputs`)) return respond({ display_name: job.display_name, pairs: [{ id: "ab_001", vh: "ACDEFGHIKLMNPQRSTVWY", vl: "EFG" }], settings: options.defaults })
    if (url.pathname.endsWith("/humanization/options")) return respond({ ...options, max_pairs: maxPairs, defaults: legacyOptions ? Object.fromEntries(Object.entries(options.defaults).filter(([name]) => name !== "pabnativ2_num_seeds")) : options.defaults })
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
      if (url.searchParams.has("sort_by") && selectionDelay) await new Promise((resolve) => setTimeout(resolve, selectionDelay))
      const offset = Number(url.searchParams.get("offset"))
      const limit = Number(url.searchParams.get("limit"))
      const total = url.searchParams.has("parent_id") ? 1 : 51
      const rows = Array.from({ length: Math.min(limit, Math.max(0, total - offset)) }, (_, i) => ({ parent_id: "ab_001", candidate_id: `candidate-${offset + i}`, quality_tier: null, panel_order: null, vh: "ACDEFGHIKLMNPQRSTVWY", vl: "EFG", sapiens_vh_mean_probability: i ? 0.8 : null }))
      return respond({ columns, rows, default_hidden_columns: [], nativeness_ranges: {}, total_rows: total, offset, limit, parent_ids: ["ab_001", "ab_002"] })
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
  await expect(page.getByText("Current batch · 2 pairs")).toBeVisible()
  await expect(page.getByRole("button", { name: "Submit humanization" })).toBeDisabled()
  const second = page.getByRole("group", { name: "Pair 2", exact: true })
  await second.getByLabel("ID", { exact: true }).fill("ab_002")
  await second.getByLabel("VH · normalized", { exact: true }).fill(" acd ")
  await expect(second.getByLabel("VH · normalized", { exact: true })).toHaveValue("ACD")
  await expect(page.getByRole("button", { name: "Submit humanization" })).toBeEnabled()
  await page.screenshot({ path: test.info().outputPath("humanization-editor.png"), fullPage: true })
  await page.locator("#humanization-csv").setInputFiles({ name: "broken.csv", mimeType: "text/csv", buffer: Buffer.from('id,vh,vl\na,"unterminated,EFG') })
  await expect(page.getByText("Unclosed CSV quotation.", { exact: false })).toBeVisible()
  await expect(page.getByText("Current batch · 2 pairs")).toBeVisible()
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
  expect(api.submissions[0].body).toMatchObject({ pairs: [{ id: "ab_001", vh: "ACD", vl: "EFG" }], display_name: "Antibody humanization", settings: { ...options.defaults, hudiff_ab_seed: options.defaults.pabnativ2_seed } })
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

test("default-size batch remains editable and General controls fan out to supported models", async ({ page }) => {
  const api = await mockApi(page)
  await page.goto("/tools/humanization/new")
  const csv = "id,vh,vl\n" + Array.from({ length: 100 }, (_, index) => `ab_${index},${"A".repeat(120)},${"G".repeat(110)}`).join("\n")
  const start = performance.now()
  await page.locator("#humanization-csv").setInputFiles({ name: "batch.csv", mimeType: "text/csv", buffer: Buffer.from(csv) })
  await expect(page.getByText("Current batch · 100 pairs")).toBeVisible()
  console.log(`100-pair import and render: ${Math.round(performance.now() - start)} ms`)
  await page.getByText("Advanced settings", { exact: true }).click()
  const general = page.getByRole("group", { name: "General", exact: true })
  await expect(page.getByLabel("Root seed", { exact: true })).toHaveCount(1)
  await expect(page.getByLabel("Allow CDR mutations", { exact: true })).toHaveCount(1)
  await general.getByLabel("Root seed", { exact: true }).fill("123")
  await general.getByLabel("Allow CDR mutations", { exact: true }).check()
  await page.getByRole("group", { name: "HuDiff", exact: true }).getByLabel("Sampling attempts per parent", { exact: true }).fill("3")
  const pabAttempts = page.getByRole("group", { name: "p-AbNatiV2", exact: true }).getByLabel("Sampling attempts per parent", { exact: true })
  await pabAttempts.fill("0")
  await expect(page.getByRole("button", { name: "Submit humanization" })).toBeDisabled()
  await pabAttempts.fill("2")
  await page.getByRole("group", { name: "Sapiens", exact: true }).getByLabel("Iterations", { exact: true }).fill("3")
  await expect(page.getByText("The paired sequences after every iteration are included as candidates", { exact: false })).toBeVisible()
  await page.getByLabel("Job name", { exact: true }).fill("  Batch   experiment  ")
  await page.getByRole("button", { name: "Submit humanization" }).click()
  await expect.poll(() => api.submissions.length).toBe(1)
  expect(api.submissions[0].body).toMatchObject({ display_name: "Batch experiment", settings: { ...options.defaults, hudiff_ab_candidate_count: 3, pabnativ2_num_seeds: 2, sapiens_iterations: 3, pabnativ2_seed: 123, hudiff_ab_seed: 123, sapiens_mutate_cdrs: true, humatch_mutate_cdrs: true, pabnativ2_mutate_cdrs: true } })
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
  await expect(page.getByText("Current batch · 1 pair")).toBeVisible()
  expect(api.submissions).toHaveLength(1)
  await page.getByRole("button", { name: "Check submission" }).click()
  await expect.poll(() => api.submissions.length).toBe(2)
  expect(api.submissions[1]).toEqual(api.submissions[0])
})

test("Result table delegates paging and sorting and lets readers choose columns", async ({ page }) => {
  const api = await mockApi(page)
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto(`/tools/humanization/jobs/${job.job_id}`)
  await expect(page).toHaveTitle("Job details · Antibody humanization | BioModals")
  const stages = page.getByRole("table", { name: "Execution stages", exact: true })
  await expect(page.getByText("Humanization candidates", { exact: true })).toBeVisible()
  const candidatesTop = await page.getByText("Humanization candidates", { exact: true }).evaluate((element) => element.getBoundingClientRect().top)
  expect(candidatesTop).toBeLessThan(await stages.evaluate((element) => element.getBoundingClientRect().top))
  await expect(stages.locator("tbody tr")).toHaveCount(6)
  for (const model of ["Sapiens", "Humatch", "p-AbNatiV2", "HuDiff"]) {
    await expect(stages.getByRole("row").filter({ hasText: model })).toContainText("Completed")
  }
  await expect(page.getByText("1–50 of 51 rows")).toBeVisible()
  expect(api.selections).toHaveLength(1)
  expect(api.selections[0].search).toBe("?offset=0&limit=50")
  await page.getByRole("button", { name: "Next page", exact: true }).click()
  await expect(page.getByText("51–51 of 51 rows")).toBeVisible()
  await page.getByRole("button", { name: "sapiens_vh_mean_probability", exact: true }).click()
  await expect.poll(() => api.selections.at(-1)?.searchParams.get("sort_by")).toBe("sapiens_vh_mean_probability")
  expect(api.selections.at(-1)?.searchParams.get("offset")).toBe("0")
  await page.getByRole("button", { name: "sapiens_vh_mean_probability", exact: true }).click()
  await expect.poll(() => api.selections.at(-1)?.searchParams.get("descending")).toBe("true")
  await page.getByRole("button", { name: /^Filter by parent/ }).click()
  await page.getByLabel("Parent", { exact: true }).selectOption("ab_001")
  await expect(page.getByText("1–1 of 1 rows")).toBeVisible()
  await page.getByRole("button", { name: "Restore default order" }).click()
  await expect.poll(() => api.selections.at(-1)?.searchParams.has("sort_by")).toBe(false)
  await expect(page.getByRole("button", { name: "Download selection.csv" })).toHaveCount(0)
  expect(api.prepared()).toBe(0)
  const table = page.getByRole("table", { name: "Humanization selection.csv, page 1" })
  await expect(table.getByRole("columnheader")).toHaveCount(columns.length)
  const queryCount = api.selections.length
  await page.getByRole("button", { name: "Columns", exact: true }).click()
  await page.getByRole("menuitemcheckbox", { name: "vh", exact: true }).click()
  await page.getByRole("menuitemcheckbox", { name: "vl", exact: true }).click()
  await expect(page.getByRole("menuitemcheckbox", { name: "vh", exact: true })).not.toBeChecked()
  await page.keyboard.press("Escape")
  await expect(table.getByRole("columnheader")).toHaveCount(columns.length - 2)
  expect(api.selections).toHaveLength(queryCount)
  await page.getByRole("button", { name: "Columns", exact: true }).click()
  await page.getByRole("menuitem", { name: "Show all columns" }).click()
  await page.keyboard.press("Escape")
  await expect(table.getByRole("columnheader")).toHaveCount(columns.length)
  await page.getByRole("button", { name: /^Filter by parent/ }).click()
  await page.getByLabel("Parent", { exact: true }).selectOption("")
  await expect(page.getByText("1–50 of 51 rows")).toBeVisible()
  await page.getByLabel("Rows per page", { exact: true }).selectOption("25")
  await expect(page.getByText("1–25 of 51 rows")).toBeVisible()
  await page.getByLabel("Page", { exact: true }).selectOption("3")
  await expect(page.getByText("51–51 of 51 rows")).toBeVisible()
  expect(api.selections.at(-1)?.searchParams.get("offset")).toBe("50")
  expect(api.selections.at(-1)?.searchParams.get("limit")).toBe("25")
  await expect(page.getByRole("button", { name: "Next page" })).toBeDisabled()
  expect(api.requests.some((request) => request.startsWith("POST") && request.includes("/selection"))).toBe(false)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: test.info().outputPath("humanization-results-mobile.png"), fullPage: true })
})


test("humanization overview explains inputs and results with route-specific tab titles", async ({ page }) => {
  await mockApi(page)
  await page.goto("/")
  await expect(page).toHaveTitle("Tools | BioModals")
  const card = page.locator('[data-slot="card"]').filter({ has: page.getByRole("link", { name: "Antibody humanization", exact: true }) })
  for (const tag of ["Antibody", "Humanization", "Sequence"]) await expect(card.getByText(tag, { exact: true })).toBeVisible()
  expect(await page.locator("main p").evaluateAll((nodes) => nodes.every((node) => parseFloat(getComputedStyle(node).fontSize) >= 16))).toBe(true)
  const tagStyle = await card.getByText("Antibody", { exact: true }).evaluate((node) => ({ padding: parseFloat(getComputedStyle(node).paddingTop), background: getComputedStyle(node).backgroundColor }))
  expect(tagStyle.padding).toBeGreaterThanOrEqual(4)
  expect(tagStyle.background).not.toBe("rgba(0, 0, 0, 0)")
  await card.getByRole("link", { name: "Antibody humanization", exact: true }).click()
  await expect(page).toHaveTitle("Antibody humanization | BioModals")
  await expect(page.getByRole("link", { name: "Submit a job", exact: true })).toBeVisible()
  await expect(page.getByRole("link", { name: "View My Jobs", exact: true })).toHaveAttribute("href", "/jobs?tool=humanization")
  await expect(page.getByRole("heading", { name: "Input: paired VH and VL sequences" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Results: start with selection.csv" })).toBeVisible()
  await page.screenshot({ path: test.info().outputPath("humanization-overview.png"), fullPage: true })
  await page.setViewportSize({ width: 360, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: test.info().outputPath("humanization-overview-mobile.png"), fullPage: true })
  await page.getByRole("link", { name: "Submit a job", exact: true }).click()
  await expect(page).toHaveTitle("New job · Antibody humanization | BioModals")
  await page.getByRole("link", { name: "Humanization overview", exact: true }).click()
  await expect(page).toHaveTitle("Antibody humanization | BioModals")
  await page.goBack()
  await expect(page).toHaveTitle("New job · Antibody humanization | BioModals")
  for (const [url, title] of [["/tools/alphafold3", "AlphaFold3 structure prediction"], ["/tools/gromacs", "GROMACS MD simulation"], ["/jobs", "My Jobs"], ["/missing-page", "Page not found"]]) {
    await page.goto(url)
    await expect(page).toHaveTitle(`${title} | BioModals`)
    await expect(page.locator("head title")).toHaveCount(1)
  }
})

test("manual pair and CSV entry share a responsive layout and accept up to 10 MiB", async ({ page }) => {
  await mockApi(page)
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.goto("/tools/humanization/new")
  await expect(page.getByLabel("Job name", { exact: true })).toBeVisible()
  const name = await page.getByLabel("Job name", { exact: true }).boundingBox()
  const id = await page.getByLabel("ID", { exact: true }).boundingBox()
  const vh = await page.getByLabel("VH sequence", { exact: true }).boundingBox()
  const vl = await page.getByLabel("VL sequence", { exact: true }).boundingBox()
  const csv = await page.getByText("Import CSV with columns", { exact: false }).boundingBox()
  expect(name!.y).toBeLessThan(id!.y)
  expect(id!.x).toBe(vh!.x)
  expect(vh!.x).toBe(vl!.x)
  expect(vl!.y).toBeGreaterThan(vh!.y + vh!.height)
  expect(csv!.x).toBeGreaterThan(vh!.x + vh!.width)
  await page.screenshot({ path: test.info().outputPath("humanization-entry-desktop.png"), fullPage: true })
  const prefix = "id,vh,vl\nab_large,"
  const suffix = "ACD,EFG\n"
  const content = prefix + " ".repeat(10 * 1024 * 1024 - prefix.length - suffix.length) + suffix
  await page.locator("#humanization-csv").setInputFiles({ name: "large.csv", mimeType: "text/csv", buffer: Buffer.from(content) })
  await expect(page.getByText("Current batch · 1 pair", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Submit humanization" })).toBeEnabled()
  await page.locator("#humanization-csv").setInputFiles({ name: "too-large.csv", mimeType: "text/csv", buffer: Buffer.from(content + " ") })
  await expect(page.getByRole("alert")).toContainText("CSV must be at most 10 MiB. The batch was not changed.")
  await expect(page.getByText("Current batch · 1 pair", { exact: true })).toBeVisible()
  await page.setViewportSize({ width: 360, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: test.info().outputPath("humanization-entry-mobile.png"), fullPage: true })
})


for (const width of [360, 1280]) test(`sorting preserves the table and scroll position at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 800 })
  await mockApi(page, { selectionDelay: 800 })
  await page.goto(`/tools/humanization/jobs/${job.job_id}`)
  await expect(page.getByText("1–50 of 51 rows")).toBeVisible()
  const header = page.getByRole("button", { name: "sapiens_vh_mean_probability", exact: true })
  await header.scrollIntoViewIfNeeded()
  const scroller = page.getByLabel("Candidate table; scroll horizontally for all columns", { exact: true })
  const beforeX = await scroller.evaluate((node) => node.scrollLeft)
  const before = await page.evaluate(() => window.scrollY)
  expect(before).toBeGreaterThan(100)
  await header.click()
  await expect(page.getByText("Loading candidate page…", { exact: true })).toBeVisible()
  expect(Math.abs(await page.evaluate(() => window.scrollY) - before)).toBeLessThan(2)
  await expect(header).toBeVisible()
  expect(Math.abs(await scroller.evaluate((node) => node.scrollLeft) - beforeX)).toBeLessThan(2)
  await expect(page.getByText("Loading candidate page…", { exact: true })).not.toBeVisible()
  expect(Math.abs(await page.evaluate(() => window.scrollY) - before)).toBeLessThan(2)
})

test("job rows omit the ID and copy button", async ({ page }) => {
  await mockApi(page)
  await page.route("**/api/v1/jobs?*", (route) => route.fulfill({ json: { jobs: [job], next_cursor: null } }))
  await page.goto("/jobs")
  await expect(page.getByText(job.job_id, { exact: true })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Copy job ID", exact: true })).toHaveCount(0)
})

test("chain selections survive pages and filters and transfer only within-parent FASTA", async ({ page }) => {
  const api = await mockApi(page)
  const rows = [
    { parent_id: "parent_a", candidate_id: "first", vh: "AAA", vl: "CCC" },
    { parent_id: "parent_a", candidate_id: "second", vh: "GGG", vl: "CCC" },
    { parent_id: "parent_a", candidate_id: "third", vh: "GGG", vl: "DDD" },
    { parent_id: "parent_b", candidate_id: "fourth", vh: "AAA", vl: "EEE" },
  ]
  await page.route("**/selection?*", (route) => {
    const url = new URL(route.request().url())
    const offset = Number(url.searchParams.get("offset"))
    const filtered = url.searchParams.get("parent_id") === "parent_b"
    return route.fulfill({ json: { columns, rows: filtered ? [rows[3]] : offset ? rows.slice(2) : rows.slice(0, 2), total_rows: filtered ? 1 : 52, offset, limit: 50, parent_ids: ["parent_a", "parent_b"], default_hidden_columns: [], nativeness_ranges: {}, germlines: null, reference: null } })
  })
  const analyzed: { groups: { id: string; fasta: string }[] }[] = []
  await page.route("**/antibody-sequence-analysis/analyze", (route) => { analyzed.push(route.request().postDataJSON()); return route.fulfill({ json: emptyAnalysis }) })
  await page.goto(`/tools/humanization/jobs/${job.job_id}`)
  await page.getByRole("checkbox", { name: "Select VH from first (parent parent_a)", exact: true }).check()
  await page.getByRole("checkbox", { name: "Select VL from first (parent parent_a)", exact: true }).check()
  await expect(page.getByRole("checkbox", { name: "Select VL from second (parent parent_a)", exact: true })).toBeChecked()
  await page.getByRole("checkbox", { name: "Select VH from second (parent parent_a)", exact: true }).check()
  await page.getByRole("button", { name: "Next page", exact: true }).click()
  await expect(page.getByRole("checkbox", { name: "Select VH from third (parent parent_a)", exact: true })).toBeChecked()
  await page.getByRole("checkbox", { name: "Select VL from third (parent parent_a)", exact: true }).check()
  await page.getByRole("checkbox", { name: "Select VH from fourth (parent parent_b)", exact: true }).check()
  await page.getByRole("button", { name: /^Filter by parent/ }).click()
  await page.getByLabel("Parent", { exact: true }).selectOption("parent_b")
  await expect(page.getByRole("region", { name: "Selected antibody chains" })).toContainText("4 pairs and 1 single chains")
  await expect(page.getByRole("button", { name: "vh_v_gene", exact: true })).toHaveCount(0)
  expect(api.requests.some((request) => request.includes("/sequence"))).toBe(false)
  await page.getByRole("button", { name: "Analyze selected sequences", exact: true }).click()
  await expect(page).toHaveURL(/\/tools\/antibody-sequence-analysis$/)
  await expect(page.getByRole("heading", { name: "Sequence properties and germline matches" })).toBeVisible()
  expect(analyzed).toEqual([{ groups: [{ id: "Group 1", fasta: ">selected_0001\nAAA:CCC\n>selected_0002\nAAA:DDD\n>selected_0003\nGGG:CCC\n>selected_0004\nGGG:DDD\n>selected_0005\nAAA" }] }])
  expect(api.submissions).toHaveLength(0)
  expect(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, history: history.state }))).not.toContain("AAA")
  await page.reload()
  await expect(page.getByLabel("Group 1 FASTA", { exact: true })).toHaveValue("")
  expect(analyzed).toHaveLength(1)
})

for (const tool of ["humanization", "nanobody_humanization"] as const) test(`${tool} transfer reveals results once and leaves table interactions in place`, async ({ page }) => {
  const api = await mockApi(page)
  const reduced = tool === "humanization"
  await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" })
  await page.addInitScript(() => {
    const scroll = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function (options) {
      if (this.textContent === "Sequence properties and germline matches") {
        const previous = JSON.parse(document.body.dataset.resultScrolls ?? "[]")
        document.body.dataset.resultScrolls = JSON.stringify([...previous, options])
      }
      scroll.call(this, options)
    }
  })
  await page.route(`**/api/v1/jobs/${job.job_id}`, (route) => route.fulfill({ json: { ...job, tool } }))
  const rows = Array.from({ length: 51 }, (_, i) => ({ parent_id: "parent", candidate_id: `candidate-${i}`, vh: `ACDE${"G".repeat(i)}`, vl: "EFGH" }))
  await page.route("**/selection?*", (route) => {
    const offset = Number(new URL(route.request().url()).searchParams.get("offset"))
    return route.fulfill({ json: { columns: tool === "humanization" ? columns : columns.filter((column) => column.name !== "vl"), rows: rows.slice(offset, offset + 50), total_rows: rows.length, offset, limit: 50, parent_ids: ["parent"], default_hidden_columns: [], nativeness_ranges: {}, nonparent_count: 51, germlines: null, reference: null } })
  })
  let fail = false
  const analyzed: { groups: { id: string; fasta: string }[] }[] = []
  await page.route("**/antibody-sequence-analysis/analyze", (route) => {
    const input = route.request().postDataJSON()
    analyzed.push(input)
    if (fail) return route.fulfill({ status: 503, json: { code: "local_analysis_busy", detail: "Local analysis is busy" } })
    return route.fulfill({ json: { ...emptyAnalysis, groups: input.groups.map((group: { id: string; fasta: string }) => ({ id: group.id, issues: [], entries: group.fasta.split(">").filter(Boolean).map((record) => ({ id: record.split("\n")[0], vh: null, vl: null, unassigned: null, vh_vl_pi: null, issues: [] })) })) } })
  })
  await page.goto(`/tools/${tool.replaceAll("_", "-")}/jobs/${job.job_id}`)
  for (let i = 0; i < 50; i++) await page.getByRole("checkbox", { name: `Select VH from candidate-${i} (parent parent)`, exact: true }).check()
  if (tool === "humanization") await page.getByRole("checkbox", { name: "Select VL from candidate-0 (parent parent)", exact: true }).check()
  await page.getByRole("button", { name: "Next page", exact: true }).click()
  await page.getByRole("checkbox", { name: "Select VH from candidate-50 (parent parent)", exact: true }).check()
  await page.getByRole("button", { name: "Analyze selected sequences", exact: true }).click()
  const heading = page.getByRole("heading", { name: "Sequence properties and germline matches", exact: true })
  await expect(heading).toBeFocused()
  await expect(heading).toBeInViewport()
  const scrolls = () => page.evaluate(() => JSON.parse(document.body.dataset.resultScrolls ?? "[]"))
  expect(await scrolls()).toEqual([{ behavior: reduced ? "instant" : "smooth", block: "start" }])
  expect(analyzed).toHaveLength(1)
  expect(analyzed[0].groups[0].fasta.includes(":")).toBe(tool === "humanization")
  const group = page.getByRole("region", { name: "Analysis results: Group 1", exact: true })
  await group.getByRole("button", { name: "Next Group 1 page", exact: true }).click()
  await expect(group.getByRole("table")).toHaveAccessibleName("Group 1 antibody analysis, page 2")
  await group.getByRole("button", { name: "ID", exact: true }).click()
  await expect(group.getByRole("table")).toHaveAccessibleName("Group 1 antibody analysis, page 1")
  expect(await scrolls()).toHaveLength(1)
  fail = true
  await page.getByRole("button", { name: "Analyze sequences", exact: true }).click()
  await expect(page.getByRole("alert")).toContainText("Your inputs are unchanged")
  expect(await scrolls()).toHaveLength(1)
  expect(analyzed).toHaveLength(2)
  expect(api.submissions).toHaveLength(0)
})

test("editing a pending handoff suppresses automatic analysis", async ({ page }) => {
  await mockApi(page)
  const analyzed: { groups: { id: string; fasta: string }[] }[] = []
  await page.route("**/antibody-sequence-analysis/analyze", (route) => { analyzed.push(route.request().postDataJSON()); return route.fulfill({ json: emptyAnalysis }) })
  await page.goto(`/tools/humanization/jobs/${job.job_id}`)
  await page.getByRole("checkbox", { name: "Select VH from candidate-0 (parent ab_001)", exact: true }).check()
  // Edit as soon as the transferred form mounts, before its deferred analysis.
  await page.evaluate(() => {
    const observer = new MutationObserver(() => {
      const examples = Array.from(document.querySelectorAll("button")).find((button) => button.textContent === "Load example sequences")
      if (!examples) return
      observer.disconnect()
      examples.click()
    })
    observer.observe(document.body, { childList: true, subtree: true })
  })
  await page.getByRole("button", { name: "Analyze selected sequences", exact: true }).click()
  const input = page.getByLabel("Group 1 FASTA", { exact: true })
  await expect(input).toHaveValue(/^>pembrolizumab\n/)
  await page.evaluate(() => new Promise((resolve) => window.setTimeout(resolve, 0)))
  expect(analyzed).toHaveLength(0)
  await expect(page.getByRole("heading", { name: "Sequence properties and germline matches" })).toHaveCount(0)
  await page.getByRole("button", { name: "Analyze sequences", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Sequence properties and germline matches" })).toBeFocused()
  expect(analyzed).toEqual([{ groups: [{ id: "Group 1", fasta: await input.inputValue() }] }])
})

test("busy analysis preserves inputs for an explicit retry without revealing missing results", async ({ page }) => {
  await mockApi(page)
  await page.addInitScript(() => {
    const scroll = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function (options) {
      if (this.textContent === "Sequence properties and germline matches") document.body.dataset.resultsScrolled = "true"
      scroll.call(this, options)
    }
  })
  await page.route("**/antibody-sequence-analysis/options", (route) => route.fulfill({ json: { ...analysisOptions, max_request_bytes: 100 } }))
  let analyses = 0
  await page.route("**/antibody-sequence-analysis/analyze", (route) => { analyses++; return analyses === 1 ? route.fulfill({ status: 503, json: { code: "local_analysis_busy", detail: "Local sequence analysis is busy" } }) : route.fulfill({ json: emptyAnalysis }) })
  await page.goto("/tools/antibody-sequence-analysis")
  await page.getByRole("button", { name: "Load example sequences", exact: true }).click()
  const analyze = page.getByRole("button", { name: "Analyze sequences", exact: true })
  await analyze.click()
  await expect(page.getByRole("alert")).toContainText("Reduce the FASTA input")
  expect(analyses).toBe(0)
  await expect(analyze).toBeFocused()
  await page.getByLabel("Group 1 FASTA", { exact: true }).fill(">short\nACDE")
  await expect(page.getByRole("alert")).toHaveCount(0)
  await analyze.click()
  await expect(page.getByRole("alert")).toContainText("Your inputs are unchanged")
  await expect(page.getByRole("alert")).toBeVisible()
  await expect(page.getByRole("heading", { name: "Sequence properties and germline matches" })).toHaveCount(0)
  expect(await page.evaluate(() => document.body.dataset.resultsScrolled)).toBeUndefined()
  await expect(page.getByLabel("Group 1 FASTA", { exact: true })).toHaveValue(">short\nACDE")
  await page.evaluate(() => { window.dispatchEvent(new Event("online")); document.dispatchEvent(new Event("visibilitychange")) })
  await page.waitForTimeout(1250) // A busy response must not use the shared automatic retry.
  expect(analyses).toBe(1)
  await analyze.click()
  await expect(page.getByRole("heading", { name: "Sequence properties and germline matches" })).toBeVisible()
  expect(analyses).toBe(2)
})

test("busy sequence inspection preserves copy and retries only explicitly", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  const api = await mockApi(page)
  let calls = 0
  await page.route("**/antibody-sequence-analysis/sequence", (route) => {
    calls++
    if (calls === 1) return route.fulfill({ status: 503, json: { code: "local_analysis_busy", detail: "Local sequence analysis is busy. Please try again." } })
    return route.fallback()
  })
  await page.goto(`/tools/humanization/jobs/${job.job_id}`)
  await page.getByRole("button", { name: /^Inspect VH from/ }).first().click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByRole("alert")).toContainText("Local sequence analysis is busy")
  await dialog.getByRole("button", { name: "Copy sequence", exact: true }).click()
  await expect(dialog.getByRole("button", { name: "Copied", exact: true })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("ACDEFGHIKLMNPQRSTVWY")
  await page.evaluate(() => { window.dispatchEvent(new Event("online")); document.dispatchEvent(new Event("visibilitychange")) })
  await page.waitForTimeout(1250)
  expect(calls).toBe(1)
  await dialog.getByRole("button", { name: "Try again", exact: true }).click()
  await expect(dialog.getByRole("heading", { name: "Unnumbered input", exact: true })).toBeVisible()
  expect(calls).toBe(2)
  expect(api.submissions).toHaveLength(0)
})

for (const differentUser of [false, true]) test(`analysis draft ${differentUser ? "clears for another user" : "survives same-user reauthentication"}`, async ({ page }) => {
  await mockApi(page)
  let attempts = 0
  await page.route("**/antibody-sequence-analysis/analyze", (route) => { attempts++; return route.fulfill({ status: attempts === 1 ? 401 : 200, json: attempts === 1 ? { detail: "Authentication required" } : emptyAnalysis }) })
  if (differentUser) await page.route("**/auth/login", (route) => route.fulfill({ json: { ...principal, user_id: "user-two" } }))
  await page.goto("/tools/antibody-sequence-analysis")
  await page.getByLabel("Group 1 FASTA", { exact: true }).fill(">private_domain\nACDE")
  await page.getByRole("button", { name: "Analyze sequences", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Sign in again" })
  await dialog.getByLabel("Email", { exact: true }).fill("researcher@example.test")
  await dialog.getByLabel("Password", { exact: true }).fill("correct horse battery staple")
  await dialog.getByRole("button", { name: "Sign in and return" }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByLabel("Group 1 FASTA", { exact: true })).toHaveValue(differentUser ? "" : ">private_domain\nACDE")
  expect(attempts).toBe(1)
  if (!differentUser) {
    await page.getByRole("button", { name: "Analyze sequences", exact: true }).click()
    await expect(page.getByRole("heading", { name: "Sequence properties and germline matches" })).toBeVisible()
    expect(attempts).toBe(2)
  }
})

test("candidate presentation preserves values and respects whole-result visibility defaults", async ({ page, context }) => {
  await mockApi(page)
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  const candidateId = "a".repeat(64)
  const row = { parent_id: "ab_001", candidate_id: candidateId, vh: "ACDEFGHIKLMNPQRSTVWY", vl: "EFG", is_parent: true, cdr_preservation: "preserved", cdr_mutations: 2, humatch_vh_target_family: "IGHV1", sapiens_error: null, humatch_error: null, evaluation_complete: true, humatch_pairing_score: 0.87654321, humatch_pairing_score_delta: -0.123456, sapiens_vh_mean_probability_delta: 0.23456, pabnativ2_pair_nativeness: -0.25, pabnativ2_pair_nativeness_delta: 1.23456, pabnativ2_vh_nativeness: 0.2, pabnativ2_vh_nativeness_delta: 0 }
  await page.route("**/selection?*", (route) => route.fulfill({ json: {
    columns: Object.entries(row).map(([name, value]) => ({ name, type: typeof value === "number" ? "number" : typeof value === "boolean" ? "boolean" : "string" })),
    rows: [row], total_rows: 51, offset: 0, limit: 50, parent_ids: ["ab_001"],
    // An error and incomplete evaluation elsewhere in the result must remain
    // visible even though this bounded page contains neither.
    default_hidden_columns: ["sapiens_error"], nativeness_ranges: { pabnativ2_pair_nativeness: { min: -2, max: 0 }, pabnativ2_vh_nativeness: { min: 0.2, max: 0.2 } },
  } }))
  await page.goto(`/tools/humanization/jobs/${job.job_id}`)
  const guidance = page.getByRole("region", { name: "Understand the ranking and scores", exact: true })
  await expect(guidance.locator("details").first().locator("summary")).toHaveText("Understand the ranking")
  await expect(guidance.locator("details[open]")).toHaveCount(0)
  await expect(page.getByText("Ranking versions", { exact: true })).toHaveCount(0)
  await guidance.locator("details").first().locator("summary").click()
  await expect(guidance.getByText("quality_tier · lower is better", { exact: true })).toBeVisible()
  await expect(guidance).toContainText("Missing values do not mean zero or the worst tier.")
  const table = page.getByRole("table", { name: "Humanization selection.csv, page 1" })
  for (const name of ["is_parent", "cdr_preservation", "humatch_vh_target_family", "sapiens_error", "humatch_pairing_score_delta", "pabnativ2_pair_nativeness_delta"]) await expect(table.getByRole("button", { name, exact: true })).toHaveCount(0)
  for (const name of ["humatch_error", "evaluation_complete"]) await expect(table.getByRole("button", { name, exact: true })).toBeVisible()
  const parent = table.locator("tbody tr").first()
  expect(await parent.evaluate((node) => getComputedStyle(node).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)")
  const summary = parent.locator("summary").filter({ hasText: candidateId })
  expect(await summary.evaluate((node) => node.scrollWidth > node.clientWidth && getComputedStyle(node).textOverflow === "ellipsis")).toBe(true)
  await expect(parent.getByText(/residues/).filter({ visible: true })).toHaveCount(0)
  await summary.click()
  await parent.getByRole("button", { name: "Copy ID", exact: true }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(candidateId)
  await expect(parent.getByRole("button", { name: "Copied", exact: true })).toBeVisible()
  for (const role of ["vh", "vl"] as const) {
    await parent.getByRole("button", { name: new RegExp(`^Inspect ${role.toUpperCase()} from`) }).click()
    const dialog = page.getByRole("dialog", { name: new RegExp(`^${role.toUpperCase()} from`) })
    await expect(dialog.getByText(`${row[role].length} residues · Full input retained`, { exact: true })).toBeVisible()
    await dialog.getByRole("button", { name: "Close sequence details" }).click()
  }
  await expect(parent.getByRole("button", { name: "Copied", exact: true })).toHaveCount(0, { timeout: 4000 })
  await expect(parent.getByRole("button", { name: "Copy ID", exact: true })).toBeVisible()
  await expect(parent.getByRole("button", { name: "Copy sequence", exact: true })).toHaveCount(0)
  await expect(parent.getByRole("checkbox", { name: /^Select (VH|VL) from/ })).toHaveCount(2)
  await expect(parent.getByText("-0.250", { exact: true })).toBeVisible()
  await expect(parent.locator('[title="-0.25"] .bg-neutral-200\\/70')).toHaveAttribute("style", "left: 0%; width: 87.5%;")
  await expect(parent.getByText("0.877", { exact: true })).toBeVisible()
  await expect(parent.locator('[title="0.87654321"] > span').first()).toHaveCSS("text-align", "center")
  await expect(parent.locator('[title="0.2"] .bg-neutral-200\\/70')).toHaveAttribute("style", "left: 0%; width: 50%;")
  expect(await parent.locator('[aria-label="Change from parent: 1.23456"] .bg-emerald-200\\/60').evaluate((node) => parseFloat((node as HTMLElement).style.width))).toBeCloseTo(30.864)
  await expect(parent.getByText("-0.123", { exact: true })).toHaveCount(0)
  await expect(parent.locator('[title="0.87654321"] .bg-neutral-200\\/70')).toHaveCount(1)
  await expect(parent.locator('[aria-label="Change from parent: -0.123456"] .bg-red-200')).toHaveCount(1)
  await expect(parent.locator('[aria-label="Change from parent: 1.23456"] .bg-emerald-200\\/60')).toHaveCount(1)
  await expect(parent.getByText("2", { exact: true })).toHaveClass(/text-red-800/)
  await page.getByRole("button", { name: "Columns", exact: true }).click()
  await page.getByRole("menuitemcheckbox", { name: "is_parent", exact: true }).click()
  await page.keyboard.press("Escape")
  await expect(table.getByRole("button", { name: "is_parent", exact: true })).toBeVisible()
  await parent.locator('[title="0.87654321"]').scrollIntoViewIfNeeded()
  await page.screenshot({ path: test.info().outputPath("humanization-score-bars.png") })
})


test("old service metadata blocks unsupported humanization submissions", async ({ page }) => {
  const api = await mockApi(page, { legacyOptions: true })
  await page.goto("/tools/humanization/new")
  await addPair(page)
  await expect(page.getByRole("alert")).toContainText("awaiting a service update")
  await expect(page.getByRole("button", { name: "Submit humanization" })).toBeDisabled()
  expect(api.submissions).toHaveLength(0)
})

test("rerun loads an editable historical batch without submitting or overwriting model settings", async ({ page }) => {
  const api = await mockApi(page)
  const settings = { ...options.defaults, sapiens_iterations: 5, pabnativ2_num_seeds: 10, pabnativ2_seed: 7, hudiff_ab_seed: 9, humatch_mutate_cdrs: true }
  let reads = 0
  await page.route("**/humanization/jobs/*/inputs", (route) => {
    reads++
    return route.fulfill({ json: { display_name: "Original experiment", pairs: [{ id: "OKT3", vh: "A".repeat(192), vl: "G".repeat(106) }], settings } })
  })
  await page.goto(`/tools/humanization/jobs/${job.job_id}`)
  await page.getByRole("link", { name: "Rerun with same inputs" }).click()
  const row = page.getByRole("group", { name: "Pair 1", exact: true })
  await expect(row.getByLabel("VH · normalized", { exact: true })).toHaveValue("A".repeat(192))
  await expect(page.getByText("VH has 192 residues; the limit is 142.", { exact: false })).toBeVisible()
  await expect(page.getByRole("button", { name: "Submit humanization" })).toBeDisabled()
  expect(api.submissions).toHaveLength(0)
  await expect(page.getByLabel("Job name", { exact: true })).toHaveValue("Original experiment")
  await page.getByText("Advanced settings", { exact: true }).click()
  await expect(page.getByLabel("Root seed", { exact: true })).toHaveAttribute("placeholder", "Mixed values")
  await expect(page.getByLabel("Allow CDR mutations", { exact: true })).toHaveJSProperty("indeterminate", true)
  await row.getByLabel("VH · normalized", { exact: true }).fill("A".repeat(142))
  await page.evaluate(() => window.dispatchEvent(new Event("focus")))
  await expect(row.getByLabel("VH · normalized", { exact: true })).toHaveValue("A".repeat(142))
  expect(reads).toBe(1)
  expect(api.submissions).toHaveLength(0)
  await page.getByRole("button", { name: "Submit humanization" }).click()
  await expect.poll(() => api.submissions.length).toBe(1)
  expect(api.submissions[0].body).toEqual({ display_name: "Original experiment", pairs: [{ id: "OKT3", vh: "A".repeat(142), vl: "G".repeat(106) }], settings })
  expect(api.submissions[0].key).toMatch(/^[0-9a-f-]{36}$/)
  expect(api.submissions[0].key).not.toBe(job.job_id)
})

test("missing retained inputs cannot submit a blank rerun", async ({ page }) => {
  const api = await mockApi(page)
  await page.route("**/humanization/jobs/*/inputs", (route) => route.fulfill({ status: 404, json: { code: "job_input_unavailable" } }))
  await page.goto(`/tools/humanization/new?source_job=${job.job_id}`)
  await expect(page.getByText("The original inputs are unavailable or you do not have access to this job.")).toBeVisible()
  await expect(page.getByRole("button", { name: "Submit humanization" })).toBeDisabled()
  expect(api.submissions).toHaveLength(0)
})

test("oversized CSV sequences remain editable and block submission", async ({ page }) => {
  const api = await mockApi(page)
  await page.goto("/tools/humanization/new")
  await page.locator("#humanization-csv").setInputFiles({ name: "long.csv", mimeType: "text/csv", buffer: Buffer.from(`id,vh,vl\nlong,${"A".repeat(143)},${"G".repeat(127)}`) })
  const row = page.getByRole("group", { name: "Pair 1", exact: true })
  await expect(row.getByLabel("VL · normalized", { exact: true })).toHaveValue("G".repeat(127))
  await expect(page.getByRole("button", { name: "Submit humanization" })).toBeDisabled()
  await row.getByLabel("VH · normalized", { exact: true }).fill("A".repeat(142))
  await expect(page.getByRole("button", { name: "Submit humanization" })).toBeDisabled()
  await row.getByLabel("VL · normalized", { exact: true }).fill("G".repeat(126))
  await expect(page.getByRole("button", { name: "Submit humanization" })).toBeEnabled()
  expect(api.submissions).toHaveLength(0)
})

test("large imports render bounded editor pages and retain edits and hidden validation", async ({ page }) => {
  const api = await mockApi(page)
  await page.goto("/tools/humanization/new")
  const csv = "id,vh,vl\n" + Array.from({ length: 30000 }, (_, i) => `ab_${i},${"A".repeat(120)},${i === 29999 ? "X" : "G".repeat(110)}`).join("\n")
  const start = performance.now()
  await page.locator("#humanization-csv").setInputFiles({ name: "library.csv", mimeType: "text/csv", buffer: Buffer.from(csv) })
  await expect(page.getByText("Current batch · 30000 pairs", { exact: true })).toBeVisible()
  await expect(page.getByRole("group", { name: /^Pair \d+$/ })).toHaveCount(50)
  console.log(`30,000-pair import with bounded editor: ${Math.round(performance.now() - start)} ms`)
  await expect(page.getByRole("button", { name: "Submit humanization" })).toBeDisabled()
  await page.getByRole("button", { name: "Go to first invalid row (pair 30000)" }).click()
  await expect(page.getByLabel("Batch page", { exact: true })).toHaveValue("600")
  const last = page.getByRole("group", { name: "Pair 30000", exact: true })
  await last.getByLabel("VL · normalized", { exact: true }).fill("GGG")
  await last.getByLabel("ID", { exact: true }).fill("edited_last")
  await page.getByRole("button", { name: "Previous batch page" }).click()
  await page.getByRole("button", { name: "Next batch page" }).click()
  await expect(last.getByLabel("ID", { exact: true })).toHaveValue("edited_last")
  await expect(last.getByLabel("VL · normalized", { exact: true })).toHaveValue("GGG")
  expect(api.submissions).toHaveLength(0)
})

test("batch pagination preserves global row indexes and complete submission", async ({ page }) => {
  const api = await mockApi(page)
  await page.goto("/tools/humanization/new")
  await page.locator("#humanization-csv").setInputFiles({ name: "batch.csv", mimeType: "text/csv", buffer: Buffer.from("id,vh,vl\n" + Array.from({ length: 51 }, (_, i) => `ab_${i},ACD,${i === 50 ? "X" : "EFG"}`).join("\n")) })
  await expect(page.getByRole("button", { name: "Submit humanization" })).toBeDisabled()
  await page.getByRole("button", { name: "Go to first invalid row (pair 51)" }).click()
  const last = page.getByRole("group", { name: "Pair 51", exact: true })
  await last.getByLabel("VL · normalized", { exact: true }).fill("EFG")
  await last.getByLabel("ID", { exact: true }).fill("ab_0")
  await page.getByRole("button", { name: "Previous batch page" }).click()
  await expect(page.getByRole("group", { name: "Pair 1", exact: true }).getByLabel("ID", { exact: true })).toHaveAttribute("aria-invalid", "true")
  await page.getByRole("button", { name: "Next batch page" }).click()
  await last.getByLabel("ID", { exact: true }).fill("edited_last")
  await page.getByRole("button", { name: "Submit humanization" }).click()
  await expect.poll(() => api.submissions.length).toBe(1)
  const body = api.submissions[0].body as { pairs: { id: string; vh: string; vl: string }[] }
  expect(body.pairs).toHaveLength(51)
  expect(body.pairs[50]).toEqual({ id: "edited_last", vh: "ACD", vl: "EFG" })
})
