import { expect, test, type Page } from "@playwright/test"

const jobId = "11111111-1111-4111-8111-111111111111"
const childId = "22222222-2222-4222-8222-222222222222"
const principal = { user_id: "owner", display_name: "Researcher", email: "researcher@example.test", is_admin: false }
const job = (id = jobId, state = "failed", tool = "gromacs") => ({ job_id: id, display_name: id === jobId ? "Disposable job" : "Retained child", tool, operation: id === childId ? "trajectory_clustering" : "run", source_job_id: id === childId ? jobId : null, state, stages: [], can_retry_result_preparation: false, can_view_logs: false, created_at: "2026-09-24T00:00:00Z", updated_at: "2026-09-24T00:00:00Z", warnings: [] })

async function mockApi(page: Page) {
  await page.context().addCookies([{ name: "biomodals-csrf", value: "fixture", url: process.env.BIOMODALS_BROWSER_ORIGIN! }])
  const state = { deleted: false, job: job(), deletes: [] as string[] }
  await page.route((url) => url.pathname.startsWith("/api/"), (route) => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname
    if (pathname.endsWith("/auth/me") || pathname.endsWith("/auth/login")) return route.fulfill({ json: principal })
    if (pathname === "/api/v1/jobs") return route.fulfill({ json: { jobs: state.deleted ? [job(childId)] : [state.job, job(childId)], next_cursor: null } })
    if (pathname === `/api/v1/jobs/${childId}`) return route.fulfill({ json: job(childId) })
    if (pathname === `/api/v1/jobs/${jobId}` && request.method() === "DELETE") {
      state.deletes.push(request.headers()["x-csrf-token"] ?? "")
      state.deleted = true
      return route.fulfill({ status: 202, body: "" })
    }
    if (pathname === `/api/v1/jobs/${jobId}`) return route.fulfill(state.deleted ? { status: 404, json: { detail: "Not found" } } : { json: state.job })
    return route.fulfill({ status: 404, json: { detail: "Not found" } })
  })
  return state
}

test("only eligible terminal details offer Delete beside Refresh for every Tool", async ({ page }) => {
  const state = await mockApi(page)
  for (const status of ["queued", "running", "finalizing", "blocked", "cancel_requested", "state_unknown", "succeeded", "partial", "failed", "cancelled"]) {
    state.job = job(jobId, status)
    await page.goto(`/tools/gromacs/jobs/${jobId}`)
    await expect(page.getByRole("heading", { name: "Disposable job", exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Delete", exact: true })).toHaveCount(["succeeded", "partial", "failed", "cancelled"].includes(status) ? 1 : 0)
  }
  for (const tool of ["gromacs", "alphafold3", "humanization", "nanobody_humanization"]) {
    state.job = job(jobId, "failed", tool)
    await page.goto(`/tools/${tool.replaceAll("_", "-")}/jobs/${jobId}`)
    const remove = page.getByRole("button", { name: "Delete", exact: true })
    await expect(remove).toBeEnabled()
    await expect(remove.locator("..").getByRole("button", { name: "Refresh", exact: true })).toBeVisible()
  }
  await page.goto("/jobs")
  await expect(page.getByRole("link", { name: "Disposable job", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: /Delete/ })).toHaveCount(0)
  expect(state.deletes).toEqual([])
})

test("confirmation explains retained remote data and accepted deletion clears history without hiding children", async ({ page }) => {
  const state = await mockApi(page)
  await page.goto("/jobs")
  await page.getByRole("link", { name: "Disposable job", exact: true }).click()
  await page.getByRole("button", { name: "Delete", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Delete this job?", exact: true })
  await expect(dialog).toContainText("Disposable job")
  await expect(dialog).toContainText("no Trash or Restore")
  await expect(dialog).toContainText("cleaned up in the background")
  await expect(dialog).toContainText("Downloads already in progress may finish")
  await expect(dialog).toContainText("Remote results, execution records, logs and billing remain")
  await expect(dialog.getByRole("button", { name: "Keep job", exact: true })).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(dialog).not.toBeVisible()
  expect(state.deletes).toEqual([])
  await page.getByRole("button", { name: "Delete", exact: true }).click()
  await dialog.getByRole("button", { name: "Delete job", exact: true }).click()
  await expect(page).toHaveURL(/\/jobs$/)
  await expect(page.getByRole("link", { name: "Disposable job", exact: true })).toHaveCount(0)
  await page.getByRole("link", { name: "Retained child", exact: true }).click()
  await page.getByRole("link", { name: "View source simulation", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Job unavailable", exact: true })).toBeVisible()
  expect(state.deletes).toEqual(["fixture"])
})

test("an unconfirmed deletion retries explicitly, including when the first request was accepted", async ({ page }) => {
  const state = await mockApi(page)
  let deletes = 0
  await page.route(`**/api/v1/jobs/${jobId}`, (route) => {
    if (route.request().method() !== "DELETE") return route.fallback()
    deletes++
    state.deleted = true
    return deletes === 1 ? route.abort("failed") : route.fulfill({ status: 202, body: "" })
  })
  await page.goto(`/tools/gromacs/jobs/${jobId}`)
  await page.getByRole("button", { name: "Delete", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Delete this job?", exact: true })
  await dialog.getByRole("button", { name: "Delete job", exact: true }).click()
  await expect(dialog.getByRole("alert")).toContainText("Deletion could not be confirmed")
  expect(deletes).toBe(1)
  await dialog.getByRole("button", { name: "Delete job", exact: true }).click()
  await expect(page).toHaveURL(/\/jobs$/)
  expect(deletes).toBe(2)
})

test("stale terminal state reports conflict and updates eligibility without deleting", async ({ page }) => {
  const state = await mockApi(page)
  let deletes = 0
  await page.route(`**/api/v1/jobs/${jobId}`, (route) => {
    if (route.request().method() !== "DELETE") return route.fallback()
    deletes++
    state.job = job(jobId, "blocked")
    return route.fulfill({ status: 409, json: { code: "job_not_deletable", detail: "Only terminal jobs can be deleted" } })
  })
  await page.goto(`/tools/gromacs/jobs/${jobId}`)
  await page.getByRole("button", { name: "Delete", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Delete this job?", exact: true })
  await dialog.getByRole("button", { name: "Delete job", exact: true }).click()
  await expect(dialog.getByRole("alert")).toContainText("no longer eligible")
  await expect(dialog.getByRole("button", { name: "Delete job", exact: true })).toBeDisabled()
  await dialog.getByRole("button", { name: "Keep job", exact: true }).click()
  await expect(page.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0)
  expect(state.deleted).toBe(false)
  expect(deletes).toBe(1)
})

test("expired session requires sign-in and another explicit deletion confirmation", async ({ page }) => {
  const state = await mockApi(page)
  let deletes = 0
  await page.route(`**/api/v1/jobs/${jobId}`, (route) => {
    if (route.request().method() !== "DELETE") return route.fallback()
    deletes++
    if (deletes === 1) return route.fulfill({ status: 401, json: { detail: "Expired session" } })
    state.deleted = true
    return route.fulfill({ status: 202, body: "" })
  })
  await page.goto(`/tools/gromacs/jobs/${jobId}`)
  await page.getByRole("button", { name: "Delete", exact: true }).click()
  await page.getByRole("button", { name: "Delete job", exact: true }).click()
  const auth = page.getByRole("dialog", { name: "Sign in again", exact: true })
  await auth.getByLabel("Email", { exact: true }).fill(principal.email)
  await auth.getByLabel("Password", { exact: true }).fill("offline-password")
  await auth.getByRole("button", { name: "Sign in and return", exact: true }).click()
  await expect(auth).not.toBeVisible()
  expect(deletes).toBe(1)
  const dialog = page.getByRole("dialog", { name: "Delete this job?", exact: true })
  if (!await dialog.isVisible()) await page.getByRole("button", { name: "Delete", exact: true }).click()
  await dialog.getByRole("button", { name: "Delete job", exact: true }).click()
  await expect(page).toHaveURL(/\/jobs$/)
  expect(deletes).toBe(2)
})
