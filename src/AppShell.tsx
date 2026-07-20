import { Menu } from "@base-ui/react/menu"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  BriefcaseBusiness,
  FlaskConical,
  LogOut,
  ShieldCheck,
  UserRound,
  Wrench,
} from "lucide-react"
import { Link, Outlet, ScrollRestoration, useNavigate } from "react-router"

import {
  ApiError,
  SERVICE_CONFIGURATION_ERROR_MESSAGE,
  apiErrorCode,
  apiRequestId,
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
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function Brand() {
  return (
    <Link className="inline-flex items-center gap-2 font-heading font-semibold" to="/">
      <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
        <FlaskConical aria-hidden="true" className="size-4" />
      </span>
      <span className="hidden sm:inline">BioModals</span>
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
      <ScrollRestoration />
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:sticky supports-[backdrop-filter]:top-0 supports-[backdrop-filter]:z-40">
        <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between gap-4 px-6 lg:px-8">
          <Brand />
          <nav aria-label="Primary" className="flex items-center gap-1">
            <Link
              aria-label="Tools"
              className={buttonVariants({ variant: "ghost" })}
              title="Tools"
              to="/"
            >
              <Wrench aria-hidden="true" data-icon="inline-start" />
              <span className="hidden sm:inline">Tools</span>
            </Link>
            {currentUser ? (
              <>
                <Link
                  aria-label="My Jobs"
                  className={buttonVariants({ variant: "ghost" })}
                  title="My Jobs"
                  to="/jobs"
                >
                  <BriefcaseBusiness aria-hidden="true" data-icon="inline-start" />
                  <span className="hidden sm:inline">My Jobs</span>
                </Link>
                <Menu.Root>
                  <Menu.Trigger className="ml-1 flex size-9 cursor-pointer items-center justify-center rounded-full border bg-muted text-sm font-medium outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50">
                    <span className="sr-only">Open user menu</span>
                    {currentUser.display_name.slice(0, 1).toLocaleUpperCase() || (
                      <UserRound aria-hidden="true" className="size-4" />
                    )}
                  </Menu.Trigger>
                  <Menu.Portal>
                    <Menu.Positioner align="end" className="z-50" sideOffset={8}>
                      <Menu.Popup className="w-64 rounded-xl border bg-popover p-2 text-popover-foreground shadow-lg outline-none data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
                        <div className="px-2 py-2">
                          <p className="truncate text-sm font-medium">{currentUser.display_name}</p>
                          <p className="truncate text-xs text-muted-foreground">{currentUser.email}</p>
                        </div>
                        <Menu.Separator className="my-1 h-px bg-border" />
                        {currentUser.is_admin ? (
                          <Menu.Item
                            className="flex h-8 cursor-default items-center gap-2 rounded-lg px-2 text-sm outline-none data-[highlighted]:bg-muted"
                            render={<Link to="/admin/users" />}
                          >
                            <ShieldCheck aria-hidden="true" className="size-4" />
                            Admin
                          </Menu.Item>
                        ) : null}
                        <Menu.Item
                          className="flex h-8 cursor-default items-center gap-2 rounded-lg px-2 text-sm outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-muted"
                          disabled={logoutMutation.isPending}
                          onClick={() => logoutMutation.mutate()}
                        >
                          <LogOut aria-hidden="true" className="size-4" />
                          Sign out
                        </Menu.Item>
                        {logoutMutation.isError ? (
                          <p aria-live="polite" className="px-2 py-1 text-xs text-destructive">
                            {isServiceConfigurationError(logoutMutation.error)
                              ? SERVICE_CONFIGURATION_ERROR_MESSAGE
                              : `Sign out failed. Try again.${
                                  apiRequestId(logoutMutation.error)
                                    ? ` Support ID: ${apiRequestId(logoutMutation.error)}.`
                                    : ""
                                }`}
                          </p>
                        ) : null}
                      </Menu.Popup>
                    </Menu.Positioner>
                  </Menu.Portal>
                </Menu.Root>
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
