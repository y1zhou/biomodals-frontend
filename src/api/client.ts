import type { components } from "@/api/schema"

export type HttpValidationError = components["schemas"]["HTTPValidationError"]
export type Job = components["schemas"]["JobView"]
export type JobState = components["schemas"]["JobState"]
export type LoginInput = components["schemas"]["LoginRequest"]
export type Principal = components["schemas"]["PrincipalView"]
export type SetPasswordInput = components["schemas"]["SetPasswordRequest"]

export class ApiError extends Error {
  readonly body: unknown
  readonly status: number

  constructor(status: number, body?: unknown) {
    super(apiErrorMessage(body) ?? `Request failed with status ${status}`)
    this.name = "ApiError"
    this.body = body
    this.status = status
  }
}

function apiErrorMessage(body: unknown) {
  if (!body || typeof body !== "object" || !("detail" in body)) return null
  return typeof body.detail === "string" ? body.detail : null
}

async function responseBody(response: Response) {
  const contentType = response.headers.get("content-type")
  if (!contentType?.includes("application/json")) return undefined

  return response.json().catch(() => undefined)
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: {
      Accept: "application/json",
      ...init?.headers,
    },
  })
  const body = await responseBody(response)

  if (!response.ok) throw new ApiError(response.status, body)
  return body as T
}

export function readCookie(cookieHeader: string, name: string) {
  for (const entry of cookieHeader.split(";")) {
    const [key, ...value] = entry.trim().split("=")
    if (key === name) return decodeURIComponent(value.join("="))
  }

  return null
}

export function csrfToken() {
  const token = readCookie(document.cookie, "biomodals-csrf")
  if (!token) throw new ApiError(401, { detail: "Authentication required" })
  return token
}

export async function currentUser(signal?: AbortSignal) {
  try {
    return await requestJson<Principal>("/api/v1/auth/me", { signal })
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}

export function login(input: LoginInput) {
  return requestJson<Principal>("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
}

export function setPassword(input: SetPasswordInput) {
  return requestJson<Principal>("/api/v1/auth/set-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
}

export async function logout() {
  await requestJson<undefined>("/api/v1/auth/logout", {
    method: "POST",
    headers: { "X-CSRF-Token": csrfToken() },
  })
}
