import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { AccessControlError } from "@/lib/security/access-control"
import { asNonEmptyString, readJsonBody } from "@/lib/shipyard/cloud/http"
import {
  checkManagedTunnelHealth,
  ensureManagedTunnel,
  startManagedTunnel,
  stopManagedTunnel,
} from "@/lib/shipyard/cloud/tunnel-manager"
import {
  resolveCloudSshPrivateKey,
  ShipyardCloudVaultError,
} from "@/lib/shipyard/cloud/vault"
import { requireShipyardRequestActor } from "@/lib/shipyard/request-actor"

export const dynamic = "force-dynamic"

function asAction(value: unknown): "start" | "stop" | "restart" | "ensure" | null {
  if (value === "start" || value === "stop" || value === "restart" || value === "ensure") {
    return value
  }
  return null
}

async function loadTunnelForActor(args: {
  tunnelId: string
  actorUserId: string
}) {
  return prisma.shipyardSshTunnel.findFirst({
    where: {
      id: args.tunnelId,
      userId: args.actorUserId,
      provider: "hetzner",
    },
  })
}

async function loadPrivateKeyForTunnel(args: {
  userId: string
  tunnel: {
    sshKeyId: string | null
  }
}) {
  if (!args.tunnel.sshKeyId) {
    return null
  }

  const key = await prisma.shipyardCloudSshKey.findFirst({
    where: {
      id: args.tunnel.sshKeyId,
      userId: args.userId,
      provider: "hetzner",
    },
  })

  if (!key) {
    return null
  }

  const privateKeyPem = await resolveCloudSshPrivateKey({
    userId: args.userId,
    provider: "hetzner",
    keyName: key.name,
    stored: key.privateKeyEnvelope,
  })

  return {
    key,
    privateKeyPem,
  }
}

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{ id: string }>
  },
) {
  try {
    const actor = await requireShipyardRequestActor(request)
    const params = await context.params
    const tunnelId = asNonEmptyString(params.id)
    if (!tunnelId) {
      return NextResponse.json({ error: "Invalid tunnel id" }, { status: 400 })
    }

    const body = await readJsonBody(request)
    const action = asAction(body.action)
    if (!action) {
      return NextResponse.json({ error: "action must be one of start|stop|restart|ensure" }, { status: 400 })
    }

    const tunnel = await loadTunnelForActor({
      tunnelId,
      actorUserId: actor.userId,
    })
    if (!tunnel) {
      return NextResponse.json({ error: "Tunnel not found" }, { status: 404 })
    }

    if (action === "stop") {
      const stopped = await stopManagedTunnel({
        pid: tunnel.pid,
        pidFile: tunnel.pidFile,
      })

      const updated = await prisma.shipyardSshTunnel.update({
        where: {
          id: tunnel.id,
        },
        data: {
          status: stopped.stopped ? "stopped" : "failed",
          pid: null,
          lastHealthCheck: new Date(),
          lastError: stopped.stopped ? null : "Failed to stop autossh process cleanly.",
        },
      })

      return NextResponse.json({
        provider: "hetzner",
        action,
        tunnel: {
          ...updated,
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
          lastHealthCheck: updated.lastHealthCheck?.toISOString() || null,
        },
      })
    }

    const keyMaterial = await loadPrivateKeyForTunnel({
      userId: actor.userId,
      tunnel,
    })
    if (!keyMaterial) {
      return NextResponse.json(
        {
          error: "Tunnel SSH key is missing.",
          code: "CLOUD_SSH_KEY_MISSING",
        },
        { status: 400 },
      )
    }

    if (action === "restart") {
      await stopManagedTunnel({
        pid: tunnel.pid,
        pidFile: tunnel.pidFile,
      })
    }

    let pid = tunnel.pid
    let pidFile = tunnel.pidFile
    let controlSocket = tunnel.controlSocket
    let keyFilePath = tunnel.keyFilePath
    let status: "running" | "failed" = "running"
    let lastError: string | null = null

    if (action === "start" || action === "restart") {
      const started = await startManagedTunnel({
        tunnelId: tunnel.id,
        localHost: tunnel.localHost,
        localPort: tunnel.localPort,
        remoteHost: tunnel.remoteHost,
        remotePort: tunnel.remotePort,
        sshHost: tunnel.sshHost,
        sshPort: tunnel.sshPort,
        sshUser: tunnel.sshUser,
        privateKeyPem: keyMaterial.privateKeyPem,
      })

      pid = started.pid
      pidFile = started.pidFile
      controlSocket = started.controlSocket
      keyFilePath = started.keyFilePath
    }

    if (action === "ensure") {
      const ensured = await ensureManagedTunnel({
        definition: {
          tunnelId: tunnel.id,
          localHost: tunnel.localHost,
          localPort: tunnel.localPort,
          remoteHost: tunnel.remoteHost,
          remotePort: tunnel.remotePort,
          sshHost: tunnel.sshHost,
          sshPort: tunnel.sshPort,
          sshUser: tunnel.sshUser,
          privateKeyPem: keyMaterial.privateKeyPem,
        },
        metadata: {
          pid: tunnel.pid,
          pidFile: tunnel.pidFile,
        },
      })

      pid = ensured.metadata.pid
      pidFile = ensured.metadata.pidFile
      controlSocket = ensured.metadata.controlSocket
      keyFilePath = ensured.metadata.keyFilePath
      if (!ensured.health.healthy) {
        status = "failed"
        lastError = ensured.health.message || "Tunnel ensure health check failed"
      }
    }

    const health = await checkManagedTunnelHealth({
      localHost: tunnel.localHost,
      localPort: tunnel.localPort,
      pid,
      pidFile,
    })

    if (!health.healthy) {
      status = "failed"
      lastError = health.message || "Tunnel health check failed"
    }

    const updated = await prisma.shipyardSshTunnel.update({
      where: {
        id: tunnel.id,
      },
      data: {
        status,
        pid,
        pidFile,
        controlSocket,
        keyFilePath,
        lastHealthCheck: new Date(),
        lastError,
      },
    })

    return NextResponse.json({
      provider: "hetzner",
      action,
      tunnel: {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        lastHealthCheck: updated.lastHealthCheck?.toISOString() || null,
      },
      health,
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    if (error instanceof ShipyardCloudVaultError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    console.error("Error handling Hetzner tunnel action:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
