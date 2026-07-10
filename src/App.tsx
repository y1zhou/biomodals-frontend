import {
  ArrowLeft,
  ArrowUpRight,
  CloudUpload,
  FlaskConical,
  Search,
} from "lucide-react"
import { useState } from "react"
import { Link, Route, Routes, useParams } from "react-router"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { filterTools, tools } from "@/tools"

function Brand() {
  return (
    <Link className="inline-flex items-center gap-2 font-heading font-semibold" to="/">
      <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
        <FlaskConical aria-hidden="true" className="size-4" />
      </span>
      BioModals
    </Link>
  )
}

function LandingPage() {
  const [query, setQuery] = useState("")
  const visibleTools = filterTools(tools, query)

  return (
    <div className="min-h-svh bg-[radial-gradient(circle_at_top_left,var(--color-muted),transparent_34rem)]">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 lg:px-8">
        <Brand />
        <Badge variant="outline">Starter</Badge>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-20 pt-14 lg:px-8 lg:pt-24">
        <section className="max-w-3xl">
          <Badge className="mb-5" variant="secondary">
            Biology, without the setup
          </Badge>
          <h1 className="font-heading text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            Useful biology tools, ready in your browser.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
            Search the collection, open a tool, and submit your data. Compute-heavy jobs run remotely while you stay in control here.
          </p>

          <div className="relative mt-8 max-w-xl">
            <label className="sr-only" htmlFor="tool-search">
              Search tools
            </label>
            <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-11 bg-background pl-9 shadow-sm"
              id="tool-search"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search tools, formats, or tasks..."
              type="search"
              value={query}
            />
          </div>
        </section>

        <section aria-labelledby="tools-heading" className="mt-14 lg:mt-20">
          <div>
            <h2 className="font-heading text-xl font-semibold" id="tools-heading">
              Starter catalog
            </h2>
            <p aria-live="polite" className="mt-1 text-sm text-muted-foreground">
              {visibleTools.length} example {visibleTools.length === 1 ? "tool" : "tools"}
            </p>
          </div>

          {visibleTools.length > 0 ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {visibleTools.map((tool) => {
                const Icon = tool.icon

                return (
                  <Link className="group rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50" key={tool.slug} to={`/tools/${tool.slug}`}>
                    <Card className="h-full transition-[transform,box-shadow] duration-200 group-hover:-translate-y-0.5 group-hover:shadow-lg">
                      <CardHeader>
                        <div className="mb-5 grid size-10 place-items-center rounded-lg bg-muted text-foreground">
                          <Icon aria-hidden="true" className="size-5" />
                        </div>
                        <CardTitle>{tool.name}</CardTitle>
                        <CardDescription className="mt-1 leading-6">
                          {tool.description}
                        </CardDescription>
                        <CardAction>
                          <ArrowUpRight aria-hidden="true" className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                        </CardAction>
                        <div className="mt-5 flex flex-wrap gap-1.5">
                          <Badge variant="secondary">Example</Badge>
                          {tool.tags.map((tag) => (
                            <Badge key={tag} variant="outline">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </CardHeader>
                    </Card>
                  </Link>
                )
              })}
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-dashed px-6 py-14 text-center">
              <Search aria-hidden="true" className="mx-auto size-6 text-muted-foreground" />
              <p className="mt-4 font-medium">No tools match “{query}”</p>
              <p className="mt-1 text-sm text-muted-foreground">Try a broader search.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

function ToolPage() {
  const { slug } = useParams()
  const tool = tools.find((candidate) => candidate.slug === slug)

  if (!tool) return <NotFoundPage />

  const Icon = tool.icon

  return (
    <div className="min-h-svh">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5 lg:px-8">
          <Brand />
          <Link className={buttonVariants({ variant: "ghost" })} to="/">
            <ArrowLeft aria-hidden="true" data-icon="inline-start" />
            All tools
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-14 lg:px-8 lg:py-20">
        <div className="flex items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-muted">
            <Icon aria-hidden="true" className="size-6" />
          </span>
          <div>
            <Badge className="mb-3" variant="secondary">
              Example route
            </Badge>
            <h1 className="font-heading text-3xl font-semibold tracking-tight">{tool.name}</h1>
            <p className="mt-2 max-w-2xl leading-7 text-muted-foreground">{tool.description}</p>
          </div>
        </div>

        <div className="mt-12 grid min-h-72 place-items-center rounded-xl border border-dashed bg-muted/30 px-6 py-16 text-center">
          <div>
            <CloudUpload aria-hidden="true" className="mx-auto size-8 text-muted-foreground" />
            <h2 className="mt-5 font-heading text-lg font-semibold">Tool interface goes here</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              This route is ready for its upload form, mutation, and job-status polling query.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}

function NotFoundPage() {
  return (
    <main className="grid min-h-svh place-items-center px-6 text-center">
      <div>
        <p className="text-sm font-medium text-muted-foreground">404</p>
        <h1 className="mt-2 font-heading text-3xl font-semibold">Page not found</h1>
        <Link className={cn(buttonVariants(), "mt-6")} to="/">
          Back to tools
        </Link>
      </div>
    </main>
  )
}

export default function App() {
  return (
    <Routes>
      <Route element={<LandingPage />} path="/" />
      <Route element={<ToolPage />} path="/tools/:slug" />
      <Route element={<NotFoundPage />} path="*" />
    </Routes>
  )
}
