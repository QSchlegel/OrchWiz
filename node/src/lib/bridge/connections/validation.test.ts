import test from "node:test"
import assert from "node:assert/strict"
import {
  BridgeConnectionValidationError,
  parseBridgeConnectionCreateInput,
  validateBridgeConnectionCredentials,
  validateBridgeConnectionDestination,
} from "./validation"

test("parseBridgeConnectionCreateInput parses telegram payload", () => {
  const parsed = parseBridgeConnectionCreateInput({
    provider: "telegram",
    name: "Ops Telegram",
    destination: "-100123",
    enabled: true,
    autoRelay: false,
    config: { parseMode: "MarkdownV2" },
    credentials: {
      botToken: "1234:abc",
    },
  })

  assert.equal(parsed.provider, "telegram")
  assert.equal(parsed.destination, "-100123")
  assert.equal(parsed.enabled, true)
  assert.equal(parsed.autoRelay, false)
  assert.deepEqual(parsed.config, { parseMode: "MarkdownV2" })
})

test("validateBridgeConnectionDestination enforces WhatsApp E.164 format", () => {
  assert.equal(validateBridgeConnectionDestination("whatsapp", "+15551234567"), "+15551234567")
  assert.throws(
    () => validateBridgeConnectionDestination("whatsapp", "5551234567"),
    BridgeConnectionValidationError,
  )
})

test("validateBridgeConnectionCredentials enforces Discord webhook url", () => {
  const parsed = validateBridgeConnectionCredentials("discord", {
    webhookUrl: "https://discord.com/api/webhooks/1/abc",
  })
  assert.deepEqual(parsed, {
    webhookUrl: "https://discord.com/api/webhooks/1/abc",
  })

  assert.throws(
    () => validateBridgeConnectionCredentials("discord", { webhookUrl: "http://discord.com/nope" }),
    BridgeConnectionValidationError,
  )
})
