import assert from "node:assert/strict"
import test, { after, before } from "node:test"
import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

let repoRoot = ""
let cloudFiles: typeof import("@/lib/shipyard/cloud/files")
let originalRepoRootEnv: string | undefined

before(async () => {
  originalRepoRootEnv = process.env.ORCHWIZ_REPO_ROOT
  repoRoot = await mkdtemp(join(tmpdir(), "orchwiz-cloud-files-test-"))
  process.env.ORCHWIZ_REPO_ROOT = repoRoot
  cloudFiles = await import("@/lib/shipyard/cloud/files")
})

after(() => {
  if (originalRepoRootEnv === undefined) {
    delete process.env.ORCHWIZ_REPO_ROOT
  } else {
    process.env.ORCHWIZ_REPO_ROOT = originalRepoRootEnv
  }
})

test("renderHetznerFileBundle renders each allowlisted path", () => {
  const bundle = cloudFiles.renderHetznerFileBundle({
    config: {
      provider: "hetzner",
      cluster: {
        clusterName: "edge",
        location: "nbg1",
        networkCidr: "10.42.0.0/16",
        image: "ubuntu-24.04",
        controlPlane: {
          machineType: "cx22",
          count: 1,
        },
        workers: {
          machineType: "cx32",
          count: 2,
        },
      },
      stackMode: "full_support_systems",
      k3s: {
        channel: "stable",
        disableTraefik: true,
      },
      tunnelPolicy: {
        manage: true,
        target: "kubernetes_api",
        localPort: 16443,
      },
      sshKeyId: "key-1",
    },
    sshPublicKey: "ssh-ed25519 AAAATEST",
  })

  assert.equal(Object.keys(bundle).length, cloudFiles.SHIPYARD_CLOUD_FILE_ALLOWLIST.length)
  for (const path of cloudFiles.SHIPYARD_CLOUD_FILE_ALLOWLIST) {
    assert.equal(typeof bundle[path], "string")
    assert.ok(bundle[path].length > 0)
  }
})

test("writeShipyardCloudEditableFiles writes allowlisted files", async () => {
  const targetPath = cloudFiles.SHIPYARD_CLOUD_FILE_ALLOWLIST[0]
  const content = "terraform {}\n"

  const saved = await cloudFiles.writeShipyardCloudEditableFiles({
    files: [
      {
        path: targetPath,
        content,
      },
    ],
  })

  assert.equal(saved.length, 1)
  assert.equal(saved[0].path, targetPath)

  const diskContent = await readFile(join(repoRoot, targetPath), "utf8")
  assert.equal(diskContent, content)
})

test("writeShipyardCloudEditableFiles rejects non-allowlisted paths", async () => {
  await assert.rejects(
    () =>
      cloudFiles.writeShipyardCloudEditableFiles({
        files: [
          {
            path: "../../etc/passwd",
            content: "nope",
          },
        ],
      }),
    /allowlist/i,
  )
})
