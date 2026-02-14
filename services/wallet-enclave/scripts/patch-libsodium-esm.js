import fs from "node:fs"
import path from "node:path"

function exists(filePath) {
  try {
    fs.accessSync(filePath)
    return true
  } catch {
    return false
  }
}

// `libsodium-wrappers-sumo@0.7.16` ships an ESM entry that imports `./libsodium-sumo.mjs`,
// but npm packaging omits that file. The actual ESM module exists in `libsodium-sumo`.
// Copy it into place so MeshJS can load libsodium in ESM runtimes (Docker + local).
function main() {
  const root = process.cwd()
  const source = path.join(
    root,
    "node_modules",
    "libsodium-sumo",
    "dist",
    "modules-sumo-esm",
    "libsodium-sumo.mjs",
  )
  const targetDir = path.join(
    root,
    "node_modules",
    "libsodium-wrappers-sumo",
    "dist",
    "modules-sumo-esm",
  )
  const target = path.join(targetDir, "libsodium-sumo.mjs")

  if (exists(target)) {
    return
  }
  if (!exists(source)) {
    return
  }
  if (!exists(targetDir)) {
    return
  }

  try {
    fs.copyFileSync(source, target)
  } catch {
    // Fail-open: avoid breaking installs for environments that don't need MeshJS signing.
  }
}

main()

