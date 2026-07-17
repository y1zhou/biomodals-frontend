import { Atom, type LucideIcon } from "lucide-react"

export interface Tool {
  slug: string
  name: string
  description: string
  tags: string[]
  icon: LucideIcon
}

export const gromacsTool = {
  slug: "gromacs",
  name: "GROMACS MD simulation",
  description: "Prepare a PDB structure and run a configurable molecular dynamics simulation remotely.",
  tags: ["PDB", "Molecular dynamics", "Remote compute", "Protein structure"],
  icon: Atom,
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

export const tools: Tool[] = [gromacsTool]

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
