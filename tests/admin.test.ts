import { describe, expect, test } from "bun:test"

import {
  changedModalEnvironmentSettings,
  changedModalToolSettings,
  mergeAdminModalEnvironment,
  mergeAdminModalTool,
  settingSourceNote,
  upsertAdminUser,
} from "../src/admin"

describe("Admin settings", () => {
  test("only explains configuration sources that need extra context", () => {
    expect(settingSourceNote("process_environment")).toBe(
      "Controlled by the process environment."
    )
    expect(settingSourceNote("configuration_file")).toBe(
      "Default from the configuration file."
    )
    expect(settingSourceNote("database")).toBeNull()
    expect(settingSourceNote("default")).toBeNull()
  })

  test("only submits Modal fields whose values changed", () => {
    const tool = {
      workload: "gromacs",
      display_name: "GROMACS MD simulation",
      modal_app_name: {
        value: "Gromacs",
        source: "default" as const,
        editable: true,
      },
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

    expect(changedModalToolSettings(tool, "Gromacs", "2", "3")).toEqual({
      active_job_limit: 3,
    })
    expect(changedModalToolSettings(tool, "Gromacs Test", "2", "2")).toEqual({
      modal_app_name: "Gromacs Test",
    })
    expect(changedModalToolSettings(tool, "Gromacs", "3", "2")).toEqual({
      modal_app_version: 3,
    })
    expect(
      changedModalEnvironmentSettings(environment, "department-a", "10")
    ).toEqual({ modal_environment: "department-a" })
    expect(changedModalToolSettings(tool, "Gromacs", "2", "2")).toEqual({})
    expect(changedModalToolSettings(tool, "Gromacs", "", "2")).toEqual({})
    expect(changedModalToolSettings(tool, "Gromacs", "0", "2")).toEqual({})
    expect(changedModalToolSettings(tool, "Gromacs", "2", "")).toEqual({})
    expect(changedModalToolSettings(tool, "Gromacs", "2", "0")).toEqual({
      active_job_limit: 0,
    })
    expect(
      changedModalEnvironmentSettings(environment, "production", "10")
    ).toEqual({})
    expect(
      changedModalEnvironmentSettings(environment, "production", "")
    ).toEqual({})
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
      workload: "gromacs",
      display_name: "GROMACS MD simulation",
      modal_app_name: {
        value: "Gromacs",
        source: "default" as const,
        editable: true,
      },
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
