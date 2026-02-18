import { expect, test } from "@playwright/test"

test.describe("Playwright bot visual checks", () => {
  test("homepage visual baseline capture/check", async ({ page }, testInfo) => {
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await page.setViewportSize({ width: 1440, height: 960 })
    await page.evaluate(() => {
      const style = document.createElement("style")
      style.textContent = `
        * {
          animation-duration: 0.01ms !important;
          animation-delay: 0ms !important;
          transition-duration: 0.01ms !important;
          transition-delay: 0ms !important;
        }
      `
      document.head.append(style)
    })

    const fs = await import("node:fs")

    const baselinePath = testInfo.snapshotPath("homepage.png")
    if (!fs.existsSync(baselinePath)) {
      const outputPath = testInfo.outputPath("homepage.png")
      await page.screenshot({ path: outputPath, fullPage: true })
      test.skip(true, `No baseline found at ${baselinePath}. Ran screenshot-only capture at ${outputPath}.`)
    }

    await expect(page).toHaveScreenshot("homepage.png", { fullPage: true })
  })
})
