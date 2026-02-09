import "dotenv/config"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import crypto from "node:crypto"

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error("DATABASE_URL is required to run the seed")
const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

async function main() {
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
