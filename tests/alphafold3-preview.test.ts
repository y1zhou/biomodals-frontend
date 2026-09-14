import { expect, test } from "bun:test"
import { ApiError } from "../src/api/client"
import { canRetryPreview } from "../src/alphafold3-preview"

test("preview retry distinguishes transient reads from fixed source failures", () => {
  for (const error of [new TypeError("Failed to fetch"), new ApiError(503), new ApiError(409, { code: "result_not_cached" }), new ApiError(429)]) {
    expect(canRetryPreview(error)).toBe(true)
  }
  for (const code of ["preview_too_large", "pae_too_large", "pae_invalid", "result_invalid"]) {
    expect(canRetryPreview(new ApiError(503, { code }))).toBe(false)
  }
  for (const status of [401, 403, 404, 409, 413]) expect(canRetryPreview(new ApiError(status))).toBe(false)
})
