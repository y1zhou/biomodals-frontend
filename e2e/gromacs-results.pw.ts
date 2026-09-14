import { expect, test, type Page } from "@playwright/test"

const jobId = "11111111-1111-4111-8111-111111111111"
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7WQAAAAASUVORK5CYII=", "base64")

async function mockResults(page: Page, { state = "succeeded", cacheMiss = false, partialFailure = false, unauthorized = false, restoreFailure = false } = {}) {
  const requests: string[] = []
  let preparations = 0
  let initialReads = 0
  let releaseReads: () => void = () => {}
  const concurrentReads = new Promise<void>((resolve) => { releaseReads = resolve })
  await page.context().addCookies([{ name: "biomodals-csrf", value: "test-csrf", url: process.env.BIOMODALS_BROWSER_ORIGIN! }])
  await page.route((url) => url.pathname.startsWith("/api/"), async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    requests.push(`${request.method()} ${url.pathname}`)
    if (url.pathname.endsWith("/auth/me")) return route.fulfill({ json: { user_id: "plot-owner", display_name: "Researcher", email: "plots@example.test", is_admin: false } })
    if (url.pathname === `/api/v1/jobs/${jobId}`) return route.fulfill({ json: { job_id: jobId, tool: "gromacs", state, display_name: "Trajectory test", created_at: "2026-09-14T00:00:00Z", updated_at: "2026-09-14T00:01:00Z", stages: [], warnings: [], can_view_logs: false, can_retry_result_preparation: false } })
    if (url.pathname.endsWith("/prepare-download")) {
      expect(request.headers()["x-csrf-token"]).toBe("test-csrf")
      preparations++
      if (restoreFailure) return route.fulfill({ status: 503, json: { code: "result_storage_unavailable" } })
      return route.fulfill({ status: 204 })
    }
    if (url.pathname.includes("/trajectory/")) {
      if (unauthorized) return route.fulfill({ status: 401, json: { detail: "Authentication required" } })
      if (cacheMiss && preparations === 0) {
        initialReads++
        if (initialReads === 3) releaseReads()
        await concurrentReads
        return route.fulfill({ status: 409, json: { code: "result_not_cached" } })
      }
      if (partialFailure && url.pathname.endsWith("/rg.png")) return route.fulfill({ status: 413, json: { code: "trajectory_plot_too_large" } })
      return route.fulfill({ contentType: "image/png", body: png })
    }
    if (url.pathname === "/api/v1/jobs") return route.fulfill({ json: { jobs: [], next_cursor: null } })
    return route.fulfill({ status: 404, json: { detail: "Unexpected offline request" } })
  })
  return { requests, preparations: () => preparations }
}

test("trajectory plots load concurrently with one restoration and isolated failures above stages", async ({ page }) => {
  const api = await mockResults(page, { cacheMiss: true, partialFailure: true })
  await page.goto(`/tools/gromacs/jobs/${jobId}`)
  const rmsd = page.getByRole("img", { name: "RMSD production trajectory plot", exact: true })
  await expect(rmsd).toBeVisible()
  await expect(page.getByRole("img", { name: "RMSF production trajectory plot", exact: true })).toBeVisible()
  await expect(page.getByRole("alert")).toContainText("Radius of gyration is too large to preview")
  expect(await rmsd.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  await expect(rmsd).toHaveCSS("background-color", "rgb(255, 255, 255)")
  const top = await page.getByText("Trajectory overview", { exact: true }).evaluate((element) => element.getBoundingClientRect().top)
  expect(top).toBeLessThan(await page.getByRole("table", { name: "Execution stages" }).evaluate((element) => element.getBoundingClientRect().top))
  expect(api.preparations()).toBe(1)
  expect(api.requests.filter((request) => request.includes("/trajectory/"))).toHaveLength(6)
  expect(api.requests.filter((request) => request.startsWith("POST"))).toEqual([`POST /api/v1/jobs/${jobId}/prepare-download`])
  expect(api.requests.some((request) => request.endsWith("/download"))).toBe(false)
  const objectUrl = await rmsd.getAttribute("src")
  await page.getByRole("link", { name: "My Jobs", exact: true }).first().click()
  await expect(page).toHaveURL(`${process.env.BIOMODALS_BROWSER_ORIGIN}/jobs`)
  await expect(rmsd).toHaveCount(0)
  await expect.poll(() => page.evaluate(async (url) => { try { await fetch(url!); return true } catch { return false } }, objectUrl)).toBe(false)
})

for (const state of ["running", "partial"]) test(`${state} GROMACS jobs do not fetch trajectory images`, async ({ page }) => {
  const api = await mockResults(page, { state })
  await page.goto(`/tools/gromacs/jobs/${jobId}`)
  await expect(page.getByRole("heading", { name: "Trajectory test" })).toBeVisible()
  await expect(page.getByText("Trajectory overview", { exact: true })).toHaveCount(0)
  expect(api.requests.some((request) => request.includes("/trajectory/"))).toBe(false)
})

test("trajectory authorization failures use shared reauthentication", async ({ page }) => {
  await mockResults(page, { unauthorized: true })
  await page.goto(`/tools/gromacs/jobs/${jobId}`)
  await expect(page.getByRole("dialog", { name: "Sign in again" })).toBeVisible()
})

test("failed cache restoration is shared without repeated preparations", async ({ page }) => {
  const api = await mockResults(page, { cacheMiss: true, restoreFailure: true })
  await page.goto(`/tools/gromacs/jobs/${jobId}`)
  await expect(page.getByRole("alert")).toHaveCount(3)
  expect(api.preparations()).toBe(1)
  expect(api.requests.filter((request) => request.includes("/trajectory/"))).toHaveLength(3)
})
