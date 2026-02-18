import { execFile as execFileCallback } from "node:child_process"
import { dirname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { promisify } from "node:util"

const execFileAsync = promisify(execFileCallback)
const COMMAND_TIMEOUT_MS = 120_000

interface CommandSpec {
  label: string
  command: string
  args: string[]
  cwd?: string
}

function repoRootFromScript(): string {
  const scriptDir = dirname(fileURLToPath(import.meta.url))
  const nodeDir = resolve(scriptDir, "..")
  return resolve(nodeDir, "..")
}

async function runBestEffortCommand(spec: CommandSpec): Promise<void> {
  try {
    const { stdout, stderr } = await execFileAsync(spec.command, spec.args, {
      cwd: spec.cwd,
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: 4 * 1024 * 1024,
      env: process.env,
    })
    const output = [stdout || "", stderr || ""].join("\n").trim()
    if (output.length > 0) {
      console.log(`[cooldown] ${spec.label}: ${output}`)
    } else {
      console.log(`[cooldown] ${spec.label}: ok`)
    }
  } catch (error) {
    const commandError = error as {
      message?: string
      stdout?: string
      stderr?: string
      code?: number | string
    }
    const combined = [
      commandError.stdout || "",
      commandError.stderr || "",
      commandError.message || "",
    ].join("\n").toLowerCase()

    if (
      spec.command === "kind"
      && (
        combined.includes("no kind clusters found")
        || combined.includes("unknown cluster")
        || combined.includes("could not find cluster")
      )
    ) {
      console.log(`[cooldown] ${spec.label}: no cluster to delete`)
      return
    }

    if (commandError.code === "ENOENT") {
      console.warn(`[cooldown] ${spec.label}: '${spec.command}' not found`)
      return
    }

    console.warn(`[cooldown] ${spec.label}: ${(commandError.message || "command failed").trim()}`)
  }
}

async function main(): Promise<void> {
  const repoRoot = repoRootFromScript()
  const clusterName = process.env.LOCAL_SHIPYARD_KIND_CLUSTER_NAME?.trim() || "orchwiz"

  const commands: CommandSpec[] = [
    {
      label: `kind delete cluster (${clusterName})`,
      command: "kind",
      args: ["delete", "cluster", "--name", clusterName],
      cwd: repoRoot,
    },
    {
      label: "docker compose down (dev-local + control-plane overlay)",
      command: "docker",
      args: [
        "compose",
        "-f",
        "dev-local/docker-compose.yml",
        "-f",
        "dev-local/docker-compose.control-plane.yml",
        "down",
      ],
      cwd: repoRoot,
    },
    {
      label: "docker compose down (dev-local + ingest overlay)",
      command: "docker",
      args: [
        "compose",
        "-f",
        "dev-local/docker-compose.yml",
        "-f",
        "dev-local/docker-compose.ingest.llm-graph-builder.yml",
        "down",
      ],
      cwd: repoRoot,
    },
    {
      label: "docker compose down (cloudflare-local)",
      command: "docker",
      args: ["compose", "-f", "cloudflare-local/docker-compose.yml", "down"],
      cwd: repoRoot,
    },
  ]

  console.log("[cooldown] running best-effort local cooldown")
  for (const spec of commands) {
    await runBestEffortCommand(spec)
  }
  console.log("[cooldown] complete")
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(`[cooldown] fatal: ${(error as Error).message}`)
    process.exitCode = 1
  })
}
