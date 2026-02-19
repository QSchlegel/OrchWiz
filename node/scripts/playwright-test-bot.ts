import { spawn } from "node:child_process"
import { createWriteStream, mkdirSync, readFileSync, existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parseBotMode, normalizeBaseUrl, parseTargetUrls, resolveBotRunId } from "../tests/playwright/_bot-shared"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, "..")

const DEFAULT_BASE_URL = "http://127.0.0.1:3000"
const DEFAULT_REPORT_DIR = path.resolve(rootDir, "output/playwright")
type BotMode = "smoke" | "full" | "custom"
const DEFAULT_TEST_CMD = path.join(rootDir, "node_modules", ".bin", process.platform === "win32" ? "playwright.cmd" : "playwright")

function parseCliArgs(argv: string[]): { headed: boolean } {
  let headed = false
  for (const arg of argv) {
    if (arg === "--headed") {
      headed = true
    }
  }
  return { headed }
}

function parseMode(raw: string | undefined): BotMode {
  return parseBotMode(raw)
}

function normalizeReportDir(raw: string | undefined): string {
  const value = raw || DEFAULT_REPORT_DIR
  return path.resolve(rootDir, value)
}

function resolveTestFiles(mode: BotMode, targetCount: number): string[] {
  if (mode === "smoke") {
    return ["tests/playwright/smoke.spec.ts"]
  }

  if (mode === "custom") {
    if (targetCount === 0) {
      throw new Error("PW_TARGET_URLS is required when PW_BOT_MODE=custom.")
    }
    return ["tests/playwright/custom.spec.ts"]
  }

  return [
    "tests/playwright/full.spec.ts",
    "tests/playwright/visual.spec.ts",
    "tests/playwright/auth-passkey.spec.ts",
  ]
}

function parseJunitSummary(xmlPath: string): {
  total: number
  failed: number
  skipped: number
} {
  if (!existsSync(xmlPath)) {
    return { total: 0, failed: 0, skipped: 0 }
  }

  const xml = readFileSync(xmlPath, "utf8")
  const testsMatch = xml.match(/tests=["'](\d+)["']/)
  const failuresMatch = xml.match(/failures=["'](\d+)["']/)
  const skippedMatch = xml.match(/skipped=["'](\d+)["']/)

  return {
    total: testsMatch ? Number.parseInt(testsMatch[1], 10) : 0,
    failed: failuresMatch ? Number.parseInt(failuresMatch[1], 10) : 0,
    skipped: skippedMatch ? Number.parseInt(skippedMatch[1], 10) : 0,
  }
}

function formatArgs(args: {
  mode: BotMode
  headed: boolean
  targetCount: number
  ci: boolean
}): string[] {
  const baseArgs = ["test"]

  const targetCount = args.targetCount
  const files = resolveTestFiles(args.mode, targetCount)

  const finalArgs = [...baseArgs, ...files]

  if (args.headed) {
    finalArgs.push("--headed")
  }

  if (args.ci) {
    finalArgs.push("--max-failures=1")
  }

  return finalArgs
}

async function runPlaywright(cmd: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: rootDir,
      env,
      stdio: ["ignore", "inherit", "inherit"],
      shell: false,
    })

    child.on("error", (error) => {
      reject(error)
    })

    child.on("close", (code) => {
      resolve(code === null ? 1 : code)
    })
  })
}

function writeBotSummary(args: {
  mode: string
  baseUrl: string
  runId: string
  targetUrls: string[]
  reportDir: string
  command: string
  exitCode: number
  junit: { total: number; failed: number; skipped: number }
  startedAt: string
  completedAt: string
}) {
  const passed = Math.max(args.junit.total - args.junit.failed - args.junit.skipped, 0)
  const summary = {
    botMode: args.mode,
    baseUrl: args.baseUrl,
    runId: args.runId,
    targetCount: args.targetUrls.length,
    targetUrls: args.targetUrls,
    reportDir: args.reportDir,
    command: args.command,
    exitCode: args.exitCode,
    status: args.exitCode === 0 ? "passed" : "failed",
    startedAt: args.startedAt,
    completedAt: args.completedAt,
    summary: {
      total: args.junit.total,
      passed,
      failed: args.junit.failed,
      skipped: args.junit.skipped,
    },
    artifacts: {
      junit: path.join(args.reportDir, "junit.xml"),
      htmlReport: path.join(args.reportDir, "playwright-report"),
      summaryFile: path.join(args.reportDir, "bot-summary.json"),
      artifacts: path.join(args.reportDir, "artifacts"),
    },
  } as const

  const file = path.join(args.reportDir, "bot-summary.json")
  const stream = createWriteStream(file)
  stream.end(`${JSON.stringify(summary)}\n`)

  console.log(JSON.stringify(summary))

  return summary
}

async function main(): Promise<void> {
  const parsedArgs = parseCliArgs(process.argv.slice(2))
  const mode = parseMode(process.env.PW_BOT_MODE)
  const baseUrl = normalizeBaseUrl(process.env.ORCHWIZ_BOT_BASE_URL || DEFAULT_BASE_URL)
  const reportDir = normalizeReportDir(process.env.PW_REPORT_DIR)
  const runId = resolveBotRunId(process.env.PW_BOT_RUN_ID)
  const targetUrls = parseTargetUrls(process.env.PW_TARGET_URLS).map((entry) => entry.url)
  const isCi = process.env.CI === "1" || process.env.CI?.toLowerCase() === "true"
  const commandArgs = formatArgs({
    mode,
    headed: parsedArgs.headed,
    targetCount: targetUrls.length,
    ci: Boolean(isCi),
  })
  const command = `${DEFAULT_TEST_CMD} ${commandArgs.join(" ")}`

  mkdirSync(reportDir, { recursive: true })

  const startedAt = new Date().toISOString()
  const exitCode = await runPlaywright(DEFAULT_TEST_CMD, commandArgs, {
    ...process.env,
    PW_BOT_MODE: mode,
    ORCHWIZ_BOT_BASE_URL: baseUrl,
    PW_REPORT_DIR: reportDir,
    PW_BOT_RUN_ID: runId,
    PW_TARGET_URLS: targetUrls.join(","),
  })
  const completedAt = new Date().toISOString()

  const junit = parseJunitSummary(path.join(reportDir, "junit.xml"))
  writeBotSummary({
    mode,
    baseUrl,
    runId,
    targetUrls,
    reportDir,
    command,
    exitCode,
    junit,
    startedAt,
    completedAt,
  })

  process.exitCode = exitCode
}

if (import.meta.url === new URL(`file://${__filename}`).href) {
  void main().catch((error) => {
    const startedAt = new Date().toISOString()
    const reportDir = normalizeReportDir(process.env.PW_REPORT_DIR)
    const runId = resolveBotRunId(process.env.PW_BOT_RUN_ID)
    mkdirSync(reportDir, { recursive: true })

    const summary = {
      botMode: parseMode(process.env.PW_BOT_MODE),
      baseUrl: normalizeBaseUrl(process.env.ORCHWIZ_BOT_BASE_URL || DEFAULT_BASE_URL),
      runId,
      targetCount: parseTargetUrls(process.env.PW_TARGET_URLS).length,
      targetUrls: parseTargetUrls(process.env.PW_TARGET_URLS).map((entry) => entry.url),
      reportDir,
      command: "npx playwright test",
      exitCode: 1,
      status: "failed",
      startedAt,
      completedAt: new Date().toISOString(),
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
      },
      artifacts: {
        junit: path.join(reportDir, "junit.xml"),
        htmlReport: path.join(reportDir, "playwright-report"),
        summaryFile: path.join(reportDir, "bot-summary.json"),
        artifacts: path.join(reportDir, "artifacts"),
      },
    }
    createWriteStream(path.join(reportDir, "bot-summary.json")).end(`${JSON.stringify(summary)}\n`)
    console.error(`[playwright-test-bot] fatal: ${(error as Error).message}`)
    process.exitCode = 1
  })
}
