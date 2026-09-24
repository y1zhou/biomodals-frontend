import { useMutation, useQueryClient } from "@tanstack/react-query"
import { LoaderCircle, Trash2 } from "lucide-react"
import { useEffect, useRef } from "react"
import { useNavigate } from "react-router"
import { ApiError, apiErrorCode, apiRequestId, deleteJob, type Job } from "@/api/client"
import { useExpireSession } from "@/auth-state"
import { Button } from "@/components/ui/button"
import { discardJobQueries, jobKey } from "@/jobs"

export default function DeleteJobAction({ job, disabled }: { job: Job; disabled?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const currentJob = useRef<string | null>(job.job_id)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  useEffect(() => {
    currentJob.current = job.job_id
    return () => { currentJob.current = null }
  }, [job.job_id])
  async function leaveUnavailableJob(jobId: string) {
    await discardJobQueries(queryClient, jobId)
    if (currentJob.current === jobId) {
      dialog.current?.close()
      navigate("/jobs", { replace: true })
    }
  }
  const mutation = useMutation({
    mutationFn: deleteJob,
    retry: false,
    onSuccess: (_response, jobId) => leaveUnavailableJob(jobId),
    async onError(error, jobId) {
      if (error instanceof ApiError && error.status === 404) await leaveUnavailableJob(jobId)
      else if (apiErrorCode(error) === "job_not_deletable") void queryClient.invalidateQueries({ queryKey: jobKey(jobId), exact: true })
    },
  })
  useExpireSession(mutation.error)
  const eligible = ["succeeded", "partial", "failed", "cancelled"].includes(job.state)
  const code = apiErrorCode(mutation.error)
  const message = code === "job_not_deletable" ? "This job is no longer eligible for deletion. Its current status has been requested."
    : mutation.error instanceof ApiError && (mutation.error.status === 401 || code === "csrf_invalid") ? "Sign in again, then explicitly retry deletion."
    : "Deletion could not be confirmed. You can try again; repeated deletion is safe."
  return <>
    {eligible ? <Button variant="destructive" disabled={disabled || mutation.isPending} onClick={() => { mutation.reset(); dialog.current?.showModal() }}><Trash2 aria-hidden="true" />Delete</Button> : null}
    <dialog ref={dialog} aria-labelledby="delete-job-title" aria-describedby="delete-job-description" className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-xl border bg-background p-6 text-foreground shadow-2xl backdrop:bg-foreground/30" onCancel={(event) => { if (mutation.isPending) event.preventDefault() }}>
      <h2 id="delete-job-title" className="text-xl font-semibold">Delete this job?</h2>
      <p className="mt-3 break-words font-medium">{job.display_name}</p>
      <div id="delete-job-description" className="mt-3 space-y-3 leading-7 text-muted-foreground">
        <p>This permanently removes access to this job from BioModals. There is no Trash or Restore.</p>
        <p>Local cached results and retained inputs will be cleaned up in the background. Downloads already in progress may finish.</p>
        <p>Remote results, execution records, logs and billing remain. Existing linked jobs remain usable.</p>
      </div>
      {mutation.error ? <p role="alert" className="mt-4 rounded-lg bg-destructive/10 p-3 text-destructive">{message}{apiRequestId(mutation.error) ? ` Support ID: ${apiRequestId(mutation.error)}.` : ""}</p> : null}
      <div className="mt-6 flex justify-end gap-3">
        <Button autoFocus variant="ghost" disabled={mutation.isPending} onClick={() => dialog.current?.close()}>Keep job</Button>
        <Button variant="destructive" disabled={disabled || mutation.isPending || !eligible} onClick={() => mutation.mutate(job.job_id)}>{mutation.isPending ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : null}{mutation.isPending ? "Deleting…" : "Delete job"}</Button>
      </div>
    </dialog>
  </>
}
