import { useMutation } from "@tanstack/react-query"
import {
  AlertTriangle,
  ArrowLeft,
  CloudUpload,
  RefreshCw,
  X,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react"
import { Link, useBeforeUnload, useBlocker, useNavigate } from "react-router"

import {
  ApiError,
  apiErrorCode,
  submitGromacsJob,
  type GromacsSubmission,
} from "@/api/client"
import { useExpireSession } from "@/auth-state"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import FileDropZone from "@/components/FileDropZone"
import { Input } from "@/components/ui/input"
import {
  WEB_UPLOAD_LIMIT_LABEL,
  apiFieldErrors,
  forgetPendingIdempotencyKey,
  normalizedDisplayName,
  pdbFileError,
  readPendingIdempotencyKey,
  rememberPendingIdempotencyKey,
  shouldRotateIdempotencyKey,
  simulationTimeError,
  submissionErrorMessage,
  type SubmissionField,
} from "@/gromacs"
import { cn } from "@/lib/utils"
import { gromacsPaths, gromacsTool } from "@/tools"

function filenameDisplayName(filename: string) {
  return filename.replace(/\.pdb$/i, "")
}

function formatBytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MiB`
}

const fieldIds: Record<SubmissionField, string> = {
  pdb: "pdb-file",
  display_name: "display-name",
  simulation_time_ns: "simulation-time",
  run_pdbfixer: "run-pdbfixer",
  cpu_only: "cpu-only",
}

function focusFirstFieldError(errors: Partial<Record<SubmissionField, string>>) {
  const firstField = Object.keys(errors)[0] as SubmissionField | undefined
  if (firstField) requestAnimationFrame(() => document.getElementById(fieldIds[firstField])?.focus())
}

export default function GromacsSubmissionPage() {
  const navigate = useNavigate()
  const abortController = useRef<AbortController | null>(null)
  const allowNavigation = useRef(false)
  const leavingSubmission = useRef(false)
  const formAlert = useRef<HTMLDivElement>(null)
  const [initialIdempotencyKey] = useState(() =>
    readPendingIdempotencyKey(window.sessionStorage)
  )
  const idempotencyKey = useRef<string | null>(initialIdempotencyKey)
  const restoredIntent = useRef(initialIdempotencyKey !== null)
  const [pdb, setPdb] = useState<File | null>(null)
  const [displayName, setDisplayName] = useState("")
  const [simulationTime, setSimulationTime] = useState("5")
  const [runPdbfixer, setRunPdbfixer] = useState(false)
  const [cpuOnly, setCpuOnly] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<SubmissionField, string>>
  >({})

  const mutation = useMutation({
    mutationFn: ({ input, signal }: { input: GromacsSubmission; signal: AbortSignal }) =>
      submitGromacsJob(input, signal, setProgress),
    retry: false,
    onSuccess(job) {
      allowNavigation.current = true
      abortController.current = null
      idempotencyKey.current = null
      forgetPendingIdempotencyKey(window.sessionStorage)
      if (!leavingSubmission.current) {
        navigate(gromacsPaths.job(job.job_id), { replace: true })
      }
    },
    onError(error) {
      abortController.current = null
      const errors = apiFieldErrors(error)
      setFieldErrors(errors)
      focusFirstFieldError(errors)
      if (shouldRotateIdempotencyKey(error)) {
        idempotencyKey.current = null
        restoredIntent.current = false
        forgetPendingIdempotencyKey(window.sessionStorage)
      }
    },
  })
  useExpireSession(mutation.error)
  const isSubmissionPending = mutation.isPending
  const inputUploaded = progress === 100
  const shouldBlockNavigation = useCallback(
    () => isSubmissionPending && !allowNavigation.current,
    [isSubmissionPending]
  )
  const blocker = useBlocker(shouldBlockNavigation)
  useBeforeUnload(
    useCallback(
      (event: BeforeUnloadEvent) => {
        if (!isSubmissionPending || allowNavigation.current) return
        event.preventDefault()
        event.returnValue = true
      },
      [isSubmissionPending]
    )
  )

  useEffect(() => {
    if (blocker.state !== "blocked") return
    const leave = window.confirm(
      "The server may already have created this job even if you leave now. Leave and check My Jobs?"
    )
    if (leave) {
      allowNavigation.current = true
      leavingSubmission.current = true
      abortController.current?.abort()
      blocker.proceed()
    } else {
      blocker.reset()
    }
  }, [blocker])

  function resetIntent() {
    if (!restoredIntent.current) {
      idempotencyKey.current = null
      forgetPendingIdempotencyKey(window.sessionStorage)
    }
    setFieldErrors({})
    if (!mutation.isPending) mutation.reset()
  }

  function chooseFile(file: File | null) {
    resetIntent()
    setPdb(file)
    if (file) setDisplayName(filenameDisplayName(file.name).slice(0, 120))
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (abortController.current) return

    const nextErrors: Partial<Record<SubmissionField, string>> = {}
    const pdbError = pdbFileError(pdb)
    const timeError = simulationTimeError(simulationTime)
    if (pdbError) nextErrors.pdb = pdbError
    if (timeError) nextErrors.simulation_time_ns = timeError
    if (displayName.length > 120) nextErrors.display_name = "Use no more than 120 characters."
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length || !pdb) {
      focusFirstFieldError(nextErrors)
      return
    }

    const controller = new AbortController()
    const key = idempotencyKey.current ?? crypto.randomUUID()
    allowNavigation.current = false
    idempotencyKey.current = key
    rememberPendingIdempotencyKey(window.sessionStorage, key)
    abortController.current = controller
    setProgress(0)
    mutation.mutate({
      signal: controller.signal,
      input: {
        cpuOnly,
        displayName: normalizedDisplayName(displayName),
        idempotencyKey: key,
        pdb,
        runPdbfixer,
        simulationTimeNs: Number(simulationTime),
      },
    })
  }

  function cancelUpload() {
    abortController.current?.abort()
    setProgress(null)
  }

  const error = mutation.error
  const wasCancelled = error instanceof DOMException && error.name === "AbortError"
  const apiError = error instanceof ApiError ? error : null
  const errorCode = apiErrorCode(error)
  const formError = submissionErrorMessage(error, Object.keys(fieldErrors).length > 0)
  const canRetry =
    apiError?.status === 0 ||
    errorCode === "compute_unavailable" ||
    errorCode === "active_job_limit_reached" ||
    errorCode === "idempotency_conflict"
  const shouldCheckJobs =
    wasCancelled || apiError?.status === 0 || errorCode === "active_job_limit_reached"
  const simulationNumber = Number(simulationTime)

  useEffect(() => {
    if (formError) formAlert.current?.focus()
  }, [formError])

  return (
    <>
      <main className="mx-auto max-w-6xl px-6 py-10 lg:px-8 lg:py-14">
        <Link className={cn(buttonVariants({ variant: "ghost" }), "mb-8")} to={gromacsPaths.overview}>
          <ArrowLeft aria-hidden="true" data-icon="inline-start" />
          GROMACS overview
        </Link>

        <div className="mb-10">
          <Badge variant="secondary">{gromacsTool.name}</Badge>
          <h1 className="mt-4 font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
            Start a simulation
          </h1>
          <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
            Choose a PDB structure and configure one durable remote job. You can leave after BioModals confirms it is queued.
          </p>
        </div>

        <form className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]" noValidate onSubmit={submit}>
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Structure</CardTitle>
                <p className="text-sm leading-6 text-muted-foreground">
                  Choose one .pdb file. The web uploader supports up to {WEB_UPLOAD_LIMIT_LABEL}.
                </p>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <span className="text-sm font-medium" id="pdb-file-label">
                    PDB file
                  </span>
                  <FileDropZone
                    accept=".pdb"
                    describedBy={fieldErrors.pdb ? "pdb-error" : "pdb-help"}
                    disabled={isSubmissionPending}
                    fileName={pdb?.name}
                    help="You can also drag and drop a PDB file here."
                    id="pdb-file"
                    invalid={Boolean(fieldErrors.pdb)}
                    label="PDB file"
                    onSelect={chooseFile}
                    required
                  />
                  {fieldErrors.pdb ? (
                    <p className="text-sm text-destructive" id="pdb-error">
                      {fieldErrors.pdb}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground" id="pdb-help">
                      Your input is uploaded only when you submit.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="display-name">
                    Display name <span className="font-normal text-muted-foreground">(optional)</span>
                  </label>
                  <Input
                    aria-describedby={fieldErrors.display_name ? "display-name-error" : undefined}
                    aria-invalid={Boolean(fieldErrors.display_name)}
                    disabled={isSubmissionPending}
                    id="display-name"
                    maxLength={120}
                    onChange={(event) => {
                      if (normalizedDisplayName(event.target.value) !== normalizedDisplayName(displayName)) {
                        resetIntent()
                      }
                      setDisplayName(event.target.value)
                    }}
                    placeholder="Generated from the PDB filename"
                    value={displayName}
                  />
                  {fieldErrors.display_name ? (
                    <p className="text-sm text-destructive" id="display-name-error">
                      {fieldErrors.display_name}
                    </p>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Simulation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="max-w-xs space-y-2">
                  <label className="text-sm font-medium" htmlFor="simulation-time">
                    Simulation time (ns)
                  </label>
                  <Input
                    aria-describedby={fieldErrors.simulation_time_ns ? "simulation-time-error" : "simulation-time-help"}
                    aria-invalid={Boolean(fieldErrors.simulation_time_ns)}
                    disabled={isSubmissionPending}
                    id="simulation-time"
                    inputMode="numeric"
                    max={200}
                    min={1}
                    onChange={(event) => {
                      if (Number(event.target.value) !== Number(simulationTime)) resetIntent()
                      setSimulationTime(event.target.value)
                    }}
                    required
                    step={1}
                    type="number"
                    value={simulationTime}
                  />
                  {fieldErrors.simulation_time_ns ? (
                    <p className="text-sm text-destructive" id="simulation-time-error">
                      {fieldErrors.simulation_time_ns}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground" id="simulation-time-help">
                      Enter a whole number from 1 to 200. Default: 5 ns.
                    </p>
                  )}
                </div>

                {Number.isFinite(simulationNumber) && simulationNumber > 100 ? (
                  <div className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                    <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                    Longer simulations may remain queued or running substantially longer.
                  </div>
                ) : null}

                <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-4">
                  <input
                    checked={runPdbfixer}
                    className="mt-1 size-4 accent-foreground"
                    disabled={isSubmissionPending}
                    id="run-pdbfixer"
                    onChange={(event) => {
                      resetIntent()
                      setRunPdbfixer(event.target.checked)
                    }}
                    type="checkbox"
                  />
                  <span>
                    <span className="block text-sm font-medium">Repair common issues with PDBFixer</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      Attempt to prepare incomplete or inconsistent structures before simulation.
                    </span>
                  </span>
                </label>

                <details className="rounded-lg border px-4 py-3">
                  <summary className="cursor-pointer text-sm font-medium">Advanced</summary>
                  <label className="mt-4 flex cursor-pointer items-start gap-3">
                    <input
                      checked={cpuOnly}
                      className="mt-1 size-4 accent-foreground"
                      disabled={isSubmissionPending}
                      id="cpu-only"
                      onChange={(event) => {
                        resetIntent()
                        setCpuOnly(event.target.checked)
                      }}
                      type="checkbox"
                    />
                    <span>
                      <span className="block text-sm font-medium">CPU-only execution</span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                        Run without GPU acceleration when compatibility requires it.
                      </span>
                    </span>
                  </label>
                </details>
              </CardContent>
            </Card>
          </div>

          <Card className="lg:sticky lg:top-24">
            <CardHeader>
              <CardTitle>Submission summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">PDB input</dt>
                  <dd className="mt-1 break-all font-medium">{pdb?.name ?? "Not selected"}</dd>
                  {pdb ? <dd className="text-xs text-muted-foreground">{formatBytes(pdb.size)}</dd> : null}
                </div>
                <div>
                  <dt className="text-muted-foreground">Display name</dt>
                  <dd className="mt-1 font-medium">{normalizedDisplayName(displayName) ?? "Generated by server"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Simulation</dt>
                  <dd className="mt-1 font-medium">{simulationTime || "—"} ns</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Preparation</dt>
                  <dd className="mt-1 font-medium">{runPdbfixer ? "PDBFixer enabled" : "Original structure"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Compute</dt>
                  <dd className="mt-1 font-medium">{cpuOnly ? "CPU only" : "Default acceleration"}</dd>
                </div>
              </dl>

              {isSubmissionPending ? (
                <div aria-live="polite" className="space-y-2 rounded-lg bg-muted p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">
                      {inputUploaded
                        ? "Preparing and queuing job"
                        : "Uploading input"}
                    </span>
                    <span>
                      {inputUploaded
                        ? "Input uploaded"
                        : progress === null
                          ? "…"
                          : `${progress}%`}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-background">
                    <div
                      className={cn("h-full rounded-full bg-primary transition-[width]", progress === null && "w-1/3 animate-pulse")}
                      style={progress === null ? undefined : { width: `${progress}%` }}
                    />
                  </div>
                  <Button className="w-full" onClick={cancelUpload} type="button" variant="outline">
                    <X aria-hidden="true" />
                    Cancel upload
                  </Button>
                </div>
              ) : (
                <Button className="w-full" disabled={!pdb} size="lg" type="submit">
                  {canRetry ? (
                    <RefreshCw aria-hidden="true" />
                  ) : (
                    <CloudUpload aria-hidden="true" />
                  )}
                  {canRetry ? "Try again" : "Submit simulation"}
                </Button>
              )}

              {formError ? (
                <div
                  className={cn("rounded-lg px-3 py-2 text-sm", wasCancelled ? "bg-muted text-foreground" : "bg-destructive/10 text-destructive")}
                  ref={formAlert}
                  role="alert"
                  tabIndex={-1}
                >
                  <div className="flex gap-2">
                    <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                    <span>{formError}</span>
                  </div>
                  {shouldCheckJobs ? (
                    <Link className="mt-2 inline-block font-medium underline underline-offset-4" to="/jobs">
                      Check My Jobs
                    </Link>
                  ) : null}
                </div>
              ) : null}

            </CardContent>
          </Card>
        </form>
      </main>
    </>
  )
}
