import { Check, Copy } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { copyText } from "@/lib/clipboard"

// Generic full-chain display: no antibody numbering, germlines, or trimming.
export default function ProteinSequenceValue({ sequence, chainId }: { sequence: string; chainId: string }) {
  const [status, setStatus] = useState("")
  useEffect(() => {
    if (status !== "Copied") return
    const timer = window.setTimeout(() => setStatus(""), 2000)
    return () => window.clearTimeout(timer)
  }, [status])
  return <details className="min-w-48 max-w-xl">
    <summary className="max-w-64 cursor-pointer truncate font-mono text-sm" aria-label={`Show full sequence for chain ${chainId}`}>{sequence}</summary>
    <div className="mt-2 space-y-2">
      <p className="text-muted-foreground">Chain {chainId} · {sequence.length.toLocaleString()} residues · full chain</p>
      <p className="break-all font-mono text-sm select-text">{sequence}</p>
      <Button type="button" variant="outline" aria-label={`Copy sequence for chain ${chainId}`} disabled={status === "Copied"} onClick={() => void copyText(sequence).then(() => setStatus("Copied"), () => setStatus("Copy failed; select the sequence text to copy it."))}>
        {status === "Copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />} {status === "Copied" ? "Copied" : "Copy sequence"}
      </Button>
      <span role={status === "Copied" ? "status" : "alert"}>{status}</span>
    </div>
  </details>
}
