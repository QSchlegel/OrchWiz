import { execFile as execFileCallback } from "node:child_process"
import { mkdir } from "node:fs/promises"
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFileCallback)

const MAX_OUTPUT_CHARS = 20_000
const MAX_BUFFER_BYTES = 8 * 1024 * 1024

export interface SkillListItem {
  name: string
  installed: boolean
}

export interface SkillInstallerExecutionResult {
  ok: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  error: string | null
  durationMs: number
  timedOut: boolean
}

export interface SkillListResult extends SkillInstallerExecutionResult {
  items: SkillListItem[]
}

export interface InstalledSkillRecord {
  name: string
  destination: string
}

export interface SkillInstallResult extends SkillInstallerExecutionResult {
  installed: InstalledSkillRecord[]
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function trimOutput(value: string): string {
  if (value.length <= MAX_OUTPUT_CHARS) {
    return value
  }

  const head = value.slice(0, MAX_OUTPUT_CHARS)
  return `${head}\n...[truncated ${value.length - MAX_OUTPUT_CHARS} chars]`
}

function skillImportTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.ORCHWIZ_SKILL_IMPORT_TIMEOUT_MS || "120000", 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 120000
  }
  return parsed
}

function sanitizeUserSegment(input: string): string {
  return input.trim().replace(/[^a-zA-Z0-9._-]/g, "_")
}

function codexHomeRoot(): string {
  const configured = process.env.ORCHWIZ_CODEX_HOME_ROOT?.trim()
  if (configured) {
    return resolve(configured)
  }

  return join(homedir(), ".orchwiz", "codex-home")
}

export function resolveCodexHomeForUser(userId: string): string {
  const userSegment = sanitizeUserSegment(userId)
  return join(codexHomeRoot(), userSegment)
}

export function resolveSkillRootForUser(userId: string): string {
  return join(resolveCodexHomeForUser(userId), "skills")
}

function skillInstallerScriptPath(fileName: string): string {
  return resolve(process.cwd(), "scripts", "skill-installer", fileName)
}

function tokenPatterns(): RegExp[] {
  return [
    /ghp_[A-Za-z0-9]{30,}/g,
    /github_pat_[A-Za-z0-9_]{20,}/g,
    /ghs_[A-Za-z0-9]{20,}/g,
    /Bearer\s+[A-Za-z0-9._-]{10,}/gi,
    /token=[A-Za-z0-9._-]{10,}/gi,
  ]
}

export function redactSensitiveOutput(input: string, extraSecrets: string[] = []): string {
  let output = input

  for (const secret of extraSecrets) {
    const normalized = secret.trim()
    if (!normalized || normalized.length < 4) {
      continue
    }

    output = output.replace(new RegExp(escapeRegExp(normalized), "g"), "[REDACTED_TOKEN]")
  }

  for (const pattern of tokenPatterns()) {
    output = output.replace(pattern, "[REDACTED_TOKEN]")
  }

  return output
}

export function parseInstalledSkillRecords(stdout: string): InstalledSkillRecord[] {
  const lines = stdout.split(/\r?\n/)
  const installed: InstalledSkillRecord[] = []

  for (const line of lines) {
    const match = line.match(/^Installed\s+(.+?)\s+to\s+(.+)$/)
    if (!match) {
      continue
    }

    installed.push({
      name: match[1].trim(),
      destination: match[2].trim(),
    })
  }

  return installed
}

async function executeInstallerScript(args: {
  userId: string
  scriptFileName: "list-skills.py" | "install-skill-from-github.py"
  scriptArgs: string[]
  githubTokenOverride?: string
}): Promise<SkillInstallerExecutionResult> {
  const startedAt = Date.now()
  const codexHome = resolveCodexHomeForUser(args.userId)
  const timeoutMs = skillImportTimeoutMs()

  await mkdir(codexHome, { recursive: true })

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CODEX_HOME: codexHome,
  }

  const tokenOverride = args.githubTokenOverride?.trim()
  if (tokenOverride) {
    env.GITHUB_TOKEN = tokenOverride
    env.GH_TOKEN = tokenOverride
  }

  try {
    const { stdout, stderr } = await execFileAsync(
      "python3",
      [skillInstallerScriptPath(args.scriptFileName), ...args.scriptArgs],
      {
        env,
        timeout: timeoutMs,
        maxBuffer: MAX_BUFFER_BYTES,
      },
    )

    return {
      ok: true,
      exitCode: 0,
      stdout: trimOutput(redactSensitiveOutput(stdout || "", tokenOverride ? [tokenOverride] : [])),
      stderr: trimOutput(redactSensitiveOutput(stderr || "", tokenOverride ? [tokenOverride] : [])),
      error: null,
      durationMs: Date.now() - startedAt,
      timedOut: false,
    }
  } catch (error) {
    const normalized = error as {
      code?: number | string
      stdout?: string
      stderr?: string
      message?: string
      signal?: string
      killed?: boolean
    }

    const exitCode = typeof normalized.code === "number" ? normalized.code : null
    const timedOut = normalized.signal === "SIGTERM" || normalized.killed === true

    return {
      ok: false,
      exitCode,
      stdout: trimOutput(redactSensitiveOutput(normalized.stdout || "", tokenOverride ? [tokenOverride] : [])),
      stderr: trimOutput(redactSensitiveOutput(normalized.stderr || "", tokenOverride ? [tokenOverride] : [])),
      error: normalized.message || "Installer command failed.",
      durationMs: Date.now() - startedAt,
      timedOut,
    }
  }
}

function parseSkillsJson(stdout: string): SkillListItem[] {
  const parsed = JSON.parse(stdout) as unknown
  if (!Array.isArray(parsed)) {
    throw new Error("Unexpected skills list response.")
  }

  return parsed
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => {
      const value = entry as Record<string, unknown>
      return {
        name: typeof value.name === "string" ? value.name : "",
        installed: value.installed === true,
      }
    })
    .filter((entry) => Boolean(entry.name))
}

export async function listCuratedSkills(args: {
  userId: string
  githubTokenOverride?: string
}): Promise<SkillListResult> {
  const result = await executeInstallerScript({
    userId: args.userId,
    scriptFileName: "list-skills.py",
    scriptArgs: ["--format", "json"],
    githubTokenOverride: args.githubTokenOverride,
  })

  if (!result.ok) {
    return {
      ...result,
      items: [],
    }
  }

  try {
    return {
      ...result,
      items: parseSkillsJson(result.stdout),
    }
  } catch (error) {
    return {
      ...result,
      ok: false,
      error: error instanceof Error ? error.message : "Failed to parse curated skills output.",
      items: [],
    }
  }
}

export async function listExperimentalSkills(args: {
  userId: string
  githubTokenOverride?: string
}): Promise<SkillListResult> {
  const result = await executeInstallerScript({
    userId: args.userId,
    scriptFileName: "list-skills.py",
    scriptArgs: ["--path", "skills/.experimental", "--format", "json"],
    githubTokenOverride: args.githubTokenOverride,
  })

  if (!result.ok) {
    return {
      ...result,
      items: [],
    }
  }

  try {
    return {
      ...result,
      items: parseSkillsJson(result.stdout),
    }
  } catch (error) {
    return {
      ...result,
      ok: false,
      error: error instanceof Error ? error.message : "Failed to parse experimental skills output.",
      items: [],
    }
  }
}

export async function installCuratedSkill(args: {
  userId: string
  skillSlug: string
  githubTokenOverride?: string
}): Promise<SkillInstallResult> {
  const result = await executeInstallerScript({
    userId: args.userId,
    scriptFileName: "install-skill-from-github.py",
    scriptArgs: ["--repo", "openai/skills", "--path", `skills/.curated/${args.skillSlug}`],
    githubTokenOverride: args.githubTokenOverride,
  })

  return {
    ...result,
    installed: parseInstalledSkillRecords(result.stdout),
  }
}

export async function installSkillFromGithubUrl(args: {
  userId: string
  githubUrl: string
  githubTokenOverride?: string
}): Promise<SkillInstallResult> {
  const result = await executeInstallerScript({
    userId: args.userId,
    scriptFileName: "install-skill-from-github.py",
    scriptArgs: ["--url", args.githubUrl],
    githubTokenOverride: args.githubTokenOverride,
  })

  return {
    ...result,
    installed: parseInstalledSkillRecords(result.stdout),
  }
}
