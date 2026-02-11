import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import type { VaultSeedPackInstallResponse, VaultSeedPackSummary } from "@/lib/vault/types"
import { VaultSeedPackInstallError } from "@/lib/vault/packs/install"
import { handleGetVaultPacks, handlePostVaultPackInstall, type VaultPacksRouteDeps } from "./route"

const SAMPLE_PACKS: VaultSeedPackSummary[] = [
  {
    id: "popebot",
    label: "PopeBot Notes",
    description: "Install a linked PopeBot notes pack in OrchWiz Vault.",
    vaultId: "orchwiz",
    targetRoot: "00-Inbox/PopeBot",
    tags: ["ai-agents"],
    noteCount: 5,
  },
]

const INSTALL_RESULT: VaultSeedPackInstallResponse = {
  packId: "popebot",
  vaultId: "orchwiz",
  targetRoot: "00-Inbox/PopeBot",
  createdDate: "2026-02-11",
  installedAt: "2026-02-11T10:00:00.000Z",
  overwrite: true,
  noteCount: 5,
  files: [
    {
      path: "00-Inbox/PopeBot/PopeBot.md",
      size: 100,
      mtime: "2026-02-11T10:00:00.000Z",
    },
  ],
}

function asNextRequest(request: Request): NextRequest {
  return request as unknown as NextRequest
}

function postRequest(body: Record<string, unknown>): NextRequest {
  return asNextRequest(
    new Request("http://localhost/api/vaults/packs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  )
}

function deps(overrides: Partial<VaultPacksRouteDeps> = {}): VaultPacksRouteDeps {
  return {
    getSession: async () => ({
      user: {
        id: "user-1",
      },
    }),
    listPacks: () => SAMPLE_PACKS,
    installPack: async () => INSTALL_RESULT,
    notifyPackInstalled: () => {},
    ...overrides,
  }
}

test("handleGetVaultPacks requires authenticated session", async () => {
  const response = await handleGetVaultPacks(
    deps({
      getSession: async () => null,
    }),
  )

  assert.equal(response.status, 401)
})

test("handleGetVaultPacks returns pack catalog", async () => {
  const response = await handleGetVaultPacks(deps())
  assert.equal(response.status, 200)

  const payload = (await response.json()) as { packs: VaultSeedPackSummary[] }
  assert.equal(payload.packs.length, 1)
  assert.equal(payload.packs[0].id, "popebot")
})

test("handlePostVaultPackInstall validates packId", async () => {
  const response = await handlePostVaultPackInstall(postRequest({ packId: "unknown" }), deps())
  assert.equal(response.status, 400)

  const payload = (await response.json()) as { error: string }
  assert.equal(payload.error, "Invalid packId")
})

test("handlePostVaultPackInstall installs pack and publishes notification", async () => {
  let notified = false
  let installUserId = ""

  const response = await handlePostVaultPackInstall(
    postRequest({ packId: "popebot" }),
    deps({
      installPack: async (args) => {
        installUserId = args.userId
        return INSTALL_RESULT
      },
      notifyPackInstalled: ({ userId, packId }) => {
        notified = userId === "user-1" && packId === "popebot"
      },
    }),
  )

  assert.equal(response.status, 201)
  assert.equal(installUserId, "user-1")
  assert.equal(notified, true)

  const payload = (await response.json()) as VaultSeedPackInstallResponse
  assert.equal(payload.packId, "popebot")
})

test("handlePostVaultPackInstall returns diagnostics for partial failures", async () => {
  const response = await handlePostVaultPackInstall(
    postRequest({ packId: "popebot" }),
    deps({
      installPack: async () => {
        throw new VaultSeedPackInstallError({
          packId: "popebot",
          failedPath: "00-Inbox/PopeBot/PopeBot.md",
          writtenPaths: ["00-Inbox/PopeBot/Video - I Built My Own Clawdbot.md"],
        })
      },
    }),
  )

  assert.equal(response.status, 500)
  const payload = (await response.json()) as {
    failedPath: string
    writtenPaths: string[]
  }

  assert.equal(payload.failedPath, "00-Inbox/PopeBot/PopeBot.md")
  assert.deepEqual(payload.writtenPaths, ["00-Inbox/PopeBot/Video - I Built My Own Clawdbot.md"])
})

