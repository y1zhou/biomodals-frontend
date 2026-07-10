import { describe, expect, test } from "bun:test"

import { filterTools, tools } from "../src/tools"

describe("filterTools", () => {
  test("matches names, descriptions, and tags without case sensitivity", () => {
    expect(filterTools(tools, "STRUCTURE").map((tool) => tool.slug)).toEqual([
      "structure-prediction",
    ])
    expect(filterTools(tools, "csv").map((tool) => tool.slug)).toEqual([
      "dataset-inspector",
    ])
  })

  test("returns all tools for blank input", () => {
    expect(filterTools(tools, "   ")).toEqual(tools)
  })
})
