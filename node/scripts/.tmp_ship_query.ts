import { prisma } from "../src/lib/prisma"

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  })

  const ships = await prisma.agentDeployment.findMany({
    where: { deploymentType: "ship" },
    select: {
      id: true,
      name: true,
      status: true,
      deploymentProfile: true,
      provisioningMode: true,
      nodeId: true,
      userId: true,
      createdAt: true,
      metadata: true,
    },
    orderBy: { createdAt: "desc" },
    take: 30,
  })

  console.log("USERS")
  console.log(JSON.stringify(users, null, 2))
  console.log("SHIPS")
  console.log(JSON.stringify(ships, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
