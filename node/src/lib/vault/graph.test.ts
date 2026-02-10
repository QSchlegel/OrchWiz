import test from "node:test"
import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { getVaultGraph, saveVaultFile } from "./index"

interface TempVaultRepo {
  root: string
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

async function setupTempVaultRepo(): Promise<TempVaultRepo> {
  const root = await mkdtemp(join(tmpdir(), "orchwiz-vault-graph-tests-"))
  await mkdir(join(root, "OWZ-Vault"), { recursive: true })
  await mkdir(join(root, "Ship-Vault"), { recursive: true })
  await mkdir(join(root, "Agent-Vault", "public"), { recursive: true })
  await mkdir(join(root, "Agent-Vault", "private"), { recursive: true })

  return {
    root,
    cleanup: async () => {
      await rm(root, { recursive: true, force: true })
    },
  }
}

test("getVaultGraph returns resolved edges and unresolved ghost nodes", async () => {
  const repo = await setupTempVaultRepo()
  const restoreEnv = applyEnv({ VAULT_REPO_ROOT: repo.root })

  try {
    await saveVaultFile("orchwiz", "notes/A.md", "[[B]]\n[[Missing-Doc]]\n[Bridge](ship/Bridge.md)")
    await saveVaultFile("orchwiz", "notes/B.md", "[Back](A.md)")
    await saveVaultFile("ship", "Bridge.md", "# Bridge")

    const graph = await getVaultGraph("joined", { includeUnresolved: true })

    const paths = graph.nodes.map((node) => node.path)
    assert.ok(paths.includes("orchwiz/notes/A.md"))
    assert.ok(paths.includes("orchwiz/notes/B.md"))
    assert.ok(paths.includes("ship/Bridge.md"))

    const ghostNodes = graph.nodes.filter((node) => node.nodeType === "ghost")
    assert.ok(ghostNodes.some((node) => node.path === "Missing-Doc"))

    assert.ok(graph.edges.some((edge) => edge.edgeType === "resolved" && edge.targetPath === "ship/Bridge.md"))
    assert.ok(graph.edges.some((edge) => edge.edgeType === "unresolved" && edge.targetPath === "Missing-Doc"))
  } finally {
    restoreEnv()
    await repo.cleanup()
  }
})

test("getVaultGraph respects focus depth in joined graph", async () => {
  const repo = await setupTempVaultRepo()
  const restoreEnv = applyEnv({ VAULT_REPO_ROOT: repo.root })

  try {
    await saveVaultFile("orchwiz", "notes/A.md", "[[B]]")
    await saveVaultFile("orchwiz", "notes/B.md", "[[C]]")
    await saveVaultFile("orchwiz", "notes/C.md", "# Deep")
    await saveVaultFile("ship", "Bridge.md", "# Bridge")
    await saveVaultFile("orchwiz", "notes/A.md", "[[B]]\n[Bridge](ship/Bridge.md)")

    const graph = await getVaultGraph("joined", {
      focusPath: "orchwiz/notes/A.md",
      depth: 1,
      includeUnresolved: false,
    })

    const paths = graph.nodes.filter((node) => node.nodeType === "note").map((node) => node.path)
    assert.ok(paths.includes("orchwiz/notes/A.md"))
    assert.ok(paths.includes("orchwiz/notes/B.md"))
    assert.ok(paths.includes("ship/Bridge.md"))
    assert.equal(paths.includes("orchwiz/notes/C.md"), false)
  } finally {
    restoreEnv()
    await repo.cleanup()
  }
})

test("getVaultGraph excludes trash nodes by default", async () => {
  const repo = await setupTempVaultRepo()
  const restoreEnv = applyEnv({ VAULT_REPO_ROOT: repo.root })

  try {
    await saveVaultFile("orchwiz", "notes/Active.md", "# Active")
    await saveVaultFile("orchwiz", "_trash/2026-02-10T12:00:00.000Z/Old.md", "# Old")

    const withoutTrash = await getVaultGraph("orchwiz", { includeTrash: false })
    assert.equal(withoutTrash.nodes.some((node) => node.path.includes("_trash/")), false)

    const withTrash = await getVaultGraph("orchwiz", { includeTrash: true })
    assert.equal(withTrash.nodes.some((node) => node.path.includes("_trash/")), true)
  } finally {
    restoreEnv()
    await repo.cleanup()
  }
})

test("getVaultGraph sets truncated flag when note count exceeds cap", async () => {
  const repo = await setupTempVaultRepo()
  const restoreEnv = applyEnv({ VAULT_REPO_ROOT: repo.root })

  try {
    for (let index = 0; index < 2010; index += 1) {
      const path = `bulk/note-${String(index).padStart(4, "0")}.md`
      await saveVaultFile("orchwiz", path, `# ${index}`)
    }

    const graph = await getVaultGraph("orchwiz", { includeUnresolved: false })
    assert.equal(graph.stats.truncated, true)
    assert.ok(graph.nodes.length <= 2000)
  } finally {
    restoreEnv()
    await repo.cleanup()
  }
})
