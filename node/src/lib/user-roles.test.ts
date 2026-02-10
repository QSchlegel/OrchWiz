import test from "node:test"
import assert from "node:assert/strict"
import {
  configuredRoleForEmail,
  hasRequiredUserRole,
  normalizeUserRole,
} from "./user-roles"

test("normalizeUserRole defaults unknown values to captain", () => {
  assert.equal(normalizeUserRole("captain"), "captain")
  assert.equal(normalizeUserRole("admin"), "admin")
  assert.equal(normalizeUserRole("unknown"), "captain")
})

test("hasRequiredUserRole enforces captain/admin hierarchy", () => {
  assert.equal(hasRequiredUserRole("captain", "captain"), true)
  assert.equal(hasRequiredUserRole("captain", "admin"), false)
  assert.equal(hasRequiredUserRole("admin", "captain"), true)
  assert.equal(hasRequiredUserRole("admin", "admin"), true)
})

test("configuredRoleForEmail resolves admins from ORCHWIZ_ADMIN_EMAILS", () => {
  const previous = process.env.ORCHWIZ_ADMIN_EMAILS
  process.env.ORCHWIZ_ADMIN_EMAILS = "admin@example.com, ops@example.com"

  try {
    assert.equal(configuredRoleForEmail("admin@example.com"), "admin")
    assert.equal(configuredRoleForEmail("OPS@example.com"), "admin")
    assert.equal(configuredRoleForEmail("captain@example.com"), null)
  } finally {
    if (previous === undefined) {
      delete process.env.ORCHWIZ_ADMIN_EMAILS
    } else {
      process.env.ORCHWIZ_ADMIN_EMAILS = previous
    }
  }
})
