import type { ReferenceInfo } from "@/antibody-analysis"

export default function AntibodyReferenceFaq({ reference }: { reference: ReferenceInfo }) {
  return <details className="rounded-lg border p-4 text-sm leading-7 text-muted-foreground">
    <summary className="cursor-pointer text-base font-medium text-foreground">How are germline matches and therapeutic frequencies interpreted?</summary>
    <div className="mt-4 space-y-3">
      <p>V and J are nearest-reference sequence matches across the bundled species, not proof of ancestry or the antibody’s organism. Gene cells preserve all tied species-qualified assignments; their details retain alleles.</p>
      <p>Therapeutic usage is the weighted share of unique chains in the Thera-SAbDab snapshot marked exactly Approved. Withdrawn-approval labels are excluded. Primary and secondary bispecific sequences are pooled and deduplicated, with separate heavy-chain and pooled light-chain denominators.</p>
      <p>One chain’s credit is split equally across tied species-qualified genes. Synonymous alleles do not add extra weight. This is a reference-dataset frequency, not natural repertoire usage, clinical success, or proof of current approval. Unavailable frequencies remain missing.</p>
      {reference.status === "unavailable" ? <p role="status">Therapeutic frequencies unavailable. {reference.detail}</p> : null}
      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
        <dt>Source snapshot</dt><dd className="break-all">{reference.source_url}</dd>
        <dt>Downloaded</dt><dd>{reference.downloaded_at ?? "Unavailable"}</dd>
        <dt>SHA-256</dt><dd className="break-all font-mono text-xs">{reference.source_sha256 ?? "Unavailable"}</dd>
        <dt>Annotation engine</dt><dd>{reference.engine_version ?? "Unavailable"}</dd>
        <dt>Germline reference</dt><dd>{reference.germline_reference ?? "Unavailable"}</dd>
        <dt>Counting policy</dt><dd>{reference.policy_version ?? "Unavailable"}</dd>
        <dt>Unique chains</dt><dd>{reference.heavy_sequences ?? "Unavailable"} heavy; {reference.light_sequences ?? "Unavailable"} light</dd>
      </dl>
      <p>Reference: <a className="underline underline-offset-4" href="https://opig.stats.ox.ac.uk/webapps/sabdab-sabpred/therasabdab/about/" rel="noreferrer" target="_blank">Thera-SAbDab, the Therapeutic Structural Antibody Database</a>. Numbering and bundled germline references are provided by <a className="underline underline-offset-4" href="https://github.com/y1zhou/arpeggia" rel="noreferrer" target="_blank">arpeggia</a>.</p>
    </div>
  </details>
}
