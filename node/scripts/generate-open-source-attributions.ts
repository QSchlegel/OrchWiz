import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

type DependencyKind = "dependency" | "devDependency"

interface WorkspaceConfig {
  id: string
  label: string
  dir: string
}

interface WorkspaceOccurrence {
  workspaceId: string
  workspaceLabel: string
  kind: DependencyKind
  requested: string
  version: string | null
}

interface OpenSourceAttribution {
  name: string
  description: string | null
  license: string | null
  url: string
  occurrences: WorkspaceOccurrence[]
}

interface PackageJsonLite {
  name?: unknown
  version?: unknown
  description?: unknown
  license?: unknown
  licenses?: unknown
  homepage?: unknown
  repository?: unknown
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function parseLicense(value: unknown): string | null {
  const licenseString = asString(value)
  if (licenseString) return licenseString

  if (value && typeof value === "object") {
    const type = asString((value as { type?: unknown }).type)
    if (type) return type
  }

  if (Array.isArray(value)) {
    const types = value
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null
        return asString((entry as { type?: unknown }).type) || asString((entry as { license?: unknown }).license)
      })
      .filter(Boolean) as string[]
    if (types.length > 0) return [...new Set(types)].join(", ")
  }

  return null
}

function parseRepositoryUrl(repository: unknown): string | null {
  const repoString = asString(repository)
  if (repoString) return repoString

  if (repository && typeof repository === "object") {
    const url = asString((repository as { url?: unknown }).url)
    if (url) return url
  }

  return null
}

function normalizeUrl(raw: string): string {
  let url = raw.trim()

  if (url.startsWith("git+")) url = url.slice("git+".length)
  if (url.startsWith("git://")) url = `https://${url.slice("git://".length)}`

  url = url.replace(/\.git(#.*)?$/, "")
  return url
}

function bestProjectUrl(pkgName: string, pkg: PackageJsonLite | null): string {
  const homepage = pkg ? asString(pkg.homepage) : null
  if (homepage && /^https?:\/\//i.test(homepage)) {
    return homepage
  }

  const repoRaw = pkg ? parseRepositoryUrl(pkg.repository) : null
  if (repoRaw) {
    const normalized = normalizeUrl(repoRaw)
    if (/^https?:\/\//i.test(normalized)) {
      return normalized
    }
  }

  return `https://www.npmjs.com/package/${pkgName}`
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf8")
  return JSON.parse(raw) as T
}

function dependencyPackageJsonPath(workspaceDir: string, dependencyName: string): string {
  return path.join(workspaceDir, "node_modules", ...dependencyName.split("/"), "package.json")
}

async function loadDependencyPackageMetadata(
  workspace: WorkspaceConfig,
  dependencyName: string,
): Promise<{ version: string | null; description: string | null; license: string | null; url: string }> {
  const pkgPath = dependencyPackageJsonPath(workspace.dir, dependencyName)

  if (!existsSync(pkgPath)) {
    return {
      version: null,
      description: null,
      license: null,
      url: `https://www.npmjs.com/package/${dependencyName}`,
    }
  }

  const pkg = await readJsonFile<PackageJsonLite>(pkgPath)

  const version = asString(pkg.version)
  const description = asString(pkg.description)
  const license = parseLicense(pkg.license) || parseLicense((pkg as { licenses?: unknown }).licenses)
  const url = bestProjectUrl(dependencyName, pkg)

  return { version, description, license, url }
}

function sortCaseInsensitive(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" })
}

async function main() {
  const repoRoot = path.resolve(__dirname, "../..")

  const workspaces: WorkspaceConfig[] = [
    { id: "node", label: "Web App", dir: path.join(repoRoot, "node") },
    { id: "desktop", label: "Desktop App", dir: path.join(repoRoot, "desktop") },
    { id: "provider-proxy", label: "Provider Proxy", dir: path.join(repoRoot, "services", "provider-proxy") },
    { id: "data-core", label: "Data Core", dir: path.join(repoRoot, "services", "data-core") },
    { id: "wallet-enclave", label: "Wallet Enclave", dir: path.join(repoRoot, "services", "wallet-enclave") },
  ]

  const attributionByName = new Map<string, OpenSourceAttribution>()

  for (const workspace of workspaces) {
    const manifestPath = path.join(workspace.dir, "package.json")
    const manifest = await readJsonFile<{
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }>(manifestPath)

    const entries: Array<{ name: string; requested: string; kind: DependencyKind }> = []

    for (const [name, requested] of Object.entries(manifest.dependencies ?? {})) {
      entries.push({ name, requested, kind: "dependency" })
    }
    for (const [name, requested] of Object.entries(manifest.devDependencies ?? {})) {
      entries.push({ name, requested, kind: "devDependency" })
    }

    entries.sort((a, b) => sortCaseInsensitive(a.name, b.name))

    for (const entry of entries) {
      const metadata = await loadDependencyPackageMetadata(workspace, entry.name)

      const occurrence: WorkspaceOccurrence = {
        workspaceId: workspace.id,
        workspaceLabel: workspace.label,
        kind: entry.kind,
        requested: entry.requested,
        version: metadata.version,
      }

      const existing = attributionByName.get(entry.name)
      if (existing) {
        existing.occurrences.push(occurrence)
        if (!existing.description && metadata.description) existing.description = metadata.description
        if (!existing.license && metadata.license) existing.license = metadata.license
        if (!existing.url || existing.url.includes("npmjs.com/package")) existing.url = metadata.url
        continue
      }

      attributionByName.set(entry.name, {
        name: entry.name,
        description: metadata.description,
        license: metadata.license,
        url: metadata.url,
        occurrences: [occurrence],
      })
    }
  }

  const attributions = [...attributionByName.values()]
    .map((item) => ({
      ...item,
      occurrences: [...item.occurrences].sort((a, b) => sortCaseInsensitive(a.workspaceLabel, b.workspaceLabel)),
    }))
    .sort((a, b) => sortCaseInsensitive(a.name, b.name))

  const outDir = path.join(repoRoot, "node", "src", "lib", "open-source")
  const outPath = path.join(outDir, "attributions.generated.ts")

  await mkdir(outDir, { recursive: true })

  const header = `/* eslint-disable */\n// This file is auto-generated by node/scripts/generate-open-source-attributions.ts.\n// Do not edit by hand.\n\n`

  const body = `export type DependencyKind = "dependency" | "devDependency"\n\nexport interface WorkspaceOccurrence {\n  workspaceId: string\n  workspaceLabel: string\n  kind: DependencyKind\n  requested: string\n  version: string | null\n}\n\nexport interface OpenSourceAttribution {\n  name: string\n  description: string | null\n  license: string | null\n  url: string\n  occurrences: WorkspaceOccurrence[]\n}\n\nexport const OPEN_SOURCE_ATTRIBUTIONS: OpenSourceAttribution[] = ${JSON.stringify(
    attributions,
    null,
    2,
  )}\n`

  await writeFile(outPath, `${header}${body}`, "utf8")

  // eslint-disable-next-line no-console
  console.log(`Wrote ${attributions.length} OSS attribution entries to ${path.relative(repoRoot, outPath)}`)
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error)
  process.exitCode = 1
})
