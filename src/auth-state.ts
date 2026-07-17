import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"

import { ApiError, currentUser } from "@/api/client"

export const currentUserKey = ["auth", "current-user"] as const

export function useCurrentUser() {
  return useQuery({
    queryKey: currentUserKey,
    queryFn: ({ signal }) => currentUser(signal),
  })
}

export function useExpireSession(error: unknown) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) {
      queryClient.setQueryData(currentUserKey, null)
    }
  }, [error, queryClient])
}

export function safeReturnTo(value: string | null, origin = "http://localhost") {
  if (!value) return "/"

  try {
    const url = new URL(value, origin)
    if (url.origin !== origin || ["/login", "/set-password"].includes(url.pathname)) {
      return "/"
    }
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return "/"
  }
}
