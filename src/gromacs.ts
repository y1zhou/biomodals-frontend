import {
  ApiError,
  SERVICE_CONFIGURATION_ERROR_MESSAGE,
  apiErrorCode,
  isServiceConfigurationError,
} from "@/api/client"

export const WEB_UPLOAD_LIMIT_MIB = 10
export const WEB_UPLOAD_LIMIT_BYTES = WEB_UPLOAD_LIMIT_MIB * 1024 * 1024
export const WEB_UPLOAD_LIMIT_LABEL = `${WEB_UPLOAD_LIMIT_MIB} MiB`

export type SubmissionField =
  | "pdb"
  | "display_name"
  | "simulation_time_ns"
  | "run_pdbfixer"
  | "cpu_only"

const submissionFields = new Set<SubmissionField>([
  "pdb",
  "display_name",
  "simulation_time_ns",
  "run_pdbfixer",
  "cpu_only",
])

function nativeValidationDetails(error: unknown) {
  if (!(error instanceof ApiError) || error.status !== 422) return null
  const body = error.body
  if (!body || typeof body !== "object" || !("detail" in body) || !Array.isArray(body.detail)) {
    return null
  }
  return body.detail
}

function submissionFieldError(detail: unknown) {
  if (!detail || typeof detail !== "object" || !("loc" in detail) || !Array.isArray(detail.loc)) {
    return null
  }
  if (!("msg" in detail) || typeof detail.msg !== "string") return null
  const candidate = detail.loc.at(-1)
  if (typeof candidate !== "string" || !submissionFields.has(candidate as SubmissionField)) {
    return null
  }
  return [candidate as SubmissionField, detail.msg] as const
}

export function normalizedDisplayName(value: string) {
  return value.trim() || null
}

export function pdbFileError(file: File | null) {
  if (!file) return "Choose a PDB file."
  if (!file.name.toLocaleLowerCase().endsWith(".pdb")) return "Choose a file ending in .pdb."
  if (file.size > WEB_UPLOAD_LIMIT_BYTES) {
    return `Choose a PDB file up to ${WEB_UPLOAD_LIMIT_LABEL}.`
  }
  return null
}

export function simulationTimeError(value: string) {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1 || number > 200) {
    return "Enter a whole number from 1 to 200."
  }
  return null
}

export function apiFieldErrors(error: unknown) {
  const code = apiErrorCode(error)
  if (code === "pdb_invalid") return { pdb: error instanceof Error ? error.message : "Invalid PDB file." }
  if (code === "payload_too_large") {
    return { pdb: `Choose a PDB file up to ${WEB_UPLOAD_LIMIT_LABEL}.` }
  }
  if (!(error instanceof ApiError) || error.status !== 422) return {}

  const details = nativeValidationDetails(error)
  if (!details) return {}
  const errors: Partial<Record<SubmissionField, string>> = {}
  for (const detail of details) {
    const fieldError = submissionFieldError(detail)
    if (fieldError) errors[fieldError[0]] = fieldError[1]
  }
  return errors
}

function hasUnrecognizedValidationErrors(error: unknown) {
  if (!(error instanceof ApiError) || error.status !== 422) return false
  const details = nativeValidationDetails(error)
  return details === null || details.some((detail) => !submissionFieldError(detail))
}

export function shouldRotateIdempotencyKey(error: unknown) {
  return apiErrorCode(error) === "idempotency_conflict"
}

export function submissionErrorMessage(error: unknown, hasFieldErrors: boolean) {
  if (!error) return null
  if (hasFieldErrors && !hasUnrecognizedValidationErrors(error)) return null
  if (error instanceof DOMException && error.name === "AbortError") {
    return "Upload cancelled. Your PDB and settings are still here."
  }
  if (!(error instanceof ApiError)) {
    return "The Submission could not be completed. Check the fields and try again."
  }

  const code = apiErrorCode(error)
  if (error.status === 401 || code === "csrf_invalid") return null
  if (isServiceConfigurationError(error)) return SERVICE_CONFIGURATION_ERROR_MESSAGE
  if (error.status === 422) {
    return "The API rejected the Submission. Review the form and try again."
  }
  if (code === "compute_unavailable") {
    return "Remote compute is temporarily unavailable. Try the same Submission again."
  }
  if (code === "active_job_limit_reached") {
    return "You already have the maximum number of active Jobs. Try this same Submission after one finishes."
  }
  if (code === "idempotency_conflict") {
    return "This key was already used for a different Submission. Review it and submit again."
  }
  if (error.status === 0) {
    return "We could not confirm whether the Job was created. Retry this Submission or check My Jobs."
  }
  return "The Submission could not be completed. Check the fields and try again."
}
