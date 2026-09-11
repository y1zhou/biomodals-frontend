import { AlertDialog } from "@base-ui/react/alert-dialog"
import { Dialog } from "@base-ui/react/dialog"
import { Menu } from "@base-ui/react/menu"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  EllipsisVertical,
  KeyRound,
  LoaderCircle,
  Plus,
  Save,
  ShieldMinus,
  ShieldPlus,
  UserRoundCheck,
  UserRoundX,
} from "lucide-react"
import { useEffect, useRef, useState, type FormEvent } from "react"

import {
  adminUsersKey,
  nonnegativeInteger,
  sortAdminUsersByCreatedAt,
  upsertAdminUser,
} from "@/admin"
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
import { RefreshButton } from "@/components/RefreshButton"
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

const menuItemClass =
  "flex h-8 cursor-default items-center gap-2 rounded-lg px-2.5 text-sm outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-muted"
const destructiveMenuItemClass =
  `${menuItemClass} text-destructive data-[highlighted]:bg-destructive/10`

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
                <p className="mt-3 text-sm leading-5 text-muted-foreground">
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
            display_name: user.display_name,
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
  const [displayName, setDisplayName] = useState(user.display_name)
  const [activeJobLimit, setActiveJobLimit] = useState(String(user.active_job_limit))
  const [emailCopied, setEmailCopied] = useState(false)
  const [confirmedAction, setConfirmedAction] = useState<ConfirmedAction | null>(null)
  useEffect(() => setDisplayName(user.display_name), [user.display_name])
  useEffect(() => setActiveJobLimit(String(user.active_job_limit)), [user.active_job_limit])
  const actionsTriggerId = `user-actions-${user.user_id}`
  const updateBusy = update.isPending
  const resetBusy = reset.isPending
  const busy = updateBusy || resetBusy
  const rowError = update.error ?? reset.error
  const normalizedDisplayName = displayName.trim()
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
        onPasswordLink(user, result, actionsTriggerId)
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
        description: "Active sessions and password links will be revoked, and this user cannot submit new jobs or access results until re-enabled. Already admitted jobs keep this owner, continue using active-job capacity, and are not cancelled.",
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
      <tr className={rowError ? undefined : "border-b last:border-0"}>
        <td className="px-2 py-4 align-middle text-center">
          <div className="mx-auto flex w-full max-w-44 items-center justify-center gap-1">
            <Input
              aria-label={`Display name for ${user.email}`}
              className="h-7 px-2 text-xs"
              disabled={busy}
              maxLength={120}
              onChange={(event) => setDisplayName(event.target.value)}
              value={displayName}
            />
            <Button
              aria-label={`Save display name for ${user.email}`}
              disabled={
                busy ||
                !normalizedDisplayName ||
                normalizedDisplayName === user.display_name
              }
              onClick={() =>
                update.mutate({
                  userId: user.user_id,
                  input: { display_name: normalizedDisplayName },
                })
              }
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
        <td className="px-2 py-4 align-middle text-center">
          <div className="mx-auto flex w-full max-w-40 items-center">
            <span
              className="h-7 min-w-0 flex-1 truncate rounded-l-md border border-r-0 bg-muted/60 px-2 py-1.5 text-left text-xs text-muted-foreground"
              title={user.email}
            >
              {user.email}
            </span>
            <Button
              aria-label={emailCopied ? `Copied ${user.email}` : `Copy email ${user.email}`}
              aria-live="polite"
              className={emailCopied ? "rounded-l-none border-l-0 text-emerald-700" : "rounded-l-none border-l-0"}
              onClick={() => {
                void copyText(user.email)
                  .then(() => {
                    setEmailCopied(true)
                    window.setTimeout(() => setEmailCopied(false), 2_000)
                  })
                  .catch(() => setEmailCopied(false))
              }}
              size="icon-sm"
              title={`Copy ${user.email}`}
              type="button"
              variant="outline"
            >
              {emailCopied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            </Button>
          </div>
        </td>
        <td className="px-2 py-4 align-middle text-center">
          <Badge
            className={
              user.status === "enabled"
                ? "border-emerald-200 bg-emerald-100 text-emerald-800"
                : user.status === "disabled"
                  ? "border-gray-200 bg-gray-200 text-gray-950"
                  : "border-amber-200 bg-amber-100 text-amber-900"
            }
            variant="outline"
          >
            {user.status === "pending_setup"
              ? "Pending setup"
              : user.status === "enabled"
                ? "Enabled"
                : "Disabled"}
          </Badge>
        </td>
        <td className="px-2 py-4 align-middle text-center">
          <Badge variant={user.is_admin ? "default" : "outline"}>
            {user.is_admin ? "Admin" : "User"}
          </Badge>
        </td>
        <td className="px-2 py-4 align-middle text-center text-xs text-muted-foreground">
          <time dateTime={user.created_at}>{formatTimestamp(user.created_at)}</time>
        </td>
        <td className="px-2 py-4 align-middle text-center">
          <div className="mx-auto flex w-full max-w-28 items-center justify-center gap-1">
            <Input
              aria-label={`Active job limit for ${user.display_name}`}
              className="h-7 w-14 px-2 text-xs"
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
        <td className="px-2 py-4 align-middle text-center">
          <Menu.Root>
            <Menu.Trigger
              aria-label={`Actions for ${user.display_name}`}
              className="mx-auto grid size-8 place-items-center rounded-lg text-muted-foreground outline-none transition-all hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95 active:bg-muted active:text-foreground active:brightness-90 disabled:pointer-events-none disabled:opacity-50 motion-reduce:active:scale-100"
              disabled={busy}
              id={actionsTriggerId}
            >
              <EllipsisVertical aria-hidden="true" className="size-4" />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner align="end" className="z-50" sideOffset={6}>
                <Menu.Popup className="w-48 rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg outline-none data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
                  <Menu.Item
                    className={user.is_admin ? destructiveMenuItemClass : menuItemClass}
                    onClick={() => {
                      if (user.is_admin) setConfirmedAction("remove-admin")
                      else update.mutate({ userId: user.user_id, input: { is_admin: true } })
                    }}
                  >
                    {user.is_admin ? (
                      <ShieldMinus aria-hidden="true" className="size-4" />
                    ) : (
                      <ShieldPlus aria-hidden="true" className="size-4" />
                    )}
                    {user.is_admin ? "Remove admin" : "Make admin"}
                  </Menu.Item>
                  <Menu.Item
                    className={user.status === "disabled" ? menuItemClass : destructiveMenuItemClass}
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
                  >
                    {user.status === "disabled" ? (
                      <UserRoundCheck aria-hidden="true" className="size-4" />
                    ) : (
                      <UserRoundX aria-hidden="true" className="size-4" />
                    )}
                    {user.status === "disabled" ? "Enable" : "Disable"}
                  </Menu.Item>
                  <Menu.Separator className="my-1 h-px bg-border" />
                  <Menu.Item
                    className={menuItemClass}
                    disabled={user.status === "disabled" || passwordLinkLocked}
                    onClick={() => setConfirmedAction("password-link")}
                  >
                    <KeyRound aria-hidden="true" className="size-4" />
                    New password link
                  </Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </td>
      </tr>
      {rowError ? (
        <tr className="border-b last:border-0">
          <td className="px-4 pb-4" colSpan={7}>
            <p className="flex items-center justify-end gap-2 text-sm text-destructive" role="alert">
              <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
              {errorMessage(rowError)}
            </p>
          </td>
        </tr>
      ) : null}

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
              finalFocus={() => document.getElementById(actionsTriggerId)}
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
  const [createdAtSort, setCreatedAtSort] = useState<"ascending" | "descending">(
    "descending"
  )
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

      <section aria-labelledby="users-heading" className="min-w-0">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-heading text-xl font-semibold" id="users-heading">
            Users
          </h2>
          <div className="flex items-center gap-3">
            {users.data ? (
              <p className="text-sm text-muted-foreground">{users.data.length} total</p>
            ) : null}
            <RefreshButton
              disabled={users.isFetching}
              onRefresh={async () => {
                const result = await users.refetch()
                if (result.isError) throw result.error
              }}
              size="sm"
            />
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
          <div className="mt-4 max-w-full contain-paint overflow-x-auto rounded-xl border bg-card shadow-sm">
            <table className="w-full min-w-[58rem] table-fixed border-collapse text-center">
              <colgroup>
                <col className="w-[20%]" />
                <col className="w-[18%]" />
                <col className="w-[10%]" />
                <col className="w-[8%]" />
                <col className="w-[18%]" />
                <col className="w-[18%]" />
                <col className="w-[8%]" />
              </colgroup>
              <thead className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-3 font-medium" scope="col">User</th>
                  <th className="px-2 py-3 font-medium" scope="col">Email</th>
                  <th className="px-2 py-3 font-medium" scope="col">Status</th>
                  <th className="px-2 py-3 font-medium" scope="col">Role</th>
                  <th
                    aria-sort={createdAtSort}
                    className="px-2 py-3 font-medium"
                    scope="col"
                  >
                    <button
                      aria-label={`Created at, sorted ${
                        createdAtSort === "descending"
                          ? "newest first. Sort oldest first"
                          : "oldest first. Sort newest first"
                      }`}
                      className="mx-auto inline-flex items-center gap-1 rounded-md px-1 py-0.5 transition-all hover:bg-background hover:text-foreground active:scale-[0.97] active:brightness-90 motion-reduce:active:scale-100"
                      onClick={() =>
                        setCreatedAtSort((direction) =>
                          direction === "descending" ? "ascending" : "descending"
                        )
                      }
                      type="button"
                    >
                      Created at
                      {createdAtSort === "descending" ? (
                        <ArrowDown aria-hidden="true" className="size-3.5" />
                      ) : (
                        <ArrowUp aria-hidden="true" className="size-3.5" />
                      )}
                    </button>
                  </th>
                  <th className="px-2 py-3 font-medium" scope="col">Active job limit</th>
                  <th className="px-2 py-3 font-medium" scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortAdminUsersByCreatedAt(users.data, createdAtSort).map((user) => (
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
