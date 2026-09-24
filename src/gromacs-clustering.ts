import type { GromacsClusteringInput } from "./api/client"

export interface ClusteringIntent { key: string; input: GromacsClusteringInput }

export function clusteringCutoffError(value: string) {
  return value.trim() && Number.isFinite(Number(value)) && Number(value) > 0
    ? null : "Enter a finite cutoff greater than zero."
}

export function clusteringStorageKey(ownerId: string, sourceJobId: string) {
  return `biomodals:gromacs:clustering:${encodeURIComponent(ownerId)}:${encodeURIComponent(sourceJobId)}`
}

export function readClusteringIntent(storage: Pick<Storage, "getItem">, key: string): ClusteringIntent | null {
  try {
    const value = JSON.parse(storage.getItem(key) ?? "null")
    if (!value || typeof value.key !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.key)) return null
    const input = value.input
    if (!input || typeof input.cutoff_angstrom !== "number" || clusteringCutoffError(String(input.cutoff_angstrom)) ||
      !(input.display_name === null || typeof input.display_name === "string" && input.display_name.length <= 120)) return null
    return { key: value.key, input: { display_name: input.display_name, cutoff_angstrom: input.cutoff_angstrom } }
  } catch { return null }
}

export function saveClusteringIntent(storage: Pick<Storage, "setItem" | "removeItem">, key: string, intent: ClusteringIntent | null) {
  try {
    if (intent) storage.setItem(key, JSON.stringify(intent))
    else storage.removeItem(key)
  } catch { /* Mounted form retains the exact intent if storage is unavailable. */ }
}
