export function trimForEmbedding(text: string): string {
  const trimmed = text ?? ""
  if (trimmed.length <= 5_000) {
    return trimmed
  }

  const head = trimmed.slice(0, 4_000)
  const tail = trimmed.slice(-1_000)
  return `${head}\n...[snip]...\n${tail}`
}

