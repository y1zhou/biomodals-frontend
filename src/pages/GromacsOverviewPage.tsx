import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  FileUp,
  PackageCheck,
  SlidersHorizontal,
} from "lucide-react"
import { Link } from "react-router"

import { authenticatedPrincipal, useCurrentUser } from "@/auth-state"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { WEB_UPLOAD_LIMIT_LABEL } from "@/gromacs"
import { cn } from "@/lib/utils"
import { gromacsPaths, gromacsTool } from "@/tools"

const features = [
  {
    icon: FileUp,
    title: "Bring one protein structure",
    description: `Choose a protein PDB structure up to ${WEB_UPLOAD_LIMIT_LABEL}. Non-protein atoms are removed during preparation.`,
  },
  {
    icon: SlidersHorizontal,
    title: "Configure the simulation",
    description: "Set 1–200 nanoseconds, optionally repair common structure issues with PDBFixer, or use CPU-only execution.",
  },
  {
    icon: Clock3,
    title: "Run in the background",
    description: (
      <>
        The remote job keeps running after you leave. Follow its progress and return
        to completed results from <Link className="font-medium underline underline-offset-4" to="/jobs">My Jobs</Link>.
      </>
    ),
  },
  {
    icon: PackageCheck,
    title: "Download one result",
    description: "Completed and partially completed simulations provide a ZIP result directly from BioModals.",
  },
]

export default function GromacsOverviewPage() {
  const user = useCurrentUser()
  const currentUser = authenticatedPrincipal(user.data)
  const ToolIcon = gromacsTool.icon
  const target = currentUser
    ? gromacsPaths.submission
    : `/login?returnTo=${encodeURIComponent(gromacsPaths.submission)}`

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
            {gromacsTool.name}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
            {gromacsTool.description}
          </p>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            This workflow is protein-only. Ligands, cofactors, ions, waters,
            nucleic acids, and other non-protein atoms are not included in the
            prepared simulation.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {gromacsTool.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Ready to simulate?</CardTitle>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {currentUser
                  ? "Select a PDB file and click the button below."
                  : "Sign in before selecting a PDB so your input stays in place."}
              </p>
            </CardHeader>
            <CardContent>
              <Link
                className={cn(buttonVariants({ size: "lg" }), "w-full")}
                to={target}
              >
                {currentUser ? "Start a simulation" : "Sign in to start"}
                <ArrowRight aria-hidden="true" data-icon="inline-end" />
              </Link>
            </CardContent>
          </Card>

          {currentUser ? (
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>GROMACS jobs</CardTitle>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Review the progress and results of your GROMACS simulations.
                </p>
              </CardHeader>
              <CardContent>
                <Link
                  className={cn(
                    buttonVariants({ size: "lg", variant: "outline" }),
                    "w-full"
                  )}
                  to={`/jobs?tool=${encodeURIComponent(gromacsTool.slug)}`}
                >
                  View My Jobs
                  <ArrowRight aria-hidden="true" data-icon="inline-end" />
                </Link>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="workflow-heading" className="mt-20">
        <h2 className="font-heading text-2xl font-semibold" id="workflow-heading">
          From structure to result
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {features.map(({ icon: Icon, title, description }) => (
            <Card key={title}>
              <CardHeader>
                <span className="mb-3 grid size-9 place-items-center rounded-lg bg-muted">
                  <Icon aria-hidden="true" className="size-4" />
                </span>
                <CardTitle>{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="leading-6 text-muted-foreground">{description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </main>
  )
}
