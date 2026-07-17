import { ApiError, type HttpValidationError } from "@/api/client"

export const WEB_UPLOAD_LIMIT_BYTES = 100 * 1024 * 1024

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

export function normalizedDisplayName(value: string) {
  return value.trim() || null
}

export function pdbFileError(file: File | null) {
  if (!file) return "Choose a PDB file."
  if (!file.name.toLocaleLowerCase().endsWith(".pdb")) return "Choose a file ending in .pdb."
  if (file.size > WEB_UPLOAD_LIMIT_BYTES) return "The web uploader supports files up to 100 MiB."
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
  if (!(error instanceof ApiError) || error.status !== 422) return {}

  const body = error.body as HttpValidationError | undefined
  const errors: Partial<Record<SubmissionField, string>> = {}
  for (const detail of body?.detail ?? []) {
    const candidate = detail.loc.at(-1)
    if (typeof candidate === "string" && submissionFields.has(candidate as SubmissionField)) {
      errors[candidate as SubmissionField] = detail.msg
    }
  }
  return errors
}
