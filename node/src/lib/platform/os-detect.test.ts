import assert from "node:assert/strict"
import test from "node:test"
import { detectDesktopOS } from "./os-detect"

test("detectDesktopOS returns windows for Windows user agents", () => {
  const result = detectDesktopOS({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    platform: "Win32",
  })
  assert.equal(result, "windows")
})

test("detectDesktopOS returns mac for macOS user agents", () => {
  const result = detectDesktopOS({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
    platform: "MacIntel",
  })
  assert.equal(result, "mac")
})

test("detectDesktopOS returns linux for desktop Linux user agents", () => {
  const result = detectDesktopOS({
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    platform: "Linux x86_64",
  })
  assert.equal(result, "linux")
})

test("detectDesktopOS does not treat Android as desktop linux", () => {
  const result = detectDesktopOS({
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36",
    platform: "Linux armv8l",
  })
  assert.equal(result, "unknown")
})

test("detectDesktopOS returns unknown for unrecognized user agents", () => {
  const result = detectDesktopOS({
    userAgent: "SomeThing/1.0",
    platform: "WeirdOS",
  })
  assert.equal(result, "unknown")
})

