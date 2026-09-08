import { ArrowLeft, ArrowRight } from "lucide-react"
import { Link } from "react-router"

import { authenticatedPrincipal, useCurrentUser } from "@/auth-state"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { humanizationPaths, humanizationTool } from "@/tools"

const resultColumns = [
  ["parent_id · candidate_id · is_parent", "Identify each submitted pair, its candidates, and the unchanged parental baseline."],
  ["vh · vl · generating_methods", "Read both candidate sequences and the models that generated them. Parental rows have no generating method."],
  ["quality_tier · panel_order", "Compare quality tiers and the workflow’s diverse candidate order within each parent. Unranked rows remain in the table."],
  ["cdr_preservation · cdr_mutations · vh_mutations · vl_mutations", "Inspect CDR preservation and mutation counts relative to the parent, using IMGT annotations."],
  ["evaluation_complete · *_error", "Check whether all required evidence is present. Evaluator error columns are empty when evaluation succeeds."],
  ["sapiens_* · humatch_* · pabnativ2_*", "Compare model scores and their changes from the parent in *_delta columns. Missing scores stay empty."],
]

export default function HumanizationOverviewPage() {
  const signedIn = Boolean(authenticatedPrincipal(useCurrentUser().data))
  const ToolIcon = humanizationTool.icon
  const target = signedIn ? humanizationPaths.submission : `/login?returnTo=${encodeURIComponent(humanizationPaths.submission)}`
  const jobsTarget = signedIn ? "/jobs?tool=humanization" : `/login?returnTo=${encodeURIComponent("/jobs?tool=humanization")}`

  return <main className="mx-auto max-w-6xl px-6 py-12 lg:px-8 lg:py-20">
    <Link className={cn(buttonVariants({ variant: "ghost" }), "mb-10")} to="/"><ArrowLeft aria-hidden="true" /> All tools</Link>
    <section className="grid items-start gap-10 lg:grid-cols-[1fr_22rem] lg:gap-16">
      <div>
        <span className="grid size-12 place-items-center rounded-xl bg-muted"><ToolIcon aria-hidden="true" className="size-6" /></span>
        <h1 className="mt-6 font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">{humanizationTool.name}</h1>
        <p className="mt-5 text-lg leading-8 text-muted-foreground">{humanizationTool.description}</p>
        <div className="mt-6 flex flex-wrap gap-2">{humanizationTool.tags.map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}</div>
      </div>
      <div className="space-y-4">
        <Card className="shadow-sm">
          <CardHeader><CardTitle>Start a new humanization</CardTitle><p className="mt-1 leading-7 text-muted-foreground">Add antibody pairs and choose the settings for your batch.</p></CardHeader>
          <CardContent><Link className={cn(buttonVariants({ size: "lg" }), "w-full")} to={target}>{signedIn ? "Submit a job" : "Sign in to start"}<ArrowRight aria-hidden="true" /></Link></CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader><CardTitle>Humanization jobs</CardTitle><p className="mt-1 leading-7 text-muted-foreground">Follow active runs and return to previous results.</p></CardHeader>
          <CardContent><Link className={cn(buttonVariants({ size: "lg", variant: "outline" }), "w-full")} to={jobsTarget}>View My Jobs<ArrowRight aria-hidden="true" /></Link></CardContent>
        </Card>
      </div>
    </section>

    <section aria-labelledby="humanization-input-heading" className="mt-16">
      <h2 className="font-heading text-2xl font-semibold" id="humanization-input-heading">Input: paired VH and VL sequences</h2>
      <p className="mt-4 text-lg leading-8 text-muted-foreground">Enter pairs individually or import a UTF-8 CSV up to 10 MiB with the header <code className="font-semibold text-foreground">id,vh,vl</code>. Use one complete antibody variable-domain pair per row and a unique ID for each pair.</p>
      <pre className="mt-5 overflow-x-auto rounded-xl border bg-muted/30 p-5 text-base leading-8"><code>{"id,vh,vl\nab_001,<VH amino-acid sequence>,<VL amino-acid sequence>\nab_002,<VH amino-acid sequence>,<VL amino-acid sequence>"}</code></pre>
      <p className="mt-3 leading-7 text-muted-foreground">Replace the placeholders with full variable-domain sequences. Sequences are uppercased and whitespace is removed for review. Full-length chains, unpaired chains, and VHHs are not supported.</p>
    </section>

    <section aria-labelledby="humanization-models-heading" className="mt-14">
      <h2 className="font-heading text-2xl font-semibold" id="humanization-models-heading">Four models, one candidate panel</h2>
      <p className="mt-4 text-lg leading-8 text-muted-foreground"><strong className="font-semibold text-foreground">Sapiens, Humatch, p-AbNatiV2, and HuDiff</strong> generate candidates in parallel. Duplicate sequences are merged and the unchanged parent is included as a baseline.</p>
      <p className="mt-3 text-lg leading-8 text-muted-foreground">Sapiens, Humatch, and p-AbNatiV2 score the combined candidates. IMGT annotations identify mutations and CDR preservation. Each model’s advanced settings apply to the entire batch.</p>
    </section>

    <section aria-labelledby="humanization-results-heading" className="mt-14">
      <h2 className="font-heading text-2xl font-semibold" id="humanization-results-heading">Results: start with selection.csv</h2>
      <p className="mt-4 text-lg leading-8 text-muted-foreground">Review the columns you need on the job page, or find the full CSV in the result archive. Sorting and parent filtering help compare candidates without changing the workflow’s original order.</p>
      <dl className="mt-6 divide-y rounded-xl border px-5">
        {resultColumns.map(([columns, description]) => <div className="py-5" key={columns}>
          <dt className="break-words font-mono text-base font-medium">{columns}</dt>
          <dd className="mt-2 text-base leading-7 text-muted-foreground">{description}</dd>
        </div>)}
      </dl>
      <p className="mt-5 text-base leading-7 text-muted-foreground">The complete archive also includes detailed score tables under <code>scores/</code>, <code>imgt_mutations.parquet</code>, unique generation outputs under <code>native/</code>, and <code>manifest.json</code> with settings, model versions, provenance, and failures.</p>
      <p className="mt-3 text-base leading-7 text-muted-foreground">Panel order is a selection heuristic, not a calibrated confidence score or experimental validation.</p>
    </section>
  </main>
}
