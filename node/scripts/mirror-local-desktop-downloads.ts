import { createHash } from "node:crypto"
import { createReadStream, createWriteStream } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import { Transform } from "node:stream"
import { pipeline } from "node:stream/promises"

type DesktopAssetKey = "mac" | "windows" | "linux"

function parseArgs(argv: string[]) {
  const out: Record<string, string> = {}
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]
    if (!current.startsWith("--")) continue
    const key = current.slice(2).trim()
    if (!key) continue

    const nextValue = argv[index + 1]
    if (nextValue && !nextValue.startsWith("--")) {
      out[key] = nextValue
      index += 1
      continue
    }
    out[key] = "true"
  }
  return out
}

function ensureString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function assetRegexFor(key: DesktopAssetKey): RegExp {
  switch (key) {
    case "mac":
      return /^OrchWiz-Desktop-.*-mac\.dmg$/u
    case "windows":
      return /^OrchWiz-Desktop-.*-win\.exe$/u
    case "linux":
      return /^OrchWiz-Desktop-.*-linux\.tar\.gz$/u
  }
}

function aliasFilenameFor(key: DesktopAssetKey): string {
  switch (key) {
    case "mac":
      return "orchwiz-mac.dmg"
    case "windows":
      return "orchwiz-win.exe"
    case "linux":
      return "orchwiz-linux.tar.gz"
  }
}

async function findNewestMatchingFile(dir: string, re: RegExp): Promise<{ path: string; name: string; mtimeMs: number } | null> {
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch {
    return null
  }

  const matches = entries.filter((name) => re.test(name))
  if (matches.length === 0) return null

  let best: { path: string; name: string; mtimeMs: number } | null = null
  for (const name of matches) {
    const candidatePath = path.join(dir, name)
    try {
      const stat = await fs.stat(candidatePath)
      if (!stat.isFile()) continue
      if (!best || stat.mtimeMs > best.mtimeMs) {
        best = { path: candidatePath, name, mtimeMs: stat.mtimeMs }
      }
    } catch {
      // ignore
    }
  }
  return best
}

async function copyFileWithSha256(args: { inPath: string; outPath: string }): Promise<{ sha256: string; bytes: number }> {
  await fs.mkdir(path.dirname(args.outPath), { recursive: true })

  const hasher = createHash("sha256")
  let bytes = 0

  const hashTap = new Transform({
    transform(chunk, _encoding, callback) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      bytes += buffer.byteLength
      hasher.update(buffer)
      callback(null, buffer)
    },
  })

  await pipeline(
    createReadStream(args.inPath),
    hashTap,
    createWriteStream(args.outPath),
  )

  return { sha256: hasher.digest("hex"), bytes }
}

async function readDesktopVersion(distDir: string): Promise<string | null> {
  // distDir defaults to ../desktop/dist-app, so walk up to ../desktop/package.json.
  const desktopDir = path.resolve(distDir, "..")
  const pkgPath = path.join(desktopDir, "package.json")
  try {
    const raw = await fs.readFile(pkgPath, "utf8")
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === "object" && "version" in parsed) {
      return ensureString((parsed as any).version) || null
    }
    return null
  } catch {
    return null
  }
}

async function main() {
  const argv = parseArgs(process.argv.slice(2))

  const outDir =
    argv["out-dir"]
    || argv.outDir
    || path.join(process.cwd(), "public", "downloads")

  const distDir =
    argv["dist-dir"]
    || argv.distDir
    || ensureString(process.env.ORCHWIZ_DESKTOP_DIST_DIR)
    || path.resolve(process.cwd(), "..", "desktop", "dist-app")

  const onlyRaw = ensureString(argv.only)
  const only = onlyRaw
    ? new Set(
      onlyRaw
        .split(",")
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean),
    )
    : null

  const dryRun = argv["dry-run"] === "true" || argv.dryRun === "true"

  console.log("Mirroring desktop installers from local build output.")
  console.log(`Desktop dist dir: ${distDir}`)
  console.log(`Output dir: ${outDir}`)
  if (only) {
    console.log(`Only: ${Array.from(only).join(", ")}`)
  }
  if (dryRun) {
    console.log("Dry run enabled: no files will be written.")
  }

  const version = await readDesktopVersion(distDir)

  const manifest: any = {
    version: version || "unknown",
    publishedAt: null,
    release: {
      id: null,
      tag: version || "unknown",
      name: "local-build",
      htmlUrl: null,
      source: "local",
    },
    files: {},
    generatedAt: new Date().toISOString(),
  }

  for (const key of ["mac", "windows", "linux"] as const) {
    if (only && !only.has(key)) {
      continue
    }

    const match = await findNewestMatchingFile(distDir, assetRegexFor(key))
    const aliasName = aliasFilenameFor(key)
    const outPath = path.join(outDir, aliasName)

    if (!match) {
      console.warn(`- ${key}: no artifact found in ${distDir} matching ${String(assetRegexFor(key))}`)
      manifest.files[key] = {
        alias: aliasName,
        sourceName: null,
        sourcePath: null,
        bytes: null,
        sha256: null,
      }
      continue
    }

    console.log(`- ${key}: ${match.name} -> ${aliasName}`)

    if (dryRun) {
      const stat = await fs.stat(match.path).catch(() => null)
      manifest.files[key] = {
        alias: aliasName,
        sourceName: match.name,
        sourcePath: match.path,
        bytes: stat?.isFile() ? stat.size : null,
        sha256: null,
      }
      continue
    }

    const result = await copyFileWithSha256({ inPath: match.path, outPath })
    manifest.files[key] = {
      alias: aliasName,
      sourceName: match.name,
      sourcePath: match.path,
      bytes: result.bytes,
      sha256: result.sha256,
    }
  }

  const manifestPath = path.join(outDir, "manifest.json")
  if (!dryRun) {
    await fs.mkdir(outDir, { recursive: true })
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
    console.log(`Wrote manifest: ${manifestPath}`)
  }
}

main().catch((error) => {
  console.error("Local desktop download mirror failed:", error)
  process.exit(1)
})

