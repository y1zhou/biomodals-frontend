import { expect, test, type Page } from "@playwright/test"

const sourceId = "11111111-1111-4111-8111-111111111111"
const childId = "22222222-2222-4222-8222-222222222222"
const principal = { user_id: "clustering-owner", display_name: "Researcher", email: "researcher@example.test", is_admin: false }
const info = { source_job_id: sourceId, source_display_name: "Cumulative production", eligible: true, code: null, detail: "Ready", frame_count: 25000, protein_atoms: 800, ca_atoms: 200, estimated_memory_bytes: 2147483648, warnings: ["All-pairs comparison may require substantial memory."], default_cutoff_angstrom: 2, deadline_seconds: 43200 }
const job = (id: string, state = "succeeded") => ({ job_id: id, display_name: id === sourceId ? info.source_display_name : "Cluster analysis", tool: "gromacs", operation: id === sourceId ? "run" : "trajectory_clustering", source_job_id: id === sourceId ? null : sourceId, state, stages: [], can_retry_result_preparation: false, can_view_logs: false, created_at: "2026-09-24T00:00:00Z", updated_at: "2026-09-24T00:00:00Z", warnings: [] })

async function mockApi(page: Page) {
  await page.context().addCookies([{ name: "biomodals-csrf", value: "fixture", url: process.env.BIOMODALS_BROWSER_ORIGIN! }])
  const requests: string[] = []
  await page.route((url) => url.pathname.startsWith("/api/"), (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    requests.push(`${request.method()} ${path}`)
    if (path.endsWith("/auth/me") || path.endsWith("/auth/login")) return route.fulfill({ json: principal })
    if (path.endsWith("/clustering")) return route.fulfill(request.method() === "GET" ? { json: info } : { status: 202, json: job(childId, "queued") })
    if (path === `/api/v1/jobs/${sourceId}`) return route.fulfill({ json: job(sourceId) })
    if (path === `/api/v1/jobs/${childId}`) return route.fulfill({ json: job(childId, "queued") })
    return route.fulfill({ status: 404, json: { detail: "Not found" } })
  })
  return requests
}

test("completed simulation opens clustering with advisory estimates and submits only explicit cutoff", async ({ page }) => {
  const requests = await mockApi(page)
  await page.goto(`/tools/gromacs/jobs/${sourceId}`)
  await page.getByRole("link", { name: "Cluster trajectory", exact: true }).click()
  await expect(page).toHaveTitle("Cluster trajectory · GROMACS | BioModals")
  await expect(page.getByLabel("RMSD cutoff (Å)", { exact: true })).toHaveValue("2")
  await expect(page.getByText("25,000", { exact: true })).toBeVisible()
  await expect(page.getByText("2 GiB", { exact: true })).toBeVisible()
  await expect(page.getByText(/All-pairs comparison may require/)).toBeVisible()
  await expect(page.getByRole("button", { name: "Submit clustering", exact: true })).toBeEnabled()
  expect(requests.filter((request) => request.startsWith("POST"))).toEqual([])
  await page.getByLabel("RMSD cutoff (Å)", { exact: true }).fill("0")
  await page.getByRole("button", { name: "Submit clustering", exact: true }).click()
  await expect(page.getByText("Enter a finite cutoff greater than zero.", { exact: true })).toBeVisible()
  expect(requests.filter((request) => request.startsWith("POST"))).toEqual([])
  await page.getByLabel("RMSD cutoff (Å)", { exact: true }).fill("1000.25")
  await page.getByLabel("Job name (optional)", { exact: true }).fill("My clusters")
  const sent = page.waitForRequest((request) => request.method() === "POST" && request.url().endsWith("/clustering"))
  await page.getByRole("button", { name: "Submit clustering", exact: true }).click()
  const request = await sent
  expect(request.postDataJSON()).toEqual({ display_name: "My clusters", cutoff_angstrom: 1000.25 })
  expect(request.headers()["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/)
  expect(request.headers()["x-csrf-token"]).toBe("fixture")
  await expect(page).toHaveURL(new RegExp(`/jobs/${childId}$`))
  await expect(page.getByRole("link", { name: "View source simulation", exact: true })).toHaveAttribute("href", `/tools/gromacs/jobs/${sourceId}`)
  expect(requests.filter((request) => request.startsWith("POST"))).toHaveLength(1)
})

test("source failures remain visible and only explicit recheck retries", async ({ page }) => {
  const requests = await mockApi(page)
  let checks = 0
  await page.route("**/clustering", (route) => {
    checks++
    return route.fulfill(checks === 1 ? { status: 504, headers: { "X-Request-ID": "source-timeout" }, json: { code: "source_check_timeout", detail: "Source check timed out. Try again." } } : { json: { ...info, eligible: false, code: "source_unavailable", detail: "Retained trajectory is unavailable." } })
  })
  await page.goto(`/tools/gromacs/jobs/${sourceId}/cluster`)
  await expect(page.getByRole("alert")).toHaveText("Source check timed out. Try again.")
  await expect(page.getByText("Support ID: source-timeout", { exact: true })).toBeVisible()
  expect(checks).toBe(1)
  await page.getByRole("button", { name: "Check again", exact: true }).click()
  await expect(page.getByRole("alert")).toHaveText("Retained trajectory is unavailable.")
  await expect(page.getByRole("button", { name: "Submit clustering", exact: true })).toHaveCount(0)
  expect(checks).toBe(2)
  expect(requests.filter((request) => request.startsWith("POST"))).toEqual([])
})

test("lost response survives reload and a failed source read with the exact original intent", async ({ page }) => {
  await mockApi(page)
  const submitted: Array<{ key: string | undefined; body: unknown }> = []
  await page.route("**/clustering", (route) => {
    if (route.request().method() === "GET") return route.fulfill(submitted.length ? { status: 409, json: { code: "deployment_incompatible", detail: "Source check unavailable" } } : { json: info })
    submitted.push({ key: route.request().headers()["idempotency-key"], body: route.request().postDataJSON() })
    return submitted.length === 1 ? route.abort("failed") : route.fulfill({ status: 202, json: job(childId, "queued") })
  })
  await page.goto(`/tools/gromacs/jobs/${sourceId}/cluster`)
  await page.getByLabel("RMSD cutoff (Å)", { exact: true }).fill("1.25")
  await page.getByRole("button", { name: "Submit clustering", exact: true }).click()
  await expect(page.getByRole("button", { name: "Check submission", exact: true })).toBeVisible()
  page.on("dialog", (dialog) => dialog.accept())
  await page.reload()
  await expect(page.getByLabel("RMSD cutoff (Å)", { exact: true })).toHaveValue("1.25")
  await expect(page.getByLabel("RMSD cutoff (Å)", { exact: true })).toBeDisabled()
  expect(submitted).toHaveLength(1)
  await page.getByRole("button", { name: "Check submission", exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/jobs/${childId}$`))
  expect(submitted[1]).toEqual(submitted[0])
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.startsWith("biomodals:gromacs:clustering:")))).toEqual([])
})

test("rejected admission preserves settings, edited settings use a new intent, and reauthentication never auto-submits", async ({ page }) => {
  await mockApi(page)
  const submissions: Array<{ key: string | undefined; body: unknown }> = []
  await page.route("**/clustering", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: info })
    submissions.push({ key: route.request().headers()["idempotency-key"], body: route.request().postDataJSON() })
    if (submissions.length === 1) return route.fulfill({ status: 409, json: { code: "source_environment_mismatch", detail: "Source and target environments differ." } })
    if (submissions.length === 2) return route.fulfill({ status: 401, json: { detail: "Expired" } })
    return route.fulfill({ status: 202, json: job(childId, "queued") })
  })
  await page.goto(`/tools/gromacs/jobs/${sourceId}/cluster`)
  await page.getByRole("button", { name: "Submit clustering", exact: true }).click()
  await expect(page.getByRole("alert")).toHaveText("Source and target environments differ.")
  await expect(page.getByLabel("RMSD cutoff (Å)", { exact: true })).toHaveValue("2")
  expect(submissions).toHaveLength(1)
  await page.getByLabel("RMSD cutoff (Å)", { exact: true }).fill("3")
  await page.getByRole("button", { name: "Submit clustering", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Email", { exact: true }).fill(principal.email)
  await dialog.getByLabel("Password", { exact: true }).fill("offline-password")
  await dialog.getByRole("button", { name: "Sign in and return", exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByLabel("RMSD cutoff (Å)", { exact: true })).toHaveValue("3")
  expect(submissions).toHaveLength(2)
  expect(submissions[1]!.key).not.toBe(submissions[0]!.key)
  await page.getByRole("button", { name: "Submit clustering", exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/jobs/${childId}$`))
  expect(submissions[2]).toEqual(submissions[1])
})

test("analysis jobs retain source and shared lifecycle in all states without MD plots or actions", async ({ page }) => {
  const requests = await mockApi(page)
  for (const state of ["queued", "running", "finalizing", "succeeded", "failed", "cancelled"]) {
    await page.route(`**/api/v1/jobs/${childId}`, (route) => route.fulfill({ json: { ...job(childId, state), can_retry_result_preparation: state === "failed" } }))
    await page.goto(`/tools/gromacs/jobs/${childId}`)
    await expect(page.getByText("Trajectory clustering analysis", { exact: true })).toBeVisible()
    await expect(page.getByRole("link", { name: "View source simulation", exact: true })).toHaveAttribute("href", `/tools/gromacs/jobs/${sourceId}`)
    for (const label of ["Extend simulation", "Cluster trajectory", "Start a new job"]) await expect(page.getByRole("link", { name: label, exact: true })).toHaveCount(0)
    if (state === "succeeded") await expect(page.getByRole("button", { name: "Download result", exact: true })).toBeVisible()
    if (state === "running") await expect(page.getByRole("button", { name: "Cancel job", exact: true })).toBeVisible()
    if (state === "failed") await expect(page.getByRole("button", { name: "Retry fetching results", exact: true })).toBeVisible()
  }
  expect(requests.filter((request) => request.includes("/trajectory/"))).toEqual([])
})
