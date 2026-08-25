import { describe, expect, test } from "bun:test"

import {
  changedModalEnvironmentSettings,
  changedModalToolSettings,
  latestModalToolFailure,
  mergeAdminModalEnvironment,
  mergeAdminModalTool,
  modalToolSettingLabels,
  settingSourceNote,
  sortAdminUsersByCreatedAt,
  upsertAdminUser,
} from "../src/admin"

describe("Admin settings", () => {
  test("labels the Modal tool fields included in a failed save", () => {
    expect(modalToolSettingLabels({ modal_app_version: 404 })).toEqual([
      "Modal deployment version",
    ])
    expect(
      modalToolSettingLabels({
        modal_app_version: 404,
        active_job_limit: 2,
        job_logs_visible_to_owner: false,
      })
    ).toEqual([
      "Modal deployment version",
      "Active job limit",
      "Job log access",
    ])
  })

  test("selects the newest failed Modal tool update", () => {
    const older = {
      error: new Error("old failure"),
      submittedAt: 10,
      variables: { active_job_limit: 1 },
    }
    const pending = {
      error: null,
      submittedAt: 30,
      variables: { active_job_limit: 2 },
    }
    const newer = {
      error: new Error("new failure"),
      submittedAt: 20,
      variables: { modal_app_version: 404 },
    }

    expect(latestModalToolFailure([older, pending, newer])).toBe(newer)
    expect(latestModalToolFailure([pending])).toBeNull()
  })

  test("only explains configuration sources that need extra context", () => {
    expect(settingSourceNote("process_environment")).toBe(
      "Controlled by the process environment."
    )
    expect(settingSourceNote("configuration_file")).toBe(
      "Current value comes from the configured .env file."
    )
    expect(settingSourceNote("database")).toBeNull()
    expect(settingSourceNote("default")).toBeNull()
  })

  test("only submits Modal fields whose values changed", () => {
    const tool = {
      tool: "gromacs",
      display_name: "GROMACS MD simulation",
      modal_app_version: {
        value: 2,
        source: "default" as const,
        editable: true,
      },
      active_jobs: 0,
      active_job_limit: {
        value: 2,
        source: "default" as const,
        editable: true,
      },
      job_logs_visible_to_owner: {
        value: true,
        source: "default" as const,
        editable: true,
      },
    }
    const environment = {
      service_token_id: "token-id",
      modal_environment: {
        value: "production",
        source: "default" as const,
        editable: true,
      },
      global_active_job_limit: {
        value: 10,
        source: "default" as const,
        editable: true,
      },
    }

    expect(changedModalToolSettings(tool, "2", "3", true)).toEqual({
      active_job_limit: 3,
    })
    expect(changedModalToolSettings(tool, "3", "2", true)).toEqual({
      modal_app_version: 3,
    })
    expect(
      changedModalEnvironmentSettings(environment, "department-a", "10")
    ).toEqual({ modal_environment: "department-a" })
    expect(changedModalToolSettings(tool, "2", "2", true)).toEqual({})
    expect(changedModalToolSettings(tool, "", "2", true)).toEqual({})
    expect(changedModalToolSettings(tool, "0", "2", true)).toEqual({})
    expect(changedModalToolSettings(tool, "2", "", true)).toEqual({})
    expect(changedModalToolSettings(tool, "2", "0", true)).toEqual({
      active_job_limit: 0,
    })
    expect(changedModalToolSettings(tool, "2", "2", false)).toEqual({
      job_logs_visible_to_owner: false,
    })
    expect(
      changedModalEnvironmentSettings(environment, "production", "10")
    ).toEqual({})
    expect(
      changedModalEnvironmentSettings(environment, "production", "")
    ).toEqual({})
  })

  test("sorts administrator users by creation time without mutating them", () => {
    const older = {
      user_id: "older",
      email: "older@example.com",
      display_name: "Older",
      is_admin: false,
      status: "enabled" as const,
      active_job_limit: 2,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    }
    const newer = {
      ...older,
      user_id: "newer",
      email: "newer@example.com",
      display_name: "Newer",
      created_at: "2026-02-01T00:00:00Z",
      updated_at: "2026-02-01T00:00:00Z",
    }
    const users = [older, newer]

    expect(sortAdminUsersByCreatedAt(users, "descending")).toEqual([newer, older])
    expect(sortAdminUsersByCreatedAt(users, "ascending")).toEqual([older, newer])
    expect(users).toEqual([older, newer])
  })

  test("merges successful administrator mutations into cached views", () => {
    const user = {
      user_id: "user-1",
      email: "alice@example.com",
      display_name: "Alice",
      is_admin: false,
      status: "enabled" as const,
      active_job_limit: 2,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    }
    const updatedUser = { ...user, is_admin: true }
    const environment = {
      service_token_id: "token-id",
      modal_environment: {
        value: "production",
        source: "default" as const,
        editable: true,
      },
      global_active_job_limit: {
        value: 10,
        source: "default" as const,
        editable: true,
      },
    }
    const updatedEnvironment = {
      ...environment,
      global_active_job_limit: {
        value: 12,
        source: "database" as const,
        editable: true,
      },
    }
    const tool = {
      tool: "gromacs",
      display_name: "GROMACS MD simulation",
      modal_app_version: {
        value: 2,
        source: "default" as const,
        editable: true,
      },
      active_jobs: 0,
      active_job_limit: {
        value: 2,
        source: "default" as const,
        editable: true,
      },
      job_logs_visible_to_owner: {
        value: true,
        source: "default" as const,
        editable: true,
      },
    }
    const updatedTool = {
      ...tool,
      active_job_limit: {
        value: 3,
        source: "database" as const,
        editable: true,
      },
    }
    const modal = {
      environment,
      tools: [tool],
      state_unknown_jobs: [],
      blocked_jobs: [],
    }

    expect(upsertAdminUser([user], updatedUser)).toEqual([updatedUser])
    expect(upsertAdminUser([], user)).toEqual([user])
    expect(upsertAdminUser(undefined, user)).toBeUndefined()
    expect(mergeAdminModalEnvironment(modal, updatedEnvironment)).toEqual({
      ...modal,
      environment: updatedEnvironment,
    })
    expect(mergeAdminModalTool(modal, updatedTool)).toEqual({
      ...modal,
      tools: [updatedTool],
    })
  })
})
