import { Atom, Dna, type LucideIcon } from "lucide-react"

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
  description: "Prepare a PDB structure and run a configurable molecular dynamics simulation remotely.",
  tags: ["PDB", "Molecular dynamics", "Remote compute", "Protein structure"],
  icon: Atom,
  status: "available",
} satisfies AvailableTool

export const alphafold3Tool = {
  slug: "alphafold3",
  name: "AlphaFold 3 structure prediction",
  description: "Predict biomolecular structures and interactions from molecular inputs.",
  tags: ["Protein structure", "Structure prediction", "Remote compute"],
  icon: Dna,
  status: "wip",
} satisfies ToolCatalogPlaceholder

export function toolOverviewPath(tool: AvailableTool) {
  return `/tools/${tool.slug}`
}

const gromacsOverviewPath = toolOverviewPath(gromacsTool)

export const gromacsPaths = {
  overview: gromacsOverviewPath,
  submission: `${gromacsOverviewPath}/new`,
  jobRoute: `${gromacsOverviewPath}/jobs/:jobId`,
  job: (jobId: string) => `${gromacsOverviewPath}/jobs/${encodeURIComponent(jobId)}`,
}

export const toolCatalog: ToolCatalogEntry[] = [gromacsTool, alphafold3Tool]

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
