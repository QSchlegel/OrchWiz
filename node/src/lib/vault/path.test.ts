import test from "node:test"
import assert from "node:assert/strict"
import { resolvePathWithinRoot, sanitizeRelativeVaultPath } from "./path"

test("sanitizeRelativeVaultPath accepts valid markdown path", () => {
  const path = sanitizeRelativeVaultPath("01-Project-Overview/Architecture.md", {
    requireMarkdown: true,
  })
  assert.equal(path, "01-Project-Overview/Architecture.md")
})

test("sanitizeRelativeVaultPath rejects absolute paths", () => {
  assert.throws(
    () => sanitizeRelativeVaultPath("/etc/passwd", { requireMarkdown: true }),
    /Absolute paths are not allowed/,
  )
})

test("sanitizeRelativeVaultPath rejects traversal", () => {
  assert.throws(
    () => sanitizeRelativeVaultPath("../secrets.md", { requireMarkdown: true }),
    /Path traversal is not allowed/,
  )
})

test("sanitizeRelativeVaultPath rejects non-markdown path when markdown is required", () => {
  assert.throws(
    () => sanitizeRelativeVaultPath("folder/image.png", { requireMarkdown: true }),
    /Only markdown notes are supported/,
  )
})

test("resolvePathWithinRoot keeps path inside root", () => {
  const absolute = resolvePathWithinRoot("/tmp/root", "docs/readme.md")
  assert.equal(absolute, "/tmp/root/docs/readme.md")
})

test("resolvePathWithinRoot rejects escaping root", () => {
  assert.throws(() => resolvePathWithinRoot("/tmp/root", "../outside.md"), /escapes vault root/)
})
