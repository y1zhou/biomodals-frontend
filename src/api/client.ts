import type { components } from "@/api/schema"
import type { HumanizationOptions, HumanizationSubmission, HumanizationSelection, SelectionQuery } from "@/humanization"

export type Job = components["schemas"]["JobView"]
export type JobPage = components["schemas"]["JobPageView"]
export type JobStage = components["schemas"]["JobStageView"]
export type JobState = components["schemas"]["JobState"]
export type LoginInput = components["schemas"]["LoginRequest"]
export type Principal = components["schemas"]["PrincipalView"]
export type SetPasswordInput = components["schemas"]["SetPasswordRequest"]
export type AdminUser = components["schemas"]["AdminUserView"]
export type AdminUserPage = components["schemas"]["AdminUserPageView"]
export type JobLogTarget = components["schemas"]["JobLogTargetView"]
export type JobLogTargets = components["schemas"]["JobLogTargetsView"]
export type CreateAdminUserInput = components["schemas"]["CreateAdminUserRequest"]
export type CreatedAdminUser = components["schemas"]["CreatedAdminUserView"]
export type UpdateAdminUserInput = components["schemas"]["UpdateAdminUserRequest"]
export type PasswordLink = components["schemas"]["PasswordLinkView"]
export type AdminModal = components["schemas"]["AdminModalView"]
export type AdminModalEnvironment = components["schemas"]["AdminModalEnvironmentView"]
export type AdminModalTool = components["schemas"]["AdminModalToolView"]
export type AdminStateUnknownJob = components["schemas"]["AdminStateUnknownJobView"]
export type ResolveStateUnknownJobInput =
  components["schemas"]["ResolveStateUnknownJobRequest"]
export type UpdateAdminModalEnvironmentInput =
  components["schemas"]["UpdateAdminModalEnvironmentRequest"]
export type UpdateAdminModalToolInput =
  components["schemas"]["UpdateAdminModalToolRequest"]
export type AdminStorage = components["schemas"]["AdminStorageView"]
export type AdminCacheCleanup = components["schemas"]["AdminCacheCleanupView"]
export type AdminCosts = components["schemas"]["AdminCostsView"]
export type AlphaFold3Validation = components["schemas"]["ValidationView"]
export type AlphaFold3Prediction = components["schemas"]["PredictionSummary"]
export type AlphaFold3Pae = components["schemas"]["PaeWindow"]

export interface PaeBounds {
  x_start: number
  x_end: number
  y_start: number
  y_end: number
}

export interface JobLogWindow {
  since: string
  until: string
}

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

export interface AlphaFold3ValidationSettings {
  recycle: number
  sample: number
  searchMsa: boolean
  searchProteinTemplates: boolean
}

export class ApiError extends Error {
  readonly body: unknown
  readonly requestId: string | null
  readonly status: number

  constructor(status: number, body?: unknown, requestId: string | null = null) {
    super(apiErrorMessage(body) ?? `Request failed with status ${status}`)
    this.name = "ApiError"
    this.body = body
    this.requestId = requestId
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

export function apiRequestId(error: unknown) {
  return error instanceof ApiError ? error.requestId : null
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

async function requestResponse(
  path: string,
  init?: RequestInit,
  accept = "application/json"
) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: {
      Accept: accept,
      ...init?.headers,
    },
  })
  if (!response.ok) {
    throw new ApiError(
      response.status,
      await responseBody(response),
      response.headers.get("X-Request-ID")
    )
  }
  return response
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  return (await responseBody(await requestResponse(path, init))) as T
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

async function collectCursorPages<Item>(
  load: (cursor: string | null) => Promise<{
    items: readonly Item[]
    nextCursor: string | null
  }>
) {
  const items: Item[] = []
  const seen = new Set<string>()
  let cursor: string | null = null
  do {
    const page = await load(cursor)
    items.push(...page.items)
    cursor = page.nextCursor
    if (cursor && seen.has(cursor)) {
      throw new Error("The API returned a repeated pagination cursor")
    }
    if (cursor) seen.add(cursor)
  } while (cursor)
  return items
}

function cursorPagePath(path: string, cursor: string | null) {
  const parameters = new URLSearchParams({ limit: "100" })
  if (cursor) parameters.set("cursor", cursor)
  return `${path}?${parameters}`
}

export function listJobs(signal?: AbortSignal) {
  return collectCursorPages<Job>(async (cursor) => {
    const page = await requestJson<JobPage>(
      cursorPagePath("/api/v1/jobs", cursor),
      { signal }
    )
    return { items: page.jobs, nextCursor: page.next_cursor ?? null }
  })
}

export function inspectJob(jobId: string, signal?: AbortSignal) {
  return requestJson<Job>(`/api/v1/jobs/${encodeURIComponent(jobId)}`, { signal })
}

export function refreshJob(jobId: string) {
  return requestJson<Job>(`/api/v1/jobs/${encodeURIComponent(jobId)}/refresh`, {
    method: "POST",
    headers: { "X-CSRF-Token": csrfToken() },
  })
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

export function listAdminUsers(signal?: AbortSignal) {
  return collectCursorPages<AdminUser>(async (cursor) => {
    const page = await requestJson<AdminUserPage>(
      cursorPagePath("/api/v1/admin/users", cursor),
      { signal }
    )
    return { items: page.users, nextCursor: page.next_cursor ?? null }
  })
}

export function createAdminUser(input: CreateAdminUserInput) {
  return requestJson<CreatedAdminUser>("/api/v1/admin/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken(),
    },
    body: JSON.stringify(input),
  })
}

export function updateAdminUser(userId: string, input: UpdateAdminUserInput) {
  return requestJson<AdminUser>(`/api/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken(),
    },
    body: JSON.stringify(input),
  })
}

export function createAdminPasswordLink(userId: string) {
  return requestJson<PasswordLink>(
    `/api/v1/admin/users/${encodeURIComponent(userId)}/password-link`,
    {
      method: "POST",
      headers: { "X-CSRF-Token": csrfToken() },
    }
  )
}

export function inspectAdminModal(signal?: AbortSignal) {
  return requestJson<AdminModal>("/api/v1/admin/modal", { signal })
}

export function inspectJobLogTargets(
  jobId: string,
  stageCode: string,
  signal?: AbortSignal
) {
  const parameters = new URLSearchParams({
    limit: "100",
    stage_code: stageCode,
  })
  return requestJson<JobLogTargets>(
    `/api/v1/jobs/${encodeURIComponent(jobId)}/log-targets?${parameters}`,
    { signal }
  )
}

export async function streamJobLogs(
  jobId: string,
  targetId: string,
  signal: AbortSignal,
  onChunk: (chunk: string) => void,
  window?: JobLogWindow
) {
  const parameters = new URLSearchParams({ target: targetId })
  if (window) {
    parameters.set("since", window.since)
    parameters.set("until", window.until)
  }
  const response = await requestResponse(
    `/api/v1/jobs/${encodeURIComponent(jobId)}/logs?${parameters}`,
    {
      signal,
    },
    "application/x-ndjson"
  )
  if (!response.body) throw new Error("The API returned an empty log stream")

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let pending = ""
  const emit = (line: string) => {
    if (!line) return
    const entry = JSON.parse(line) as {
      message: string
      source: string
      timestamp: string
    }
    onChunk(
      `${entry.timestamp} ${entry.message}${entry.message.endsWith("\n") ? "" : "\n"}`
    )
  }
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      pending += decoder.decode(value, { stream: true })
      const lines = pending.split("\n")
      pending = lines.pop() ?? ""
      for (const line of lines) emit(line)
    }
    pending += decoder.decode()
    if (pending) emit(pending)
  } finally {
    reader.releaseLock()
  }
}

export function resolveAdminStateUnknownJob(
  jobId: string,
  input: ResolveStateUnknownJobInput
) {
  return requestJson<AdminModal>(
    `/api/v1/admin/modal/state-unknown-jobs/${encodeURIComponent(jobId)}/resolve`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken(),
      },
      body: JSON.stringify(input),
    }
  )
}

export function updateAdminModalEnvironment(input: UpdateAdminModalEnvironmentInput) {
  return requestJson<AdminModalEnvironment>("/api/v1/admin/modal/environment", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken(),
    },
    body: JSON.stringify(input),
  })
}

export function updateAdminModalTool(
  tool: string,
  input: UpdateAdminModalToolInput
) {
  return requestJson<AdminModalTool>(
    `/api/v1/admin/modal/tools/${encodeURIComponent(tool)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken(),
      },
      body: JSON.stringify(input),
    }
  )
}

export function validateAlphaFold3(
  document: Blob,
  settings: AlphaFold3ValidationSettings,
  signal?: AbortSignal
) {
  const parameters = new URLSearchParams({
    recycle: String(settings.recycle),
    sample: String(settings.sample),
    search_msa: String(settings.searchMsa),
    search_protein_templates: String(settings.searchProteinTemplates),
  })
  return requestJson<AlphaFold3Validation>(
    `/api/v1/alphafold3/validations?${parameters}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken(),
      },
      body: document,
      signal,
    }
  )
}

export function inspectAlphaFold3Validation(
  validationId: string,
  signal?: AbortSignal
) {
  return requestJson<AlphaFold3Validation>(
    `/api/v1/alphafold3/validations/${encodeURIComponent(validationId)}`,
    { signal }
  )
}

export function deleteAlphaFold3Validation(validationId: string) {
  return requestResponse(
    `/api/v1/alphafold3/validations/${encodeURIComponent(validationId)}`,
    {
      method: "DELETE",
      headers: { "X-CSRF-Token": csrfToken() },
    }
  )
}

export function alphaFold3DocumentUrl(validationId: string) {
  return `/api/v1/alphafold3/validations/${encodeURIComponent(validationId)}/document`
}

export function alphaFold3JobDocumentUrl(jobId: string) {
  return `/api/v1/alphafold3/jobs/${encodeURIComponent(jobId)}/document`
}

export function submitAlphaFold3Job(
  validationId: string,
  idempotencyKey: string
) {
  return requestJson<Job>("/api/v1/alphafold3/jobs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
      "X-CSRF-Token": csrfToken(),
    },
    body: JSON.stringify({ validation_id: validationId }),
  })
}

export function inspectAdminCosts(
  start: string,
  end: string,
  refresh = false,
  signal?: AbortSignal
) {
  const parameters = new URLSearchParams({ start, end, refresh: String(refresh) })
  return requestJson<AdminCosts>(`/api/v1/admin/modal/costs?${parameters}`, {
    signal,
  })
}

export function inspectAdminStorage(signal?: AbortSignal) {
  return requestJson<AdminStorage>("/api/v1/admin/storage", { signal })
}

export function clearAdminResultCache() {
  return requestJson<AdminCacheCleanup>("/api/v1/admin/storage/cache/clear", {
    method: "POST",
    headers: { "X-CSRF-Token": csrfToken() },
  })
}

export function prepareJobDownload(jobId: string) {
  return requestJson<undefined>(
    `/api/v1/jobs/${encodeURIComponent(jobId)}/prepare-download`,
    {
      method: "POST",
      headers: { "X-CSRF-Token": csrfToken() },
    }
  )
}

export function retryJobResultPreparation(jobId: string) {
  return requestJson<Job>(`/api/v1/jobs/${encodeURIComponent(jobId)}/retry-result-preparation`, {
    method: "POST",
    headers: { "X-CSRF-Token": csrfToken() },
  })
}

export function humanizationOptions(signal?: AbortSignal) {
  return requestJson<HumanizationOptions>("/api/v1/humanization/options", { signal })
}

async function alphaFold3ResultResponse(jobId: string, suffix: string, signal?: AbortSignal, accept?: string) {
  const path = `/api/v1/alphafold3/jobs/${encodeURIComponent(jobId)}/prediction${suffix}`
  try {
    return await requestResponse(path, { signal, cache: "no-store" }, accept)
  } catch (error) {
    if (apiErrorCode(error) !== "result_not_cached") throw error
    signal?.throwIfAborted()
    await prepareJobDownload(jobId)
    signal?.throwIfAborted()
    return requestResponse(path, { signal, cache: "no-store" }, accept)
  }
}

export async function alphaFold3Prediction(jobId: string, signal?: AbortSignal): Promise<AlphaFold3Prediction> {
  return (await alphaFold3ResultResponse(jobId, "", signal)).json()
}

export async function alphaFold3Model(jobId: string, signal?: AbortSignal) {
  return (await alphaFold3ResultResponse(jobId, "/model.cif", signal, "chemical/x-mmcif")).text()
}

export async function alphaFold3Pae(jobId: string, bounds: PaeBounds | null, signal?: AbortSignal): Promise<AlphaFold3Pae> {
  const parameters = new URLSearchParams()
  if (bounds) for (const [name, value] of Object.entries(bounds)) parameters.set(name, String(value))
  return (await alphaFold3ResultResponse(jobId, `/pae?${parameters}`, signal)).json()
}

export function humanizationInputs(jobId: string, signal?: AbortSignal) {
  return requestJson<HumanizationSubmission>(`/api/v1/humanization/jobs/${encodeURIComponent(jobId)}/inputs`, { signal, cache: "no-store" })
}

export function submitHumanizationJob(input: HumanizationSubmission, idempotencyKey: string) {
  return requestJson<Job>("/api/v1/humanization/jobs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken(),
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(input),
  })
}

export async function humanizationSelection(jobId: string, query: SelectionQuery, signal?: AbortSignal) {
  const params = new URLSearchParams({ offset: String(query.offset), limit: String(query.limit) })
  if (query.parentId) params.set("parent_id", query.parentId)
  if (query.sortBy) {
    params.set("sort_by", query.sortBy)
    params.set("descending", String(query.descending))
  }
  const path = `/api/v1/humanization/jobs/${encodeURIComponent(jobId)}/selection?${params}`
  try {
    return await requestJson<HumanizationSelection>(path, { signal })
  } catch (error) {
    if (apiErrorCode(error) !== "result_not_cached") throw error
    signal?.throwIfAborted()
    await prepareJobDownload(jobId)
    signal?.throwIfAborted()
    return requestJson<HumanizationSelection>(path, { signal })
  }
}

export function jobDownloadUrl(jobId: string) {
  return `/api/v1/jobs/${encodeURIComponent(jobId)}/download`
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
    xhr.upload.addEventListener("load", () => onProgress(100))
    xhr.addEventListener("load", () => {
      signal.removeEventListener("abort", abort)
      const body = xhrBody(xhr)
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as Job)
      else {
        reject(
          new ApiError(
            xhr.status,
            body,
            xhr.getResponseHeader("X-Request-ID")
          )
        )
      }
    })
    xhr.addEventListener("error", () => {
      signal.removeEventListener("abort", abort)
      reject(new ApiError(0, undefined, xhr.getResponseHeader("X-Request-ID")))
    })
    xhr.addEventListener("abort", () => {
      signal.removeEventListener("abort", abort)
      reject(new DOMException("Upload cancelled", "AbortError"))
    })
    xhr.send(form)
  })
}
