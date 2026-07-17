import { ArrowUpRight, LoaderCircle, Search } from "lucide-react"
import { lazy, Suspense, useState } from "react"
import { Link, Route, Routes } from "react-router"

import AppShell from "@/AppShell"
import { LoginPage, ProtectedRoute, SetPasswordPage } from "@/auth"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { filterTools, gromacsPaths, toolOverviewPath, tools } from "@/tools"

const GromacsOverviewPage = lazy(() => import("@/pages/GromacsOverviewPage"))
const GromacsSubmissionPage = lazy(() => import("@/pages/GromacsSubmissionPage"))
const JobDetailPage = lazy(() => import("@/pages/JobDetailPage"))
const JobsPage = lazy(() => import("@/pages/JobsPage"))

function LandingPage() {
  const [query, setQuery] = useState("")
  const visibleTools = filterTools(tools, query)

  return (
    <main className="min-h-[calc(100svh-73px)] bg-[radial-gradient(circle_at_top_left,var(--color-muted),transparent_34rem)]">
      <div className="mx-auto max-w-6xl px-6 pb-20 pt-16 lg:px-8 lg:pt-24">
        <section className="max-w-3xl">
          <Badge className="mb-5" variant="secondary">
            Biology, without the setup
          </Badge>
          <h1 className="font-heading text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            Useful biology tools, ready in your browser.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
            Search the collection, open a Tool, and submit your data. Compute-heavy Jobs run remotely while you stay in control here.
          </p>

          <div className="relative mt-8 max-w-xl">
            <label className="sr-only" htmlFor="tool-search">
              Search Tools
            </label>
            <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-11 bg-background pl-9 shadow-sm"
              id="tool-search"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search Tools, formats, or workflows…"
              type="search"
              value={query}
            />
          </div>
        </section>

        <section aria-labelledby="tools-heading" className="mt-14 lg:mt-20">
          <h2 className="font-heading text-xl font-semibold" id="tools-heading">
            Tools
          </h2>
          <p aria-live="polite" className="mt-1 text-sm text-muted-foreground">
            {visibleTools.length} {visibleTools.length === 1 ? "Tool" : "Tools"}
          </p>

          {visibleTools.length > 0 ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {visibleTools.map((tool) => {
                const Icon = tool.icon

                return (
                  <Link className="group rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50" key={tool.slug} to={toolOverviewPath(tool)}>
                    <Card className="h-full transition-[transform,box-shadow] duration-200 group-hover:-translate-y-0.5 group-hover:shadow-lg">
                      <CardHeader>
                        <div className="mb-5 flex items-start justify-between">
                          <span className="grid size-10 place-items-center rounded-lg bg-muted text-foreground">
                            <Icon aria-hidden="true" className="size-5" />
                          </span>
                          <ArrowUpRight aria-hidden="true" className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                        </div>
                        <CardTitle>{tool.name}</CardTitle>
                        <CardDescription className="mt-1 leading-6">
                          {tool.description}
                        </CardDescription>
                        <div className="mt-5 flex flex-wrap gap-1.5">
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
              <p className="mt-4 font-medium">No Tools match “{query}”</p>
              <p className="mt-1 text-sm text-muted-foreground">Try a broader search.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

function RouteLoading() {
  return (
    <main className="grid min-h-[60svh] place-items-center px-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        Loading Tool…
      </div>
    </main>
  )
}

function NotFoundPage() {
  return (
    <main className="grid min-h-[calc(100svh-73px)] place-items-center px-6 text-center">
      <div>
        <p className="text-sm font-medium text-muted-foreground">404</p>
        <h1 className="mt-2 font-heading text-3xl font-semibold">Page not found</h1>
        <Link className={cn(buttonVariants(), "mt-6")} to="/">
          Back to Tools
        </Link>
      </div>
    </main>
  )
}

export default function App() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route element={<AppShell />}>
          <Route element={<LandingPage />} path="/" />
          <Route element={<GromacsOverviewPage />} path={gromacsPaths.overview} />
          <Route element={<LoginPage />} path="/login" />
          <Route element={<SetPasswordPage />} path="/set-password" />
          <Route element={<ProtectedRoute />}>
            <Route element={<JobsPage />} path="/jobs" />
            <Route element={<GromacsSubmissionPage />} path={gromacsPaths.submission} />
            <Route element={<JobDetailPage />} path={gromacsPaths.jobRoute} />
          </Route>
          <Route element={<NotFoundPage />} path="*" />
        </Route>
      </Routes>
    </Suspense>
  )
}
