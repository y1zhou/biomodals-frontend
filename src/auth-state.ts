import { useQuery } from "@tanstack/react-query"

import { currentUser } from "@/api/client"

export const currentUserKey = ["auth", "current-user"] as const

export function useCurrentUser() {
  return useQuery({
    queryKey: currentUserKey,
    queryFn: ({ signal }) => currentUser(signal),
  })
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
