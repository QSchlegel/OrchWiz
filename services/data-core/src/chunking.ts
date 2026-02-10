export interface ChunkDraft {
  chunkIndex: number
  heading: string | null
  content: string
  normalizedContent: string
  tokenCount: number
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

export function normalizeRagText(value: string): string {
  return normalizeWhitespace(value).toLowerCase()
}

export function tokenizeRagText(value: string): string[] {
  return normalizeRagText(value)
    .split(/[^a-z0-9]+/u)
    .filter((token) => token.length >= 2)
}

function splitLongBlock(block: string, maxChars: number): string[] {
  if (block.length <= maxChars) {
    return [block]
  }

  const parts: string[] = []
  let remaining = block

  while (remaining.length > maxChars) {
    const softFloor = Math.floor(maxChars * 0.6)
    let splitIndex = Math.max(
      remaining.lastIndexOf("\n", maxChars),
      remaining.lastIndexOf(". ", maxChars),
      remaining.lastIndexOf("; ", maxChars),
      remaining.lastIndexOf(", ", maxChars),
    )

    if (splitIndex < softFloor) {
      splitIndex = maxChars
    }

    const head = normalizeWhitespace(remaining.slice(0, splitIndex))
    if (head) {
      parts.push(head)
    }

    remaining = remaining.slice(splitIndex).trim()
  }

  const tail = normalizeWhitespace(remaining)
  if (tail) {
    parts.push(tail)
  }

  return parts
}

export function chunkMarkdownForRag(markdown: string, options: { maxChars?: number; maxChunks?: number } = {}): ChunkDraft[] {
  const maxChars = Math.max(300, options.maxChars || 900)
  const maxChunks = Math.max(10, options.maxChunks || 160)
  const lines = markdown.replace(/\r\n/g, "\n").split("\n")

  const chunks: ChunkDraft[] = []
  let currentHeading: string | null = null
  let paragraphLines: string[] = []

  const flushParagraph = () => {
    const paragraph = normalizeWhitespace(paragraphLines.join(" "))
    paragraphLines = []

    if (!paragraph) {
      return
    }

    const blockPrefix = currentHeading ? `${currentHeading}\n` : ""
    const block = `${blockPrefix}${paragraph}`.trim()
    const splitBlocks = splitLongBlock(block, maxChars)

    for (const splitBlock of splitBlocks) {
      if (chunks.length >= maxChunks) {
        break
      }

      chunks.push({
        chunkIndex: chunks.length,
        heading: currentHeading,
        content: splitBlock,
        normalizedContent: normalizeRagText(splitBlock),
        tokenCount: tokenizeRagText(splitBlock).length,
      })
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()

    const headingMatch = line.match(/^#{1,6}\s+(.+)$/u)
    if (headingMatch) {
      flushParagraph()
      currentHeading = normalizeWhitespace(headingMatch[1]) || null
      continue
    }

    if (!line) {
      flushParagraph()
      continue
    }

    paragraphLines.push(line)
  }

  flushParagraph()

  if (chunks.length === 0) {
    const compact = normalizeWhitespace(markdown)
    if (!compact) {
      return []
    }

    const splitBlocks = splitLongBlock(compact, maxChars)
    return splitBlocks.slice(0, maxChunks).map((block, idx) => ({
      chunkIndex: idx,
      heading: null,
      content: block,
      normalizedContent: normalizeRagText(block),
      tokenCount: tokenizeRagText(block).length,
    }))
  }

  return chunks
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    return 0
  }

  let dot = 0
  let leftNorm = 0
  let rightNorm = 0

  for (let i = 0; i < left.length; i += 1) {
    dot += left[i] * right[i]
    leftNorm += left[i] * left[i]
    rightNorm += right[i] * right[i]
  }

  if (leftNorm === 0 || rightNorm === 0) {
    return 0
  }

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm))
}

export function parseEmbedding(value: unknown): number[] | null {
  if (!Array.isArray(value)) {
    return null
  }

  const parsed: number[] = []
  for (const entry of value) {
    if (typeof entry !== "number" || !Number.isFinite(entry)) {
      return null
    }
    parsed.push(entry)
  }

  return parsed.length > 0 ? parsed : null
}

export async function embedTextsWithOpenAi(texts: string[], model: string): Promise<number[][] | null> {
  if (texts.length === 0) {
    return []
  }

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
        input: texts,
      }),
    })
  } catch (error) {
    console.error("Data-core embedding request failed:", error)
    return null
  }

  if (!response.ok) {
    console.error("Data-core embedding request returned non-2xx:", response.status)
    return null
  }

  const payload = (await response.json().catch(() => null)) as
    | { data?: Array<{ embedding?: unknown; index?: number }> }
    | null
  if (!payload?.data || !Array.isArray(payload.data)) {
    return null
  }

  const ordered = [...payload.data].sort((a, b) => (a.index || 0) - (b.index || 0))
  const vectors: number[][] = []
  for (const entry of ordered) {
    const embedding = parseEmbedding(entry.embedding)
    if (!embedding) {
      return null
    }
    vectors.push(embedding)
  }

  return vectors
}
