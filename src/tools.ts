import { Atom, Dna, ScanText, UserRoundArrowLeft, type LucideIcon } from "lucide-react"

interface ToolCatalogEntryBase {
  slug: string
  name: string
  description: string
  tags: string[]
  icon: LucideIcon
}

export interface AvailableTool extends ToolCatalogEntryBase {
  status: "available"
  createsJobs: boolean
  apiKey?: string
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
  createsJobs: true,
} satisfies AvailableTool

export const alphafold3Tool = {
  slug: "alphafold3",
  name: "AlphaFold3 structure prediction",
  description: "Predict biomolecular structures and interactions from molecular inputs.",
  tags: ["Protein structure", "Structure prediction"],
  icon: Dna,
  status: "available",
  createsJobs: true,
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
  createsJobs: true,
} satisfies AvailableTool

export const antibodyAnalysisTool = {
  slug: "antibody-sequence-analysis",
  name: "Antibody sequence analysis",
  description: "Compare antibody sequences, physicochemical properties, germline matches and numbered CDRs.",
  tags: ["Antibody", "Sequence", "Analysis"],
  icon: ScanText,
  status: "available",
  createsJobs: false,
} satisfies AvailableTool
export const antibodyAnalysisPath = toolOverviewPath(antibodyAnalysisTool)

export const nanobodyTool = {
  slug: "nanobody-humanization", apiKey: "nanobody_humanization",
  name: "Nanobody humanization",
  description: "Prepare single VH domains and compare humanization candidates from AbNatiV2 VHH and HuDiff-Nb.",
  tags: ["Nanobody", "Humanization", "Sequence"], icon: UserRoundArrowLeft,
  status: "available", createsJobs: true,
} satisfies AvailableTool

const nanobodyOverviewPath = toolOverviewPath(nanobodyTool)
export const nanobodyPaths = {
  overview: nanobodyOverviewPath,
  submission: `${nanobodyOverviewPath}/new`,
  rerun: (jobId: string) => `${nanobodyOverviewPath}/new?source_job=${encodeURIComponent(jobId)}`,
  jobRoute: `${nanobodyOverviewPath}/jobs/:jobId`,
  job: (jobId: string) => `${nanobodyOverviewPath}/jobs/${encodeURIComponent(jobId)}`,
}

export const toolKey = (tool: AvailableTool) => tool.apiKey ?? tool.slug

const humanizationOverviewPath = toolOverviewPath(humanizationTool)
export const humanizationPaths = {
  rerun: (jobId: string) => `/tools/humanization/new?source_job=${encodeURIComponent(jobId)}`,
  overview: humanizationOverviewPath,
  submission: `${humanizationOverviewPath}/new`,
  jobRoute: `${humanizationOverviewPath}/jobs/:jobId`,
  job: (jobId: string) => `${humanizationOverviewPath}/jobs/${encodeURIComponent(jobId)}`,
}

const gromacsOverviewPath = toolOverviewPath(gromacsTool)

export const gromacsPaths = {
  clusteringRoute: `${gromacsOverviewPath}/jobs/:jobId/cluster`,
  clustering: (jobId: string) => `${gromacsOverviewPath}/jobs/${encodeURIComponent(jobId)}/cluster`,
  continuationRoute: `${gromacsOverviewPath}/jobs/:jobId/continue`,
  continuation: (jobId: string) => `${gromacsOverviewPath}/jobs/${encodeURIComponent(jobId)}/continue`,
  overview: gromacsOverviewPath,
  submission: `${gromacsOverviewPath}/new`,
  jobRoute: `${gromacsOverviewPath}/jobs/:jobId`,
  job: (jobId: string) => `${gromacsOverviewPath}/jobs/${encodeURIComponent(jobId)}`,
}

const alphafold3OverviewPath = toolOverviewPath(alphafold3Tool)

export const alphafold3Paths = {
  rerun: (jobId: string) => `${alphafold3OverviewPath}/new?source_job=${encodeURIComponent(jobId)}`,
  overview: alphafold3OverviewPath,
  submission: `${alphafold3OverviewPath}/new`,
  jobRoute: `${alphafold3OverviewPath}/jobs/:jobId`,
  job: (jobId: string) =>
    `${alphafold3OverviewPath}/jobs/${encodeURIComponent(jobId)}`,
}

export function toolJobPath(tool: string, jobId: string) {
  if (tool === "nanobody_humanization") return nanobodyPaths.job(jobId)
  if (tool === "humanization") return humanizationPaths.job(jobId)
  if (tool === "gromacs") return gromacsPaths.job(jobId)
  if (tool === "alphafold3") return alphafold3Paths.job(jobId)
  return "/jobs"
}

export function toolSubmissionPath(tool: string) {
  if (tool === "nanobody_humanization") return nanobodyPaths.submission
  if (tool === "humanization") return humanizationPaths.submission
  if (tool === "gromacs") return gromacsPaths.submission
  if (tool === "alphafold3") return alphafold3Paths.submission
  return "/"
}

export const toolCatalog: ToolCatalogEntry[] = [gromacsTool, alphafold3Tool, humanizationTool, nanobodyTool, antibodyAnalysisTool]

export const availableTools = toolCatalog.filter(
  (entry): entry is AvailableTool => entry.status === "available"
)
export const jobTools = availableTools.filter((tool) => tool.createsJobs)

export function toolName(workload: string) {
  return availableTools.find((entry) => toolKey(entry) === workload)?.name ?? workload
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
