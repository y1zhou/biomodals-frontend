import { expect, test } from "bun:test"
import { QueryClient } from "@tanstack/react-query"
import { discardJobQueries, jobKey, jobListKey } from "../src/jobs"
import { ApiError } from "../src/api/client"
import { shouldRotateIdempotencyKey, submissionErrorMessage } from "../src/gromacs"

test("deleted submission is a permanent rejection without idempotency key rotation", () => {
  const error = new ApiError(409, { code: "job_deleted", detail: "Job was deleted" })
  expect(shouldRotateIdempotencyKey(error)).toBe(false)
  expect(submissionErrorMessage(error, false)).toContain("will not create a replacement job")
})

test("accepted deletion clears scoped reads and history without losing another Job or public options", async () => {
  const client = new QueryClient()
  const removed = "removed-job"
  const kept = { job_id: "kept-job" }
  client.setQueryData(jobListKey, [{ job_id: removed }, kept])
  for (const key of [jobKey(removed), ["jobs", removed, "logs"], ["humanization", "selection", removed, { offset: 50 }], ["humanization", "parent-inputs", "owner", removed], ["alphafold3-cif", "owner", removed], ["gromacs-continuation", "owner", removed]]) client.setQueryData(key, { private: true })
  client.setQueryData(jobKey(kept.job_id), kept)
  client.setQueryData(["humanization", "options"], { max_pairs: 100 })
  await discardJobQueries(client, removed)
  expect(client.getQueryData(jobListKey)).toEqual([kept])
  expect(client.getQueryState(jobListKey)?.isInvalidated).toBe(true)
  expect(client.getQueryCache().findAll({ predicate: ({ queryKey }) => queryKey.includes(removed) })).toEqual([])
  expect(client.getQueryData(jobKey(kept.job_id))).toEqual(kept)
  expect(client.getQueryData(["humanization", "options"])).toEqual({ max_pairs: 100 })
  client.clear()
})

test("late in-flight history and private reads cannot restore a deleted Job", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const result = Promise.withResolvers<{ job_id: string }[]>()
  const detail = Promise.withResolvers<{ job_id: string }>()
  let aborted = false
  const historyRead = client.fetchQuery({ queryKey: jobListKey, queryFn: () => result.promise }).catch(() => undefined)
  const detailRead = client.fetchQuery({ queryKey: jobKey("deleted"), queryFn: ({ signal }) => { signal.addEventListener("abort", () => { aborted = true }); return detail.promise } }).catch(() => undefined)
  await discardJobQueries(client, "deleted")
  result.resolve([{ job_id: "deleted" }])
  detail.resolve({ job_id: "deleted" })
  await Promise.all([historyRead, detailRead])
  expect(aborted).toBe(true)
  expect(client.getQueryData(jobKey("deleted"))).toBeUndefined()
  expect(client.getQueryData(jobListKey)).toBeUndefined()
  client.clear()
})
