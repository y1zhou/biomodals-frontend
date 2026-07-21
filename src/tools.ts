import { Atom, Dna, type LucideIcon } from "lucide-react"

export interface Tool {
  slug: string
  name: string
  description: string
  tags: string[]
  icon: LucideIcon
  status: "available" | "wip"
}

export const gromacsTool = {
  slug: "gromacs",
  name: "GROMACS MD simulation",
  description: "Prepare a PDB structure and run a configurable molecular dynamics simulation remotely.",
  tags: ["PDB", "Molecular dynamics", "Remote compute", "Protein structure"],
  icon: Atom,
  status: "available",
} satisfies Tool

export const alphafold3Tool = {
  slug: "alphafold3",
  name: "AlphaFold 3 structure prediction",
  description: "Predict biomolecular structures and interactions from molecular inputs.",
  tags: ["Protein structure", "Structure prediction", "Remote compute"],
  icon: Dna,
  status: "wip",
} satisfies Tool

export function toolOverviewPath(tool: Pick<Tool, "slug">) {
  return `/tools/${tool.slug}`
}

const gromacsOverviewPath = toolOverviewPath(gromacsTool)

export const gromacsPaths = {
  overview: gromacsOverviewPath,
  submission: `${gromacsOverviewPath}/new`,
  jobRoute: `${gromacsOverviewPath}/jobs/:jobId`,
  job: (jobId: string) => `${gromacsOverviewPath}/jobs/${encodeURIComponent(jobId)}`,
}

export const tools: Tool[] = [gromacsTool, alphafold3Tool]

export function toolName(workload: string) {
  return tools.find((tool) => tool.slug === workload)?.name ?? workload
}

export function filterTools(catalog: Tool[], query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase()

  if (!normalizedQuery) return catalog

  return catalog.filter((tool) =>
    [tool.name, tool.description, ...tool.tags]
      .join(" ")
      .toLocaleLowerCase()
      .includes(normalizedQuery)
  )
}
