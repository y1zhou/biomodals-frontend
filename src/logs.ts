import Anser from "anser"

export interface ModalLogLine {
  timestamp: string | null
  message: string
}

export interface AnsiLogSegment {
  background: string | null
  decorations: readonly Anser.DecorationName[]
  foreground: string | null
  text: string
}

const MODAL_TIMESTAMP_PREFIX =
  /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2}))\s(.*)$/

function rgbColor(value: string | null | undefined) {
  if (!value) return null
  const channels = value.split(",").map((channel) => Number(channel.trim()))
  if (
    channels.length !== 3 ||
    channels.some(
      (channel) => !Number.isInteger(channel) || channel < 0 || channel > 255
    )
  ) {
    return null
  }
  return `rgb(${channels.join(" ")})`
}

export function ansiLogSegments(text: string): AnsiLogSegment[] {
  return Anser.ansiToJson(text, { remove_empty: true }).map((entry) => {
    const decorations = [...(entry.decorations ?? [])]
    if (entry.decoration && !decorations.includes(entry.decoration)) {
      decorations.push(entry.decoration)
    }
    return {
      background: rgbColor(entry.bg_truecolor || entry.bg),
      decorations,
      foreground: rgbColor(entry.fg_truecolor || entry.fg),
      text: entry.content,
    }
  })
}

export function firstModalLogTimestamp(text: string) {
  for (const line of text.split(/\r?\n/)) {
    const timestamped = MODAL_TIMESTAMP_PREFIX.exec(line)
    if (timestamped?.[1]) return timestamped[1]
  }
  return null
}

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
