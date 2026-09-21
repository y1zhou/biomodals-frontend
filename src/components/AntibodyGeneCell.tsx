import { Popover } from "@base-ui/react/popover"
import type { GermlinePresentation } from "@/antibody-analysis"

export default function AntibodyGeneCell({ germlines, segment }: { germlines: GermlinePresentation; segment: "v" | "j" }) {
  const assignment = germlines.assignment
  const label = assignment[`${segment}_gene`]
  const evidence = assignment[segment]
  const genes = [...new Map(evidence.map((hit) => [JSON.stringify([hit.species, hit.gene]), hit])).values()]
  return <Popover.Root>
    <Popover.Trigger openOnHover delay={150} className="block max-w-48 cursor-pointer truncate text-left underline decoration-dotted underline-offset-4" aria-label={`${segment.toUpperCase()} gene: ${label ?? "Unavailable"}`}>
      {label ?? "—"}
    </Popover.Trigger>
    <Popover.Portal><Popover.Positioner sideOffset={6} className="z-50" align="start">
      <Popover.Popup className="max-h-96 w-96 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border bg-popover p-4 text-sm leading-6 text-popover-foreground shadow-lg">
        <Popover.Title className="font-semibold">{segment.toUpperCase()} germline matches</Popover.Title>
        <Popover.Description className="mt-1 text-muted-foreground">All tied matched reference species and genes. Frequencies refer to the therapeutic reference snapshot.</Popover.Description>
        <ul className="mt-3 space-y-3">{genes.map((gene) => {
          const usage = germlines[`${segment}_usage`].find((item) => item.species === gene.species && item.gene === gene.gene)
          const alleles = [...new Set(evidence.filter((hit) => hit.species === gene.species && hit.gene === gene.gene).map((hit) => hit.allele))]
          return <li key={`${gene.species}:${gene.gene}`}>
            <p className="font-medium">{gene.gene} · {gene.species}</p>
            <p>Therapeutic usage: {usage?.frequency == null ? "Unavailable" : `${(usage.frequency * 100).toFixed(1)}%`}</p>
            <p className="break-words text-muted-foreground">Alleles: {alleles.join(", ")}</p>
          </li>
        })}</ul>
        {assignment.error ? <p className="mt-2">{assignment.error}</p> : null}
        {assignment.diagnostics.map((text, index) => <p className="mt-2" key={index}>{text}</p>)}
        {!genes.length && !assignment.error ? <p className="mt-2">No qualifying reference match.</p> : null}
      </Popover.Popup>
    </Popover.Positioner></Popover.Portal>
  </Popover.Root>
}
