import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import type { Model } from "molstar/lib/mol-model/structure"
import { alphaFold3Model, alphaFold3Prediction, type AlphaFold3Prediction } from "@/api/client"
import { authenticatedPrincipal, useCurrentUser, useExpireSession } from "@/auth-state"
import { findAlphaFold3Residue } from "@/alphafold3-structure"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import AlphaFold3Structure from "@/components/AlphaFold3Structure"
import AlphaFold3Pae from "@/components/AlphaFold3Pae"
import PredictionReadError from "@/components/PredictionReadError"

export default function AlphaFold3Results({ jobId }: { jobId: string }) {
  const ownerId = authenticatedPrincipal(useCurrentUser().data)?.user_id
  const query = useQuery({ queryKey: ["alphafold3-prediction", ownerId, jobId], queryFn: ({ signal }) => alphaFold3Prediction(jobId, signal), enabled: !!ownerId, staleTime: Infinity, gcTime: 0, retry: false })
  useExpireSession(query.error)
  return <Card className="mt-6"><CardHeader><CardTitle>Highest-ranked prediction</CardTitle><p className="text-muted-foreground">The highest-ranked seed and sample within this job. Ranking score combines confidence, disorder and clash terms; it is not a confidence percentage.</p></CardHeader><CardContent>
    {query.isPending ? <p role="status">Loading prediction…</p> : query.error ? <PredictionReadError error={query.error} label="The prediction preview is unavailable." pending={query.isFetching} onRetry={() => { void query.refetch() }} /> : query.data && ownerId ? <Prediction key={`${ownerId}:${jobId}:${query.data.prediction_id}`} jobId={jobId} ownerId={ownerId} prediction={query.data} /> : null}
  </CardContent></Card>
}

function Prediction({ jobId, ownerId, prediction }: { jobId: string; ownerId: string; prediction: AlphaFold3Prediction }) {
  const [model, setModel] = useState<Model | null>(null)
  const cif = useQuery({ queryKey: ["alphafold3-cif", ownerId, jobId, prediction.prediction_id], queryFn: ({ signal }) => alphaFold3Model(jobId, signal), staleTime: Infinity, gcTime: 0, retry: false })
  useExpireSession(cif.error)
  return <div className="space-y-6">
    <dl className="flex flex-wrap gap-x-8 gap-y-3">{[["Seed", prediction.seed], ["Sample (zero-based)", prediction.sample_index], ["Predictions ranked", prediction.prediction_count], ["Ranking score", prediction.ranking_score.toFixed(3)], ["pTM", prediction.ptm?.toFixed(3) ?? "Unavailable"], ["ipTM", prediction.iptm?.toFixed(3) ?? "Unavailable"], ["Clash", prediction.has_clash === null ? "Unavailable" : prediction.has_clash ? "Yes" : "No"]].map(([label, value]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>)}</dl>
    {prediction.summary_error ? <p role="status">Some confidence summary metrics are unavailable.</p> : null}
    {cif.isPending ? <p role="status">Loading prediction coordinates…</p> : cif.error ? <PredictionReadError error={cif.error} label="The structure preview is unavailable. PAE can still be used." pending={cif.isFetching} onRetry={() => { void cif.refetch() }} /> : cif.data ? <AlphaFold3Structure cif={cif.data} onModelReady={setModel} /> : null}
    <AlphaFold3Pae jobId={jobId} ownerId={ownerId} prediction={prediction} residue={(chain, index) => model ? findAlphaFold3Residue(model, chain, index) : undefined} />
  </div>
}
