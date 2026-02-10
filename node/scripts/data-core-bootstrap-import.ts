import { getWalletAddress } from "@/lib/wallet-enclave/client"
import { getDataCoreClient } from "@/lib/data-core/client"
import { dataCoreClusterId, dataCoreShipDeploymentIdDefault } from "@/lib/data-core/config"
import { toCanonicalPath } from "@/lib/data-core/canonical"
import { resolveVaultAbsolutePath } from "@/lib/vault/config"
import { collectMarkdownFilePaths, directoryExists, readMarkdownFile } from "@/lib/vault/fs"
import type { PhysicalVaultId } from "@/lib/vault/types"

interface ImportRow {
  vaultId: PhysicalVaultId
  path: string
  canonicalPath: string
  domain: "orchwiz" | "ship" | "agent-public"
  content: string
}

function asBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback
  const normalized = value.trim().toLowerCase()
  if (["1", "true", "yes", "on"].includes(normalized)) return true
  if (["0", "false", "no", "off"].includes(normalized)) return false
  return fallback
}

function parseVaultList(value: string | undefined): PhysicalVaultId[] {
  if (!value || !value.trim()) {
    return ["orchwiz", "ship", "agent-public"]
  }

  const parsed = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry): entry is PhysicalVaultId => (
      entry === "orchwiz"
      || entry === "ship"
      || entry === "agent-public"
      || entry === "agent-private"
    ))
    .filter((entry) => entry !== "agent-private")

  return parsed.length > 0 ? parsed : ["orchwiz", "ship", "agent-public"]
}

async function collectImportRows(vaultIds: PhysicalVaultId[], writerId: string): Promise<ImportRow[]> {
  const clusterId = dataCoreClusterId()
  const shipDeploymentId = dataCoreShipDeploymentIdDefault() || undefined
  const rows: ImportRow[] = []

  for (const vaultId of vaultIds) {
    const root = resolveVaultAbsolutePath(vaultId)
    if (!(await directoryExists(root))) {
      continue
    }

    const paths = await collectMarkdownFilePaths(root)
    for (const path of paths) {
      const file = await readMarkdownFile(root, path).catch(() => null)
      if (!file) {
        continue
      }

      const mapping = toCanonicalPath({
        physicalVaultId: vaultId,
        physicalPath: path,
        context: {
          clusterId,
          shipDeploymentId,
          userId: writerId,
        },
      })

      rows.push({
        vaultId,
        path,
        canonicalPath: mapping.canonicalPath,
        domain: mapping.domain,
        content: file.content,
      })
    }
  }

  return rows
}

async function resolveBootstrapSigner(): Promise<{
  writerType: "agent" | "user" | "system"
  writerId: string
  keyRef: string
  address: string
  source: "agent" | "user" | "system"
}> {
  const writerTypeRaw = process.env.DATA_CORE_BOOTSTRAP_WRITER_TYPE?.trim().toLowerCase()
  const writerType: "agent" | "user" | "system" = writerTypeRaw === "user"
    ? "user"
    : writerTypeRaw === "system"
      ? "system"
      : "agent"

  const writerId = process.env.DATA_CORE_BOOTSTRAP_WRITER_ID?.trim()
  if (!writerId) {
    throw new Error("DATA_CORE_BOOTSTRAP_WRITER_ID is required.")
  }

  const keyRef = process.env.DATA_CORE_BOOTSTRAP_KEY_REF?.trim()
  if (!keyRef) {
    throw new Error("DATA_CORE_BOOTSTRAP_KEY_REF is required.")
  }

  const configuredAddress = process.env.DATA_CORE_BOOTSTRAP_ADDRESS?.trim()
  const address = configuredAddress || (await getWalletAddress({ keyRef })).address

  return {
    writerType,
    writerId,
    keyRef,
    address,
    source: writerType,
  }
}

async function main(): Promise<void> {
  const dryRun = asBoolean(process.env.DATA_CORE_BOOTSTRAP_DRY_RUN, false)
  const runReconcile = asBoolean(process.env.DATA_CORE_BOOTSTRAP_SYNC_RECONCILE, true)
  const vaultIds = parseVaultList(process.env.DATA_CORE_BOOTSTRAP_VAULTS)
  const signer = await resolveBootstrapSigner()

  const rows = await collectImportRows(vaultIds, signer.writerId)
  console.log(`[bootstrap] scanned ${rows.length} markdown files across ${vaultIds.join(", ")}`)
  if (rows.length === 0) {
    return
  }

  const client = getDataCoreClient()
  let imported = 0
  let failed = 0

  for (const row of rows) {
    if (dryRun) {
      console.log(`[dry-run] ${row.vaultId}/${row.path} -> ${row.canonicalPath}`)
      imported += 1
      continue
    }

    try {
      await client.upsertMemory({
        domain: row.domain,
        canonicalPath: row.canonicalPath,
        contentMarkdown: row.content,
        writer: signer,
        tags: ["bootstrap-import"],
      })
      imported += 1
    } catch (error) {
      failed += 1
      console.error(`[bootstrap] failed ${row.vaultId}/${row.path}:`, error)
    }
  }

  if (!dryRun && runReconcile) {
    try {
      const reconcile = await client.runSyncReconcile()
      console.log("[bootstrap] sync reconcile:", JSON.stringify(reconcile))
    } catch (error) {
      console.error("[bootstrap] sync reconcile failed:", error)
    }
  }

  console.log(`[bootstrap] done imported=${imported} failed=${failed}`)
}

main().catch((error) => {
  console.error("[bootstrap] fatal:", error)
  process.exit(1)
})
