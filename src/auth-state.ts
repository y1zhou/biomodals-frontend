import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query"
import { useEffect } from "react"

import { ApiError, apiErrorCode, currentUser, type Principal } from "@/api/client"

export const currentUserKey = ["auth", "current-user"] as const
export const REAUTHENTICATION_REQUIRED = { reauthenticationRequired: true } as const
export type CurrentUserState = Principal | null | typeof REAUTHENTICATION_REQUIRED

export function installAuthenticatedPrincipal(
  queryClient: QueryClient,
  principal: Principal
) {
  // Keep mounted session observers attached while discarding private data.
  void queryClient.cancelQueries({ queryKey: currentUserKey, exact: true }, { revert: false })
  queryClient.removeQueries({
    predicate: ({ queryKey }) => queryKey.length !== currentUserKey.length || queryKey[0] !== currentUserKey[0] || queryKey[1] !== currentUserKey[1],
  })
  queryClient.setQueryData<CurrentUserState>(currentUserKey, principal)
}

export function useCurrentUser() {
  return useQuery<CurrentUserState>({
    queryKey: currentUserKey,
    queryFn: ({ signal }) => currentUser(signal),
    // Mutations detect expiry. Automatic rechecks could unmount a selected File.
    staleTime: Infinity,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  })
}

export function useExpireSession(error: unknown) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (requiresReauthentication(error)) {
      queryClient.setQueryData<CurrentUserState>(
        currentUserKey,
        REAUTHENTICATION_REQUIRED
      )
    } else if (requiresAdminRefresh(error)) {
      discardCachedAdminAccess(queryClient)
    }
  }, [error, queryClient])
}

export function requiresReauthentication(error: unknown) {
  return error instanceof ApiError && (error.status === 401 || apiErrorCode(error) === "csrf_invalid")
}

export function requiresAdminRefresh(error: unknown) {
  return (
    error instanceof ApiError &&
    error.status === 403 &&
    apiErrorCode(error) === "admin_required"
  )
}

export function discardCachedAdminAccess(queryClient: QueryClient) {
  const current = authenticatedPrincipal(
    queryClient.getQueryData<CurrentUserState>(currentUserKey)
  )
  if (current?.is_admin) {
    queryClient.setQueryData<CurrentUserState>(currentUserKey, {
      ...current,
      is_admin: false,
    } as Principal)
  }
  queryClient.removeQueries({ queryKey: ["admin"] })
  void queryClient.invalidateQueries({ queryKey: currentUserKey })
}

export function isReauthenticationRequired(
  value: unknown
): value is typeof REAUTHENTICATION_REQUIRED {
  return (
    typeof value === "object" &&
    value !== null &&
    "reauthenticationRequired" in value &&
    value.reauthenticationRequired === true
  )
}

export function authenticatedPrincipal(value: CurrentUserState | undefined) {
  return value && !isReauthenticationRequired(value) ? value : null
}

export function passwordSetupLocation(hash: string, pathname: string, search: string) {
  return {
    token: new URLSearchParams(hash.replace(/^#/, "")).get("token") ?? "",
    scrubbedUrl: `${pathname}${search}`,
  }
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
