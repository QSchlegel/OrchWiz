import { execFile as execFileCallback } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFileCallback)

export interface RuntimeRequest {
  userId?: string
  sessionId: string
  prompt: string
  metadata?: Record<string, unknown>
}

export interface RuntimeResult {
  provider: "codex-cli"
  output: string
  fallbackUsed: boolean
  metadata?: Record<string, unknown>
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {}
  }
  return value as Record<string, unknown>
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeModelId(model: string | null | undefined): string | null {
  const raw = asString(model)
  if (!raw) {
    return null
  }

  // Allow "provider/model" style values; Codex CLI wants the model id.
  const slashIndex = raw.lastIndexOf("/")
  if (slashIndex >= 0 && slashIndex < raw.length - 1) {
    return raw.slice(slashIndex + 1).trim() || null
  }

  return raw
}

function codexCliPath(): string {
  return asString(process.env.CODEX_CLI_PATH) || "codex"
}

function codexTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.CODEX_RUNTIME_TIMEOUT_MS || "120000", 10)
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed
  }
  return 120000
}

function codexHome(): string {
  return asString(process.env.CODEX_HOME) || "/data/codex-home"
}

function codexWorkspace(): string {
  return asString(process.env.CODEX_RUNTIME_WORKDIR) || process.cwd()
}

function resolveRuntimeIntelligenceModel(request: RuntimeRequest): string | null {
  const metadata = asRecord(request.metadata)
  const runtimeMetadata = asRecord(metadata.runtime)
  const intelligenceMetadata = asRecord(runtimeMetadata.intelligence)
  return asString(intelligenceMetadata.selectedModel) || asString(intelligenceMetadata.resolvedModel)
}

export function resolveCodexRuntimeModel(request: RuntimeRequest): string | null {
  return normalizeModelId(resolveRuntimeIntelligenceModel(request) || asString(process.env.CODEX_RUNTIME_MODEL))
}

async function readLastMessage(outputPath: string, stdout: string): Promise<string | null> {
  const fileText = await readFile(outputPath, "utf8").catch(() => "")
  if (fileText.trim()) {
    return fileText.trim()
  }

  if (stdout.trim()) {
    return stdout.trim()
  }

  return null
}

function normalizeExecError(error: unknown): Record<string, unknown> {
  const runtimeError = error as {
    code?: string | number
    signal?: string
    killed?: boolean
    stdout?: string
    stderr?: string
    message?: string
  }

  return {
    code: runtimeError.code,
    signal: runtimeError.signal,
    killed: runtimeError.killed,
    stdout: runtimeError.stdout,
    stderr: runtimeError.stderr,
    message: runtimeError.message,
  }
}

export class CodexExecError extends Error {
  code: string
  status: number
  details?: Record<string, unknown>

  constructor(
    message: string,
    options: { code: string; status: number; details?: Record<string, unknown> },
  ) {
    super(message)
    this.name = "CodexExecError"
    this.code = options.code
    this.status = options.status
    this.details = options.details
  }
}

function classifyCodexExecFailure(error: unknown): CodexExecError {
  const normalized = normalizeExecError(error)
  const code = normalized.code

  if (code === "ENOENT") {
    return new CodexExecError("Codex CLI binary was not found on PATH.", {
      code: "CODEX_BINARY_NOT_FOUND",
      status: 503,
      details: normalized,
    })
  }

  if (normalized.killed || normalized.signal === "SIGTERM") {
    return new CodexExecError("Codex CLI runtime invocation timed out.", {
      code: "CODEX_TIMEOUT",
      status: 504,
      details: normalized,
    })
  }

  if (typeof code === "number") {
    return new CodexExecError(`Codex CLI exited with status ${code}.`, {
      code: "CODEX_NON_ZERO_EXIT",
      status: 502,
      details: normalized,
    })
  }

  return new CodexExecError(`Codex CLI execution failed: ${String(normalized.message || "Unknown error")}`, {
    code: "CODEX_EXEC_FAILED",
    status: 502,
    details: normalized,
  })
}

export async function runCodexExec(args: { request: RuntimeRequest; modelOverride?: string | null }): Promise<{
  output: string
  durationMs: number
  modelUsed: string | null
  cliPath: string
  workspace: string
  timeoutMs: number
}> {
  const request = args.request
  const model = normalizeModelId(args.modelOverride) || resolveCodexRuntimeModel(request)
  const executable = codexCliPath()
  const workspace = codexWorkspace()
  const timeoutMs = codexTimeoutMs()
  const tempDir = await mkdtemp(join(tmpdir(), "orchwiz-provider-proxy-codex-"))
  const outputPath = join(tempDir, "last-message.txt")
  const startedAt = Date.now()

  const argsList = [
    "exec",
    "--sandbox",
    "read-only",
    "--skip-git-repo-check",
    "-C",
    workspace,
    "--output-last-message",
    outputPath,
  ]

  if (model) {
    argsList.push("-m", model)
  }

  argsList.push(request.prompt)

  try {
    const { stdout, stderr } = await execFileAsync(executable, argsList, {
      timeout: timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
      env: {
        ...process.env,
        CODEX_HOME: codexHome(),
      },
    })

    const output = await readLastMessage(outputPath, stdout)
    if (!output) {
      throw new CodexExecError("Codex CLI did not produce a final output message.", {
        code: "CODEX_EMPTY_OUTPUT",
        status: 502,
        details: {
          stdout,
          stderr,
        },
      })
    }

    return {
      output,
      durationMs: Date.now() - startedAt,
      modelUsed: model,
      cliPath: executable,
      workspace,
      timeoutMs,
    }
  } catch (error) {
    if (error instanceof CodexExecError) {
      throw error
    }
    throw classifyCodexExecFailure(error)
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
  }
}
