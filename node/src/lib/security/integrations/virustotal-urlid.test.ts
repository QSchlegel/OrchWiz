import test from "node:test"
import assert from "node:assert/strict"
import { buildVirusTotalUrlId } from "./virustotal"

test("buildVirusTotalUrlId uses url-safe base64 without padding", () => {
  const id = buildVirusTotalUrlId("https://example.com/")
  assert.equal(id, "aHR0cHM6Ly9leGFtcGxlLmNvbS8")
  assert.equal(id.includes("="), false)
  assert.equal(id.includes("+"), false)
  assert.equal(id.includes("/"), false)
})
