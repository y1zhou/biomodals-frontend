import { AlertDialog } from "@base-ui/react/alert-dialog"
import { Dialog } from "@base-ui/react/dialog"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertTriangle,
  Check,
  Copy,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
} from "lucide-react"
import { useEffect, useRef, useState, type FormEvent } from "react"

import { adminUsersKey, nonnegativeInteger, upsertAdminUser } from "@/admin"
import {
  ApiError,
  apiErrorCode,
  apiRequestId,
  createAdminPasswordLink,
  createAdminUser,
  listAdminUsers,
  updateAdminUser,
  type AdminUser,
  type PasswordLink,
  type UpdateAdminUserInput,
} from "@/api/client"
import {
  authenticatedPrincipal,
  currentUserKey,
  useExpireSession,
  type CurrentUserState,
} from "@/auth-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { formatTimestamp } from "@/jobs"
import { copyText } from "@/lib/clipboard"

const expectedAdminErrorCodes = new Set([
  "last_active_admin",
  "origin_not_allowed",
  "user_already_exists",
  "user_inactive",
  "user_invalid",
])

function errorMessage(error: unknown) {
  if (!(error instanceof ApiError)) return "The administrator request failed. Try again."
  const support =
    !expectedAdminErrorCodes.has(apiErrorCode(error) ?? "") && error.requestId
      ? ` Support ID: ${error.requestId}.`
      : ""
  return `${error.message}${support}`
}

type PasswordLinkDialogState = PasswordLink & {
  displayName: string
  email: string
  triggerId: string
}

function PasswordLinkDialog({
  link,
  onClose,
}: {
  link: PasswordLinkDialogState | null
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  useEffect(() => setCopied(false), [link])

  return (
    <Dialog.Root
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      open={Boolean(link)}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-foreground/30 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Viewport className="fixed inset-0 z-50 grid place-items-center p-4">
          <Dialog.Popup
            className="w-full max-w-lg rounded-xl border bg-background p-6 text-foreground shadow-2xl outline-none data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0"
            finalFocus={() =>
              link?.triggerId
                ? document.getElementById(link.triggerId)
                : null
            }
          >
            <Dialog.Title className="font-heading text-xl font-semibold">
              One-time password link
            </Dialog.Title>
            {link ? (
              <>
                <Dialog.Description className="mt-2 text-sm leading-6 text-muted-foreground">
                  Give this link for {link.displayName} ({link.email}) through a trusted channel. Closing this dialog clears it from this page.
                </Dialog.Description>
                <label className="mt-5 block text-sm font-medium" htmlFor="password-link-value">
                  Password link
                </label>
                <div className="mt-1.5 flex">
                  <Input
                    className="rounded-r-none font-mono text-xs"
                    id="password-link-value"
                    readOnly
                    value={link.password_link}
                  />
                  <Button
                    aria-live="polite"
                    className="rounded-l-none border-l-0"
                    onClick={() => {
                      void copyText(link.password_link)
                        .then(() => {
                          setCopied(true)
                          window.setTimeout(() => setCopied(false), 2_000)
                        })
                        .catch(() => setCopied(false))
                    }}
                    type="button"
                    variant="outline"
                  >
                    {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  Expires {formatTimestamp(link.expires_at)}. Valid for approximately one hour.
                </p>
              </>
            ) : null}
            <div className="mt-6 flex justify-end">
              <Dialog.Close render={<Button variant="outline" />}>Close</Dialog.Close>
            </div>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function useUserUpdate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      userId,
      input,
    }: {
      userId: string
      input: UpdateAdminUserInput
    }) => updateAdminUser(userId, input),
    scope: { id: "admin-user-mutations" },
    onSuccess(user) {
      queryClient.setQueryData<AdminUser[]>(adminUsersKey, (users) =>
        upsertAdminUser(users, user)
      )
      const current = authenticatedPrincipal(
        queryClient.getQueryData<CurrentUserState>(currentUserKey)
      )
      if (current?.user_id === user.user_id) {
        if (user.status !== "enabled") {
          queryClient.clear()
          queryClient.setQueryData(currentUserKey, null)
        } else {
          queryClient.setQueryData(currentUserKey, {
            ...current,
            is_admin: user.is_admin,
          })
        }
      }
      void queryClient.invalidateQueries({ queryKey: adminUsersKey })
    },
  })
}

type ConfirmedAction = "disable" | "remove-admin" | "password-link"

function UserRow({
  beginPasswordLinkRequest,
  endPasswordLinkRequest,
  onPasswordLink,
  passwordLinkLocked,
  user,
}: {
  beginPasswordLinkRequest: () => boolean
  endPasswordLinkRequest: () => void
  onPasswordLink: (user: AdminUser, result: PasswordLink, triggerId: string) => void
  passwordLinkLocked: boolean
  user: AdminUser
}) {
  const update = useUserUpdate()
  const reset = usePasswordReset()
  const [activeJobLimit, setActiveJobLimit] = useState(String(user.active_job_limit))
  const [confirmedAction, setConfirmedAction] = useState<ConfirmedAction | null>(null)
  useEffect(() => setActiveJobLimit(String(user.active_job_limit)), [user.active_job_limit])
  const triggerId = confirmedAction
    ? `${confirmedAction}-${user.user_id}`
    : undefined
  const updateBusy = update.isPending
  const resetBusy = reset.isPending
  const busy = updateBusy || resetBusy
  const rowError = update.error ?? reset.error
  const parsedActiveJobLimit = nonnegativeInteger(activeJobLimit)
  useExpireSession(update.error)
  useExpireSession(reset.error)

  async function confirmAction() {
    if (confirmedAction === "disable") {
      await update.mutateAsync({
        userId: user.user_id,
        input: { status: "disabled" },
      })
    } else if (confirmedAction === "remove-admin") {
      await update.mutateAsync({
        userId: user.user_id,
        input: { is_admin: false },
      })
    } else if (confirmedAction === "password-link") {
      if (!beginPasswordLinkRequest()) return
      try {
        const result = await reset.mutateAsync(user)
        reset.reset()
        onPasswordLink(user, result, `password-link-${user.user_id}`)
      } catch (error) {
        endPasswordLinkRequest()
        throw error
      }
    }
    setConfirmedAction(null)
  }

  const confirmation = confirmedAction === "disable"
    ? {
        title: `Disable ${user.display_name}?`,
        description: "This user will not be able to sign in, submit jobs, or access results. Already admitted jobs continue running and are not cancelled.",
        action: "Disable user",
      }
    : confirmedAction === "remove-admin"
      ? {
          title: `Remove administrator role from ${user.display_name}?`,
          description: "This user will immediately lose access to user, Modal, and storage administration.",
          action: "Remove admin",
        }
      : {
          title: `Issue a new password link for ${user.display_name}?`,
          description: "Every earlier password link for this user will become invalid. Their current password remains usable until the new link is consumed.",
          action: "Issue new link",
        }

  return (
    <>
      <tr className="border-b last:border-0">
        <td className="px-4 py-4 align-top">
          <p className="font-medium">{user.display_name}</p>
          <p className="mt-1 text-xs text-muted-foreground">{user.email}</p>
        </td>
        <td className="px-4 py-4 align-top">
          <Badge variant={user.status === "enabled" ? "secondary" : "outline"}>
            {user.status === "pending_setup"
              ? "Pending setup"
              : user.status === "enabled"
                ? "Enabled"
                : "Disabled"}
          </Badge>
        </td>
        <td className="px-4 py-4 align-top">
          <Badge variant={user.is_admin ? "default" : "outline"}>
            {user.is_admin ? "Admin" : "User"}
          </Badge>
        </td>
        <td className="px-4 py-4 align-top">
          <div className="flex min-w-36 items-center gap-2">
            <Input
              aria-label={`Active job limit for ${user.display_name}`}
              className="w-20"
              disabled={busy}
              min={0}
              onChange={(event) => setActiveJobLimit(event.target.value)}
              type="number"
              value={activeJobLimit}
            />
            <Button
              aria-label={`Save active job limit for ${user.display_name}`}
              disabled={
                busy ||
                parsedActiveJobLimit === null ||
                parsedActiveJobLimit === user.active_job_limit
              }
              onClick={() => {
                if (parsedActiveJobLimit === null) return
                update.mutate({
                  userId: user.user_id,
                  input: { active_job_limit: parsedActiveJobLimit },
                })
              }}
              size="icon-sm"
              variant="outline"
            >
              {updateBusy ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : (
                <Save aria-hidden="true" />
              )}
            </Button>
          </div>
        </td>
        <td className="px-4 py-4 align-top">
          <div className="flex min-w-56 flex-wrap gap-2">
            <Button
              disabled={busy}
              id={`remove-admin-${user.user_id}`}
              onClick={() => {
                if (user.is_admin) setConfirmedAction("remove-admin")
                else update.mutate({ userId: user.user_id, input: { is_admin: true } })
              }}
              size="sm"
              variant={user.is_admin ? "destructive" : "outline"}
            >
              {user.is_admin ? "Remove admin" : "Make admin"}
            </Button>
            <Button
              disabled={busy}
              id={`disable-${user.user_id}`}
              onClick={() => {
                if (user.status === "disabled") {
                  update.mutate({
                    userId: user.user_id,
                    input: { status: "enabled" },
                  })
                } else {
                  setConfirmedAction("disable")
                }
              }}
              size="sm"
              variant={user.status === "disabled" ? "outline" : "destructive"}
            >
              {user.status === "disabled" ? "Enable" : "Disable"}
            </Button>
            <Button
              disabled={user.status === "disabled" || busy || passwordLinkLocked}
              id={`password-link-${user.user_id}`}
              onClick={() => setConfirmedAction("password-link")}
              size="sm"
              variant="outline"
            >
              New password link
            </Button>
          </div>
          {rowError ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-destructive" role="alert">
              <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
              {errorMessage(rowError)}
            </p>
          ) : null}
        </td>
      </tr>

      <AlertDialog.Root
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmedAction(null)
        }}
        open={confirmedAction !== null}
      >
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-foreground/30 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
          <AlertDialog.Viewport className="fixed inset-0 z-50 grid place-items-center p-4">
            <AlertDialog.Popup
              className="w-full max-w-md rounded-xl border bg-background p-6 text-foreground shadow-2xl outline-none data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0"
              finalFocus={() =>
                triggerId ? document.getElementById(triggerId) : null
              }
            >
              <AlertDialog.Title className="font-heading text-xl font-semibold">
                {confirmation.title}
              </AlertDialog.Title>
              <AlertDialog.Description className="mt-3 text-sm leading-6 text-muted-foreground">
                {confirmation.description}
              </AlertDialog.Description>
              {rowError ? (
                <p className="mt-4 text-sm text-destructive" role="alert">
                  {errorMessage(rowError)}
                </p>
              ) : null}
              <div className="mt-6 flex justify-end gap-3">
                <AlertDialog.Close render={<Button disabled={busy} variant="outline" />}>
                  Cancel
                </AlertDialog.Close>
                <Button
                  disabled={busy}
                  onClick={() => void confirmAction().catch(() => undefined)}
                  variant="destructive"
                >
                  {busy ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}
                  {confirmation.action}
                </Button>
              </div>
            </AlertDialog.Popup>
          </AlertDialog.Viewport>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  )
}

function usePasswordReset() {
  return useMutation({
    mutationFn: (user: AdminUser) => createAdminPasswordLink(user.user_id),
    gcTime: 0,
    scope: { id: "admin-user-mutations" },
  })
}

export default function UsersAdminPage() {
  const queryClient = useQueryClient()
  const users = useQuery({
    queryKey: adminUsersKey,
    queryFn: ({ signal }) => listAdminUsers(signal),
  })
  const [email, setEmail] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [isAdmin, setIsAdmin] = useState(false)
  const [activeJobLimit, setActiveJobLimit] = useState("")
  const [passwordLink, setPasswordLink] = useState<PasswordLinkDialogState | null>(null)
  const [passwordLinkLocked, setPasswordLinkLocked] = useState(false)
  const passwordLinkLock = useRef(false)

  function beginPasswordLinkRequest() {
    if (passwordLinkLock.current) return false
    passwordLinkLock.current = true
    setPasswordLinkLocked(true)
    return true
  }

  function endPasswordLinkRequest() {
    passwordLinkLock.current = false
    setPasswordLinkLocked(false)
  }

  const create = useMutation({
    mutationFn: createAdminUser,
    gcTime: 0,
    scope: { id: "admin-user-mutations" },
    onSuccess(result) {
      queryClient.setQueryData<AdminUser[]>(adminUsersKey, (users) =>
        upsertAdminUser(users, result.user)
      )
      setPasswordLink({
        displayName: result.user.display_name,
        email: result.user.email,
        password_link: result.password_link,
        expires_at: result.expires_at,
        triggerId: "create-user-button",
      })
      setEmail("")
      setDisplayName("")
      setIsAdmin(false)
      setActiveJobLimit("")
      void queryClient.invalidateQueries({ queryKey: adminUsersKey })
      create.reset()
    },
    onError: endPasswordLinkRequest,
  })
  useExpireSession(users.error)
  useExpireSession(create.error)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsedLimit = activeJobLimit.trim()
      ? nonnegativeInteger(activeJobLimit)
      : null
    if (activeJobLimit.trim() && parsedLimit === null) return
    if (!beginPasswordLinkRequest()) return
    create.mutate({
      email: email.trim(),
      display_name: displayName.trim(),
      is_admin: isAdmin,
      ...(parsedLimit !== null ? { active_job_limit: parsedLimit } : {}),
    })
  }

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Create user</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2 lg:grid-cols-4" onSubmit={submit}>
            <label className="grid gap-1.5 text-sm font-medium">
              Email
              <Input
                autoComplete="off"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Display name
              <Input
                onChange={(event) => setDisplayName(event.target.value)}
                required
                value={displayName}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Active job limit (optional)
              <Input
                min={0}
                onChange={(event) => setActiveJobLimit(event.target.value)}
                placeholder="Service default"
                type="number"
                value={activeJobLimit}
              />
            </label>
            <div className="flex items-end justify-between gap-4">
              <label className="flex h-8 items-center gap-2 text-sm">
                <input
                  checked={isAdmin}
                  className="size-4 accent-primary"
                  onChange={(event) => setIsAdmin(event.target.checked)}
                  type="checkbox"
                />
                Administrator
              </label>
              <Button
                disabled={
                  create.isPending ||
                  passwordLinkLocked ||
                  (activeJobLimit !== "" &&
                    nonnegativeInteger(activeJobLimit) === null)
                }
                id="create-user-button"
                type="submit"
              >
                {create.isPending ? (
                  <LoaderCircle aria-hidden="true" className="animate-spin" />
                ) : (
                  <Plus aria-hidden="true" />
                )}
                Create
              </Button>
            </div>
          </form>
          {create.error ? (
            <p className="mt-4 flex items-center gap-2 text-sm text-destructive" role="alert">
              <AlertTriangle aria-hidden="true" className="size-4" />
              {errorMessage(create.error)}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <section aria-labelledby="users-heading">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-heading text-xl font-semibold" id="users-heading">
            Users
          </h2>
          <div className="flex items-center gap-3">
            {users.data ? (
              <p className="text-sm text-muted-foreground">{users.data.length} total</p>
            ) : null}
            <Button
              disabled={users.isFetching}
              onClick={() => void users.refetch()}
              size="sm"
              variant="outline"
            >
              <RefreshCw
                aria-hidden="true"
                className={users.isFetching ? "animate-spin" : undefined}
              />
              Refresh
            </Button>
          </div>
        </div>

        {users.isError && users.data ? (
          <p
            className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
            role="alert"
          >
            Users could not be refreshed. Showing the last loaded values.
            {apiRequestId(users.error)
              ? ` Support ID: ${apiRequestId(users.error)}.`
              : ""}
          </p>
        ) : null}

        {users.isPending ? (
          <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            Loading users…
          </div>
        ) : users.data ? (
          <div className="mt-4 overflow-x-auto rounded-xl border bg-card shadow-sm">
            <table className="w-full min-w-[64rem] border-collapse text-left">
              <thead className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium" scope="col">User</th>
                  <th className="px-4 py-3 font-medium" scope="col">Status</th>
                  <th className="px-4 py-3 font-medium" scope="col">Role</th>
                  <th className="px-4 py-3 font-medium" scope="col">Active job limit</th>
                  <th className="px-4 py-3 font-medium" scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.data.map((user) => (
                  <UserRow
                    beginPasswordLinkRequest={beginPasswordLinkRequest}
                    endPasswordLinkRequest={endPasswordLinkRequest}
                    key={user.user_id}
                    onPasswordLink={(linkUser, result, triggerId) =>
                      setPasswordLink({
                        displayName: linkUser.display_name,
                        email: linkUser.email,
                        password_link: result.password_link,
                        expires_at: result.expires_at,
                        triggerId,
                      })
                    }
                    passwordLinkLocked={passwordLinkLocked}
                    user={user}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-6 text-sm text-destructive">{errorMessage(users.error)}</p>
        )}
      </section>

      <PasswordLinkDialog
        link={passwordLink}
        onClose={() => {
          setPasswordLink(null)
          endPasswordLinkRequest()
        }}
      />
    </div>
  )
}
