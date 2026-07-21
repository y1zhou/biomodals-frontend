import { afterEach, describe, expect, test } from "bun:test"

import { listAdminUsers, listJobs } from "../src/api/client"

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
