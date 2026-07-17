import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  FileUp,
  FlaskConical,
  PackageCheck,
  SlidersHorizontal,
} from "lucide-react"
import { Link } from "react-router"

import { useCurrentUser } from "@/auth-state"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { tools } from "@/tools"

const tool = tools[0]

const features = [
  {
    icon: FileUp,
    title: "Bring one PDB structure",
    description: "Choose a Protein Data Bank structure from your computer. The web uploader supports files up to 100 MiB.",
  },
  {
    icon: SlidersHorizontal,
    title: "Choose the simulation",
    description: "Set 1–200 nanoseconds, optionally repair common structure issues with PDBFixer, or force CPU execution.",
  },
  {
    icon: Clock3,
    title: "Leave and return",
    description: "The remote Job keeps running after you leave. My Jobs gives you a durable recovery path.",
  },
  {
    icon: PackageCheck,
    title: "Download one Result",
    description: "Completed and partially completed simulations provide a ZIP Result directly from BioModals.",
  },
]

export default function GromacsOverviewPage() {
  const user = useCurrentUser()
  const target = user.data
    ? "/tools/gromacs/new"
    : "/login?returnTo=%2Ftools%2Fgromacs%2Fnew"

  return (
    <main className="mx-auto max-w-6xl px-6 py-12 lg:px-8 lg:py-20">
      <Link className={cn(buttonVariants({ variant: "ghost" }), "mb-10")} to="/">
        <ArrowLeft aria-hidden="true" data-icon="inline-start" />
        All Tools
      </Link>

      <section className="grid items-start gap-10 lg:grid-cols-[1fr_22rem] lg:gap-16">
        <div>
          <span className="grid size-12 place-items-center rounded-xl bg-muted">
            <FlaskConical aria-hidden="true" className="size-6" />
          </span>
          <h1 className="mt-6 font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            {tool.name}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
            {tool.description}
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {tool.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        </div>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Ready to simulate?</CardTitle>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Sign in before selecting a PDB so your Input stays in place.
            </p>
          </CardHeader>
          <CardContent>
            <Link
              className={cn(buttonVariants({ size: "lg" }), "w-full")}
              to={target}
            >
              {user.data ? "Start a simulation" : "Sign in to start"}
              <ArrowRight aria-hidden="true" data-icon="inline-end" />
            </Link>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="workflow-heading" className="mt-20">
        <h2 className="font-heading text-2xl font-semibold" id="workflow-heading">
          From structure to Result
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
