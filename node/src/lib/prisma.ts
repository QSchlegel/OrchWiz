import { PrismaClient } from '@prisma/client'

// Load environment variables early
if (typeof window === 'undefined') {
  try {
    require('dotenv/config')
  } catch {
    // dotenv not available, continue
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Lazy initialization function to avoid PrismaClient instantiation during build
function getPrismaClient(): PrismaClient {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma
  }

  // Only initialize if we're not in build phase or if DATABASE_URL is available
  if (process.env.NEXT_PHASE === 'phase-production-build' && !process.env.DATABASE_URL) {
    // During build without DATABASE_URL, throw a more helpful error
    throw new Error(
      'PrismaClient cannot be initialized during build. ' +
      'Ensure DATABASE_URL is set in your environment or mark API routes as dynamic.'
    )
  }

  const client = new PrismaClient()
  
  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = client
  }
  
  return client
}

// Export a getter that initializes on first access
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient()
    const value = client[prop as keyof PrismaClient]
    return typeof value === 'function' ? value.bind(client) : value
  }
})
