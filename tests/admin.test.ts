import { describe, expect, test } from "bun:test"

import { settingSourceLabel } from "../src/admin"

describe("Admin settings", () => {
  test("explains every configuration source", () => {
    expect(settingSourceLabel("process_environment")).toBe("Process environment")
    expect(settingSourceLabel("configuration_file")).toBe("Configuration file")
    expect(settingSourceLabel("database")).toBe("Admin setting")
    expect(settingSourceLabel("default")).toBe("Built-in default")
  })
})
