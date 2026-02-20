import dotenv from "dotenv"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { defineConfig, env } from "prisma/config"

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
