import path from "node:path"
import { defineConfig, devices } from "@playwright/test"

const DEFAULT_BASE_URL = "http://127.0.0.1:3000"
const DEFAULT_REPORT_DIR = path.resolve(__dirname, "output/playwright")
const DEFAULT_TEST_DIR = path.resolve(__dirname, "tests/playwright")

type BotMode = "smoke" | "full" | "custom"

function parseBotMode(raw: string | undefined): BotMode {
  const value = raw?.trim().toLowerCase()
  if (value === "smoke" || value === "full" || value === "custom") {
    return value
  }

  return "smoke"
}

function normalizeBaseUrl(raw: string | undefined): string {
  const value = (raw || DEFAULT_BASE_URL).trim()
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`ORCHWIZ_BOT_BASE_URL is invalid: ${value}`)
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("ORCHWIZ_BOT_BASE_URL must use http or https.")
  }

  return parsed.toString().replace(/\/+$/u, "")
}

function resolveReportDir(raw: string | undefined): string {
  const value = (raw || DEFAULT_REPORT_DIR).trim()
  return path.resolve(__dirname, value)
}

const botMode = parseBotMode(process.env.PW_BOT_MODE)
const baseURL = normalizeBaseUrl(process.env.ORCHWIZ_BOT_BASE_URL)
const reportDir = resolveReportDir(process.env.PW_REPORT_DIR)

const isCI = process.env.CI === "1" || process.env.CI?.toLowerCase() === "true"

export default defineConfig({
  testDir: DEFAULT_TEST_DIR,
  expect: {
    toHaveScreenshot: {
      threshold: 0.015,
      maxDiffPixels: 500,
    },
  },
  timeout: 60_000,
  outputDir: path.join(reportDir, "artifacts"),
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: path.join(reportDir, "playwright-report") }],
    ["junit", { outputFile: path.join(reportDir, "junit.xml"), embedAnnotationsAsProperties: true }],
  ],
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  retries: isCI ? 2 : 1,
  fullyParallel: true,
  workers: isCI ? 1 : undefined,
  metadata: {
    botMode,
    baseURL,
    reportDir,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 960 },
      },
    },
  ],
})
