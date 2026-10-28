import { useQuery } from "@tanstack/react-query"

import { serviceCapabilities } from "@/api/client"

export const capabilitiesKey = ["service-capabilities"] as const

export function useCapabilities() {
  const query = useQuery({
    queryKey: capabilitiesKey,
    queryFn: ({ signal }) => serviceCapabilities(signal),
    staleTime: Infinity,
    refetchOnWindowFocus: "always",
    retry: false,
  })
  return {
    ...query,
    remoteExecutionEnabled: query.isSuccess && query.data.remote_execution_enabled,
  }
}
