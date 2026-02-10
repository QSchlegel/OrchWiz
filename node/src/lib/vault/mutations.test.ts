import test from "node:test"
import assert from "node:assert/strict"
import { access, mkdir, mkdtemp, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  __setVaultRagMutationSyncForTests,
  deleteVaultFile,
  moveVaultFile,
  saveVaultFile,
  VaultRequestError,
} from "./index"
import { parsePrivateVaultEncryptedEnvelope } from "./private-encryption"

interface TempVaultRepo {
  root: string
  cleanup: () => Promise<void>
}

function applyEnv(values: Record<string, string | undefined>): () => void {
  const effectiveValues = {
    VAULT_RAG_SYNC_ON_WRITE: "false",
    ...values,
  }
  const previous = new Map<string, string | undefined>()

  for (const [key, value] of Object.entries(effectiveValues)) {
    previous.set(key, process.env[key])
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  return () => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

async function pathExists(path: string): Promise<boolean> {
  return access(path).then(() => true).catch(() => false)
}

async function setupTempVaultRepo(options: {
  createOrchwiz?: boolean
  createShip?: boolean
  createAgentPublic?: boolean
  createAgentPrivate?: boolean
} = {}): Promise<TempVaultRepo> {
  const root = await mkdtemp(join(tmpdir(), "orchwiz-vault-tests-"))

  const create = async (relativePath: string) => {
    await mkdir(join(root, relativePath), { recursive: true })
  }

  if (options.createOrchwiz !== false) await create("OWZ-Vault")
  if (options.createShip !== false) await create("Ship-Vault")
  if (options.createAgentPublic !== false) await create("Agent-Vault/public")
  if (options.createAgentPrivate !== false) await create("Agent-Vault/private")

  return {
    root,
    cleanup: async () => {
      await rm(root, { recursive: true, force: true })
    },
  }
}

test("saveVaultFile bootstraps missing vault path on first write", async () => {
  const repo = await setupTempVaultRepo({ createShip: false })
  const restoreEnv = applyEnv({
    VAULT_REPO_ROOT: repo.root,
  })

  try {
    const saved = await saveVaultFile("ship", "notes/first.md", "# Hello")
    assert.equal(saved.path, "notes/first.md")

    const savedPath = join(repo.root, "Ship-Vault", "notes", "first.md")
    assert.equal(await pathExists(savedPath), true)
  } finally {
    restoreEnv()
    await repo.cleanup()
  }
})

test("saveVaultFile triggers incremental RAG upsert sync", async () => {
  const repo = await setupTempVaultRepo()
  const restoreEnv = applyEnv({
    VAULT_REPO_ROOT: repo.root,
    VAULT_RAG_ENABLED: "true",
    VAULT_RAG_SYNC_ON_WRITE: "true",
  })

  const calls: Array<{ upsertJoinedPaths?: string[]; deleteJoinedPaths?: string[] }> = []
  __setVaultRagMutationSyncForTests(async (args) => {
    calls.push(args)
    return null
  })

  try {
    await saveVaultFile("ship", "kb/ships/ship-1/checks.md", "# Checks")
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0].upsertJoinedPaths, ["ship/kb/ships/ship-1/checks.md"])
    assert.deepEqual(calls[0].deleteJoinedPaths, undefined)
  } finally {
    __setVaultRagMutationSyncForTests(null)
    restoreEnv()
    await repo.cleanup()
  }
})

test("moveVaultFile triggers incremental RAG remove+upsert sync", async () => {
  const repo = await setupTempVaultRepo()
  const restoreEnv = applyEnv({
    VAULT_REPO_ROOT: repo.root,
    VAULT_RAG_ENABLED: "true",
    VAULT_RAG_SYNC_ON_WRITE: "true",
  })

  const calls: Array<{ upsertJoinedPaths?: string[]; deleteJoinedPaths?: string[] }> = []
  __setVaultRagMutationSyncForTests(async (args) => {
    calls.push(args)
    return null
  })

  try {
    await saveVaultFile("ship", "kb/fleet/source.md", "# Source")
    calls.length = 0

    await moveVaultFile("ship", "kb/fleet/source.md", "kb/fleet/target.md")
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0].upsertJoinedPaths, ["ship/kb/fleet/target.md"])
    assert.deepEqual(calls[0].deleteJoinedPaths, ["ship/kb/fleet/source.md"])
  } finally {
    __setVaultRagMutationSyncForTests(null)
    restoreEnv()
    await repo.cleanup()
  }
})

test("deleteVaultFile hard mode triggers incremental RAG delete sync", async () => {
  const repo = await setupTempVaultRepo()
  const restoreEnv = applyEnv({
    VAULT_REPO_ROOT: repo.root,
    VAULT_RAG_ENABLED: "true",
    VAULT_RAG_SYNC_ON_WRITE: "true",
  })

  const calls: Array<{ upsertJoinedPaths?: string[]; deleteJoinedPaths?: string[] }> = []
  __setVaultRagMutationSyncForTests(async (args) => {
    calls.push(args)
    return null
  })

  try {
    await saveVaultFile("ship", "kb/fleet/remove.md", "# Remove")
    calls.length = 0

    await deleteVaultFile("ship", "kb/fleet/remove.md", "hard")
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0].deleteJoinedPaths, ["ship/kb/fleet/remove.md"])
    assert.deepEqual(calls[0].upsertJoinedPaths, undefined)
  } finally {
    __setVaultRagMutationSyncForTests(null)
    restoreEnv()
    await repo.cleanup()
  }
})

test("moveVaultFile moves notes within same vault", async () => {
  const repo = await setupTempVaultRepo()
  const restoreEnv = applyEnv({
    VAULT_REPO_ROOT: repo.root,
  })

  try {
    await saveVaultFile("orchwiz", "notes/source.md", "# Source")

    const moved = await moveVaultFile("orchwiz", "notes/source.md", "notes/target.md")
    assert.equal(moved.fromPath, "notes/source.md")
    assert.equal(moved.toPath, "notes/target.md")

    assert.equal(await pathExists(join(repo.root, "OWZ-Vault", "notes", "source.md")), false)
    assert.equal(await pathExists(join(repo.root, "OWZ-Vault", "notes", "target.md")), true)
  } finally {
    restoreEnv()
    await repo.cleanup()
  }
})

test("moveVaultFile blocks cross-vault namespace moves in joined scope", async () => {
  const repo = await setupTempVaultRepo()
  const restoreEnv = applyEnv({
    VAULT_REPO_ROOT: repo.root,
  })

  try {
    await saveVaultFile("orchwiz", "notes/shared.md", "# Shared")

    await assert.rejects(
      () => moveVaultFile("joined", "orchwiz/notes/shared.md", "agent-public/notes/shared.md"),
      (error: unknown) => {
        assert.ok(error instanceof VaultRequestError)
        assert.equal(error.status, 400)
        return true
      },
    )
  } finally {
    restoreEnv()
    await repo.cleanup()
  }
})

test("deleteVaultFile soft mode moves notes into _trash", async () => {
  const repo = await setupTempVaultRepo()
  const restoreEnv = applyEnv({
    VAULT_REPO_ROOT: repo.root,
  })

  try {
    await saveVaultFile("orchwiz", "notes/delete-me.md", "# Remove")

    const deleted = await deleteVaultFile("orchwiz", "notes/delete-me.md", "soft")
    assert.equal(deleted.mode, "soft")
    assert.ok(deleted.deletedPath)
    assert.ok((deleted.deletedPath as string).startsWith("_trash/"))

    assert.equal(await pathExists(join(repo.root, "OWZ-Vault", "notes", "delete-me.md")), false)
    assert.equal(await pathExists(join(repo.root, "OWZ-Vault", deleted.deletedPath as string)), true)
  } finally {
    restoreEnv()
    await repo.cleanup()
  }
})

test("deleteVaultFile hard mode permanently removes note", async () => {
  const repo = await setupTempVaultRepo()
  const restoreEnv = applyEnv({
    VAULT_REPO_ROOT: repo.root,
  })

  try {
    await saveVaultFile("orchwiz", "notes/permanent.md", "# Remove permanently")

    const deleted = await deleteVaultFile("orchwiz", "notes/permanent.md", "hard")
    assert.equal(deleted.mode, "hard")
    assert.equal(deleted.deletedPath, null)
    assert.equal(await pathExists(join(repo.root, "OWZ-Vault", "notes", "permanent.md")), false)
  } finally {
    restoreEnv()
    await repo.cleanup()
  }
})

test("moveVaultFile re-encrypts private notes with destination path context", async () => {
  const repo = await setupTempVaultRepo()
  const restoreEnv = applyEnv({
    VAULT_REPO_ROOT: repo.root,
    WALLET_ENCLAVE_ENABLED: "true",
    WALLET_ENCLAVE_REQUIRE_PRIVATE_MEMORY_ENCRYPTION: "true",
    WALLET_ENCLAVE_URL: "http://127.0.0.1:3377",
  })

  const originalFetch = global.fetch
  global.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input)
    const body = JSON.parse(String(init?.body || "{}")) as Record<string, string>

    if (url.endsWith("/v1/crypto/encrypt")) {
      return new Response(
        JSON.stringify({
          context: body.context,
          ciphertextB64: body.plaintextB64,
          nonceB64: "nonce",
          alg: "AES-256-GCM",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    }

    if (url.endsWith("/v1/crypto/decrypt")) {
      return new Response(
        JSON.stringify({
          context: body.context,
          plaintextB64: body.ciphertextB64,
          alg: "AES-256-GCM",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    }

    return new Response(JSON.stringify({ error: { message: "Not found" } }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    })
  }) as typeof fetch

  try {
    await saveVaultFile("agent-private", "notes/private.md", "top secret")

    const moved = await moveVaultFile("agent-private", "notes/private.md", "notes/moved.md")
    assert.equal(moved.encrypted, true)

    const sourcePath = join(repo.root, "Agent-Vault", "private", "notes", "private.md")
    const targetPath = join(repo.root, "Agent-Vault", "private", "notes", "moved.md")

    assert.equal(await pathExists(sourcePath), false)
    assert.equal(await pathExists(targetPath), true)

    const movedRaw = await readFile(targetPath, "utf8")
    const envelope = parsePrivateVaultEncryptedEnvelope(movedRaw)
    assert.ok(envelope)
    assert.equal(envelope?.context, "vault:agent-private:notes/moved.md")
  } finally {
    global.fetch = originalFetch
    restoreEnv()
    await repo.cleanup()
  }
})
