import { afterEach, describe, expect, test } from "bun:test"

import {
  inspectAdminJobLogTargets,
  listAdminUsers,
  listJobs,
  streamAdminJobLogs,
} from "../src/api/client"

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  })
}

describe("cursor collections", () => {
  test("loads every bounded Job page in order", async () => {
    const cursor = "11111111-1111-4111-8111-111111111111"
    const paths: string[] = []
    globalThis.fetch = (async (input) => {
      const path = String(input)
      paths.push(path)
      return path.includes("cursor=")
        ? jsonResponse({ jobs: [{ job_id: "second" }], next_cursor: null })
        : jsonResponse({ jobs: [{ job_id: "first" }], next_cursor: cursor })
    }) as typeof fetch

    const jobs = await listJobs()

    expect(jobs.map((job) => job.job_id)).toEqual(["first", "second"])
    expect(paths).toEqual([
      "/api/v1/jobs?limit=100",
      `/api/v1/jobs?limit=100&cursor=${cursor}`,
    ])
  })

  test("loads every bounded Admin User page", async () => {
    globalThis.fetch = (async () =>
      jsonResponse({
        users: [{ user_id: "first-user" }],
        next_cursor: null,
      })) as typeof fetch

    const users = await listAdminUsers()

    expect(users.map((user) => user.user_id)).toEqual(["first-user"])
  })
})

describe("Administrator Job logs", () => {
  test("loads safe stage selectors without a provider call ID", async () => {
    let requested = ""
    globalThis.fetch = (async (input) => {
      requested = String(input)
      return jsonResponse({
        job_id: "job/one",
        targets: [
          {
            stage_code: "run_production",
            function_name: "production_run_gpu",
            state: "running",
            mode: "live",
            started_at: "2026-07-22T00:00:00Z",
            ended_at: null,
          },
        ],
      })
    }) as typeof fetch

    const result = await inspectAdminJobLogTargets("job/one")

    expect(requested).toBe("/api/v1/admin/jobs/job%2Fone/log-targets")
    expect(result.targets?.[0]?.stage_code).toBe("run_production")
    expect(result.targets?.[0]?.mode).toBe("live")
    expect(result).not.toHaveProperty("modal_call_id")
  })

  test("decodes a streamed response and passes the abort signal through", async () => {
    const encoder = new TextEncoder()
    const encoded = encoder.encode("step α\n")
    let requested = ""
    let requestSignal: AbortSignal | null = null
    globalThis.fetch = (async (input, init) => {
      requested = String(input)
      requestSignal = init?.signal as AbortSignal
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoded.slice(0, encoded.length - 2))
            controller.enqueue(encoded.slice(encoded.length - 2))
            controller.close()
          },
        }),
        { headers: { "Content-Type": "text/plain" } }
      )
    }) as typeof fetch
    const controller = new AbortController()
    const chunks: string[] = []

    await streamAdminJobLogs(
      "job/one",
      "analyze nvt",
      controller.signal,
      (chunk) => chunks.push(chunk)
    )

    expect(requested).toBe(
      "/api/v1/admin/jobs/job%2Fone/logs?stage=analyze+nvt"
    )
    expect(requestSignal).toBe(controller.signal)
    expect(chunks.join("")).toBe("step α\n")
  })

  test("reports a provider stream that fails after it starts", async () => {
    globalThis.fetch = (async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error("Modal log connection failed"))
          },
        }),
        { headers: { "Content-Type": "text/plain" } }
      )) as typeof fetch

    await expect(
      streamAdminJobLogs(
        "job/one",
        "prepare_simulation",
        new AbortController().signal,
        () => undefined
      )
    ).rejects.toThrow("Modal log connection failed")
  })

  test("requests a bounded historical window", async () => {
    let requested = ""
    globalThis.fetch = (async (input) => {
      requested = String(input)
      return new Response("windowed output\n", {
        headers: { "Content-Type": "text/plain" },
      })
    }) as typeof fetch
    const chunks: string[] = []

    await streamAdminJobLogs(
      "job/one",
      "prepare simulation",
      new AbortController().signal,
      (chunk) => chunks.push(chunk),
      {
        since: "2026-07-22T00:00:00.000Z",
        until: "2026-07-22T00:10:00.000Z",
      }
    )

    expect(requested).toBe(
      "/api/v1/admin/jobs/job%2Fone/logs?stage=prepare+simulation&since=2026-07-22T00%3A00%3A00.000Z&until=2026-07-22T00%3A10%3A00.000Z"
    )
    expect(chunks.join("")).toBe("windowed output\n")
  })
})
