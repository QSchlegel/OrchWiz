import test from "node:test"
import assert from "node:assert/strict"
import { ensureRecids, nextRecid } from "./recid"

test("nextRecid matches Aurora highest+1 behavior", () => {
  assert.equal(nextRecid([]), 1)
  assert.equal(nextRecid([{ recid: 1 }]), 2)
  assert.equal(nextRecid([{ recid: 5 }, { recid: 2 }]), 6)
  assert.equal(nextRecid([{ recid: "7" }]), 8)
})

test("ensureRecids assigns numeric unique recid values", () => {
  const records = ensureRecids([
    { recid: 1, name: "a" },
    { name: "missing" },
    { recid: 1, name: "dup" },
    { recid: "4", name: "string" },
  ])

  const recids = records.map((r) => r.recid)
  assert.equal(new Set(recids).size, recids.length)
  assert.ok(recids.every((v) => typeof v === "number"))
  assert.ok(recids.includes(1))
  assert.ok(recids.includes(4))
})

