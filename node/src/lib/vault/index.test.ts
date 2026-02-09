import test from "node:test"
import assert from "node:assert/strict"
import { extractVaultLinks, resolveVaultLinkTarget } from "./index"

test("extractVaultLinks parses wiki and markdown links", () => {
  const markdown = `
See [[Architecture]] and [[01-Project-Overview/Node-Concept|Node Concept]].
External [OpenAI](https://openai.com) should stay unresolved.
Relative [API Doc](../03-Technical/API-Documentation.md).
`

  const links = extractVaultLinks(markdown)
  assert.deepEqual(
    links.map((link) => ({ kind: link.kind, target: link.target, label: link.label })),
    [
      { kind: "wiki", target: "Architecture", label: "Architecture" },
      { kind: "wiki", target: "01-Project-Overview/Node-Concept", label: "Node Concept" },
      { kind: "markdown", target: "https://openai.com", label: "OpenAI" },
      { kind: "markdown", target: "../03-Technical/API-Documentation.md", label: "API Doc" },
    ],
  )
})

test("resolveVaultLinkTarget resolves same-vault relative markdown links", () => {
  const resolved = resolveVaultLinkTarget({
    scopeVaultId: "orchwiz",
    sourcePhysicalVaultId: "orchwiz",
    sourcePhysicalPath: "01-Project-Overview/Architecture.md",
    target: "../03-Technical/API-Documentation.md",
    catalogPathsByVault: {
      orchwiz: [
        "01-Project-Overview/Architecture.md",
        "03-Technical/API-Documentation.md",
      ],
    },
  })

  assert.deepEqual(resolved, {
    physicalVaultId: "orchwiz",
    physicalPath: "03-Technical/API-Documentation.md",
  })
})

test("resolveVaultLinkTarget resolves cross-vault target in joined scope", () => {
  const resolved = resolveVaultLinkTarget({
    scopeVaultId: "joined",
    sourcePhysicalVaultId: "orchwiz",
    sourcePhysicalPath: "01-Project-Overview/Architecture.md",
    target: "ship/Bridge.md",
    catalogPathsByVault: {
      orchwiz: ["01-Project-Overview/Architecture.md"],
      ship: ["Bridge.md"],
    },
  })

  assert.deepEqual(resolved, {
    physicalVaultId: "ship",
    physicalPath: "Bridge.md",
  })
})

test("resolveVaultLinkTarget resolves basename wiki link when unique", () => {
  const resolved = resolveVaultLinkTarget({
    scopeVaultId: "joined",
    sourcePhysicalVaultId: "agent-public",
    sourcePhysicalPath: "notes/Log.md",
    target: "Architecture",
    catalogPathsByVault: {
      "agent-public": ["notes/Log.md"],
      orchwiz: ["01-Project-Overview/Architecture.md"],
    },
  })

  assert.equal(resolved, null)
})

test("resolveVaultLinkTarget rejects traversal and external links", () => {
  const traversal = resolveVaultLinkTarget({
    scopeVaultId: "orchwiz",
    sourcePhysicalVaultId: "orchwiz",
    sourcePhysicalPath: "notes/Now.md",
    target: "../../secret.md",
    catalogPathsByVault: {
      orchwiz: ["notes/Now.md", "notes/Next.md"],
    },
  })
  assert.equal(traversal, null)

  const external = resolveVaultLinkTarget({
    scopeVaultId: "orchwiz",
    sourcePhysicalVaultId: "orchwiz",
    sourcePhysicalPath: "notes/Now.md",
    target: "https://example.com",
    catalogPathsByVault: {
      orchwiz: ["notes/Now.md", "notes/Next.md"],
    },
  })
  assert.equal(external, null)
})
