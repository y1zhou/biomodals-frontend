import { AlertDialog } from "@base-ui/react/alert-dialog"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertTriangle,
  Database,
  HardDrive,
  LoaderCircle,
  Trash2,
} from "lucide-react"
import { useState } from "react"

import { adminStorageKey } from "@/admin"
import {
  ApiError,
  clearAdminResultCache,
  inspectAdminStorage,
  type AdminCacheCleanup,
} from "@/api/client"
import { useExpireSession } from "@/auth-state"
import { RefreshButton } from "@/components/RefreshButton"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatTimestamp } from "@/jobs"
import { formatBytes } from "@/storage"

function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return `Storage information is unavailable.${error.requestId ? ` Support ID: ${error.requestId}.` : ""}`
  }
  return "Storage information is unavailable."
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="font-heading text-2xl font-semibold tabular-nums">{value}</p>
        <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  )
}

export default function StorageAdminPage() {
  const queryClient = useQueryClient()
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const [loadingEstimate, setLoadingEstimate] = useState(false)
  const [cleanupResult, setCleanupResult] = useState<AdminCacheCleanup | null>(null)
  const storage = useQuery({
    queryKey: adminStorageKey,
    queryFn: ({ signal }) => inspectAdminStorage(signal),
    refetchInterval: false,
    refetchOnWindowFocus: true,
  })
  const clearCache = useMutation({
    mutationFn: clearAdminResultCache,
    onSuccess(result) {
      setCleanupResult(result)
      setConfirmationOpen(false)
      void queryClient.invalidateQueries({ queryKey: adminStorageKey })
    },
  })
  useExpireSession(storage.error)
  useExpireSession(clearCache.error)

  async function prepareConfirmation() {
    setCleanupResult(null)
    clearCache.reset()
    setLoadingEstimate(true)
    try {
      const result = await storage.refetch()
      if (!result.isError && result.data) setConfirmationOpen(true)
    } finally {
      setLoadingEstimate(false)
    }
  }

  if (storage.isPending) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        Loading storage information…
      </div>
    )
  }

  if (!storage.data) {
    return (
      <div>
        <p className="text-sm text-destructive" role="alert">{errorMessage(storage.error)}</p>
        <RefreshButton
          className="mt-4"
          idleLabel="Try again"
          onRefresh={async () => {
            const result = await storage.refetch()
            if (result.isError) throw result.error
          }}
        />
      </div>
    )
  }

  const snapshot = storage.data

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-heading text-xl font-semibold">Storage</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Published results remain authoritative in Modal; this page manages rebuildable local copies.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Last updated {formatTimestamp(storage.dataUpdatedAt)}
          </p>
        </div>
        <RefreshButton
          disabled={storage.isFetching}
          onRefresh={async () => {
            const result = await storage.refetch()
            if (result.isError) throw result.error
          }}
        />
      </div>

      {storage.isError ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" role="alert">
          Storage information could not be refreshed. Showing the last loaded values.
        </p>
      ) : null}

      {snapshot.over_warning_threshold ? (
        <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <p>
            Local cache and staging use exceeds the soft warning threshold of {formatBytes(snapshot.warning_threshold_bytes)}. Jobs are not blocked and no files are removed automatically.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          detail={`${snapshot.published_result_entries} published results recorded`}
          label="Published result size"
          value={formatBytes(snapshot.published_result_bytes)}
        />
        <Metric
          detail={`${snapshot.local_cache_entries} completed local archives`}
          label="Local result cache"
          value={formatBytes(snapshot.local_cache_bytes)}
        />
        <Metric
          detail={`${snapshot.staging_entries} archives being prepared`}
          label="Active staging"
          value={formatBytes(snapshot.staging_bytes)}
        />
        <Metric
          detail="Available on the cache filesystem"
          label="Filesystem free space"
          value={formatBytes(snapshot.free_bytes)}
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-lg bg-muted">
              <HardDrive aria-hidden="true" className="size-4" />
            </span>
            <div>
              <CardTitle>Local result cache</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Clear unleased completed archives without deleting jobs or Modal Volume data.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-muted/30 p-4">
            <div className="flex items-center gap-3">
              <Database aria-hidden="true" className="size-5 text-muted-foreground" />
              <p className="text-sm">
                <span className="font-medium tabular-nums">{snapshot.reclaimable_entries}</span> reclaimable archives · <span className="font-medium tabular-nums">{formatBytes(snapshot.reclaimable_bytes)}</span>
              </p>
            </div>
            <Button
              disabled={loadingEstimate || clearCache.isPending}
              id="clear-result-cache"
              onClick={() => void prepareConfirmation()}
              variant="destructive"
            >
              {loadingEstimate ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : (
                <Trash2 aria-hidden="true" />
              )}
              {loadingEstimate ? "Refreshing estimate…" : "Clear cache"}
            </Button>
          </div>
          {cleanupResult ? (
            <p className="mt-4 text-sm text-emerald-700" role="status">
              Cleared {cleanupResult.removed_entries} archives and reclaimed {formatBytes(cleanupResult.removed_bytes)}.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <AlertDialog.Root
        onOpenChange={(open) => {
          if (!open && !clearCache.isPending) setConfirmationOpen(false)
        }}
        open={confirmationOpen}
      >
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-foreground/30 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
          <AlertDialog.Viewport className="fixed inset-0 z-50 grid place-items-center p-4">
            <AlertDialog.Popup
              className="w-full max-w-md rounded-xl border bg-background p-6 text-foreground shadow-2xl outline-none"
              finalFocus={() => document.getElementById("clear-result-cache")}
            >
              <AlertDialog.Title className="font-heading text-xl font-semibold">
                Clear the local result cache?
              </AlertDialog.Title>
              <AlertDialog.Description className="mt-3 text-sm leading-6 text-muted-foreground">
                Up to {snapshot.reclaimable_entries} archives ({formatBytes(snapshot.reclaimable_bytes)}) will be removed. Active staging and downloads are protected. Future downloads rebuild the same results from Modal without rerunning scientific compute.
              </AlertDialog.Description>
              {clearCache.error ? (
                <p className="mt-4 text-sm text-destructive" role="alert">
                  Cache cleanup failed.{clearCache.error instanceof ApiError && clearCache.error.requestId ? ` Support ID: ${clearCache.error.requestId}.` : " Try again."}
                </p>
              ) : null}
              <div className="mt-6 flex justify-end gap-3">
                <AlertDialog.Close render={<Button disabled={clearCache.isPending} variant="outline" />}>
                  Cancel
                </AlertDialog.Close>
                <Button
                  disabled={clearCache.isPending}
                  onClick={() => clearCache.mutate()}
                  variant="destructive"
                >
                  {clearCache.isPending ? (
                    <LoaderCircle aria-hidden="true" className="animate-spin" />
                  ) : (
                    <Trash2 aria-hidden="true" />
                  )}
                  Clear cache
                </Button>
              </div>
            </AlertDialog.Popup>
          </AlertDialog.Viewport>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  )
}
