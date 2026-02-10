import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { AccessControlError, requireAccessActor } from "@/lib/security/access-control"
import {
  asNonEmptyString,
  asNumber,
  readJsonBody,
} from "@/lib/shipyard/cloud/http"
import { checkManagedTunnelHealth } from "@/lib/shipyard/cloud/tunnel-manager"

export const dynamic = "force-dynamic"

function normalizePort(value: unknown, fallback: number): number {
  const parsed = asNumber(value)
  if (parsed === null) return fallback
  const floored = Math.floor(parsed)
  if (floored < 1 || floored > 65_535) return fallback
  return floored
}

export async function GET() {
  try {
    const actor = await requireAccessActor()

    const tunnels = await prisma.shipyardSshTunnel.findMany({
      where: {
        userId: actor.userId,
        provider: "hetzner",
      },
      orderBy: {
        updatedAt: "desc",
      },
      select: {
        id: true,
        deploymentId: true,
        provider: true,
        name: true,
        status: true,
        localHost: true,
        localPort: true,
        remoteHost: true,
        remotePort: true,
        sshHost: true,
        sshPort: true,
        sshUser: true,
        sshKeyId: true,
        pid: true,
        pidFile: true,
        controlSocket: true,
        keyFilePath: true,
        lastHealthCheck: true,
        lastError: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    const hydrated = await Promise.all(
      tunnels.map(async (tunnel) => {
        const health = tunnel.status === "running"
          ? await checkManagedTunnelHealth({
              localHost: tunnel.localHost,
              localPort: tunnel.localPort,
              pid: tunnel.pid,
              pidFile: tunnel.pidFile,
            })
          : null

        return {
          ...tunnel,
          createdAt: tunnel.createdAt.toISOString(),
          updatedAt: tunnel.updatedAt.toISOString(),
          lastHealthCheck: tunnel.lastHealthCheck?.toISOString() || null,
          health,
        }
      }),
    )

    const summary = {
      total: hydrated.length,
      running: hydrated.filter((entry) => entry.status === "running").length,
      failed: hydrated.filter((entry) => entry.status === "failed").length,
      healthyRunning: hydrated.filter((entry) => entry.health?.healthy === true).length,
      unhealthyRunning: hydrated.filter((entry) => entry.health?.healthy === false).length,
    }

    return NextResponse.json({
      provider: "hetzner",
      summary,
      tunnels: hydrated,
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    console.error("Error listing Hetzner tunnels:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAccessActor()
    const body = await readJsonBody(request)

    const id = asNonEmptyString(body.id)
    const name = asNonEmptyString(body.name) || "kubernetes-api"
    const deploymentId = asNonEmptyString(body.deploymentId)
    const sshHost = asNonEmptyString(body.sshHost)
    const remoteHost = asNonEmptyString(body.remoteHost)
    const sshKeyId = asNonEmptyString(body.sshKeyId)

    if (!sshHost || !remoteHost) {
      return NextResponse.json(
        {
          error: "sshHost and remoteHost are required",
        },
        { status: 400 },
      )
    }

    const data = {
      provider: "hetzner" as const,
      name,
      deploymentId,
      localHost: asNonEmptyString(body.localHost) || "127.0.0.1",
      localPort: normalizePort(body.localPort, 16_443),
      remoteHost,
      remotePort: normalizePort(body.remotePort, 6443),
      sshHost,
      sshPort: normalizePort(body.sshPort, 22),
      sshUser: asNonEmptyString(body.sshUser) || "root",
      sshKeyId,
      status: "stopped" as const,
      lastError: null,
    }

    const tunnel = id
      ? await prisma.shipyardSshTunnel.updateMany({
          where: {
            id,
            userId: actor.userId,
            provider: "hetzner",
          },
          data,
        })
      : null

    if (id && tunnel && tunnel.count === 0) {
      return NextResponse.json({ error: "Tunnel not found" }, { status: 404 })
    }

    const saved = id
      ? await prisma.shipyardSshTunnel.findFirst({
          where: {
            id,
            userId: actor.userId,
            provider: "hetzner",
          },
        })
      : await prisma.shipyardSshTunnel.create({
          data: {
            userId: actor.userId,
            ...data,
          },
        })

    if (!saved) {
      return NextResponse.json({ error: "Tunnel not found" }, { status: 404 })
    }

    return NextResponse.json({
      provider: "hetzner",
      tunnel: {
        ...saved,
        createdAt: saved.createdAt.toISOString(),
        updatedAt: saved.updatedAt.toISOString(),
        lastHealthCheck: saved.lastHealthCheck?.toISOString() || null,
      },
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    console.error("Error saving Hetzner tunnel:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
