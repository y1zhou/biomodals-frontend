import type {
  AdminModal,
  AdminModalEnvironment,
  AdminModalTool,
  UpdateAdminModalEnvironmentInput,
  UpdateAdminModalToolInput,
} from "@/api/client"

export const adminUsersKey = ["admin", "users"] as const
export const adminModalKey = ["admin", "modal"] as const

export type SettingSource =
  AdminModal["environment"]["modal_environment"]["source"]

export function settingSourceNote(source: SettingSource) {
  switch (source) {
    case "process_environment":
      return "Controlled by the process environment."
    case "configuration_file":
      return "Default from the configuration file."
    case "database":
    case "default":
      return null
  }
}

export function changedModalEnvironmentSettings(
  environment: AdminModalEnvironment,
  modalEnvironment: string,
  globalActiveJobLimit: string
): UpdateAdminModalEnvironmentInput {
  const normalizedEnvironment = modalEnvironment.trim()
  const normalizedLimit = Number(globalActiveJobLimit)
  return {
    ...(environment.modal_environment.editable &&
    normalizedEnvironment !== environment.modal_environment.value
      ? { modal_environment: normalizedEnvironment }
      : {}),
    ...(environment.global_active_job_limit.editable &&
    normalizedLimit !== environment.global_active_job_limit.value
      ? { global_active_job_limit: normalizedLimit }
      : {}),
  }
}

export function changedModalToolSettings(
  tool: AdminModalTool,
  modalAppName: string,
  activeJobLimit: string
): UpdateAdminModalToolInput {
  const normalizedAppName = modalAppName.trim()
  const normalizedLimit = Number(activeJobLimit)
  return {
    ...(tool.modal_app_name.editable && normalizedAppName !== tool.modal_app_name.value
      ? { modal_app_name: normalizedAppName }
      : {}),
    ...(tool.active_job_limit.editable && normalizedLimit !== tool.active_job_limit.value
      ? { active_job_limit: normalizedLimit }
      : {}),
  }
}
