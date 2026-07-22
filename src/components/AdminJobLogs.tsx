import { useQuery, useQueryClient } from "@tanstack/react-query"
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
import { gromacsTool } from "@/tools"

const MAX_LOG_CHARACTERS = 500_000

interface LogBuffer {
  text: string
  truncated: boolean
}

interface StageLogSnapshot extends LogBuffer {
  functionName: string
}

interface GromacsStageLogsProps {
  jobId: string
  stageCode: string
  stageLabel: string
}

function historicalLogKey(jobId: string, stageCode: string) {
  return ["admin", "jobs", jobId, "logs", stageCode, "historical"] as const
}

function appendLogChunk(current: LogBuffer, chunk: string): LogBuffer {
  const combined = current.text + chunk
  if (combined.length <= MAX_LOG_CHARACTERS) {
    return { text: combined, truncated: current.truncated }
  }
  return {
    text: combined.slice(-MAX_LOG_CHARACTERS),
    truncated: true,
  }
}

async function fetchHistoricalLog(
  jobId: string,
  stageCode: string,
  functionName: string,
  signal: AbortSignal
): Promise<StageLogSnapshot> {
  let buffer: LogBuffer = { text: "", truncated: false }
  await streamAdminJobLogs(jobId, stageCode, signal, (chunk) => {
    buffer = appendLogChunk(buffer, chunk)
  })
  return { ...buffer, functionName }
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
  jobId,
  stageCode,
  stageLabel,
}: GromacsStageLogsProps) {
  const queryClient = useQueryClient()
  const logKey = historicalLogKey(jobId, stageCode)
  const cachedHistoricalLog = queryClient.getQueryData<StageLogSnapshot>(logKey)
  const [liveState, setLiveState] = useState<
    "idle" | "connecting" | "streaming" | "ended" | "error"
  >("idle")
  const [liveError, setLiveError] = useState<unknown>(null)
  const [liveBuffer, setLiveBuffer] = useState<LogBuffer>({
    text: "",
    truncated: false,
  })
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<number | null>(null)
  const output = useRef<HTMLDivElement>(null)
  const targetsQuery = useQuery({
    queryKey: ["admin", "jobs", jobId, "log-targets"],
    queryFn: ({ signal }) => inspectAdminJobLogTargets(jobId, signal),
    enabled: !cachedHistoricalLog,
    retry: 1,
    refetchInterval(query) {
      if (cachedHistoricalLog) return false
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
  const target = !cachedHistoricalLog &&
    targetsQuery.isFetchedAfterMount &&
    !targetsQuery.isError
    ? targetCandidate
    : undefined
  const historicalQuery = useQuery({
    queryKey: logKey,
    queryFn: ({ signal }) => {
      if (!target || target.mode !== "historical") {
        throw new Error("Historical log target is unavailable")
      }
      return fetchHistoricalLog(
        jobId,
        stageCode,
        target.function_name,
        signal
      )
    },
    enabled: target?.mode === "historical",
    gcTime: Infinity,
    retry: 1,
    staleTime: Infinity,
  })
  const historicalLog = historicalQuery.data ?? cachedHistoricalLog
  const targetMode = historicalLog ? "historical" : target?.mode
  const buffer = historicalLog ?? (
    targetMode === "live" ? liveBuffer : { text: "", truncated: false }
  )
  const functionName = historicalLog?.functionName ?? target?.function_name
  const logError = historicalQuery.error ?? liveError
  const awaitingFreshTarget = Boolean(
    !historicalLog &&
    !targetsQuery.isError &&
    !targetsQuery.isFetchedAfterMount
  )
  useExpireSession(historicalLog ? null : targetsQuery.error)
  useExpireSession(historicalQuery.error)
  useExpireSession(liveError)

  useEffect(() => {
    return () => {
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current)
    }
  }, [])

  useEffect(() => {
    if (targetMode !== "live") {
      setLiveState("idle")
      return
    }
    const controller = new AbortController()
    let streamed: LogBuffer = { text: "", truncated: false }
    setLiveBuffer(streamed)
    setLiveError(null)
    setLiveState("connecting")
    void streamAdminJobLogs(jobId, stageCode, controller.signal, (chunk) => {
      streamed = appendLogChunk(streamed, chunk)
      setLiveState("streaming")
      setLiveBuffer(streamed)
    })
      .then(() => {
        if (!controller.signal.aborted) setLiveState("ended")
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setLiveError(error)
        setLiveState("error")
      })
    return () => controller.abort()
  }, [jobId, stageCode, targetMode])

  useEffect(() => {
    if (output.current) output.current.scrollTop = output.current.scrollHeight
  }, [buffer.text])

  const statusLabel = targetMode === "historical"
    ? historicalQuery.isError
      ? "Log fetch failed"
      : historicalLog
        ? "Fetched logs"
        : "Fetching logs…"
    : liveState === "connecting"
      ? "Connecting…"
      : liveState === "streaming"
        ? "Streaming logs"
        : liveState === "ended"
          ? "Stream ended"
          : liveState === "error"
            ? "Log stream stopped"
            : "Waiting"
  const lines = buffer.text ? modalLogLines(buffer.text) : []
  const logsEnded = targetMode === "historical"
    ? historicalQuery.isSuccess
    : liveState === "ended"
  const logsLoading = targetMode === "historical"
    ? historicalQuery.isFetching
    : liveState === "connecting"
  const noLogs = logsEnded && !buffer.text.trim()

  return (
    <section
      aria-label={`Logs for ${stageLabel}`}
      className="rounded-lg border bg-background p-4"
      id={`stage-logs-${stageCode}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{statusLabel}</p>
          {functionName ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {functionName}
              {target?.state === "state_unknown" ? " · status unknown" : ""}
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
                logDownloadFilename(new Date(), gromacsTool.slug, stageCode)
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

      {awaitingFreshTarget ? (
        <div className="mt-4 flex min-h-40 items-center justify-center gap-2 rounded-lg bg-slate-950 text-sm text-slate-300">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Finding this Modal Function Call…
        </div>
      ) : null}
      {!historicalLog && targetsQuery.isError ? (
        <p className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          Logs could not be fetched from Modal. Check the connection and try again.
        </p>
      ) : null}
      {!historicalLog &&
      targetsQuery.isFetchedAfterMount &&
      !targetsQuery.isError &&
      !target ? (
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-950" role="status">
          Logs are not available for this stage. Modal may no longer retain this Function Call.
        </p>
      ) : null}

      {targetMode ? (
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
              {logsLoading ? (
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
      {logError ? (
        <p className="mt-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          {streamFailureMessage(logError)}
        </p>
      ) : null}
    </section>
  )
}
