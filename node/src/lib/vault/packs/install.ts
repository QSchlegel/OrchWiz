import { dataCoreEnabled } from "@/lib/data-core/config"
import { saveVaultFileToDataCore } from "@/lib/data-core/vault-adapter"
import { saveVaultFile } from "@/lib/vault"
import type { VaultSaveResponse, VaultSeedPackInstallResponse } from "@/lib/vault/types"
import { buildVaultSeedPackFiles } from "./index"

export class VaultSeedPackInstallError extends Error {
  packId: string
  failedPath: string
  writtenPaths: string[]
  cause?: unknown

  constructor(args: {
    packId: string
    failedPath: string
    writtenPaths: string[]
    message?: string
    cause?: unknown
  }) {
    super(args.message || `Failed to install vault seed pack '${args.packId}'.`)
    this.name = "VaultSeedPackInstallError"
    this.packId = args.packId
    this.failedPath = args.failedPath
    this.writtenPaths = [...args.writtenPaths]
    this.cause = args.cause
  }
}

export interface VaultSeedPackInstallDeps {
  dataCoreEnabled: () => boolean
  saveVaultFile: typeof saveVaultFile
  saveVaultFileToDataCore: typeof saveVaultFileToDataCore
  now: () => Date
}

const defaultDeps: VaultSeedPackInstallDeps = {
  dataCoreEnabled: () => dataCoreEnabled(),
  saveVaultFile: (vaultId, notePath, content) => saveVaultFile(vaultId, notePath, content),
  saveVaultFileToDataCore: (args) => saveVaultFileToDataCore(args),
  now: () => new Date(),
}

export async function installVaultSeedPack(
  args: {
    packId: string
    userId: string
    shipDeploymentId?: string | null
    createdDate?: string
  },
  deps: VaultSeedPackInstallDeps = defaultDeps,
): Promise<VaultSeedPackInstallResponse> {
  const builtPack = buildVaultSeedPackFiles(args.packId, {
    createdDate: args.createdDate,
  })

  const writtenPaths: string[] = []
  const files: VaultSeedPackInstallResponse["files"] = []

  for (const file of builtPack.files) {
    try {
      let saved: VaultSaveResponse
      if (deps.dataCoreEnabled()) {
        saved = await deps.saveVaultFileToDataCore({
          vaultId: builtPack.pack.vaultId,
          notePath: file.path,
          content: file.content,
          userId: args.userId,
          shipDeploymentId: args.shipDeploymentId || undefined,
        })
      } else {
        saved = await deps.saveVaultFile(builtPack.pack.vaultId, file.path, file.content)
      }

      writtenPaths.push(saved.path)
      files.push({
        path: saved.path,
        size: saved.size,
        mtime: saved.mtime,
      })
    } catch (error) {
      throw new VaultSeedPackInstallError({
        packId: builtPack.pack.id,
        failedPath: file.path,
        writtenPaths,
        cause: error,
      })
    }
  }

  return {
    packId: builtPack.pack.id,
    vaultId: builtPack.pack.vaultId,
    targetRoot: builtPack.pack.targetRoot,
    createdDate: builtPack.createdDate,
    installedAt: deps.now().toISOString(),
    overwrite: true,
    noteCount: files.length,
    files,
  }
}

