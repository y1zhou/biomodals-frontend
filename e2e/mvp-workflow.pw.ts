import { readFile } from "node:fs/promises"
import path from "node:path"

import { expect, test, type Locator } from "@playwright/test"

const PASSWORD = "correct horse battery staple"
const PDB = Buffer.from(
  "ATOM      1  CA  ALA A   1       0.000   0.000   0.000  1.00 20.00           C\nEND\n"
)

interface BrowserStats {
  password_link: string
  secondary_password_link: string
  preflight_versions: number[]
  submit_calls: number
  submit_versions: number[]
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
  browser,
  context,
  page,
}) => {
  test.setTimeout(60_000)
  await page.addInitScript(() => Object.defineProperty(crypto, "randomUUID", { value: undefined }))
  const origin = process.env.BIOMODALS_BROWSER_ORIGIN
  if (!origin) throw new Error("BIOMODALS_BROWSER_ORIGIN is missing")
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin,
  })
  await expect.poll(async () => (await browserStats()).password_link).not.toBe("")
  await expect.poll(async () => (await browserStats()).preflight_versions.slice(0, 3)).toEqual([7, 1, 1])
  const baseline = await browserStats()
  const setup = baseline.password_link

  await page.goto(setup)
  await page.getByLabel("New password").fill(PASSWORD)
  await page.getByLabel("Confirm password").fill(PASSWORD)
  await page.getByRole("button", { name: "Set password" }).click()
  await expect(page).toHaveURL(`${origin}/`)

  const secondaryContext = await browser.newContext()
  const secondaryPage = await secondaryContext.newPage()
  await expect
    .poll(async () => (await browserStats()).secondary_password_link)
    .not.toBe("")
  await secondaryPage.goto((await browserStats()).secondary_password_link)
  await secondaryPage.getByLabel("New password").fill(PASSWORD)
  await secondaryPage.getByLabel("Confirm password").fill(PASSWORD)
  await secondaryPage.getByRole("button", { name: "Set password" }).click()
  await expect(secondaryPage).toHaveURL(`${origin}/`)
  await secondaryContext.close()

  await page.getByRole("button", { name: "Open user menu" }).click()
  await page.getByRole("menuitem", { name: "Sign out" }).click()
  await page.getByRole("link", { name: "Sign in" }).click()
  const login = page.getByRole("main")
  await login.getByLabel("Email").fill("browser-admin@example.com")
  await login.getByLabel("Password").fill(PASSWORD)
  await login.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(`${origin}/`)

  await page.setViewportSize({ width: 360, height: 800 })
  await expect(page.getByRole("link", { name: "API Docs" })).toHaveAttribute(
    "href",
    "/docs"
  )
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
  await page.setViewportSize({ width: 1280, height: 400 })
  const simulationTime = page.getByRole("spinbutton", {
    name: "Simulation time (ns)",
  })
  await simulationTime.scrollIntoViewIfNeeded()
  await page.getByLabel(/Display name/).focus()
  await simulationTime.hover()
  const unfocusedScrollY = await page.evaluate(() => window.scrollY)
  await page.mouse.wheel(0, 200)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(
    unfocusedScrollY
  )
  await expect(simulationTime).toHaveValue("5")

  await simulationTime.focus()
  await simulationTime.hover()
  const focusedScrollY = await page.evaluate(() => window.scrollY)
  await page.mouse.wheel(0, -100)
  await expect(simulationTime).toHaveValue("6")
  expect(await page.evaluate(() => window.scrollY)).toBe(focusedScrollY)
  expect(
    await simulationTime.evaluate((input) =>
      input.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          ctrlKey: true,
          deltaY: -100,
        })
      )
    )
  ).toBe(true)
  await expect(simulationTime).toHaveValue("6")

  await page.mouse.move(8, 8)
  const outsideScrollY = await page.evaluate(() => window.scrollY)
  await page.mouse.wheel(0, -200)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(
    outsideScrollY
  )
  await expect(simulationTime).toHaveValue("6")
  await simulationTime.fill("5")
  await page.setViewportSize({ width: 1280, height: 720 })

  await page.getByLabel("PDB file").setInputFiles({
    buffer: PDB,
    mimeType: "chemical/x-pdb",
    name: "browser-input.pdb",
  })
  await page.getByLabel(/Display name/).fill("Browser success workflow")
  const gromacsSubmissionRoute = "**/api/v1/gromacs/jobs"
  let releaseSubmission = () => undefined
  const heldSubmission = new Promise<void>((resolve) => {
    releaseSubmission = resolve
  })
  await page.route(gromacsSubmissionRoute, async (route) => {
    await heldSubmission
    await route.continue()
  })
  const submit = page.getByRole("button", { name: "Submit simulation" })
  await submit.evaluate((button: HTMLButtonElement) => {
    button.click()
    button.click()
  })
  await expect(page.getByText("Uploading input")).toBeVisible()
  releaseSubmission()

  await expect(page).toHaveURL(/\/tools\/gromacs\/jobs\/[0-9a-f-]+$/)
  await page.unroute(gromacsSubmissionRoute)
  const completedJobId = page.url().split("/").at(-1)
  if (!completedJobId) throw new Error("Completed Job ID is missing")
  await expect(page.locator("details", { hasText: "Logs" })).toHaveCount(0)
  await expect(
    page.getByText("Click a started remote stage to view its logs.")
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
  await expect.poll(async () => (await browserStats()).submit_calls - baseline.submit_calls).toBe(1)
  await expect.poll(async () => (await browserStats()).submit_versions.slice(baseline.submit_versions.length)).toEqual([7])
  const statusMetadata = page.locator("p", { hasText: "Job updated" }).first()
  await expect(statusMetadata).toContainText(/Last checked \d+s ago/)
  const stagesTable = page.getByRole("table", { name: "Execution stages" })
  expect(
    await stagesTable.evaluate(
      (table) => table.scrollWidth <= (table.parentElement?.clientWidth ?? 0)
    )
  ).toBe(true)
  await expect(page.getByRole("row", { name: /Prepare simulation/ })).toBeVisible()
  await expect(page.getByRole("row", { name: /Prepare result/ })).toBeVisible()
  await page.waitForTimeout(1_100)
  const refresh = page.getByRole("button", { name: "Refresh" })
  await refresh.click()
  await expect(page.getByRole("button", { name: "Refreshed" })).toBeVisible()
  for (const stage of ["Analyze NVT", "Analyze NPT", "Run production"]) {
    await expect(page.getByRole("row", { name: new RegExp(stage) })).toContainText(
      "Running",
      { timeout: 5_000 }
    )
  }
  await page.waitForTimeout(1_600)
  await refresh.click()
  await expect(page.getByRole("button", { name: "Refreshed" })).toBeVisible()
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
  await expect(page.getByText("Trajectory overview", { exact: true })).toBeVisible()
  for (const title of ["RMSD", "Radius of gyration", "RMSF"]) {
    const plot = page.getByRole("img", { name: `${title} production trajectory plot`, exact: true })
    await expect(plot).toBeVisible()
    await expect.poll(() => plot.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  }
  await expect(statusMetadata).not.toContainText("ago")
  await prepareStage.click()
  await expect(prepareLogs.getByText("Fetched logs")).toBeVisible()
  await expect(prepareLogs.getByText("Browser test remote log")).toBeVisible()
  await expect.poll(async () => (await browserStats()).log_fetches - baseline.log_fetches).toBe(2)
  await prepareStage.click()
  await expect(prepareLogs).toHaveCount(0)
  await prepareStage.click()
  await expect(prepareLogs.getByText("Fetched logs")).toBeVisible()
  await expect(prepareLogs.getByText("Browser test remote log")).toBeVisible()
  await expect.poll(async () => (await browserStats()).log_fetches - baseline.log_fetches).toBe(2)

  const historicalEnd = Date.now() - 60_000
  const historicalStart = historicalEnd - 20 * 60_000
  let analysisTarget = ""
  const targetsRoute = `**/api/v1/jobs/${completedJobId}/log-targets?*`
  const logsRoute = `**/api/v1/jobs/${completedJobId}/logs?*`
  await page.route(targetsRoute, async (route) => {
    const response = await route.fetch()
    const body = await response.json() as {
      job_id: string
      targets: Array<{
        ended_at: string | null
        stage_code: string
        started_at: string
        target_id: string
      }>
    }
    for (const target of body.targets) {
      if (target.stage_code !== "analyze_production") continue
      analysisTarget = target.target_id
      target.started_at = new Date(historicalStart).toISOString()
      target.ended_at = new Date(historicalEnd).toISOString()
    }
    await route.fulfill({ response, json: body })
  })
  await page.route(logsRoute, async (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.get("target") !== analysisTarget) {
      await route.continue()
      return
    }
    const since = Date.parse(url.searchParams.get("since") ?? "")
    await route.fulfill({
      contentType: "application/x-ndjson",
      status: 200,
      body: since < historicalEnd - 10 * 60_000
        ? `${JSON.stringify({
            timestamp: "2026-07-22T10:00:00Z",
            message: "Older retained log\n",
            source: "stdout",
          })}\n`
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
  expect(download.suggestedFilename()).toBe("result.zip")
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

  await expect.poll(async () => (await browserStats()).submit_calls - baseline.submit_calls).toBe(2)
  await expect.poll(async () => (await browserStats()).submit_versions.slice(baseline.submit_versions.length)).toEqual([7, 7])

  await page.goto("/jobs?tool=gromacs")
  await page.getByRole("button", { name: "Filter jobs by tool (active)" }).click()
  const toolFilter = page.getByRole("combobox", { name: "Filter jobs by tool" })
  await toolFilter.click()
  const selectPopup = page.locator('[data-slot="select-popup"]')
  await expect(selectPopup).toBeVisible()
  const [triggerRadius, popupRadius] = await Promise.all([
    toolFilter.evaluate((element) => getComputedStyle(element).borderRadius),
    selectPopup.evaluate((element) => getComputedStyle(element).borderRadius),
  ])
  expect(popupRadius).toBe(triggerRadius)
  await page.getByRole("option", { name: "All tools" }).click()
  await expect(page).toHaveURL(`${origin}/jobs`)

  await page.getByRole("button", {
    name: "Filter jobs by creation date",
  }).click()
  const datePicker = page.getByRole("button", {
    name: "Choose creation date",
  })
  await datePicker.click()
  const datePickerPopup = page.getByRole("dialog", {
    name: "Choose creation date calendar",
  })
  await expect(datePickerPopup).toBeVisible()
  const [dateTriggerRadius, datePopupRadius] = await Promise.all([
    datePicker.evaluate((element) => getComputedStyle(element).borderRadius),
    datePickerPopup.evaluate((element) => getComputedStyle(element).borderRadius),
  ])
  expect(datePopupRadius).toBe(dateTriggerRadius)
  await expect(
    datePickerPopup.getByRole("button", { name: "Previous month" })
  ).toBeVisible()
  const monthYearPicker = datePickerPopup.getByRole("button", {
    name: "Choose month and year",
  })
  await monthYearPicker.click()
  await datePickerPopup.getByRole("spinbutton", { name: "Jump to year" }).fill(
    "2012"
  )
  await datePickerPopup
    .getByRole("group", { name: "Choose a month" })
    .getByRole("button", { name: "Jan", exact: true })
    .click()
  await expect(monthYearPicker).toContainText("January 2012")
  const januaryFirst = datePickerPopup.locator('[data-date="2012-01-01"]')
  await expect(januaryFirst).toBeFocused()
  await expect(
    datePickerPopup.locator('[data-slot="calendar-day"][tabindex="0"]')
  ).toHaveCount(1)
  await page.keyboard.press("ArrowLeft")
  await expect(
    datePickerPopup.locator('[data-date="2011-12-31"]')
  ).toBeFocused()
  await expect(monthYearPicker).toContainText("December 2011")
  await page.keyboard.press("ArrowRight")
  await expect(januaryFirst).toBeFocused()
  await expect(monthYearPicker).toContainText("January 2012")
  await page.keyboard.press("ArrowDown")
  const januaryEighth = datePickerPopup.locator('[data-date="2012-01-08"]')
  await expect(januaryEighth).toBeFocused()
  await januaryEighth.click()
  await expect(page).toHaveURL(/created=\d{4}-\d{2}-\d{2}/)
  await datePicker.click()
  await datePickerPopup.getByRole("button", { name: "Clear" }).click()
  await expect(page).toHaveURL(`${origin}/jobs`)

  await datePicker.click()
  await monthYearPicker.click()
  await datePickerPopup.getByRole("spinbutton", { name: "Jump to year" }).fill(
    "1"
  )
  await datePickerPopup
    .getByRole("group", { name: "Choose a month" })
    .getByRole("button", { name: "Jan", exact: true })
    .click()
  const firstSupportedDate = datePickerPopup.locator(
    '[data-date="0001-01-01"]'
  )
  await expect(firstSupportedDate).toBeFocused()
  await expect(
    datePickerPopup.getByRole("button", { name: "Previous month" })
  ).toBeDisabled()
  await expect(
    datePickerPopup.locator('[data-selectable="false"]').first()
  ).toBeDisabled()
  await page.keyboard.press("ArrowLeft")
  await expect(firstSupportedDate).toBeFocused()

  await monthYearPicker.click()
  await datePickerPopup.getByRole("spinbutton", { name: "Jump to year" }).fill(
    "9999"
  )
  await datePickerPopup
    .getByRole("group", { name: "Choose a month" })
    .getByRole("button", { name: "Dec", exact: true })
    .click()
  await expect(
    datePickerPopup.getByRole("button", { name: "Next month" })
  ).toBeDisabled()
  await page.keyboard.press("Escape")

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
      tool: string
      modal_app_version: Record<string, unknown>
    }) =>
      tool.tool === "gromacs"
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
  const toolsTableWidth = await toolsTable.evaluate((table) => ({
    client: table.parentElement?.clientWidth ?? 0,
    scroll: table.scrollWidth,
  }))
  expect(toolsTableWidth.scroll).toBeLessThanOrEqual(toolsTableWidth.client)
  const toolHeaderRows = toolsTable.locator("thead tr")
  await expect(toolHeaderRows).toHaveCount(2)
  await expect(
    toolsTable.getByRole("columnheader", { name: "Tool", exact: true })
  ).toHaveAttribute("rowspan", "2")
  await expect(
    toolsTable.getByRole("columnheader", {
      name: "Active jobs / active job limit",
      exact: true,
    })
  ).toHaveAttribute("rowspan", "2")
  await expect(
    toolsTable.getByRole("columnheader", { name: "Modal", exact: true })
  ).toHaveAttribute("colspan", "2")
  await expect(
    toolsTable.getByRole("columnheader", { name: "Save changes" })
  ).toHaveCount(0)
  await expect(
    toolsTable.getByRole("columnheader", { name: "Deployment version" })
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
  const toolsSection = page
    .getByRole("heading", { name: "Tools", exact: true })
    .locator("..")
  const saveToolSettings = toolsSection.getByRole("button", {
    name: "Save",
    exact: true,
  })
  const activeJobLimit = page.getByRole("spinbutton", {
    name: "Active job limit for GROMACS MD simulation",
  })
  expect(await toolsTable.locator("colgroup col").count()).toBe(4)
  expect(await toolsTable.getByRole("columnheader").count()).toBe(5)
  const restoreAllTools = toolsSection.getByRole("button", {
    name: "Restore all to defaults",
  })
  await expect(restoreAllTools).toBeVisible()
  expect(
    await activeJobLimit.evaluate(
      (input) => (input.closest("td") as HTMLTableCellElement | null)?.cellIndex
    )
  ).toBe(1)
  const jobLogAccess = page.getByRole("checkbox", {
    name: "Allow Job owners to view logs for GROMACS MD simulation",
  })
  const jobLogAccessToggle = jobLogAccess.locator("xpath=ancestor::tr").locator(
    '[data-slot="job-log-access-toggle"]'
  )
  const jobLogAccessTrack = jobLogAccessToggle.locator(
    '[data-slot="job-log-access-track"]'
  )
  const jobLogAccessThumb = jobLogAccessToggle.locator(
    '[data-slot="job-log-access-thumb"]'
  )
  await expect(jobLogAccess).toBeChecked()
  expect(
    await jobLogAccessThumb.evaluate(
      (element) => getComputedStyle(element).transitionProperty
    )
  ).toContain("transform")
  await expect(page.getByRole("tooltip")).toHaveCount(0)
  await jobLogAccessToggle.hover()
  await expect(page.getByRole("tooltip")).toHaveText("Job owners")
  await expect(jobLogAccessTrack).not.toHaveCSS(
    "background-color",
    "rgb(0, 0, 0)"
  )
  const ownerThumbX = await jobLogAccessThumb.evaluate(
    (element) => element.getBoundingClientRect().x
  )
  const ownerIconX = await jobLogAccessToggle.locator(
    '[data-slot="job-log-access-icon"]'
  ).evaluate((element) => element.getBoundingClientRect().x)
  expect(ownerThumbX).toBeLessThan(ownerIconX)
  await jobLogAccessToggle.click()
  await expect(jobLogAccess).not.toBeChecked()
  await restoreAllTools.click()
  const restoreAllDialog = page.getByRole("alertdialog", {
    name: "Restore all Tool settings?",
  })
  await expect(restoreAllDialog).toContainText(
    "This removes every administrator override"
  )
  await restoreAllDialog.getByRole("button", { name: "Cancel" }).click()
  await expect(restoreAllDialog).not.toBeVisible()
  await jobLogAccessToggle.hover()
  await expect(page.getByRole("tooltip")).toHaveText("Admins only")
  await expect(jobLogAccessTrack).toHaveCSS(
    "background-color",
    "rgb(0, 0, 0)"
  )
  const adminThumbX = await jobLogAccessThumb.evaluate(
    (element) => element.getBoundingClientRect().x
  )
  const adminIconX = await jobLogAccessToggle.locator(
    '[data-slot="job-log-access-icon"]'
  ).evaluate((element) => element.getBoundingClientRect().x)
  expect(adminThumbX).toBeGreaterThan(adminIconX)
  await saveToolSettings.click()
  await expect(saveToolSettings).toBeDisabled()
  await page.getByRole("button", {
    name: "Restore Job log access for GROMACS MD simulation to its default",
  }).click()
  await expect(jobLogAccess).toBeChecked()

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
  const modalDeploymentVersion = page.getByRole("spinbutton", {
    name: "Modal deployment version for GROMACS MD simulation",
  })
  await expect(modalDeploymentVersion).toBeEnabled()
  await modalDeploymentVersion.fill("999999")
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
  await page.keyboard.press("Escape")

  // Continue the same real offline Job, then chain and branch independently.
  const sourceResponse = await context.request.get(`/api/v1/jobs/${completedJobId}`)
  const originalSource = await sourceResponse.json()
  const beforeContinuations = (await browserStats()).submit_calls
  async function continueProduction(source: string, additional: number, name: string) {
    await page.goto(`/tools/gromacs/jobs/${source}`)
    await page.getByRole("link", { name: "Continue production", exact: true }).click()
    await page.getByLabel("Additional production time (ns)", { exact: true }).fill(String(additional))
    await page.getByLabel("Job name (optional)", { exact: true }).fill(name)
    await page.getByRole("button", { name: "Submit continuation", exact: true }).click()
    await expect(page).toHaveURL(/\/tools\/gromacs\/jobs\/[0-9a-f-]+$/)
    return page.url().split("/").at(-1)!
  }
  async function completed(id: string) {
    await expect.poll(async () => {
      const response = await context.request.get(`/api/v1/jobs/${id}`)
      return (await response.json()).state
    }, { timeout: 15_000, intervals: [500] }).toBe("succeeded")
  }
  const firstContinuation = await continueProduction(completedJobId, 250, "Browser continuation")
  await completed(firstContinuation)
  await page.getByRole("button", { name: "Refresh", exact: true }).click()
  const continuationStages = page.getByRole("table", { name: "Execution stages" })
  await expect(continuationStages.getByRole("row")).toHaveCount(5)
  await expect(continuationStages).not.toContainText("Analyze NVT")
  await expect(continuationStages).not.toContainText("Analyze NPT")
  await expect(page.getByRole("img", { name: "RMSD production trajectory plot", exact: true })).toBeVisible()
  await page.getByRole("link", { name: "Continue production", exact: true }).click()
  await expect(page.getByText("255 ns", { exact: true })).toBeVisible()
  await expect(page.getByRole("link", { name: "View its parent job" })).toHaveAttribute("href", `/tools/gromacs/jobs/${completedJobId}`)
  const chained = await continueProduction(firstContinuation, 1, "Browser chained continuation")
  const sibling = await continueProduction(completedJobId, 1, "Browser sibling continuation")
  await Promise.all([completed(chained), completed(sibling)])
  const chainedInfo = await context.request.get(`/api/v1/gromacs/jobs/${chained}/continuation`)
  expect(await chainedInfo.json()).toMatchObject({ simulation_time_ns: 256, parent_job_id: firstContinuation, eligible: true })
  const unchangedSource = await context.request.get(`/api/v1/jobs/${completedJobId}`)
  expect(await unchangedSource.json()).toEqual(originalSource)
  await expect.poll(async () => (await browserStats()).submit_calls - beforeContinuations).toBe(3)

  await page.goto("/jobs")
  await expect(page.getByText("Browser success workflow", { exact: true })).toBeVisible()
  await context.clearCookies()
  await page.getByRole("button", { name: "Refresh" }).click()
  const reauthentication = page.getByRole("dialog", { name: "Sign in again" })
  await expect(reauthentication).toBeVisible()
  await reauthentication.getByLabel("Email").fill("browser-user@example.com")
  await reauthentication.getByLabel("Password").fill(PASSWORD)
  await reauthentication.getByRole("button", { name: "Sign in and return" }).click()
  await expect(reauthentication).not.toBeVisible()
  await expect(page.getByRole("heading", { name: "No jobs yet" })).toBeVisible()
  await expect(page.getByText("Browser success workflow", { exact: true })).toHaveCount(0)

  await page.getByRole("button", { name: "Open user menu" }).click()
  await expect(page.getByText("Browser Regular User", { exact: true })).toBeVisible()
  await page.getByRole("menuitem", { name: "Sign out" }).click()
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible()
})
