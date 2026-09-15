import { expect, spyOn, test } from "bun:test"
import { randomUUID } from "../src/lib/uuid"

test("UUID fallback uses secure bytes and sets RFC version/variant bits", () => {
  const original = Object.getOwnPropertyDescriptor(crypto, "randomUUID")
  Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true })
  const random = spyOn(crypto, "getRandomValues").mockImplementation((array) => {
    if (array instanceof Uint8Array) array.fill(255)
    return array
  })
  try {
    expect(randomUUID()).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff")
    expect(random).toHaveBeenCalledTimes(1)
  } finally {
    random.mockRestore()
    if (original) Object.defineProperty(crypto, "randomUUID", original)
    else Reflect.deleteProperty(crypto, "randomUUID")
  }
})

test("UUID helper uses the native secure-context implementation", () => {
  const native = spyOn(crypto, "randomUUID").mockReturnValue("01234567-89ab-4cde-8fab-0123456789ab")
  try {
    expect(randomUUID()).toBe("01234567-89ab-4cde-8fab-0123456789ab")
    expect(native).toHaveBeenCalledTimes(1)
  } finally { native.mockRestore() }
})
