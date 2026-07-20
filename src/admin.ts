import type {
  AdminModal,
  AdminModalEnvironment,
  AdminModalTool,
  AdminUser,
  UpdateAdminModalEnvironmentInput,
  UpdateAdminModalToolInput,
} from "@/api/client"

export const adminUsersKey = ["admin", "users"] as const
export const adminModalKey = ["admin", "modal"] as const
export const adminStorageKey = ["admin", "storage"] as const

export function upsertAdminUser(users: AdminUser[], updated: AdminUser) {
  const existing = users.findIndex((user) => user.user_id === updated.user_id)
  if (existing === -1) return [...users, updated]
  return users.map((user, index) => (index === existing ? updated : user))
}

export function mergeAdminModalEnvironment(
  modal: AdminModal,
  environment: AdminModalEnvironment
): AdminModal {
  return { ...modal, environment }
}

export function mergeAdminModalTool(
  modal: AdminModal,
  updated: AdminModalTool
): AdminModal {
  return {
    ...modal,
    tools: modal.tools.map((tool) =>
      tool.workload === updated.workload ? updated : tool
    ),
  }
}

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

export function nonnegativeInteger(value: string) {
  if (!/^\d+$/.test(value.trim())) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export function changedModalEnvironmentSettings(
  environment: AdminModalEnvironment,
  modalEnvironment: string,
  globalActiveJobLimit: string
): UpdateAdminModalEnvironmentInput {
  const normalizedEnvironment = modalEnvironment.trim()
  const normalizedLimit = nonnegativeInteger(globalActiveJobLimit)
  return {
    ...(environment.modal_environment.editable &&
    normalizedEnvironment !== environment.modal_environment.value
      ? { modal_environment: normalizedEnvironment }
      : {}),
    ...(normalizedLimit !== null &&
    environment.global_active_job_limit.editable &&
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
  const normalizedLimit = nonnegativeInteger(activeJobLimit)
  return {
    ...(tool.modal_app_name.editable && normalizedAppName !== tool.modal_app_name.value
      ? { modal_app_name: normalizedAppName }
      : {}),
    ...(normalizedLimit !== null &&
    tool.active_job_limit.editable &&
    normalizedLimit !== tool.active_job_limit.value
      ? { active_job_limit: normalizedLimit }
      : {}),
  }
}
