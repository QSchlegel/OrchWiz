import { NextResponse } from "next/server"

export const LOCAL_SCHEMA_SYNC_GUIDANCE =
  "Database schema is not ready. For local dev run `npm run db:migrate` (fallback: `npm run db:push`)."

export function isPrismaSchemaUnavailableError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false
  }

  const code = (error as { code?: unknown }).code
  return code === "P2021" || code === "P2022"
}

export function isPrismaMissingColumnError(error: unknown, columnName: string): boolean {
  if (!error || typeof error !== "object") {
    return false
  }

  const code = (error as { code?: unknown }).code
  if (code !== "P2022") {
    return false
  }

  const normalizedColumn = columnName.trim().toLowerCase()
  if (!normalizedColumn) {
    return false
  }

  const metaColumn = (error as { meta?: { column?: unknown } }).meta?.column
  if (typeof metaColumn === "string" && metaColumn.toLowerCase().includes(normalizedColumn)) {
    return true
  }

  const message = (error as { message?: unknown }).message
  return typeof message === "string" && message.toLowerCase().includes(normalizedColumn)
}

export function prismaSchemaUnavailableResponse() {
  return NextResponse.json(
    {
      error: LOCAL_SCHEMA_SYNC_GUIDANCE,
      code: "SCHEMA_UNAVAILABLE",
    },
    { status: 503 },
  )
}
