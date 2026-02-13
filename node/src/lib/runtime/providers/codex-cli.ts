import { execFile as execFileCallback } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import type { RuntimeRequest, RuntimeResult } from "@/lib/types/runtime"
import {
  createNonRecoverableRuntimeError,
  createRecoverableRuntimeError,
  RuntimeProviderError,
} from "@/lib/runtime/errors"
import type { RuntimeProviderDefinition } from "@/lib/runtime/providers/types"
import { evaluateCommandPermission } from "@/lib/execution/permissions"

const execFileAsync = promisify(execFileCallback)

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

function codexProviderProxyUrl(): string | null {
  return asString(process.env.CODEX_PROVIDER_PROXY_URL)
}

function codexProviderProxyApiKey(): string | null {
  return asString(process.env.CODEX_PROVIDER_PROXY_API_KEY)
}

function normalizeProxyBaseUrl(value: string): string {
  return value.replace(/\/+$/u, "")
}

function resolveRuntimeIntelligenceModel(request: RuntimeRequest): string | null {
  const metadata = asRecord(request.metadata)
  const runtimeMetadata = asRecord(metadata.runtime)
  const intelligenceMetadata = asRecord(runtimeMetadata.intelligence)
  return asString(intelligenceMetadata.selectedModel) || asString(intelligenceMetadata.resolvedModel)
}

export function resolveCodexRuntimeModel(request: RuntimeRequest): string | null {
  return resolveRuntimeIntelligenceModel(request) || asString(process.env.CODEX_RUNTIME_MODEL)
}

function codexWorkspace(): string {
  return asString(process.env.CODEX_RUNTIME_WORKDIR) || process.cwd()
}

function quartermasterPolicyContext(request: RuntimeRequest): {
  enforcePolicy: boolean
  subagentId: string | null
} {
  const metadata = asRecord(request.metadata)
  const runtimeMetadata = asRecord(metadata.runtime)
  const quartermasterMetadata = asRecord(metadata.quartermaster)

  const runtimeProfile = asString(runtimeMetadata.profile)?.toLowerCase()
  const channel = asString(quartermasterMetadata.channel)

  const enforcePolicy = runtimeProfile === "quartermaster" || channel === "ship-quartermaster"
  const subagentId = asString(quartermasterMetadata.subagentId)

  return {
    enforcePolicy,
    subagentId,
  }
}

function buildCanonicalCommandCandidate(model: string | null): string {
  const base = "codex exec --sandbox read-only --skip-git-repo-check -C <workspace> --output-last-message <tmpfile>"
  if (!model) {
    return base
  }

  return `${base} -m <model>`
}

async function enforceQuartermasterPolicy(request: RuntimeRequest, model: string | null) {
  const context = quartermasterPolicyContext(request)
  if (!context.enforcePolicy) {
    return
  }

  if (!context.subagentId) {
    throw createNonRecoverableRuntimeError({
      provider: "codex-cli",
      code: "QUARTERMASTER_SUBAGENT_MISSING",
      status: 403,
      message: "Quartermaster runtime metadata is missing subagentId for policy evaluation.",
    })
  }

  const decision = await evaluateCommandPermission(
    [buildCanonicalCommandCandidate(model)],
    { subagentId: context.subagentId },
  )

  if (!decision.allowed) {
    throw createNonRecoverableRuntimeError({
      provider: "codex-cli",
      code: "QUARTERMASTER_POLICY_BLOCKED",
      status: 403,
      message: decision.reason,
      details: {
        decision,
      },
    })
  }
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

function classifyCodexExecFailure(error: unknown): RuntimeProviderError {
  const normalized = normalizeExecError(error)
  const code = normalized.code

  if (code === "ENOENT") {
    return createRecoverableRuntimeError({
      provider: "codex-cli",
      code: "CODEX_BINARY_NOT_FOUND",
      message: "Codex CLI binary was not found on PATH.",
      details: normalized,
    })
  }

  if (normalized.killed || normalized.signal === "SIGTERM") {
    return createRecoverableRuntimeError({
      provider: "codex-cli",
      code: "CODEX_TIMEOUT",
      message: "Codex CLI runtime invocation timed out.",
      details: normalized,
    })
  }

  if (typeof code === "number") {
    return createRecoverableRuntimeError({
      provider: "codex-cli",
      code: "CODEX_NON_ZERO_EXIT",
      message: `Codex CLI exited with status ${code}.`,
      details: normalized,
    })
  }

  return createRecoverableRuntimeError({
    provider: "codex-cli",
    code: "CODEX_EXEC_FAILED",
    message: `Codex CLI execution failed: ${String(normalized.message || "Unknown error")}`,
    details: normalized,
  })
}

async function runCodexCliRuntime(request: RuntimeRequest): Promise<RuntimeResult> {
  const model = resolveCodexRuntimeModel(request)
  await enforceQuartermasterPolicy(request, model)

  const proxyUrlRaw = codexProviderProxyUrl()
  if (proxyUrlRaw) {
    const apiKey = codexProviderProxyApiKey()
    if (!apiKey) {
      throw createRecoverableRuntimeError({
        provider: "codex-cli",
        code: "CODEX_PROVIDER_PROXY_API_KEY_MISSING",
        message: "CODEX_PROVIDER_PROXY_API_KEY is required when CODEX_PROVIDER_PROXY_URL is set.",
      })
    }

    const proxyUrl = normalizeProxyBaseUrl(proxyUrlRaw)
    const startedAt = Date.now()

    let response: Response
    try {
      response = await fetch(`${proxyUrl}/v1/orchwiz/runtime/codex-cli`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(request),
      })
    } catch (error) {
      throw createRecoverableRuntimeError({
        provider: "codex-cli",
        code: "CODEX_PROVIDER_PROXY_UNREACHABLE",
        message: `Codex provider proxy request failed: ${(error as Error).message || "Unknown error"}`,
        details: {
          proxyUrl,
        },
      })
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as Record<string, unknown>
      throw createRecoverableRuntimeError({
        provider: "codex-cli",
        code: "CODEX_PROVIDER_PROXY_HTTP_ERROR",
        message: `Codex provider proxy responded with status ${response.status}.`,
        details: {
          proxyUrl,
          payload,
        },
      })
    }

    const runtimeResult = await response.json().catch(() => ({})) as RuntimeResult
    if (!runtimeResult || typeof runtimeResult.output !== "string" || runtimeResult.output.trim().length === 0) {
      throw createRecoverableRuntimeError({
        provider: "codex-cli",
        code: "CODEX_PROVIDER_PROXY_INVALID_RESPONSE",
        message: "Codex provider proxy did not return a valid runtime result.",
        details: {
          proxyUrl,
          runtimeResult,
        },
      })
    }

    return {
      ...runtimeResult,
      provider: "codex-cli",
      metadata: {
        ...(runtimeResult.metadata || {}),
        proxyUrl,
        durationMs: (runtimeResult.metadata as Record<string, unknown> | undefined)?.durationMs || (Date.now() - startedAt),
      },
    }
  }

  const executable = codexCliPath()
  const workspace = codexWorkspace()
  const timeoutMs = codexTimeoutMs()
  const tempDir = await mkdtemp(join(tmpdir(), "orchwiz-codex-runtime-"))
  const outputPath = join(tempDir, "last-message.txt")

  const args = [
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
    args.push("-m", model)
  }

  args.push(request.prompt)

  const startedAt = Date.now()

  try {
    const { stdout, stderr } = await execFileAsync(executable, args, {
      timeout: timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
      env: process.env,
    })

    const output = await readLastMessage(outputPath, stdout)
    if (!output) {
      throw createRecoverableRuntimeError({
        provider: "codex-cli",
        code: "CODEX_EMPTY_OUTPUT",
        message: "Codex CLI did not produce a final output message.",
        details: {
          stdout,
          stderr,
        },
      })
    }

    return {
      provider: "codex-cli",
      output,
      fallbackUsed: false,
      metadata: {
        cliPath: executable,
        workspace,
        timeoutMs,
        durationMs: Date.now() - startedAt,
        model,
      },
    }
  } catch (error) {
    if (error instanceof RuntimeProviderError) {
      throw error
    }

    throw classifyCodexExecFailure(error)
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }
}

export const codexCliRuntimeProvider: RuntimeProviderDefinition = {
  id: "codex-cli",
  run: runCodexCliRuntime,
}
