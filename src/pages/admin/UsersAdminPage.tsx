import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, LoaderCircle, Plus, Save } from "lucide-react"
import { useEffect, useState, type FormEvent } from "react"

import { adminUsersKey } from "@/admin"
import {
  ApiError,
  createAdminPasswordLink,
  createAdminUser,
  listAdminUsers,
  updateAdminUser,
  type AdminUser,
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

function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "The admin request failed. Try again."
}

function UserRow({
  user,
  update,
  reset,
}: {
  user: AdminUser
  update: ReturnType<typeof useUserUpdate>
  reset: ReturnType<typeof usePasswordReset>
}) {
  const [activeJobLimit, setActiveJobLimit] = useState(String(user.active_job_limit))
  useEffect(() => setActiveJobLimit(String(user.active_job_limit)), [user.active_job_limit])
  const busy = update.isPending || reset.isPending
  const rowError =
    update.isError && update.variables?.userId === user.user_id
      ? update.error
      : reset.isError && reset.variables === user.user_id
        ? reset.error
        : null

  return (
    <tr className="border-b last:border-0">
      <td className="px-4 py-4 align-top">
        <p className="font-medium">{user.display_name}</p>
        <p className="mt-1 text-xs text-muted-foreground">{user.email}</p>
      </td>
      <td className="px-4 py-4 align-top">
        <Badge variant={user.active ? "secondary" : "outline"}>
          {user.active ? "Active" : "Disabled"}
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
            min={1}
            onChange={(event) => setActiveJobLimit(event.target.value)}
            type="number"
            value={activeJobLimit}
          />
          <Button
            aria-label={`Save active job limit for ${user.display_name}`}
            disabled={busy || Number(activeJobLimit) < 1}
            onClick={() =>
              update.mutate({
                userId: user.user_id,
                input: { active_job_limit: Number(activeJobLimit) },
              })
            }
            size="icon-sm"
            variant="outline"
          >
            <Save aria-hidden="true" />
          </Button>
        </div>
      </td>
      <td className="px-4 py-4 align-top">
        <div className="flex min-w-52 flex-wrap gap-2">
          <Button
            disabled={busy}
            onClick={() =>
              update.mutate({
                userId: user.user_id,
                input: { is_admin: !user.is_admin },
              })
            }
            size="sm"
            variant="outline"
          >
            {user.is_admin ? "Remove admin" : "Make admin"}
          </Button>
          <Button
            disabled={busy}
            onClick={() =>
              update.mutate({
                userId: user.user_id,
                input: { active: !user.active },
              })
            }
            size="sm"
            variant="outline"
          >
            {user.active ? "Disable" : "Enable"}
          </Button>
          <Button
            disabled={!user.active || busy}
            onClick={() => reset.mutate(user.user_id)}
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
    onSuccess(user) {
      const current = authenticatedPrincipal(
        queryClient.getQueryData<CurrentUserState>(currentUserKey)
      )
      if (current?.user_id === user.user_id) {
        if (!user.active) {
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

function usePasswordReset(onLink: (link: string) => void) {
  return useMutation({
    mutationFn: createAdminPasswordLink,
    onSuccess: ({ password_link }) => onLink(password_link),
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
  const [passwordLink, setPasswordLink] = useState<string | null>(null)
  const create = useMutation({
    mutationFn: createAdminUser,
    onSuccess(result) {
      setPasswordLink(result.password_link)
      setEmail("")
      setDisplayName("")
      setIsAdmin(false)
      setActiveJobLimit("")
      void queryClient.invalidateQueries({ queryKey: adminUsersKey })
    },
  })
  const update = useUserUpdate()
  const reset = usePasswordReset(setPasswordLink)
  useExpireSession(users.error)
  useExpireSession(create.error)
  useExpireSession(update.error)
  useExpireSession(reset.error)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPasswordLink(null)
    create.mutate({
      email: email.trim(),
      display_name: displayName.trim(),
      is_admin: isAdmin,
      ...(activeJobLimit ? { active_job_limit: Number(activeJobLimit) } : {}),
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
                min={1}
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
                  (activeJobLimit !== "" && Number(activeJobLimit) < 1)
                }
                type="submit"
              >
                <Plus aria-hidden="true" />
                Create
              </Button>
            </div>
          </form>
          {passwordLink ? (
            <div className="mt-5 rounded-lg border bg-muted/40 p-4">
              <p className="text-sm font-medium">One-time password link</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Give this link to the user through a trusted channel.
              </p>
              <Input className="mt-3 font-mono text-xs" readOnly value={passwordLink} />
            </div>
          ) : null}
          {create.error ? (
            <p className="mt-4 flex items-center gap-2 text-sm text-destructive" role="alert">
              <AlertTriangle aria-hidden="true" className="size-4" />
              {errorMessage(create.error)}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <section aria-labelledby="users-heading">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-heading text-xl font-semibold" id="users-heading">
            Users
          </h2>
          {users.data ? (
            <p className="text-sm text-muted-foreground">{users.data.length} total</p>
          ) : null}
        </div>

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
                  <UserRow key={user.user_id} reset={reset} update={update} user={user} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-6 text-sm text-destructive">{errorMessage(users.error)}</p>
        )}
      </section>
    </div>
  )
}
