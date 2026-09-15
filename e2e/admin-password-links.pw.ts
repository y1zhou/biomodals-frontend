import { expect, test } from "@playwright/test"

test("create and reset show each origin with its own copy control", async ({ page }) => {
  const user = { user_id: "created-user", email: "created@example.test", display_name: "Created User", is_admin: false, status: "pending_setup", active_job_limit: null, created_at: "2026-09-14T00:00:00Z" }
  const urls = ["https://example.test/set-password#token=fixture", "http://192.168.1.10/set-password#token=fixture"]
  const links = { password_links: urls, expires_at: "2026-09-14T01:00:00Z" }
  await page.addInitScript(() => {
    document.cookie = "biomodals-csrf=fixture; path=/"
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true })
    document.execCommand = (command) => command === "copy"
  })
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith("/auth/me")) return route.fulfill({ json: { user_id: "admin", display_name: "Admin", email: "admin@example.test", is_admin: true } })
    if (url.pathname.endsWith("/password-link")) return route.fulfill({ json: links })
    if (url.pathname.endsWith("/admin/users")) return route.fulfill({ json: route.request().method() === "POST" ? { ...links, user } : { users: [user], next_cursor: null } })
    return route.fulfill({ status: 404, json: { detail: "Not found" } })
  })
  await page.goto("/admin/users")
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(user.email)
  await page.getByRole("textbox", { name: "Display name", exact: true }).fill(user.display_name)
  await page.getByRole("button", { name: "Create", exact: true }).click()
  const dialog = page.getByRole("dialog")
  for (let index = 0; index < urls.length; index++) {
    await expect(dialog.getByRole("textbox").nth(index)).toHaveValue(urls[index]!)
    const row = dialog.getByRole("textbox").nth(index).locator("..")
    await row.getByRole("button", { name: "Copy", exact: true }).click()
    await expect(row.getByRole("button", { name: "Copied", exact: true })).toBeVisible()
  }
  await expect(dialog).toContainText("using any one invalidates all")
  await dialog.getByRole("button", { name: "Close", exact: true }).click()
  await expect(page.getByRole("textbox", { name: /Password link/ })).toHaveCount(0)
  await page.getByRole("button", { name: "Actions for Created User" }).click()
  await page.getByRole("menuitem", { name: "New password link" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Issue new link", exact: true }).click()
  await expect(dialog.getByRole("textbox").nth(0)).toHaveValue(urls[0]!)
  await expect(dialog.getByRole("textbox").nth(1)).toHaveValue(urls[1]!)
})
