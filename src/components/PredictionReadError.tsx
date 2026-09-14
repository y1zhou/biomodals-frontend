import { ApiError, apiErrorCode, apiRequestId } from "@/api/client"
import { canRetryPreview } from "@/alphafold3-preview"
import { Button } from "@/components/ui/button"

export default function PredictionReadError({ error, label, pending, onRetry }: {
  error: unknown
  label: string
  pending: boolean
  onRetry: () => void
}) {
  return <div className="space-y-3 rounded-lg bg-muted p-4" role="alert">
    <p>{label} The job’s download controls remain above.</p>
    {error instanceof ApiError ? <p className="break-words text-sm">{apiErrorCode(error) ?? `HTTP ${error.status}`}: {error.message}{apiRequestId(error) ? ` Support ID: ${apiRequestId(error)}.` : ""}</p> : null}
    {canRetryPreview(error) ? <Button variant="outline" disabled={pending} onClick={onRetry}>{pending ? "Retrying preview…" : "Retry preview"}</Button> : null}
  </div>
}
