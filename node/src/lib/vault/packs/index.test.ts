import assert from "node:assert/strict"
import test from "node:test"
import { buildVaultSeedPackFiles, getVaultSeedPack, listVaultSeedPacks } from "./index"

test("vault seed pack registry includes popebot summary", () => {
  const packs = listVaultSeedPacks()
  const popebot = packs.find((pack) => pack.id === "popebot")

  assert.ok(popebot)
  assert.equal(popebot?.label, "PopeBot Notes")
  assert.equal(popebot?.vaultId, "orchwiz")
  assert.equal(popebot?.targetRoot, "00-Inbox/PopeBot")
  assert.equal(popebot?.noteCount, 5)
})

test("getVaultSeedPack returns null for unknown pack", () => {
  assert.equal(getVaultSeedPack("missing-pack"), null)
})

test("buildVaultSeedPackFiles applies createdDate token and generates expected paths", () => {
  const built = buildVaultSeedPackFiles("popebot", {
    createdDate: "2026-02-11",
  })

  assert.equal(built.pack.id, "popebot")
  assert.equal(built.createdDate, "2026-02-11")
  assert.equal(built.files.length, 5)
  assert.equal(built.files[0].path, "00-Inbox/PopeBot/Video - I Built My Own Clawdbot.md")
  assert.equal(built.files[1].path, "00-Inbox/PopeBot/PopeBot.md")
  assert.equal(built.files[0].content.includes("created: 2026-02-11"), true)
  assert.equal(built.files[0].content.includes("{{createdDate}}"), false)
})

