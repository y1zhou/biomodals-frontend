import { Component, type ErrorInfo, type ReactNode } from "react"

import { Button, buttonVariants } from "@/components/ui/button"

export default class AppErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    document.title = "Unable to load page | BioModals"
    if (import.meta.env.DEV) {
      console.error("BioModals frontend failed", error, info.componentStack)
    }
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <main className="grid min-h-svh place-items-center px-6 text-center">
        <div className="max-w-md">
          <h1 className="font-heading text-3xl font-semibold">
            BioModals could not load this page
          </h1>
          <p className="mt-3 leading-7 text-muted-foreground">
            Reload the page, or return to the tool catalog and try again.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button onClick={() => window.location.reload()}>Reload</Button>
            <a className={buttonVariants({ variant: "outline" })} href="/">
              Return home
            </a>
          </div>
        </div>
      </main>
    )
  }
}
