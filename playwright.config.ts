import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { defineConfig } from "@playwright/test"

const browserRoot =
  process.env.BIOMODALS_BROWSER_ROOT ??
  mkdtempSync(path.join(tmpdir(), "biomodals-browser-"))
const frontendPort = Number(
  process.env.BIOMODALS_BROWSER_FRONTEND_PORT ??
    30_000 + (process.pid % 10_000)
)
const backendPort = Number(
  process.env.BIOMODALS_BROWSER_BACKEND_PORT ?? frontendPort + 10_000
)
const browserOrigin =
  process.env.BIOMODALS_BROWSER_ORIGIN ??
  `http://127.0.0.1:${frontendPort}`
process.env.BIOMODALS_BROWSER_ROOT = browserRoot
process.env.BIOMODALS_BROWSER_ORIGIN = browserOrigin
process.env.BIOMODALS_BROWSER_FRONTEND_PORT = String(frontendPort)
process.env.BIOMODALS_BROWSER_BACKEND_PORT = String(backendPort)

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.pw.ts",
  fullyParallel: false,
  workers: 1,
  outputDir: path.join(browserRoot, "test-results"),
  reporter: "line",
  use: {
    acceptDownloads: true,
    baseURL: browserOrigin,
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command:
        `uv run uvicorn --app-dir tests browser_server:app --host 127.0.0.1 --port ${backendPort}`,
      cwd: "../biomodals",
      env: {
        BIOMODALS_BROWSER_ORIGIN: browserOrigin,
        BIOMODALS_BROWSER_ROOT: browserRoot,
      },
      name: "deterministic FastAPI backend",
      reuseExistingServer: false,
      timeout: 120_000,
      url: `http://127.0.0.1:${backendPort}/api/v1/ready`,
    },
    {
      command: "bun run e2e:serve",
      env: {
        BIOMODALS_API_PROXY_TARGET: `http://127.0.0.1:${backendPort}`,
        BIOMODALS_BROWSER_FRONTEND_PORT: String(frontendPort),
        BIOMODALS_PUBLIC_URL: browserOrigin,
      },
      name: "built Vite frontend",
      reuseExistingServer: false,
      timeout: 120_000,
      url: browserOrigin,
    },
  ],
})
