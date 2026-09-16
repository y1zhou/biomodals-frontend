import type { GromacsContinuationInput } from "./api/client"
import { simulationTimeError } from "./gromacs"

export interface ContinuationIntent {
  key: string
  input: GromacsContinuationInput
}

export function continuationStorageKey(ownerId: string, sourceJobId: string) {
  return `biomodals:gromacs:continuation:${encodeURIComponent(ownerId)}:${encodeURIComponent(sourceJobId)}`
}

export function readContinuationIntent(storage: Pick<Storage, "getItem">, key: string): ContinuationIntent | null {
  try {
    const value = JSON.parse(storage.getItem(key) ?? "null")
    if (!value || typeof value.key !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.key)) return null
    const input = value.input
    if (!input || typeof input.additional_time_ns !== "number" || simulationTimeError(String(input.additional_time_ns)) ||
      typeof input.cpu_only !== "boolean" || !(input.display_name === null || typeof input.display_name === "string" && input.display_name.length <= 120)) return null
    return { key: value.key, input: { display_name: input.display_name, additional_time_ns: input.additional_time_ns, cpu_only: input.cpu_only } }
  } catch { return null }
}

export function saveContinuationIntent(storage: Pick<Storage, "setItem" | "removeItem">, key: string, intent: ContinuationIntent | null) {
  try {
    if (intent) storage.setItem(key, JSON.stringify(intent))
    else storage.removeItem(key)
  } catch { /* In-memory intent still protects retries on the mounted page. */ }
}
