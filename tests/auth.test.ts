import { describe, expect, test } from "bun:test"

import { csrfToken, MissingCsrfError, readCookie } from "../src/api/client"
import { safeReturnTo } from "../src/auth-state"

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
