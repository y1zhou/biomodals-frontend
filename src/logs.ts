export interface ModalLogLine {
  timestamp: string | null
  message: string
}

const MODAL_TIMESTAMP_PREFIX =
  /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2}))\s(.*)$/

export function modalLogLines(text: string): ModalLogLine[] {
  const lines = text.split(/\r?\n/)
  if (lines.at(-1) === "") lines.pop()
  return lines.map((line) => {
    const timestamped = MODAL_TIMESTAMP_PREFIX.exec(line)
    return timestamped
      ? { timestamp: timestamped[1] ?? null, message: timestamped[2] ?? "" }
      : { timestamp: null, message: line }
  })
}

function safeFilenamePart(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-") || "unknown"
}

export function logDownloadFilename(
  now: Date,
  tool: string,
  stage: string
) {
  const timestamp = `${now.toISOString().slice(0, 19).replaceAll(":", "-")}Z`
  return `${timestamp}_${safeFilenamePart(tool)}_${safeFilenamePart(stage)}.log`
}
