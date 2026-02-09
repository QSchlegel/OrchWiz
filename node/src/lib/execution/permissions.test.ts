import test from "node:test"
import assert from "node:assert/strict"
import { matchesCommandPattern } from "./permissions"

test("matches wildcard command patterns", () => {
  assert.equal(matchesCommandPattern("bun run build:*", "bun run build:web"), true)
  assert.equal(matchesCommandPattern("git *", "git status"), true)
  assert.equal(matchesCommandPattern("npm test", "npm run test"), false)
})

