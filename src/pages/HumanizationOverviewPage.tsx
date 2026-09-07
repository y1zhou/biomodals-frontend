import { ArrowLeft, ArrowRight } from "lucide-react"
import { Link } from "react-router"

import { authenticatedPrincipal, useCurrentUser } from "@/auth-state"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { humanizationPaths, humanizationTool } from "@/tools"

export default function HumanizationOverviewPage() {
  const user = useCurrentUser()
  const signedIn = Boolean(authenticatedPrincipal(user.data))
  return <main className="mx-auto max-w-6xl px-6 py-12 lg:px-8">
    <Link className={buttonVariants({ variant: "ghost" })} to="/"><ArrowLeft aria-hidden="true" /> All tools</Link>
    <h1 className="mt-8 font-heading text-4xl font-semibold">{humanizationTool.name}</h1>
    <p className="mt-5 max-w-3xl text-lg text-muted-foreground">{humanizationTool.description}</p>
    <Link className={`${buttonVariants({ size: "lg" })} mt-6`} to={signedIn ? humanizationPaths.submission : `/login?returnTo=${encodeURIComponent(humanizationPaths.submission)}`}>{signedIn ? "Start humanization" : "Sign in to start"}<ArrowRight aria-hidden="true" /></Link>
    <div className="mt-10 grid gap-4 md:grid-cols-2">
      <Card><CardHeader><CardTitle>Build a paired batch</CardTitle></CardHeader><CardContent className="text-sm leading-6 text-muted-foreground">Enter an ID, VH and VL, or import CSV with id,vh,vl columns. Review and edit normalized sequences before submitting. Complete variable-domain pairs are required; full-length chains, unpaired chains and VHHs are outside this workflow.</CardContent></Card>
      <Card><CardHeader><CardTitle>Generate and compare</CardTitle></CardHeader><CardContent className="text-sm leading-6 text-muted-foreground">Sapiens, Humatch, p-AbNatiV2 and HuDiff generate candidates independently. Three evaluators score the combined candidates and parental baseline; IMGT annotations report CDR preservation. Advanced settings apply to the whole batch.</CardContent></Card>
      <Card><CardHeader><CardTitle>Return to your job</CardTitle></CardHeader><CardContent className="text-sm leading-6 text-muted-foreground">After submission is confirmed, work continues remotely. Follow stages and return through <Link className="underline" to="/jobs">My Jobs</Link>. Useful partial results retain successful candidates and explicit evaluation errors.</CardContent></Card>
      <Card><CardHeader><CardTitle>Review candidates</CardTitle></CardHeader><CardContent className="text-sm leading-6 text-muted-foreground">Sort and filter the selection table, inspect paired sequences, and download CSV or the complete archive. Panel ordering is a provisional selection heuristic, not a calibrated confidence score or evidence of experimental performance.</CardContent></Card>
    </div>
  </main>
}
