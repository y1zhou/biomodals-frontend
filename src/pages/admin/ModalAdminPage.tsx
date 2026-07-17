import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, LoaderCircle, Save } from "lucide-react"
import { useEffect, useState, type FormEvent } from "react"

import { adminModalKey, settingSourceLabel } from "@/admin"
import {
  ApiError,
  inspectAdminModal,
  updateAdminModalEnvironment,
  updateAdminModalTool,
  type AdminModalTool,
} from "@/api/client"
import { useExpireSession } from "@/auth-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "The Modal configuration request failed."
}

function Source({ source, editable }: { source: Parameters<typeof settingSourceLabel>[0]; editable: boolean }) {
  return (
    <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
      <Badge variant="outline">{settingSourceLabel(source)}</Badge>
      {!editable ? "Read-only while the process override is set." : null}
    </span>
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
  useEffect(() => setAppName(tool.modal_app_name.value), [tool.modal_app_name.value])
  useEffect(
    () => setActiveJobLimit(String(tool.active_job_limit.value)),
    [tool.active_job_limit.value]
  )
  const pending = save.isPending && save.variables?.workload === tool.workload
  const normalizedAppName = appName.trim()

  return (
    <tr className="border-b last:border-0">
      <td className="px-4 py-4 align-top font-mono text-sm">{tool.workload}</td>
      <td className="px-4 py-4 align-top">
        <Input
          aria-label={`Modal app name for ${tool.workload}`}
          disabled={!tool.modal_app_name.editable}
          onChange={(event) => setAppName(event.target.value)}
          value={appName}
        />
        <Source
          editable={tool.modal_app_name.editable}
          source={tool.modal_app_name.source}
        />
      </td>
      <td className="px-4 py-4 align-top text-sm tabular-nums">{tool.running_jobs}</td>
      <td className="px-4 py-4 align-top">
        <div className="flex min-w-44 items-start gap-2">
          <div className="grow">
            <Input
              aria-label={`Active Job Limit for ${tool.workload}`}
              disabled={!tool.active_job_limit.editable}
              min={1}
              onChange={(event) => setActiveJobLimit(event.target.value)}
              type="number"
              value={activeJobLimit}
            />
            <Source
              editable={tool.active_job_limit.editable}
              source={tool.active_job_limit.source}
            />
          </div>
          <Button
            aria-label={`Save Modal settings for ${tool.workload}`}
            disabled={
              pending ||
              Number(activeJobLimit) < 1 ||
              (tool.modal_app_name.editable && !normalizedAppName) ||
              (!tool.modal_app_name.editable && !tool.active_job_limit.editable)
            }
            onClick={() =>
              save.mutate({
                workload: tool.workload,
                input: {
                  ...(tool.modal_app_name.editable
                    ? { modal_app_name: normalizedAppName }
                    : {}),
                  ...(tool.active_job_limit.editable
                    ? { active_job_limit: Number(activeJobLimit) }
                    : {}),
                },
              })
            }
            size="icon"
            variant="outline"
          >
            <Save aria-hidden="true" />
          </Button>
        </div>
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
  const environmentUpdate = useMutation({
    mutationFn: updateAdminModalEnvironment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminModalKey }),
  })
  const toolUpdate = useToolUpdate()
  useExpireSession(modal.error)
  useExpireSession(environmentUpdate.error)
  useExpireSession(toolUpdate.error)
  const environment = modal.data?.environment

  useEffect(() => {
    if (!environment) return
    setEnvironmentName(environment.modal_environment.value)
    setGlobalActiveJobLimit(String(environment.global_active_job_limit.value))
  }, [environment])

  function saveEnvironment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!environment) return
    environmentUpdate.mutate({
      ...(environment.modal_environment.editable
        ? { modal_environment: environmentName.trim() }
        : {}),
      ...(environment.global_active_job_limit.editable
        ? { global_active_job_limit: Number(globalActiveJobLimit) }
        : {}),
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
    return <p className="text-sm text-destructive">{errorMessage(modal.error)}</p>
  }

  const mutationError = environmentUpdate.error ?? toolUpdate.error

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Environment</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-5 lg:grid-cols-3" onSubmit={saveEnvironment}>
            <label className="grid content-start gap-1.5 text-sm font-medium">
              Service user token ID
              <Input
                className="font-mono text-xs"
                readOnly
                value={modal.data.environment.service_token_id}
              />
              <span className="text-xs font-normal text-muted-foreground">
                The token secret is available only to the backend process.
              </span>
            </label>
            <label className="grid content-start gap-1.5 text-sm font-medium">
              Modal environment
              <Input
                disabled={!modal.data.environment.modal_environment.editable}
                onChange={(event) => setEnvironmentName(event.target.value)}
                required
                value={environmentName}
              />
              <Source
                editable={modal.data.environment.modal_environment.editable}
                source={modal.data.environment.modal_environment.source}
              />
            </label>
            <div className="grid content-start gap-1.5">
              <label className="text-sm font-medium" htmlFor="global-active-job-limit">
                Global Active Job Limit
              </label>
              <div className="flex items-start gap-2">
                <div className="grow">
                  <Input
                    disabled={!modal.data.environment.global_active_job_limit.editable}
                    id="global-active-job-limit"
                    min={1}
                    onChange={(event) => setGlobalActiveJobLimit(event.target.value)}
                    required
                    type="number"
                    value={globalActiveJobLimit}
                  />
                  <Source
                    editable={modal.data.environment.global_active_job_limit.editable}
                    source={modal.data.environment.global_active_job_limit.source}
                  />
                </div>
                <Button
                  disabled={
                    environmentUpdate.isPending ||
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
            </div>
          </form>
        </CardContent>
      </Card>

      <section aria-labelledby="modal-tools-heading">
        <h2 className="font-heading text-xl font-semibold" id="modal-tools-heading">
          Tools
        </h2>
        <div className="mt-4 overflow-x-auto rounded-xl border bg-card shadow-sm">
          <table className="w-full min-w-[54rem] border-collapse text-left">
            <thead className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium" scope="col">API workload name</th>
                <th className="px-4 py-3 font-medium" scope="col">Deployed Modal app name</th>
                <th className="px-4 py-3 font-medium" scope="col">Current running Jobs</th>
                <th className="px-4 py-3 font-medium" scope="col">Active Job Limit</th>
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

      {mutationError ? (
        <p className="flex items-center gap-2 text-sm text-destructive">
          <AlertTriangle aria-hidden="true" className="size-4" />
          {errorMessage(mutationError)}
        </p>
      ) : null}
    </div>
  )
}
