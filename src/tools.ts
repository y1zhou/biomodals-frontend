import { Atom, Dna, UserRoundArrowLeft, type LucideIcon } from "lucide-react"

interface ToolCatalogEntryBase {
  slug: string
  name: string
  description: string
  tags: string[]
  icon: LucideIcon
}

export interface AvailableTool extends ToolCatalogEntryBase {
  status: "available"
}

export interface ToolCatalogPlaceholder extends ToolCatalogEntryBase {
  status: "wip"
}

export type ToolCatalogEntry = AvailableTool | ToolCatalogPlaceholder

export const gromacsTool = {
  slug: "gromacs",
  name: "GROMACS MD simulation",
  description: "Prepare a protein PDB structure and run a configurable molecular dynamics simulation remotely.",
  tags: ["PDB", "Molecular dynamics", "Protein structure"],
  icon: Atom,
  status: "available",
} satisfies AvailableTool

export const alphafold3Tool = {
  slug: "alphafold3",
  name: "AlphaFold3 structure prediction",
  description: "Predict biomolecular structures and interactions from molecular inputs.",
  tags: ["Protein structure", "Structure prediction"],
  icon: Dna,
  status: "available",
} satisfies AvailableTool

export function toolOverviewPath(tool: AvailableTool) {
  return `/tools/${tool.slug}`
}

export const humanizationTool = {
  slug: "humanization",
  name: "Antibody humanization",
  description: "Generate and compare humanization candidates from paired antibody VH and VL sequences.",
  tags: ["Antibody", "Humanization", "Sequence"],
  icon: UserRoundArrowLeft,
  status: "available",
} satisfies AvailableTool

const humanizationOverviewPath = toolOverviewPath(humanizationTool)
export const humanizationPaths = {
  overview: humanizationOverviewPath,
  submission: `${humanizationOverviewPath}/new`,
  jobRoute: `${humanizationOverviewPath}/jobs/:jobId`,
  job: (jobId: string) => `${humanizationOverviewPath}/jobs/${encodeURIComponent(jobId)}`,
}

const gromacsOverviewPath = toolOverviewPath(gromacsTool)

export const gromacsPaths = {
  overview: gromacsOverviewPath,
  submission: `${gromacsOverviewPath}/new`,
  jobRoute: `${gromacsOverviewPath}/jobs/:jobId`,
  job: (jobId: string) => `${gromacsOverviewPath}/jobs/${encodeURIComponent(jobId)}`,
}

const alphafold3OverviewPath = toolOverviewPath(alphafold3Tool)

export const alphafold3Paths = {
  overview: alphafold3OverviewPath,
  submission: `${alphafold3OverviewPath}/new`,
  jobRoute: `${alphafold3OverviewPath}/jobs/:jobId`,
  job: (jobId: string) =>
    `${alphafold3OverviewPath}/jobs/${encodeURIComponent(jobId)}`,
}

export function toolJobPath(tool: string, jobId: string) {
  if (tool === "humanization") return humanizationPaths.job(jobId)
  if (tool === "gromacs") return gromacsPaths.job(jobId)
  if (tool === "alphafold3") return alphafold3Paths.job(jobId)
  return "/jobs"
}

export function toolSubmissionPath(tool: string) {
  if (tool === "humanization") return humanizationPaths.submission
  if (tool === "gromacs") return gromacsPaths.submission
  if (tool === "alphafold3") return alphafold3Paths.submission
  return "/"
}

export const toolCatalog: ToolCatalogEntry[] = [gromacsTool, alphafold3Tool, humanizationTool]

export const availableTools = toolCatalog.filter(
  (entry): entry is AvailableTool => entry.status === "available"
)

export function toolName(workload: string) {
  return toolCatalog.find((entry) => entry.slug === workload)?.name ?? workload
}

export function filterToolCatalog(
  catalog: readonly ToolCatalogEntry[],
  query: string
) {
  const normalizedQuery = query.trim().toLocaleLowerCase()

  if (!normalizedQuery) return catalog

  return catalog.filter((tool) =>
    [tool.name, tool.description, ...tool.tags]
      .join(" ")
      .toLocaleLowerCase()
      .includes(normalizedQuery)
  )
}
