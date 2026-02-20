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

function ensureExecutable(filePath) {
  try {
    const stat = fs.statSync(filePath)
    const executableBits = 0o111
    if ((stat.mode & executableBits) === executableBits) {
      return "unchanged"
    }
    fs.chmodSync(filePath, stat.mode | executableBits)
    return "updated"
  } catch {
    return "missing"
  }
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

  // node-pty prebuilds on macOS can occasionally lose the execute bit for spawn-helper,
  // which then fails PTY startup with "posix_spawnp failed".
  if (process.platform === "darwin") {
    const helperPaths = [
      path.join(appRoot, "node_modules", "node-pty", "prebuilds", "darwin-arm64", "spawn-helper"),
      path.join(appRoot, "node_modules", "node-pty", "prebuilds", "darwin-x64", "spawn-helper"),
    ]
    for (const helperPath of helperPaths) {
      const helperResult = ensureExecutable(helperPath)
      if (helperResult === "updated") {
        // eslint-disable-next-line no-console
        console.log(`[postinstall] updated executable bit: ${path.relative(appRoot, helperPath)}`)
      }
    }
  }
}

main()
