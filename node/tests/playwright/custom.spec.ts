import { expect, test } from "@playwright/test"
import { parseTargetUrls } from "./_bot-shared"

const targetUrls = parseTargetUrls(process.env.PW_TARGET_URLS)
test.describe("Playwright bot custom runs", () => {
  if (targetUrls.length === 0) {
    test.skip(true, "PW_TARGET_URLS is empty. Set comma-separated URLs before running custom mode.")
  }

  for (const target of targetUrls) {
    test(`custom URL is reachable: ${target.url}`, async ({ page }) => {
      const response = await page.request.get(target.url)
      expect(response.ok()).toBeTruthy()

      await page.goto(target.url, { waitUntil: "domcontentloaded" })
      await expect(page.locator("body")).toBeVisible()
      await expect(page).toHaveTitle(/.+/)
    })
  }
})
