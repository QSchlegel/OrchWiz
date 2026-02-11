import assert from "node:assert/strict"
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import test from "node:test"
import {
  listSubagentWorkspaceDirectory,
  readSubagentWorkspaceFile,
  resolveSubagentWorkingDirectoryRoot,
  WorkspaceInspectorError,
} from "./workspace-inspector"

async function withTempRoot(name: string, run: (rootPath: string) => Promise<void>): Promise<void> {
  const rootPath = await mkdtemp(join(tmpdir(), `${name}-`))
  try {
    await run(rootPath)
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
}

test("resolveSubagentWorkingDirectoryRoot resolves relative working directory", async () => {
  await withTempRoot("workspace-inspector-resolve", async (rootPath) => {
    const resolved = resolveSubagentWorkingDirectoryRoot("repo/src", rootPath)
    assert.equal(resolved, resolve(rootPath, "repo/src"))
  })
})

test("resolveSubagentWorkingDirectoryRoot keeps empty directory at workspace root", async () => {
  await withTempRoot("workspace-inspector-empty", async (rootPath) => {
    const resolved = resolveSubagentWorkingDirectoryRoot("", rootPath)
    assert.equal(resolved, resolve(rootPath))
  })
})

test("resolveSubagentWorkingDirectoryRoot rejects traversal and absolute paths", async () => {
  await withTempRoot("workspace-inspector-invalid", async (rootPath) => {
    assert.throws(
      () => resolveSubagentWorkingDirectoryRoot("../outside", rootPath),
      (error: unknown) => error instanceof WorkspaceInspectorError && error.status === 400,
    )
    assert.throws(
      () => resolveSubagentWorkingDirectoryRoot("/absolute", rootPath),
      (error: unknown) => error instanceof WorkspaceInspectorError && error.status === 400,
    )
  })
})

test("listSubagentWorkspaceDirectory returns deterministic folder-first order and truncation", async () => {
  await withTempRoot("workspace-inspector-list", async (rootPath) => {
    await mkdir(join(rootPath, "zeta"))
    await mkdir(join(rootPath, "alpha"))
    await writeFile(join(rootPath, "b.md"), "# b\n")
    await writeFile(join(rootPath, "a.md"), "# a\n")

    const listed = await listSubagentWorkspaceDirectory({
      rootPath,
      pathInput: "",
      maxEntries: 3,
    })

    assert.equal(listed.exists, true)
    assert.equal(listed.truncated, true)
    assert.deepEqual(
      listed.entries.map((entry) => `${entry.nodeType}:${entry.name}`),
      ["folder:alpha", "folder:zeta", "file:a.md"],
    )
  })
})

test("listSubagentWorkspaceDirectory skips symbolic links", async () => {
  await withTempRoot("workspace-inspector-symlink-list", async (rootPath) => {
    await writeFile(join(rootPath, "file.md"), "# file\n")
    await writeFile(join(rootPath, "target.md"), "# target\n")

    let symlinkCreated = false
    try {
      await symlink(join(rootPath, "target.md"), join(rootPath, "link.md"))
      symlinkCreated = true
    } catch {
      symlinkCreated = false
    }

    const listed = await listSubagentWorkspaceDirectory({ rootPath })
    assert.equal(listed.exists, true)

    if (symlinkCreated) {
      assert.equal(
        listed.entries.some((entry) => entry.name === "link.md"),
        false,
      )
    }
  })
})

test("listSubagentWorkspaceDirectory rejects invalid paths", async () => {
  await withTempRoot("workspace-inspector-list-invalid", async (rootPath) => {
    await assert.rejects(
      () =>
        listSubagentWorkspaceDirectory({
          rootPath,
          pathInput: "../outside",
        }),
      (error: unknown) => error instanceof WorkspaceInspectorError && error.status === 400,
    )
  })
})

test("readSubagentWorkspaceFile enforces preview byte cap and truncation", async () => {
  await withTempRoot("workspace-inspector-read", async (rootPath) => {
    await writeFile(join(rootPath, "notes.txt"), "0123456789abcdefghij")

    const file = await readSubagentWorkspaceFile({
      rootPath,
      pathInput: "notes.txt",
      maxBytes: 10,
    })

    assert.equal(file.exists, true)
    assert.equal(file.truncated, true)
    assert.equal(file.isBinary, false)
    assert.equal(file.content, "0123456789")
  })
})

test("readSubagentWorkspaceFile marks binary payloads safely", async () => {
  await withTempRoot("workspace-inspector-binary", async (rootPath) => {
    await writeFile(join(rootPath, "blob.bin"), Buffer.from([0, 1, 2, 3, 4]))

    const file = await readSubagentWorkspaceFile({
      rootPath,
      pathInput: "blob.bin",
    })

    assert.equal(file.exists, true)
    assert.equal(file.isBinary, true)
    assert.equal(file.content, "")
  })
})

test("readSubagentWorkspaceFile rejects traversal and absolute paths", async () => {
  await withTempRoot("workspace-inspector-read-invalid", async (rootPath) => {
    await assert.rejects(
      () =>
        readSubagentWorkspaceFile({
          rootPath,
          pathInput: "../outside.txt",
        }),
      (error: unknown) => error instanceof WorkspaceInspectorError && error.status === 400,
    )
    await assert.rejects(
      () =>
        readSubagentWorkspaceFile({
          rootPath,
          pathInput: "/absolute.txt",
        }),
      (error: unknown) => error instanceof WorkspaceInspectorError && error.status === 400,
    )
  })
})

test("readSubagentWorkspaceFile returns exists=false for missing files", async () => {
  await withTempRoot("workspace-inspector-read-missing", async (rootPath) => {
    const file = await readSubagentWorkspaceFile({
      rootPath,
      pathInput: "missing.md",
    })

    assert.equal(file.exists, false)
    assert.equal(file.content, "")
    assert.equal(file.size, 0)
  })
})
