import assert from "node:assert/strict"
import test from "node:test"
import { buildToolchainDescriptorInstructionBlock } from "@/lib/toolchains/registry"

test("buildToolchainDescriptorInstructionBlock returns empty string for no descriptors", () => {
  assert.equal(buildToolchainDescriptorInstructionBlock([]), "")
})

test("buildToolchainDescriptorInstructionBlock renders descriptor summary lines", () => {
  const block = buildToolchainDescriptorInstructionBlock([
    {
      catalogEntryId: "tool-1",
      slug: "wallet-enclave",
      name: "Wallet Enclave",
      description: null,
      protocol: "webhook",
      endpoint: "https://tools.internal/wallet",
      authRef: "env:WALLET_TOKEN",
      capabilities: {},
      scope: {
        channel: "quartermaster",
        shipDeploymentId: "ship-1",
        bridgeCrewId: null,
        subagentId: "sub-1",
      },
    },
  ])

  assert.match(block, /Toolchain Descriptors:/)
  assert.match(block, /wallet-enclave \(webhook\) @ https:\/\/tools.internal\/wallet/)
})
