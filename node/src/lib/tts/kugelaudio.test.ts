import assert from "node:assert/strict"
import test from "node:test"
import {
  getKugelAudioTtsConfig,
  resolveKugelAudioVoice,
} from "@/lib/tts/kugelaudio"

const ENV_KEYS = [
  "BRIDGE_TTS_ENABLED",
  "KUGELAUDIO_TTS_BASE_URL",
  "KUGELAUDIO_TTS_TIMEOUT_MS",
  "KUGELAUDIO_TTS_BEARER_TOKEN",
  "KUGELAUDIO_TTS_CFG_SCALE",
  "KUGELAUDIO_TTS_MAX_TOKENS",
  "KUGELAUDIO_TTS_VOICE_DEFAULT",
  "KUGELAUDIO_TTS_VOICE_XO",
  "KUGELAUDIO_TTS_VOICE_OPS",
  "KUGELAUDIO_TTS_VOICE_ENG",
  "KUGELAUDIO_TTS_VOICE_SEC",
  "KUGELAUDIO_TTS_VOICE_MED",
  "KUGELAUDIO_TTS_VOICE_COU",
] as const

function withEnv(overrides: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>, fn: () => void) {
  const previous = new Map<string, string | undefined>()
  for (const key of ENV_KEYS) {
    previous.set(key, process.env[key])
    const next = overrides[key]
    if (next === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = next
    }
  }

  try {
    fn()
  } finally {
    for (const key of ENV_KEYS) {
      const value = previous.get(key)
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

test("getKugelAudioTtsConfig applies defaults when env is missing", () => {
  withEnv(
    {
      BRIDGE_TTS_ENABLED: undefined,
      KUGELAUDIO_TTS_BASE_URL: undefined,
      KUGELAUDIO_TTS_TIMEOUT_MS: undefined,
      KUGELAUDIO_TTS_BEARER_TOKEN: undefined,
      KUGELAUDIO_TTS_CFG_SCALE: undefined,
      KUGELAUDIO_TTS_MAX_TOKENS: undefined,
      KUGELAUDIO_TTS_VOICE_DEFAULT: undefined,
      KUGELAUDIO_TTS_VOICE_XO: undefined,
      KUGELAUDIO_TTS_VOICE_OPS: undefined,
      KUGELAUDIO_TTS_VOICE_ENG: undefined,
      KUGELAUDIO_TTS_VOICE_SEC: undefined,
      KUGELAUDIO_TTS_VOICE_MED: undefined,
      KUGELAUDIO_TTS_VOICE_COU: undefined,
    },
    () => {
      const config = getKugelAudioTtsConfig()
      assert.equal(config.enabled, true)
      assert.equal(config.baseUrl, null)
      assert.equal(config.timeoutMs, 30_000)
      assert.equal(config.bearerToken, null)
      assert.equal(config.cfgScale, 3)
      assert.equal(config.maxTokens, 2048)
      assert.equal(config.defaultVoice, null)
    },
  )
})

test("getKugelAudioTtsConfig reads explicit env values", () => {
  withEnv(
    {
      BRIDGE_TTS_ENABLED: "true",
      KUGELAUDIO_TTS_BASE_URL: "http://kugelaudio:8080",
      KUGELAUDIO_TTS_TIMEOUT_MS: "45000",
      KUGELAUDIO_TTS_BEARER_TOKEN: "token-123",
      KUGELAUDIO_TTS_CFG_SCALE: "4.5",
      KUGELAUDIO_TTS_MAX_TOKENS: "4096",
      KUGELAUDIO_TTS_VOICE_DEFAULT: "default",
      KUGELAUDIO_TTS_VOICE_XO: "xo-voice",
      KUGELAUDIO_TTS_VOICE_OPS: "ops-voice",
      KUGELAUDIO_TTS_VOICE_ENG: "eng-voice",
      KUGELAUDIO_TTS_VOICE_SEC: "sec-voice",
      KUGELAUDIO_TTS_VOICE_MED: "med-voice",
      KUGELAUDIO_TTS_VOICE_COU: "cou-voice",
    },
    () => {
      const config = getKugelAudioTtsConfig()
      assert.equal(config.enabled, true)
      assert.equal(config.baseUrl, "http://kugelaudio:8080")
      assert.equal(config.timeoutMs, 45_000)
      assert.equal(config.bearerToken, "token-123")
      assert.equal(config.cfgScale, 4.5)
      assert.equal(config.maxTokens, 4096)
      assert.equal(config.defaultVoice, "default")
      assert.equal(config.stationVoices.xo, "xo-voice")
      assert.equal(config.stationVoices.ops, "ops-voice")
      assert.equal(config.stationVoices.eng, "eng-voice")
      assert.equal(config.stationVoices.sec, "sec-voice")
      assert.equal(config.stationVoices.med, "med-voice")
      assert.equal(config.stationVoices.cou, "cou-voice")
    },
  )
})

test("resolveKugelAudioVoice prioritizes station voice and falls back to default", () => {
  withEnv(
    {
      BRIDGE_TTS_ENABLED: "true",
      KUGELAUDIO_TTS_BASE_URL: "http://kugelaudio:8080",
      KUGELAUDIO_TTS_VOICE_DEFAULT: "default-voice",
      KUGELAUDIO_TTS_VOICE_XO: "xo-voice",
      KUGELAUDIO_TTS_VOICE_OPS: undefined,
      KUGELAUDIO_TTS_VOICE_ENG: undefined,
      KUGELAUDIO_TTS_VOICE_SEC: undefined,
      KUGELAUDIO_TTS_VOICE_MED: undefined,
      KUGELAUDIO_TTS_VOICE_COU: undefined,
    },
    () => {
      const config = getKugelAudioTtsConfig()
      assert.equal(resolveKugelAudioVoice("xo", config), "xo-voice")
      assert.equal(resolveKugelAudioVoice("ops", config), "default-voice")
      assert.equal(resolveKugelAudioVoice(null, config), "default-voice")
    },
  )
})
