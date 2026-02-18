import { expect, test } from "@playwright/test"
import { normalizeBaseUrl } from "./_bot-shared"

const routes = ["/", "/docs", "/open-source", "/login"]
const baseUrl = normalizeBaseUrl(process.env.ORCHWIZ_BOT_BASE_URL)

test.describe("Playwright bot smoke suite", () => {
  test("critical public routes respond successfully", async ({ page }) => {
    for (const route of routes) {
      const fullUrl = route === "/" ? baseUrl : `${baseUrl}${route}`
      const response = await page.request.get(fullUrl)
      expect.soft(response.ok(), `${route} should return 2xx`).toBeTruthy()
    }
  })

  test("home route renders main hero copy", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: /OrchWiz/i })).toBeVisible()
    await expect(page.getByRole("link", { name: /Beam me up/i })).toBeVisible()
  })

  test("docs route renders overview heading", async ({ page }) => {
    await page.goto("/docs", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: /overview/i })).toBeVisible()
    await expect(page.getByRole("link", { name: "Back to landing" })).toBeVisible()
  })

  test("open-source page renders credits landing title", async ({ page }) => {
    await page.goto("/open-source", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: /Built on open source/i })).toBeVisible()
    await expect(page.getByRole("link", { name: "Back to landing" })).toBeVisible()
  })

  test("login page renders form shell", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible()
    await expect(page.getByLabel("Email")).toBeVisible()
  })
})
