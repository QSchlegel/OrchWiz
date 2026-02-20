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
  const npmCiIndex = contents.indexOf("npm ci --no-audit --fund=false")

  assert.ok(copyIndex !== -1, "expected COPY of fix-libsodium-wrappers-sumo.cjs to exist")
  assert.ok(npmCiIndex !== -1, "expected npm ci command to exist")
  assert.ok(copyIndex < npmCiIndex, "expected postinstall script to be copied before npm ci")
})

test("Dockerfile.shipyard installs node-gyp toolchain before npm ci", () => {
  const contents = readDockerfile("Dockerfile.shipyard")
  const installIndex = contents.indexOf("apt-get install -y --no-install-recommends python3 make g++")
  const npmCiIndex = contents.indexOf("npm ci --no-audit --fund=false")

  assert.ok(installIndex !== -1, "expected apt-get install of python3/make/g++ to exist")
  assert.ok(npmCiIndex !== -1, "expected npm ci command to exist")
  assert.ok(installIndex < npmCiIndex, "expected node-gyp toolchain install before npm ci")
})

test("Dockerfile deps stage copies postinstall script before npm ci", () => {
  const contents = readDockerfile("Dockerfile")
  const copyIndex = contents.indexOf("COPY scripts/fix-libsodium-wrappers-sumo.cjs")
  const npmCiIndex = contents.indexOf("RUN npm ci")

  assert.ok(copyIndex !== -1, "expected COPY of fix-libsodium-wrappers-sumo.cjs to exist")
  assert.ok(npmCiIndex !== -1, "expected RUN npm ci to exist")
  assert.ok(copyIndex < npmCiIndex, "expected postinstall script to be copied before npm ci")
})
