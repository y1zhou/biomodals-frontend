import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, Check, Copy, LoaderCircle, RotateCcw, Save } from "lucide-react"
import { useEffect, useState, type ComponentProps, type FormEvent } from "react"

import {
  adminModalKey,
  changedModalEnvironmentSettings,
  changedModalToolSettings,
  settingSourceNote,
  type SettingSource,
} from "@/admin"
import {
  ApiError,
  inspectAdminModal,
  updateAdminModalEnvironment,
  updateAdminModalTool,
  type AdminModalTool,
} from "@/api/client"
import { useExpireSession } from "@/auth-state"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { copyText } from "@/lib/clipboard"
import { toolName } from "@/tools"

function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "The Modal configuration request failed."
}

function SourceNote({ source }: { source: SettingSource }) {
  const note = settingSourceNote(source)
  return note ? <span className="mt-1 text-xs text-muted-foreground">{note}</span> : null
}

function RuntimeSettingInput({
  label,
  onChange,
  onRestoreOverride,
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
  pending: boolean
  setting: { editable: boolean; source: SettingSource; value: string | number }
  value: string
}) {
  const canRestore =
    setting.source === "database" || value !== String(setting.value)
  const restoreDescription = `Restore ${label} to its configured default`

  return (
    <>
      <div className="flex">
        <Input
          {...inputProps}
          className={setting.editable ? "rounded-r-none" : undefined}
          disabled={!setting.editable}
          onChange={(event) => onChange(event.target.value)}
          value={value}
        />
        {setting.editable ? (
          <Button
            aria-label={restoreDescription}
            className="rounded-l-none border-l-0"
            disabled={pending || !canRestore}
            onClick={() => {
              if (setting.source === "database") {
                onRestoreOverride()
                return
              }
              onChange(String(setting.value))
            }}
            size="icon"
            title={restoreDescription}
            type="button"
            variant="outline"
          >
            <RotateCcw aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      <SourceNote source={setting.source} />
    </>
  )
}

function ToolRow({
  tool,
  save,
}: {
  tool: AdminModalTool
  save: ReturnType<typeof useToolUpdate>
}) {
  const [appName, setAppName] = useState(tool.modal_app_name.value)
  const [activeJobLimit, setActiveJobLimit] = useState(String(tool.active_job_limit.value))
  useEffect(
    () => setAppName(tool.modal_app_name.value),
    [tool.modal_app_name.source, tool.modal_app_name.value]
  )
  useEffect(
    () => setActiveJobLimit(String(tool.active_job_limit.value)),
    [tool.active_job_limit.source, tool.active_job_limit.value]
  )
  const saving = save.isPending
  const rowError =
    save.isError && save.variables?.workload === tool.workload ? save.error : null
  const normalizedAppName = appName.trim()
  const displayName = toolName(tool.workload)
  const changedSettings = changedModalToolSettings(tool, appName, activeJobLimit)
  const hasChanges = Object.keys(changedSettings).length > 0

  return (
    <tr className="border-b last:border-0">
      <td className="px-4 py-4 align-top text-sm font-medium">{displayName}</td>
      <td className="px-4 py-4 align-top">
        <RuntimeSettingInput
          aria-label={`Modal app name for ${tool.workload}`}
          label={`Modal app name for ${displayName}`}
          onChange={setAppName}
          onRestoreOverride={() =>
            save.mutate({
              workload: tool.workload,
              input: { modal_app_name: null },
            })
          }
          pending={saving}
          setting={tool.modal_app_name}
          value={appName}
        />
      </td>
      <td className="px-4 py-4 align-top">
        <div className="flex min-w-56 items-start gap-2">
          <span className="flex h-8 items-center text-sm tabular-nums">
            {tool.running_jobs} /
          </span>
          <div className="grow">
            <RuntimeSettingInput
              aria-label={`Active job limit for ${displayName}`}
              label={`active job limit for ${displayName}`}
              min={1}
              onChange={setActiveJobLimit}
              onRestoreOverride={() =>
                save.mutate({
                  workload: tool.workload,
                  input: { active_job_limit: null },
                })
              }
              pending={saving}
              setting={tool.active_job_limit}
              type="number"
              value={activeJobLimit}
            />
          </div>
          <Button
            aria-label={`Save Modal settings for ${displayName}`}
            disabled={
              saving ||
              !hasChanges ||
              Number(activeJobLimit) < 1 ||
              (tool.modal_app_name.editable && !normalizedAppName) ||
              (!tool.modal_app_name.editable && !tool.active_job_limit.editable)
            }
            onClick={() =>
              save.mutate({
                workload: tool.workload,
                input: changedSettings,
              })
            }
            size="icon"
            variant="outline"
          >
            <Save aria-hidden="true" />
          </Button>
        </div>
        {rowError ? (
          <p className="mt-2 flex items-center gap-2 text-sm text-destructive" role="alert">
            <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
            {errorMessage(rowError)}
          </p>
        ) : null}
      </td>
    </tr>
  )
}

function useToolUpdate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      workload,
      input,
    }: {
      workload: string
      input: Parameters<typeof updateAdminModalTool>[1]
    }) => updateAdminModalTool(workload, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminModalKey }),
  })
}

export default function ModalAdminPage() {
  const queryClient = useQueryClient()
  const modal = useQuery({
    queryKey: adminModalKey,
    queryFn: ({ signal }) => inspectAdminModal(signal),
  })
  const [environmentName, setEnvironmentName] = useState("")
  const [globalActiveJobLimit, setGlobalActiveJobLimit] = useState("")
  const [tokenCopied, setTokenCopied] = useState(false)
  const environmentUpdate = useMutation({
    mutationFn: updateAdminModalEnvironment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminModalKey }),
  })
  const toolUpdate = useToolUpdate()
  useExpireSession(modal.error)
  useExpireSession(environmentUpdate.error)
  useExpireSession(toolUpdate.error)
  const environment = modal.data?.environment
  const modalEnvironmentValue = environment?.modal_environment.value
  const modalEnvironmentSource = environment?.modal_environment.source
  const globalActiveJobLimitValue = environment?.global_active_job_limit.value
  const globalActiveJobLimitSource = environment?.global_active_job_limit.source
  const changedEnvironmentSettings = environment
    ? changedModalEnvironmentSettings(
        environment,
        environmentName,
        globalActiveJobLimit
      )
    : {}
  const environmentHasChanges = Object.keys(changedEnvironmentSettings).length > 0

  useEffect(() => {
    if (modalEnvironmentValue === undefined) return
    setEnvironmentName(modalEnvironmentValue)
  }, [modalEnvironmentSource, modalEnvironmentValue])
  useEffect(() => {
    if (globalActiveJobLimitValue === undefined) return
    setGlobalActiveJobLimit(String(globalActiveJobLimitValue))
  }, [globalActiveJobLimitSource, globalActiveJobLimitValue])

  function saveEnvironment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!environment) return
    environmentUpdate.mutate(changedEnvironmentSettings)
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
                onChange={setEnvironmentName}
                onRestoreOverride={() =>
                  environmentUpdate.mutate({ modal_environment: null })
                }
                pending={environmentUpdate.isPending}
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
                min={1}
                onChange={setGlobalActiveJobLimit}
                onRestoreOverride={() =>
                  environmentUpdate.mutate({ global_active_job_limit: null })
                }
                pending={environmentUpdate.isPending}
                required
                setting={modal.data.environment.global_active_job_limit}
                type="number"
                value={globalActiveJobLimit}
              />
            </div>
            <div className="flex justify-end lg:col-span-3">
              <Button
                disabled={
                  environmentUpdate.isPending ||
                  !environmentHasChanges ||
                  Number(globalActiveJobLimit) < 1 ||
                  (modal.data.environment.modal_environment.editable &&
                    !environmentName.trim()) ||
                  (!modal.data.environment.modal_environment.editable &&
                    !modal.data.environment.global_active_job_limit.editable)
                }
                type="submit"
                variant="outline"
              >
                <Save aria-hidden="true" />
                Save
              </Button>
            </div>
          </form>
          {environmentUpdate.error ? (
            <p className="mt-4 flex items-center gap-2 text-sm text-destructive" role="alert">
              <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
              {errorMessage(environmentUpdate.error)}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <section aria-labelledby="modal-tools-heading">
        <h2 className="font-heading text-xl font-semibold" id="modal-tools-heading">
          Tools
        </h2>
        <div className="mt-4 overflow-x-auto rounded-xl border bg-card shadow-sm">
          <table className="w-full min-w-[48rem] border-collapse text-left">
            <thead className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium" scope="col">Tool</th>
                <th className="px-4 py-3 font-medium" scope="col">Deployed Modal app name</th>
                <th className="px-4 py-3 font-medium" scope="col">
                  Current running jobs / active job limit
                </th>
              </tr>
            </thead>
            <tbody>
              {modal.data.tools.map((tool) => (
                <ToolRow key={tool.workload} save={toolUpdate} tool={tool} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  )
}
