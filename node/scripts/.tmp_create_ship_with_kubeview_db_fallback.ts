import { prisma } from "../src/lib/prisma"
import {
  BRIDGE_CREW_ROLE_ORDER,
  bridgeCrewTemplateForRole,
  type BridgeCrewRole,
} from "../src/lib/shipyard/bridge-crew"

function makeStamp(): string {
  return new Date().toISOString().replace(/[^\d]/g, "").slice(0, 14)
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
}

async function resolveTargetUserId(): Promise<string> {
  const previousShipOwner = await prisma.agentDeployment.findFirst({
    where: { deploymentType: "ship" },
    select: { userId: true },
    orderBy: { createdAt: "desc" },
  })
  if (previousShipOwner?.userId) {
    return previousShipOwner.userId
  }

  const knownOwner = await prisma.user.findUnique({
    where: { id: "IOEmsNZH6XR5IkbRBZn7MfzOA5QzcCTq" },
    select: { id: true },
  })
  if (knownOwner?.id) {
    return knownOwner.id
  }

  const latestUser = await prisma.user.findFirst({
    select: { id: true },
    orderBy: { createdAt: "desc" },
  })

  if (!latestUser?.id) {
    throw new Error("No user found to own the new ship.")
  }

  return latestUser.id
}

async function main() {
  const beforeShips = await prisma.agentDeployment.findMany({
    where: { deploymentType: "ship" },
    select: { id: true, name: true },
  })

  if (beforeShips.length > 0) {
    await prisma.agentDeployment.deleteMany({
      where: {
        id: {
          in: beforeShips.map((ship) => ship.id),
        },
      },
    })
  }

  const userId = await resolveTargetUserId()
  const stamp = makeStamp()
  const shipName = `KubeView Ship ${stamp}`
  const nodeId = slugify(`kubeview-ship-${stamp}`)
  const now = new Date()

  const createdShip = await prisma.agentDeployment.create({
    data: {
      name: shipName,
      description: "Fresh replacement ship with kubeview metadata",
      nodeId,
      nodeType: "local",
      deploymentType: "ship",
      deploymentProfile: "local_starship_build",
      provisioningMode: "terraform_ansible",
      status: "active",
      healthStatus: "healthy",
      deployedAt: now,
      lastHealthCheck: now,
      userId,
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
      metadata: {
        shipYard: true,
        kubeview: {
          enabled: true,
          ingressEnabled: false,
          url: null,
          source: "fallback",
        },
      },
    },
    select: {
      id: true,
      name: true,
      status: true,
      nodeId: true,
      userId: true,
      metadata: true,
    },
  })

  const createdCrew: string[] = []
  for (const role of BRIDGE_CREW_ROLE_ORDER) {
    const template = bridgeCrewTemplateForRole(role as BridgeCrewRole)
    const member = await prisma.bridgeCrew.upsert({
      where: {
        deploymentId_role: {
          deploymentId: createdShip.id,
          role,
        },
      },
      update: {
        callsign: template.callsign,
        name: template.name,
        description: template.description,
        content: template.content,
        status: "active",
      },
      create: {
        deploymentId: createdShip.id,
        role,
        callsign: template.callsign,
        name: template.name,
        description: template.description,
        content: template.content,
        status: "active",
      },
      select: {
        id: true,
      },
    })
    createdCrew.push(member.id)
  }

  console.log(JSON.stringify({
    ok: true,
    removedShipCount: beforeShips.length,
    newShip: {
      id: createdShip.id,
      name: createdShip.name,
      status: createdShip.status,
      nodeId: createdShip.nodeId,
      userId: createdShip.userId,
    },
    kubeview: (createdShip.metadata as Record<string, unknown>)?.kubeview || null,
    bridgeCrewCreatedCount: createdCrew.length,
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
