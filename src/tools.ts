import { FlaskConical, type LucideIcon } from "lucide-react"

export interface Tool {
  slug: string
  name: string
  description: string
  tags: string[]
  icon: LucideIcon
}

export const tools: Tool[] = [
  {
    slug: "gromacs",
    name: "GROMACS MD simulation",
    description: "Prepare a PDB structure and run a configurable molecular dynamics simulation remotely.",
    tags: ["PDB", "Molecular dynamics", "Remote compute", "Protein structure"],
    icon: FlaskConical,
  },
]

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
