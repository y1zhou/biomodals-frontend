import { describe, expect, test } from "bun:test"

import { filterTools, toolName, tools } from "../src/tools"

describe("filterTools", () => {
  test("matches names, descriptions, and tags without case sensitivity", () => {
    expect(filterTools(tools, "STRUCTURE").map((tool) => tool.slug)).toEqual([
      "gromacs",
      "alphafold3",
    ])
    expect(filterTools(tools, "molecular").map((tool) => tool.slug)).toEqual([
      "gromacs",
      "alphafold3",
    ])
    expect(filterTools(tools, "csv")).toEqual([])
  })

  test("returns all tools for blank input", () => {
    expect(filterTools(tools, "   ")).toEqual(tools)
  })

  test("maps API workloads to user-facing tool names", () => {
    expect(toolName("gromacs")).toBe("GROMACS MD simulation")
    expect(toolName("alphafold3")).toBe("AlphaFold 3 structure prediction")
    expect(toolName("future-tool")).toBe("future-tool")
  })

  test("keeps AlphaFold 3 visible but unavailable", () => {
    expect(tools.find((tool) => tool.slug === "alphafold3")?.status).toBe("wip")
  })
})
