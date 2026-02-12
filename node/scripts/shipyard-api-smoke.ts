import { pathToFileURL } from "node:url"

type AuthMode = "none" | "invalid" | "valid"

interface ParsedCliArgs {
  help: boolean
  json: boolean
  verbose: boolean
  baseUrl: string | null
  timeoutMs: number | null
}

interface RuntimeOptions {
  baseUrl: string
  timeoutMs: number
  json: boolean
  verbose: boolean
}

interface SmokeCheck {
  id: string
  method: "GET"
  path: string
  auth: AuthMode
  expectedStatus: number
  reason: string
  assertBody: (body: unknown) => boolean
}

interface RequestResult {
  status: number
  durationMs: number
  body: unknown
  rawBody: string
}

type CheckStatus = "passed" | "assertion_failed" | "runtime_error"

interface CheckResult {
  id: string
  method: "GET"
  path: string
  expectedStatus: number
  actualStatus: number | null
  reason: string
  durationMs: number | null
  status: CheckStatus
  message: string
  bodySnippet: string | null
}

function asNonEmptyString(value: string | undefined | null): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function parseTimeoutMs(value: string): number | null {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null
  }
  return parsed
}

function parseCliArgs(argv: string[]): ParsedCliArgs {
  let help = false
  let json = false
  let verbose = false
  let baseUrl: string | null = null
  let timeoutMs: number | null = null

  for (let idx = 0; idx < argv.length; idx += 1) {
    const arg = argv[idx]
    if (arg === "--help" || arg === "-h") {
      help = true
      continue
    }
    if (arg === "--json") {
      json = true
      continue
    }
    if (arg === "--verbose") {
      verbose = true
      continue
    }
    if (arg.startsWith("--base-url=")) {
      baseUrl = asNonEmptyString(arg.slice("--base-url=".length))
      continue
    }
    if (arg === "--base-url") {
      const next = asNonEmptyString(argv[idx + 1] || "")
      if (!next) {
        throw new Error("--base-url requires a value.")
      }
      baseUrl = next
      idx += 1
      continue
    }
    if (arg.startsWith("--timeout-ms=")) {
      timeoutMs = parseTimeoutMs(arg.slice("--timeout-ms=".length))
      if (timeoutMs === null) {
        throw new Error("--timeout-ms must be a positive integer.")
      }
      continue
    }
    if (arg === "--timeout-ms") {
      const next = argv[idx + 1]
      const parsed = parseTimeoutMs(next || "")
      if (parsed === null) {
        throw new Error("--timeout-ms requires a positive integer value.")
      }
      timeoutMs = parsed
      idx += 1
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return {
    help,
    json,
    verbose,
    baseUrl,
    timeoutMs,
  }
}

function normalizeBaseUrl(input: string): string {
  let parsed: URL
  try {
    parsed = new URL(input)
  } catch {
    throw new Error(`Invalid --base-url value: ${input}`)
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Base URL must use http or https.")
  }

  return parsed.toString().replace(/\/+$/u, "")
}

function buildRuntimeOptions(parsed: ParsedCliArgs): RuntimeOptions {
  const baseFromEnv = asNonEmptyString(process.env.SHIPYARD_BASE_URL)
  const baseUrl = normalizeBaseUrl(parsed.baseUrl || baseFromEnv || "http://localhost:3000")

  return {
    baseUrl,
    timeoutMs: parsed.timeoutMs ?? 10_000,
    json: parsed.json,
    verbose: parsed.verbose,
  }
}

function toBodySnippet(body: unknown, rawBody: string): string | null {
  if (rawBody.length > 0) {
    const compact = rawBody.replace(/\s+/gu, " ").trim()
    return compact.length > 280 ? `${compact.slice(0, 277)}...` : compact
  }

  if (body === null || body === undefined) {
    return null
  }

  try {
    const encoded = JSON.stringify(body)
    if (!encoded) return null
    return encoded.length > 280 ? `${encoded.slice(0, 277)}...` : encoded
  } catch {
    return null
  }
}

function unauthorizedPayload(body: unknown): boolean {
  if (!isRecord(body)) {
    return false
  }
  return body.code === "UNAUTHORIZED" || body.error === "Unauthorized"
}

function providersPayload(body: unknown): boolean {
  return isRecord(body) && Array.isArray(body.providers)
}

function credentialsPayload(body: unknown): boolean {
  return isRecord(body) && body.provider === "hetzner" && typeof body.configured === "boolean"
}

function sshKeysPayload(body: unknown): boolean {
  return isRecord(body) && body.provider === "hetzner" && Array.isArray(body.keys)
}

function selfHealPreferencesPayload(body: unknown): boolean {
  if (!isRecord(body) || !isRecord(body.preferences)) {
    return false
  }
  return (
    typeof body.preferences.enabled === "boolean"
    && typeof body.preferences.cooldownMinutes === "number"
  )
}

function selfHealRunPayload(body: unknown): boolean {
  return isRecord(body) && typeof body.status === "string" && Object.hasOwn(body, "run")
}

function selfHealRunsPayload(body: unknown): boolean {
  return isRecord(body) && Array.isArray(body.runs) && typeof body.total === "number"
}

function secretsPayload(profile: "local_starship_build" | "cloud_shipyard") {
  return (body: unknown): boolean => (
    isRecord(body)
    && body.deploymentProfile === profile
    && typeof body.exists === "boolean"
    && isRecord(body.template)
    && isRecord(body.snippets)
  )
}

const checks: SmokeCheck[] = [
  {
    id: "auth.none.providers",
    method: "GET",
    path: "/api/ship-yard/cloud/providers",
    auth: "none",
    expectedStatus: 401,
    reason: "Negative auth guard without bearer token.",
    assertBody: unauthorizedPayload,
  },
  {
    id: "auth.invalid.providers",
    method: "GET",
    path: "/api/ship-yard/cloud/providers",
    auth: "invalid",
    expectedStatus: 401,
    reason: "Negative auth guard with malformed/unknown bearer token.",
    assertBody: unauthorizedPayload,
  },
  {
    id: "providers.readiness",
    method: "GET",
    path: "/api/ship-yard/cloud/providers",
    auth: "valid",
    expectedStatus: 200,
    reason: "Provider readiness endpoint is reachable with user API key auth.",
    assertBody: providersPayload,
  },
  {
    id: "hetzner.credentials",
    method: "GET",
    path: "/api/ship-yard/cloud/providers/hetzner/credentials",
    auth: "valid",
    expectedStatus: 200,
    reason: "Hetzner credential summary endpoint is readable for key owner.",
    assertBody: credentialsPayload,
  },
  {
    id: "hetzner.ssh-keys",
    method: "GET",
    path: "/api/ship-yard/cloud/providers/hetzner/ssh-keys",
    auth: "valid",
    expectedStatus: 200,
    reason: "Hetzner SSH key list endpoint is readable for key owner.",
    assertBody: sshKeysPayload,
  },
  {
    id: "self-heal.preferences",
    method: "GET",
    path: "/api/ship-yard/self-heal/preferences",
    auth: "valid",
    expectedStatus: 200,
    reason: "Self-heal preference defaults are retrievable.",
    assertBody: selfHealPreferencesPayload,
  },
  {
    id: "self-heal.run",
    method: "GET",
    path: "/api/ship-yard/self-heal/run",
    auth: "valid",
    expectedStatus: 200,
    reason: "Self-heal run status endpoint is retrievable.",
    assertBody: selfHealRunPayload,
  },
  {
    id: "self-heal.runs",
    method: "GET",
    path: "/api/ship-yard/self-heal/runs",
    auth: "valid",
    expectedStatus: 200,
    reason: "Self-heal run list endpoint is retrievable.",
    assertBody: selfHealRunsPayload,
  },
  {
    id: "secrets.local",
    method: "GET",
    path: "/api/ship-yard/secrets?deploymentProfile=local_starship_build&includeValues=false",
    auth: "valid",
    expectedStatus: 200,
    reason: "Local profile secret template metadata is retrievable.",
    assertBody: secretsPayload("local_starship_build"),
  },
  {
    id: "secrets.cloud",
    method: "GET",
    path: "/api/ship-yard/secrets?deploymentProfile=cloud_shipyard&includeValues=false",
    auth: "valid",
    expectedStatus: 200,
    reason: "Cloud profile secret template metadata is retrievable.",
    assertBody: secretsPayload("cloud_shipyard"),
  },
]

async function performRequest(args: {
  url: string
  method: "GET"
  timeoutMs: number
  headers: Record<string, string>
}): Promise<{ ok: true; value: RequestResult } | { ok: false; error: string }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs)
  const startedAt = Date.now()

  try {
    const response = await fetch(args.url, {
      method: args.method,
      headers: args.headers,
      signal: controller.signal,
    })
    const rawBody = await response.text()
    let parsedBody: unknown = rawBody
    if (rawBody.length > 0) {
      try {
        parsedBody = JSON.parse(rawBody) as unknown
      } catch {
        parsedBody = rawBody
      }
    } else {
      parsedBody = null
    }

    return {
      ok: true,
      value: {
        status: response.status,
        durationMs: Date.now() - startedAt,
        body: parsedBody,
        rawBody,
      },
    }
  } catch (error) {
    const message = error instanceof Error
      ? error.name === "AbortError"
        ? `Request timed out after ${args.timeoutMs}ms`
        : error.message
      : String(error)
    return {
      ok: false,
      error: message,
    }
  } finally {
    clearTimeout(timeout)
  }
}

function requestHeaders(auth: AuthMode, validToken: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  }

  if (auth === "valid") {
    headers.Authorization = `Bearer ${validToken}`
    return headers
  }

  if (auth === "invalid") {
    headers.Authorization = "Bearer owz_shipyard_v1.invalid.invalid"
  }

  return headers
}

function printHelp(): void {
  console.log("Usage: npm run shipyard:smoke -- [--base-url=<url>] [--timeout-ms=<ms>] [--json] [--verbose]")
  console.log("")
  console.log("Required environment variables:")
  console.log("  SHIPYARD_BEARER_TOKEN      User Ship Yard API key (never printed in full)")
  console.log("")
  console.log("Optional environment variables:")
  console.log("  SHIPYARD_BASE_URL          Base URL (default: http://localhost:3000)")
  console.log("")
  console.log("Flags:")
  console.log("  --base-url <url>           Override SHIPYARD_BASE_URL")
  console.log("  --timeout-ms <ms>          Request timeout in milliseconds (default: 10000)")
  console.log("  --json                     Print machine-readable JSON summary")
  console.log("  --verbose                  Include response snippets for failed checks")
  console.log("  --help                     Show this message")
  console.log("")
  console.log("Exit codes:")
  console.log("  0                          All checks passed")
  console.log("  1                          One or more checks failed")
  console.log("  2                          Preflight/runtime configuration failure")
}

function summarizeExitCode(results: CheckResult[]): number {
  const hasRuntimeError = results.some((result) => result.status === "runtime_error")
  if (hasRuntimeError) {
    return 2
  }

  const hasFailures = results.some((result) => result.status !== "passed")
  if (hasFailures) {
    return 1
  }

  return 0
}

function joinUrl(baseUrl: string, path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  return `${baseUrl}${normalizedPath}`
}

async function runSmoke(options: RuntimeOptions, token: string): Promise<{
  results: CheckResult[]
  exitCode: number
}> {
  const results: CheckResult[] = []

  for (const check of checks) {
    const response = await performRequest({
      url: joinUrl(options.baseUrl, check.path),
      method: check.method,
      timeoutMs: options.timeoutMs,
      headers: requestHeaders(check.auth, token),
    })

    if (!response.ok) {
      results.push({
        id: check.id,
        method: check.method,
        path: check.path,
        expectedStatus: check.expectedStatus,
        actualStatus: null,
        reason: check.reason,
        durationMs: null,
        status: "runtime_error",
        message: response.error,
        bodySnippet: null,
      })
      continue
    }

    const statusMatches = response.value.status === check.expectedStatus
    const bodyMatches = check.assertBody(response.value.body)

    if (statusMatches && bodyMatches) {
      results.push({
        id: check.id,
        method: check.method,
        path: check.path,
        expectedStatus: check.expectedStatus,
        actualStatus: response.value.status,
        reason: check.reason,
        durationMs: response.value.durationMs,
        status: "passed",
        message: "OK",
        bodySnippet: null,
      })
      continue
    }

    const message = !statusMatches
      ? `Expected status ${check.expectedStatus}, received ${response.value.status}`
      : "Response body did not match expected shape"

    results.push({
      id: check.id,
      method: check.method,
      path: check.path,
      expectedStatus: check.expectedStatus,
      actualStatus: response.value.status,
      reason: check.reason,
      durationMs: response.value.durationMs,
      status: "assertion_failed",
      message,
      bodySnippet: toBodySnippet(response.value.body, response.value.rawBody),
    })
  }

  return {
    results,
    exitCode: summarizeExitCode(results),
  }
}

function printTextReport(args: {
  options: RuntimeOptions
  results: CheckResult[]
  exitCode: number
}): void {
  const { options, results, exitCode } = args
  console.log(`[shipyard:smoke] baseUrl=${options.baseUrl}`)
  console.log("[shipyard:smoke] token=[redacted]")
  console.log("")

  for (const result of results) {
    const prefix = result.status === "passed" ? "PASS" : result.status === "runtime_error" ? "ERR" : "FAIL"
    const durationLabel = result.durationMs === null ? "n/a" : `${result.durationMs}ms`
    const actualStatus = result.actualStatus === null ? "n/a" : String(result.actualStatus)
    console.log(
      `${prefix} ${result.method} ${result.path} expected=${result.expectedStatus} actual=${actualStatus} duration=${durationLabel}`,
    )

    if (result.status !== "passed") {
      console.log(`  reason: ${result.reason}`)
      console.log(`  issue: ${result.message}`)
      if (options.verbose && result.bodySnippet) {
        console.log(`  response: ${result.bodySnippet}`)
      }
    }
  }

  const passed = results.filter((result) => result.status === "passed").length
  const failed = results.filter((result) => result.status !== "passed").length
  const runtimeErrors = results.filter((result) => result.status === "runtime_error").length

  console.log("")
  console.log(
    `[shipyard:smoke] summary total=${results.length} passed=${passed} failed=${failed} runtime_errors=${runtimeErrors}`,
  )
  console.log(`[shipyard:smoke] exit_code=${exitCode}`)
}

function printJsonReport(args: {
  options: RuntimeOptions
  results: CheckResult[]
  exitCode: number
}): void {
  const { options, results, exitCode } = args
  const report = {
    baseUrl: options.baseUrl,
    tokenProvided: true,
    summary: {
      total: results.length,
      passed: results.filter((result) => result.status === "passed").length,
      failed: results.filter((result) => result.status !== "passed").length,
      runtimeErrors: results.filter((result) => result.status === "runtime_error").length,
      exitCode,
    },
    checks: results,
  }

  console.log(JSON.stringify(report, null, 2))
}

async function main(): Promise<void> {
  const parsed = parseCliArgs(process.argv.slice(2))
  if (parsed.help) {
    printHelp()
    return
  }

  const token = asNonEmptyString(process.env.SHIPYARD_BEARER_TOKEN)
  if (!token) {
    console.error("SHIPYARD_BEARER_TOKEN is required.")
    console.error("Example: SHIPYARD_BEARER_TOKEN=owz_shipyard_v1.<keyId>.<secret> npm run shipyard:smoke")
    process.exitCode = 2
    return
  }

  const options = buildRuntimeOptions(parsed)
  const { results, exitCode } = await runSmoke(options, token)

  if (options.json) {
    printJsonReport({
      options,
      results,
      exitCode,
    })
  } else {
    printTextReport({
      options,
      results,
      exitCode,
    })
  }

  process.exitCode = exitCode
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[shipyard:smoke] fatal: ${message}`)
    process.exitCode = 2
  })
}
