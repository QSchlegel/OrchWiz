export interface LangfuseTraceTransportInput {
  traceId: string
  payload: Record<string, unknown>
}

function hasLangfuseConfig(): boolean {
  return Boolean(
    process.env.LANGFUSE_BASE_URL
    && process.env.LANGFUSE_PUBLIC_KEY
    && process.env.LANGFUSE_SECRET_KEY,
  )
}

function ingestUrl(): string {
  const baseUrl = (process.env.LANGFUSE_BASE_URL || "").replace(/\/+$/u, "")
  return `${baseUrl}/api/public/ingestion`
}

function authHeader(): string {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY || ""
  const secretKey = process.env.LANGFUSE_SECRET_KEY || ""
  return `Basic ${Buffer.from(`${publicKey}:${secretKey}`, "utf8").toString("base64")}`
}

export async function emitToLangfuse(input: LangfuseTraceTransportInput): Promise<void> {
  if (!hasLangfuseConfig()) {
    return
  }

  const eventBody = {
    batch: [
      {
        id: input.traceId,
        type: "trace-create",
        timestamp: new Date().toISOString(),
        body: {
          id: input.traceId,
          ...input.payload,
        },
      },
    ],
  }

  const response = await fetch(ingestUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(),
    },
    body: JSON.stringify(eventBody),
  })

  if (!response.ok) {
    throw new Error(`Langfuse transport failed with status ${response.status}`)
  }
}
