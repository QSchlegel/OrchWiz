import type { BridgeStationKey } from "@/lib/bridge/stations"

export const VOICE_UNDO_DELAY_MS = 2500
export const SUBTITLE_FADE_MS = 8000
export const SUBTITLE_CYCLE_MS = 900

const STATION_KEYWORDS: Array<{ stationKey: BridgeStationKey; patterns: RegExp[] }> = [
  {
    stationKey: "xo",
    patterns: [/\bxo\b/i, /\bexecutive officer\b/i, /\bcommand\b/i],
  },
  {
    stationKey: "ops",
    patterns: [/\bops\b/i, /\boperations\b/i, /\bdeploy(?:ment)?\b/i],
  },
  {
    stationKey: "eng",
    patterns: [/\beng\b/i, /\bengineering\b/i, /\binfrastructure\b/i, /\bincident\b/i],
  },
  {
    stationKey: "sec",
    patterns: [/\bsec\b/i, /\bsecurity\b/i, /\bpolicy\b/i, /\baudit\b/i],
  },
  {
    stationKey: "med",
    patterns: [/\bmed\b/i, /\bmedical\b/i, /\bhealth\b/i],
  },
  {
    stationKey: "cou",
    patterns: [/\bcou\b/i, /\bcomms?\b/i, /\bcommunications?\b/i, /\bnotify\b/i],
  },
]

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

export function normalizeVoiceTranscript(value: unknown): string {
  if (typeof value !== "string") {
    return ""
  }

  return normalizeWhitespace(value)
}

export function resolveStationFromTranscript(args: {
  transcript: string
  availableStationKeys: BridgeStationKey[]
  fallbackStationKey?: BridgeStationKey
}): BridgeStationKey {
  const normalized = normalizeVoiceTranscript(args.transcript)
  const fallbackStationKey = args.fallbackStationKey || "xo"

  if (!normalized) {
    return fallbackStationKey
  }

  const available = new Set(args.availableStationKeys)
  for (const keyword of STATION_KEYWORDS) {
    if (!available.has(keyword.stationKey)) {
      continue
    }

    if (keyword.patterns.some((pattern) => pattern.test(normalized))) {
      return keyword.stationKey
    }
  }

  return available.has(fallbackStationKey) ? fallbackStationKey : args.availableStationKeys[0] || fallbackStationKey
}

export function speechRecognitionSupported(): boolean {
  if (typeof window === "undefined") {
    return false
  }

  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
}

export function speechSynthesisSupported(): boolean {
  if (typeof window === "undefined") {
    return false
  }

  return Boolean(window.speechSynthesis)
}

export function createSpeechRecognition(): SpeechRecognition | null {
  if (typeof window === "undefined") {
    return null
  }

  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!Ctor) {
    return null
  }

  return new Ctor()
}

export function isTextInputElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  const tagName = target.tagName.toLowerCase()
  if (tagName === "textarea") {
    return true
  }

  if (tagName === "input") {
    return true
  }

  return target.isContentEditable
}
