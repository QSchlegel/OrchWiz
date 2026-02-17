const fs = require("node:fs")
const path = require("node:path")

function ensureFileWithContents(filePath, contents) {
  let existing = null
  try {
    existing = fs.readFileSync(filePath, "utf8")
  } catch {
    // file missing
  }

  if (existing === contents) return "unchanged"

  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, contents, "utf8")
  return existing === null ? "created" : "updated"
}

function main() {
  const appRoot = path.resolve(__dirname, "..")
  const target = path.join(
    appRoot,
    "node_modules",
    "libsodium-wrappers-sumo",
    "dist",
    "modules-sumo-esm",
    "libsodium-sumo.mjs",
  )

  // libsodium-wrappers-sumo@0.7.x ships an ESM wrapper that imports `./libsodium-sumo.mjs`,
  // but doesn't include that file in its published package. Next/Turbopack then fails at build time.
  // Provide a small re-export shim that delegates to the `libsodium-sumo` package (which is installed).
  const result = ensureFileWithContents(target, 'import sodium from "libsodium-sumo";\nexport default sodium;\n')

  if (result !== "unchanged") {
    // eslint-disable-next-line no-console
    console.log(`[postinstall] ${result} libsodium-wrappers-sumo ESM shim: ${path.relative(appRoot, target)}`)
  }
}

main()
