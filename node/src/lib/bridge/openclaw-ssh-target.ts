import { existsSync } from "node:fs"
import { resolve as resolvePath } from "node:path"
import type { BridgeStationKey } from "@/lib/bridge/stations"
import { resolveShipNamespace } from "@/lib/bridge/openclaw-runtime"
import { resolveRuntimeUiFromTerraform, type RuntimeUiTerraformResolution } from "@/lib/bridge/runtime-ui-hydration"
import {
  isLocalDeploymentProfile,
  normalizeInfrastructureInConfig,
  type DeploymentProfile,
} from "@/lib/deployment/profile"
import { prisma } from "@/lib/prisma"
import { commandExists as commandExistsOnPath } from "@/lib/shipyard/cloud/command-runtime"
import { readCloudProviderConfig } from "@/lib/shipyard/cloud/types"
import { resolveCloudSshPrivateKey } from "@/lib/shipyard/cloud/vault"

export type OpenClawSshResolutionStrategy =
  | "deployment_tunnel"
  | "metadata_tunnel"
  | "terraform_fallback"
  | "local_kubernetes_exec"

export type OpenClawSshResolutionCode =
  | "SSH_TTY_DISABLED"
  | "HOST_TOOLS_MISSING"
  | "SHIP_NOT_FOUND"
  | "NAMESPACE_UNRESOLVED"
  | "SSH_TARGET_UNRESOLVED"
  | "SSH_KEY_UNRESOLVED"
  | "SSH_KEY_NOT_FOUND"
  | "SSH_KEY_DECRYPT_FAILED"

export interface OpenClawSshTarget {
  strategy: OpenClawSshResolutionStrategy
  stationKey: BridgeStationKey
  shipDeploymentId: string
  namespace: string
  sshHost: string | null
  sshPort: number | null
  sshUser: string | null
  privateKeyPem: string | null
  remoteCommand: string
  commandPreview: string
}

export type OpenClawSshTargetResult =
  | {
      ok: true
      target: OpenClawSshTarget
    }
  | {
      ok: false
      status: number
      code: OpenClawSshResolutionCode
      detail: string
      suggestedActions: string[]
    }

interface OpenClawSshShipRecord {
  id: string
  status: "pending" | "deploying" | "active" | "inactive" | "failed" | "updating"
  deploymentProfile: DeploymentProfile
  config: unknown
  metadata: unknown
}

interface OpenClawSshTunnelRecord {
  id: string
  status: "stopped" | "starting" | "running" | "failed"
  sshHost: string
  sshPort: number
  sshUser: string
  sshKeyId: string | null
}

interface OpenClawSshKeyRecord {
  id: string
  name: string
  privateKeyEnvelope: unknown
}

export interface OpenClawSshTargetResolverDeps {
  listShips: (args: { userId: string }) => Promise<OpenClawSshShipRecord[]>
  listDeploymentTunnels: (args: {
    userId: string
    deploymentId: string
  }) => Promise<OpenClawSshTunnelRecord[]>
  findSshKey: (args: { userId: string; keyId: string }) => Promise<OpenClawSshKeyRecord | null>
  resolvePrivateKey: (args: {
    userId: string
    keyName: string
    stored: unknown
  }) => Promise<string>
  resolveTerraformRuntimeUi: (args: {
    repoRoot: string
    terraformEnvDir: string
    allowCommandExecution: boolean
  }) => Promise<RuntimeUiTerraformResolution | null>
  commandExists: (command: string) => boolean
  env: NodeJS.ProcessEnv
  cwd: () => string
}

interface ResolveOpenClawSshTargetArgs {
  userId: string
  stationKey: BridgeStationKey
  requestedShipDeploymentId?: string | null
}

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

function parseBooleanFlag(value: unknown): boolean | null {
  if (typeof value !== "string") {
    return null
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") {
    return true
  }
  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") {
    return false
  }
  return null
}

function isValidNamespace(value: string): boolean {
  return /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/u.test(value)
}

function normalizeSshHost(value: unknown): string | null {
  const host = asString(value)
  if (!host) {
    return null
  }

  if (/\s/u.test(host)) {
    return null
  }

  return host
}

function normalizeSshUser(value: unknown): string {
  const user = asString(value)
  if (!user || /\s/u.test(user)) {
    return "root"
  }

  return user
}

function normalizeSshPort(value: unknown, fallback = 22): number {
  const parsed = asNumber(value)
  if (parsed === null) {
    return fallback
  }

  const floored = Math.floor(parsed)
  if (floored < 1 || floored > 65535) {
    return fallback
  }

  return floored
}

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/gu, `'\\''`)}'`
}

function buildOpenClawShellBootstrapScript(stationKey: BridgeStationKey): string {
  return [
    "mkdir -p /tmp/owz-bin",
    "cat > /tmp/owz-bin/openclaw <<'OWZEOF'",
    "#!/bin/sh",
    "exec node /app/openclaw.mjs \"$@\"",
    "OWZEOF",
    "chmod +x /tmp/owz-bin/openclaw",
    "export PATH=\"/tmp/owz-bin:/usr/local/bin:/usr/bin:/bin\"",
    `export OPENCLAW_GATEWAY_URL="\${OPENCLAW_GATEWAY_URL:-ws://openclaw-${stationKey}:18789}"`,
    "export OPENCLAW_GATEWAY_TOKEN=\"${OPENCLAW_GATEWAY_TOKEN:-}\"",
    `export NO_PROXY="127.0.0.1,localhost,openclaw-${stationKey},.svc,\${NO_PROXY:-}"`,
    "export no_proxy=\"$NO_PROXY\"",
    "openclaw config set gateway.mode remote >/dev/null 2>&1 || true",
    "openclaw config set gateway.remote.url \"$OPENCLAW_GATEWAY_URL\" >/dev/null 2>&1 || true",
    "if [ -n \"${OPENCLAW_GATEWAY_TOKEN:-}\" ]; then openclaw config set gateway.remote.token \"$OPENCLAW_GATEWAY_TOKEN\" >/dev/null 2>&1 || true; fi",
    "openclaw gateway probe >/dev/null 2>&1 || true",
    "exec /bin/sh -i",
  ].join("\n")
}

function buildRemotePodShellCommand(args: {
  stationKey: BridgeStationKey
  namespace: string
  interactive: boolean
}): string {
  const ttyFlags = args.interactive ? "-it" : "-i"
  return [
    `kubectl -n ${args.namespace} exec ${ttyFlags} deployment/openclaw-${args.stationKey} -- /bin/sh -lc`,
    shellSingleQuote(buildOpenClawShellBootstrapScript(args.stationKey)),
  ].join(" ")
}

function isLocalCommandExecutionEnabled(env: NodeJS.ProcessEnv): boolean {
  return parseBooleanFlag(env.ENABLE_LOCAL_COMMAND_EXECUTION) === true
}

export function isBridgeSshTtyFeatureEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    parseBooleanFlag(env.ORCHWIZ_BRIDGE_SSH_TTY_ENABLED) === true
    || isLocalCommandExecutionEnabled(env)
  )
}

function resolveRepoRoot(cwd: string, explicitRepoRoot: string | null): string {
  if (explicitRepoRoot) {
    return resolvePath(explicitRepoRoot)
  }

  if (existsSync(resolvePath(cwd, "infra/terraform"))) {
    return cwd
  }

  const parent = resolvePath(cwd, "..")
  if (existsSync(resolvePath(parent, "infra/terraform"))) {
    return parent
  }

  return parent
}

function selectShip(args: {
  ships: OpenClawSshShipRecord[]
  requestedShipDeploymentId: string | null
}): OpenClawSshShipRecord | null {
  if (args.ships.length === 0) {
    return null
  }

  if (args.requestedShipDeploymentId) {
    const explicit = args.ships.find((ship) => ship.id === args.requestedShipDeploymentId)
    if (explicit) {
      return explicit
    }
  }

  return args.ships.find((ship) => ship.status === "active") || args.ships[0]
}

function preferredTunnel(tunnels: OpenClawSshTunnelRecord[]): OpenClawSshTunnelRecord | null {
  const running = tunnels.find((tunnel) => tunnel.status === "running" && normalizeSshHost(tunnel.sshHost))
  if (running) {
    return running
  }

  return tunnels.find((tunnel) => normalizeSshHost(tunnel.sshHost)) || null
}

function metadataTunnelFields(metadata: unknown): {
  sshHost: string | null
  sshPort: number
  sshUser: string
  sshKeyId: string | null
} {
  const root = asRecord(metadata)
  const tunnel = asRecord(root.tunnel)

  const sshHost =
    normalizeSshHost(tunnel.controlPlanePublicIp)
    || normalizeSshHost(tunnel.sshHost)
    || normalizeSshHost(tunnel.host)
    || normalizeSshHost(root.controlPlanePublicIp)

  return {
    sshHost,
    sshPort: normalizeSshPort(tunnel.sshPort, 22),
    sshUser: normalizeSshUser(tunnel.sshUser),
    sshKeyId: asString(tunnel.sshKeyId),
  }
}

async function resolvePrivateKeyMaterial(args: {
  deps: OpenClawSshTargetResolverDeps
  userId: string
  keyId: string | null
}): Promise<
  | {
      ok: true
      privateKeyPem: string
    }
  | {
      ok: false
      code: OpenClawSshResolutionCode
      detail: string
    }
> {
  if (!args.keyId) {
    return {
      ok: false,
      code: "SSH_KEY_UNRESOLVED",
      detail: "No SSH key is configured for this ship deployment.",
    }
  }

  const key = await args.deps.findSshKey({
    userId: args.userId,
    keyId: args.keyId,
  })
  if (!key) {
    return {
      ok: false,
      code: "SSH_KEY_NOT_FOUND",
      detail: `Configured SSH key ${args.keyId} was not found for this user.`,
    }
  }

  try {
    const privateKeyPem = await args.deps.resolvePrivateKey({
      userId: args.userId,
      keyName: key.name,
      stored: key.privateKeyEnvelope,
    })

    if (!asString(privateKeyPem)) {
      return {
        ok: false,
        code: "SSH_KEY_DECRYPT_FAILED",
        detail: "Resolved SSH private key is empty.",
      }
    }

    return {
      ok: true,
      privateKeyPem,
    }
  } catch (error) {
    return {
      ok: false,
      code: "SSH_KEY_DECRYPT_FAILED",
      detail:
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Failed to decrypt the configured SSH private key.",
    }
  }
}

function buildTarget(args: {
  strategy: OpenClawSshResolutionStrategy
  stationKey: BridgeStationKey
  shipDeploymentId: string
  namespace: string
  sshHost: string
  sshPort: number
  sshUser: string
  privateKeyPem: string
}): OpenClawSshTarget {
  const remoteCommand = buildRemotePodShellCommand({
    stationKey: args.stationKey,
    namespace: args.namespace,
    interactive: true,
  })
  const commandPreview = `ssh -tt -p ${args.sshPort} ${args.sshUser}@${args.sshHost} ${JSON.stringify(remoteCommand)}`

  return {
    strategy: args.strategy,
    stationKey: args.stationKey,
    shipDeploymentId: args.shipDeploymentId,
    namespace: args.namespace,
    sshHost: args.sshHost,
    sshPort: args.sshPort,
    sshUser: args.sshUser,
    privateKeyPem: args.privateKeyPem,
    remoteCommand,
    commandPreview,
  }
}

function buildLocalTarget(args: {
  stationKey: BridgeStationKey
  shipDeploymentId: string
  namespace: string
}): OpenClawSshTarget {
  const remoteCommand = buildRemotePodShellCommand({
    stationKey: args.stationKey,
    namespace: args.namespace,
    interactive: true,
  })

  return {
    strategy: "local_kubernetes_exec",
    stationKey: args.stationKey,
    shipDeploymentId: args.shipDeploymentId,
    namespace: args.namespace,
    sshHost: null,
    sshPort: null,
    sshUser: null,
    privateKeyPem: null,
    remoteCommand,
    commandPreview: remoteCommand,
  }
}

function toFailure(args: {
  status: number
  code: OpenClawSshResolutionCode
  detail: string
  suggestedActions: string[]
}): OpenClawSshTargetResult {
  return {
    ok: false,
    status: args.status,
    code: args.code,
    detail: args.detail,
    suggestedActions: args.suggestedActions,
  }
}

function defaultDeps(): OpenClawSshTargetResolverDeps {
  return {
    listShips: async ({ userId }) =>
      prisma.agentDeployment.findMany({
        where: {
          userId,
          deploymentType: "ship",
        },
        select: {
          id: true,
          status: true,
          deploymentProfile: true,
          config: true,
          metadata: true,
        },
        orderBy: {
          updatedAt: "desc",
        },
      }) as Promise<OpenClawSshShipRecord[]>,
    listDeploymentTunnels: async ({ userId, deploymentId }) =>
      prisma.shipyardSshTunnel.findMany({
        where: {
          userId,
          deploymentId,
          provider: "hetzner",
        },
        orderBy: {
          updatedAt: "desc",
        },
        select: {
          id: true,
          status: true,
          sshHost: true,
          sshPort: true,
          sshUser: true,
          sshKeyId: true,
        },
      }) as Promise<OpenClawSshTunnelRecord[]>,
    findSshKey: async ({ userId, keyId }) =>
      prisma.shipyardCloudSshKey.findFirst({
        where: {
          id: keyId,
          userId,
          provider: "hetzner",
        },
        select: {
          id: true,
          name: true,
          privateKeyEnvelope: true,
        },
      }) as Promise<OpenClawSshKeyRecord | null>,
    resolvePrivateKey: async ({ userId, keyName, stored }) =>
      resolveCloudSshPrivateKey({
        userId,
        provider: "hetzner",
        keyName,
        stored,
      }),
    resolveTerraformRuntimeUi: async ({ repoRoot, terraformEnvDir, allowCommandExecution }) =>
      resolveRuntimeUiFromTerraform({
        repoRoot,
        terraformEnvDir,
        allowCommandExecution,
      }),
    commandExists: (command) => commandExistsOnPath(command),
    env: process.env,
    cwd: () => process.cwd(),
  }
}

export async function resolveOpenClawSshTarget(
  args: ResolveOpenClawSshTargetArgs,
  deps: OpenClawSshTargetResolverDeps = defaultDeps(),
): Promise<OpenClawSshTargetResult> {
  if (!isBridgeSshTtyFeatureEnabled(deps.env)) {
    return toFailure({
      status: 403,
      code: "SSH_TTY_DISABLED",
      detail: "SSH console mode is disabled. Enable ORCHWIZ_BRIDGE_SSH_TTY_ENABLED=true or ENABLE_LOCAL_COMMAND_EXECUTION=true.",
      suggestedActions: [
        "Set ORCHWIZ_BRIDGE_SSH_TTY_ENABLED=true to enable SSH console mode.",
        "Or set ENABLE_LOCAL_COMMAND_EXECUTION=true for local workstation flows.",
      ],
    })
  }

  const ships = await deps.listShips({ userId: args.userId })
  const selectedShip = selectShip({
    ships,
    requestedShipDeploymentId: asString(args.requestedShipDeploymentId) || null,
  })

  if (!selectedShip) {
    return toFailure({
      status: 404,
      code: "SHIP_NOT_FOUND",
      detail: "No ship deployment is available for this user.",
      suggestedActions: ["Launch or activate a ship deployment before opening SSH console mode."],
    })
  }

  const normalized = normalizeInfrastructureInConfig(selectedShip.deploymentProfile, selectedShip.config)
  const namespaceCandidate = resolveShipNamespace(normalized.config, selectedShip.deploymentProfile)
  const namespace = asString(namespaceCandidate)
  if (!namespace || !isValidNamespace(namespace)) {
    return toFailure({
      status: 422,
      code: "NAMESPACE_UNRESOLVED",
      detail: "Unable to resolve a valid Kubernetes namespace for this ship.",
      suggestedActions: [
        "Set infrastructure.namespace in ship configuration.",
        "Verify deployment profile maps to an expected namespace.",
      ],
    })
  }

  const isLocalShip = isLocalDeploymentProfile(selectedShip.deploymentProfile)
  const requiredCommands = isLocalShip ? ["kubectl"] : ["ssh", "kubectl"]
  const missingCommands = requiredCommands.filter((command) => !deps.commandExists(command))
  if (missingCommands.length > 0) {
    return toFailure({
      status: 422,
      code: "HOST_TOOLS_MISSING",
      detail: `Required command(s) are missing on this host: ${missingCommands.join(", ")}.`,
      suggestedActions: [
        "Install required CLIs and ensure they are on PATH.",
        isLocalShip
          ? "For local ships, ensure kubectl can access your local cluster context."
          : "For cloud ships, ensure both ssh and kubectl are installed and available.",
      ],
    })
  }

  if (isLocalShip) {
    return {
      ok: true,
      target: buildLocalTarget({
        stationKey: args.stationKey,
        shipDeploymentId: selectedShip.id,
        namespace,
      }),
    }
  }

  const cloudProvider = readCloudProviderConfig(normalized.config)
  const configuredKeyId = cloudProvider?.sshKeyId || null

  const attemptErrors: string[] = []

  const tunnels = await deps.listDeploymentTunnels({
    userId: args.userId,
    deploymentId: selectedShip.id,
  })
  const deploymentTunnel = preferredTunnel(tunnels)
  if (deploymentTunnel) {
    const sshHost = normalizeSshHost(deploymentTunnel.sshHost)
    if (sshHost) {
      const keyMaterial = await resolvePrivateKeyMaterial({
        deps,
        userId: args.userId,
        keyId: deploymentTunnel.sshKeyId || configuredKeyId,
      })
      if (keyMaterial.ok) {
        return {
          ok: true,
          target: buildTarget({
            strategy: "deployment_tunnel",
            stationKey: args.stationKey,
            shipDeploymentId: selectedShip.id,
            namespace,
            sshHost,
            sshPort: normalizeSshPort(deploymentTunnel.sshPort, 22),
            sshUser: normalizeSshUser(deploymentTunnel.sshUser),
            privateKeyPem: keyMaterial.privateKeyPem,
          }),
        }
      }
      if (keyMaterial.ok === false) {
        attemptErrors.push(keyMaterial.detail)
      }
    } else {
      attemptErrors.push("Deployment tunnel is configured but sshHost is invalid.")
    }
  }

  const metadataTunnel = metadataTunnelFields(selectedShip.metadata)
  if (metadataTunnel.sshHost) {
    const keyMaterial = await resolvePrivateKeyMaterial({
      deps,
      userId: args.userId,
      keyId: metadataTunnel.sshKeyId || configuredKeyId,
    })
    if (keyMaterial.ok) {
      return {
        ok: true,
        target: buildTarget({
          strategy: "metadata_tunnel",
          stationKey: args.stationKey,
          shipDeploymentId: selectedShip.id,
          namespace,
          sshHost: metadataTunnel.sshHost,
          sshPort: metadataTunnel.sshPort,
          sshUser: metadataTunnel.sshUser,
          privateKeyPem: keyMaterial.privateKeyPem,
        }),
      }
    }
    if (keyMaterial.ok === false) {
      attemptErrors.push(keyMaterial.detail)
    }
  }

  if (isLocalCommandExecutionEnabled(deps.env)) {
    const repoRoot = resolveRepoRoot(deps.cwd(), asString(deps.env.ORCHWIZ_REPO_ROOT))
    const terraform = await deps.resolveTerraformRuntimeUi({
      repoRoot,
      terraformEnvDir: normalized.infrastructure.terraformEnvDir,
      allowCommandExecution: true,
    })

    const terraformHost = normalizeSshHost(terraform?.runtimeEdge.controlPlanePublicIp)
    if (terraformHost) {
      const terraformNamespaceCandidate = asString(terraform?.runtimeEdge.namespace)
      const terraformNamespace =
        terraformNamespaceCandidate && isValidNamespace(terraformNamespaceCandidate)
          ? terraformNamespaceCandidate
          : namespace

      const keyMaterial = await resolvePrivateKeyMaterial({
        deps,
        userId: args.userId,
        keyId: configuredKeyId,
      })
      if (keyMaterial.ok && terraformNamespace) {
        return {
          ok: true,
          target: buildTarget({
            strategy: "terraform_fallback",
            stationKey: args.stationKey,
            shipDeploymentId: selectedShip.id,
            namespace: terraformNamespace,
            sshHost: terraformHost,
            sshPort: 22,
            sshUser: "root",
            privateKeyPem: keyMaterial.privateKeyPem,
          }),
        }
      }

      if (keyMaterial.ok === false) {
        attemptErrors.push(keyMaterial.detail)
      }
    }
  }

  return toFailure({
    status: 422,
    code: "SSH_TARGET_UNRESOLVED",
    detail:
      attemptErrors[0]
      || "Unable to resolve a usable SSH target for this ship deployment.",
    suggestedActions: [
      "Verify Ship Yard cloud SSH key configuration (cloudProvider.sshKeyId).",
      "Ensure deployment-linked Hetzner tunnel records include sshHost and sshKeyId.",
      "If using terraform fallback, confirm outputs expose control_plane_public_ipv4.",
      "For local ships, use a local deployment profile so runtime SSH mode can run kubectl exec directly.",
    ],
  })
}
