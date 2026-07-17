import type { AdminModal } from "@/api/client"

export const adminUsersKey = ["admin", "users"] as const
export const adminModalKey = ["admin", "modal"] as const

export type SettingSource =
  AdminModal["environment"]["modal_environment"]["source"]

export function settingSourceLabel(source: SettingSource) {
  switch (source) {
    case "process_environment":
      return "Process environment"
    case "configuration_file":
      return "Configuration file"
    case "database":
      return "Admin setting"
    case "default":
      return "Built-in default"
  }
}
