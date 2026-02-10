import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"

export const dynamic = "force-dynamic"

const MESHY_ASSETS_ORIGIN = "https://assets.meshy.ai"

function isAllowedModelUrl(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.origin !== MESHY_ASSETS_ORIGIN) return false
    const path = u.pathname.toLowerCase()
    if (!path.includes("/tasks/") || !path.endsWith(".glb")) return false
    return true
  } catch {
    return false
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const rawUrl = request.nextUrl.searchParams.get("url")
    if (!rawUrl || typeof rawUrl !== "string") {
      return NextResponse.json(
        { error: "Missing query parameter: url" },
        { status: 400 },
      )
    }

    const decodedUrl = decodeURIComponent(rawUrl.trim())
    if (!isAllowedModelUrl(decodedUrl)) {
      return NextResponse.json(
        { error: "URL not allowed. Only Meshy assets GLB URLs are permitted." },
        { status: 400 },
      )
    }

    const res = await fetch(decodedUrl, {
      method: "GET",
      headers: { Accept: "model/gltf-binary,*/*" },
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream returned ${res.status}` },
        { status: 502 },
      )
    }

    const contentType = res.headers.get("content-type") || "model/gltf-binary"
    const body = await res.arrayBuffer()
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    })
  } catch (error) {
    console.error("Error proxying bridge character model:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}
