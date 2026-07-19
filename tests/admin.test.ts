import { describe, expect, test } from "bun:test"

import {
  changedModalEnvironmentSettings,
  changedModalToolSettings,
  settingSourceNote,
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
      modal_app_name: {
        value: "Gromacs",
        source: "default" as const,
        editable: true,
      },
      running_jobs: 0,
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

    expect(changedModalToolSettings(tool, "Gromacs", "3")).toEqual({
      active_job_limit: 3,
    })
    expect(changedModalToolSettings(tool, "Gromacs Test", "2")).toEqual({
      modal_app_name: "Gromacs Test",
    })
    expect(
      changedModalEnvironmentSettings(environment, "department-a", "10")
    ).toEqual({ modal_environment: "department-a" })
    expect(changedModalToolSettings(tool, "Gromacs", "2")).toEqual({})
    expect(
      changedModalEnvironmentSettings(environment, "production", "10")
    ).toEqual({})
  })
})
