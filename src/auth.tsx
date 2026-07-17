import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Eye, EyeOff, LoaderCircle } from "lucide-react"
import { useEffect, useRef, useState, type FormEvent } from "react"
import {
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router"

import { ApiError, login, setPassword, type Principal } from "@/api/client"
import { currentUserKey, safeReturnTo, useCurrentUser } from "@/auth-state"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

function LoadingPage() {
  return (
    <main className="grid min-h-[60svh] place-items-center px-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        Loading BioModals…
      </div>
    </main>
  )
}

export function ProtectedRoute() {
  const location = useLocation()
  const user = useCurrentUser()

  if (user.isPending) return <LoadingPage />

  if (user.isError) {
    return (
      <main className="mx-auto max-w-lg px-6 py-24 text-center">
        <h1 className="font-heading text-2xl font-semibold">BioModals is unavailable</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          We couldn&apos;t check your session. Check the connection and try again.
        </p>
        <Button className="mt-6" onClick={() => void user.refetch()}>
          Try again
        </Button>
      </main>
    )
  }

  if (!user.data) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`
    return <Navigate replace to={`/login?returnTo=${encodeURIComponent(returnTo)}`} />
  }

  return <Outlet />
}

interface LoginFormProps {
  onSuccess: (user: Principal) => void
  submitLabel?: string
}

export function LoginForm({ onSuccess, submitLabel = "Sign in" }: LoginFormProps) {
  const queryClient = useQueryClient()
  const [email, setEmail] = useState("")
  const [password, setPasswordValue] = useState("")
  const mutation = useMutation({
    mutationFn: login,
    retry: false,
    onSuccess(user) {
      queryClient.setQueryData(currentUserKey, user)
      onSuccess(user)
    },
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    mutation.mutate({ email: email.trim(), password })
  }

  const error = mutation.error
    ? mutation.error instanceof ApiError && mutation.error.status === 401
      ? "Email or password is incorrect."
      : "Sign in failed. Check the connection and try again."
    : null

  return (
    <form className="space-y-5" onSubmit={submit}>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="login-email">
          Email
        </label>
        <Input
          autoComplete="username"
          autoFocus
          id="login-email"
          maxLength={320}
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="login-password">
          Password
        </label>
        <Input
          autoComplete="current-password"
          id="login-password"
          maxLength={128}
          onChange={(event) => setPasswordValue(event.target.value)}
          required
          type="password"
          value={password}
        />
      </div>
      {error ? (
        <p aria-live="polite" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button className="w-full" disabled={mutation.isPending} size="lg" type="submit">
        {mutation.isPending ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : null}
        {submitLabel}
      </Button>
    </form>
  )
}

export function ReauthenticationDialog({
  open,
  onCancel,
  onSuccess,
}: {
  open: boolean
  onCancel: () => void
  onSuccess: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal()
    if (!open && dialog.current?.open) dialog.current.close()
  }, [open])

  return (
    <dialog
      aria-labelledby="reauthenticate-title"
      className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-xl border bg-background p-0 text-foreground shadow-2xl backdrop:bg-foreground/30"
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
      ref={dialog}
    >
      <div className="p-6">
        <h2 className="font-heading text-xl font-semibold" id="reauthenticate-title">
          Sign in again
        </h2>
        <p className="mb-6 mt-2 text-sm leading-6 text-muted-foreground">
          Your session expired. Your selected PDB and settings will stay on this page.
        </p>
        <LoginForm onSuccess={onSuccess} submitLabel="Sign in and return" />
        <Button className="mt-2 w-full" onClick={onCancel} type="button" variant="ghost">
          Cancel
        </Button>
      </div>
    </dialog>
  )
}

function AuthCard({ children, title, description }: { children: React.ReactNode; title: string; description: string }) {
  return (
    <main className="mx-auto grid min-h-[calc(100svh-73px)] max-w-md place-items-center px-6 py-12">
      <Card className="w-full shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl">{title}</CardTitle>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </main>
  )
}

export function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const user = useCurrentUser()
  const returnTo = safeReturnTo(searchParams.get("returnTo"), window.location.origin)

  if (user.isPending) return <LoadingPage />
  if (user.data) return <Navigate replace to={returnTo} />

  return (
    <AuthCard
      description="Use the account provided by your BioModals administrator."
      title="Sign in"
    >
      <LoginForm onSuccess={() => navigate(returnTo, { replace: true })} />
      <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">
        Need access or forgot your password? Contact your administrator.
      </p>
    </AuthCard>
  )
}

export function SetPasswordPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [token] = useState(() => new URLSearchParams(location.search).get("token") ?? "")
  const [password, setPasswordValue] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const mutation = useMutation({
    mutationFn: setPassword,
    retry: false,
    onSuccess(user) {
      queryClient.setQueryData(currentUserKey, user)
      navigate("/", { replace: true })
    },
  })

  useEffect(() => {
    if (location.search) navigate(location.pathname, { replace: true })
  }, [location.pathname, location.search, navigate])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLocalError(null)

    if (password.length < 15 || password.length > 128) {
      setLocalError("Use 15 to 128 characters.")
      return
    }
    if (password !== confirmation) {
      setLocalError("The passwords do not match.")
      return
    }

    mutation.mutate({ token, password })
  }

  if (!token) {
    return (
      <AuthCard
        description="This password link is missing, invalid, or has already been used. Ask your administrator for a new link."
        title="Password link unavailable"
      >
        <Button className="w-full" onClick={() => navigate("/login")} variant="outline">
          Go to sign in
        </Button>
      </AuthCard>
    )
  }

  const apiError = mutation.error
    ? mutation.error instanceof ApiError && mutation.error.status === 400
      ? "This password link is invalid or expired. Ask your administrator for a new link."
      : "Your password could not be set. Check the connection and try again."
    : null
  const passwordType = showPassword ? "text" : "password"

  return (
    <AuthCard
      description="Choose the password you will use to sign in to BioModals."
      title="Set your password"
    >
      <form className="space-y-5" onSubmit={submit}>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="new-password">
            New password
          </label>
          <Input
            aria-describedby="password-help"
            autoComplete="new-password"
            autoFocus
            id="new-password"
            maxLength={128}
            minLength={15}
            onChange={(event) => setPasswordValue(event.target.value)}
            required
            type={passwordType}
            value={password}
          />
          <p className="text-xs text-muted-foreground" id="password-help">
            Use 15 to 128 characters.
          </p>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="confirm-password">
            Confirm password
          </label>
          <Input
            autoComplete="new-password"
            id="confirm-password"
            maxLength={128}
            minLength={15}
            onChange={(event) => setConfirmation(event.target.value)}
            required
            type={passwordType}
            value={confirmation}
          />
        </div>
        <Button
          onClick={() => setShowPassword((visible) => !visible)}
          type="button"
          variant="ghost"
        >
          {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          {showPassword ? "Hide passwords" : "Show passwords"}
        </Button>
        {localError || apiError ? (
          <p aria-live="polite" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {localError ?? apiError}
          </p>
        ) : null}
        <Button className="w-full" disabled={mutation.isPending} size="lg" type="submit">
          {mutation.isPending ? (
            <LoaderCircle aria-hidden="true" className="animate-spin" />
          ) : null}
          Set password
        </Button>
      </form>
    </AuthCard>
  )
}
