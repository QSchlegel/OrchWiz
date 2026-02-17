import { app, BrowserWindow, dialog, shell } from "electron"
import crypto from "node:crypto"
import { spawn, type SpawnOptionsWithoutStdio } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"

const DOCKER_INSTALL_URL = "https://docs.docker.com/get-docker/"

const SERVER_HOSTNAME = "127.0.0.1"
const SERVER_PORT = 3000
const SERVER_URL = `http://${SERVER_HOSTNAME}:${SERVER_PORT}`

const POSTGRES_HOST = "127.0.0.1"
const POSTGRES_PORT = 5435
const POSTGRES_DB = "orchis"
const POSTGRES_USER = "orchwiz"
const POSTGRES_PASSWORD = "orchwiz_dev"
const DATABASE_URL = `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}?schema=public`

const COMPOSE_PROJECT = "orchwiz-desktop"

type ComposeCommand =
  | { bin: "docker"; baseArgs: ["compose"]; display: "docker compose" }
  | { bin: "docker-compose"; baseArgs: []; display: "docker-compose" }

type DesktopConfig = {
  betterAuthSecret: string
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

async function pathExists(p: string) {
  try {
    await fs.stat(p)
    return true
  } catch {
    return false
  }
}

async function runCommand(
  bin: string,
  args: string[],
  opts: SpawnOptionsWithoutStdio & { timeoutMs?: number } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      ...opts,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    })

    let stdout = ""
    let stderr = ""

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8")
    })

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8")
    })

    const timeout = typeof opts.timeoutMs === "number"
      ? setTimeout(() => {
        child.kill()
        resolve({ code: 124, stdout, stderr: `${stderr}\nTimed out after ${opts.timeoutMs}ms` })
      }, opts.timeoutMs)
      : null

    child.on("close", (code) => {
      if (timeout) clearTimeout(timeout)
      resolve({ code: typeof code === "number" ? code : 1, stdout, stderr })
    })

    child.on("error", (error) => {
      if (timeout) clearTimeout(timeout)
      resolve({ code: 1, stdout, stderr: `${stderr}\n${error instanceof Error ? error.message : String(error)}` })
    })
  })
}

async function detectDocker() {
  const result = await runCommand("docker", ["version"], { timeoutMs: 12_000 })
  if (result.code !== 0) {
    throw new Error(`Docker is not available (docker version failed).\n${result.stderr || result.stdout}`.trim())
  }
}

async function detectComposeCommand(): Promise<ComposeCommand> {
  const plugin = await runCommand("docker", ["compose", "version"], { timeoutMs: 10_000 })
  if (plugin.code === 0) {
    return { bin: "docker", baseArgs: ["compose"], display: "docker compose" }
  }

  const legacy = await runCommand("docker-compose", ["version"], { timeoutMs: 10_000 })
  if (legacy.code === 0) {
    return { bin: "docker-compose", baseArgs: [], display: "docker-compose" }
  }

  throw new Error(
    "Docker Compose is not available (tried `docker compose version` and `docker-compose version`).",
  )
}

function composeArgs(cmd: ComposeCommand, composeFile: string, rest: string[]) {
  const common = ["-p", COMPOSE_PROJECT, "-f", composeFile]
  return cmd.bin === "docker"
    ? [...cmd.baseArgs, ...common, ...rest]
    : [...common, ...rest]
}

function resolveBackendDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, ".backend-bundle")
  }
  // dev: desktop/dist/main.js -> desktop/.backend-bundle
  return path.resolve(__dirname, "..", ".backend-bundle")
}

function resolveComposeTemplatePath(): string {
  // Included via desktop/resources/** and readable from app.asar.
  return path.join(app.getAppPath(), "resources", "docker-compose.yml")
}

async function loadOrCreateConfig(userDataDir: string): Promise<DesktopConfig> {
  const configPath = path.join(userDataDir, "config.json")
  let current: Partial<DesktopConfig> = {}

  if (await pathExists(configPath)) {
    try {
      const raw = await fs.readFile(configPath, "utf8")
      current = (JSON.parse(raw) as Partial<DesktopConfig>) || {}
    } catch {
      current = {}
    }
  }

  const betterAuthSecret = asNonEmptyString(current.betterAuthSecret) || crypto.randomBytes(32).toString("hex")
  const nextConfig: DesktopConfig = { betterAuthSecret }

  await fs.mkdir(userDataDir, { recursive: true })
  await fs.writeFile(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8")

  return nextConfig
}

async function waitForPostgresReady(args: {
  composeCmd: ComposeCommand
  composeFile: string
  timeoutMs: number
}): Promise<void> {
  const startedAt = Date.now()
  for (;;) {
    const elapsed = Date.now() - startedAt
    if (elapsed > args.timeoutMs) {
      throw new Error("Postgres did not become ready in time.")
    }

    const probe = await runCommand(
      args.composeCmd.bin,
      composeArgs(args.composeCmd, args.composeFile, [
        "exec",
        "-T",
        "postgres",
        "pg_isready",
        "-U",
        POSTGRES_USER,
        "-d",
        POSTGRES_DB,
      ]),
      { timeoutMs: 5_000 },
    )

    if (probe.code === 0) {
      return
    }

    await sleep(900)
  }
}

async function waitForServerHealth(timeoutMs: number): Promise<void> {
  const startedAt = Date.now()

  for (;;) {
    const elapsed = Date.now() - startedAt
    if (elapsed > timeoutMs) {
      throw new Error("OrchWiz server did not become ready in time.")
    }

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 2_000)
      const response = await fetch(`${SERVER_URL}/api/health`, { signal: controller.signal })
      clearTimeout(timeout)

      if (response.ok) {
        return
      }
    } catch {
      // ignore and retry
    }

    await sleep(650)
  }
}

function renderBootstrapHtml(message: string) {
  const safe = message.replace(/</gu, "&lt;").replace(/>/gu, "&gt;")
  return `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>OrchWiz Desktop</title>
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        background: radial-gradient(1200px 800px at 20% 10%, rgba(16,185,129,0.22), transparent 55%),
                    radial-gradient(1000px 650px at 80% 40%, rgba(6,182,212,0.18), transparent 50%),
                    radial-gradient(900px 600px at 40% 90%, rgba(139,92,246,0.18), transparent 55%),
                    #05070c;
        color: #e2e8f0;
        display: grid;
        place-items: center;
        min-height: 100vh;
        padding: 32px;
      }
      .card {
        width: min(760px, 100%);
        border: 1px solid rgba(148,163,184,0.22);
        background: rgba(255,255,255,0.04);
        backdrop-filter: blur(14px);
        border-radius: 18px;
        padding: 24px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.45);
      }
      .title { font-size: 18px; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(94,234,212,0.95); }
      .status { margin-top: 14px; font-size: 15px; line-height: 1.55; color: rgba(226,232,240,0.9); }
      .hint { margin-top: 14px; font-size: 13px; color: rgba(148,163,184,0.9); }
      .bar { margin-top: 18px; height: 10px; border-radius: 999px; background: rgba(148,163,184,0.16); overflow: hidden; }
      .bar > div { height: 100%; width: 40%; background: linear-gradient(90deg, rgba(16,185,129,0.95), rgba(6,182,212,0.95)); animation: sweep 1.1s ease-in-out infinite; border-radius: 999px; }
      @keyframes sweep { 0% { transform: translateX(-70%); } 100% { transform: translateX(230%); } }
      code { color: rgba(226,232,240,0.95); }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="title">OrchWiz Desktop</div>
      <div class="status">${safe}</div>
      <div class="bar"><div></div></div>
      <div class="hint">This app will start Docker-managed Postgres, migrate the database, then launch the local server at <code>${SERVER_URL}</code>.</div>
    </div>
  </body>
</html>`)}`
}

let mainWindow: BrowserWindow | null = null
let backendProcess: ReturnType<typeof spawn> | null = null
let composeCmd: ComposeCommand | null = null
let composeFilePath: string | null = null
let isQuitting = false

async function shutdown() {
  if (backendProcess && backendProcess.exitCode === null) {
    backendProcess.kill()
  }
  backendProcess = null

  if (composeCmd && composeFilePath) {
    await runCommand(
      composeCmd.bin,
      composeArgs(composeCmd, composeFilePath, ["stop"]),
      { timeoutMs: 25_000 },
    ).catch(() => undefined)
  }
}

async function bootstrapAndLaunch(win: BrowserWindow) {
  win.loadURL(renderBootstrapHtml("Preparing local runtime..."))

  await detectDocker()
  composeCmd = await detectComposeCommand()

  const userDataDir = app.getPath("userData")
  const config = await loadOrCreateConfig(userDataDir)

  const composeTemplate = resolveComposeTemplatePath()
  if (!(await pathExists(composeTemplate))) {
    throw new Error(`Missing compose template: ${composeTemplate}`)
  }

  composeFilePath = path.join(userDataDir, "orchwiz-docker-compose.yml")
  await fs.copyFile(composeTemplate, composeFilePath)

  const backendDir = resolveBackendDir()
  if (!(await pathExists(backendDir))) {
    throw new Error(
      `Missing backend bundle at ${backendDir}.\nBuild it from the repo with: (cd desktop && npm run bundle:backend)`,
    )
  }

  win.loadURL(renderBootstrapHtml(`Starting Postgres via ${composeCmd.display}...`))
  const up = await runCommand(composeCmd.bin, composeArgs(composeCmd, composeFilePath, ["up", "-d"]), {
    timeoutMs: 120_000,
  })
  if (up.code !== 0) {
    throw new Error(`Failed to start Postgres.\n${up.stderr || up.stdout}`.trim())
  }

  win.loadURL(renderBootstrapHtml("Waiting for Postgres to become ready..."))
  await waitForPostgresReady({ composeCmd, composeFile: composeFilePath, timeoutMs: 150_000 })

  win.loadURL(renderBootstrapHtml("Applying database migrations..."))
  const prismaCli = path.join(backendDir, "node_modules", "prisma", "build", "index.js")
  if (!(await pathExists(prismaCli))) {
    throw new Error(`Missing Prisma CLI in backend bundle: ${prismaCli}`)
  }

  const migrate = await runCommand(
    process.execPath,
    ["--run-as-node", prismaCli, "migrate", "deploy"],
    {
      cwd: backendDir,
      env: {
        ...process.env,
        NODE_ENV: "production",
        DATABASE_URL,
        PRISMA_MIGRATE_SKIP_GENERATE: "true",
      },
      timeoutMs: 180_000,
    },
  )
  if (migrate.code !== 0) {
    throw new Error(`Prisma migrate deploy failed.\n${migrate.stderr || migrate.stdout}`.trim())
  }

  win.loadURL(renderBootstrapHtml("Launching OrchWiz server..."))
  const tsxCli = path.join(backendDir, "node_modules", "tsx", "dist", "cli.cjs")
  if (!(await pathExists(tsxCli))) {
    throw new Error(`Missing tsx CLI in backend bundle: ${tsxCli}`)
  }

  const serverEntrypoint = path.join(backendDir, "server.ts")
  if (!(await pathExists(serverEntrypoint))) {
    throw new Error(`Missing server entrypoint in backend bundle: ${serverEntrypoint}`)
  }

  backendProcess = spawn(
    process.execPath,
    [
      "--run-as-node",
      tsxCli,
      serverEntrypoint,
      "--",
      "--hostname",
      SERVER_HOSTNAME,
      "--port",
      String(SERVER_PORT),
    ],
    {
      cwd: backendDir,
      env: {
        ...process.env,
        NODE_ENV: "production",
        DATABASE_URL,
        BETTER_AUTH_SECRET: config.betterAuthSecret,
        BETTER_AUTH_URL: SERVER_URL,
        NEXT_PUBLIC_APP_URL: SERVER_URL,
        NEXT_PUBLIC_SITE_URL: SERVER_URL,
        // Desktop v1: keep the app self-contained (no extra sidecars by default).
        WALLET_ENCLAVE_ENABLED: "false",
        WALLET_ENCLAVE_REQUIRE_PRIVATE_MEMORY_ENCRYPTION: "false",
        TRACE_ENCRYPT_ENABLED: "false",
        TRACE_ENCRYPT_REQUIRED: "false",
        AGENT_LIGHTNING_ENABLED: "false",
      },
      stdio: "ignore",
      windowsHide: true,
    },
  )

  backendProcess.once("exit", (code) => {
    if (!isQuitting) {
      void dialog.showMessageBox({
        type: "error",
        title: "OrchWiz Desktop",
        message: "OrchWiz server exited unexpectedly.",
        detail: `Exit code: ${code ?? "unknown"}`,
      })
    }
  })

  win.loadURL(renderBootstrapHtml("Waiting for OrchWiz server to become ready..."))
  await waitForServerHealth(150_000)

  await win.loadURL(`${SERVER_URL}/`)
}

async function showBootstrapError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()
  const looksLikeDocker =
    lower.includes("docker is not available")
    || lower.includes("docker compose")
    || lower.includes("docker-compose")
    || lower.includes("requires docker")

  if (looksLikeDocker) {
    const result = await dialog.showMessageBox({
      type: "error",
      title: "Docker Required",
      message: "OrchWiz Desktop requires Docker to run locally.",
      detail: message,
      buttons: ["Install Docker", "Quit"],
      defaultId: 0,
      cancelId: 1,
    })

    if (result.response === 0) {
      await shell.openExternal(DOCKER_INSTALL_URL)
    }

    app.quit()
    return
  }

  await dialog.showMessageBox({
    type: "error",
    title: "OrchWiz Desktop",
    message: "Failed to start OrchWiz Desktop.",
    detail: message,
    buttons: ["Quit"],
  })
  app.quit()
}

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    title: "OrchWiz Desktop",
    backgroundColor: "#05070c",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  })

  win.on("closed", () => {
    if (mainWindow === win) {
      mainWindow = null
    }
  })

  return win
}

// `app.isQuitting` isn't official; we keep our own marker.
app.on("before-quit", () => {
  isQuitting = true
  void shutdown()
})

app.on("window-all-closed", () => {
  // macOS: keep the app open until explicit quit.
  if (process.platform !== "darwin") {
    app.quit()
  }
})

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createMainWindow()
    void bootstrapAndLaunch(mainWindow).catch(showBootstrapError)
  }
})

app.whenReady().then(() => {
  mainWindow = createMainWindow()
  void bootstrapAndLaunch(mainWindow).catch(showBootstrapError)
})
