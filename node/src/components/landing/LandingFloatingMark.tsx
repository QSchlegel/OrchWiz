"use client"

import dynamic from "next/dynamic"
import { useEffect, useRef, useState, type CSSProperties } from "react"

const OrchWizMark3D = dynamic(
  () => import("@/components/brand/OrchWizMark3D").then((module) => module.OrchWizMark3D),
  { ssr: false, loading: () => null },
)

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, options?: { timeout?: number }) => number
  cancelIdleCallback?: (id: number) => void
}

function isWebGlAvailable() {
  if (typeof window === "undefined") return false
  try {
    const canvas = document.createElement("canvas")
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"))
  } catch {
    return false
  }
}

function sizeForViewport(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return 148
  if (width < 520) return 108
  if (width < 860) return 128
  return 156
}

function MarkImg({
  size,
  className,
  style,
}: {
  size: number
  className?: string
  style?: CSSProperties
}) {
  return (
    <img
      src="/brand/orchwiz-mark.svg"
      alt=""
      width={size}
      height={size}
      draggable={false}
      aria-hidden="true"
      className={`select-none ${className ?? ""}`}
      style={style}
    />
  )
}

export function LandingFloatingMark() {
  const [enabled, setEnabled] = useState(false)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const [size, setSize] = useState(148)
  const [inView, setInView] = useState(true)
  const [webglOk, setWebglOk] = useState(false)
  const [threeReady, setThreeReady] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
    const updateMotion = () => setPrefersReducedMotion(mediaQuery.matches)
    updateMotion()
    mediaQuery.addEventListener("change", updateMotion)
    return () => mediaQuery.removeEventListener("change", updateMotion)
  }, [])

  useEffect(() => {
    const updateSize = () => setSize(sizeForViewport(window.innerWidth || 0))
    updateSize()
    window.addEventListener("resize", updateSize, { passive: true })
    return () => window.removeEventListener("resize", updateSize)
  }, [])

  useEffect(() => {
    setWebglOk(isWebGlAvailable())
  }, [])

  useEffect(() => {
    const node = rootRef.current
    if (!node) return
    if (typeof IntersectionObserver === "undefined") return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry) return
        setInView(Boolean(entry.isIntersecting) && entry.intersectionRatio >= 0.15)
      },
      { threshold: [0, 0.15, 1] },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false
    const enable = () => {
      if (cancelled) return
      setEnabled(true)
    }

    const w = window as IdleWindow
    if (typeof w.requestIdleCallback === "function") {
      const idleId = w.requestIdleCallback(enable, { timeout: 1600 })
      return () => {
        cancelled = true
        w.cancelIdleCallback?.(idleId)
      }
    }

    const timeoutId = window.setTimeout(enable, 420)
    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [])

  useEffect(() => {
    setThreeReady(false)
  }, [size])

  const spinEnabled = enabled && inView && !prefersReducedMotion
  const shouldMountThree = enabled && webglOk

  return (
    <div className="pointer-events-none absolute right-4 top-10 md:right-10 md:top-12 z-30" aria-hidden="true">
      <div
        ref={rootRef}
        className={prefersReducedMotion ? "" : "owz-landing-icon-float"}
        style={{ willChange: prefersReducedMotion ? undefined : "transform" }}
      >
        <div className="relative" style={{ width: size, height: size }}>
          {/* 2D fallback: stacked layers to suggest thickness immediately */}
          <div
            className="absolute inset-0 transition-opacity duration-500"
            style={{ opacity: threeReady ? 0 : 1 }}
          >
            <div style={{ perspective: "1100px" }}>
              <div
                className={spinEnabled ? "owz-landing-icon-spin-vertical" : ""}
                style={{ transformStyle: "preserve-3d" }}
              >
                <div className="owz-landing-icon-tilt">
                  <div className="relative" style={{ width: size, height: size, transformStyle: "preserve-3d" }}>
                    {Array.from({ length: 8 }).map((_, index) => {
                      const layers = 8
                      const step = 1.25
                      const depthIndex = layers - 1 - index
                      const z = -depthIndex * step

                      if (index < layers - 1) {
                        const t = index / Math.max(1, layers - 2)
                        const opacity = 0.2 + t * 0.2
                        return (
                          <div
                            key={`layer-${index}`}
                            className="absolute inset-0"
                            style={{
                              transform: `translate3d(0,0,${z}px)`,
                              transformStyle: "preserve-3d",
                              opacity,
                              filter: "brightness(0.75) saturate(0.85)",
                              backfaceVisibility: "hidden",
                              WebkitBackfaceVisibility: "hidden",
                            }}
                          >
                            <MarkImg size={size} style={{ width: "100%", height: "100%" }} />
                          </div>
                        )
                      }

                      return (
                        <div
                          key="layer-front"
                          className="absolute inset-0"
                          style={{
                            transform: `translate3d(0,0,${z}px)`,
                            transformStyle: "preserve-3d",
                            opacity: 0.92,
                            backfaceVisibility: "hidden",
                            WebkitBackfaceVisibility: "hidden",
                          }}
                        >
                          <MarkImg
                            size={size}
                            className="drop-shadow-[0_20px_42px_rgba(15,23,42,0.22)] dark:drop-shadow-[0_26px_70px_rgba(0,0,0,0.55)]"
                            style={{ width: "100%", height: "100%" }}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 3D enhancement: extruded badge (Three.js). */}
          {shouldMountThree && (
            <div
              className="absolute inset-0 transition-opacity duration-500"
              style={{ pointerEvents: "none", opacity: threeReady ? 1 : 0 }}
            >
              <OrchWizMark3D
                size={size}
                spinEnabled={spinEnabled}
                className="drop-shadow-[0_20px_42px_rgba(15,23,42,0.22)] dark:drop-shadow-[0_26px_70px_rgba(0,0,0,0.55)]"
                onReady={() => setThreeReady(true)}
                onError={() => setThreeReady(false)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
