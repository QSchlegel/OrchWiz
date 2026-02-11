import assert from "node:assert/strict"
import test from "node:test"
import type { VaultSaveResponse } from "@/lib/vault/types"
import { buildVaultSeedPackFiles } from "./index"
import { installVaultSeedPack, VaultSeedPackInstallError } from "./install"

function makeSaveResponse(path: string): VaultSaveResponse {
  return {
    vaultId: "orchwiz",
    path,
    size: 128,
    mtime: "2026-02-11T00:00:00.000Z",
    encrypted: false,
    originVaultId: "orchwiz",
  }
}

test("installVaultSeedPack writes via local vault path when data-core is disabled", async () => {
  const localWrites: string[] = []
  const dataCoreWrites: string[] = []

  const result = await installVaultSeedPack(
    {
      packId: "popebot",
      userId: "user-1",
      createdDate: "2026-02-11",
    },
    {
      dataCoreEnabled: () => false,
      saveVaultFile: async (_vaultId, path, _content) => {
        localWrites.push(path)
        return makeSaveResponse(path)
      },
      saveVaultFileToDataCore: async ({ notePath }) => {
        dataCoreWrites.push(notePath)
        return makeSaveResponse(notePath)
      },
      now: () => new Date("2026-02-11T01:02:03.000Z"),
    },
  )

  assert.equal(result.packId, "popebot")
  assert.equal(result.files.length, 5)
  assert.equal(result.createdDate, "2026-02-11")
  assert.equal(result.installedAt, "2026-02-11T01:02:03.000Z")
  assert.equal(localWrites.length, 5)
  assert.equal(dataCoreWrites.length, 0)
})

test("installVaultSeedPack writes via data-core path when enabled", async () => {
  const localWrites: string[] = []
  const dataCoreWrites: string[] = []

  await installVaultSeedPack(
    {
      packId: "popebot",
      userId: "user-2",
      createdDate: "2026-02-11",
    },
    {
      dataCoreEnabled: () => true,
      saveVaultFile: async (_vaultId, path, _content) => {
        localWrites.push(path)
        return makeSaveResponse(path)
      },
      saveVaultFileToDataCore: async ({ notePath }) => {
        dataCoreWrites.push(notePath)
        return makeSaveResponse(notePath)
      },
      now: () => new Date("2026-02-11T01:02:03.000Z"),
    },
  )

  assert.equal(localWrites.length, 0)
  assert.equal(dataCoreWrites.length, 5)
})

test("installVaultSeedPack returns partial-write diagnostics on failure", async () => {
  const built = buildVaultSeedPackFiles("popebot", {
    createdDate: "2026-02-11",
  })
  const failingPath = built.files[1].path

  await assert.rejects(
    () =>
      installVaultSeedPack(
        {
          packId: "popebot",
          userId: "user-3",
          createdDate: "2026-02-11",
        },
        {
          dataCoreEnabled: () => false,
          saveVaultFile: async (_vaultId, path, _content) => {
            if (path === failingPath) {
              throw new Error("disk full")
            }
            return makeSaveResponse(path)
          },
          saveVaultFileToDataCore: async ({ notePath }) => makeSaveResponse(notePath),
          now: () => new Date("2026-02-11T01:02:03.000Z"),
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof VaultSeedPackInstallError)
      assert.equal(error.packId, "popebot")
      assert.equal(error.failedPath, failingPath)
      assert.deepEqual(error.writtenPaths, [built.files[0].path])
      return true
    },
  )
})
