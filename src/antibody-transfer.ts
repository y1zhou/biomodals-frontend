import { createContext, useContext, type Dispatch, type SetStateAction } from "react"
import type { SelectedEntry } from "@/antibody-selection"

export interface AntibodyTransfer {
  sourceJobId: string
  entries: readonly SelectedEntry[]
  singleDomain?: boolean
}

export const AntibodyTransferContext = createContext<{
  transfer: AntibodyTransfer | null
  setTransfer: Dispatch<SetStateAction<AntibodyTransfer | null>>
} | null>(null)

export function useAntibodyTransfer() {
  const value = useContext(AntibodyTransferContext)
  if (!value) throw new Error("Antibody transfer requires an authenticated page")
  return value
}
