import { LoaderCircle } from "lucide-react"

import type { JobState } from "@/api/client"
import { Badge } from "@/components/ui/badge"
import { isActiveJob, jobPresentation } from "@/jobs"
import { cn } from "@/lib/utils"

export default function JobStatusBadge({ state }: { state: JobState }) {
  const presentation = jobPresentation[state]

  return (
    <Badge
      aria-atomic="true"
      aria-live="polite"
      className={cn("border", presentation.className)}
      variant="outline"
    >
      {isActiveJob(state) ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}
      {presentation.label}
    </Badge>
  )
}
