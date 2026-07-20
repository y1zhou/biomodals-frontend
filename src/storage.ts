export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "—"
  if (bytes < 1024) return `${bytes} B`
  const units = ["KiB", "MiB", "GiB", "TiB", "PiB"]
  let value = bytes
  let unit = -1
  do {
    value /= 1024
    unit += 1
  } while (value >= 1024 && unit < units.length - 1)
  return `${value.toLocaleString(undefined, {
    maximumFractionDigits: value >= 10 ? 1 : 2,
  })} ${units[unit]}`
}
