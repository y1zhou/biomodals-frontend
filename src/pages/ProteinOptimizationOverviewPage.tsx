import { ArrowLeft, ArrowRight } from "lucide-react"
import { Link } from "react-router"
import { authenticatedPrincipal, useCurrentUser } from "@/auth-state"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { proteinOptimizationPaths, proteinOptimizationTool } from "@/tools"

export default function ProteinOptimizationOverviewPage() {
  const signedIn = !!authenticatedPrincipal(useCurrentUser().data)
  const target = (path: string) => signedIn ? path : `/login?returnTo=${encodeURIComponent(path)}`
  const Icon = proteinOptimizationTool.icon
  return <main className="mx-auto max-w-6xl space-y-10 px-6 py-12 lg:px-8">
    <Link className={buttonVariants({ variant: "ghost" })} to="/"><ArrowLeft aria-hidden="true" />All tools</Link>
    <section className="grid items-start gap-10 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-5"><Icon aria-hidden="true" className="size-10" /><h1 className="text-4xl font-semibold">{proteinOptimizationTool.name}</h1><p className="text-lg leading-8 text-muted-foreground">{proteinOptimizationTool.description}</p><div className="flex flex-wrap gap-2">{proteinOptimizationTool.tags.map((tag) => <Badge variant="outline" key={tag}>{tag}</Badge>)}</div></div>
      <div className="space-y-4"><Card><CardHeader><CardTitle>Design new variants</CardTitle><p className="leading-7 text-muted-foreground">Review your measurements, parental chains and design space before submitting.</p></CardHeader><CardContent><Link className={buttonVariants()} to={target(proteinOptimizationPaths.submission)}>{signedIn ? "Submit a job" : "Sign in to start"}<ArrowRight aria-hidden="true" /></Link></CardContent></Card>
        <Card><CardHeader><CardTitle>Optimization jobs</CardTitle><p className="leading-7 text-muted-foreground">Follow active runs and return to candidate results.</p></CardHeader><CardContent><Link className={buttonVariants({ variant: "outline" })} to={target("/jobs?tool=protein_optimization")}>View My Jobs<ArrowRight aria-hidden="true" /></Link></CardContent></Card></div>
    </section>
    <section className="space-y-4"><h2 className="text-2xl font-semibold">Start with experimental measurements</h2><p className="text-lg leading-8 text-muted-foreground">Upload CSV with <code>mutations,label</code> and optional <code>id</code>. Discover the chain IDs, then supply their parental FASTA. Positions are one-based coordinates in your full sequences. Labels keep their numerical scale, with your choice of higher or lower being better.</p><pre className="overflow-auto rounded-lg bg-muted p-4">{'id,mutations,label\nparent,,1.2\nvariant_1,A:Y52F,1.8\nvariant_2,"A:Y52F,B:S30A",2.4'}</pre><p className="text-muted-foreground">Repeated variants are experimental replicates. Invalid labels and residue mismatches must be corrected; rows are not silently discarded. Arbitrary proteins and named chains are supported without antibody trimming or numbering.</p></section>
    <section className="grid gap-6 md:grid-cols-2"><div className="space-y-3"><h2 className="text-2xl font-semibold">Combination</h2><p className="text-lg leading-8 text-muted-foreground">Additive ridge recombines measured substitutions, scoring every compatible novel combination through the requested mutation count. Oversized exhaustive requests are rejected. Additive effects do not model interactions between mutations.</p></div><div className="space-y-3"><h2 className="text-2xl font-semibold">Exploration</h2><p className="text-lg leading-8 text-muted-foreground">ESMC600M sequence features and TabPFN score variants containing new substitutions. Edit the positions and allowed residues, and reproducibly sample larger spaces within an evaluation budget. Separately encoded chains do not model multimer structure.</p></div></section>
    <section className="space-y-4"><h2 className="text-2xl font-semibold">Compare novel candidates</h2><p className="text-lg leading-8 text-muted-foreground">Results contain predicted labels, mutation lists and complete chain sequences. Filter, sort and select candidates across pages; download all or selected candidates as CSV. The unchanged parent and measured variants are excluded from candidate results. All usable measured variants train the final model.</p><p className="text-muted-foreground">A compact held-out validation summary reports available evidence and limitations. Predictions are not experimental confirmation. Each new experimental round starts with a new measurement snapshot and Job.</p></section>
  </main>
}
