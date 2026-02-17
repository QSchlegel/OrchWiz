import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

import { chromium } from "playwright"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const NODE_DIR = path.resolve(__dirname, "..")
const REPO_DIR = path.resolve(NODE_DIR, "..")

const PORT = 3999
const BASE_URL = `http://127.0.0.1:${PORT}`

const OUTPUT_DIR = path.join(NODE_DIR, "output", "coin-toss")
const FRAMES_DIR = path.join(OUTPUT_DIR, "frames")

const OUT_GIF = path.join(NODE_DIR, "public", "brand", "coin-toss.gif")
const OUT_EMOJI_GIF = path.join(NODE_DIR, "public", "brand", "coin-toss-emoji.gif")

const FPS = 20
const DURATION_MS = 1600
const FRAME_COUNT = Math.max(2, Math.round((DURATION_MS / 1000) * FPS))

const CHROMIUM_ARGS = ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"]

function parseArgs(argv: string[]) {
  const out: Record<string, string> = {}
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]
    if (!current.startsWith("--")) continue
    const key = current.slice(2).trim()
    if (!key) continue
    const next = argv[index + 1]
    if (next && !next.startsWith("--")) {
      out[key] = next
      index += 1
      continue
    }
    out[key] = "true"
  }
  return out
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForOk(url: string, timeoutMs = 45_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { redirect: "manual" })
      if (res.ok) return
    } catch {
      // ignore transient connection failures while the server boots
    }
    await sleep(250)
  }
  throw new Error(`Timed out waiting for ${url}`)
}

async function resolveExistingBaseUrl() {
  const candidates = [PORT, 3000, 3001, 4000].map((port) => `http://127.0.0.1:${port}`)
  for (const baseUrl of candidates) {
    try {
      await waitForOk(`${baseUrl}/dev/coin-toss?capture=1`, 2_000)
      return baseUrl
    } catch {
      // keep searching
    }
  }
  throw new Error(
    [
      "Next dev appears to already be running (lock held), but no reachable dev server was found.",
      `Tried: ${candidates.join(", ")}`,
      "Either stop the running dev server (so the script can start its own), or pass --base-url=<url>.",
    ].join("\n"),
  )
}

async function ensurePlaywrightChromium() {
  try {
    const browser = await chromium.launch({ headless: true, args: CHROMIUM_ARGS })
    await browser.close()
  } catch (error: any) {
    const message = String(error?.message || error)
    if (!message.toLowerCase().includes("chromium")) {
      throw error
    }
    console.warn("Playwright Chromium missing; attempting install...")
    await new Promise<void>((resolve, reject) => {
      const proc = spawn("npx", ["playwright", "install", "chromium"], {
        cwd: NODE_DIR,
        stdio: "inherit",
      })
      proc.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`playwright install exited ${code}`))))
      proc.on("error", reject)
    })
  }
}

async function main() {
  fs.mkdirSync(FRAMES_DIR, { recursive: true })

  const args = parseArgs(process.argv.slice(2))
  const baseUrlOverride = args["base-url"]?.trim()

  const lockPath = path.join(NODE_DIR, ".next", "dev", "lock")
  const lockHeld = fs.existsSync(lockPath)

  let baseUrl = BASE_URL
  let server: ReturnType<typeof spawn> | null = null
  let spawnedServer = false

  if (baseUrlOverride) {
    baseUrl = baseUrlOverride
  } else if (lockHeld) {
    baseUrl = await resolveExistingBaseUrl()
  } else {
    console.log(`Starting dev server on ${baseUrl}...`)
    server = spawn("npm", ["run", "dev", "--", "--port", String(PORT), "--hostname", "127.0.0.1"], {
      cwd: NODE_DIR,
      stdio: "inherit",
      env: {
        ...process.env,
      },
    })
    spawnedServer = true
  }

  const shutdown = async () => {
    if (!spawnedServer || !server) return
    if (server.killed) return
    server.kill("SIGTERM")
  }

  process.on("SIGINT", () => void shutdown())
  process.on("SIGTERM", () => void shutdown())

  try {
    const captureUrl = `${baseUrl}/dev/coin-toss?capture=1`
    await waitForOk(captureUrl)
    await ensurePlaywrightChromium()

    const browser = await chromium.launch({ headless: true, args: CHROMIUM_ARGS })
    const context = await browser.newContext({
      viewport: { width: 480, height: 480 },
      deviceScaleFactor: 1,
    })
    const page = await context.newPage()

    console.log(`Capturing frames from ${captureUrl}...`)
    // Next dev keeps HMR connections open; "networkidle" can be flaky here.
    await page.goto(captureUrl, { waitUntil: "domcontentloaded" })
    await page.waitForFunction(() => (window as any).__owzCoinCapture?.ready === true, undefined, { timeout: 15_000 })

    const canvas = page.locator("canvas").first()

    for (let i = 0; i < FRAME_COUNT; i += 1) {
      const progress = FRAME_COUNT === 1 ? 1 : i / (FRAME_COUNT - 1)
      await page.evaluate((p) => (window as any).__owzCoinCapture.setProgress(p), progress)
      // Allow the GPU to flush the render before we snapshot.
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))

      const framePath = path.join(FRAMES_DIR, `frame-${String(i).padStart(3, "0")}.png`)
      await canvas.screenshot({ path: framePath })
    }

    await browser.close()

    const builderScript = path.join(__dirname, "coin-toss-gif-build.py")
    console.log("Building message GIF...")
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        "python3",
        [
          builderScript,
          "--frames",
          FRAMES_DIR,
          "--out",
          OUT_GIF,
          "--fps",
          String(FPS),
          "--colors",
          "96",
        ],
        {
          cwd: REPO_DIR,
          stdio: "inherit",
        },
      )
      proc.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`gif builder exited ${code}`))))
      proc.on("error", reject)
    })

    console.log("Building emoji GIF...")
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        "python3",
        [
          builderScript,
          "--frames",
          FRAMES_DIR,
          "--out",
          OUT_EMOJI_GIF,
          "--fps",
          String(FPS),
          "--colors",
          "48",
          "--emoji",
        ],
        {
          cwd: REPO_DIR,
          stdio: "inherit",
        },
      )
      proc.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`gif builder exited ${code}`))))
      proc.on("error", reject)
    })

    console.log(`\n✓ Wrote:\n- ${OUT_GIF}\n- ${OUT_EMOJI_GIF}\n`)
  } finally {
    await shutdown()
  }
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
