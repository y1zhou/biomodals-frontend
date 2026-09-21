import { useState, type ReactNode } from "react"
import { AntibodyTransferContext, type AntibodyTransfer } from "@/antibody-transfer"

export default function AntibodyTransferProvider({ children }: { children: ReactNode }) {
  const [transfer, setTransfer] = useState<AntibodyTransfer | null>(null)
  return <AntibodyTransferContext value={{ transfer, setTransfer }}>{children}</AntibodyTransferContext>
}
