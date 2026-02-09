import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  loadSubagentContextFiles,
  parseContextFilesFromContent,
  persistSubagentContextFiles,
} from "./context-files"

test("loadSubagentContextFiles prefers filesystem source and computes totals", async (t) => {
  const repoRoot = await mkdtemp(join(tmpdir(), "orchwiz-context-files-"))
  t.after(async () => {
    await rm(repoRoot, { recursive: true, force: true })
  })

  const agentDir = join(repoRoot, ".claude/agents/bridge-crew/xo-cb01")
  await mkdir(agentDir, { recursive: true })
  await writeFile(join(agentDir, "SOUL.md"), "mission first\n", "utf8")
  await writeFile(join(agentDir, "MISSION.md"), "coordinate crew\n", "utf8")

  const loaded = await loadSubagentContextFiles({
    repoRoot,
    subagent: {
      name: "XO-CB01",
      path: ".claude/agents/bridge-crew/xo-cb01/SOUL.md",
      content: "# PROMPT.md\nlegacy",
    },
  })

  assert.equal(loaded.source, "filesystem")
  assert.equal(loaded.rootPath, ".claude/agents/bridge-crew/xo-cb01")
  assert.deepEqual(loaded.files.map((file) => file.fileName), ["SOUL.md", "MISSION.md"])
  assert.equal(loaded.totals.wordCount, 4)
  assert.equal(loaded.totals.estimatedTokens, 6)
})

test("loadSubagentContextFiles falls back to structured content", async (t) => {
  const repoRoot = await mkdtemp(join(tmpdir(), "orchwiz-context-files-"))
  t.after(async () => {
    await rm(repoRoot, { recursive: true, force: true })
  })

  const loaded = await loadSubagentContextFiles({
    repoRoot,
    subagent: {
      name: "COU-DEA",
      path: ".claude/agents/bridge-crew/cou-dea/SOUL.md",
      content: "# SOUL.md\n- concise\n\n# MISSION.md\n- relay",
    },
  })

  assert.equal(loaded.source, "content-fallback")
  assert.deepEqual(loaded.files.map((file) => file.fileName), ["SOUL.md", "MISSION.md"])
})

test("persistSubagentContextFiles writes files and recomposes legacy content", async (t) => {
  const repoRoot = await mkdtemp(join(tmpdir(), "orchwiz-context-files-"))
  t.after(async () => {
    await rm(repoRoot, { recursive: true, force: true })
  })

  const saved = await persistSubagentContextFiles({
    repoRoot,
    subagent: {
      name: "COU-DEA",
      path: ".claude/agents/bridge-crew/cou-dea/SOUL.md",
    },
    files: [
      { fileName: "MISSION.md", content: "- relay status updates" },
      { fileName: "SOUL.md", content: "- calm and clear" },
    ],
  })

  const soul = await readFile(join(repoRoot, ".claude/agents/bridge-crew/cou-dea/SOUL.md"), "utf8")
  assert.equal(soul.trim(), "- calm and clear")
  assert.equal(saved.path, ".claude/agents/bridge-crew/cou-dea/SOUL.md")
  assert.equal(saved.content.includes("# SOUL.md"), true)
  assert.equal(saved.content.includes("# MISSION.md"), true)
})

test("persistSubagentContextFiles rejects unsafe file names", async (t) => {
  const repoRoot = await mkdtemp(join(tmpdir(), "orchwiz-context-files-"))
  t.after(async () => {
    await rm(repoRoot, { recursive: true, force: true })
  })

  await assert.rejects(
    () =>
      persistSubagentContextFiles({
        repoRoot,
        subagent: {
          name: "Unsafe",
          path: null,
        },
        files: [{ fileName: "../SECRETS.md", content: "nope" }],
      }),
    /Invalid context file name/,
  )
})

test("parseContextFilesFromContent falls back to PROMPT when no headings", () => {
  const files = parseContextFilesFromContent("plain unstructured instructions")
  assert.equal(files.length, 1)
  assert.equal(files[0].fileName, "PROMPT.md")
})
