import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { Check, Clipboard, Download, LoaderCircle } from "lucide-react"
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react"

import {
  apiErrorCode,
  apiRequestId,
  inspectJobLogTargets,
  streamJobLogs,
  type JobLogTarget,
  type JobLogWindow,
} from "@/api/client"
import { useExpireSession } from "@/auth-state"
import { Button } from "@/components/ui/button"
import { copyText } from "@/lib/clipboard"
import {
  firstModalLogTimestamp,
  logDownloadFilename,
  styledModalLogLines,
  type AnsiLogSegment,
} from "@/logs"
const LIVE_LOG_CHARACTERS = 500_000
const LOG_WINDOW_MILLISECONDS = 10 * 60 * 1_000
const LOG_BOUNDARY_PADDING_MILLISECONDS = 1_000

interface LogBuffer {
  text: string
  truncated: boolean
}

interface HistoricalLogPage extends JobLogWindow {
  text: string
}

interface StageLogsProps {
  jobId: string
  stageCode: string
  stageLabel: string
  toolSlug: string
}

interface StageLogViewerProps {
  jobId: string
  stageCode: string
  target: JobLogTarget
  toolSlug: string
}

function appendLogChunk(
  current: LogBuffer,
  chunk: string,
  retainAll: boolean
): LogBuffer {
  const combined = current.text + chunk
  if (retainAll || combined.length <= LIVE_LOG_CHARACTERS) {
    return { text: combined, truncated: current.truncated }
  }
  const tail = combined.slice(-LIVE_LOG_CHARACTERS)
  const firstNewline = tail.indexOf("\n")
  const lineAligned = firstNewline >= 0 && firstNewline + 1 < tail.length
    ? tail.slice(firstNewline + 1)
    : tail
  return { text: lineAligned, truncated: true }
}

function concatenateLogs(parts: readonly string[]) {
  return parts.reduce((combined, part) => {
    if (!part) return combined
    if (!combined || combined.endsWith("\n") || part.startsWith("\n")) {
      return combined + part
    }
    return `${combined}\n${part}`
  }, "")
}

function pageBefore(until: number, lowerBound: number): JobLogWindow {
  const boundedUntil = Math.max(until, lowerBound + 1)
  return {
    since: new Date(
      Math.max(lowerBound, boundedUntil - LOG_WINDOW_MILLISECONDS)
    ).toISOString(),
    until: new Date(boundedUntil).toISOString(),
  }
}

function timestampMilliseconds(value: string | null) {
  if (!value) return null
  const milliseconds = Date.parse(value.replace(" ", "T"))
  return Number.isFinite(milliseconds) ? milliseconds : null
}

async function fetchHistoricalPage(
  jobId: string,
  targetId: string,
  window: JobLogWindow,
  signal: AbortSignal
): Promise<HistoricalLogPage> {
  let text = ""
  await streamJobLogs(
    jobId,
    targetId,
    signal,
    (chunk) => {
      text += chunk
    },
    window
  )
  return { ...window, text }
}

function streamFailureMessage(error: unknown) {
  if (apiErrorCode(error) === "job_logs_forbidden") {
    return "Log access for this Tool is now restricted to administrators. Refresh the Job page."
  }
  if (apiErrorCode(error) === "job_log_target_unavailable") {
    return "Logs are not available for this stage. Modal may no longer retain this Function Call."
  }
  if (apiErrorCode(error) === "job_logs_unavailable") {
    return "Logs could not be fetched from Modal. Try again; administrators can check the deployment and service credentials."
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

function ansiStyle(segment: AnsiLogSegment): CSSProperties {
  const decorations = new Set(segment.decorations)
  const textDecoration = [
    decorations.has("underline") ? "underline" : "",
    decorations.has("strikethrough") ? "line-through" : "",
  ].filter(Boolean).join(" ") || undefined
  return {
    backgroundColor: segment.background ?? undefined,
    color: segment.foreground ?? undefined,
    fontStyle: decorations.has("italic") ? "italic" : undefined,
    fontWeight: decorations.has("bold") ? 700 : undefined,
    opacity: decorations.has("dim") ? 0.65 : undefined,
    textDecoration,
    visibility: decorations.has("hidden") ? "hidden" : undefined,
  }
}

function AnsiLogMessage({ segments }: { segments: readonly AnsiLogSegment[] }) {
  if (!segments.length) return " "
  return segments.map((segment, index) => (
    <span key={index} style={ansiStyle(segment)}>
      {segment.text}
    </span>
  ))
}

function StageLogViewer({
  jobId,
  stageCode,
  target,
  toolSlug,
}: StageLogViewerProps) {
  const [liveState, setLiveState] = useState<
    "idle" | "connecting" | "streaming" | "ended" | "error"
  >("idle")
  const [liveError, setLiveError] = useState<unknown>(null)
  const [liveBuffer, setLiveBuffer] = useState<LogBuffer>({
    text: "",
    truncated: false,
  })
  const [liveHistoryUntil, setLiveHistoryUntil] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<number | null>(null)
  const output = useRef<HTMLDivElement>(null)
  const retainAllLive = useRef(false)
  const stickToBottom = useRef(true)
  const pendingScrollRestore = useRef<{
    pageCount: number
    scrollHeight: number
    scrollTop: number
  } | null>(null)
  const lowerBound = useMemo(
    () => target.started_at
      ? Date.parse(target.started_at) - LOG_BOUNDARY_PADDING_MILLISECONDS
      : Date.now(),
    [target.started_at]
  )
  const terminalUpperBound = useMemo(
    () => target.ended_at
      ? Date.parse(target.ended_at) + LOG_BOUNDARY_PADDING_MILLISECONDS
      : null,
    [target.ended_at]
  )
  const historyUpperBound = target.mode === "historical"
    ? terminalUpperBound
    : liveHistoryUntil
  const initialPage = useMemo(
    () => pageBefore(historyUpperBound ?? lowerBound + 1, lowerBound),
    [historyUpperBound, lowerBound]
  )
  const historyQuery = useInfiniteQuery({
    queryKey: [
      "jobs",
      jobId,
      "logs",
      stageCode,
      "history",
      target.target_id,
      target.mode,
      target.started_at,
      target.ended_at,
      liveHistoryUntil,
    ],
    queryFn: ({ pageParam, signal }) =>
      fetchHistoricalPage(jobId, target.target_id, pageParam, signal),
    initialPageParam: initialPage,
    getNextPageParam(lastPage) {
      const nextUntil = Date.parse(lastPage.since)
      return nextUntil > lowerBound
        ? pageBefore(nextUntil, lowerBound)
        : undefined
    },
    enabled: historyUpperBound !== null,
    gcTime: Infinity,
    retry: 1,
    staleTime: Infinity,
  })
  const historicalText = useMemo(
    () => concatenateLogs(
      [...(historyQuery.data?.pages ?? [])]
        .reverse()
        .map((page) => page.text)
    ),
    [historyQuery.data?.pages]
  )
  const text = target.mode === "historical"
    ? historicalText
    : concatenateLogs([historicalText, liveBuffer.text])
  const renderedLines = useMemo(() => styledModalLogLines(text), [text])
  const firstLiveTimestamp = firstModalLogTimestamp(liveBuffer.text)
  const firstLiveTimestampMs = timestampMilliseconds(firstLiveTimestamp)
  const liveMayHaveEarlier = target.mode === "live" && liveHistoryUntil === null && (
    liveBuffer.truncated || (
      firstLiveTimestampMs !== null &&
      firstLiveTimestampMs > lowerBound + LOG_BOUNDARY_PADDING_MILLISECONDS
    )
  )
  const hasUnloadedEarlier = historyUpperBound !== null
    ? Boolean(historyQuery.hasNextPage)
    : liveMayHaveEarlier
  const loadingOlder = historyQuery.isFetchingNextPage || (
    target.mode === "live" &&
    liveHistoryUntil !== null &&
    historyQuery.isPending
  )

  useExpireSession(historyQuery.error)
  useExpireSession(liveError)

  useEffect(() => {
    return () => {
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current)
    }
  }, [])

  useEffect(() => {
    setLiveHistoryUntil(null)
    retainAllLive.current = false
  }, [jobId, stageCode, target.mode])

  useEffect(() => {
    if (target.mode !== "live") {
      setLiveState("idle")
      return
    }
    const controller = new AbortController()
    let streamed: LogBuffer = { text: "", truncated: false }
    setLiveBuffer(streamed)
    setLiveError(null)
    setLiveState("connecting")
    const follow = async () => {
      while (!controller.signal.aborted) {
        await streamJobLogs(jobId, target.target_id, controller.signal, (chunk) => {
          streamed = appendLogChunk(streamed, chunk, retainAllLive.current)
          setLiveState("streaming")
          setLiveBuffer(streamed)
        })
        if (controller.signal.aborted) return
        setLiveState("connecting")
        await new Promise((resolve) => window.setTimeout(resolve, 1_000))
      }
    }
    void follow().catch((error: unknown) => {
        if (controller.signal.aborted) return
        setLiveError(error)
        setLiveState("error")
      })
    return () => controller.abort()
  }, [jobId, target.mode, target.target_id])

  useLayoutEffect(() => {
    const element = output.current
    if (!element) return
    const restore = pendingScrollRestore.current
    if (restore) {
      const pageCount = historyQuery.data?.pages.length ?? 0
      if (pageCount <= restore.pageCount) return
      element.scrollTop = restore.scrollTop +
        (element.scrollHeight - restore.scrollHeight)
      pendingScrollRestore.current = null
      return
    }
    if (stickToBottom.current) element.scrollTop = element.scrollHeight
  }, [text, historyQuery.data?.pages.length])

  useEffect(() => {
    if (historyQuery.isError || historyQuery.isFetchNextPageError) {
      pendingScrollRestore.current = null
    }
  }, [historyQuery.isError, historyQuery.isFetchNextPageError])

  function rememberScrollPosition() {
    const element = output.current
    if (!element) return
    pendingScrollRestore.current = {
      pageCount: historyQuery.data?.pages.length ?? 0,
      scrollHeight: element.scrollHeight,
      scrollTop: element.scrollTop,
    }
  }

  function loadEarlier() {
    if (loadingOlder || !hasUnloadedEarlier) return
    if (target.mode === "live" && liveHistoryUntil === null) {
      const until = firstLiveTimestampMs !== null && firstLiveTimestampMs > lowerBound
        ? firstLiveTimestampMs
        : Date.now()
      rememberScrollPosition()
      retainAllLive.current = true
      setLiveHistoryUntil(until)
      return
    }
    rememberScrollPosition()
    void historyQuery.fetchNextPage()
  }

  const statusLabel = target.mode === "historical"
    ? historyQuery.isError
      ? "Log fetch failed"
      : historyQuery.isPending
        ? "Fetching logs…"
        : "Fetched logs"
    : liveState === "connecting"
      ? "Connecting…"
      : liveState === "streaming"
        ? "Streaming logs"
        : liveState === "ended"
          ? "Stream ended"
          : liveState === "error"
            ? "Log stream stopped"
            : "Waiting"
  const logError = historyQuery.error ?? liveError
  const logsLoading = target.mode === "historical"
    ? historyQuery.isPending
    : liveState === "connecting"
  const logsEnded = target.mode === "historical"
    ? historyQuery.isSuccess && !historyQuery.hasNextPage
    : liveState === "ended"
  const noLogs = logsEnded && !text.trim()

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p
            aria-atomic="true"
            aria-live="polite"
            className="text-sm font-medium"
            role="status"
          >
            {statusLabel}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {target.function_name}
            {target.status === "state_unknown" ? " · status unknown" : ""}
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          <Button
            disabled={!text}
            onClick={() => {
              void copyText(text)
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
            {copied
              ? "Copied"
              : hasUnloadedEarlier
                ? "Copy loaded logs"
                : "Copy logs"}
          </Button>
          <Button
            disabled={!text}
            onClick={() =>
              downloadLog(
                text,
                logDownloadFilename(new Date(), toolSlug, stageCode)
              )
            }
            size="sm"
            variant="outline"
          >
            <Download aria-hidden="true" />
            {hasUnloadedEarlier ? "Download loaded logs" : "Download logs"}
          </Button>
        </div>
      </div>

      <div
        className="mt-4 max-h-80 min-h-40 overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-5 text-slate-100"
        onScroll={(event) => {
          const element = event.currentTarget
          stickToBottom.current =
            element.scrollHeight - element.scrollTop - element.clientHeight < 32
          if (element.scrollTop < 32) loadEarlier()
        }}
        ref={output}
      >
        {text ? (
          <>
            <div className="mb-2 flex min-h-5 items-center justify-center font-sans text-[10px] text-slate-400">
              {loadingOlder ? (
                <>
                  <LoaderCircle aria-hidden="true" className="mr-1 size-3 animate-spin" />
                  Loading earlier logs…
                </>
              ) : hasUnloadedEarlier ? (
                <button
                  className="rounded px-2 py-0.5 transition-colors hover:bg-slate-800 hover:text-slate-200 active:bg-slate-700"
                  onClick={loadEarlier}
                  type="button"
                >
                  Scroll up or click to load earlier logs
                </button>
              ) : (
                "Beginning of available stage logs"
              )}
            </div>
            {renderedLines.map((line, index) => (
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
                  <AnsiLogMessage segments={line.segments} />
                </span>
              </div>
            ))}
          </>
        ) : (
          <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-slate-300">
            {loadingOlder ? (
              <>
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                Loading earlier logs…
              </>
            ) : hasUnloadedEarlier ? (
              <button
                className="rounded px-3 py-1 transition-colors hover:bg-slate-800 hover:text-slate-100 active:bg-slate-700"
                onClick={loadEarlier}
                type="button"
              >
                Load earlier logs
              </button>
            ) : (
              <>
                {logsLoading ? (
                  <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                ) : null}
                {noLogs
                  ? "Modal returned no logs for this stage. They may no longer be retained."
                  : target.mode === "historical"
                    ? "Fetching logs from Modal…"
                    : "Waiting for log output…"}
              </>
            )}
          </div>
        )}
      </div>

      {hasUnloadedEarlier ? (
        <p className="mt-2 text-xs text-amber-700">
          Copy and download include only the log windows loaded in this view.
        </p>
      ) : null}
      {logError ? (
        <p className="mt-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          {streamFailureMessage(logError)}
        </p>
      ) : null}
    </>
  )
}

export default function StageLogs({
  jobId,
  stageCode,
  stageLabel,
  toolSlug,
}: StageLogsProps) {
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null)
  const targetsQuery = useQuery({
    queryKey: ["jobs", jobId, "log-targets", stageCode],
    queryFn: ({ signal }) => inspectJobLogTargets(jobId, stageCode, signal),
    retry: 1,
    refetchInterval(query) {
      const target = query.state.data?.targets.find(
        (candidate) => candidate.stage_code === stageCode
      )
      return target?.mode === "live" ? 10_000 : false
    },
    refetchIntervalInBackground: false,
  })
  const candidates = (targetsQuery.data?.targets ?? [])
    .filter((candidate) => candidate.stage_code === stageCode)
    .toSorted((left, right) => {
      if (left.mode !== right.mode) return left.mode === "live" ? -1 : 1
      return Date.parse(right.started_at ?? "") - Date.parse(left.started_at ?? "")
    })
  const targetCandidate = candidates.find(
    (candidate) => candidate.target_id === selectedTargetId
  ) ?? candidates[0]
  const awaitingFreshTarget = !targetsQuery.isError &&
    !targetsQuery.isFetchedAfterMount
  const target = awaitingFreshTarget ? undefined : targetCandidate
  useExpireSession(targetsQuery.error)

  return (
    <section
      aria-label={`Logs for ${stageLabel}`}
      className="min-w-0 rounded-lg border bg-background p-4"
      id={`stage-logs-${stageCode}`}
    >
      {awaitingFreshTarget ? (
        <div className="flex min-h-40 items-center justify-center gap-2 rounded-lg bg-slate-950 text-sm text-slate-300">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Finding this Modal Function Call…
        </div>
      ) : targetsQuery.isError ? (
        <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          {streamFailureMessage(targetsQuery.error)}
        </p>
      ) : !target ? (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950" role="status">
          Logs are not available for this stage. Modal may no longer retain this Function Call.
        </p>
      ) : (
        <>
          {candidates.length > 1 ? (
            <label className="mb-4 block text-sm font-medium">
              Function call
              <select
                className="mt-1 block w-full rounded-lg border bg-background px-3 py-2 font-normal"
                onChange={(event) => setSelectedTargetId(event.target.value)}
                value={target.target_id}
              >
                {candidates.map((candidate) => (
                  <option key={candidate.target_id} value={candidate.target_id}>
                    {candidate.function_name} · {candidate.status}
                    {candidate.started_at
                      ? ` · ${new Date(candidate.started_at).toLocaleString()}`
                      : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <StageLogViewer
            jobId={jobId}
            stageCode={stageCode}
            target={target}
            toolSlug={toolSlug}
          />
        </>
      )}
    </section>
  )
}
