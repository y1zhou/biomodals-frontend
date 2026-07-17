import { useMutation, useQueryClient } from "@tanstack/react-query"
import { BriefcaseBusiness, FlaskConical, LogOut, UserRound } from "lucide-react"
import { Link, Outlet, useNavigate } from "react-router"

import {
  ApiError,
  SERVICE_CONFIGURATION_ERROR_MESSAGE,
  apiErrorCode,
  isServiceConfigurationError,
  logout,
  MissingCsrfError,
} from "@/api/client"
import { ReauthenticationDialog } from "@/auth"
import {
  authenticatedPrincipal,
  currentUserKey,
  isReauthenticationRequired,
  useCurrentUser,
  useExpireSession,
  type CurrentUserState,
} from "@/auth-state"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function Brand() {
  return (
    <Link className="inline-flex items-center gap-2 font-heading font-semibold" to="/">
      <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
        <FlaskConical aria-hidden="true" className="size-4" />
      </span>
      BioModals
    </Link>
  )
}

export default function AppShell() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useCurrentUser()

  function finishLogout() {
    queryClient.clear()
    queryClient.setQueryData(currentUserKey, null)
    navigate("/", { replace: true })
  }

  const logoutMutation = useMutation({
    mutationFn: logout,
    retry: false,
    onSuccess: finishLogout,
    onError(error) {
      if (
        error instanceof ApiError &&
        !(error instanceof MissingCsrfError) &&
        error.status === 401
      ) {
        finishLogout()
      }
    },
  })
  const logoutReauthenticationError =
    logoutMutation.error instanceof MissingCsrfError ||
    apiErrorCode(logoutMutation.error) === "csrf_invalid"
      ? logoutMutation.error
      : null
  useExpireSession(logoutReauthenticationError)
  const reauthenticationRequired = isReauthenticationRequired(user.data)
  const currentUser = authenticatedPrincipal(user.data)

  return (
    <div className="min-h-svh">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:sticky supports-[backdrop-filter]:top-0 supports-[backdrop-filter]:z-40">
        <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between gap-4 px-6 lg:px-8">
          <Brand />
          <nav aria-label="Primary" className="flex items-center gap-1">
            <Link className={buttonVariants({ variant: "ghost" })} to="/">
              Tools
            </Link>
            {currentUser ? (
              <>
                <Link className={buttonVariants({ variant: "ghost" })} to="/jobs">
                  <BriefcaseBusiness aria-hidden="true" data-icon="inline-start" />
                  My Jobs
                </Link>
                <details className="group relative ml-1">
                  <summary className="flex size-9 cursor-pointer list-none items-center justify-center rounded-full border bg-muted text-sm font-medium outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                    <span className="sr-only">Open User menu</span>
                    {currentUser.display_name.slice(0, 1).toLocaleUpperCase() || (
                      <UserRound aria-hidden="true" className="size-4" />
                    )}
                  </summary>
                  <div className="absolute right-0 z-50 mt-2 w-64 rounded-xl border bg-popover p-2 text-popover-foreground shadow-lg">
                    <div className="px-2 py-2">
                      <p className="truncate text-sm font-medium">{currentUser.display_name}</p>
                      <p className="truncate text-xs text-muted-foreground">{currentUser.email}</p>
                    </div>
                    <div className="my-1 border-t" />
                    <Button
                      className="w-full justify-start"
                      disabled={logoutMutation.isPending}
                      onClick={() => logoutMutation.mutate()}
                      variant="ghost"
                    >
                      <LogOut aria-hidden="true" />
                      Sign out
                    </Button>
                    {logoutMutation.isError ? (
                      <p aria-live="polite" className="px-2 py-1 text-xs text-destructive">
                        {isServiceConfigurationError(logoutMutation.error)
                          ? SERVICE_CONFIGURATION_ERROR_MESSAGE
                          : "Sign out failed. Try again."}
                      </p>
                    ) : null}
                  </div>
                </details>
              </>
            ) : user.isPending ? (
              <span className="ml-2 h-8 w-20 animate-pulse rounded-lg bg-muted" />
            ) : (
              <Link className={cn(buttonVariants(), "ml-2")} to="/login">
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </header>
      <Outlet />
      <ReauthenticationDialog
        description="Your session is no longer usable. This page will stay in place while you sign in again; retry your action afterward."
        onCancel={() => {
          queryClient.setQueryData<CurrentUserState>(currentUserKey, null)
        }}
        onSuccess={() => {
          logoutMutation.reset()
        }}
        open={reauthenticationRequired}
      />
    </div>
  )
}
