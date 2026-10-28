import { spawn, type ChildProcess } from "node:child_process"
import { once } from "node:events"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { expect, test } from "@playwright/test"

const backend = `http://127.0.0.1:${process.env.BIOMODALS_BROWSER_BACKEND_PORT}`
const vh = "QVQLVQSGAEVKKPGASVKVSCKASGYTFTSYAMHWVRQAPGQGLEWMGWINPNSGGTNYAQKFQGRVTMTRDTSISTAYMELSRLRSDDTAVYYCARGGYFDYWGQGTLVTVSS"
let server: ChildProcess | undefined
let output = ""

async function stopBackend() {
  if (server && server.exitCode === null && server.signalCode === null) {
    const stopped = once(server, "exit")
    server.kill("SIGTERM")
    await stopped
  }
  server = undefined
}

async function startBackend(mode: string, fails = false) {
  await stopBackend()
  output = ""
  server = spawn("uv", ["run", "--no-sync", "uvicorn", "--app-dir", "tests", "local_tools_server:app", "--host", "127.0.0.1", "--port", process.env.BIOMODALS_BROWSER_BACKEND_PORT!], {
    cwd: path.resolve(import.meta.dirname, "../../biomodals"),
    env: { ...process.env, BIOMODALS_BROWSER_CREDENTIALS: mode },
    stdio: ["ignore", "pipe", "pipe"],
  })
  server.stdout!.on("data", (data) => { output += data.toString() })
  server.stderr!.on("data", (data) => { output += data.toString() })
  server.on("error", (error) => { output += error.message })
  await expect.poll(async () => {
    if (server!.exitCode !== null || server!.signalCode !== null) {
      if (fails) return true
      throw new Error(`API failed to start in ${mode} mode:\n${output}`)
    }
    try {
      const response = await fetch(`${backend}/api/v1/ready`)
      if (response.ok && fails) throw new Error("Rejected credentials unexpectedly reached readiness")
      return response.ok && !fails
    } catch (error) {
      if (error instanceof Error && error.message.includes("unexpectedly")) throw error
      return false
    }
  }, { timeout: 20_000, intervals: [100, 250] }).toBe(true)
  if (fails) expect(output).toContain("Fixture rejected provider preflight")
}

test.afterAll(stopBackend)

test("credential-free startup, analysis, guards and credentialed restart", async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  await startBackend("absent")
  const status = async () => (await page.request.get(`${backend}/__test/status`)).json()
  const original = await status()
  expect(original.provider_calls).toEqual([])
  expect(original.reconciler_running).toBe(false)
  const schema = await (await page.request.get("/openapi.json")).json()
  expect(schema.paths["/api/v1/capabilities"].get.security).toBeUndefined()
  expect((await page.request.get("/api/v1/antibody-sequence-analysis/options")).status()).toBe(401)
  expect(await (await page.request.get("/api/v1/capabilities")).json()).toEqual({ remote_execution_enabled: false })

  let releaseCapabilities!: () => void
  const pendingCapabilities = new Promise<void>((resolve) => { releaseCapabilities = resolve })
  await page.route("**/api/v1/capabilities", async (route) => {
    await pendingCapabilities
    await route.continue()
  })
  await page.goto("/")
  await expect(page.getByText("Checking tool availability…", { exact: true })).toBeVisible()
  await expect(page.getByRole("link", { name: "Antibody sequence analysis", exact: true })).toBeVisible()
  await expect(page.getByRole("link", { name: "GROMACS MD simulation", exact: true })).toHaveCount(0)
  releaseCapabilities()
  await expect(page.getByText("Checking tool availability…", { exact: true })).toHaveCount(0)
  await page.unroute("**/api/v1/capabilities")
  await expect(page.getByRole("link", { name: "Antibody sequence analysis", exact: true })).toBeVisible()
  await expect(page.getByRole("link", { name: "GROMACS MD simulation", exact: true })).toHaveCount(0)
  await page.getByRole("link", { name: "Antibody sequence analysis", exact: true }).click()
  await expect(page).toHaveURL(/\/login\?returnTo=/)
  await page.getByLabel("Email", { exact: true }).fill("local-admin@example.com")
  await page.getByLabel("Password", { exact: true }).fill(["local", "tools", "e2e", "passphrase"].join("-"))
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await expect(page).toHaveURL(/\/tools\/antibody-sequence-analysis$/)
  await expect(page.getByRole("link", { name: "My Jobs", exact: true })).toHaveCount(0)
  await page.getByLabel("Group 1 FASTA", { exact: true }).fill(`>local-domain\n${vh}`)
  await page.getByRole("button", { name: "Analyze sequences", exact: true }).click()
  const results = page.getByRole("region", { name: "Analysis results: Group 1", exact: true })
  await expect(results.getByRole("row").filter({ hasText: "local-domain" })).toBeVisible()
  await results.getByRole("button", { name: "VH", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "local-domain · VH", exact: true })
  await expect(dialog.getByRole("heading", { name: /^Numbered domain/ })).toBeVisible()
  await dialog.getByLabel("Numbering scheme").selectOption("kabat")
  await expect(dialog.getByRole("heading", { name: /^Numbered domain/ })).toBeVisible()
  await page.keyboard.press("Escape")
  const downloaded = page.waitForEvent("download")
  await results.getByRole("button", { name: "Download CSV" }).click()
  const csvPath = testInfo.outputPath("local-analysis.csv")
  await (await downloaded).saveAs(csvPath)
  expect(await readFile(csvPath, "utf8")).toContain(vh)
  await testInfo.attach("local-analysis.csv", { path: csvPath, contentType: "text/csv" })

  // Exercise every registered remote HTTP operation, not just its visible card.
  const gated: string[] = []
  for (const [route, operations] of Object.entries(schema.paths)) {
    if (!/^\/api\/v1\/(gromacs|alphafold3|humanization|nanobody-humanization|protein-optimization|jobs|admin\/modal)(\/|$)/.test(route)) continue
    const url = route.replace(/\{job_id\}/g, original.job.job_id).replace(/\{tool\}/g, "gromacs").replace(/\{[^}]+\}/g, "fixture")
    for (const method of Object.keys(operations as object)) {
      if (!["get", "post", "delete", "patch", "put"].includes(method)) continue
      const response = await page.request.fetch(url, { method: method.toUpperCase(), ...(method === "get" ? {} : { data: {} }) })
      expect(response.status(), `${method} ${route}`).toBe(503)
      expect((await response.json()).code, `${method} ${route}`).toBe("remote_execution_unavailable")
      expect((operations as Record<string, { responses: object }>)[method].responses).toHaveProperty("503")
      gated.push(`${method.toUpperCase()} ${route}`)
    }
  }
  expect(gated.length).toBeGreaterThan(30)
  for (const url of ["/tools/gromacs", "/tools/alphafold3/new", "/tools/humanization", "/tools/nanobody-humanization/new", "/tools/protein-optimization/new", "/jobs", `/tools/gromacs/jobs/${original.job.job_id}`, "/admin/modal"]) {
    await page.goto(url)
    await expect(page.getByRole("heading", { name: "Remote tools are unavailable", exact: true })).toBeVisible()
    await expect(page.getByRole("link", { name: "Back to tools", exact: true })).toBeVisible()
  }
  await page.goto("/admin/users")
  await expect(page.getByRole("heading", { name: "Users", exact: true })).toBeVisible()
  await expect(page.getByRole("link", { name: "Modal", exact: true })).toHaveCount(0)
  expect((await page.request.get("/api/v1/admin/storage")).ok()).toBe(true)
  await page.getByRole("link", { name: "Storage", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Storage", exact: true })).toBeVisible()

  const local = await status()
  expect(local.job).toEqual(original.job)
  expect(local.provider_calls).toEqual([])
  expect(local.reconciler_running).toBe(false)

  for (const mode of ["id-only", "secret-only", "whitespace"]) {
    await startBackend(mode)
    expect(await (await page.request.get("/api/v1/capabilities")).json()).toEqual({ remote_execution_enabled: false })
    expect(await status()).toEqual(local)
  }
  await startBackend("rejected", true)
  await startBackend("complete")
  expect(await (await page.request.get("/api/v1/capabilities")).json()).toEqual({ remote_execution_enabled: true })
  expect(await (await page.request.get("/openapi.json")).json()).toEqual(schema)
  await expect.poll(async () => (await status()).provider_calls).toContain("poll_root")
  expect((await status()).reconciler_running).toBe(true)
  await page.goto("/")
  await expect(page.getByRole("link", { name: "GROMACS MD simulation", exact: true })).toBeVisible()
  await expect(page.getByRole("link", { name: "My Jobs", exact: true })).toBeVisible()
  await page.getByRole("link", { name: "My Jobs", exact: true }).click()
  await expect(page.getByText("Retained remote Job", { exact: true })).toBeVisible()

  // A failed capability refresh must not advertise a stale enabled value.
  await page.goto("/")
  await expect(page.getByRole("link", { name: "GROMACS MD simulation", exact: true })).toBeVisible()
  await page.route("**/api/v1/capabilities", (route) => route.fulfill({ status: 503, json: { detail: "Fixture lookup failed" } }))
  await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")))
  await expect(page.getByRole("button", { name: "Retry tool availability", exact: true })).toBeVisible()
  await expect(page.getByRole("link", { name: "GROMACS MD simulation", exact: true })).toHaveCount(0)
  await expect(page.getByRole("link", { name: "Antibody sequence analysis", exact: true })).toBeVisible()
  await page.unroute("**/api/v1/capabilities")
  await page.getByRole("button", { name: "Retry tool availability", exact: true }).click()
  await expect(page.getByRole("link", { name: "GROMACS MD simulation", exact: true })).toBeVisible()

  // Availability refreshes must preserve an open draft, including its file.
  await page.goto("/tools/gromacs/new")
  await page.getByLabel("PDB file", { exact: true }).setInputFiles({
    name: "draft.pdb", mimeType: "chemical/x-pdb", buffer: Buffer.from("HEADER    DRAFT\nEND\n"),
  })
  await page.locator("#display-name").fill("Unsubmitted experiment")
  await page.locator("#simulation-time").fill("25")
  await page.route("**/api/v1/capabilities", (route) => route.fulfill({ status: 503, json: { detail: "Fixture lookup failed" } }))
  await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")))
  await expect(page.getByRole("button", { name: "Retry tool availability", exact: true })).toBeVisible()
  await expect(page.locator("#display-name")).toBeHidden()
  await page.unroute("**/api/v1/capabilities")
  await page.getByRole("button", { name: "Retry tool availability", exact: true }).click()
  await expect(page.locator("#display-name")).toHaveValue("Unsubmitted experiment")
  await expect(page.locator("#simulation-time")).toHaveValue("25")
  await expect(page.getByRole("definition").filter({ hasText: "draft.pdb" })).toBeVisible()
  const draftFile = await page.getByLabel("PDB file", { exact: true }).evaluate((input: HTMLInputElement) => input.files?.[0]?.text())
  expect(draftFile).toBe("HEADER    DRAFT\nEND\n")

  // Keep the tab open across the API restart: a real disabled response refreshes it.
  await page.getByRole("link", { name: "My Jobs", exact: true }).click()
  await expect(page.getByText("Retained remote Job", { exact: true })).toBeVisible()
  await startBackend("absent")
  const refresh = page.waitForResponse("**/api/v1/capabilities")
  await page.getByRole("button", { name: "Refresh", exact: true }).click()
  await refresh
  await expect(page.getByRole("heading", { name: "Remote tools are unavailable", exact: true })).toBeVisible()
  expect((await status()).provider_calls).toEqual([])
  const report = testInfo.outputPath("local-tools-report.json")
  await writeFile(report, JSON.stringify({ gated, local, restored: true, draftPreserved: true, final: await status() }, null, 2))
  await testInfo.attach("local-tools-report.json", { path: report, contentType: "application/json" })
})
