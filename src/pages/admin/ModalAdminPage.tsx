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
  latestModalToolFailure,
  mergeAdminModalEnvironment,
  mergeAdminModalTool,
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
  inspectAdminModal,
  resolveAdminStateUnknownJob,
  updateAdminModalEnvironment,
  updateAdminModalTool,
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
import { Input } from "@/components/ui/input"
import {
  formatTimestamp,
  useDocumentVisibility,
  visibilityPollingInterval,
} from "@/jobs"
import { copyText } from "@/lib/clipboard"
import { cn } from "@/lib/utils"

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
  provider_outcome_unknown: "Modal call status could not be confirmed",
  cancellation_outcome_unknown: "Cancellation could not be confirmed",
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
  const resolution = useMutation({
    mutationFn: resolveAdminStateUnknownJob,
    onSuccess(result) {
      queryClient.setQueryData(adminModalKey, result)
      confirmationDialog.current?.close()
      setSelected(null)
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
            Return this job to reconciliation?
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Do this only after checking the exact deployment in Modal. BioModals will inspect the remote run again.
          </p>
          {selected ? (
            <p className="mt-3 break-all text-sm font-medium">{selected.display_name} · {selected.job_id}</p>
          ) : null}
          {resolution.error ? (
            <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {errorMessage(resolution.error)}
            </p>
          ) : null}
          <div className="mt-6 flex justify-end gap-3">
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
                if (selected) resolution.mutate(selected.job_id)
              }}
              variant="destructive"
            >
              {resolution.isPending ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : null}
              Resolve status
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

function ToolRow({ tool }: { tool: AdminModalTool }) {
  const queryClient = useQueryClient()
  const [saveButton, setSaveButton] = useState<HTMLButtonElement | null>(null)
  const [appName, setAppName] = useState(tool.modal_app_name.value)
  const [appVersion, setAppVersion] = useState(String(tool.modal_app_version.value))
  const [activeJobLimit, setActiveJobLimit] = useState(String(tool.active_job_limit.value))
  const [maxContainers, setMaxContainers] = useState(
    String(tool.max_active_provider_calls.value)
  )
  const [maxGpuContainers, setMaxGpuContainers] = useState(
    String(tool.max_active_gpu_provider_calls.value)
  )
  const [jobLogsVisibleToOwner, setJobLogsVisibleToOwner] = useState(
    tool.job_logs_visible_to_owner.value
  )
  const [appDirty, setAppDirty] = useState(false)
  const [versionDirty, setVersionDirty] = useState(false)
  const [limitDirty, setLimitDirty] = useState(false)
  const [capacityDirty, setCapacityDirty] = useState(false)
  const [jobLogAccessDirty, setJobLogAccessDirty] = useState(false)

  function mutationOptions() {
    return {
      mutationFn: (input: UpdateAdminModalToolInput) =>
        updateAdminModalTool(tool.tool, input),
      scope: { id: `admin-modal-tool-${tool.tool}` },
      onSuccess(result: AdminModalTool, input: UpdateAdminModalToolInput) {
        queryClient.setQueryData<AdminModal>(adminModalKey, (modal) =>
          modal ? mergeAdminModalTool(modal, result) : modal
        )
        if (Object.hasOwn(input, "modal_app_name")) {
          setAppName(result.modal_app_name.value)
          setAppDirty(false)
        }
        if (Object.hasOwn(input, "modal_app_version")) {
          setAppVersion(String(result.modal_app_version.value))
          setVersionDirty(false)
        }
        if (Object.hasOwn(input, "active_job_limit")) {
          setActiveJobLimit(String(result.active_job_limit.value))
          setLimitDirty(false)
        }
        if (Object.hasOwn(input, "max_active_provider_calls")) {
          setMaxContainers(String(result.max_active_provider_calls.value))
        }
        if (Object.hasOwn(input, "max_active_gpu_provider_calls")) {
          setMaxGpuContainers(String(result.max_active_gpu_provider_calls.value))
        }
        if (
          Object.hasOwn(input, "max_active_provider_calls") ||
          Object.hasOwn(input, "max_active_gpu_provider_calls")
        ) {
          setCapacityDirty(false)
        }
        if (Object.hasOwn(input, "job_logs_visible_to_owner")) {
          setJobLogsVisibleToOwner(result.job_logs_visible_to_owner.value)
          setJobLogAccessDirty(false)
        }
        void queryClient.invalidateQueries({ queryKey: adminModalKey })
      },
    }
  }

  const appUpdate = useMutation(mutationOptions())
  const versionUpdate = useMutation(mutationOptions())
  const limitUpdate = useMutation(mutationOptions())
  const capacityUpdate = useMutation(mutationOptions())
  const jobLogAccessUpdate = useMutation(mutationOptions())
  const toolUpdates = [
    appUpdate,
    versionUpdate,
    limitUpdate,
    capacityUpdate,
    jobLogAccessUpdate,
  ]
  const resetMutationErrors = () => {
    for (const update of toolUpdates) {
      if (!update.isPending) update.reset()
    }
  }
  useExpireSession(appUpdate.error)
  useExpireSession(versionUpdate.error)
  useExpireSession(limitUpdate.error)
  useExpireSession(capacityUpdate.error)
  useExpireSession(jobLogAccessUpdate.error)

  const mutationIncludes = (
    mutation: typeof appUpdate,
    field: keyof UpdateAdminModalToolInput
  ) =>
    mutation.isPending &&
    Boolean(mutation.variables && Object.hasOwn(mutation.variables, field))
  const appPending = toolUpdates.some((update) =>
    mutationIncludes(update, "modal_app_name")
  )
  const versionPending = toolUpdates.some((update) =>
    mutationIncludes(update, "modal_app_version")
  )
  const limitPending = toolUpdates.some((update) =>
    mutationIncludes(update, "active_job_limit")
  )
  const jobLogAccessPending = toolUpdates.some((update) =>
    mutationIncludes(update, "job_logs_visible_to_owner")
  )
  const capacityPending = toolUpdates.some((update) =>
    mutationIncludes(update, "max_active_provider_calls") ||
    mutationIncludes(update, "max_active_gpu_provider_calls")
  )
  const mutationPending = toolUpdates.some((update) => update.isPending)
  const failedMutation = latestModalToolFailure(toolUpdates)
  const mutationError = failedMutation?.error ?? null
  const failedFields = modalToolSettingLabels(failedMutation?.variables)

  useEffect(() => {
    if (!appDirty) setAppName(tool.modal_app_name.value)
  }, [appDirty, tool.modal_app_name.source, tool.modal_app_name.value])
  useEffect(() => {
    if (!versionDirty) setAppVersion(String(tool.modal_app_version.value))
  }, [tool.modal_app_version.source, tool.modal_app_version.value, versionDirty])
  useEffect(() => {
    if (!limitDirty) setActiveJobLimit(String(tool.active_job_limit.value))
  }, [limitDirty, tool.active_job_limit.source, tool.active_job_limit.value])
  useEffect(() => {
    if (!capacityDirty) {
      setMaxContainers(String(tool.max_active_provider_calls.value))
      setMaxGpuContainers(String(tool.max_active_gpu_provider_calls.value))
    }
  }, [
    capacityDirty,
    tool.max_active_gpu_provider_calls.value,
    tool.max_active_provider_calls.value,
  ])
  useEffect(() => {
    if (!jobLogAccessDirty) {
      setJobLogsVisibleToOwner(tool.job_logs_visible_to_owner.value)
    }
  }, [
    jobLogAccessDirty,
    tool.job_logs_visible_to_owner.source,
    tool.job_logs_visible_to_owner.value,
  ])

  const changedSettings = changedModalToolSettings(
    tool,
    appName,
    appVersion,
    activeJobLimit,
    maxContainers,
    maxGpuContainers,
    jobLogsVisibleToOwner
  )
  const normalizedAppName = appName.trim()
  const normalizedVersion = positiveInteger(appVersion)
  const normalizedLimit = nonnegativeInteger(activeJobLimit)
  const normalizedContainers = positiveInteger(maxContainers)
  const normalizedGpuContainers = positiveInteger(maxGpuContainers)
  const displayName = tool.display_name
  const hasChanges = Object.keys(changedSettings).length > 0
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
          <div className="w-20 shrink-0 whitespace-normal">
            <RuntimeSettingInput
              aria-label={`Active job limit for ${displayName}`}
              label={`active job limit for ${displayName}`}
              min={0}
              onChange={(value) => {
                resetMutationErrors()
                setActiveJobLimit(value)
                setLimitDirty(
                  nonnegativeInteger(value) !== tool.active_job_limit.value
                )
              }}
              onRestoreOverride={() => {
                resetMutationErrors()
                limitUpdate.mutate({ active_job_limit: null })
              }}
              pending={limitPending}
              setting={tool.active_job_limit}
              type="number"
              value={activeJobLimit}
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
        <div className="mx-auto grid max-w-36 grid-cols-2 gap-2">
          <RuntimeSettingInput
            aria-label={`Maximum containers for ${displayName}`}
            label={`maximum containers for ${displayName}`}
            min={1}
            onChange={(value) => {
              resetMutationErrors()
              setMaxContainers(value)
              setCapacityDirty(
                positiveInteger(value) !== tool.max_active_provider_calls.value ||
                positiveInteger(maxGpuContainers) !==
                  tool.max_active_gpu_provider_calls.value
              )
            }}
            onRestoreOverride={() => {
              resetMutationErrors()
              capacityUpdate.mutate({ max_active_provider_calls: null })
            }}
            pending={capacityPending}
            setting={tool.max_active_provider_calls}
            type="number"
            value={maxContainers}
          />
          <RuntimeSettingInput
            aria-label={`Maximum GPU containers for ${displayName}`}
            label={`maximum GPU containers for ${displayName}`}
            min={1}
            onChange={(value) => {
              resetMutationErrors()
              setMaxGpuContainers(value)
              setCapacityDirty(
                positiveInteger(maxContainers) !==
                  tool.max_active_provider_calls.value ||
                positiveInteger(value) !==
                  tool.max_active_gpu_provider_calls.value
              )
            }}
            onRestoreOverride={() => {
              resetMutationErrors()
              capacityUpdate.mutate({ max_active_gpu_provider_calls: null })
            }}
            pending={capacityPending}
            setting={tool.max_active_gpu_provider_calls}
            type="number"
            value={maxGpuContainers}
          />
          <span className="text-[0.65rem] text-muted-foreground">Total</span>
          <span className="text-[0.65rem] text-muted-foreground">GPU</span>
        </div>
      </td>
      <td className="px-3 py-4 text-center align-middle">
        <div className="mx-auto max-w-48">
          <RuntimeSettingInput
            aria-label={`Modal app name for ${displayName}`}
            label={`Modal app name for ${displayName}`}
            onChange={(value) => {
              resetMutationErrors()
              setAppName(value)
              setAppDirty(value.trim() !== tool.modal_app_name.value)
            }}
            onRestoreOverride={() => {
              resetMutationErrors()
              appUpdate.mutate({ modal_app_name: null })
            }}
            pending={appPending}
            setting={tool.modal_app_name}
            value={appName}
          />
        </div>
      </td>
      <td className="px-2 py-4 text-center align-middle">
        <div className="mx-auto max-w-28">
          <RuntimeSettingInput
            aria-label={`Modal deployment version for ${displayName}`}
            label={`Modal deployment version for ${displayName}`}
            min={1}
            onChange={(value) => {
              resetMutationErrors()
              setAppVersion(value)
              setVersionDirty(positiveInteger(value) !== tool.modal_app_version.value)
            }}
            onRestoreOverride={() => {
              resetMutationErrors()
              versionUpdate.mutate({ modal_app_version: null })
            }}
            omitConfigurationFileNote
            pending={versionPending}
            setting={tool.modal_app_version}
            type="number"
            value={appVersion}
          />
        </div>
      </td>
      <td className="px-2 py-4 text-center align-middle">
        <JobLogAccessSetting
          onChange={(value) => {
            resetMutationErrors()
            setJobLogsVisibleToOwner(value)
            setJobLogAccessDirty(
              value !== tool.job_logs_visible_to_owner.value
            )
          }}
          onRestoreOverride={() => {
            resetMutationErrors()
            jobLogAccessUpdate.mutate({ job_logs_visible_to_owner: null })
          }}
          pending={jobLogAccessPending}
          setting={tool.job_logs_visible_to_owner}
          toolName={displayName}
          value={jobLogsVisibleToOwner}
        />
      </td>
      <td className="px-2 py-4 text-center align-middle">
        {mutationError ? (
          <ToolSettingErrorPopover
            anchor={saveButton}
            error={mutationError}
            fields={failedFields}
            onDismiss={resetMutationErrors}
            toolName={displayName}
          />
        ) : null}
        <Button
          aria-label={`Save Modal settings for ${displayName}`}
          disabled={
            mutationPending ||
            !hasChanges ||
            normalizedLimit === null ||
            normalizedContainers === null ||
            normalizedGpuContainers === null ||
            normalizedGpuContainers > normalizedContainers ||
            (tool.modal_app_version.editable && normalizedVersion === null) ||
            (tool.modal_app_name.editable && !normalizedAppName)
          }
          onClick={() => {
            appUpdate.mutate(changedSettings)
          }}
          ref={setSaveButton}
          size="icon"
          variant="outline"
        >
          {mutationPending ? (
            <LoaderCircle aria-hidden="true" className="animate-spin" />
          ) : (
            <Save aria-hidden="true" />
          )}
        </Button>
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
  const resetEnvironmentMutationErrors = () => {
    if (environmentUpdate.isPending || globalLimitUpdate.isPending) return
    environmentUpdate.reset()
    globalLimitUpdate.reset()
  }
  useExpireSession(modal.error)
  useExpireSession(environmentUpdate.error)
  useExpireSession(globalLimitUpdate.error)

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

  function saveEnvironment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!environment) return
    if (Object.hasOwn(changedEnvironmentSettings, "modal_environment")) {
      environmentUpdate.mutate(changedEnvironmentSettings)
    } else {
      globalLimitUpdate.mutate(changedEnvironmentSettings)
    }
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

      <section aria-labelledby="modal-tools-heading">
        <h2 className="font-heading text-xl font-semibold" id="modal-tools-heading">
          Tools
        </h2>
        <div className="mt-4 overflow-x-auto rounded-xl border bg-card shadow-sm">
          <Tooltip.Provider closeDelay={100} delay={250}>
            <table className="w-[calc(100%_-_1px)] min-w-[56rem] table-fixed border-collapse text-center">
              <colgroup>
                <col className="w-[18%]" />
                <col className="w-[19%]" />
                <col className="w-[16%]" />
                <col className="w-[17%]" />
                <col className="w-[13%]" />
                <col className="w-[11%]" />
                <col className="w-[6%]" />
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
                    className="px-2 py-3 font-medium"
                    rowSpan={2}
                    scope="col"
                  >
                    Maximum containers
                  </th>
                  <th
                    className="border-b px-2 py-2 font-semibold text-foreground/80"
                    colSpan={3}
                    scope="colgroup"
                  >
                    Modal
                  </th>
                  <th className="px-2 py-3" rowSpan={2} scope="col">
                    <span className="sr-only">Save changes</span>
                  </th>
                </tr>
                <tr>
                  <th className="px-3 py-2.5 font-medium" scope="col">
                    Deployed app name
                  </th>
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
                  <ToolRow key={tool.tool} tool={tool} />
                ))}
              </tbody>
            </table>
          </Tooltip.Provider>
        </div>
      </section>
    </div>
  )
}
