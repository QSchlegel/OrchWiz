import { readFile } from "node:fs/promises"
import { execFile } from "node:child_process"
import { join, resolve } from "node:path"
import { promisify } from "node:util"
import type { BridgeStationKey } from "@/lib/bridge/stations"

const execFileAsync = promisify(execFile)

export type RuntimeUiMetadataSource = "terraform_output" | "fallback"

export interface RuntimeUiBootstrapMetadata {
  openclaw: {
    urls: Partial<Record<BridgeStationKey, string>>
    source: RuntimeUiMetadataSource
  }
  kubeview: {
    url: string | null
    source: RuntimeUiMetadataSource
  }
  portForwardCommand: string | null
}

export interface RuntimeEdgeTerraformMetadata {
  kubeContext: string | null
  namespace: string | null
  serviceName: string | null
  port: number | null
  portForwardCommand: string | null
}

export interface RuntimeUiTerraformResolution {
  runtimeUi: RuntimeUiBootstrapMetadata
  runtimeEdge: RuntimeEdgeTerraformMetadata
  source: "terraform_state" | "terraform_output"
}

interface TerraformOutputEntry {
  value?: unknown
  sensitive?: boolean
  type?: unknown
}

type TerraformOutputShape = Record<string, TerraformOutputEntry>

const WINDOWS_ABSOLUTE_PATH_REGEX = /^[a-zA-Z]:[\\/]/u

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
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

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value.trim(), 10)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function isStationKey(value: string): value is BridgeStationKey {
  return (
    value === "xo"
    || value === "ops"
    || value === "eng"
    || value === "sec"
    || value === "med"
    || value === "cou"
  )
}

function fallbackRuntimeUiMetadata(): RuntimeUiBootstrapMetadata {
  return {
    openclaw: {
      urls: {},
      source: "fallback",
    },
    kubeview: {
      url: null,
      source: "fallback",
    },
    portForwardCommand: null,
  }
}

function sanitizeWorkspaceRelativePath(pathValue: string): string {
  const rawPath = pathValue.trim()
  if (!rawPath) {
    throw new Error("Path is required.")
  }

  if (rawPath.includes("\u0000")) {
    throw new Error("Invalid path.")
  }

  if (rawPath.startsWith("/") || rawPath.startsWith("\\") || WINDOWS_ABSOLUTE_PATH_REGEX.test(rawPath)) {
    throw new Error("Absolute paths are not allowed.")
  }

  const normalizedSlashes = rawPath.replaceAll("\\", "/")
  const trimmed = normalizedSlashes.replace(/^\.\/+/u, "").replace(/\/+$/u, "")
  const segments = trimmed.split("/")

  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    throw new Error("Path traversal is not allowed.")
  }

  return segments.join("/")
}

function parseTerraformOutputsFromState(raw: unknown): TerraformOutputShape | null {
  const record = asRecord(raw)

  const outputsCandidate = record.outputs
  if (outputsCandidate && typeof outputsCandidate === "object" && !Array.isArray(outputsCandidate)) {
    return outputsCandidate as TerraformOutputShape
  }

  const values = asRecord(record.values)
  const valuesOutputs = values.outputs
  if (valuesOutputs && typeof valuesOutputs === "object" && !Array.isArray(valuesOutputs)) {
    return valuesOutputs as TerraformOutputShape
  }

  return null
}

async function loadTerraformOutputs(args: {
  terraformEnvDirAbsolute: string
  allowCommandExecution: boolean
}): Promise<{ outputs: TerraformOutputShape; source: "terraform_state" | "terraform_output" } | null> {
  const statePath = join(args.terraformEnvDirAbsolute, "terraform.tfstate")
  try {
    const raw = await readFile(statePath, "utf8")
    const parsed = JSON.parse(raw) as unknown
    const outputs = parseTerraformOutputsFromState(parsed)
    if (outputs) {
      return { outputs, source: "terraform_state" }
    }
  } catch {
    // ignore
  }

  if (!args.allowCommandExecution) {
    return null
  }

  try {
    const result = await execFileAsync(
      "terraform",
      ["-chdir", args.terraformEnvDirAbsolute, "output", "-json"],
      {
        timeout: 90_000,
        maxBuffer: 2 * 1024 * 1024,
        env: process.env,
      },
    )
    const parsed = JSON.parse(result.stdout || "{}") as unknown
    const outputs = asRecord(parsed) as TerraformOutputShape
    if (Object.keys(outputs).length > 0) {
      return { outputs, source: "terraform_output" }
    }
  } catch {
    // ignore
  }

  return null
}

function parseStationUrlMap(value: unknown): Partial<Record<BridgeStationKey, string>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  const record = value as Record<string, unknown>
  const out: Partial<Record<BridgeStationKey, string>> = {}
  for (const [key, rawUrl] of Object.entries(record)) {
    const stationKey = key.trim().toLowerCase()
    if (!isStationKey(stationKey)) continue
    const url = asString(rawUrl)
    if (!url) continue
    out[stationKey] = url
  }
  return out
}

function getTerraformString(outputs: TerraformOutputShape, key: string): string | null {
  const entry = outputs[key]
  return entry ? asString(entry.value) : null
}

function getTerraformNumber(outputs: TerraformOutputShape, key: string): number | null {
  const entry = outputs[key]
  return entry ? asNumber(entry.value) : null
}

function resolveRuntimeUiMetadataFromOutputs(outputs: TerraformOutputShape): RuntimeUiBootstrapMetadata | null {
  const hasRuntimeUiOutputs =
    outputs.runtime_ui_openclaw_urls !== undefined
    || outputs.runtime_ui_kubeview_url !== undefined
    || outputs.runtime_edge_port_forward_command !== undefined

  if (!hasRuntimeUiOutputs) {
    return null
  }

  const openclawUrls = parseStationUrlMap(outputs.runtime_ui_openclaw_urls?.value)
  const kubeviewUrl = getTerraformString(outputs, "runtime_ui_kubeview_url")
  const portForwardCommand = getTerraformString(outputs, "runtime_edge_port_forward_command")

  return {
    openclaw: {
      urls: openclawUrls,
      source: "terraform_output",
    },
    kubeview: {
      url: kubeviewUrl,
      source: "terraform_output",
    },
    portForwardCommand: portForwardCommand || null,
  }
}

function resolveRuntimeEdgeMetadataFromOutputs(outputs: TerraformOutputShape): RuntimeEdgeTerraformMetadata {
  return {
    kubeContext: getTerraformString(outputs, "kube_context"),
    namespace: getTerraformString(outputs, "namespace"),
    serviceName: getTerraformString(outputs, "runtime_edge_service_name"),
    port: getTerraformNumber(outputs, "runtime_edge_port"),
    portForwardCommand: getTerraformString(outputs, "runtime_edge_port_forward_command"),
  }
}

export async function resolveRuntimeUiFromTerraform(args: {
  repoRoot: string
  terraformEnvDir: string
  allowCommandExecution?: boolean
}): Promise<RuntimeUiTerraformResolution | null> {
  const allowCommandExecution = args.allowCommandExecution ?? (process.env.ENABLE_LOCAL_COMMAND_EXECUTION === "true")

  let terraformEnvDirRelative: string
  try {
    terraformEnvDirRelative = sanitizeWorkspaceRelativePath(args.terraformEnvDir)
  } catch {
    return null
  }

  const terraformEnvDirAbsolute = resolve(args.repoRoot, terraformEnvDirRelative)
  const loaded = await loadTerraformOutputs({
    terraformEnvDirAbsolute,
    allowCommandExecution,
  })
  if (!loaded) {
    return null
  }

  const runtimeUi = resolveRuntimeUiMetadataFromOutputs(loaded.outputs) || fallbackRuntimeUiMetadata()
  const runtimeEdge = resolveRuntimeEdgeMetadataFromOutputs(loaded.outputs)

  // If Terraform doesn't have runtime UI outputs at all, skip hydration.
  if (runtimeUi.openclaw.source === "fallback" && runtimeUi.kubeview.source === "fallback" && !runtimeUi.portForwardCommand) {
    return null
  }

  return {
    runtimeUi,
    runtimeEdge,
    source: loaded.source,
  }
}

