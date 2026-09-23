import { describe, expect, test } from "bun:test"

import {
  availableTools,
  jobTools,
  filterToolCatalog,
  toolCatalog,
  toolName,
  toolKey,
  toolJobPath,
  toolSubmissionPath,
} from "../src/tools"

describe("filterToolCatalog", () => {
  test("matches names, descriptions, and tags without case sensitivity", () => {
    expect(
      filterToolCatalog(toolCatalog, "STRUCTURE").map((tool) => tool.slug)
    ).toEqual(["gromacs", "alphafold3"])
    expect(
      filterToolCatalog(toolCatalog, "molecular").map((tool) => tool.slug)
    ).toEqual(["gromacs", "alphafold3"])
    expect(filterToolCatalog(toolCatalog, "sequence").map((tool) => tool.slug)).toEqual(["humanization", "nanobody-humanization", "antibody-sequence-analysis"])
  })

  test("returns all tools for blank input", () => {
    expect(filterToolCatalog(toolCatalog, "   ")).toEqual(toolCatalog)
  })

  test("maps API workloads to user-facing tool names", () => {
    expect(toolName("gromacs")).toBe("GROMACS MD simulation")
    expect(toolName("alphafold3")).toBe("AlphaFold3 structure prediction")
    expect(toolName("future-tool")).toBe("future-tool")
  })

  test("labels the humanization billing category in Admin Modal costs", () => {
    expect(toolName("humanization")).toBe("Antibody humanization")
  })

  test("makes AlphaFold3 available", () => {
    expect(
      toolCatalog.find((tool) => tool.slug === "alphafold3")?.status
    ).toBe("available")
    expect(availableTools.map((tool) => tool.slug)).toEqual([
      "gromacs",
      "alphafold3",
      "humanization",
      "nanobody-humanization",
      "antibody-sequence-analysis",
    ])
  })

  test("keeps immediate analysis out of Job filters", () => {
    expect(jobTools.map(toolKey)).toEqual(["gromacs", "alphafold3", "humanization", "nanobody_humanization"])
    expect(toolName("antibody-sequence-analysis")).toBe("Antibody sequence analysis")
  })

  test("maps nanobody API keys to the named Tool and browser routes", () => {
    expect(toolName("nanobody_humanization")).toBe("Nanobody humanization")
    expect(toolJobPath("nanobody_humanization", "job-id")).toBe("/tools/nanobody-humanization/jobs/job-id")
    expect(toolSubmissionPath("nanobody_humanization")).toBe("/tools/nanobody-humanization/new")
  })

  test("keeps catalog tags specific to each tool", () => {
    expect(toolCatalog.flatMap((tool) => tool.tags)).not.toContain("Remote compute")
  })
})
