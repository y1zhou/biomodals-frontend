import { ApiError, apiErrorCode } from "@/api/client"

export function canRetryPreview(error: unknown) {
  if (error instanceof TypeError) return true // Network fetch failure.
  if (!(error instanceof ApiError)) return false
  const code = apiErrorCode(error)
  if (code && ["preview_too_large", "pae_too_large", "pae_invalid", "result_invalid"].includes(code)) return false
  return code === "result_not_cached" || code === "result_storage_unavailable" ||
    error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500
}
