import assert from "node:assert/strict"
import test from "node:test"
import {
  buildHetznerSshKeySubmissionSnippet,
  generateEd25519SshKeyPair,
} from "@/lib/shipyard/cloud/ssh-keys"

test("buildHetznerSshKeySubmissionSnippet builds payload and curl command", () => {
  const snippet = buildHetznerSshKeySubmissionSnippet({
    keyName: "orchwiz-key",
    publicKey: "ssh-ed25519 AAAATEST",
  })

  assert.deepEqual(snippet.payload, {
    name: "orchwiz-key",
    public_key: "ssh-ed25519 AAAATEST",
  })
  assert.match(snippet.curl, /api\.hetzner\.cloud\/v1\/ssh_keys/)
  assert.match(snippet.curl, /Authorization: Bearer <HETZNER_API_TOKEN>/)
})

test("generateEd25519SshKeyPair rejects invalid key name before execution", async () => {
  await assert.rejects(
    () =>
      generateEd25519SshKeyPair({
        name: "   ",
      }),
    /name is required/i,
  )
})
