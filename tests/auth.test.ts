import { describe, expect, test } from "bun:test"

import {
  ApiError,
  apiErrorCode,
  apiRequestId,
  csrfToken,
  MissingCsrfError,
  readCookie,
} from "../src/api/client"
import {
  REAUTHENTICATION_REQUIRED,
  isReauthenticationRequired,
  passwordSetupLocation,
  requiresReauthentication,
  safeReturnTo,
} from "../src/auth-state"

describe("readCookie", () => {
  test("reads and decodes the requested cookie", () => {
    expect(readCookie("session=hidden; biomodals-csrf=a%2Bb%3D; theme=light", "biomodals-csrf")).toBe("a+b=")
  })

  test("returns null when the cookie is absent", () => {
    expect(readCookie("session=hidden", "biomodals-csrf")).toBeNull()
  })
})

describe("csrfToken", () => {
  test("requires the readable CSRF cookie", () => {
    expect(csrfToken("biomodals-csrf=token")).toBe("token")
    expect(() => csrfToken("")).toThrow(MissingCsrfError)
  })
})

describe("safeReturnTo", () => {
  test("preserves internal paths", () => {
    expect(safeReturnTo("/tools/gromacs/new?source=catalog#form", "https://biomodals.test")).toBe(
      "/tools/gromacs/new?source=catalog#form"
    )
  })

  test("rejects external and authentication destinations", () => {
    expect(safeReturnTo("https://example.com", "https://biomodals.test")).toBe("/")
    expect(safeReturnTo("//example.com", "https://biomodals.test")).toBe("/")
    expect(safeReturnTo("/login", "https://biomodals.test")).toBe("/")
  })
})

describe("Password Setup URL", () => {
  test("reads the fragment token and returns the scrubbed route", () => {
    expect(passwordSetupLocation("#token=a%2Bb%3D", "/set-password", "?source=admin")).toEqual({
      token: "a+b=",
      scrubbedUrl: "/set-password?source=admin",
    })
  })
})

describe("coded API errors", () => {
  test("reads only string error codes", () => {
    expect(apiErrorCode(new ApiError(400, { code: "password_link_invalid", detail: "Expired" }))).toBe(
      "password_link_invalid"
    )
    expect(apiErrorCode(new ApiError(400, { code: 3, detail: "Broken" }))).toBeNull()
  })

  test("retains the request ID supplied by the API", () => {
    expect(apiRequestId(new ApiError(500, undefined, "request-123"))).toBe("request-123")
    expect(apiRequestId(new Error("not an API error"))).toBeNull()
  })

  test("reauthenticates for missing sessions and rejected CSRF", () => {
    expect(requiresReauthentication(new ApiError(401))).toBeTrue()
    expect(requiresReauthentication(new ApiError(403, { code: "csrf_invalid", detail: "Stale" }))).toBeTrue()
    expect(requiresReauthentication(new ApiError(403, { code: "origin_not_allowed", detail: "Origin" }))).toBeFalse()
  })

  test("represents an invalid session without retaining the cached User", () => {
    expect(isReauthenticationRequired(REAUTHENTICATION_REQUIRED)).toBeTrue()
    expect(isReauthenticationRequired({ display_name: "Alice" })).toBeFalse()
    expect("email" in REAUTHENTICATION_REQUIRED).toBeFalse()
  })
})
