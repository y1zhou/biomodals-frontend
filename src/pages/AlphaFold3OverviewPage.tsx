import { ArrowLeft, ArrowRight, Braces, Dna, ListChecks } from "lucide-react"
import { Link } from "react-router"

import { authenticatedPrincipal, useCurrentUser } from "@/auth-state"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { alphafold3Paths, alphafold3Tool } from "@/tools"

const features = [
  {
    description: "Add protein, DNA, RNA, and small-molecule entities with one or more copies.",
    icon: Dna,
    title: "Build an entity input",
  },
  {
    description: "Review parsed entities, chain IDs, seeds, and prediction count before submitting.",
    icon: ListChecks,
    title: "Confirm before running",
  },
  {
    description: "Upload a native AlphaFold3 JSON document when you need advanced inputs.",
    icon: Braces,
    title: "Use expert JSON",
  },
]

export default function AlphaFold3OverviewPage() {
  const currentUser = authenticatedPrincipal(useCurrentUser().data)
  const ToolIcon = alphafold3Tool.icon
  const target = currentUser
    ? alphafold3Paths.submission
    : `/login?returnTo=${encodeURIComponent(alphafold3Paths.submission)}`

  return (
    <main className="mx-auto max-w-6xl px-6 py-12 lg:px-8 lg:py-20">
      <Link className={cn(buttonVariants({ variant: "ghost" }), "mb-10")} to="/">
        <ArrowLeft aria-hidden="true" data-icon="inline-start" />
        All tools
      </Link>

      <section className="grid items-start gap-10 lg:grid-cols-[1fr_22rem] lg:gap-16">
        <div>
          <span className="grid size-12 place-items-center rounded-xl bg-muted">
            <ToolIcon aria-hidden="true" className="size-6" />
          </span>
          <h1 className="mt-6 font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            {alphafold3Tool.name}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
            {alphafold3Tool.description}
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {alphafold3Tool.tags.map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}
          </div>
        </div>

        <div className="space-y-4">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Ready to predict?</CardTitle>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {currentUser
                  ? "Configure molecular inputs, review them, and submit one remote job."
                  : "Sign in to configure and submit a structure prediction."}
              </p>
            </CardHeader>
            <CardContent>
              <Link className={cn(buttonVariants({ size: "lg" }), "w-full")} to={target}>
                {currentUser ? "Configure prediction" : "Sign in to start"}
                <ArrowRight aria-hidden="true" data-icon="inline-end" />
              </Link>
            </CardContent>
          </Card>
          {currentUser ? (
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>AlphaFold3 jobs</CardTitle>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Follow active predictions and download completed result archives.
                </p>
              </CardHeader>
              <CardContent>
                <Link className={cn(buttonVariants({ size: "lg", variant: "outline" }), "w-full")} to="/jobs?tool=alphafold3">
                  View My Jobs
                  <ArrowRight aria-hidden="true" data-icon="inline-end" />
                </Link>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </section>

      <section className="mt-20" aria-labelledby="alphafold3-workflow-heading">
        <h2 className="font-heading text-2xl font-semibold" id="alphafold3-workflow-heading">From inputs to structures</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {features.map(({ description, icon: Icon, title }) => (
            <Card key={title}>
              <CardHeader>
                <span className="mb-3 grid size-9 place-items-center rounded-lg bg-muted"><Icon aria-hidden="true" className="size-4" /></span>
                <CardTitle>{title}</CardTitle>
              </CardHeader>
              <CardContent><p className="leading-6 text-muted-foreground">{description}</p></CardContent>
            </Card>
          ))}
        </div>
      </section>
    </main>
  )
}
