import { NextRequest, NextResponse } from "next/server"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  persistSubagentContextFiles,
  loadSubagentContextFiles,
  type EditableContextFile,
} from "@/lib/subagents/context-files"

export const dynamic = "force-dynamic"

function resolveWorkspaceRoot(): string {
  const cwd = process.cwd()
  const direct = resolve(cwd, ".claude/agents")
  if (existsSync(direct)) {
    return cwd
  }

  const parent = resolve(cwd, "..")
  const parentContextRoot = resolve(parent, ".claude/agents")
  if (existsSync(parentContextRoot)) {
    return parent
  }

  return cwd
}

function asContextFiles(value: unknown): EditableContextFile[] | null {
  if (!Array.isArray(value)) {
    return null
  }

  const files: EditableContextFile[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      return null
    }

    const fileName = typeof (entry as { fileName?: unknown }).fileName === "string"
      ? (entry as { fileName: string }).fileName
      : null
    const content = typeof (entry as { content?: unknown }).content === "string"
      ? (entry as { content: string }).content
      : null

    if (!fileName || content === null) {
      return null
    }

    files.push({ fileName, content })
  }

  return files
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const subagent = await prisma.subagent.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        content: true,
        path: true,
      },
    })

    if (!subagent) {
      return NextResponse.json({ error: "Subagent not found" }, { status: 404 })
    }

    const contextFiles = await loadSubagentContextFiles({
      repoRoot: resolveWorkspaceRoot(),
      subagent,
    })

    return NextResponse.json(contextFiles)
  } catch (error) {
    console.error("Error loading subagent context files:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const subagent = await prisma.subagent.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        path: true,
        isShared: true,
      },
    })

    if (!subagent) {
      return NextResponse.json({ error: "Subagent not found" }, { status: 404 })
    }

    if (subagent.isShared) {
      return NextResponse.json({ error: "Shared agents are read-only on this page." }, { status: 403 })
    }

    const body = await request.json()
    const files = asContextFiles(body?.files)
    if (!files) {
      return NextResponse.json({ error: "files[] with {fileName, content} is required" }, { status: 400 })
    }

    const saved = await persistSubagentContextFiles({
      repoRoot: resolveWorkspaceRoot(),
      subagent,
      files,
    })

    await prisma.subagent.update({
      where: { id },
      data: {
        path: saved.path,
        content: saved.content,
      },
    })

    return NextResponse.json(saved)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error"
    const status = message.includes("Invalid context file name") || message.includes("required") ? 400 : 500
    if (status === 500) {
      console.error("Error saving subagent context files:", error)
    }
    return NextResponse.json({ error: message }, { status })
  }
}
