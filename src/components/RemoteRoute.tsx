import { useState } from "react"
import { Link, Outlet } from "react-router"

import { useCapabilities } from "@/capabilities"
import { Button, buttonVariants } from "@/components/ui/button"

export default function RemoteRoute() {
  const capabilities = useCapabilities()
  const [wasEnabled, setWasEnabled] = useState(false)
  if (capabilities.remoteExecutionEnabled && !wasEnabled) setWasEnabled(true)

  return (
    <>
      {/* Mount only after confirmation; preserve drafts across later outages. */}
      <div hidden={!capabilities.remoteExecutionEnabled} inert={!capabilities.remoteExecutionEnabled}>
        {wasEnabled ? <Outlet /> : null}
      </div>
      {!capabilities.remoteExecutionEnabled ? (
        <main className="mx-auto max-w-lg px-6 py-24 text-center">
          <h1 className="font-heading text-2xl font-semibold">
            {capabilities.isPending
              ? "Checking tool availability…"
              : capabilities.isError
                ? "Couldn’t check tool availability"
                : "Remote tools are unavailable"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {capabilities.isError
              ? "Check the connection and try again."
              : capabilities.isPending
                ? "Checking which tools this service can run."
                : "This service currently offers local tools only."}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            {capabilities.isError ? (
              <Button disabled={capabilities.isFetching} onClick={() => void capabilities.refetch()}>
                Retry tool availability
              </Button>
            ) : null}
            <Link className={buttonVariants({ variant: "outline" })} to="/">Back to tools</Link>
          </div>
        </main>
      ) : null}
    </>
  )
}
