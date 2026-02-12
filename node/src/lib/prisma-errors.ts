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

export function prismaSchemaUnavailableResponse() {
  return NextResponse.json(
    {
      error: LOCAL_SCHEMA_SYNC_GUIDANCE,
      code: "SCHEMA_UNAVAILABLE",
    },
    { status: 503 },
  )
}
