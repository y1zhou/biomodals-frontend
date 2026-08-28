import { AlertDialog } from "@base-ui/react/alert-dialog"
import { Popover } from "@base-ui/react/popover"
import { Tooltip } from "@base-ui/react/tooltip"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertTriangle,
  Check,
  Copy,
  Lock,
  LockOpen,
  LoaderCircle,
  RotateCcw,
  Save,
  X,
} from "lucide-react"
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type FormEvent,
} from "react"

import {
  adminModalKey,
  changedModalEnvironmentSettings,
  changedModalToolSettings,
  mergeAdminModalEnvironment,
  mergeAdminModalTool,
  modalEnvironmentCost,
  modalToolSettingLabels,
  nonnegativeInteger,
  positiveInteger,
  settingSourceNote,
  type SettingSource,
} from "@/admin"
import {
  ApiError,
  apiErrorCode,
  apiRequestId,
  inspectAdminCosts,
  inspectAdminModal,
  resolveAdminStateUnknownJob,
  updateAdminModalEnvironment,
  updateAdminModalTool,
  type AdminCosts,
  type AdminModal,
  type AdminModalEnvironment,
  type AdminStateUnknownJob,
  type AdminModalTool,
  type UpdateAdminModalEnvironmentInput,
  type UpdateAdminModalToolInput,
} from "@/api/client"
import { useExpireSession } from "@/auth-state"
import { RefreshButton } from "@/components/RefreshButton"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DatePickerField } from "@/components/ui/date-picker-field"
import { Input } from "@/components/ui/input"
import {
  formatTimestamp,
  useDocumentVisibility,
  visibilityPollingInterval,
} from "@/jobs"
import { copyText } from "@/lib/clipboard"
import { cn } from "@/lib/utils"
import { toolName } from "@/tools"

type CostInterval = "month" | "today" | "7d" | "30d" | "previous" | "custom"

function dateValue(date: Date) {
  return date.toISOString().slice(0, 10)
}

function costDateRange(interval: Exclude<CostInterval, "custom">, now = new Date()) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  if (interval === "month") {
    return {
      start: dateValue(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))),
      end: dateValue(today),
    }
  }
  if (interval === "today") {
    return { start: dateValue(today), end: dateValue(today) }
  }
  if (interval === "previous") {
    return {
      start: dateValue(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1))),
      end: dateValue(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0))),
    }
  }
  const start = new Date(today)
  start.setUTCDate(start.getUTCDate() - (interval === "7d" ? 6 : 29))
  return { start: dateValue(start), end: dateValue(today) }
}

function billingBounds(start: string, end: string) {
  const exclusiveEnd = new Date(`${end}T00:00:00.000Z`)
  exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1)
  return {
    start: `${start}T00:00:00.000Z`,
    end: exclusiveEnd.toISOString(),
  }
}

function currency(value: string) {
  const number = Number(value)
  return Number.isFinite(number)
    ? new Intl.NumberFormat(undefined, { currency: "USD", style: "currency" }).format(number)
    : value
}

function CostsCard({ environmentName }: { environmentName: string }) {
  const queryClient = useQueryClient()
  const initial = costDateRange("month")
  const [interval, setInterval] = useState<CostInterval>("month")
  const [start, setStart] = useState(initial.start)
  const [end, setEnd] = useState(initial.end)
  const validRange = Boolean(start && end && start <= end)
  const bounds = validRange ? billingBounds(start, end) : null
  const queryKey = ["admin", "modal", "costs", bounds?.start, bounds?.end] as const
  const costs = useQuery({
    enabled: Boolean(bounds),
    queryKey,
    queryFn: ({ signal }) =>
      inspectAdminCosts(bounds!.start, bounds!.end, false, signal),
    retry: false,
    staleTime: 5 * 60_000,
  })
  const refresh = useMutation({
    mutationFn: () => inspectAdminCosts(bounds!.start, bounds!.end, true),
    onSuccess: (result) => queryClient.setQueryData(queryKey, result),
  })
  useExpireSession(costs.error)
  useExpireSession(refresh.error)

  function chooseInterval(next: Exclude<CostInterval, "custom">) {
    const range = costDateRange(next)
    setInterval(next)
    setStart(range.start)
    setEnd(range.end)
  }

  const report: AdminCosts | undefined = costs.data
  const failure = refresh.error ?? costs.error
  const presetLabels = {
    month: "Current month",
    today: "Today",
    "7d": "Last 7 days",
    "30d": "Last 30 days",
    previous: "Previous month",
  } as const
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle>Costs</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Modal workspace usage for the selected interval. Reports may be unavailable on some workspace plans.</p>
          </div>
          <RefreshButton
            disabled={!bounds || costs.isFetching || refresh.isPending}
            onRefresh={async () => {
              if (bounds) await refresh.mutateAsync()
            }}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap gap-2">
          {(["month", "today", "7d", "30d", "previous"] as const).map((value) => (
            <Button key={value} onClick={() => chooseInterval(value)} size="sm" type="button" variant={interval === value ? "default" : "outline"}>
              {presetLabels[value]}
            </Button>
          ))}
          <Button onClick={() => setInterval("custom")} size="sm" type="button" variant={interval === "custom" ? "default" : "outline"}>Custom</Button>
        </div>
        {interval === "custom" ? (
          <div className="grid max-w-xl gap-3 sm:grid-cols-2">
            <div><label className="mb-1 block text-xs text-muted-foreground">Start date</label><DatePickerField aria-label="Billing start date" onValueChange={setStart} value={start} /></div>
            <div><label className="mb-1 block text-xs text-muted-foreground">End date</label><DatePickerField aria-label="Billing end date" onValueChange={setEnd} value={end} /></div>
          </div>
        ) : null}
        {!validRange ? <p className="text-sm text-destructive">Choose an end date on or after the start date.</p> : null}
        {failure ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="alert">
            <p className="font-medium">Modal billing could not be loaded.</p>
            <p className="mt-1">{errorMessage(failure)}</p>
            <Button className="mt-3" disabled={!bounds || refresh.isPending} onClick={() => refresh.mutate()} size="sm" variant="outline">Refresh</Button>
          </div>
        ) : costs.isPending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading billing report…</p>
        ) : report ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-muted p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Total workspace cost</p><p className="mt-1 font-heading text-3xl font-semibold tabular-nums">{currency(report.total)}</p></div>
              <div className="rounded-xl bg-muted p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Current environment cost</p><p className="mt-1 font-heading text-3xl font-semibold tabular-nums">{currency(modalEnvironmentCost(report, environmentName))}</p><p className="mt-1 text-xs text-muted-foreground">{environmentName}</p></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><h3 className="text-sm font-medium">Tools</h3><ul className="mt-2 space-y-2 text-sm">{report.tools.map((group) => <li className="flex justify-between gap-3" key={group.name}><span>{toolName(group.name)}</span><span className="tabular-nums">{currency(group.cost)}</span></li>)}{!report.tools.length ? <li className="text-muted-foreground">No tagged Tool usage</li> : null}<li className="flex justify-between gap-3 text-muted-foreground"><span>Other / untagged</span><span className="tabular-nums">{currency(report.other_workspace_usage)}</span></li></ul></div>
              <div className="sm:border-l sm:border-border/60 sm:pl-4"><h3 className="text-sm font-medium">Environments</h3><ul className="mt-2 space-y-2 text-sm">{report.environments.map((group) => <li className="flex justify-between gap-3" key={group.name}><span>{group.name}</span><span className="tabular-nums">{currency(group.cost)}</span></li>)}</ul></div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    const expected = new Set([
      "modal_preflight_failed",
      "origin_not_allowed",
      "setting_invalid",
      "job_state_changed",
    ])
    const support =
      !expected.has(apiErrorCode(error) ?? "") && error.requestId
        ? ` Support ID: ${error.requestId}.`
        : ""
    return `${error.message}${support}`
  }
  return "The Modal configuration request failed."
}

const stateUnknownReasons: Record<string, string> = {
  submission_outcome_unknown: "Submission could not be confirmed",
  submission_in_progress: "Submission was interrupted before confirmation",
  provider_outcome_unknown: "Modal call status could not be confirmed",
}

function stateUnknownReason(reason: AdminStateUnknownJob["reason"]) {
  return stateUnknownReasons[reason] ?? reason.replaceAll("_", " ")
}

function StateUnknownJobsCard({
  jobs,
  tools,
}: {
  jobs: readonly AdminStateUnknownJob[]
  tools: readonly AdminModalTool[]
}) {
  const queryClient = useQueryClient()
  const confirmationDialog = useRef<HTMLDialogElement>(null)
  const [selected, setSelected] = useState<AdminStateUnknownJob | null>(null)
  const [functionCallId, setFunctionCallId] = useState("")
  const resolution = useMutation({
    mutationFn: ({
      jobId,
      input,
    }: {
      jobId: string
      input: Parameters<typeof resolveAdminStateUnknownJob>[1]
    }) => resolveAdminStateUnknownJob(jobId, input),
    onSuccess(result) {
      queryClient.setQueryData(adminModalKey, result)
      confirmationDialog.current?.close()
      setSelected(null)
      setFunctionCallId("")
    },
  })
  useExpireSession(resolution.error)

  if (!jobs.length) return null

  return (
    <>
      <Card className="border-amber-300 bg-amber-50 text-amber-950">
        <CardHeader>
          <CardTitle>Jobs with unknown remote status</CardTitle>
          <p className="text-sm leading-6">
            Check each job in Modal before returning it to reconciliation.
          </p>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead className="border-y border-amber-300/70 bg-amber-100/60 text-xs text-amber-950/70">
                <tr>
                  <th className="px-6 py-3 font-medium" scope="col">Job</th>
                  <th className="px-6 py-3 font-medium" scope="col">Tool</th>
                  <th className="px-6 py-3 font-medium" scope="col">Reason</th>
                  <th className="px-6 py-3 font-medium" scope="col">Since</th>
                  <th className="px-6 py-3 font-medium" scope="col">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-300/70">
                {jobs.map((job) => (
                  <tr key={job.job_id}>
                    <td className="px-6 py-4 align-top">
                      <span className="font-medium">{job.display_name}</span>
                      <span className="mt-1 block break-all font-mono text-[0.7rem] text-amber-950/70">
                        {job.job_id}
                      </span>
                    </td>
                    <td className="px-6 py-4 align-top">
                      {tools.find((tool) => tool.tool === job.tool)?.display_name ??
                        job.tool}
                    </td>
                    <td className="px-6 py-4 align-top">
                      {stateUnknownReason(job.reason)}
                    </td>
                    <td className="px-6 py-4 align-top">
                      {formatTimestamp(job.state_unknown_at)}
                    </td>
                    <td className="px-6 py-4 align-top">
                      <Button
                        disabled={resolution.isPending}
                        onClick={() => {
                          resolution.reset()
                          setSelected(job)
                          setFunctionCallId(job.root_function_call_id ?? "")
                          confirmationDialog.current?.showModal()
                        }}
                        size="sm"
                        variant="destructive"
                      >
                        Resolve
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <dialog
        aria-labelledby="resolve-state-unknown-title"
        className="m-auto w-[min(30rem,calc(100%-2rem))] rounded-xl border bg-background p-0 text-foreground shadow-2xl backdrop:bg-foreground/30"
        onCancel={(event) => {
          if (resolution.isPending) event.preventDefault()
        }}
        onClose={() => {
          if (!resolution.isPending) setSelected(null)
        }}
        ref={confirmationDialog}
      >
        <div className="p-6">
          <h2 className="font-heading text-xl font-semibold" id="resolve-state-unknown-title">
            Resolve this unknown launch
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Check the exact deployment in Modal first. Resume an existing Function Call, requeue only after confirming no launch occurred, or cancel the run.
          </p>
          {selected ? (
            <>
              <p className="mt-3 break-all text-sm font-medium">{selected.display_name} · {selected.job_id}</p>
              <dl className="mt-4 grid gap-2 rounded-lg bg-muted p-3 text-sm">
                <div>
                  <dt className="font-medium">Pinned deployment</dt>
                  <dd className="break-all font-mono text-xs text-muted-foreground">
                    {selected.modal_environment} / {selected.modal_app_name} / v{selected.modal_app_version}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">Diagnostic</dt>
                  <dd className="text-muted-foreground">
                    {selected.diagnostic_message ?? "No diagnostic message was recorded."}
                  </dd>
                </div>
              </dl>
              <label className="mt-4 block text-sm font-medium" htmlFor="root-function-call-id">
                Existing Function Call ID
              </label>
              <Input
                className="mt-2 font-mono"
                id="root-function-call-id"
                onChange={(event) => setFunctionCallId(event.target.value)}
                placeholder="fc-…"
                value={functionCallId}
              />
            </>
          ) : null}
          {resolution.error ? (
            <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {errorMessage(resolution.error)}
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <Button
              disabled={resolution.isPending}
              onClick={() => confirmationDialog.current?.close()}
              variant="ghost"
            >
              Keep unresolved
            </Button>
            <Button
              disabled={resolution.isPending || !selected}
              onClick={() => {
                if (selected) resolution.mutate({
                  jobId: selected.job_id,
                  input: { resolution: "cancel" },
                })
              }}
              variant="destructive"
            >
              Cancel run
            </Button>
            <Button
              disabled={resolution.isPending || !selected}
              onClick={() => {
                if (selected) resolution.mutate({
                  jobId: selected.job_id,
                  input: { resolution: "requeue" },
                })
              }}
              variant="outline"
            >
              Requeue — no launch occurred
            </Button>
            <Button
              disabled={resolution.isPending || !selected || !functionCallId.trim()}
              onClick={() => {
                if (selected) resolution.mutate({
                  jobId: selected.job_id,
                  input: {
                    resolution: "resume",
                    function_call_id: functionCallId.trim(),
                  },
                })
              }}
            >
              {resolution.isPending ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : null}
              Resume existing launch
            </Button>
          </div>
        </div>
      </dialog>
    </>
  )
}

function SourceNote({
  omitConfigurationFileNote = false,
  source,
}: {
  omitConfigurationFileNote?: boolean
  source: SettingSource
}) {
  if (omitConfigurationFileNote && source === "configuration_file") return null
  const note = settingSourceNote(source)
  return note ? <span className="mt-1 text-xs text-muted-foreground">{note}</span> : null
}

function SettingRestoreButton({
  className,
  description,
  disabled,
  onRestore,
  pending,
}: {
  className?: string
  description: string
  disabled: boolean
  onRestore: () => void
  pending: boolean
}) {
  const [spinning, setSpinning] = useState(false)
  const spinTimer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (spinTimer.current !== null) window.clearTimeout(spinTimer.current)
    }
  }, [])

  return (
    <Button
      aria-label={description}
      className={className}
      disabled={disabled}
      onClick={() => {
        if (spinTimer.current !== null) window.clearTimeout(spinTimer.current)
        setSpinning(true)
        spinTimer.current = window.setTimeout(() => setSpinning(false), 450)
        onRestore()
      }}
      size="icon"
      title={description}
      type="button"
      variant="outline"
    >
      {pending ? (
        <LoaderCircle aria-hidden="true" className="animate-spin" />
      ) : (
        <RotateCcw
          aria-hidden="true"
          className={cn(
            spinning &&
              "animate-[spin_450ms_ease-out_reverse] motion-reduce:animate-none"
          )}
        />
      )}
    </Button>
  )
}

function RuntimeSettingInput({
  label,
  onChange,
  onRestoreOverride,
  omitConfigurationFileNote,
  pending,
  setting,
  value,
  ...inputProps
}: Omit<
  ComponentProps<typeof Input>,
  "className" | "disabled" | "onChange" | "value"
> & {
  label: string
  onChange: (value: string) => void
  onRestoreOverride: () => void
  omitConfigurationFileNote?: boolean
  pending: boolean
  setting: { editable: boolean; source: SettingSource; value: string | number }
  value: string
}) {
  const canRestore = setting.source === "database" || value !== String(setting.value)
  const restoreDescription = `Restore ${label} to its configured default`

  return (
    <>
      <div className="flex">
        <Input
          {...inputProps}
          className={setting.editable ? "rounded-r-none" : undefined}
          disabled={!setting.editable || pending}
          onChange={(event) => onChange(event.target.value)}
          value={value}
        />
        {setting.editable ? (
          <SettingRestoreButton
            className="rounded-l-none border-l-0"
            description={restoreDescription}
            disabled={pending || !canRestore}
            onRestore={() => {
              if (setting.source === "database") {
                onRestoreOverride()
              } else {
                onChange(String(setting.value))
              }
            }}
            pending={pending}
          />
        ) : null}
      </div>
      <SourceNote
        omitConfigurationFileNote={omitConfigurationFileNote}
        source={setting.source}
      />
    </>
  )
}

function JobLogAccessSetting({
  onChange,
  onRestoreOverride,
  pending,
  setting,
  toolName,
  value,
}: {
  onChange: (value: boolean) => void
  onRestoreOverride: () => void
  pending: boolean
  setting: AdminModalTool["job_logs_visible_to_owner"]
  toolName: string
  value: boolean
}) {
  const inputId = useId()
  const canRestore = setting.source === "database" || value !== setting.value
  const restoreDescription = `Restore Job log access for ${toolName} to its default`
  const stateLabel = value ? "Job owners" : "Admins only"

  return (
    <div className="mx-auto inline-flex items-center gap-1.5">
      <Tooltip.Root>
        <Tooltip.Trigger
          className={cn(
            "relative h-6 w-12 shrink-0 rounded-full text-xs transition-all duration-200 outline-none hover:brightness-90 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100",
            pending ? "cursor-not-allowed opacity-50" : "cursor-pointer",
            value ? "text-neutral-700" : "text-white"
          )}
          closeOnClick={false}
          data-slot="job-log-access-toggle"
          render={<label htmlFor={inputId} />}
        >
          <input
            aria-label={`Allow Job owners to view logs for ${toolName}`}
            checked={value}
            className="peer sr-only"
            disabled={pending}
            id={inputId}
            onChange={(event) => onChange(event.target.checked)}
            type="checkbox"
          />
          <span
            aria-hidden="true"
            className={cn(
              "absolute inset-0 rounded-full transition-colors duration-200 peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 peer-focus-visible:ring-offset-2 motion-reduce:transition-none",
              value ? "bg-neutral-300" : "bg-black"
            )}
            data-slot="job-log-access-track"
          />
          <span
            aria-hidden="true"
            className={cn(
              "absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-sm transition-transform duration-200 motion-reduce:transition-none",
              value ? "translate-x-0" : "translate-x-6"
            )}
            data-slot="job-log-access-thumb"
          />
          {value ? (
            <LockOpen
              aria-hidden="true"
              className="absolute top-1.5 right-1.5 size-3"
              data-slot="job-log-access-icon"
            />
          ) : (
            <Lock
              aria-hidden="true"
              className="absolute top-1.5 left-1.5 size-3"
              data-slot="job-log-access-icon"
            />
          )}
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Positioner className="z-50" side="top" sideOffset={7}>
            <Tooltip.Popup
              className="origin-[var(--transform-origin)] rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background shadow-lg transition-[scale,opacity] duration-100 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0"
              role="tooltip"
            >
              {stateLabel}
            </Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
      <SettingRestoreButton
        description={restoreDescription}
        disabled={pending || !canRestore}
        onRestore={() => {
          if (setting.source === "database") {
            onRestoreOverride()
          } else {
            onChange(setting.value)
          }
        }}
        pending={pending}
      />
    </div>
  )
}

function ToolSettingErrorPopover({
  anchor,
  error,
  fields,
  onDismiss,
  toolName,
}: {
  anchor: HTMLButtonElement | null
  error: unknown
  fields: readonly string[]
  onDismiss: () => void
  toolName: string
}) {
  const titleId = useId()
  const attemptedFields = fields.length ? fields : ["Tool settings"]

  return (
    <Popover.Root
      onOpenChange={(open) => {
        if (!open) onDismiss()
      }}
      open
    >
      <Popover.Portal>
        <Popover.Positioner
          align="end"
          anchor={anchor}
          className="z-50"
          collisionPadding={12}
          side="top"
          sideOffset={8}
        >
          <Popover.Popup
            aria-labelledby={titleId}
            className="relative w-80 max-w-[calc(100vw-1.5rem)] rounded-xl border border-destructive/30 bg-popover p-4 pr-10 text-left text-popover-foreground shadow-lg outline-none data-[ending-style]:opacity-0 data-[starting-style]:opacity-0"
            initialFocus={false}
            role="alert"
          >
            <Popover.Title
              className="flex items-start gap-2 text-sm font-semibold"
              id={titleId}
            >
              <AlertTriangle
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-destructive"
              />
              Could not save {toolName} settings
            </Popover.Title>
            <p className="mt-2 text-xs font-medium text-muted-foreground">
              {attemptedFields.length === 1 ? "Field not saved" : "Fields not saved"}
            </p>
            <ul className="mt-1 space-y-0.5 text-sm font-medium">
              {attemptedFields.map((field) => <li key={field}>{field}</li>)}
            </ul>
            <p className="mt-3 text-sm leading-5 text-destructive">
              {errorMessage(error)}
            </p>
            <Popover.Close
              render={(
                <Button
                  aria-label={`Dismiss ${toolName} settings error`}
                  className="absolute top-2 right-2"
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                />
              )}
            >
              <X aria-hidden="true" />
            </Popover.Close>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

type ToolDraft = {
  appVersion: string
  activeJobLimit: string
  jobLogsVisibleToOwner: boolean
  versionDirty: boolean
  limitDirty: boolean
  jobLogAccessDirty: boolean
}

type ToolUpdate = {
  tool: string
  input: UpdateAdminModalToolInput
}

type ToolFailure = ToolUpdate & {
  error: unknown
  toolName: string
}

function initialToolDraft(tool: AdminModalTool): ToolDraft {
  return {
    appVersion: String(tool.modal_app_version.value),
    activeJobLimit: String(tool.active_job_limit.value),
    jobLogsVisibleToOwner: tool.job_logs_visible_to_owner.value,
    versionDirty: false,
    limitDirty: false,
    jobLogAccessDirty: false,
  }
}

function ToolRow({
  draft,
  onChange,
  onRestore,
  pendingFields,
  tool,
}: {
  draft: ToolDraft
  onChange: (draft: ToolDraft) => void
  onRestore: (input: UpdateAdminModalToolInput) => void
  pendingFields: ReadonlySet<keyof UpdateAdminModalToolInput>
  tool: AdminModalTool
}) {
  const versionPending = pendingFields.has("modal_app_version")
  const limitPending = pendingFields.has("active_job_limit")
  const jobLogAccessPending = pendingFields.has("job_logs_visible_to_owner")
  const displayName = tool.display_name
  const overLimit = tool.active_jobs > tool.active_job_limit.value

  return (
    <tr className="border-b last:border-0">
      <td className="px-3 py-4 text-center align-middle text-sm font-medium">{displayName}</td>
      <td className="py-4 pr-3 pl-3 text-center align-middle">
        <div className="mx-auto flex min-w-40 items-start justify-center gap-2 whitespace-nowrap">
          <span
            className={cn(
              "flex h-8 shrink-0 items-center text-sm tabular-nums",
              overLimit && "font-semibold text-amber-700"
            )}
          >
            {tool.active_jobs} /
          </span>
          <div className="w-24 shrink-0 whitespace-normal">
            <RuntimeSettingInput
              aria-label={`Active job limit for ${displayName}`}
              label={`active job limit for ${displayName}`}
              min={0}
              onChange={(value) => {
                onChange({
                  ...draft,
                  activeJobLimit: value,
                  limitDirty:
                    nonnegativeInteger(value) !== tool.active_job_limit.value,
                })
              }}
              onRestoreOverride={() => onRestore({ active_job_limit: null })}
              pending={limitPending}
              setting={tool.active_job_limit}
              type="number"
              value={draft.activeJobLimit}
            />
            {overLimit ? (
              <p className="mt-1 text-xs font-medium text-amber-700">
                Over limit; new jobs are blocked.
              </p>
            ) : null}
          </div>
        </div>
      </td>
      <td className="px-2 py-4 text-center align-middle">
        <div className="mx-auto max-w-28">
          <RuntimeSettingInput
            aria-label={`Modal deployment version for ${displayName}`}
            label={`Modal deployment version for ${displayName}`}
            min={1}
            onChange={(value) => {
                onChange({
                  ...draft,
                  appVersion: value,
                  versionDirty:
                    positiveInteger(value) !== tool.modal_app_version.value,
                })
              }}
            onRestoreOverride={() => onRestore({ modal_app_version: null })}
            omitConfigurationFileNote
            pending={versionPending}
            setting={tool.modal_app_version}
            type="number"
            value={draft.appVersion}
          />
        </div>
      </td>
      <td className="px-2 py-4 text-center align-middle">
        <JobLogAccessSetting
          onChange={(value) => {
            onChange({
              ...draft,
              jobLogsVisibleToOwner: value,
              jobLogAccessDirty:
                value !== tool.job_logs_visible_to_owner.value,
            })
          }}
          onRestoreOverride={() => onRestore({ job_logs_visible_to_owner: null })}
          pending={jobLogAccessPending}
          setting={tool.job_logs_visible_to_owner}
          toolName={displayName}
          value={draft.jobLogsVisibleToOwner}
        />
      </td>
    </tr>
  )
}

export default function ModalAdminPage() {
  const queryClient = useQueryClient()
  const visibility = useDocumentVisibility()
  const modal = useQuery({
    queryKey: adminModalKey,
    queryFn: ({ signal }) => inspectAdminModal(signal),
    refetchInterval: visibilityPollingInterval(visibility),
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  })
  const [environmentName, setEnvironmentName] = useState("")
  const [globalActiveJobLimit, setGlobalActiveJobLimit] = useState("")
  const [environmentDirty, setEnvironmentDirty] = useState(false)
  const [globalLimitDirty, setGlobalLimitDirty] = useState(false)
  const [tokenCopied, setTokenCopied] = useState(false)
  const [toolDrafts, setToolDrafts] = useState<Record<string, ToolDraft>>({})
  const [toolFailure, setToolFailure] = useState<ToolFailure | null>(null)
  const [restoreAllConfirmationOpen, setRestoreAllConfirmationOpen] =
    useState(false)
  const [toolsSaveButton, setToolsSaveButton] =
    useState<HTMLButtonElement | null>(null)
  function environmentMutationOptions() {
    return {
      mutationFn: updateAdminModalEnvironment,
      scope: { id: "admin-modal-environment" },
      onSuccess(
        result: AdminModalEnvironment,
        input: UpdateAdminModalEnvironmentInput
      ) {
        queryClient.setQueryData<AdminModal>(adminModalKey, (modal) =>
          modal ? mergeAdminModalEnvironment(modal, result) : modal
        )
        if (Object.hasOwn(input, "modal_environment")) {
          setEnvironmentName(result.modal_environment.value)
          setEnvironmentDirty(false)
        }
        if (Object.hasOwn(input, "global_active_job_limit")) {
          setGlobalActiveJobLimit(String(result.global_active_job_limit.value))
          setGlobalLimitDirty(false)
        }
        void queryClient.invalidateQueries({ queryKey: adminModalKey })
      },
    }
  }
  const environmentUpdate = useMutation(environmentMutationOptions())
  const globalLimitUpdate = useMutation(environmentMutationOptions())
  function applyToolUpdate(update: ToolUpdate, result: AdminModalTool) {
    const savedVersion = Object.hasOwn(update.input, "modal_app_version")
    const savedLimit = Object.hasOwn(update.input, "active_job_limit")
    const savedLogAccess = Object.hasOwn(
      update.input,
      "job_logs_visible_to_owner"
    )
    queryClient.setQueryData<AdminModal>(adminModalKey, (current) =>
      current ? mergeAdminModalTool(current, result) : current
    )
    setToolDrafts((current) => {
      const draft = current[result.tool] ?? initialToolDraft(result)
      return {
        ...current,
        [result.tool]: {
          appVersion: savedVersion
            ? String(result.modal_app_version.value)
            : draft.appVersion,
          activeJobLimit: savedLimit
            ? String(result.active_job_limit.value)
            : draft.activeJobLimit,
          jobLogsVisibleToOwner: savedLogAccess
            ? result.job_logs_visible_to_owner.value
            : draft.jobLogsVisibleToOwner,
          versionDirty: savedVersion ? false : draft.versionDirty,
          limitDirty: savedLimit ? false : draft.limitDirty,
          jobLogAccessDirty: savedLogAccess ? false : draft.jobLogAccessDirty,
        },
      }
    })
  }
  const toolsUpdate = useMutation({
    mutationFn: async (updates: readonly ToolUpdate[]) => {
      for (const update of updates) {
        try {
          const result = await updateAdminModalTool(update.tool, update.input)
          applyToolUpdate(update, result)
        } catch (error) {
          const selected = modal.data?.tools.find(
            (tool) => tool.tool === update.tool
          )
          setToolFailure({
            ...update,
            error,
            toolName: selected?.display_name ?? update.tool,
          })
          throw error
        }
      }
    },
    scope: { id: "admin-modal-tools" },
    onMutate: () => setToolFailure(null),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: adminModalKey })
    },
  })
  const resetEnvironmentMutationErrors = () => {
    if (environmentUpdate.isPending || globalLimitUpdate.isPending) return
    environmentUpdate.reset()
    globalLimitUpdate.reset()
  }
  useExpireSession(modal.error)
  useExpireSession(environmentUpdate.error)
  useExpireSession(globalLimitUpdate.error)
  useExpireSession(toolsUpdate.error)

  const environment = modal.data?.environment
  useEffect(() => {
    if (environment && !environmentDirty) {
      setEnvironmentName(environment.modal_environment.value)
    }
  }, [environment, environmentDirty])
  useEffect(() => {
    if (environment && !globalLimitDirty) {
      setGlobalActiveJobLimit(String(environment.global_active_job_limit.value))
    }
  }, [environment, globalLimitDirty])
  useEffect(() => {
    if (!modal.data) return
    setToolDrafts((current) =>
      Object.fromEntries(
        modal.data.tools.map((tool) => {
          const draft = current[tool.tool]
          if (!draft) return [tool.tool, initialToolDraft(tool)]
          return [
            tool.tool,
            {
              appVersion: draft.versionDirty
                ? draft.appVersion
                : String(tool.modal_app_version.value),
              activeJobLimit: draft.limitDirty
                ? draft.activeJobLimit
                : String(tool.active_job_limit.value),
              jobLogsVisibleToOwner: draft.jobLogAccessDirty
                ? draft.jobLogsVisibleToOwner
                : tool.job_logs_visible_to_owner.value,
              versionDirty: draft.versionDirty,
              limitDirty: draft.limitDirty,
              jobLogAccessDirty: draft.jobLogAccessDirty,
            },
          ]
        })
      )
    )
  }, [modal.data])

  const changedEnvironmentSettings = environment
    ? changedModalEnvironmentSettings(
        environment,
        environmentName,
        globalActiveJobLimit
      )
    : {}
  const environmentHasChanges = Object.keys(changedEnvironmentSettings).length > 0
  const environmentMutationIncludes = (
    mutation: typeof environmentUpdate,
    field: keyof UpdateAdminModalEnvironmentInput
  ) =>
    mutation.isPending &&
    Boolean(mutation.variables && Object.hasOwn(mutation.variables, field))
  const environmentPending =
    environmentMutationIncludes(environmentUpdate, "modal_environment") ||
    environmentMutationIncludes(globalLimitUpdate, "modal_environment")
  const globalLimitPending =
    environmentMutationIncludes(environmentUpdate, "global_active_job_limit") ||
    environmentMutationIncludes(globalLimitUpdate, "global_active_job_limit")
  const anyEnvironmentPending =
    environmentUpdate.isPending || globalLimitUpdate.isPending
  const environmentError = environmentUpdate.error ?? globalLimitUpdate.error
  const normalizedGlobalLimit = nonnegativeInteger(globalActiveJobLimit)
  const changedToolUpdates: ToolUpdate[] = modal.data
    ? modal.data.tools.flatMap((tool) => {
        const draft = toolDrafts[tool.tool] ?? initialToolDraft(tool)
        const input = changedModalToolSettings(
          tool,
          draft.appVersion,
          draft.activeJobLimit,
          draft.jobLogsVisibleToOwner
        )
        return Object.keys(input).length ? [{ tool: tool.tool, input }] : []
      })
    : []
  const invalidToolDraft = modal.data?.tools.some((tool) => {
    const draft = toolDrafts[tool.tool] ?? initialToolDraft(tool)
    return (
      nonnegativeInteger(draft.activeJobLimit) === null ||
      (tool.modal_app_version.editable &&
        positiveInteger(draft.appVersion) === null)
    )
  })
  const canRestoreAllTools = Boolean(
    modal.data?.tools.some(
      (tool) =>
        tool.modal_app_version.source === "database" ||
        tool.active_job_limit.source === "database" ||
        tool.job_logs_visible_to_owner.source === "database"
    ) || changedToolUpdates.length
  )
  const pendingToolFields = (tool: string) =>
    new Set<keyof UpdateAdminModalToolInput>(
      (toolsUpdate.isPending ? (toolsUpdate.variables ?? []) : [])
        .filter((update) => update.tool === tool)
        .flatMap((update) =>
          Object.keys(update.input) as (keyof UpdateAdminModalToolInput)[]
        )
    )

  function saveEnvironment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!environment) return
    if (Object.hasOwn(changedEnvironmentSettings, "modal_environment")) {
      environmentUpdate.mutate(changedEnvironmentSettings)
    } else {
      globalLimitUpdate.mutate(changedEnvironmentSettings)
    }
  }

  function restoreAllTools() {
    if (!modal.data) return
    const updates = modal.data.tools.flatMap((tool) => {
      const input: UpdateAdminModalToolInput = {
        ...(tool.active_job_limit.editable ? { active_job_limit: null } : {}),
        ...(tool.job_logs_visible_to_owner.editable
          ? { job_logs_visible_to_owner: null }
          : {}),
        ...(tool.modal_app_version.editable ? { modal_app_version: null } : {}),
      }
      return Object.keys(input).length ? [{ tool: tool.tool, input }] : []
    })
    toolsUpdate.mutate(updates, {
      onSuccess: () => setRestoreAllConfirmationOpen(false),
    })
  }

  if (modal.isPending) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        Loading Modal configuration…
      </div>
    )
  }

  if (!modal.data) {
    return <p className="text-sm text-destructive" role="alert">{errorMessage(modal.error)}</p>
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Last updated {formatTimestamp(modal.dataUpdatedAt)}
        </p>
        <RefreshButton
          disabled={modal.isFetching}
          onRefresh={async () => {
            const result = await modal.refetch()
            if (result.isError) throw result.error
          }}
        />
      </div>

      {modal.isError ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" role="alert">
          Modal status could not be refreshed. Showing the last loaded values.
          {apiRequestId(modal.error) ? ` Support ID: ${apiRequestId(modal.error)}.` : ""}
        </p>
      ) : null}

      <StateUnknownJobsCard
        jobs={modal.data.state_unknown_jobs}
        tools={modal.data.tools}
      />

      {modal.data.blocked_jobs.length ? (
        <Card className="border-amber-300 bg-amber-50 text-amber-950">
          <CardHeader>
            <CardTitle>Jobs needing administrator attention</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {modal.data.blocked_jobs.map((summary) => (
                <li key={summary.category}>
                  <span className="font-medium">{summary.count}</span> {summary.category.replaceAll("_", " ")} — oldest since {formatTimestamp(summary.oldest_blocked_at)}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Environment</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-5 lg:grid-cols-3" onSubmit={saveEnvironment}>
            <div className="grid content-start gap-1.5">
              <label className="text-sm font-medium" htmlFor="service-token-id">
                Service user token ID
              </label>
              <div className="flex">
                <Input
                  className="cursor-default rounded-r-none bg-muted/60 font-mono text-xs text-muted-foreground dark:bg-muted/40"
                  id="service-token-id"
                  readOnly
                  value={modal.data.environment.service_token_id}
                />
                <Button
                  aria-label="Copy service user token ID"
                  aria-live="polite"
                  className="rounded-l-none border-l-0"
                  onClick={() => {
                    void copyText(modal.data.environment.service_token_id)
                      .then(() => {
                        setTokenCopied(true)
                        window.setTimeout(() => setTokenCopied(false), 2_000)
                      })
                      .catch(() => setTokenCopied(false))
                  }}
                  type="button"
                  variant="outline"
                >
                  {tokenCopied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  {tokenCopied ? "Copied" : "Copy"}
                </Button>
              </div>
              <span className="text-xs font-normal text-muted-foreground">
                The token secret is available only to the backend process.
              </span>
            </div>
            <div className="grid content-start gap-1.5">
              <label className="text-sm font-medium" htmlFor="modal-environment">
                Modal environment
              </label>
              <RuntimeSettingInput
                id="modal-environment"
                label="Modal environment"
                onChange={(value) => {
                  resetEnvironmentMutationErrors()
                  setEnvironmentName(value)
                  setEnvironmentDirty(
                    value.trim() !== modal.data.environment.modal_environment.value
                  )
                }}
                onRestoreOverride={() => {
                  resetEnvironmentMutationErrors()
                  environmentUpdate.mutate({ modal_environment: null })
                }}
                pending={environmentPending}
                required
                setting={modal.data.environment.modal_environment}
                value={environmentName}
              />
            </div>
            <div className="grid content-start gap-1.5">
              <label className="text-sm font-medium" htmlFor="global-active-job-limit">
                Global active job limit
              </label>
              <RuntimeSettingInput
                id="global-active-job-limit"
                label="global active job limit"
                min={0}
                onChange={(value) => {
                  resetEnvironmentMutationErrors()
                  setGlobalActiveJobLimit(value)
                  setGlobalLimitDirty(
                    nonnegativeInteger(value) !==
                      modal.data.environment.global_active_job_limit.value
                  )
                }}
                onRestoreOverride={() => {
                  resetEnvironmentMutationErrors()
                  globalLimitUpdate.mutate({ global_active_job_limit: null })
                }}
                pending={globalLimitPending}
                required
                setting={modal.data.environment.global_active_job_limit}
                type="number"
                value={globalActiveJobLimit}
              />
            </div>
            <div className="flex justify-end lg:col-span-3">
              <Button
                disabled={
                  anyEnvironmentPending ||
                  !environmentHasChanges ||
                  normalizedGlobalLimit === null ||
                  (modal.data.environment.modal_environment.editable &&
                    !environmentName.trim())
                }
                type="submit"
                variant="outline"
              >
                {anyEnvironmentPending ? (
                  <LoaderCircle aria-hidden="true" className="animate-spin" />
                ) : (
                  <Save aria-hidden="true" />
                )}
                Save
              </Button>
            </div>
          </form>
          {environmentError ? (
            <p className="mt-4 flex items-center gap-2 text-sm text-destructive" role="alert">
              <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
              {errorMessage(environmentError)}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <CostsCard
        environmentName={modal.data.environment.modal_environment.value}
      />

      <section aria-labelledby="modal-tools-heading">
        <h2 className="font-heading text-xl font-semibold" id="modal-tools-heading">
          Tools
        </h2>
        <div className="mt-4 overflow-x-auto rounded-xl border bg-card shadow-sm">
          <Tooltip.Provider closeDelay={100} delay={250}>
            <table className="w-[calc(100%_-_1px)] min-w-[42rem] table-fixed border-collapse text-center">
              <colgroup>
                <col className="w-[28%]" />
                <col className="w-[34%]" />
                <col className="w-[22%]" />
                <col className="w-[16%]" />
              </colgroup>
              <thead className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-3 font-medium" rowSpan={2} scope="col">
                    Tool
                  </th>
                  <th
                    className="whitespace-nowrap px-3 py-3 font-medium"
                    rowSpan={2}
                    scope="col"
                  >
                    Active jobs / active job limit
                  </th>
                  <th
                    className="border-b px-2 py-2 font-semibold text-foreground/80"
                    colSpan={2}
                    scope="colgroup"
                  >
                    Modal
                  </th>
                </tr>
                <tr>
                  <th className="whitespace-nowrap px-2 py-2.5 font-medium" scope="col">
                    Deployment version
                  </th>
                  <th className="whitespace-nowrap px-2 py-2.5 font-medium" scope="col">
                    Job logs
                  </th>
                </tr>
              </thead>
              <tbody>
                {modal.data.tools.map((tool) => (
                  <ToolRow
                    draft={toolDrafts[tool.tool] ?? initialToolDraft(tool)}
                    key={tool.tool}
                    onChange={(draft) => {
                      if (!toolsUpdate.isPending) toolsUpdate.reset()
                      setToolFailure(null)
                      setToolDrafts((current) => ({
                        ...current,
                        [tool.tool]: draft,
                      }))
                    }}
                    onRestore={(input) => {
                      toolsUpdate.mutate([{ tool: tool.tool, input }])
                    }}
                    pendingFields={pendingToolFields(tool.tool)}
                    tool={tool}
                  />
                ))}
              </tbody>
            </table>
          </Tooltip.Provider>
          <div className="flex flex-wrap items-center justify-end gap-3 border-t px-4 py-4">
            <Button
              disabled={toolsUpdate.isPending || !canRestoreAllTools}
              id="restore-all-tools"
              onClick={() => {
                toolsUpdate.reset()
                setToolFailure(null)
                setRestoreAllConfirmationOpen(true)
              }}
              type="button"
              variant="destructive"
            >
              {toolsUpdate.isPending ? (
                <RotateCcw
                  aria-hidden="true"
                  className="animate-[spin_700ms_linear_infinite_reverse] motion-reduce:animate-none"
                />
              ) : (
                <RotateCcw aria-hidden="true" />
              )}
              Restore all to defaults
            </Button>
            {toolFailure ? (
              <ToolSettingErrorPopover
                anchor={toolsSaveButton}
                error={toolFailure.error}
                fields={modalToolSettingLabels(toolFailure.input)}
                onDismiss={() => {
                  setToolFailure(null)
                  if (!toolsUpdate.isPending) toolsUpdate.reset()
                }}
                toolName={toolFailure.toolName}
              />
            ) : null}
            <Button
              disabled={
                toolsUpdate.isPending ||
                !changedToolUpdates.length ||
                invalidToolDraft
              }
              onClick={() => toolsUpdate.mutate(changedToolUpdates)}
              ref={setToolsSaveButton}
              type="button"
              variant="outline"
            >
              {toolsUpdate.isPending ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : (
                <Save aria-hidden="true" />
              )}
              Save
            </Button>
          </div>
        </div>
      </section>
      <AlertDialog.Root
        onOpenChange={(open) => {
          if (!open && !toolsUpdate.isPending) {
            setRestoreAllConfirmationOpen(false)
          }
        }}
        open={restoreAllConfirmationOpen}
      >
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-foreground/30 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
          <AlertDialog.Viewport className="fixed inset-0 z-50 grid place-items-center p-4">
            <AlertDialog.Popup
              className="w-full max-w-md rounded-xl border bg-background p-6 text-foreground shadow-2xl outline-none data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0"
              finalFocus={() => document.getElementById("restore-all-tools")}
            >
              <AlertDialog.Title className="font-heading text-xl font-semibold">
                Restore all Tool settings?
              </AlertDialog.Title>
              <AlertDialog.Description className="mt-3 text-sm leading-6 text-muted-foreground">
                This removes every administrator override for deployment
                versions, active job limits, and Job Log access. Unsaved Tool
                edits will also be discarded.
              </AlertDialog.Description>
              {toolsUpdate.error ? (
                <p className="mt-4 text-sm text-destructive" role="alert">
                  {errorMessage(toolsUpdate.error)}
                </p>
              ) : null}
              <div className="mt-6 flex justify-end gap-3">
                <AlertDialog.Close
                  render={
                    <Button disabled={toolsUpdate.isPending} variant="outline" />
                  }
                >
                  Cancel
                </AlertDialog.Close>
                <Button
                  disabled={toolsUpdate.isPending}
                  onClick={restoreAllTools}
                  variant="destructive"
                >
                  {toolsUpdate.isPending ? (
                    <LoaderCircle aria-hidden="true" className="animate-spin" />
                  ) : (
                    <RotateCcw aria-hidden="true" />
                  )}
                  Restore all
                </Button>
              </div>
            </AlertDialog.Popup>
          </AlertDialog.Viewport>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  )
}
