import type { components } from "@/api/schema"

export type Job = components["schemas"]["JobView"]
export type JobState = components["schemas"]["JobState"]
export type LoginInput = components["schemas"]["LoginRequest"]
export type Principal = components["schemas"]["PrincipalView"]
export type SetPasswordInput = components["schemas"]["SetPasswordRequest"]

export const SERVICE_CONFIGURATION_ERROR_MESSAGE =
  "BioModals is not configured to accept requests from this site. Contact an administrator."

export interface GromacsSubmission {
  cpuOnly: boolean
  displayName: string | null
  idempotencyKey: string
  pdb: File
  runPdbfixer: boolean
  simulationTimeNs: number
}

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

export class MissingCsrfError extends ApiError {
  constructor() {
    super(401, { detail: "Authentication required" })
    this.name = "MissingCsrfError"
  }
}

export function apiErrorCode(error: unknown) {
  if (!(error instanceof ApiError) || !error.body || typeof error.body !== "object") return null
  if (!("code" in error.body) || typeof error.body.code !== "string") return null
  return error.body.code
}

export function isServiceConfigurationError(error: unknown) {
  return apiErrorCode(error) === "origin_not_allowed"
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

export function csrfToken(cookieHeader = document.cookie) {
  const token = readCookie(cookieHeader, "biomodals-csrf")
  if (!token) throw new MissingCsrfError()
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

export function listJobs(signal?: AbortSignal) {
  return requestJson<Job[]>("/api/v1/jobs", { signal })
}

export function inspectJob(jobId: string, signal?: AbortSignal) {
  return requestJson<Job>(`/api/v1/jobs/${encodeURIComponent(jobId)}`, { signal })
}

export function cancelJob(jobId: string) {
  return requestJson<Job>(`/api/v1/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: "POST",
    headers: { "X-CSRF-Token": csrfToken() },
  })
}

export async function logout() {
  await requestJson<undefined>("/api/v1/auth/logout", {
    method: "POST",
    headers: { "X-CSRF-Token": csrfToken() },
  })
}

function xhrBody(xhr: XMLHttpRequest) {
  return xhr.response ?? undefined
}

export function submitGromacsJob(
  input: GromacsSubmission,
  signal: AbortSignal,
  onProgress: (percent: number | null) => void
) {
  return new Promise<Job>((resolve, reject) => {
    const form = new FormData()
    form.append("pdb", input.pdb)
    if (input.displayName) form.append("display_name", input.displayName)
    form.append("simulation_time_ns", String(input.simulationTimeNs))
    form.append("run_pdbfixer", String(input.runPdbfixer))
    form.append("cpu_only", String(input.cpuOnly))

    const xhr = new XMLHttpRequest()
    xhr.open("POST", "/api/v1/gromacs/jobs")
    xhr.responseType = "json"
    xhr.withCredentials = true
    xhr.setRequestHeader("Accept", "application/json")
    xhr.setRequestHeader("Idempotency-Key", input.idempotencyKey)

    try {
      xhr.setRequestHeader("X-CSRF-Token", csrfToken())
    } catch (error) {
      reject(error)
      return
    }

    const abort = () => xhr.abort()
    signal.addEventListener("abort", abort, { once: true })
    xhr.upload.addEventListener("progress", (event) => {
      onProgress(event.lengthComputable ? Math.round((event.loaded / event.total) * 100) : null)
    })
    xhr.addEventListener("load", () => {
      signal.removeEventListener("abort", abort)
      const body = xhrBody(xhr)
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as Job)
      else reject(new ApiError(xhr.status, body))
    })
    xhr.addEventListener("error", () => {
      signal.removeEventListener("abort", abort)
      reject(new ApiError(0))
    })
    xhr.addEventListener("abort", () => {
      signal.removeEventListener("abort", abort)
      reject(new DOMException("Upload cancelled", "AbortError"))
    })
    xhr.send(form)
  })
}
