import { fileURLToPath } from "node:url"
import fs from "node:fs/promises"
import path from "node:path"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const desktopDir = path.resolve(__dirname, "..")
const repoRoot = path.resolve(desktopDir, "..")
const nodeDir = path.join(repoRoot, "node")
const outDir = path.join(desktopDir, ".backend-bundle")

const COPY_ITEMS = [
  "package.json",
  "package-lock.json",
  "next.config.js",
  "server.ts",
  "server-dotenv.ts",
  "public",
  "prisma",
  "src",
  ".next",
  "node_modules",
]

async function exists(p) {
  try {
    await fs.stat(p)
    return true
  } catch {
    return false
  }
}

async function main() {
  console.log(`Bundling backend from: ${nodeDir}`)
  console.log(`Output: ${outDir}`)

  if (!(await exists(nodeDir))) {
    throw new Error(`Missing node app directory: ${nodeDir}`)
  }

  const nextDir = path.join(nodeDir, ".next")
  if (!(await exists(nextDir))) {
    throw new Error(`Missing ${nextDir}. Run: (cd node && npm run build)`)
  }

  const modulesDir = path.join(nodeDir, "node_modules")
  if (!(await exists(modulesDir))) {
    throw new Error(`Missing ${modulesDir}. Run: (cd node && npm ci)`)
  }

  await fs.rm(outDir, { recursive: true, force: true })
  await fs.mkdir(outDir, { recursive: true })

  for (const item of COPY_ITEMS) {
    const from = path.join(nodeDir, item)
    const to = path.join(outDir, item)

    if (!(await exists(from))) {
      throw new Error(`Missing required backend item: ${from}`)
    }

    console.log(`- copy ${item}`)
    await fs.cp(from, to, { recursive: true })
  }

  console.log("Backend bundle complete.")
}

main().catch((error) => {
  console.error("Backend bundle failed:", error)
  process.exit(1)
})

