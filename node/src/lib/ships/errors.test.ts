import assert from "node:assert/strict"
import test from "node:test"
import {
  buildShipNotFoundErrorPayload,
  isShipNotFoundApiError,
  SHIP_NOT_FOUND_CODE,
} from "./errors"

test("buildShipNotFoundErrorPayload returns legacy message with stable code", () => {
  assert.deepEqual(buildShipNotFoundErrorPayload(), {
    error: "Ship not found",
    code: SHIP_NOT_FOUND_CODE,
  })
})

test("isShipNotFoundApiError returns true for coded ship-not-found payloads", () => {
  assert.equal(
    isShipNotFoundApiError({
      error: "Ship not found",
      code: SHIP_NOT_FOUND_CODE,
    }),
    true,
  )
})

test("isShipNotFoundApiError supports legacy 404 payloads", () => {
  assert.equal(
    isShipNotFoundApiError(
      {
        error: "Ship not found",
      },
      404,
    ),
    true,
  )
  assert.equal(
    isShipNotFoundApiError(
      {
        error: "Ship not found",
      },
      500,
    ),
    false,
  )
})
