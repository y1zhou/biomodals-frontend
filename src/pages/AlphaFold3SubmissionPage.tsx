import { useMutation } from "@tanstack/react-query"
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Braces,
  Download,
  GripVertical,
  LoaderCircle,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react"
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react"
import { Link, useNavigate } from "react-router"

import {
  alphaFold3DocumentUrl,
  ApiError,
  deleteAlphaFold3Validation,
  submitAlphaFold3Job,
  validateAlphaFold3,
  type AlphaFold3Validation,
} from "@/api/client"
import {
  clearAlphaFold3Draft,
  expertAlphaFold3Document,
  formatSequence,
  loadAlphaFold3Draft,
  newAlphaFold3Draft,
  newPolymerEntity,
  parsePolymerSequence,
  regularAlphaFold3Document,
  resizeEntityCopies,
  saveAlphaFold3Draft,
  type AlphaFold3Draft,
  type PolymerEntity,
  type PolymerType,
} from "@/alphafold3"
import { useExpireSession } from "@/auth-state"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { SelectField } from "@/components/ui/select-field"
import { cn } from "@/lib/utils"
import { alphafold3Paths, alphafold3Tool } from "@/tools"

const IDEMPOTENCY_PREFIX = "biomodals:alphafold3:submission:"
const polymerOptions = [
  { label: "Protein", value: "protein" },
  { label: "DNA", value: "dna" },
  { label: "RNA", value: "rna" },
]

function errorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return "The request could not be completed."
}

function previewArray(preview: Record<string, unknown>, key: string) {
  return Array.isArray(preview[key]) ? preview[key] : []
}

function previewNumber(preview: Record<string, unknown>, key: string) {
  return typeof preview[key] === "number" ? preview[key] : 0
}

function EntityEditor({
  entity,
  index,
  isLast,
  onChange,
  onMove,
  onRemove,
}: {
  entity: PolymerEntity
  index: number
  isLast: boolean
  onChange: (entity: PolymerEntity, copies?: number) => void
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
}) {
  const [editing, setEditing] = useState(!entity.sequence)
  const [sequenceError, setSequenceError] = useState("")

  function finishEditing() {
    try {
      const sequence = parsePolymerSequence(entity.sequence)
      onChange({ ...entity, sequence })
      setSequenceError("")
      setEditing(false)
    } catch (error) {
      setSequenceError(errorMessage(error))
    }
  }

  return (
    <div className="rounded-xl border bg-muted/20 p-4">
      <div className="grid items-start gap-3 md:grid-cols-[auto_9rem_7rem_minmax(0,1fr)_auto]">
        <GripVertical aria-hidden="true" className="mt-2 size-4 text-muted-foreground" />
        <div>
          <label className="mb-1 block text-xs text-muted-foreground" htmlFor={`entity-type-${entity.id}`}>Entity type</label>
          <SelectField
            aria-label="Entity type"
            id={`entity-type-${entity.id}`}
            onValueChange={(value) => onChange({ ...entity, type: value as PolymerType })}
            options={polymerOptions}
            value={entity.type}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground" htmlFor={`entity-copies-${entity.id}`}>Copies</label>
          <Input
            id={`entity-copies-${entity.id}`}
            min={1}
            onChange={(event) => onChange(entity, Number(event.target.value))}
            type="number"
            value={entity.copies}
          />
          <p className="mt-1 truncate text-xs text-muted-foreground">{entity.chainIds.join(", ")}</p>
        </div>
        <div className="min-w-0">
          <label className="mb-1 block text-xs text-muted-foreground" htmlFor={`entity-sequence-${entity.id}`}>Sequence or FASTA</label>
          {editing ? (
            <textarea
              aria-invalid={Boolean(sequenceError)}
              className="min-h-24 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              id={`entity-sequence-${entity.id}`}
              onChange={(event) => {
                setSequenceError("")
                onChange({ ...entity, sequence: event.target.value })
              }}
              onBlur={() => entity.sequence && finishEditing()}
              placeholder=">Paste sequence or FASTA"
              value={entity.sequence}
            />
          ) : (
            <button
              className="min-h-24 w-full rounded-lg border bg-background px-3 py-2 text-left font-mono text-sm tracking-[0.18em] break-all transition-colors hover:bg-muted/50"
              onClick={() => setEditing(true)}
              type="button"
            >
              {formatSequence(entity.sequence)}
              <span className="mt-2 block font-sans text-xs tracking-normal text-muted-foreground">{entity.sequence.length.toLocaleString()} residues · click to edit</span>
            </button>
          )}
          {sequenceError ? <p className="mt-1 text-sm text-destructive">{sequenceError}</p> : null}
        </div>
        <div className="flex gap-1 md:mt-5">
          <Button aria-label="Move entity up" disabled={index === 0} onClick={() => onMove(-1)} size="icon-sm" type="button" variant="ghost"><ArrowUp /></Button>
          <Button aria-label="Move entity down" disabled={isLast} onClick={() => onMove(1)} size="icon-sm" type="button" variant="ghost"><ArrowDown /></Button>
          <Button aria-label="Remove entity" onClick={onRemove} size="icon-sm" type="button" variant="ghost"><Trash2 /></Button>
        </div>
      </div>
    </div>
  )
}

function Confirmation({
  onBack,
  onSubmit,
  pending,
  submissionError,
  validation,
}: {
  onBack: () => void
  onSubmit: () => void
  pending: boolean
  submissionError: string
  validation: AlphaFold3Validation
}) {
  const preview = validation.preview as Record<string, unknown>
  const requiresConfirmation = preview.requires_confirmation === true
  const [confirmed, setConfirmed] = useState(false)
  const entities = previewArray(preview, "entities") as Record<string, unknown>[]

  return (
    <main className="mx-auto max-w-4xl px-6 py-10 lg:px-8 lg:py-14">
      <Button className="mb-8" onClick={onBack} variant="ghost"><ArrowLeft />Back to edit</Button>
      <Badge variant="secondary">Review</Badge>
      <h1 className="mt-4 font-heading text-3xl font-semibold">Confirm AlphaFold3 job</h1>
      <p className="mt-3 text-muted-foreground">Review the parsed server input before remote execution begins.</p>
      <Card className="mt-8">
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div><CardTitle>{String(preview.name ?? "AlphaFold3 job")}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{previewNumber(preview, "prediction_count").toLocaleString()} predictions</p></div>
          <a className={buttonVariants({ size: "sm", variant: "outline" })} download href={alphaFold3DocumentUrl(validation.validation_id)}><Download />Download JSON</a>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-muted p-3"><p className="text-xs text-muted-foreground">Seeds</p><p className="mt-1 font-medium">{previewNumber(preview, "seed_count")}</p></div>
            <div className="rounded-lg bg-muted p-3"><p className="text-xs text-muted-foreground">Samples per seed</p><p className="mt-1 font-medium">{previewNumber(preview, "samples")}</p></div>
            <div className="rounded-lg bg-muted p-3"><p className="text-xs text-muted-foreground">Recycles</p><p className="mt-1 font-medium">{previewNumber(preview, "recycle")}</p></div>
          </div>
          <div>
            <h2 className="font-medium">Entities</h2>
            <div className="mt-2 divide-y rounded-lg border">
              {entities.map((entity, index) => (
                <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-3 text-sm" key={`${String(entity.type)}-${index}`}>
                  <span className="capitalize">{String(entity.type)}</span>
                  <span className="text-muted-foreground">{Number(entity.length ?? 0).toLocaleString()} residues</span>
                  <span className="text-muted-foreground">{Number(entity.copies ?? 0)} copies</span>
                </div>
              ))}
            </div>
          </div>
          {requiresConfirmation ? (
            <label className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
              <input checked={confirmed} className="mt-0.5 size-4" onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />
              <span>I understand this large request creates {previewNumber(preview, "prediction_count").toLocaleString()} predictions and may cost substantially more.</span>
            </label>
          ) : null}
          {submissionError ? <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{submissionError}</p> : null}
          <div className="flex justify-end">
            <Button disabled={pending || (requiresConfirmation && !confirmed)} onClick={onSubmit} size="lg">
              {pending ? <LoaderCircle className="animate-spin" /> : null}
              Submit prediction
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}

export default function AlphaFold3SubmissionPage() {
  const navigate = useNavigate()
  const [draft, setDraft] = useState<AlphaFold3Draft>(newAlphaFold3Draft)
  const [draftLoaded, setDraftLoaded] = useState(false)
  const [expertJson, setExpertJson] = useState("")
  const [expertFilename, setExpertFilename] = useState("")
  const [validation, setValidation] = useState<AlphaFold3Validation | null>(null)
  const [formError, setFormError] = useState("")
  const validationController = useRef<AbortController | null>(null)

  useEffect(() => {
    loadAlphaFold3Draft().then((saved) => {
      if (saved) setDraft(saved)
      setDraftLoaded(true)
    }).catch(() => setDraftLoaded(true))
  }, [])
  useEffect(() => {
    if (!draftLoaded) return
    const timeout = window.setTimeout(() => void saveAlphaFold3Draft(draft).catch(() => undefined), 250)
    return () => window.clearTimeout(timeout)
  }, [draft, draftLoaded])

  const validationMutation = useMutation({
    mutationFn: ({ document, signal }: { document: object; signal: AbortSignal }) =>
      validateAlphaFold3(
        new Blob([JSON.stringify(document)], { type: "application/json" }),
        {
          recycle: draft.recycle,
          sample: draft.sample,
          searchMsa: draft.searchMsa,
          searchProteinTemplates: draft.searchProteinTemplates,
        },
        signal
      ),
    onError: (error) => setFormError(errorMessage(error)),
    onSuccess: (result) => {
      validationController.current = null
      setValidation(result)
      setFormError("")
    },
  })
  useExpireSession(validationMutation.error)

  const submissionMutation = useMutation({
    mutationFn: (current: AlphaFold3Validation) => {
      const keyName = `${IDEMPOTENCY_PREFIX}${current.validation_id}`
      let key = window.sessionStorage.getItem(keyName)
      if (!key) {
        key = crypto.randomUUID()
        window.sessionStorage.setItem(keyName, key)
      }
      return submitAlphaFold3Job(current.validation_id, key)
    },
    onSuccess: (job) => {
      window.sessionStorage.removeItem(`${IDEMPOTENCY_PREFIX}${validation?.validation_id}`)
      void clearAlphaFold3Draft().catch(() => undefined)
      navigate(alphafold3Paths.job(job.job_id), { replace: true })
    },
  })
  useExpireSession(submissionMutation.error)

  function updateEntity(index: number, entity: PolymerEntity, copies?: number) {
    setDraft((current) => {
      let nextEntity = entity
      let nextChainIndex = current.nextChainIndex
      if (copies !== undefined) {
        const resized = resizeEntityCopies(entity, copies, nextChainIndex)
        nextEntity = resized.entity
        nextChainIndex = resized.nextChainIndex
      }
      return {
        ...current,
        entities: current.entities.map((value, position) => position === index ? nextEntity : value),
        nextChainIndex,
      }
    })
  }

  function addEntity() {
    setDraft((current) => ({
      ...current,
      entities: [...current.entities, newPolymerEntity("protein", current.nextChainIndex)],
      nextChainIndex: current.nextChainIndex + 1,
    }))
  }

  function moveEntity(index: number, direction: -1 | 1) {
    setDraft((current) => {
      const entities = [...current.entities]
      const target = index + direction
      ;[entities[index], entities[target]] = [entities[target], entities[index]]
      return { ...current, entities }
    })
  }

  function uploadExpertJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size > 256 * 1024 * 1024) {
      setFormError("AlphaFold3 JSON files may not exceed 256 MiB.")
      return
    }
    file.text().then((text) => {
      setExpertJson(text)
      setExpertFilename(file.name)
      setFormError("")
    }).catch(() => setFormError("The JSON file could not be read."))
  }

  function validate(event: FormEvent) {
    event.preventDefault()
    try {
      const document = draft.mode === "regular"
        ? regularAlphaFold3Document(draft)
        : expertAlphaFold3Document(expertJson, draft.jobName)
      const controller = new AbortController()
      validationController.current = controller
      setFormError("")
      validationMutation.mutate({ document, signal: controller.signal })
    } catch (error) {
      setFormError(errorMessage(error))
    }
  }

  async function backToEdit() {
    if (!validation) return
    try {
      await deleteAlphaFold3Validation(validation.validation_id)
      setValidation(null)
      submissionMutation.reset()
    } catch (error) {
      submissionMutation.reset()
      setFormError(errorMessage(error))
    }
  }

  function reset() {
    validationController.current?.abort()
    setDraft(newAlphaFold3Draft())
    setExpertJson("")
    setExpertFilename("")
    setFormError("")
    void clearAlphaFold3Draft().catch(() => undefined)
  }

  if (validation) {
    return (
      <Confirmation
        onBack={() => void backToEdit()}
        onSubmit={() => submissionMutation.mutate(validation)}
        pending={submissionMutation.isPending}
        submissionError={submissionMutation.error ? errorMessage(submissionMutation.error) : ""}
        validation={validation}
      />
    )
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10 lg:px-8 lg:py-14">
      <Link className={cn(buttonVariants({ variant: "ghost" }), "mb-8")} to={alphafold3Paths.overview}><ArrowLeft />AlphaFold3 overview</Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge variant="secondary">{alphafold3Tool.name}</Badge>
          <h1 className="mt-4 font-heading text-3xl font-semibold sm:text-4xl">Configure a prediction</h1>
          <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">Build a polymer input or upload a native AlphaFold3 JSON document, then confirm the parsed request.</p>
        </div>
        <Button onClick={reset} variant="ghost"><RotateCcw />Clear</Button>
      </div>

      <form className="mt-8 space-y-6" noValidate onSubmit={validate}>
        <Card>
          <CardHeader><CardTitle>Job</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div><label className="mb-2 block text-sm font-medium" htmlFor="alphafold3-job-name">Job name</label><Input id="alphafold3-job-name" maxLength={120} onChange={(event) => setDraft({ ...draft, jobName: event.target.value })} placeholder="My structure prediction" value={draft.jobName} /></div>
            <div><span className="mb-2 block text-sm font-medium">Input mode</span><div className="flex rounded-lg bg-muted p-1"><Button onClick={() => setDraft({ ...draft, mode: "regular" })} size="sm" type="button" variant={draft.mode === "regular" ? "default" : "ghost"}>Polymers</Button><Button onClick={() => setDraft({ ...draft, mode: "expert" })} size="sm" type="button" variant={draft.mode === "expert" ? "default" : "ghost"}><Braces />Expert JSON</Button></div></div>
          </CardContent>
        </Card>

        {draft.mode === "regular" ? (
          <Card>
            <CardHeader><CardTitle>Polymers</CardTitle><p className="text-sm text-muted-foreground">Add one protein, DNA, or RNA sequence per entity. Chain IDs are assigned automatically.</p></CardHeader>
            <CardContent className="space-y-4">
              {draft.entities.map((entity, index) => (
                <EntityEditor
                  entity={entity}
                  index={index}
                  isLast={index === draft.entities.length - 1}
                  key={entity.id}
                  onChange={(next, copies) => updateEntity(index, next, copies)}
                  onMove={(direction) => moveEntity(index, direction)}
                  onRemove={() => setDraft({ ...draft, entities: draft.entities.filter((_, position) => position !== index) })}
                />
              ))}
              <Button onClick={addEntity} type="button" variant="outline"><Plus />Add entity</Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader><CardTitle>Native AlphaFold3 JSON</CardTitle><p className="text-sm text-muted-foreground">Use this mode for modifications, covalent bonds, ligands, templates, or embedded MSAs. The job name above replaces the document name.</p></CardHeader>
            <CardContent>
              <input accept=".json,application/json" className="sr-only" id="alphafold3-json" onChange={uploadExpertJson} type="file" />
              <label className={cn(buttonVariants({ variant: "outline" }), "cursor-pointer")} htmlFor="alphafold3-json"><Upload />Upload JSON</label>
              <span className="ml-3 text-sm text-muted-foreground">{expertFilename || "No file selected · maximum 256 MiB"}</span>
            </CardContent>
          </Card>
        )}

        <details className="rounded-xl border bg-card p-6">
          <summary className="cursor-pointer font-heading font-semibold">Advanced prediction settings</summary>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex items-center gap-2 text-sm"><input checked={draft.searchMsa} onChange={(event) => setDraft({ ...draft, searchMsa: event.target.checked })} type="checkbox" />Search MSAs</label>
            <label className="flex items-center gap-2 text-sm"><input checked={draft.searchProteinTemplates} onChange={(event) => setDraft({ ...draft, searchProteinTemplates: event.target.checked })} type="checkbox" />Search protein templates</label>
            <div><label className="mb-1 block text-sm" htmlFor="alphafold3-recycle">Recycles</label><Input id="alphafold3-recycle" min={1} onChange={(event) => setDraft({ ...draft, recycle: Number(event.target.value) })} type="number" value={draft.recycle} /></div>
            <div><label className="mb-1 block text-sm" htmlFor="alphafold3-sample">Samples per seed</label><Input id="alphafold3-sample" min={1} onChange={(event) => setDraft({ ...draft, sample: Number(event.target.value) })} type="number" value={draft.sample} /></div>
            <div className="sm:col-span-2 lg:col-span-4"><label className="mb-1 block text-sm" htmlFor="alphafold3-seeds">Model seeds</label><Input id="alphafold3-seeds" onChange={(event) => setDraft({ ...draft, seeds: event.target.value })} placeholder="1,3-5" value={draft.seeds} /><p className="mt-1 text-xs text-muted-foreground">Comma-separated integers or ranges.</p></div>
          </div>
        </details>

        {formError ? <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{formError}</p> : null}
        <div className="flex justify-end">
          <Button disabled={validationMutation.isPending || (draft.mode === "regular" ? draft.entities.length === 0 : !expertJson)} size="lg" type="submit">
            {validationMutation.isPending ? <LoaderCircle className="animate-spin" /> : null}
            Continue and preview job
          </Button>
        </div>
      </form>
    </main>
  )
}
