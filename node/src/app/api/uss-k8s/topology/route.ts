import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"
import {
  USS_K8S_COMPONENTS,
  USS_K8S_EDGES,
  SUBSYSTEM_GROUP_CONFIG,
  GROUP_ORDER,
} from "@/lib/uss-k8s/topology"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Fetch bridge crew subagents from the database
    const bridgeCrew = await prisma.subagent.findMany({
      where: { teamId: "uss-k8s" },
      orderBy: { createdAt: "desc" },
    })

    // Build a lookup: lowercase agent label prefix → subagent record
    const agentLookup = new Map<string, (typeof bridgeCrew)[number]>()
    for (const agent of bridgeCrew) {
      // Match by name prefix (e.g. "XO-CB01" matches component id "xo")
      const prefix = agent.name.split("-")[0].toLowerCase()
      agentLookup.set(prefix, agent)
    }

    // Merge subagent data into topology components
    const components = USS_K8S_COMPONENTS.map((c) => {
      const agent = agentLookup.get(c.id)
      if (agent) {
        return {
          ...c,
          subagentId: agent.id,
          subagentName: agent.name,
          subagentDescription: agent.description,
        }
      }
      return c
    })

    return NextResponse.json({
      components,
      edges: USS_K8S_EDGES,
      groups: SUBSYSTEM_GROUP_CONFIG,
      groupOrder: GROUP_ORDER,
    })
  } catch (error) {
    console.error("Error fetching uss-k8s topology:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
