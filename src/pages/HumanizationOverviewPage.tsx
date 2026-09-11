import { ArrowLeft, ArrowRight } from "lucide-react"
import { Link } from "react-router"

import { authenticatedPrincipal, useCurrentUser } from "@/auth-state"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { humanizationPaths, humanizationTool } from "@/tools"

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
      <p className="mt-4 text-lg leading-8 text-muted-foreground">Compare candidate sequences, scores, and mutations in the job page’s sortable table, with explanations of each score. The result archive includes the full <code>selection.csv</code>, detailed scores, generation outputs, and a manifest recording settings and provenance.</p>
    </section>
  </main>
}
