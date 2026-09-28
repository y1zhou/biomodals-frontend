import { useEffect, useRef, useState, type ReactNode } from "react"
import FileDropZone from "@/components/FileDropZone"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const textareaClass = "min-h-40 w-full rounded-lg border border-input bg-background p-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

// UI text stays intact until the service reviews it, including invalid rows.
function InputText({ id, label, accept, help, value, maxBytes, disabled, onChange, onReadingChange }: {
  id: string
  label: string
  accept: string
  help: string
  value: string
  maxBytes: number
  disabled: boolean
  onChange: (value: string) => void
  onReadingChange: (reading: boolean) => void
}) {
  const [fileName, setFileName] = useState("")
  const [error, setError] = useState("")
  const [reading, setReading] = useState(false)
  const readVersion = useRef(0)
  useEffect(() => () => { readVersion.current++ }, [])

  function edit(value: string) {
    readVersion.current++
    setReading(false)
    onReadingChange(false)
    setError("")
    setFileName("")
    onChange(value)
  }

  async function load(file: File | null) {
    if (!file) return
    const version = ++readVersion.current
    setError("")
    setReading(true)
    onReadingChange(true)
    try {
      if (file.size > maxBytes) throw new Error(`File must be at most ${maxBytes.toLocaleString()} bytes.`)
      const text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer())
      if (version !== readVersion.current) return
      onChange(text)
      setFileName(file.name)
    } catch (error) {
      if (version === readVersion.current) setError(`${error instanceof Error ? error.message : "Unable to read file."} Current text was not changed.`)
    } finally {
      if (version === readVersion.current) {
        setReading(false)
        onReadingChange(false)
      }
    }
  }

  return <div className="space-y-3">
    <FileDropZone id={`${id}-file`} label={label} accept={accept} help={help} fileName={fileName} disabled={disabled} onSelect={(file) => void load(file)} />
    {reading ? <p role="status">Reading {label.toLowerCase()}…</p> : null}
    {error ? <p role="alert" className="text-destructive">{error}</p> : null}
    <div className="space-y-2">
      <label className="block font-medium" htmlFor={id}>{label} text</label>
      <textarea id={id} className={textareaClass} value={value} disabled={disabled} onChange={(event) => edit(event.target.value)} spellCheck={false} autoCapitalize="off" aria-describedby={`${id}-help`} />
    </div>
    <p id={`${id}-help`} className="text-muted-foreground">Edit the text to correct or remove invalid records. Selecting a file replaces this text.</p>
  </div>
}

export default function ProteinOptimizationInputs({ measurements, maxMeasurementBytes, disabled = false, onMeasurementsChange, onReadingChange }: {
  measurements: string
  maxMeasurementBytes: number
  disabled?: boolean
  onMeasurementsChange: (text: string) => void
  onReadingChange: (reading: boolean) => void
}) {
  return <Card>
      <CardHeader><CardTitle><h2>1. Experimental measurements</h2></CardTitle></CardHeader>
      <CardContent className="space-y-4 text-base">
        <p className="text-muted-foreground">Upload CSV with <code>mutations,label</code> columns and an optional <code>id</code>. Supply already-normalized labels on a consistent numerical scale; you are responsible for correcting plate or batch effects before uploading.</p>
        <p className="text-muted-foreground">For example, normalize each plate with <code>log10(mutant KD) - log10(parent KD)</code> and select “Lower label is better”.</p>
        <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-sm">{'id,mutations,label\nvariant_1,A:Y52F,-0.3\nvariant_2,"A:Y52F,B:S30A",-0.6'}</pre>
        <p className="text-muted-foreground">Mutations use a case-sensitive chain ID and one-based position. Quote comma-separated mutations in one cell. Repeated variants are experimental replicates. If your data genuinely includes an unchanged-parent observation, its mutation cell may be empty.</p>
        <InputText id="optimization-measurements" label="Measurements CSV" accept=".csv,text/csv" help="Upload measured substitutions and already-normalized labels." value={measurements} maxBytes={maxMeasurementBytes} disabled={disabled} onChange={onMeasurementsChange} onReadingChange={onReadingChange} />
      </CardContent>
    </Card>
}

export function ProteinOptimizationParents({ parentalFasta, requiredChains, maxFastaBytes, disabled = false, discoveryAction, onParentalFastaChange, onReadingChange }: {
  parentalFasta: string
  // Undefined means chain discovery is pending; an empty list is a valid result.
  requiredChains: readonly string[] | undefined
  maxFastaBytes: number
  disabled?: boolean
  discoveryAction?: ReactNode
  onParentalFastaChange: (text: string) => void
  onReadingChange: (reading: boolean) => void
}) {
  return <section aria-labelledby="optimization-parents-heading" className="space-y-4 rounded-lg border p-4">
        <h3 id="optimization-parents-heading" className="text-xl font-medium">Parental chains</h3>
        <p role="status" className="text-muted-foreground">{requiredChains === undefined ? "Review the measurements to discover required chain IDs before adding parental sequences." : requiredChains.length ? <>Required chain IDs: {requiredChains.map((chain, index) => <span key={chain}>{index ? ", " : ""}<code>{chain}</code></span>)}.</> : "No mutated chains were found. Supply explicitly named parental chains to define the optimization parent."}</p>
        <p className="text-muted-foreground">Exploration requires full parental sequences to validate mutations and score complete variants. Use one FASTA record per chain, with its exact chain ID as the header. Include every referenced chain; unchanged partners are optional. Sequences are not trimmed, imputed, or assigned antibody roles.</p>
        {discoveryAction}
        <InputText id="optimization-parents" label="Parental FASTA" accept=".fasta,.fa,.faa,text/plain" help="Each header must match a chain ID, for example >A. Sequence coordinates refer to these full inputs." value={parentalFasta} maxBytes={maxFastaBytes} disabled={disabled || requiredChains === undefined} onChange={onParentalFastaChange} onReadingChange={onReadingChange} />
  </section>
}

export function ProteinOptimizationMode({ exploration, disabled = false, onChange }: {
  exploration: boolean
  disabled?: boolean
  onChange: (exploration: boolean) => void
}) {
  return <fieldset disabled={disabled} className="space-y-3">
    <legend className="mb-3 text-xl font-medium">Optimization mode</legend>
    <label className="flex items-start gap-3 rounded-lg border p-4">
      <input className="mt-1" type="radio" name="optimization-mode" checked={!exploration} onChange={() => onChange(false)} />
      <span><span className="font-medium">Combination</span><span className="mt-1 block text-muted-foreground">Table-only additive ridge at observed mutated sites; no parental sequences are needed. All compatible novel combinations of measured substitutions within your mutation limit are scored; oversized requests are rejected rather than sampled. Results contain mutations and predicted labels, not reconstructed sequences. Additive predictions do not estimate interactions between mutations.</span></span>
    </label>
    <label className="flex items-start gap-3 rounded-lg border p-4">
      <input className="mt-1" type="radio" name="optimization-mode" checked={exploration} onChange={() => onChange(true)} />
      <span><span className="font-medium">Exploration</span><span className="mt-1 block text-muted-foreground">Propose previously unmeasured substitutions and score complete variants using ESMC600M sequence features and TabPFN. An oversized design space is reproducibly sampled within the evaluation budget.</span></span>
    </label>
    <p className="text-muted-foreground">Switching modes keeps your measurements and parental sequences. Neither prediction is experimental confirmation.</p>
  </fieldset>
}
