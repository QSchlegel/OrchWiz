import "dotenv/config"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import crypto from "node:crypto"

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error("DATABASE_URL is required to run the seed")
const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

const bridgeCrew = [
  {
    name: "XO-CB01",
    description: "Bridge coordination — Executive Officer. Routes directives from CAP-QS to appropriate bridge stations.",
    content: "Bridge coordination agent. Handles request routing, task delegation, and inter-agent communication.",
    path: "bridge/xo-cb01",
  },
  {
    name: "OPS-ARX",
    description: "Ops automation — Operations Officer. Handles resource allocation and operational workflows.",
    content: "Operations automation agent. Manages compute balancing, cache warmup, priority routing.",
    path: "bridge/ops-arx",
  },
  {
    name: "ENG-GEO",
    description: "Incident queue + infra — Engineering Officer. Manages infrastructure incidents and Grafana alerts.",
    content: "Engineering agent. Processes Grafana alerts, creates incident notes, requests actions from XO.",
    path: "bridge/eng-geo",
  },
  {
    name: "SEC-KOR",
    description: "Security review — Security Officer. Handles security audits and policy enforcement.",
    content: "Security review agent. Performs policy review, permission audits, security posture checks.",
    path: "bridge/sec-kor",
  },
  {
    name: "MED-BEV",
    description: "Health checks — Medical Officer. Monitors system and agent health.",
    content: "Health check agent. Runs health probes, monitors agent vitals, reports degradation.",
    path: "bridge/med-bev",
  },
  {
    name: "COU-DEA",
    description: "Comms/outreach — Communications Officer. Manages external communications and notifications.",
    content: "Communications agent. Handles Telegram integration, outreach, notification routing.",
    path: "bridge/cou-dea",
  },
]

async function main() {
  console.log("Seeding bridge crew subagents for uss-k8s...")

  for (const agent of bridgeCrew) {
    const result = await prisma.subagent.upsert({
      where: {
        name_teamId: { name: agent.name, teamId: "uss-k8s" },
      },
      update: {
        description: agent.description,
        content: agent.content,
        path: agent.path,
        isShared: true,
      },
      create: {
        ...agent,
        isShared: true,
        teamId: "uss-k8s",
      },
    })
    console.log(`  ${result.name} (${result.id})`)
  }

  const defaultForwardingApiKey = process.env.DEFAULT_FORWARDING_API_KEY || "orchwiz-dev-forwarding-key"
  const defaultSourceNodeId = process.env.DEFAULT_SOURCE_NODE_ID || "local-node"
  const defaultSourceNodeName = process.env.DEFAULT_SOURCE_NODE_NAME || "Local Node"
  const apiKeyHash = crypto
    .createHash("sha256")
    .update(defaultForwardingApiKey)
    .digest("hex")

  const sourceNode = await prisma.nodeSource.upsert({
    where: { nodeId: defaultSourceNodeId },
    update: {
      name: defaultSourceNodeName,
      nodeType: "local",
      nodeUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      apiKeyHash,
      isActive: true,
      lastSeenAt: new Date(),
    },
    create: {
      nodeId: defaultSourceNodeId,
      name: defaultSourceNodeName,
      nodeType: "local",
      nodeUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      apiKeyHash,
      isActive: true,
      lastSeenAt: new Date(),
    },
  })

  console.log(`Seeded node source ${sourceNode.nodeId} (${sourceNode.id})`)
  console.log("Done.")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
