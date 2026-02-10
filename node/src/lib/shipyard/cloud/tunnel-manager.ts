import { spawn } from "node:child_process"
import { access, chmod, mkdir, readFile, unlink, writeFile } from "node:fs/promises"
import net from "node:net"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

export interface ManagedTunnelDefinition {
  tunnelId: string
  localHost: string
  localPort: number
  remoteHost: string
  remotePort: number
  sshHost: string
  sshPort: number
  sshUser: string
  privateKeyPem: string
}

export interface ManagedTunnelRuntimeMetadata {
  pid: number
  pidFile: string
  controlSocket: string
  keyFilePath: string
  tunnelDir: string
}

export interface ManagedTunnelHealth {
  healthy: boolean
  processAlive: boolean
  portReachable: boolean
  message?: string
}

export interface TunnelManagerRuntime {
  mkdir: (path: string) => Promise<void>
  writeFile: (path: string, content: string) => Promise<void>
  chmod: (path: string, mode: number) => Promise<void>
  readFile: (path: string) => Promise<string>
  unlink: (path: string) => Promise<void>
  spawnDetached: (command: string, args: string[]) => Promise<number>
  processAlive: (pid: number) => boolean
  killProcess: (pid: number, signal: NodeJS.Signals) => void
  sleep: (ms: number) => Promise<void>
  isPortReachable: (host: string, port: number, timeoutMs?: number) => Promise<boolean>
}

const DEFAULT_TUNNEL_BASE_DIR = join(homedir(), ".orchwiz", "shipyard", "tunnels")
const DEFAULT_PORT_CHECK_TIMEOUT_MS = 750

function defaultRuntime(): TunnelManagerRuntime {
  return {
    mkdir: async (path) => {
      await mkdir(path, { recursive: true })
    },
    writeFile: async (path, content) => {
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, content, "utf8")
    },
    chmod: async (path, mode) => {
      await chmod(path, mode)
    },
    readFile: async (path) => {
      return readFile(path, "utf8")
    },
    unlink: async (path) => {
      await unlink(path)
    },
    spawnDetached: async (command, args) => {
      const child = spawn(command, args, {
        detached: true,
        stdio: "ignore",
      })
      child.unref()

      if (typeof child.pid !== "number" || child.pid <= 0) {
        throw new Error("Failed to start detached autossh process.")
      }

      return child.pid
    },
    processAlive: (pid) => {
      try {
        process.kill(pid, 0)
        return true
      } catch {
        return false
      }
    },
    killProcess: (pid, signal) => {
      process.kill(pid, signal)
    },
    sleep: async (ms) => {
      await new Promise((resolve) => {
        setTimeout(resolve, ms)
      })
    },
    isPortReachable: async (host, port, timeoutMs = DEFAULT_PORT_CHECK_TIMEOUT_MS) => {
      return new Promise((resolve) => {
        const socket = net.connect({ host, port })
        const onDone = (reachable: boolean) => {
          socket.removeAllListeners()
          socket.destroy()
          resolve(reachable)
        }

        socket.setTimeout(timeoutMs)
        socket.once("connect", () => onDone(true))
        socket.once("timeout", () => onDone(false))
        socket.once("error", () => onDone(false))
      })
    },
  }
}

function sanitizeTunnelSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "")
}

export function tunnelDirectory(tunnelId: string): string {
  const normalizedId = sanitizeTunnelSegment(tunnelId)
  if (!normalizedId) {
    throw new Error("Tunnel id is invalid.")
  }
  return join(DEFAULT_TUNNEL_BASE_DIR, normalizedId)
}

export function buildAutosshArgs(args: {
  definition: ManagedTunnelDefinition
  keyFilePath: string
  controlSocketPath: string
  knownHostsPath: string
}): string[] {
  const { definition } = args

  return [
    "-M",
    "0",
    "-N",
    "-o",
    "ExitOnForwardFailure=yes",
    "-o",
    "ServerAliveInterval=30",
    "-o",
    "ServerAliveCountMax=3",
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-o",
    `UserKnownHostsFile=${args.knownHostsPath}`,
    "-o",
    `ControlPath=${args.controlSocketPath}`,
    "-o",
    "ControlMaster=no",
    "-i",
    args.keyFilePath,
    "-p",
    String(definition.sshPort),
    "-L",
    `${definition.localHost}:${definition.localPort}:${definition.remoteHost}:${definition.remotePort}`,
    `${definition.sshUser}@${definition.sshHost}`,
  ]
}

async function readPidFromFile(path: string, runtime: TunnelManagerRuntime): Promise<number | null> {
  try {
    const value = (await runtime.readFile(path)).trim()
    if (!value) return null
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  } catch {
    return null
  }
}

export async function startManagedTunnel(
  definition: ManagedTunnelDefinition,
  runtime: TunnelManagerRuntime = defaultRuntime(),
): Promise<ManagedTunnelRuntimeMetadata> {
  const tunnelDir = tunnelDirectory(definition.tunnelId)
  const keyFilePath = join(tunnelDir, "id_ed25519")
  const pidFile = join(tunnelDir, "autossh.pid")
  const controlSocket = join(tunnelDir, "control.sock")
  const knownHostsPath = join(tunnelDir, "known_hosts")

  await runtime.mkdir(tunnelDir)
  await runtime.writeFile(keyFilePath, `${definition.privateKeyPem.trim()}\n`)
  await runtime.chmod(keyFilePath, 0o600)
  await runtime.writeFile(knownHostsPath, "")

  const args = buildAutosshArgs({
    definition,
    keyFilePath,
    controlSocketPath: controlSocket,
    knownHostsPath,
  })

  const pid = await runtime.spawnDetached("autossh", args)
  await runtime.writeFile(pidFile, `${pid}\n`)

  return {
    pid,
    pidFile,
    controlSocket,
    keyFilePath,
    tunnelDir,
  }
}

export async function stopManagedTunnel(
  metadata: {
    pid?: number | null
    pidFile?: string | null
  },
  runtime: TunnelManagerRuntime = defaultRuntime(),
): Promise<{ stopped: boolean; pid: number | null }> {
  const pidFromFile = metadata.pidFile ? await readPidFromFile(metadata.pidFile, runtime) : null
  const pid = metadata.pid || pidFromFile
  if (!pid) {
    return {
      stopped: true,
      pid: null,
    }
  }

  if (!runtime.processAlive(pid)) {
    if (metadata.pidFile) {
      await runtime.unlink(metadata.pidFile).catch(() => undefined)
    }
    return {
      stopped: true,
      pid,
    }
  }

  try {
    runtime.killProcess(pid, "SIGTERM")
  } catch {
    if (metadata.pidFile) {
      await runtime.unlink(metadata.pidFile).catch(() => undefined)
    }
    return {
      stopped: true,
      pid,
    }
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (!runtime.processAlive(pid)) {
      if (metadata.pidFile) {
        await runtime.unlink(metadata.pidFile).catch(() => undefined)
      }
      return {
        stopped: true,
        pid,
      }
    }
    await runtime.sleep(100)
  }

  try {
    runtime.killProcess(pid, "SIGKILL")
  } catch {
    // Process could have exited while escalating.
  }

  if (metadata.pidFile) {
    await runtime.unlink(metadata.pidFile).catch(() => undefined)
  }

  return {
    stopped: !runtime.processAlive(pid),
    pid,
  }
}

export async function checkManagedTunnelHealth(args: {
  localHost: string
  localPort: number
  pid?: number | null
  pidFile?: string | null
  runtime?: TunnelManagerRuntime
}): Promise<ManagedTunnelHealth> {
  const runtime = args.runtime || defaultRuntime()

  const pidFromFile = args.pidFile ? await readPidFromFile(args.pidFile, runtime) : null
  const pid = args.pid || pidFromFile
  const processAlive = Boolean(pid && runtime.processAlive(pid))
  const portReachable = processAlive
    ? await runtime.isPortReachable(args.localHost, args.localPort)
    : false

  if (processAlive && portReachable) {
    return {
      healthy: true,
      processAlive,
      portReachable,
    }
  }

  return {
    healthy: false,
    processAlive,
    portReachable,
    message: !processAlive
      ? "autossh process is not running"
      : `local tunnel endpoint ${args.localHost}:${args.localPort} is not reachable`,
  }
}

export async function ensureManagedTunnel(args: {
  definition: ManagedTunnelDefinition
  metadata: {
    pid?: number | null
    pidFile?: string | null
  }
  runtime?: TunnelManagerRuntime
}): Promise<{
  restarted: boolean
  metadata: ManagedTunnelRuntimeMetadata
  health: ManagedTunnelHealth
}> {
  const runtime = args.runtime || defaultRuntime()

  const initialHealth = await checkManagedTunnelHealth({
    localHost: args.definition.localHost,
    localPort: args.definition.localPort,
    pid: args.metadata.pid,
    pidFile: args.metadata.pidFile,
    runtime,
  })

  if (initialHealth.healthy) {
    const tunnelDirValue = tunnelDirectory(args.definition.tunnelId)
    const pid = args.metadata.pid || (args.metadata.pidFile
      ? await readPidFromFile(args.metadata.pidFile, runtime)
      : null)
    const resolvedPidFile = args.metadata.pidFile || join(tunnelDirValue, "autossh.pid")

    return {
      restarted: false,
      metadata: {
        pid: pid || 0,
        pidFile: resolvedPidFile,
        controlSocket: join(tunnelDirValue, "control.sock"),
        keyFilePath: join(tunnelDirValue, "id_ed25519"),
        tunnelDir: tunnelDirValue,
      },
      health: initialHealth,
    }
  }

  await stopManagedTunnel(
    {
      pid: args.metadata.pid,
      pidFile: args.metadata.pidFile,
    },
    runtime,
  )

  const metadata = await startManagedTunnel(args.definition, runtime)
  const health = await checkManagedTunnelHealth({
    localHost: args.definition.localHost,
    localPort: args.definition.localPort,
    pid: metadata.pid,
    pidFile: metadata.pidFile,
    runtime,
  })

  return {
    restarted: true,
    metadata,
    health,
  }
}

export async function tunnelRuntimeFilesExist(metadata: {
  pidFile?: string | null
  keyFilePath?: string | null
}): Promise<{
  pidFile: boolean
  keyFilePath: boolean
}> {
  const exists = async (path: string | null | undefined): Promise<boolean> => {
    if (!path) return false
    try {
      await access(path)
      return true
    } catch {
      return false
    }
  }

  const [pidFile, keyFilePath] = await Promise.all([
    exists(metadata.pidFile),
    exists(metadata.keyFilePath),
  ])

  return {
    pidFile,
    keyFilePath,
  }
}
