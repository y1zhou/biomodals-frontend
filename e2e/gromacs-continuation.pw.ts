import { expect, test, type Page } from "@playwright/test"

const sourceId = "11111111-1111-4111-8111-111111111111"
const childId = "22222222-2222-4222-8222-222222222222"
const ancestorId = "33333333-3333-4333-8333-333333333333"
const principal = { user_id: "continuation-owner", display_name: "Researcher", email: "researcher@example.test", is_admin: false }
const info = { source_job_id: sourceId, source_display_name: "Completed 200 ns", simulation_time_ns: 200, cpu_only: true, parent_job_id: ancestorId, eligible: true, code: null, detail: "Ready to continue.", min_additional_time_ns: 1, max_additional_time_ns: 250 }
const job = (id: string, state = "succeeded") => ({ job_id: id, display_name: id === sourceId ? info.source_display_name : "Continuation", tool: "gromacs", state, stages: [], can_retry_result_preparation: false, can_view_logs: false, created_at: "2026-09-16T00:00:00Z", updated_at: "2026-09-16T00:00:00Z", warnings: [] })

async function mockApi(page: Page) {
  await page.context().addCookies([{ name: "biomodals-csrf", value: "fixture", url: process.env.BIOMODALS_BROWSER_ORIGIN! }])
  const reads: string[] = []
  await page.route((url) => url.pathname.startsWith("/api/"), (route) => {
    const path = new URL(route.request().url()).pathname
    reads.push(path)
    if (path.endsWith("/auth/me") || path.endsWith("/auth/login")) return route.fulfill({ json: principal })
    if (path.endsWith("/continuation")) return route.fulfill({ json: info })
    if (path.endsWith("/continue")) return route.fulfill({ status: 202, json: job(childId, "queued") })
    if (path === `/api/v1/jobs/${sourceId}`) return route.fulfill({ json: job(sourceId) })
    if (path === `/api/v1/jobs/${childId}`) return route.fulfill({ json: job(childId, "queued") })
    return route.fulfill({ status: 404, json: { detail: "Not found" } })
  })
  return reads
}

test("completed job opens a read-only continuation form and submits additional, not total, time", async ({ page }) => {
  const reads = await mockApi(page)
  const posts: string[] = []
  page.on("request", (request) => { if (request.method() === "POST") posts.push(request.url()) })
  await page.goto(`/tools/gromacs/jobs/${sourceId}`)
  await expect(page.getByRole("link", { name: "Extend simulation", exact: true })).toBeVisible()
  await expect(page.getByRole("link", { name: "Extend simulation", exact: true }).locator("svg.lucide-step-forward")).toBeVisible()
  expect(reads.filter((path) => path.endsWith("/continuation"))).toHaveLength(0)
  await page.getByRole("link", { name: "Extend simulation", exact: true }).click()
  await expect(page).toHaveTitle("Extend simulation · GROMACS | BioModals")
  await expect(page.getByLabel("Additional production time (ns)", { exact: true })).toHaveValue("")
  await expect(page.getByLabel("Execution mode", { exact: true })).toHaveValue("cpu")
  await expect(page.getByRole("link", { name: "View its parent job" })).toHaveAttribute("href", `/tools/gromacs/jobs/${ancestorId}`)
  expect(reads.filter((path) => path.endsWith("/continuation"))).toHaveLength(1)
  expect(posts).toHaveLength(0)
  await page.getByLabel("Additional production time (ns)", { exact: true }).fill("251")
  await page.getByRole("button", { name: "Submit continuation", exact: true }).click()
  await expect(page.getByText("Enter a whole number from 1 to 250.", { exact: true })).toBeVisible()
  expect(posts).toHaveLength(0)
  await page.getByLabel("Additional production time (ns)", { exact: true }).fill("250")
  await page.getByLabel("Job name (optional)", { exact: true }).fill("More production")
  await page.getByLabel("Execution mode", { exact: true }).selectOption("gpu")
  await expect(page.getByText(/200 ns completed \+ 250 ns additional = 450 ns cumulative/)).toBeVisible()
  await expect(page.getByText(/RMSD keeps the original reference/)).toBeVisible()
  const request = page.waitForRequest((request) => request.method() === "POST" && request.url().endsWith("/continue"))
  await page.getByRole("button", { name: "Submit continuation", exact: true }).click()
  const submitted = await request
  expect(submitted.postDataJSON()).toEqual({ display_name: "More production", additional_time_ns: 250, cpu_only: false })
  expect(submitted.headers()["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/)
  expect(submitted.headers()["x-csrf-token"]).toBe("fixture")
  await expect(page).toHaveURL(new RegExp(`/jobs/${childId}$`))
  expect(posts).toHaveLength(1)
})

test("unavailable and foreign sources cannot open a submission form", async ({ page }) => {
  await mockApi(page)
  await page.route("**/continuation", (route) => route.fulfill({ json: { ...info, eligible: false, simulation_time_ns: null, cpu_only: null, code: "source_unavailable", detail: "Native checkpoint is missing." } }))
  await page.goto(`/tools/gromacs/jobs/${sourceId}/continue`)
  await expect(page.getByRole("alert")).toContainText("Native checkpoint is missing")
  await expect(page.getByRole("button", { name: "Submit continuation", exact: true })).toHaveCount(0)
  await page.route("**/continuation", (route) => route.fulfill({ status: 404, json: { detail: "Not found" } }))
  await page.reload()
  await expect(page.getByRole("alert")).toContainText("does not exist or is not available")
  await expect(page.getByLabel("Additional production time (ns)", { exact: true })).toHaveCount(0)
})

test("lost response restores the exact continuation intent without touching fresh submission storage", async ({ page }) => {
  await mockApi(page)
  const freshKey = "44444444-4444-4444-8444-444444444444"
  await page.addInitScript((key) => { sessionStorage.setItem("biomodals:gromacs:pending-idempotency-key", key); Object.defineProperty(crypto, "randomUUID", { value: undefined }) }, freshKey)
  const requests: Array<{ key: string | undefined; input: unknown }> = []
  await page.route("**/api/v1/gromacs/jobs/*/continue", async (route) => {
    requests.push({ key: route.request().headers()["idempotency-key"], input: route.request().postDataJSON() })
    if (requests.length === 1) return route.abort("failed")
    return route.fulfill({ status: 202, json: job(childId, "queued") })
  })
  await page.goto(`/tools/gromacs/jobs/${sourceId}/continue`)
  await page.getByLabel("Additional production time (ns)", { exact: true }).fill("10")
  await page.getByRole("button", { name: "Submit continuation", exact: true }).click()
  await expect(page.getByRole("button", { name: "Check submission", exact: true })).toBeVisible()
  await page.route("**/continuation", (route) => route.fulfill({ json: { ...info, eligible: false, simulation_time_ns: null, cpu_only: null, code: "source_unavailable", detail: "Source is no longer available for new work." } }))
  page.on("dialog", (dialog) => dialog.accept())
  await page.reload()
  await expect(page.getByLabel("Additional production time (ns)", { exact: true })).toHaveValue("10")
  await expect(page.getByLabel("Additional production time (ns)", { exact: true })).toBeDisabled()
  expect(requests).toHaveLength(1)
  await page.getByRole("button", { name: "Check submission", exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/jobs/${childId}$`))
  expect(requests[1]).toEqual(requests[0])
  expect(await page.evaluate(() => sessionStorage.getItem("biomodals:gromacs:pending-idempotency-key"))).toBe(freshKey)
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.startsWith("biomodals:gromacs:continuation:")))).toEqual([])
})

test("reauthentication retains continuation edits and never automatically resubmits", async ({ page }) => {
  await mockApi(page)
  const keys: string[] = []
  await page.route("**/api/v1/gromacs/jobs/*/continue", (route) => {
    keys.push(route.request().headers()["idempotency-key"]!)
    return route.fulfill(keys.length === 1 ? { status: 401, json: { detail: "Expired" } } : { status: 202, json: job(childId, "queued") })
  })
  await page.goto(`/tools/gromacs/jobs/${sourceId}/continue`)
  await page.getByLabel("Additional production time (ns)", { exact: true }).fill("12")
  await page.getByLabel("Job name (optional)", { exact: true }).fill("Preserved edits")
  await page.getByRole("button", { name: "Submit continuation", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Email", { exact: true }).fill(principal.email)
  await dialog.getByLabel("Password", { exact: true }).fill("offline-password")
  await dialog.getByRole("button", { name: "Sign in and return", exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByLabel("Additional production time (ns)", { exact: true })).toHaveValue("12")
  await expect(page.getByLabel("Job name (optional)", { exact: true })).toHaveValue("Preserved edits")
  expect(keys).toHaveLength(1)
  await page.getByRole("button", { name: "Submit continuation", exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/jobs/${childId}$`))
  expect(keys[1]).toBe(keys[0])
})
