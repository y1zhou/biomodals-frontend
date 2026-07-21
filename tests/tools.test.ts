import { describe, expect, test } from "bun:test"

import {
  availableTools,
  filterToolCatalog,
  toolCatalog,
  toolName,
} from "../src/tools"

describe("filterToolCatalog", () => {
  test("matches names, descriptions, and tags without case sensitivity", () => {
    expect(
      filterToolCatalog(toolCatalog, "STRUCTURE").map((tool) => tool.slug)
    ).toEqual(["gromacs", "alphafold3"])
    expect(
      filterToolCatalog(toolCatalog, "molecular").map((tool) => tool.slug)
    ).toEqual(["gromacs", "alphafold3"])
    expect(filterToolCatalog(toolCatalog, "csv")).toEqual([])
  })

  test("returns all tools for blank input", () => {
    expect(filterToolCatalog(toolCatalog, "   ")).toEqual(toolCatalog)
  })

  test("maps API workloads to user-facing tool names", () => {
    expect(toolName("gromacs")).toBe("GROMACS MD simulation")
    expect(toolName("alphafold3")).toBe("AlphaFold 3 structure prediction")
    expect(toolName("future-tool")).toBe("future-tool")
  })

  test("keeps AlphaFold 3 visible but unavailable", () => {
    expect(
      toolCatalog.find((tool) => tool.slug === "alphafold3")?.status
    ).toBe("wip")
    expect(availableTools.map((tool) => tool.slug)).toEqual(["gromacs"])
  })
})
