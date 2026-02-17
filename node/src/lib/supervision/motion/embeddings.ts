import crypto from "node:crypto"
import { trimForEmbedding } from "./text"
import { normalizeVector, parseVector } from "./stats"

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function embeddingProvider(): "openai" | "hash" {
  const provider = process.env.MOTION_EMBEDDINGS_PROVIDER?.trim().toLowerCase()
  return provider === "hash" ? "hash" : "openai"
}

function hashEmbeddingDims(): number {
  const raw = process.env.MOTION_HASH_EMBEDDING_DIMS?.trim()
  if (!raw) return 64
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 8) return 64
  return Math.min(2048, parsed)
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function hashEmbed(text: string): number[] | null {
  const dims = hashEmbeddingDims()
  const digest = crypto.createHash("sha256").update(text).digest()
  const seed = digest.readUInt32LE(0)
  const rand = mulberry32(seed)

  const vec: number[] = []
  for (let i = 0; i < dims; i += 1) {
    // [-1, 1]
    vec.push(rand() * 2 - 1)
  }

  return normalizeVector(vec)
}

async function openAiEmbed(text: string, model: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    return null
  }

  let response: Response
  try {
    response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [text],
      }),
    })
  } catch (error) {
    console.error("Motion supervision embedding request failed:", error)
    return null
  }

  if (!response.ok) {
    console.error("Motion supervision embedding request returned non-2xx:", response.status)
    return null
  }

  const payload = (await response.json().catch(() => null)) as
    | { data?: Array<{ embedding?: unknown; index?: number }> }
    | null
  if (!payload?.data || !Array.isArray(payload.data) || payload.data.length < 1) {
    return null
  }

  const entry = payload.data[0]
  const embedding = parseVector(entry?.embedding)
  if (!embedding) {
    return null
  }

  return normalizeVector(embedding) || null
}

export async function embedTextForMotion(args: { text: string; model: string }): Promise<number[] | null> {
  const trimmed = trimForEmbedding(args.text)
  const model = nonEmptyString(args.model) || "text-embedding-3-small"

  if (embeddingProvider() === "hash") {
    return hashEmbed(trimmed)
  }

  return openAiEmbed(trimmed, model)
}

