import { NextRequest, NextResponse } from "next/server"
import { AccessControlError, requireAccessActor } from "@/lib/security/access-control"
import {
  readShipyardCloudEditableFiles,
  SHIPYARD_CLOUD_FILE_ALLOWLIST,
  writeShipyardCloudEditableFiles,
} from "@/lib/shipyard/cloud/files"
import { asNonEmptyString, asRecord, readJsonBody } from "@/lib/shipyard/cloud/http"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    await requireAccessActor()

    const files = await readShipyardCloudEditableFiles()

    return NextResponse.json({
      provider: "hetzner",
      allowlist: [...SHIPYARD_CLOUD_FILE_ALLOWLIST],
      files,
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    console.error("Error reading Ship Yard cloud files:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAccessActor()
    const body = await readJsonBody(request)
    const rawFiles = Array.isArray(body.files) ? body.files : []

    if (rawFiles.length === 0) {
      return NextResponse.json({ error: "files[] is required" }, { status: 400 })
    }

    const files = rawFiles.map((entry) => {
      const parsed = asRecord(entry)
      const path = asNonEmptyString(parsed.path)
      const content = typeof parsed.content === "string" ? parsed.content : null
      if (!path || content === null) {
        throw new Error("Each file entry requires path and content.")
      }
      return {
        path,
        content,
      }
    })

    const savedFiles = await writeShipyardCloudEditableFiles({ files })

    return NextResponse.json({
      provider: "hetzner",
      saved: savedFiles.length,
      files: savedFiles,
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    if ((error as Error).message.includes("allowlist")) {
      return NextResponse.json(
        {
          error: (error as Error).message,
          code: "FILE_PATH_NOT_ALLOWLISTED",
        },
        { status: 400 },
      )
    }

    if ((error as Error).message.includes("requires path and content")) {
      return NextResponse.json(
        {
          error: (error as Error).message,
        },
        { status: 400 },
      )
    }

    console.error("Error saving Ship Yard cloud files:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
