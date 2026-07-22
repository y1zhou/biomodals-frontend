import { useQuery } from "@tanstack/react-query"
import { FileTerminal, LoaderCircle } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import {
  apiErrorCode,
  apiRequestId,
  inspectAdminJobLogTargets,
  streamAdminJobLogs,
  type AdminJobLogTarget,
} from "@/api/client"
import { useExpireSession } from "@/auth-state"
import { gromacsStageLabel } from "@/jobs"

const MAX_LOG_CHARACTERS = 500_000
const EMPTY_TARGETS: readonly AdminJobLogTarget[] = []

interface LogBuffer {
  text: string
  truncated: boolean
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

function targetLabel(target: AdminJobLogTarget) {
  const status = target.state === "state_unknown" ? " · status unknown" : ""
  return `${gromacsStageLabel(target.stage_code)} — ${target.function_name}${status}`
}

function streamFailureMessage(error: unknown) {
  if (apiErrorCode(error) === "job_log_target_unavailable") {
    return "That stage is no longer active. Choose another available stage."
  }
  if (apiErrorCode(error) === "job_logs_unavailable") {
    return "Modal logs are temporarily unavailable. Collapse and reopen Logs to try again."
  }
  const supportId = apiRequestId(error)
  return `The log stream stopped unexpectedly.${supportId ? ` Support ID: ${supportId}.` : ""}`
}

export default function AdminJobLogs({ jobId }: { jobId: string }) {
  const [expanded, setExpanded] = useState(false)
  const [selectedStage, setSelectedStage] = useState("")
  const [streamState, setStreamState] = useState<
    "idle" | "connecting" | "streaming" | "ended" | "error"
  >("idle")
  const [streamError, setStreamError] = useState<unknown>(null)
  const [buffer, setBuffer] = useState<LogBuffer>({ text: "", truncated: false })
  const output = useRef<HTMLPreElement>(null)
  const targetsQuery = useQuery({
    queryKey: ["admin", "jobs", jobId, "log-targets"],
    queryFn: ({ signal }) => inspectAdminJobLogTargets(jobId, signal),
    enabled: expanded,
    retry: 1,
    refetchInterval: expanded ? 10_000 : false,
    refetchIntervalInBackground: false,
  })
  const targets = targetsQuery.data?.targets ?? EMPTY_TARGETS
  const selectedTarget = targets.find(
    (target) => target.stage_code === selectedStage
  )
  const selectedStageCode = selectedTarget?.stage_code ?? ""
  useExpireSession(targetsQuery.error)
  useExpireSession(streamError)

  useEffect(() => {
    if (!expanded || targetsQuery.isPending) return
    setSelectedStage((current) =>
      targets.some((target) => target.stage_code === current)
        ? current
        : (targets[0]?.stage_code ?? "")
    )
  }, [expanded, targets, targetsQuery.isPending])

  useEffect(() => {
    if (!expanded || !selectedStageCode) {
      setStreamState("idle")
      return
    }
    const controller = new AbortController()
    setBuffer({ text: "", truncated: false })
    setStreamError(null)
    setStreamState("connecting")
    void streamAdminJobLogs(
      jobId,
      selectedStageCode,
      controller.signal,
      (chunk) => {
        setStreamState("streaming")
        setBuffer((current) => appendLogChunk(current, chunk))
      }
    )
      .then(() => {
        if (!controller.signal.aborted) setStreamState("ended")
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setStreamError(error)
        setStreamState("error")
      })
    return () => controller.abort()
  }, [expanded, jobId, selectedStageCode])

  useEffect(() => {
    if (output.current) output.current.scrollTop = output.current.scrollHeight
  }, [buffer.text])

  const loadingTargets = expanded && targetsQuery.isPending
  const empty = expanded && !loadingTargets && !targetsQuery.isError && !targets.length
  const logText = buffer.text || (
    streamState === "connecting"
      ? "Connecting to Modal…"
      : "Waiting for log output…"
  )

  return (
    <details
      className="mt-6 overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-6 py-5 font-heading font-semibold select-none marker:hidden">
        <FileTerminal aria-hidden="true" className="size-5 text-muted-foreground" />
        Logs
      </summary>
      <div className="border-t px-6 py-5">
        <p className="text-sm text-muted-foreground">
          Live output from the selected running function. Visible only to administrators.
        </p>

        {loadingTargets ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            Finding active stages…
          </div>
        ) : null}
        {targetsQuery.isError ? (
          <p className="mt-4 text-sm text-destructive" role="alert">
            Active stages could not be loaded. Collapse and reopen Logs to try again.
          </p>
        ) : null}
        {empty ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No active Modal function is available for this job.
          </p>
        ) : null}

        {targets.length > 1 ? (
          <label className="mt-4 grid max-w-xl gap-2 text-sm font-medium">
            Running function
            <select
              className="h-10 rounded-lg border bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              onChange={(event) => setSelectedStage(event.target.value)}
              value={selectedStage}
            >
              {targets.map((target) => (
                <option key={target.stage_code} value={target.stage_code}>
                  {targetLabel(target)}
                </option>
              ))}
            </select>
          </label>
        ) : targets[0] ? (
          <p className="mt-4 text-sm">
            <span className="font-medium">Running function:</span>{" "}
            {targetLabel(targets[0])}
          </p>
        ) : null}

        {selectedTarget ? (
          <div className="mt-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {streamState === "connecting"
                  ? "Connecting…"
                  : streamState === "streaming"
                    ? "Streaming"
                    : streamState === "ended"
                      ? "Stream ended"
                      : streamState === "error"
                        ? "Stream stopped"
                        : "Waiting"}
              </span>
              {buffer.truncated ? <span>Earlier output was omitted.</span> : null}
            </div>
            <pre
              aria-label={`Logs for ${targetLabel(selectedTarget)}`}
              className="max-h-[32rem] min-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-100"
              ref={output}
            >
              {logText}
            </pre>
          </div>
        ) : null}
        {streamError ? (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {streamFailureMessage(streamError)}
          </p>
        ) : null}
      </div>
    </details>
  )
}
