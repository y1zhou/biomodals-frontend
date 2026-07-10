import { Database, Dna, FlaskConical, type LucideIcon } from "lucide-react"

export interface Tool {
  slug: string
  name: string
  description: string
  tags: string[]
  icon: LucideIcon
}

export const tools: Tool[] = [
  {
    slug: "sequence-converter",
    name: "Sequence converter",
    description: "Convert and inspect common biological sequence formats.",
    tags: ["FASTA", "FASTQ"],
    icon: Dna,
  },
  {
    slug: "structure-prediction",
    name: "Structure prediction",
    description: "Submit sequences for remote protein structure prediction.",
    tags: ["Protein", "Modal"],
    icon: FlaskConical,
  },
  {
    slug: "dataset-inspector",
    name: "Dataset inspector",
    description: "Preview and validate tabular biological datasets.",
    tags: ["CSV", "Validation"],
    icon: Database,
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
