import test from "node:test"
import assert from "node:assert/strict"
import { extractGuidanceEntries } from "./guidance-parser"

test("extractGuidanceEntries parses headings and bullet items", () => {
  const markdown = `
## Security
- Do not commit secrets
- Use HTTPS everywhere

## Security
- Do not commit secrets

1. Keep logs minimal
`

  const entries = extractGuidanceEntries(markdown)
  assert.equal(entries.length, 3)
  assert.deepEqual(entries[0], {
    category: "Security",
    content: "Do not commit secrets",
  })
  assert.deepEqual(entries[1], {
    category: "Security",
    content: "Use HTTPS everywhere",
  })
})
