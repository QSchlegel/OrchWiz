import crypto from "node:crypto"

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function normalizeText(value: string): string {
  return value.replace(/\r\n/g, "\n").trim()
}

function renderMessageContent(content: unknown): string {
  if (typeof content === "string") {
    return content
  }

  if (Array.isArray(content)) {
    // Supports both ChatCompletions style (`[{type:"text", text:"..."}]`) and
    // generic arrays by joining best-effort string fields.
    const parts: string[] = []
    for (const entry of content) {
      const record = asRecord(entry)
      const text = asString(record.text) || asString(record.value) || asString(record.content)
      if (text) {
        parts.push(text)
      }
    }
    return parts.join("\n")
  }

  return JSON.stringify(content)
}

export function extractResponsesInputPrompt(input: unknown): string {
  if (typeof input === "string") {
    return normalizeText(input)
  }

  if (Array.isArray(input)) {
    const parts: string[] = []
    for (const entry of input) {
      const record = asRecord(entry)
      const role = asString(record.role) || "user"
      const content = renderMessageContent(record.content ?? record.input ?? record.text)
      if (!content.trim()) continue
      parts.push(`${role.toUpperCase()}: ${content}`)
    }
    return normalizeText(parts.join("\n\n"))
  }

  if (input && typeof input === "object") {
    const record = asRecord(input)
    const content = asString(record.text) || asString(record.input) || asString(record.content)
    if (content) {
      return normalizeText(content)
    }
  }

  return normalizeText(JSON.stringify(input))
}

export function extractChatCompletionsPrompt(messages: unknown): string {
  if (!Array.isArray(messages)) {
    return ""
  }

  const parts: string[] = []
  for (const message of messages) {
    const record = asRecord(message)
    const role = asString(record.role) || "user"
    const content = renderMessageContent(record.content)
    if (!content.trim()) continue
    parts.push(`${role.toUpperCase()}: ${content}`)
  }

  return normalizeText(parts.join("\n\n"))
}

export function makeResponseId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`
}

