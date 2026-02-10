import { prisma } from "@/lib/prisma"
import { getWalletAddress } from "@/lib/wallet-enclave/client"

export interface UserMemorySignerRecord {
  userId: string
  keyRef: string
  address: string
  key: string | null
}

function keyRefForUser(userId: string): string {
  return `usr_mem:${userId}`
}

export async function getOrProvisionUserMemorySigner(userId: string): Promise<UserMemorySignerRecord> {
  const existing = await prisma.userMemorySigner.findUnique({
    where: {
      userId,
    },
  })

  if (existing) {
    return {
      userId,
      keyRef: existing.keyRef,
      address: existing.address,
      key: existing.key,
    }
  }

  const keyRef = keyRefForUser(userId)
  const derived = await getWalletAddress({
    keyRef,
  })

  const created = await prisma.userMemorySigner.create({
    data: {
      userId,
      keyRef,
      address: derived.address,
      key: null,
    },
  })

  return {
    userId,
    keyRef: created.keyRef,
    address: created.address,
    key: created.key,
  }
}
