import { prisma } from "../src/lib/prisma"
import { createShipyardUserApiKey } from "../src/lib/shipyard/user-api-keys"

const BASE_URL = (process.env.SHIPYARD_BASE_URL || "http://localhost:3000").replace(/\/+$/u, "")
const POLL_MS = 15_000
const TIMEOUT_MS = 15 * 60 * 1000

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
}

async function requestJson<T>(args: {
  method: "GET" | "POST" | "DELETE"
  path: string
  token: string
  body?: unknown
  timeoutMs?: number
}): Promise<{ status: number; json: T }> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), args.timeoutMs ?? 60_000)

  try {
    const response = await fetch(`${BASE_URL}${args.path}`, {
      method: args.method,
      headers: {
        Authorization: `Bearer ${args.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      signal: controller.signal,
      ...(args.body ? { body: JSON.stringify(args.body) } : {}),
    })

    let json: unknown = {}
    try {
      json = await response.json()
    } catch {
      json = {}
    }

    return {
      status: response.status,
      json: json as T,
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

async function main() {
  const latestShip = await prisma.agentDeployment.findFirst({
    where: { deploymentType: "ship" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      userId: true,
      status: true,
      deploymentProfile: true,
      createdAt: true,
    },
  })

  const latestUser = await prisma.user.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true },
  })

  const targetUserId = latestShip?.userId || latestUser?.id
  if (!targetUserId) {
    throw new Error("No user found to own the replacement ship.")
  }

  const generated = createShipyardUserApiKey()
  const apiKey = await prisma.shipyardApiKey.create({
    data: {
      userId: targetUserId,
      name: "codex-temp-replace-ship",
      keyId: generated.keyId,
      keyHash: generated.keyHash,
    },
    select: { id: true },
  })

  const token = generated.plaintextKey

  try {
    const deleteResponse = await requestJson<{
      matchedCount?: number
      deletedCount?: number
      deletedShipIds?: string[]
      error?: string
      code?: string
    }>({
      method: "DELETE",
      path: "/api/ship-yard/ships?confirm=delete-all",
      token,
    })

    if (deleteResponse.status !== 200) {
      throw new Error(`Delete failed (${deleteResponse.status}): ${JSON.stringify(deleteResponse.json)}`)
    }

    const stamp = new Date().toISOString().replace(/[^\d]/g, "").slice(0, 14)
    const shipName = `KubeView Ship ${stamp}`
    const nodeId = slugify(`kubeview-ship-${stamp}`)

    const launchResponse = await requestJson<{
      deployment?: { id?: string; status?: string; name?: string }
      error?: string
      code?: string
      details?: unknown
    }>({
      method: "POST",
      path: "/api/ship-yard/launch",
      token,
      timeoutMs: TIMEOUT_MS,
      body: {
        name: shipName,
        description: "Fresh ship deployment with kubeview enabled",
        nodeId,
        deploymentProfile: "local_starship_build",
        provisioningMode: "terraform_ansible",
        saneBootstrap: true,
        crewRoles: ["xo", "ops", "eng", "sec", "med", "cou"],
        config: {
          infrastructure: {
            kind: "kind",
            kubeContext: "kind-orchwiz",
            namespace: "orchwiz-starship",
            terraformWorkspace: "starship-local",
            terraformEnvDir: "infra/terraform/environments/starship-local",
            ansibleInventory: "infra/ansible/inventory/local.ini",
            ansiblePlaybook: "infra/ansible/playbooks/starship_local.yml",
          },
        },
      },
    })

    const deploymentId = launchResponse.json.deployment?.id
    if (!deploymentId) {
      throw new Error(`Launch did not return deployment id (${launchResponse.status}): ${JSON.stringify(launchResponse.json)}`)
    }

    const startedAt = Date.now()
    let finalStatus = launchResponse.json.deployment?.status || "unknown"

    while (Date.now() - startedAt < TIMEOUT_MS) {
      const statusResponse = await requestJson<{
        deployment?: { status?: string; id?: string; name?: string; metadata?: Record<string, unknown> }
        error?: string
      }>({
        method: "GET",
        path: `/api/ship-yard/status/${deploymentId}`,
        token,
      })

      finalStatus = statusResponse.json.deployment?.status || finalStatus
      if (finalStatus === "active" || finalStatus === "failed" || finalStatus === "inactive") {
        break
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_MS))
    }

    const createdShip = await prisma.agentDeployment.findUnique({
      where: { id: deploymentId },
      select: {
        id: true,
        name: true,
        status: true,
        metadata: true,
      },
    })

    const metadata = (createdShip?.metadata || {}) as Record<string, unknown>
    const kubeview = (metadata.kubeview || {}) as Record<string, unknown>

    console.log(JSON.stringify({
      ok: true,
      removedShip: latestShip ? {
        id: latestShip.id,
        name: latestShip.name,
        status: latestShip.status,
        deploymentProfile: latestShip.deploymentProfile,
      } : null,
      deleted: deleteResponse.json,
      newShip: {
        id: createdShip?.id || deploymentId,
        name: createdShip?.name,
        status: createdShip?.status || finalStatus,
      },
      kubeview: {
        enabled: kubeview.enabled ?? null,
        ingressEnabled: kubeview.ingressEnabled ?? null,
        url: kubeview.url ?? null,
        source: kubeview.source ?? null,
      },
    }, null, 2))
  } finally {
    await prisma.shipyardApiKey.update({
      where: { id: apiKey.id },
      data: { revokedAt: new Date(), name: "codex-temp-replace-ship-revoked" },
    })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
