import { useMutation } from "@tanstack/react-query"
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronRight,
  Download,
  LoaderCircle,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react"
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type SetStateAction,
} from "react"
import { Link, useNavigate } from "react-router"

import {
  alphaFold3DocumentUrl,
  ApiError,
  deleteAlphaFold3Validation,
  inspectAlphaFold3Validation,
  submitAlphaFold3Job,
  validateAlphaFold3,
  type AlphaFold3Validation,
} from "@/api/client"
import {
  clearAlphaFold3Draft,
  expandEntityRecords,
  expertAlphaFold3Document,
  expertAlphaFold3ModelSeeds,
  formatSequence,
  loadAlphaFold3Draft,
  MAX_ENTITY_COPIES,
  newAlphaFold3Draft,
  newAlphaFold3Entity,
  parsePolymerRecords,
  reindexEntities,
  regularAlphaFold3Document,
  resizeEntityCopies,
  saveAlphaFold3Draft,
  type AlphaFold3Draft,
  type AlphaFold3Entity,
  type EntityType,
  type LigandFormat,
  type PolymerRecord,
} from "@/alphafold3"
import { useExpireSession } from "@/auth-state"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import FileDropZone from "@/components/FileDropZone"
import { Input } from "@/components/ui/input"
import { SelectField } from "@/components/ui/select-field"
import { cn } from "@/lib/utils"
import { alphafold3Paths, alphafold3Tool } from "@/tools"

const IDEMPOTENCY_PREFIX = "biomodals:alphafold3:submission:"
const VALIDATION_KEY = "biomodals:alphafold3:validation"
const entityOptions = [
  { label: "Protein", value: "protein" },
  { label: "DNA", value: "dna" },
  { label: "RNA", value: "rna" },
  { label: "Ligand", value: "ligand" },
]
const ligandFormatOptions = [
  { label: "CCD codes", value: "ccd" },
  { label: "SMILES", value: "smiles" },
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
  onExpand,
  onMove,
  onRemove,
}: {
  entity: AlphaFold3Entity
  index: number
  isLast: boolean
  onChange: (entity: AlphaFold3Entity, copies?: number) => void
  onExpand: (records: PolymerRecord[]) => void
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
}) {
  const [editing, setEditing] = useState(!entity.sequence)
  const [sequenceError, setSequenceError] = useState("")

  function finishEditing() {
    try {
      const records = parsePolymerRecords(entity.sequence)
      onExpand(records)
      setSequenceError("")
      setEditing(false)
    } catch (error) {
      setSequenceError(errorMessage(error))
    }
  }

  return (
    <div className="rounded-xl border bg-muted/20 p-4">
      <div className="grid items-start gap-3 md:grid-cols-[auto_9rem_7rem_minmax(0,1fr)_auto]">
        <ChevronRight aria-hidden="true" className="mt-7 size-4 text-muted-foreground" />
        <div>
          <label className="mb-1 block text-xs text-muted-foreground" htmlFor={`entity-type-${entity.id}`}>Entity type</label>
          <SelectField
            aria-label="Entity type"
            id={`entity-type-${entity.id}`}
            onValueChange={(value) => {
              const type = value as EntityType
              onChange({
                ...entity,
                description: type === "ligand" || entity.type === "ligand" ? "" : entity.description,
                sequence: type === "ligand" || entity.type === "ligand" ? "" : entity.sequence,
                type,
              })
              setEditing(true)
              setSequenceError("")
            }}
            options={entityOptions}
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
          <label className="mb-1 block text-xs text-muted-foreground" htmlFor={`entity-sequence-${entity.id}`}>
            {entity.type === "ligand" ? "Ligand definition" : "Sequence or FASTA records"}
          </label>
          {entity.type === "ligand" ? (
            <div className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)]">
              <SelectField
                aria-label="Ligand format"
                onValueChange={(value) => onChange({ ...entity, ligandFormat: value as LigandFormat })}
                options={ligandFormatOptions}
                value={entity.ligandFormat}
              />
              <Input
                id={`entity-sequence-${entity.id}`}
                onChange={(event) => onChange({ ...entity, sequence: event.target.value })}
                placeholder={entity.ligandFormat === "ccd" ? "ATP, MG" : "CC(=O)O"}
                value={entity.sequence}
              />
            </div>
          ) : editing ? (
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
              <span className="flex flex-wrap gap-x-[0.9em] gap-y-5 pt-3 leading-5">
                {formatSequence(entity.sequence).split(" ").map((group, groupIndex) => (
                  <span className="relative" key={`${groupIndex}-${group}`}>
                    <span className="absolute -top-3 right-0 min-w-[4ch] whitespace-nowrap text-right font-sans text-[0.65rem] leading-none tracking-normal text-muted-foreground">
                      {groupIndex * 10 + group.length}
                    </span>
                    {group}
                  </span>
                ))}
              </span>
              <span className="mt-3 block font-sans text-xs tracking-normal text-muted-foreground">{entity.sequence.length.toLocaleString()} residues · click to edit</span>
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
  onClear,
  onSubmit,
  pending,
  submissionError,
  validation,
}: {
  onBack: () => void
  onClear: () => void
  onSubmit: () => void
  pending: boolean
  submissionError: string
  validation: AlphaFold3Validation
}) {
  const preview = validation.preview as Record<string, unknown>
  const requiresConfirmation = preview.requires_confirmation === true
  const [confirmed, setConfirmed] = useState(false)
  const entities = previewArray(preview, "entities") as Record<string, unknown>[]
  const seeds = previewArray(preview, "seeds")
  const warnings = previewArray(preview, "warnings")
  const advancedCounts = typeof preview.advanced_counts === "object" && preview.advanced_counts !== null
    ? preview.advanced_counts as Record<string, unknown>
    : {}

  return (
    <main className="mx-auto max-w-4xl px-6 py-10 lg:px-8 lg:py-14">
      <div className="mb-8 flex justify-between gap-4">
        <Button disabled={pending} onClick={onBack} variant="ghost"><ArrowLeft />Back to edit</Button>
        <Button disabled={pending} onClick={onClear} variant="ghost"><RotateCcw />Clear</Button>
      </div>
      <Badge variant="secondary">Review</Badge>
      <div className="mt-4 flex items-center justify-between gap-4">
        <h1 className="font-heading text-3xl font-semibold">Confirm AlphaFold3 job</h1>
        <a className={buttonVariants({ size: "sm", variant: "outline" })} download href={alphaFold3DocumentUrl(validation.validation_id)}><Download />Download JSON</a>
      </div>
      <p className="mt-3 text-muted-foreground">Review the parsed server input before remote execution begins.</p>
      <Card className="mt-8">
        <CardHeader><CardTitle>{String(preview.name ?? "AlphaFold3 job")}</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-28 rounded-lg bg-muted p-3"><p className="text-xs text-muted-foreground">Seeds</p><p className="mt-1 font-medium">{previewNumber(preview, "seed_count")}</p></div>
            <span className="text-muted-foreground">×</span>
            <div className="w-36 rounded-lg bg-muted p-3"><p className="text-xs text-muted-foreground">Samples per seed</p><p className="mt-1 font-medium">{previewNumber(preview, "samples")}</p></div>
            <span className="text-muted-foreground">=</span>
            <p className="text-sm text-muted-foreground"><strong className="font-semibold text-foreground">{previewNumber(preview, "prediction_count").toLocaleString()}</strong> predicted structures</p>
          </div>
          <dl className="divide-y rounded-lg border text-sm">
            <div className="grid gap-2 px-4 py-3 sm:grid-cols-[12rem_1fr]"><dt className="text-muted-foreground">Model seeds</dt><dd className="break-all">{seeds.join(", ")}</dd></div>
            <div className="grid gap-2 px-4 py-3 sm:grid-cols-[12rem_1fr]"><dt className="text-muted-foreground">MSA search</dt><dd>{preview.search_msa === true ? "Enabled for proteins and RNA" : "Disabled"}</dd></div>
            <div className="grid gap-2 px-4 py-3 sm:grid-cols-[12rem_1fr]"><dt className="text-muted-foreground">Protein template search</dt><dd>{preview.search_protein_templates === true ? "Enabled" : "Disabled"}</dd></div>
            <div className="grid gap-2 px-4 py-3 sm:grid-cols-[12rem_1fr]"><dt className="text-muted-foreground">Number of recycles</dt><dd>{previewNumber(preview, "recycle")}</dd></div>
          </dl>
          <div>
            <h2 className="font-medium">Entities</h2>
            <div className="mt-2 divide-y rounded-lg border">
              {entities.map((entity, index) => (
                <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-3 text-sm" key={`${String(entity.type)}-${index}`}>
                  <span><span className="capitalize">{String(entity.type)}</span><span className="ml-2 text-muted-foreground">{previewArray(entity, "ids").join(", ")}</span></span>
                  <span className="text-muted-foreground">
                    {entity.type === "ligand"
                      ? "Small molecule"
                      : `${Number(entity.length ?? 0).toLocaleString()} residues`}
                  </span>
                  <span className="text-muted-foreground">{Number(entity.copies ?? 0)} copies</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h2 className="font-medium">Expert input summary</h2>
            <div className="mt-2 grid grid-cols-6 gap-2 text-sm">
              {[["Modifications", "modifications"], ["Bonds", "bonds"]].map(([label, key]) => (
                <div className="col-span-3 rounded-lg bg-muted p-3" key={key}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-medium">{Number(advancedCounts[key] ?? 0).toLocaleString()}</p></div>
              ))}
              {[["Custom MSAs", "custom_msas"], ["Custom templates", "custom_templates"], ["Custom CCD definitions", "custom_ccd"]].map(([label, key]) => (
                <div className="col-span-2 rounded-lg bg-muted p-3" key={key}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-medium">{Number(advancedCounts[key] ?? 0).toLocaleString()}</p></div>
              ))}
            </div>
          </div>
          {warnings.length > 0 ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
              <p className="font-medium">Validation warnings</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">{warnings.map((warning) => <li key={String(warning)}>{String(warning)}</li>)}</ul>
            </div>
          ) : null}
          {requiresConfirmation ? (
            <label className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
              <input checked={confirmed} className="mt-0.5 size-4" onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />
              <span>I understand this large request creates {previewNumber(preview, "prediction_count").toLocaleString()} predictions and may cost substantially more.</span>
            </label>
          ) : null}
          {submissionError ? <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{submissionError}</p> : null}
          <div className="flex flex-wrap items-center justify-end gap-3">
            {pending ? (
              <p aria-live="polite" className="text-sm text-muted-foreground" role="status">
                Preparing and queuing your job…
              </p>
            ) : null}
            <Button disabled={pending || (requiresConfirmation && !confirmed)} onClick={onSubmit} size="lg">
              {pending ? <LoaderCircle className="animate-spin" /> : null}
              {pending ? "Submitting job…" : "Submit prediction"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}

export default function AlphaFold3SubmissionPage() {
  const navigate = useNavigate()
  const [draft, setDraftState] = useState<AlphaFold3Draft>(newAlphaFold3Draft)
  const [draftLoaded, setDraftLoaded] = useState(false)
  const [validation, setValidation] = useState<AlphaFold3Validation | null>(null)
  const [formError, setFormError] = useState("")
  const validationController = useRef<AbortController | null>(null)
  const draftChanged = useRef(false)
  const expertFileSelection = useRef(0)

  function setDraft(update: SetStateAction<AlphaFold3Draft>) {
    draftChanged.current = true
    setDraftState(update)
  }

  useEffect(() => {
    loadAlphaFold3Draft().then((saved) => {
      if (saved && !draftChanged.current) {
        setDraftState({ ...saved, entities: reindexEntities(saved.entities) })
      }
      setDraftLoaded(true)
    }).catch(() => setDraftLoaded(true))
  }, [])
  useEffect(() => {
    const validationId = window.sessionStorage.getItem(VALIDATION_KEY)
    if (!validationId) return
    const controller = new AbortController()
    inspectAlphaFold3Validation(validationId, controller.signal).then(setValidation).catch((error) => {
      if (controller.signal.aborted) return
      window.sessionStorage.removeItem(VALIDATION_KEY)
      setFormError(errorMessage(error))
    })
    return () => controller.abort()
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
      window.sessionStorage.setItem(VALIDATION_KEY, result.validation_id)
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
      window.sessionStorage.removeItem(VALIDATION_KEY)
      void clearAlphaFold3Draft().catch(() => undefined)
      navigate(alphafold3Paths.job(job.job_id), { replace: true })
    },
  })
  useExpireSession(submissionMutation.error)

  function updateEntity(index: number, entity: AlphaFold3Entity, copies?: number) {
    if (copies !== undefined && (!Number.isInteger(copies) || copies < 1 || copies > MAX_ENTITY_COPIES)) {
      setFormError(`Copies must be an integer from 1 through ${MAX_ENTITY_COPIES.toLocaleString()}.`)
      return
    }
    setFormError("")
    setDraft((current) => {
      const nextEntity = copies === undefined
        ? entity
        : resizeEntityCopies(entity, copies)
      return {
        ...current,
        entities: reindexEntities(
          current.entities.map((value, position) => position === index ? nextEntity : value)
        ),
      }
    })
  }

  function addEntity() {
    setDraft((current) => ({
      ...current,
      entities: reindexEntities([
        ...current.entities,
        newAlphaFold3Entity("protein"),
      ]),
    }))
  }

  function expandEntity(index: number, records: PolymerRecord[]) {
    setDraft((current) => ({
      ...current,
      entities: expandEntityRecords(current.entities, index, records),
    }))
  }

  function moveEntity(index: number, direction: -1 | 1) {
    setDraft((current) => {
      const entities = [...current.entities]
      const target = index + direction
      ;[entities[index], entities[target]] = [entities[target], entities[index]]
      return { ...current, entities: reindexEntities(entities) }
    })
  }

  function removeEntity(index: number) {
    setDraft((current) => ({
      ...current,
      entities: reindexEntities(
        current.entities.filter((_, position) => position !== index)
      ),
    }))
  }

  function chooseExpertJson(file: File | null) {
    if (!file) return
    const selection = ++expertFileSelection.current
    if (file.size > 256 * 1024 * 1024) {
      setFormError("AlphaFold3 JSON files may not exceed 256 MiB.")
      return
    }
    file.text().then((text) => {
      if (selection !== expertFileSelection.current) return
      try {
        const seeds = expertAlphaFold3ModelSeeds(text)
        setDraft((current) => ({
          ...current,
          expertFilename: file.name,
          expertJson: text,
          seeds,
        }))
        setFormError("")
      } catch (error) {
        setFormError(errorMessage(error))
      }
    }).catch(() => {
      if (selection === expertFileSelection.current) {
        setFormError("The JSON file could not be read.")
      }
    })
  }

  function validate(event: FormEvent) {
    event.preventDefault()
    try {
      const document = draft.mode === "regular"
        ? regularAlphaFold3Document(draft)
        : expertAlphaFold3Document(draft.expertJson, draft.jobName, draft.seeds)
      const controller = new AbortController()
      validationController.current = controller
      setFormError("")
      validationMutation.mutate({ document, signal: controller.signal })
    } catch (error) {
      setFormError(errorMessage(error))
    }
  }

  async function discardValidation(clear: boolean) {
    if (!validation) return
    try {
      await deleteAlphaFold3Validation(validation.validation_id)
      window.sessionStorage.removeItem(`${IDEMPOTENCY_PREFIX}${validation.validation_id}`)
      window.sessionStorage.removeItem(VALIDATION_KEY)
      setValidation(null)
      submissionMutation.reset()
      if (clear) reset()
    } catch (error) {
      submissionMutation.reset()
      setFormError(errorMessage(error))
    }
  }

  function reset() {
    validationController.current?.abort()
    expertFileSelection.current += 1
    window.sessionStorage.removeItem(VALIDATION_KEY)
    setDraft(newAlphaFold3Draft())
    setFormError("")
    void clearAlphaFold3Draft().catch(() => undefined)
  }

  if (validation) {
    return (
      <Confirmation
        onBack={() => void discardValidation(false)}
        onClear={() => void discardValidation(true)}
        onSubmit={() => submissionMutation.mutate(validation)}
        pending={submissionMutation.isPending}
        submissionError={submissionMutation.error ? errorMessage(submissionMutation.error) : formError}
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
          <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">Build polymer and ligand entities or upload a native AlphaFold3 JSON document, then confirm the parsed request.</p>
        </div>
        <Button onClick={reset} variant="ghost"><RotateCcw />Clear</Button>
      </div>

      <form className="mt-8 space-y-6" noValidate onSubmit={validate}>
        <Card>
          <CardHeader><CardTitle>Job</CardTitle></CardHeader>
          <CardContent className="grid items-end gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div><label className="mb-2 block text-sm font-medium" htmlFor="alphafold3-job-name">Job name</label><Input id="alphafold3-job-name" maxLength={120} onChange={(event) => setDraft({ ...draft, jobName: event.target.value })} placeholder="My structure prediction" value={draft.jobName} /></div>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm font-medium">
              <span>Expert mode</span>
              <input
                checked={draft.mode === "expert"}
                className="peer sr-only"
                onChange={(event) => setDraft({ ...draft, mode: event.target.checked ? "expert" : "regular" })}
                role="switch"
                type="checkbox"
              />
              <span className="relative h-6 w-11 rounded-full bg-muted-foreground/35 transition-colors duration-200 peer-checked:bg-foreground peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 after:absolute after:left-1 after:top-1 after:size-4 after:rounded-full after:bg-background after:transition-transform after:duration-200 peer-checked:after:translate-x-5" />
            </label>
          </CardContent>
        </Card>

        {draft.mode === "regular" ? (
          <Card>
            <CardHeader><CardTitle>Entities</CardTitle><p className="text-sm text-muted-foreground">Add protein, DNA, RNA, or ligand entities. Multi-record FASTA input expands into separate entities, and chain IDs follow the visible order.</p></CardHeader>
            <CardContent className="space-y-4">
              {draft.entities.map((entity, index) => (
                <EntityEditor
                  entity={entity}
                  index={index}
                  isLast={index === draft.entities.length - 1}
                  key={entity.id}
                  onChange={(next, copies) => updateEntity(index, next, copies)}
                  onExpand={(records) => expandEntity(index, records)}
                  onMove={(direction) => moveEntity(index, direction)}
                  onRemove={() => removeEntity(index)}
                />
              ))}
              <Button onClick={addEntity} type="button" variant="outline"><Plus />Add entity</Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader><CardTitle>Native AlphaFold3 JSON</CardTitle><p className="text-sm text-muted-foreground">Use this mode for modifications, covalent bonds, custom CCD definitions, templates, or embedded MSAs. The job name above replaces the document name.</p></CardHeader>
            <CardContent>
              <FileDropZone
                accept=".json,application/json"
                disabled={validationMutation.isPending}
                fileName={draft.expertFilename}
                help="You can also drag and drop a JSON file here · maximum 256 MiB."
                id="alphafold3-json"
                label="AlphaFold3 JSON file"
                onSelect={chooseExpertJson}
              />
            </CardContent>
          </Card>
        )}

        <details className="rounded-xl border bg-card p-6">
          <summary className="cursor-pointer font-heading font-semibold">Advanced prediction settings</summary>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex items-center gap-2 text-sm"><input checked={draft.searchMsa} onChange={(event) => setDraft({ ...draft, searchMsa: event.target.checked, searchProteinTemplates: event.target.checked ? draft.searchProteinTemplates : false })} type="checkbox" />Search MSAs</label>
            <label className="flex items-center gap-2 text-sm"><input checked={draft.searchProteinTemplates} disabled={!draft.searchMsa} onChange={(event) => setDraft({ ...draft, searchProteinTemplates: event.target.checked })} type="checkbox" />Search protein templates</label>
            <div><label className="mb-1 block text-sm" htmlFor="alphafold3-recycle">Recycles</label><Input id="alphafold3-recycle" min={0} onChange={(event) => setDraft({ ...draft, recycle: Number(event.target.value) })} type="number" value={draft.recycle} /></div>
            <div><label className="mb-1 block text-sm" htmlFor="alphafold3-sample">Samples per seed</label><Input id="alphafold3-sample" min={1} onChange={(event) => setDraft({ ...draft, sample: Number(event.target.value) })} type="number" value={draft.sample} /></div>
            <div className="sm:col-span-2 lg:col-span-4"><label className="mb-1 block text-sm" htmlFor="alphafold3-seeds">Model seeds</label><Input id="alphafold3-seeds" onChange={(event) => setDraft({ ...draft, seeds: event.target.value })} placeholder="1,2,4,8 or 1-10,42,1024" value={draft.seeds} /><p className="mt-1 text-xs text-muted-foreground">Comma-separated integers or ranges, e.g., &quot;1,2,4,8&quot; or &quot;1-10,42,1024&quot;.</p></div>
          </div>
        </details>

        {formError ? <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{formError}</p> : null}
        <div className="flex justify-end">
          <Button disabled={validationMutation.isPending || (draft.mode === "regular" ? draft.entities.length === 0 : !draft.expertJson)} size="lg" type="submit">
            {validationMutation.isPending ? <LoaderCircle className="animate-spin" /> : null}
            Continue and preview job
          </Button>
        </div>
      </form>
    </main>
  )
}
