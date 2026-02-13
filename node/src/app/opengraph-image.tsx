import { ImageResponse } from "next/og"
import { headers } from "next/headers"

export const runtime = "edge"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

async function getRequestOrigin() {
  const h = await headers()
  const proto = h.get("x-forwarded-proto") ?? "http"
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"
  return `${proto}://${host}`
}

export default async function OpenGraphImage() {
  const origin = await getRequestOrigin()
  const logoUrl = `${origin}/brand/orchwiz-mark.svg`

  // Fetch fonts over HTTP so this works reliably in Edge/dev/build environments.
  const outfitFontUrl = `${origin}/og/fonts/Outfit-SemiBold.ttf`
  const jetbrainsMonoFontUrl = `${origin}/og/fonts/JetBrainsMono-SemiBold.ttf`

  const [outfitData, jetbrainsMonoData] = await Promise.all([
    fetch(outfitFontUrl).then((res) => res.arrayBuffer()),
    fetch(jetbrainsMonoFontUrl).then((res) => res.arrayBuffer()),
  ])

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "72px",
          backgroundColor: "#020617",
          backgroundImage:
            "radial-gradient(circle at 22% 30%, rgba(139, 92, 246, 0.35) 0%, rgba(139, 92, 246, 0) 58%)," +
            "radial-gradient(circle at 82% 22%, rgba(34, 211, 238, 0.26) 0%, rgba(34, 211, 238, 0) 54%)," +
            "radial-gradient(circle at 70% 84%, rgba(236, 72, 153, 0.20) 0%, rgba(236, 72, 153, 0) 58%)," +
            "linear-gradient(135deg, #0b1020 0%, #0f172a 46%, #020617 100%)",
          overflow: "hidden",
        }}
      >
        {/* Grid overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            opacity: 0.22,
          }}
        />

        {/* Soft vignette */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "radial-gradient(circle at 50% 40%, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 60%), radial-gradient(circle at 50% 50%, rgba(2,6,23,0) 0%, rgba(2,6,23,0.85) 78%)",
            opacity: 0.85,
          }}
        />

        {/* Content */}
        <div style={{ position: "relative", display: "flex", width: "100%", alignItems: "center", gap: "64px" }}>
          {/* Mark */}
          <div
            style={{
              width: "360px",
              height: "360px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transform: "rotate(-7deg)",
            }}
          >
            <img
              src={logoUrl}
              width={260}
              height={260}
              alt="OrchWiz"
              style={{
                filter: "drop-shadow(0px 26px 60px rgba(0, 0, 0, 0.55))",
              }}
            />
          </div>

          {/* Copy */}
          <div style={{ display: "flex", flexDirection: "column", gap: "22px", flex: 1 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div
                style={{
                  fontFamily: "Outfit",
                  fontSize: 78,
                  fontWeight: 600,
                  letterSpacing: -1.5,
                  color: "#ffffff",
                  lineHeight: 1,
                }}
              >
                OrchWiz
              </div>
              <div
                style={{
                  fontFamily: "Outfit",
                  fontSize: 34,
                  fontWeight: 600,
                  color: "rgba(226, 232, 240, 0.92)",
                  letterSpacing: -0.4,
                  lineHeight: 1.15,
                }}
              >
                Agent VPC for AI Systems
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div
                style={{
                  fontFamily: "JetBrains Mono",
                  fontSize: 18,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: 3.2,
                  color: "rgba(203, 213, 225, 0.78)",
                }}
              >
                Boundary · Control · Traceability
              </div>

              <div
                style={{
                  fontFamily: "JetBrains Mono",
                  fontSize: 16,
                  fontWeight: 600,
                  letterSpacing: 1.2,
                  color: "rgba(148, 163, 184, 0.78)",
                }}
              >
                Private-by-default runtime boundaries with captain-grade policy control.
              </div>
            </div>
          </div>

          {/* Right edge “status” strip */}
          <div
            style={{
              width: "10px",
              height: "420px",
              borderRadius: "999px",
              backgroundImage: "linear-gradient(180deg, rgba(34,211,238,0.95), rgba(139,92,246,0.95), rgba(236,72,153,0.95))",
              boxShadow: "0 20px 80px rgba(139,92,246,0.35)",
            }}
          />
        </div>
      </div>
    ),
    {
      width: size.width,
      height: size.height,
      fonts: [
        { name: "Outfit", data: outfitData, weight: 600 },
        { name: "JetBrains Mono", data: jetbrainsMonoData, weight: 600 },
      ],
    },
  )
}
