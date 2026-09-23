import { ArrowLeft, ArrowRight } from "lucide-react"
import { Link } from "react-router"
import { authenticatedPrincipal, useCurrentUser } from "@/auth-state"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { nanobodyPaths, nanobodyTool } from "@/tools"

export default function NanobodyOverviewPage() {
  const signedIn = !!authenticatedPrincipal(useCurrentUser().data)
  const target = (path: string) => signedIn ? path : `/login?returnTo=${encodeURIComponent(path)}`
  const Icon = nanobodyTool.icon
  return <main className="mx-auto max-w-6xl space-y-12 px-6 py-12 lg:px-8">
    <Link className={buttonVariants({ variant: "ghost" })} to="/"><ArrowLeft />All tools</Link>
    <section className="grid items-start gap-10 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-5"><Icon className="size-10" /><h1 className="text-4xl font-semibold">{nanobodyTool.name}</h1><p className="text-lg leading-8 text-muted-foreground">{nanobodyTool.description}</p><div className="flex flex-wrap gap-2">{nanobodyTool.tags.map((tag) => <Badge variant="outline" key={tag}>{tag}</Badge>)}</div></div>
      <div className="space-y-4"><Card><CardHeader><CardTitle>Start a new humanization</CardTitle><p className="leading-7 text-muted-foreground">Add sequences and review the prepared parents before submitting.</p></CardHeader><CardContent><Link className={buttonVariants()} to={target(nanobodyPaths.submission)}>{signedIn ? "Submit a job" : "Sign in to start"}<ArrowRight /></Link></CardContent></Card>
        <Card><CardHeader><CardTitle>Nanobody jobs</CardTitle><p className="leading-7 text-muted-foreground">Follow active runs and return to previous results.</p></CardHeader><CardContent><Link className={buttonVariants({ variant: "outline" })} to={target("/jobs?tool=nanobody_humanization")}>View My Jobs<ArrowRight /></Link></CardContent></Card></div>
    </section>
    <section className="space-y-4"><h2 className="text-2xl font-semibold">Input: one VH sequence per parent</h2><p className="text-lg leading-8 text-muted-foreground">Add an ID and sequence, or import UTF-8 CSV with columns <code>id,vhh</code>. Any valid VH is accepted; this does not establish camelid origin or functional single-domain behavior.</p><pre className="overflow-auto rounded-lg border bg-muted/30 p-4">{"id,vhh\nnb_001,<VH amino-acid sequence>"}</pre><p className="leading-7 text-muted-foreground">Preparation trims non-variable flanks and completes missing terminal frameworks. Review the prepared sequence inline. This frozen sequence becomes the parental baseline; original inputs are retained separately.</p></section>
    <section className="space-y-4"><h2 className="text-2xl font-semibold">Two generators, common scoring</h2><p className="text-lg leading-8 text-muted-foreground">AbNatiV2 VHH and HuDiff-Nb are both eligible to run under the shared scheduler. Available capacity determines when each method starts; they may run at different times. Native CDR masks, prepared-parent cysteines and parental IMGT 42/49/50/52 remain protected.</p><p className="leading-7 text-muted-foreground">AbNatiV2 uses enhanced search by default, returning one best-effort endpoint that may be unchanged. Explore more candidates tests all allowed nonparent combinations when they fit the budget, otherwise a reproducible sample balanced across mutation counts. Every passing design enters the shared ranking; a larger budget does not guarantee more accepted designs. HuDiff-Nb sampling is unchanged and can produce duplicates or invalid designs.</p><p className="leading-7 text-muted-foreground">Solvent-exposure screening is on by default and uses a predicted parent structure. Turning it off admits buried positions and removes the need for that structure calculation. Neither mode generates unused candidate structure reports. Every unique candidate and prepared parent is evaluated with human-VH (VH2) and VHH (VHH2) nativeness models. There is no separate HuDiff quality score. Higher model scores do not demonstrate fold retention or experimental benefit.</p></section>
    <section className="space-y-4"><h2 className="text-2xl font-semibold">Results: compare candidates with their prepared parent</h2><p className="text-lg leading-8 text-muted-foreground">Explore the sortable candidate table or download selection.csv and its compact evidence archive. Select standalone VH sequences for local analysis. A partial run preserves usable candidates; missing scores remain unranked. If both generators fail for every parent, the job fails.</p></section>
  </main>
}
