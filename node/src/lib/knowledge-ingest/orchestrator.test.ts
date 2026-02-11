import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, mkdir, rm, writeFile, unlink } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import type { IngestDeleteRequest, IngestDocument, KnowledgeIngestProvider } from "@/lib/knowledge-ingest/contracts"
import { runKnowledgeIngest } from "./orchestrator"

class StubProvider implements KnowledgeIngestProvider {
  readonly config = {
    id: "stub",
    version: "1",
  }

  readonly capabilities = {
    supportsDelete: true,
    supportsPostProcess: true,
  }

  readonly ingestCalls: string[] = []
  readonly deleteCalls: IngestDeleteRequest[] = []
  postProcessCount = 0

  private failIngestKeys = new Set<string>()

  setFailIngestKeys(keys: string[]): void {
    this.failIngestKeys = new Set(keys)
  }

  async ingestDocument(document: IngestDocument): Promise<{ artifactRef: string }> {
    this.ingestCalls.push(document.key)
    if (this.failIngestKeys.has(document.key)) {
      throw new Error(`ingest failed for ${document.key}`)
    }

    return {
      artifactRef: `artifact:${document.key}`,
    }
  }

  async deleteDocuments(documents: IngestDeleteRequest[]): Promise<void> {
    this.deleteCalls.push(...documents)
  }

  async postProcess(): Promise<void> {
    this.postProcessCount += 1
  }
}

interface TempRepo {
  root: string
  manifestPath: string
  cleanup: () => Promise<void>
}

function applyEnv(values: Record<string, string | undefined>): () => void {
  const previous = new Map<string, string | undefined>()

  for (const [key, value] of Object.entries(values)) {
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

async function setupTempRepo(): Promise<TempRepo> {
  const root = await mkdtemp(join(tmpdir(), "orchwiz-knowledge-ingest-"))
  await mkdir(join(root, "OWZ-Vault", "notes"), { recursive: true })
  await mkdir(join(root, "OWZ-Vault", "_trash"), { recursive: true })
  await mkdir(join(root, "Ship-Vault", "kb", "fleet"), { recursive: true })
  await mkdir(join(root, "Agent-Vault", "public"), { recursive: true })

  const manifestPath = join(root, "knowledge-ingest-manifest.json")

  return {
    root,
    manifestPath,
    cleanup: async () => {
      await rm(root, { recursive: true, force: true })
    },
  }
}

test("orchestrator computes hash delta and excludes _trash notes", async () => {
  const repo = await setupTempRepo()
  const restoreEnv = applyEnv({
    VAULT_REPO_ROOT: repo.root,
  })

  try {
    await writeFile(join(repo.root, "OWZ-Vault", "notes", "A.md"), "# A", "utf8")
    await writeFile(join(repo.root, "OWZ-Vault", "_trash", "Old.md"), "# Old", "utf8")
    await writeFile(join(repo.root, "Ship-Vault", "kb", "fleet", "F.md"), "# Fleet", "utf8")
    await writeFile(join(repo.root, "Agent-Vault", "public", "P.md"), "# Public", "utf8")

    const firstProvider = new StubProvider()
    const first = await runKnowledgeIngest({
      provider: firstProvider,
      manifestPath: repo.manifestPath,
      runPostProcess: false,
      includeTrash: false,
      deleteMissing: true,
    })

    assert.equal(first.counts.scanned, 3)
    assert.equal(first.counts.plannedCreate, 3)
    assert.equal(first.counts.created, 3)
    assert.equal(first.counts.failed, 0)
    assert.equal(firstProvider.ingestCalls.length, 3)

    const secondProvider = new StubProvider()
    const second = await runKnowledgeIngest({
      provider: secondProvider,
      manifestPath: repo.manifestPath,
      runPostProcess: false,
      includeTrash: false,
      deleteMissing: true,
    })

    assert.equal(second.counts.plannedCreate, 0)
    assert.equal(second.counts.plannedUpdate, 0)
    assert.equal(second.counts.unchanged, 3)
    assert.equal(secondProvider.ingestCalls.length, 0)

    await writeFile(join(repo.root, "OWZ-Vault", "notes", "A.md"), "# A changed", "utf8")

    const thirdProvider = new StubProvider()
    const third = await runKnowledgeIngest({
      provider: thirdProvider,
      manifestPath: repo.manifestPath,
      runPostProcess: false,
      includeTrash: false,
      deleteMissing: true,
    })

    assert.equal(third.counts.plannedUpdate, 1)
    assert.equal(third.counts.updated, 1)
    assert.equal(thirdProvider.deleteCalls.length, 1)
    assert.equal(thirdProvider.deleteCalls[0]?.reason, "updated")
  } finally {
    restoreEnv()
    await repo.cleanup()
  }
})

test("orchestrator deletes missing files when deleteMissing is enabled", async () => {
  const repo = await setupTempRepo()
  const restoreEnv = applyEnv({
    VAULT_REPO_ROOT: repo.root,
  })

  try {
    await writeFile(join(repo.root, "OWZ-Vault", "notes", "A.md"), "# A", "utf8")
    await writeFile(join(repo.root, "Ship-Vault", "kb", "fleet", "F.md"), "# Fleet", "utf8")

    const initialProvider = new StubProvider()
    await runKnowledgeIngest({
      provider: initialProvider,
      manifestPath: repo.manifestPath,
      runPostProcess: false,
      includeTrash: false,
      deleteMissing: true,
    })

    await unlink(join(repo.root, "Ship-Vault", "kb", "fleet", "F.md"))

    const deleteProvider = new StubProvider()
    const summary = await runKnowledgeIngest({
      provider: deleteProvider,
      manifestPath: repo.manifestPath,
      runPostProcess: false,
      includeTrash: false,
      deleteMissing: true,
    })

    assert.equal(summary.counts.plannedDelete, 1)
    assert.equal(summary.counts.deleted, 1)
    assert.equal(deleteProvider.deleteCalls.length, 1)
    assert.equal(deleteProvider.deleteCalls[0]?.reason, "deleted")
  } finally {
    restoreEnv()
    await repo.cleanup()
  }
})

test("orchestrator continues ingest when continueOnError is enabled", async () => {
  const repo = await setupTempRepo()
  const restoreEnv = applyEnv({
    VAULT_REPO_ROOT: repo.root,
  })

  try {
    await writeFile(join(repo.root, "OWZ-Vault", "notes", "A.md"), "# A", "utf8")
    await writeFile(join(repo.root, "OWZ-Vault", "notes", "B.md"), "# B", "utf8")

    const provider = new StubProvider()
    provider.setFailIngestKeys(["orchwiz:notes/A.md"])

    const summary = await runKnowledgeIngest({
      provider,
      manifestPath: repo.manifestPath,
      runPostProcess: false,
      includeTrash: false,
      continueOnError: true,
    })

    assert.equal(summary.counts.failed, 1)
    assert.equal(summary.counts.created, 1)
    assert.equal(provider.ingestCalls.length, 2)
    assert.ok(summary.failures.some((entry) => entry.key === "orchwiz:notes/A.md"))
  } finally {
    restoreEnv()
    await repo.cleanup()
  }
})
