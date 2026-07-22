import { useQuery } from "@tanstack/react-query"
import { Check, Clipboard, Download, LoaderCircle } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import {
  apiErrorCode,
  apiRequestId,
  inspectAdminJobLogTargets,
  streamAdminJobLogs,
} from "@/api/client"
import { useExpireSession } from "@/auth-state"
import { Button } from "@/components/ui/button"
import { copyText } from "@/lib/clipboard"
import { logDownloadFilename, modalLogLines } from "@/logs"

const MAX_LOG_CHARACTERS = 500_000

export interface StageLogSnapshot {
  text: string
  truncated: boolean
}

interface GromacsStageLogsProps {
  historicalLog?: StageLogSnapshot
  jobId: string
  onHistoricalLogLoaded: (
    stageCode: string,
    snapshot: StageLogSnapshot
  ) => void
  stageIsActive: boolean
  stageCode: string
  stageLabel: string
}

function appendLogChunk(
  current: StageLogSnapshot,
  chunk: string
): StageLogSnapshot {
  const combined = current.text + chunk
  if (combined.length <= MAX_LOG_CHARACTERS) {
    return { text: combined, truncated: current.truncated }
  }
  return {
    text: combined.slice(-MAX_LOG_CHARACTERS),
    truncated: true,
  }
}

function streamFailureMessage(error: unknown) {
  if (apiErrorCode(error) === "job_log_target_unavailable") {
    return "Logs are not available for this stage. Modal may no longer retain this Function Call."
  }
  if (apiErrorCode(error) === "job_logs_unavailable") {
    return "Logs could not be fetched from Modal. Check the Modal deployment and service credentials."
  }
  const supportId = apiRequestId(error)
  return `Logs could not be fetched from Modal.${supportId ? ` Support ID: ${supportId}.` : " Try again."}`
}

function downloadLog(text: string, filename: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/plain;charset=utf-8" })
  )
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.hidden = true
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export default function GromacsStageLogs({
  historicalLog,
  jobId,
  onHistoricalLogLoaded,
  stageIsActive,
  stageCode,
  stageLabel,
}: GromacsStageLogsProps) {
  const [streamState, setStreamState] = useState<
    "idle" | "connecting" | "streaming" | "ended" | "error"
  >("idle")
  const [streamError, setStreamError] = useState<unknown>(null)
  const [buffer, setBuffer] = useState<StageLogSnapshot>({
    text: "",
    truncated: false,
  })
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<number | null>(null)
  const output = useRef<HTMLDivElement>(null)
  const targetsQuery = useQuery({
    queryKey: ["admin", "jobs", jobId, "log-targets"],
    queryFn: ({ signal }) => inspectAdminJobLogTargets(jobId, signal),
    retry: 1,
    refetchInterval(query) {
      const target = query.state.data?.targets.find(
        (candidate) => candidate.stage_code === stageCode
      )
      return target?.mode === "live" ? 10_000 : false
    },
    refetchIntervalInBackground: false,
  })
  const targetCandidate = targetsQuery.data?.targets.find(
    (candidate) => candidate.stage_code === stageCode
  )
  const expectedMode = stageIsActive ? "live" : "historical"
  const target = targetCandidate?.mode === expectedMode
    ? targetCandidate
    : undefined
  const targetMode = target?.mode
  const awaitingFreshTarget = Boolean(
    targetCandidate && !target && targetsQuery.isFetching
  )
  useExpireSession(targetsQuery.error)
  useExpireSession(streamError)

  useEffect(() => {
    return () => {
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!targetMode) {
      setStreamState("idle")
      return
    }
    if (targetMode === "historical" && historicalLog) {
      setBuffer(historicalLog)
      setStreamError(null)
      setStreamState("ended")
      return
    }
    const controller = new AbortController()
    let fetched = { text: "", truncated: false }
    setBuffer({ text: "", truncated: false })
    setStreamError(null)
    setStreamState("connecting")
    void streamAdminJobLogs(jobId, stageCode, controller.signal, (chunk) => {
      fetched = appendLogChunk(fetched, chunk)
      setStreamState("streaming")
      setBuffer(fetched)
    })
      .then(() => {
        if (controller.signal.aborted) return
        setStreamState("ended")
        if (targetMode === "historical") {
          onHistoricalLogLoaded(stageCode, fetched)
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setStreamError(error)
        setStreamState("error")
      })
    return () => controller.abort()
  }, [
    historicalLog,
    jobId,
    onHistoricalLogLoaded,
    stageCode,
    targetMode,
  ])

  useEffect(() => {
    if (output.current) output.current.scrollTop = output.current.scrollHeight
  }, [buffer.text])

  const statusLabel = targetMode === "historical"
    ? streamState === "connecting" || streamState === "streaming"
      ? "Fetching logs…"
      : streamState === "ended"
        ? "Fetched logs"
        : streamState === "error"
          ? "Log fetch failed"
          : "Waiting"
    : streamState === "connecting"
      ? "Connecting…"
      : streamState === "streaming"
        ? "Streaming logs"
        : streamState === "ended"
          ? "Stream ended"
          : streamState === "error"
            ? "Log stream stopped"
            : "Waiting"
  const lines = buffer.text ? modalLogLines(buffer.text) : []
  const noLogs = streamState === "ended" && !buffer.text.trim()

  return (
    <section
      aria-label={`Logs for ${stageLabel}`}
      className="rounded-lg border bg-background p-4"
      id={`stage-logs-${stageCode}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{statusLabel}</p>
          {target ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {target.function_name}
              {target.state === "state_unknown" ? " · status unknown" : ""}
            </p>
          ) : null}
        </div>
        <div className="ml-auto flex gap-2">
          <Button
            disabled={!buffer.text}
            onClick={() => {
              void copyText(buffer.text)
                .then(() => {
                  setCopied(true)
                  if (copiedTimer.current !== null) {
                    window.clearTimeout(copiedTimer.current)
                  }
                  copiedTimer.current = window.setTimeout(
                    () => setCopied(false),
                    2_000
                  )
                })
                .catch(() => setCopied(false))
            }}
            size="sm"
            variant="outline"
          >
            {copied ? <Check aria-hidden="true" /> : <Clipboard aria-hidden="true" />}
            {copied ? "Copied" : "Copy logs"}
          </Button>
          <Button
            disabled={!buffer.text}
            onClick={() =>
              downloadLog(
                buffer.text,
                logDownloadFilename(new Date(), "gromacs", stageCode)
              )
            }
            size="sm"
            variant="outline"
          >
            <Download aria-hidden="true" />
            Download logs
          </Button>
        </div>
      </div>

      {targetsQuery.isPending || awaitingFreshTarget ? (
        <div className="mt-4 flex min-h-40 items-center justify-center gap-2 rounded-lg bg-slate-950 text-sm text-slate-300">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Finding this Modal Function Call…
        </div>
      ) : null}
      {targetsQuery.isError ? (
        <p className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          Logs could not be fetched from Modal. Check the connection and try again.
        </p>
      ) : null}
      {!targetsQuery.isPending &&
      !awaitingFreshTarget &&
      !targetsQuery.isError &&
      !target ? (
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-950" role="status">
          Logs are not available for this stage. Modal may no longer retain this Function Call.
        </p>
      ) : null}

      {target ? (
        <div
          className="mt-4 max-h-80 min-h-40 overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-5 text-slate-100"
          ref={output}
        >
          {lines.length ? (
            lines.map((line, index) => (
              <div className="flex min-w-0 gap-3" key={`${index}-${line.timestamp ?? "plain"}`}>
                {line.timestamp ? (
                  <time
                    className="shrink-0 font-sans text-[10px] leading-5 tabular-nums text-slate-400"
                    dateTime={line.timestamp.replace(" ", "T")}
                  >
                    {line.timestamp}
                  </time>
                ) : null}
                <span className="min-w-0 whitespace-pre-wrap break-all font-mono">
                  {line.message || " "}
                </span>
              </div>
            ))
          ) : (
            <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-slate-300">
              {streamState === "connecting" ? (
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
              ) : null}
              {noLogs
                ? "Modal returned no logs for this stage. They may no longer be retained."
                : targetMode === "historical"
                  ? "Fetching logs from Modal…"
                  : "Waiting for log output…"}
            </div>
          )}
        </div>
      ) : null}

      {buffer.truncated ? (
        <p className="mt-2 text-xs text-amber-700">
          Earlier output was omitted from this browser view and download.
        </p>
      ) : null}
      {streamError ? (
        <p className="mt-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          {streamFailureMessage(streamError)}
        </p>
      ) : null}
    </section>
  )
}
