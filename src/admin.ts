import type {
  AdminCosts,
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

export function modalEnvironmentCost(
  report: AdminCosts,
  environmentName: string
) {
  return report.environments.find((group) => group.name === environmentName)?.cost ?? "0"
}

export function upsertAdminUser(
  users: AdminUser[] | undefined,
  updated: AdminUser
) {
  if (!users) return users
  const existing = users.findIndex((user) => user.user_id === updated.user_id)
  if (existing === -1) return [...users, updated]
  return users.map((user, index) => (index === existing ? updated : user))
}

export function sortAdminUsersByCreatedAt(
  users: readonly AdminUser[],
  direction: "ascending" | "descending"
) {
  return [...users].sort((left, right) => {
    const createdOrder = Date.parse(left.created_at) - Date.parse(right.created_at)
    return (direction === "ascending" ? createdOrder : -createdOrder) ||
      left.user_id.localeCompare(right.user_id)
  })
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
      tool.tool === updated.tool ? updated : tool
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
      return "Current value comes from the configured .env file."
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

export function positiveInteger(value: string) {
  const parsed = nonnegativeInteger(value)
  return parsed !== null && parsed >= 1 ? parsed : null
}

export function modalToolSettingLabels(
  input: UpdateAdminModalToolInput | undefined
) {
  if (!input) return []
  const labels: string[] = []
  if (Object.hasOwn(input, "modal_app_version")) {
    labels.push("Modal deployment version")
  }
  if (Object.hasOwn(input, "active_job_limit")) {
    labels.push("Active job limit")
  }
  if (Object.hasOwn(input, "job_logs_visible_to_owner")) {
    labels.push("Job log access")
  }
  return labels
}

export function latestModalToolFailure<
  Attempt extends { error: unknown; submittedAt: number },
>(attempts: readonly Attempt[]) {
  let latest: Attempt | null = null
  for (const attempt of attempts) {
    if (attempt.error == null) continue
    if (latest === null || attempt.submittedAt > latest.submittedAt) {
      latest = attempt
    }
  }
  return latest
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
  modalAppVersion: string,
  activeJobLimit: string,
  jobLogsVisibleToOwner: boolean
): UpdateAdminModalToolInput {
  const normalizedVersion = positiveInteger(modalAppVersion)
  const normalizedLimit = nonnegativeInteger(activeJobLimit)
  return {
    ...(normalizedVersion !== null &&
    tool.modal_app_version.editable &&
    normalizedVersion !== tool.modal_app_version.value
      ? { modal_app_version: normalizedVersion }
      : {}),
    ...(normalizedLimit !== null &&
    tool.active_job_limit.editable &&
    normalizedLimit !== tool.active_job_limit.value
      ? { active_job_limit: normalizedLimit }
      : {}),
    ...(jobLogsVisibleToOwner !== tool.job_logs_visible_to_owner.value
      ? { job_logs_visible_to_owner: jobLogsVisibleToOwner }
      : {}),
  }
}
