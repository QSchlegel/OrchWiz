import { createHash } from "node:crypto"
import { createWriteStream } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import { Readable, Transform } from "node:stream"
import { pipeline } from "node:stream/promises"

type DesktopAssetKey = "mac" | "windows" | "linux"

type ReleaseAsset = {
  name?: string
  size?: number
  browser_download_url?: string
}

type GitHubRelease = {
  id?: number
  tag_name?: string
  name?: string
  html_url?: string
  published_at?: string
  assets?: ReleaseAsset[]
}

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

function requireEnvOrDefault(name: string, fallback: string): string {
  return ensureString(process.env[name]) || fallback
}

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/u, "")
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

async function fetchLatestRelease(args: {
  owner: string
  repo: string
  token: string | null
}): Promise<GitHubRelease> {
  const url = `https://api.github.com/repos/${args.owner}/${args.repo}/releases/latest`
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "orchwiz-sync-desktop-downloads",
  }
  if (args.token) {
    headers.Authorization = `Bearer ${args.token}`
  }

  const response = await fetch(url, { headers })
  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(`GitHub releases/latest failed (${response.status}): ${body.slice(0, 500)}`)
  }

  return (await response.json()) as GitHubRelease
}

function pickAsset(release: GitHubRelease, key: DesktopAssetKey): Required<ReleaseAsset> {
  const assets = Array.isArray(release.assets) ? release.assets : []
  const re = assetRegexFor(key)
  const match = assets.find((asset) => {
    const name = ensureString(asset.name)
    return name ? re.test(name) : false
  })

  const name = ensureString(match?.name)
  const url = ensureString(match?.browser_download_url)
  const size = typeof match?.size === "number" ? match.size : null

  if (!name || !url || size === null) {
    const available = assets
      .map((asset) => ensureString(asset.name))
      .filter(Boolean)
      .sort((a, b) => a!.localeCompare(b!))
      .join(", ")
    throw new Error(
      `Could not find required release asset for ${key}. Expected name matching ${String(re)}. Available: ${available || "(none)"}`,
    )
  }

  return {
    name,
    size,
    browser_download_url: url,
  }
}

async function downloadFileWithSha256(args: {
  url: string
  outPath: string
  token: string | null
}): Promise<{ sha256: string; bytes: number }> {
  const headers: Record<string, string> = {
    "User-Agent": "orchwiz-sync-desktop-downloads",
  }
  if (args.token) {
    headers.Authorization = `Bearer ${args.token}`
  }

  const response = await fetch(args.url, { headers, redirect: "follow" })
  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(`Download failed (${response.status}) for ${args.url}: ${body.slice(0, 200)}`)
  }

  if (!response.body) {
    throw new Error(`Download failed: missing body for ${args.url}`)
  }

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
    Readable.fromWeb(response.body as any),
    hashTap,
    createWriteStream(args.outPath),
  )

  return { sha256: hasher.digest("hex"), bytes }
}

async function main() {
  const argv = parseArgs(process.argv.slice(2))
  const owner = argv.owner || requireEnvOrDefault("ORCHWIZ_GITHUB_OWNER", "QSchlegel")
  const repo = argv.repo || requireEnvOrDefault("ORCHWIZ_GITHUB_REPO", "OrchWiz")
  const token = ensureString(process.env.GITHUB_TOKEN)
  const outDir =
    argv["out-dir"]
    || argv.outDir
    || path.join(process.cwd(), "public", "downloads")

  const dryRun = argv["dry-run"] === "true" || argv.dryRun === "true"

  console.log(`Syncing desktop downloads from GitHub Releases: ${owner}/${repo}`)
  console.log(`Output dir: ${outDir}`)
  if (dryRun) {
    console.log("Dry run enabled: no files will be written.")
  }

  const release = await fetchLatestRelease({ owner, repo, token })
  const tag = ensureString(release.tag_name) || "unknown"
  const publishedAt = ensureString(release.published_at) || null

  const macAsset = pickAsset(release, "mac")
  const winAsset = pickAsset(release, "windows")
  const linuxAsset = pickAsset(release, "linux")

  const assetByKey: Record<DesktopAssetKey, Required<ReleaseAsset>> = {
    mac: macAsset,
    windows: winAsset,
    linux: linuxAsset,
  }

  const manifest: any = {
    version: tag,
    publishedAt,
    release: {
      id: release.id ?? null,
      tag,
      name: ensureString(release.name) || null,
      htmlUrl: ensureString(release.html_url) || null,
      source: stripTrailingSlashes(`https://github.com/${owner}/${repo}`),
    },
    files: {},
    generatedAt: new Date().toISOString(),
  }

  for (const key of ["mac", "windows", "linux"] as const) {
    const asset = assetByKey[key]
    const aliasName = aliasFilenameFor(key)
    const outPath = path.join(outDir, aliasName)

    console.log(`- ${key}: ${asset.name} -> ${aliasName}`)
    if (dryRun) {
      manifest.files[key] = {
        alias: aliasName,
        sourceName: asset.name,
        sourceUrl: asset.browser_download_url,
        bytes: asset.size,
        sha256: null,
      }
      continue
    }

    const result = await downloadFileWithSha256({
      url: asset.browser_download_url,
      outPath,
      token,
    })

    manifest.files[key] = {
      alias: aliasName,
      sourceName: asset.name,
      sourceUrl: asset.browser_download_url,
      bytes: result.bytes,
      sha256: result.sha256,
    }
  }

  const manifestPath = path.join(outDir, "manifest.json")
  if (!dryRun) {
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
    console.log(`Wrote manifest: ${manifestPath}`)
  }
}

main().catch((error) => {
  console.error("Desktop download sync failed:", error)
  process.exit(1)
})

