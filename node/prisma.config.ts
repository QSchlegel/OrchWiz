import dotenv from "dotenv"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { defineConfig, env } from "prisma/config"

// Load migrate env file by absolute path first (used when parent passes PRISMA_MIGRATE_ENV_PATH so Prisma subprocess gets DATABASE_URL regardless of cwd)
const migrateEnvPath = process.env.PRISMA_MIGRATE_ENV_PATH
if (migrateEnvPath && existsSync(migrateEnvPath)) {
  dotenv.config({ path: migrateEnvPath })
}
dotenv.config()
if (!process.env.DATABASE_URL) {
  const migratePath = resolve(process.cwd(), ".env.migrate")
  if (existsSync(migratePath)) {
    dotenv.config({ path: migratePath })
  }
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
})
