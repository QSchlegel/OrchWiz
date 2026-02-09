import { exec as execCallback } from "node:child_process"
import { existsSync, lstatSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { promisify } from "node:util"
import type { Command } from "@prisma/client"
import { evaluateCommandPermission, type PermissionDecision } from "./permissions"

const execAsync = promisify(execCallback)

export interface CommandExecutionResult {
  status: "completed" | "failed" | "blocked"
  output?: string
  error?: string
  durationMs: number
  permission: PermissionDecision
  metadata: Record<string, unknown>
}

function resolveCommandCwd(pathHint: string | null): string {
  if (!pathHint) {
    return process.cwd()
  }

  const absolutePath = isAbsolute(pathHint) ? pathHint : resolve(process.cwd(), pathHint)

  if (!existsSync(absolutePath)) {
    return process.cwd()
  }

  const stats = lstatSync(absolutePath)
  if (stats.isDirectory()) {
    return absolutePath
  }

  return dirname(absolutePath)
}

function localExecutionEnabled(): boolean {
  return process.env.ENABLE_LOCAL_COMMAND_EXECUTION === "true"
}

export async function executeCommandWithPolicy(command: Command): Promise<CommandExecutionResult> {
  const started = Date.now()

  const candidates = [command.name, command.path || "", command.scriptContent.split("\n")[0] || ""]
  const permission = await evaluateCommandPermission(candidates)

  if (!localExecutionEnabled()) {
    return {
      status: "blocked",
      durationMs: Date.now() - started,
      error: "Local command execution is disabled. Set ENABLE_LOCAL_COMMAND_EXECUTION=true to enable.",
      permission,
      metadata: {
        localExecutionEnabled: false,
      },
    }
  }

  if (!permission.allowed) {
    return {
      status: "blocked",
      durationMs: Date.now() - started,
      error: permission.reason,
      permission,
      metadata: {
        localExecutionEnabled: true,
      },
    }
  }

  const timeoutMs = Number.parseInt(process.env.LOCAL_COMMAND_TIMEOUT_MS || "120000", 10)
  const cwd = resolveCommandCwd(command.path)

  try {
    const { stdout, stderr } = await execAsync(command.scriptContent, {
      cwd,
      shell: process.env.COMMAND_EXECUTION_SHELL || "/bin/bash",
      timeout: Number.isFinite(timeoutMs) ? timeoutMs : 120000,
      maxBuffer: 2 * 1024 * 1024,
      env: process.env,
    })

    const output = [stdout, stderr].filter(Boolean).join("\n").trim()

    return {
      status: "completed",
      output,
      durationMs: Date.now() - started,
      permission,
      metadata: {
        cwd,
        timeoutMs,
      },
    }
  } catch (error) {
    const commandError = error as { stdout?: string; stderr?: string; message?: string }
    const output = [commandError.stdout, commandError.stderr].filter(Boolean).join("\n").trim()

    return {
      status: "failed",
      output,
      error: commandError.message || "Command execution failed.",
      durationMs: Date.now() - started,
      permission,
      metadata: {
        cwd,
        timeoutMs,
      },
    }
  }
}
