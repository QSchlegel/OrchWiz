import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

function readDockerfile(relativeFromNodeRoot: string): string {
  const filename = fileURLToPath(import.meta.url)
  const here = dirname(filename)
  const nodeRoot = resolve(here, "../../../")
  return readFileSync(resolve(nodeRoot, relativeFromNodeRoot), "utf8")
}

test("Dockerfile.shipyard copies postinstall script before npm ci", () => {
  const contents = readDockerfile("Dockerfile.shipyard")
  const copyIndex = contents.indexOf("COPY scripts/fix-libsodium-wrappers-sumo.cjs")
  const npmCiIndex = contents.indexOf("RUN npm ci")

  assert.ok(copyIndex !== -1, "expected COPY of fix-libsodium-wrappers-sumo.cjs to exist")
  assert.ok(npmCiIndex !== -1, "expected RUN npm ci to exist")
  assert.ok(copyIndex < npmCiIndex, "expected postinstall script to be copied before npm ci")
})

test("Dockerfile deps stage copies postinstall script before npm ci", () => {
  const contents = readDockerfile("Dockerfile")
  const copyIndex = contents.indexOf("COPY scripts/fix-libsodium-wrappers-sumo.cjs")
  const npmCiIndex = contents.indexOf("RUN npm ci")

  assert.ok(copyIndex !== -1, "expected COPY of fix-libsodium-wrappers-sumo.cjs to exist")
  assert.ok(npmCiIndex !== -1, "expected RUN npm ci to exist")
  assert.ok(copyIndex < npmCiIndex, "expected postinstall script to be copied before npm ci")
})

