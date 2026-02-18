import { expect, test } from "@playwright/test"

test.describe("Playwright bot full suite", () => {
  test("docs route supports internal anchor navigation", async ({ page }) => {
    await page.goto("/docs", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "What is OrchWiz" })).toBeVisible()

    const architectureLink = page.getByRole("link", { name: "Architecture at a glance" })
    await expect(architectureLink).toBeVisible()
    await architectureLink.click()
    await expect(page).toHaveURL(/#architecture$/)
    await expect(page.getByRole("heading", { name: "Architecture at a glance" })).toBeVisible()
  })

  test("open-source page supports filtering by text query", async ({ page }) => {
    await page.goto("/open-source", { waitUntil: "domcontentloaded" })

    const searchInput = page.getByPlaceholder("Search (e.g., next, prisma, fastapi)")
    await expect(searchInput).toBeVisible()
    await searchInput.fill("next")
    await expect(page.getByText("next", { exact: false })).toBeVisible()

    await page.getByRole("checkbox", { name: "Include dev" }).check()
    await expect(page.getByText("Built on open source")).toBeVisible()
  })

  test("login page reveals optional identity fields on email input", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible()

    const email = page.getByLabel("Email")
    await email.fill("orchwiz-bot@example.com")
    await expect(page.getByLabel("Display name")).toBeVisible()

    const displayName = page.getByLabel("Display name")
    await displayName.fill("OrchWiz Bot")
    await expect(page.getByRole("button", { name: "Create account with passkey" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Send magic link instead" })).toBeVisible()
  })

  test("public homepage navigation still reaches docs and return path", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" })
    const openSourceLink = page.getByRole("link", { name: "Join the bridge crew" })
    await expect(openSourceLink).toBeVisible()
    await openSourceLink.click()

    await expect(page).toHaveURL(/\/open-source$/)
    await expect(page.getByRole("heading", { name: /Built on open source/i })).toBeVisible()

    const backLink = page.getByRole("link", { name: "Back to landing page" })
    if (await backLink.isVisible()) {
      await backLink.click()
      await expect(page).toHaveURL("/")
    }
  })
})
