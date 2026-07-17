import { describe, expect, test } from "bun:test"

import { filterTools, tools } from "../src/tools"

describe("filterTools", () => {
  test("matches names, descriptions, and tags without case sensitivity", () => {
    expect(filterTools(tools, "STRUCTURE").map((tool) => tool.slug)).toEqual(["gromacs"])
    expect(filterTools(tools, "molecular").map((tool) => tool.slug)).toEqual(["gromacs"])
    expect(filterTools(tools, "csv")).toEqual([])
  })

  test("returns all tools for blank input", () => {
    expect(filterTools(tools, "   ")).toEqual(tools)
  })
})
