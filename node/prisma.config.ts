import dotenv from "dotenv"
import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig, env } from "prisma/config"

// Load migrate env file so Prisma gets DATABASE_URL even when run in a subprocess that doesn't inherit env (e.g. Railway)
const configDir = path.dirname(fileURLToPath(import.meta.url))
const migrateFileNextToConfig = path.join(configDir, ".env.migrate")

if (process.env.PRISMA_MIGRATE_ENV_PATH && existsSync(process.env.PRISMA_MIGRATE_ENV_PATH)) {
  dotenv.config({ path: process.env.PRISMA_MIGRATE_ENV_PATH })
}
if (!process.env.DATABASE_URL && existsSync(migrateFileNextToConfig)) {
  dotenv.config({ path: migrateFileNextToConfig })
}
dotenv.config()
if (!process.env.DATABASE_URL) {
  const migratePathCwd = path.resolve(process.cwd(), ".env.migrate")
  if (existsSync(migratePathCwd)) {
    dotenv.config({ path: migratePathCwd })
  }
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
})
