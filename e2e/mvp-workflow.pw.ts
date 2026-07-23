import { readFile } from "node:fs/promises"
import path from "node:path"

import { expect, test, type Locator } from "@playwright/test"

const PASSWORD = "correct horse battery staple"
const PDB = Buffer.from(
  "ATOM      1  CA  ALA A   1       0.000   0.000   0.000  1.00 20.00           C\nEND\n"
)

interface BrowserStats {
  password_link: string
  preflight_versions: number[]
  submit_calls: number
  submit_versions: number[]
  provider_calls: number
  cancel_calls: number
  log_fetches: number
}

async function browserStats() {
  const root = process.env.BIOMODALS_BROWSER_ROOT
  if (!root) throw new Error("BIOMODALS_BROWSER_ROOT is missing")
  return JSON.parse(
    await readFile(path.join(root, "stats.json"), "utf8")
  ) as BrowserStats
}

async function tableRowGeometry(button: Locator) {
  return button.evaluate((element) => {
    const row = element.closest("tr")
    if (!row) throw new Error("Stage button is not inside a table row")
    return {
      height: row.getBoundingClientRect().height,
      cells: Array.from(row.cells).map((cell) => {
        const style = getComputedStyle(cell)
        return {
          width: cell.getBoundingClientRect().width,
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
          paddingTop: style.paddingTop,
          paddingRight: style.paddingRight,
          paddingBottom: style.paddingBottom,
          paddingLeft: style.paddingLeft,
        }
      }),
    }
  })
}

test("MVP password, jobs, download, cancellation, and sign-out", async ({
  context,
  page,
}) => {
  test.setTimeout(60_000)
  const origin = process.env.BIOMODALS_BROWSER_ORIGIN
  if (!origin) throw new Error("BIOMODALS_BROWSER_ORIGIN is missing")
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin,
  })
  await expect.poll(async () => (await browserStats()).password_link).not.toBe("")
  await expect.poll(async () => (await browserStats()).preflight_versions).toEqual([7])
  const setup = (await browserStats()).password_link

  await page.goto(setup)
  await page.getByLabel("New password").fill(PASSWORD)
  await page.getByLabel("Confirm password").fill(PASSWORD)
  await page.getByRole("button", { name: "Set password" }).click()
  await expect(page).toHaveURL(`${origin}/`)

  await page.getByRole("button", { name: "Open user menu" }).click()
  await page.getByRole("menuitem", { name: "Sign out" }).click()
  await page.getByRole("link", { name: "Sign in" }).click()
  const login = page.getByRole("main")
  await login.getByLabel("Email").fill("browser-admin@example.com")
  await login.getByLabel("Password").fill(PASSWORD)
  await login.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(`${origin}/`)

  await page.setViewportSize({ width: 360, height: 800 })
  await expect(page.getByRole("link", { name: "Tools" })).toBeVisible()
  await expect(page.getByRole("link", { name: "My Jobs" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Open user menu" })).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
    )
  ).toBe(true)
  await page.setViewportSize({ width: 1280, height: 720 })

  await page.goto("/tools/gromacs")
  await expect(
    page.getByText("Select a PDB file and click the button below.")
  ).toBeVisible()
  await expect(
    page.getByText("Sign in before selecting a PDB so your input stays in place.")
  ).toHaveCount(0)
  const filteredJobsLink = page.getByRole("link", { name: "View My Jobs" })
  await expect(filteredJobsLink).toHaveAttribute("href", "/jobs?tool=gromacs")
  await filteredJobsLink.click()
  await expect(page).toHaveURL(`${origin}/jobs?tool=gromacs`)

  await page.goto("/tools/gromacs/new")
  await page.getByLabel("PDB file").setInputFiles({
    buffer: PDB,
    mimeType: "chemical/x-pdb",
    name: "browser-input.pdb",
  })
  await page.getByLabel(/Display name/).fill("Browser success workflow")
  const submit = page.getByRole("button", { name: "Submit simulation" })
  await submit.evaluate((button: HTMLButtonElement) => {
    button.click()
    button.click()
  })

  await expect(page).toHaveURL(/\/tools\/gromacs\/jobs\/[0-9a-f-]+$/)
  const completedJobId = page.url().split("/").at(-1)
  if (!completedJobId) throw new Error("Completed Job ID is missing")
  await expect(page.locator("details", { hasText: "Logs" })).toHaveCount(0)
  await expect(
    page.getByText("Administrators can click a started remote stage to view its Modal logs.")
  ).toBeVisible()
  const prepareStage = page.getByRole("button", { name: /Prepare simulation/ })
  const prepareLogs = page.getByRole("region", {
    name: "Logs for Prepare simulation",
  })
  await expect(prepareLogs).toHaveCount(0)
  const collapsedGeometry = await tableRowGeometry(prepareStage)
  await prepareStage.click()
  await expect(prepareLogs).toBeVisible()
  const loadingGeometry = await tableRowGeometry(prepareStage)
  expect(loadingGeometry).toEqual(collapsedGeometry)
  const remoteLogLine = prepareLogs.getByText("Browser test remote log")
  await expect(remoteLogLine).toBeVisible()
  await expect(remoteLogLine).toHaveCSS("color", "rgb(187, 0, 0)")
  const loadedGeometry = await tableRowGeometry(prepareStage)
  expect(loadedGeometry).toEqual(collapsedGeometry)
  await expect(prepareLogs.getByText("Streaming logs")).toBeVisible()
  await prepareLogs.getByRole("button", { name: "Copy logs" }).click()
  await expect(prepareLogs.getByRole("button", { name: "Copied" })).toBeVisible()
  const logDownloadEvent = page.waitForEvent("download")
  await prepareLogs.getByRole("button", { name: "Download logs" }).click()
  const logDownload = await logDownloadEvent
  expect(logDownload.suggestedFilename()).toMatch(
    /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z_gromacs_prepare_simulation\.log$/
  )
  await prepareStage.click()
  await expect(prepareLogs).toHaveCount(0)
  await expect.poll(async () => (await browserStats()).submit_calls).toBe(1)
  await expect.poll(async () => (await browserStats()).submit_versions).toEqual([7])
  const statusMetadata = page.locator("p", { hasText: "Job updated" }).first()
  await expect(statusMetadata).toContainText(/Last checked \d+s ago/)
  const stagesTable = page.getByRole("table", { name: "GROMACS execution stages" })
  expect(
    await stagesTable.evaluate(
      (table) => table.scrollWidth <= (table.parentElement?.clientWidth ?? 0)
    )
  ).toBe(true)
  await expect(page.getByRole("row", { name: /Prepare simulation/ })).toBeVisible()
  await expect.poll(async () => (await browserStats()).provider_calls).toBeGreaterThanOrEqual(4)
  await page.getByRole("button", { name: "Refresh" }).click()
  for (const stage of ["Analyze NVT", "Analyze NPT", "Run production"]) {
    await expect(page.getByRole("row", { name: new RegExp(stage) })).toContainText(
      "Running",
      { timeout: 5_000 }
    )
  }
  await expect
    .poll(async () => (await browserStats()).provider_calls)
    .toBeGreaterThanOrEqual(5)
  await page.getByRole("button", { name: "Refresh" }).click()
  await expect(page.getByRole("row", { name: /Analyze production/ })).toContainText(
    "Running"
  )
  for (const stage of ["Analyze NVT", "Analyze NPT"]) {
    await expect(page.getByRole("row", { name: new RegExp(stage) })).toContainText(
      "Running"
    )
  }
  await expect(
    page.getByRole("button", { name: "Download result" })
  ).toHaveCount(0)
  await expect.poll(async () => {
    const response = await page.context().request.get(
      `/api/v1/jobs/${completedJobId}`
    )
    return (await response.json() as { state: string }).state
  }).toBe("succeeded")
  await page.getByRole("button", { name: "Refresh" }).click()
  await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByRole("button", { name: "Download result" })).toBeVisible({
    timeout: 15_000,
  })
  await expect(statusMetadata).not.toContainText("ago")
  await prepareStage.click()
  await expect(prepareLogs.getByText("Fetched logs")).toBeVisible()
  await expect(prepareLogs.getByText("Browser test remote log")).toBeVisible()
  await expect.poll(async () => (await browserStats()).log_fetches).toBe(2)
  await prepareStage.click()
  await expect(prepareLogs).toHaveCount(0)
  await prepareStage.click()
  await expect(prepareLogs.getByText("Fetched logs")).toBeVisible()
  await expect(prepareLogs.getByText("Browser test remote log")).toBeVisible()
  await expect.poll(async () => (await browserStats()).log_fetches).toBe(2)

  const historicalEnd = Date.now() - 60_000
  const historicalStart = historicalEnd - 20 * 60_000
  const targetsRoute = `**/api/v1/admin/jobs/${completedJobId}/log-targets`
  const logsRoute = `**/api/v1/admin/jobs/${completedJobId}/logs?*`
  await page.route(targetsRoute, async (route) => {
    const response = await route.fetch()
    const body = await response.json() as {
      job_id: string
      targets: Array<{
        ended_at: string | null
        stage_code: string
        started_at: string
      }>
    }
    for (const target of body.targets) {
      if (target.stage_code !== "analyze_production") continue
      target.started_at = new Date(historicalStart).toISOString()
      target.ended_at = new Date(historicalEnd).toISOString()
    }
    await route.fulfill({ response, json: body })
  })
  await page.route(logsRoute, async (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.get("stage") !== "analyze_production") {
      await route.continue()
      return
    }
    const since = Date.parse(url.searchParams.get("since") ?? "")
    await route.fulfill({
      contentType: "text/plain",
      status: 200,
      body: since < historicalEnd - 10 * 60_000
        ? "2026-07-22 10:00:00 Older retained log\n"
        : "",
    })
  })
  const productionAnalysis = page.getByRole("button", {
    name: /Analyze production/,
  })
  const productionLogs = page.getByRole("region", {
    name: "Logs for Analyze production",
  })
  await productionAnalysis.click()
  await expect(
    productionLogs.getByRole("button", { name: "Load earlier logs" })
  ).toBeVisible()
  await productionLogs.getByRole("button", { name: "Load earlier logs" }).click()
  await expect(productionLogs.getByText("Older retained log")).toBeVisible()
  await page.unroute(logsRoute)
  await page.unroute(targetsRoute)

  const downloadEvent = page.waitForEvent("download")
  await page.getByRole("button", { name: "Download result" }).click()
  const download = await downloadEvent
  expect(download.suggestedFilename()).toBe("browser-success-workflow-results.zip")
  const stream = await download.createReadStream()
  const firstChunk = await new Promise<Buffer>((resolve, reject) => {
    stream.once("data", resolve)
    stream.once("error", reject)
  })
  expect(firstChunk.subarray(0, 2).toString()).toBe("PK")

  await page.goto("/tools/gromacs/new")
  await page.getByLabel("PDB file").setInputFiles({
    buffer: PDB,
    mimeType: "chemical/x-pdb",
    name: "cancel-input.pdb",
  })
  await page.getByLabel(/Display name/).fill("Browser cancellation workflow")
  await page.getByRole("button", { name: "Submit simulation" }).click()
  await expect(page).toHaveURL(/\/tools\/gromacs\/jobs\/[0-9a-f-]+$/)
  const cancelledJobId = page.url().split("/").at(-1)
  if (!cancelledJobId) throw new Error("Cancelled Job ID is missing")
  await page.getByRole("button", { name: "Cancel job" }).click()
  await page.getByRole("button", { name: "Request cancellation" }).click()
  await expect.poll(async () => {
    const response = await page.context().request.get(
      `/api/v1/jobs/${cancelledJobId}`
    )
    return (await response.json() as { state: string }).state
  }).toBe("cancelled")
  await page.getByRole("button", { name: "Refresh" }).click()
  await expect(page.getByText("Cancelled", { exact: true }).first()).toBeVisible({
    timeout: 5_000,
  })
  await expect(page.locator("p", { hasText: "Job updated" }).first()).not.toContainText("ago")

  await expect.poll(async () => (await browserStats()).submit_calls).toBe(2)
  await expect.poll(async () => (await browserStats()).submit_versions).toEqual([7, 7])

  await page.goto("/admin/users")
  await page.setViewportSize({ width: 1024, height: 768 })
  const usersTable = page.getByRole("table")
  expect(
    await usersTable.evaluate(
      (table) => table.scrollWidth <= (table.parentElement?.clientWidth ?? 0)
    )
  ).toBe(true)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
    )
  ).toBe(true)
  await expect(
    page.getByRole("button", { name: "Copy email browser-admin@example.com" })
  ).toBeVisible()
  const createdAtHeader = usersTable.getByRole("columnheader", {
    name: /Created at/,
  })
  await expect(createdAtHeader).toHaveAttribute("aria-sort", "descending")
  await page.getByRole("button", {
    name: "Created at, sorted newest first. Sort oldest first",
  }).click()
  await expect(createdAtHeader).toHaveAttribute("aria-sort", "ascending")
  await page.getByRole("button", {
    name: "Created at, sorted oldest first. Sort newest first",
  }).click()
  await expect(createdAtHeader).toHaveAttribute("aria-sort", "descending")
  expect(
    await usersTable.getByRole("row").nth(1).evaluate(
      (row) => row.getBoundingClientRect().height
    )
  ).toBeGreaterThanOrEqual(60)
  const userActions = page.getByRole("button", {
    name: "Actions for Browser Administrator",
  })
  await expect(page.getByRole("menuitem", { name: "Remove admin" })).toHaveCount(0)
  await userActions.click()
  await expect(page.getByRole("menuitem", { name: "Remove admin" })).toBeVisible()
  await expect(page.getByRole("menuitem", { name: "Disable" })).toBeVisible()
  await expect(page.getByRole("menuitem", { name: "New password link" })).toBeVisible()
  const removeAdmin = page.getByRole("menuitem", { name: "Remove admin" })
  const restingBackground = await removeAdmin.evaluate(
    (item) => getComputedStyle(item).backgroundColor
  )
  await removeAdmin.hover()
  expect(
    await removeAdmin.evaluate((item) => getComputedStyle(item).backgroundColor)
  ).not.toBe(restingBackground)
  await page.keyboard.press("Escape")
  await expect(page.getByRole("menuitem", { name: "Remove admin" })).not.toBeVisible()

  await page.setViewportSize({ width: 360, height: 800 })
  await page.reload()
  expect(
    await usersTable.evaluate(
      (table) => table.scrollWidth > (table.parentElement?.clientWidth ?? 0)
    )
  ).toBe(true)
  expect(
    await page.evaluate(
      () => {
        window.scrollTo({ left: 1_000, top: window.scrollY })
        return window.scrollX
      }
    )
  ).toBe(0)
  await userActions.scrollIntoViewIfNeeded()
  await expect(userActions).toBeVisible()
  await page.setViewportSize({ width: 1024, height: 768 })

  const adminRefresh = page.getByRole("button", { name: "Refresh" })
  await adminRefresh.click()
  await expect(adminRefresh).toHaveAccessibleName("Refreshing…")
  await expect(adminRefresh).toHaveAccessibleName("Refreshed")

  const displayName = page.getByRole("textbox", {
    name: "Display name for browser-admin@example.com",
  })
  await displayName.fill("Browser Admin Renamed")
  await page.getByRole("button", {
    name: "Save display name for browser-admin@example.com",
  }).click()
  await expect(displayName).toHaveValue("Browser Admin Renamed")

  const modalInspectRoute = "**/api/v1/admin/modal"
  await page.route(modalInspectRoute, async (route) => {
    const response = await route.fetch()
    const document = await response.json()
    document.tools = document.tools.map((tool: {
      workload: string
      modal_app_version: Record<string, unknown>
    }) =>
      tool.workload === "gromacs"
        ? {
            ...tool,
            modal_app_version: {
              ...tool.modal_app_version,
              editable: true,
              source: "default",
            },
          }
        : tool
    )
    await route.fulfill({ json: document, response })
  })
  await page.goto("/admin/modal")
  await expect(page.getByText("Default from the configuration file.")).toHaveCount(0)
  const toolsTable = page.getByRole("table")
  expect(
    await toolsTable.evaluate(
      (table) => table.scrollWidth <= (table.parentElement?.clientWidth ?? 0)
    )
  ).toBe(true)
  await expect(
    toolsTable.getByRole("columnheader", { name: "Modal deployment version" })
  ).toHaveCSS("white-space", "nowrap")
  await expect(
    toolsTable.getByRole("cell", {
      name: "GROMACS MD simulation",
      exact: true,
    })
  ).toHaveCSS("text-align", "center")
  expect(
    await toolsTable.getByRole("columnheader").evaluateAll((headers) =>
      headers.every((header) => getComputedStyle(header).textAlign === "center")
    )
  ).toBe(true)
  expect(
    await toolsTable.getByRole("cell").evaluateAll((cells) =>
      cells.every((cell) => getComputedStyle(cell).textAlign === "center")
    )
  ).toBe(true)
  expect(
    await page.getByRole("textbox", {
      name: "Modal app name for GROMACS MD simulation",
      exact: true,
    }).evaluate((input) => input.getBoundingClientRect().width)
  ).toBeLessThan(190)

  const toolUpdateRoute = "**/api/v1/admin/modal/tools/gromacs"
  await page.route(toolUpdateRoute, async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        code: "modal_preflight_failed",
        detail: "Modal could not resolve the requested deployment.",
      }),
      contentType: "application/json",
      status: 400,
    })
  })
  await page.getByRole("spinbutton", {
    name: "Modal deployment version for GROMACS MD simulation",
  }).fill("999999")
  const saveToolSettings = page.getByRole("button", {
    name: "Save Modal settings for GROMACS MD simulation",
  })
  await saveToolSettings.click()
  const toolError = page.getByRole("alert", {
    name: "Could not save GROMACS MD simulation settings",
  })
  await expect(toolError).toBeVisible()
  await expect(toolError).toContainText("Modal deployment version")
  await expect(toolError).toContainText(
    "Modal could not resolve the requested deployment."
  )
  const [errorBox, saveBox] = await Promise.all([
    toolError.boundingBox(),
    saveToolSettings.boundingBox(),
  ])
  expect(errorBox).not.toBeNull()
  expect(saveBox).not.toBeNull()
  expect((errorBox?.y ?? 0) + (errorBox?.height ?? 0)).toBeLessThanOrEqual(
    saveBox?.y ?? 0
  )
  await toolError.getByRole("button", {
    name: "Dismiss GROMACS MD simulation settings error",
  }).click()
  await expect(toolError).toHaveCount(0)
  await page.unroute(toolUpdateRoute)
  await page.unroute(modalInspectRoute)

  await page.getByRole("button", { name: "Open user menu" }).click()
  await expect(page.getByText("Browser Admin Renamed", { exact: true })).toBeVisible()
  await page.getByRole("menuitem", { name: "Sign out" }).click()
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible()
})
