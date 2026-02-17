"use client"

import dynamic from "next/dynamic"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { CoinToss3DHandle } from "@/components/brand/coin-toss/CoinToss3D"

const CoinToss3D = dynamic(
  () => import("@/components/brand/coin-toss/CoinToss3D").then((module) => module.CoinToss3D),
  { ssr: false, loading: () => null },
)

function randomBetween(min: number, max: number) {
  return Math.floor(min + Math.random() * (max - min + 1))
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0
  return value < 0 ? 0 : value > 1 ? 1 : value
}

export function LandingMarkBackdrop3D() {
  const [enabled, setEnabled] = useState(false)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const coinRef = useRef<CoinToss3DHandle | null>(null)
  const tossTimeoutRef = useRef<number | null>(null)
  const shellRef = useRef<HTMLDivElement | null>(null)
  const scrollSuppressedRef = useRef(false)
  const [haloKey, setHaloKey] = useState(0)

  const coinDurationMs = 2400

  const coinSize = useMemo(() => {
    if (typeof window === "undefined") return 320
    const w = window.innerWidth
    if (w < 520) return 220
    if (w < 860) return 280
    return 320
  }, [])

  const tossProfile = useMemo(() => {
    // Slightly calmer than the dev surface defaults: fewer spins, lower arc, less wobble.
    return { spins: 4.15, arcHeight: 1.12, wobble: 0.24 }
  }, [])

  const canAnimate = useCallback(() => {
    if (typeof document === "undefined") return false
    if (document.hidden) return false
    if (prefersReducedMotion) return false
    if (scrollSuppressedRef.current) return false
    return true
  }, [prefersReducedMotion])

  const triggerToss = useCallback(() => {
    if (!canAnimate()) {
      return
    }

    setHaloKey((value) => value + 1)
    coinRef.current?.toss()
  }, [canAnimate])

  const scheduleNextToss = useCallback(() => {
    if (typeof window === "undefined") return

    if (tossTimeoutRef.current != null) {
      window.clearTimeout(tossTimeoutRef.current)
    }

    // Keep the motion subtle: toss, then go quiet for a while.
    const delayMs = randomBetween(8_500, 16_000)
    tossTimeoutRef.current = window.setTimeout(() => {
      triggerToss()
    }, delayMs)
  }, [triggerToss])

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
    const updateMotion = () => setPrefersReducedMotion(mediaQuery.matches)
    updateMotion()
    mediaQuery.addEventListener("change", updateMotion)
    return () => mediaQuery.removeEventListener("change", updateMotion)
  }, [])

  useEffect(() => {
    let cancelled = false
    const enable = () => {
      if (cancelled) return
      setEnabled(true)
    }

    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void, options?: { timeout?: number }) => number
      cancelIdleCallback?: (id: number) => void
    }

    // Load the 3D chunk last: wait for idle time, with a short timeout fallback.
    if (typeof w.requestIdleCallback === "function") {
      const idleId = w.requestIdleCallback(enable, { timeout: 2_500 })
      return () => {
        cancelled = true
        w.cancelIdleCallback?.(idleId)
      }
    }

    const timeoutId = window.setTimeout(enable, 900)
    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return

    // Let the mark materialize before the first toss.
    if (prefersReducedMotion) return

    const initialDelayMs = randomBetween(900, 1600)
    const id = window.setTimeout(() => {
      triggerToss()
    }, initialDelayMs)

    return () => window.clearTimeout(id)
  }, [enabled, prefersReducedMotion, triggerToss])

  useEffect(() => {
    if (!enabled) return

    const shell = shellRef.current
    if (!shell) return

    // Scroll: fade the mark out once the hero is no longer the focus.
    let raf = 0
    const updateScroll = () => {
      raf = 0
      const y = window.scrollY || 0
      const h = Math.max(1, window.innerHeight || 1)

      const start = h * 0.12
      const end = h * 0.92
      const t = clamp01((y - start) / Math.max(1, end - start))

      const fade = 1 - t
      shell.style.opacity = String(fade)

      scrollSuppressedRef.current = fade < 0.12
    }

    const onScroll = () => {
      if (raf) return
      raf = window.requestAnimationFrame(updateScroll)
    }

    updateScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return

    const shell = shellRef.current
    if (!shell) return

    if (prefersReducedMotion) {
      shell.style.transform = "none"
      return
    }

    if (!window.matchMedia("(hover: hover)").matches) {
      // No hover surfaces: keep things deterministic.
      shell.style.transform = "none"
      return
    }

    let raf = 0
    const current = { tx: 0, ty: 0, rx: 0, ry: 0 }
    const target = { tx: 0, ty: 0, rx: 0, ry: 0 }

    const tick = () => {
      raf = 0
      const ease = 0.085
      current.tx += (target.tx - current.tx) * ease
      current.ty += (target.ty - current.ty) * ease
      current.rx += (target.rx - current.rx) * ease
      current.ry += (target.ry - current.ry) * ease

      shell.style.transform = `perspective(1100px) translate3d(${current.tx.toFixed(2)}px, ${current.ty.toFixed(
        2,
      )}px, 0) rotateX(${current.rx.toFixed(2)}deg) rotateY(${current.ry.toFixed(2)}deg) rotateZ(-4deg)`

      const done =
        Math.abs(target.tx - current.tx) < 0.01 &&
        Math.abs(target.ty - current.ty) < 0.01 &&
        Math.abs(target.rx - current.rx) < 0.01 &&
        Math.abs(target.ry - current.ry) < 0.01

      if (!done) {
        raf = window.requestAnimationFrame(tick)
      }
    }

    const onMove = (event: PointerEvent) => {
      const w = Math.max(1, window.innerWidth || 1)
      const h = Math.max(1, window.innerHeight || 1)
      const x = (event.clientX / w) * 2 - 1
      const y = (event.clientY / h) * 2 - 1

      target.tx = x * -14
      target.ty = y * -10
      target.rx = y * 3.4
      target.ry = x * -5.2

      if (!raf) {
        raf = window.requestAnimationFrame(tick)
      }
    }

    const onLeave = () => {
      target.tx = 0
      target.ty = 0
      target.rx = 0
      target.ry = 0
      if (!raf) {
        raf = window.requestAnimationFrame(tick)
      }
    }

    window.addEventListener("pointermove", onMove, { passive: true })
    window.addEventListener("pointerleave", onLeave, { passive: true })
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerleave", onLeave)
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [enabled, prefersReducedMotion])

  useEffect(() => {
    if (!enabled) return

    const onVisibility = () => {
      if (document.hidden) {
        if (tossTimeoutRef.current != null) {
          window.clearTimeout(tossTimeoutRef.current)
          tossTimeoutRef.current = null
        }
        return
      }

      // When returning to the tab, wait a bit and then resume.
      scheduleNextToss()
    }

    document.addEventListener("visibilitychange", onVisibility)
    return () => document.removeEventListener("visibilitychange", onVisibility)
  }, [enabled, scheduleNextToss])

  useEffect(() => {
    return () => {
      if (tossTimeoutRef.current != null) {
        window.clearTimeout(tossTimeoutRef.current)
        tossTimeoutRef.current = null
      }
    }
  }, [])

  if (!enabled) return null

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      <div
        ref={shellRef}
        className="absolute -right-28 -top-10 md:-right-24 md:top-10"
        style={{
          opacity: 1,
          willChange: "transform, opacity",
        }}
      >
        <div
          className="owz-landing-mark-enter"
          style={{
            maskImage: "radial-gradient(closest-side, rgba(0,0,0,0.92) 58%, rgba(0,0,0,0) 100%)",
            WebkitMaskImage: "radial-gradient(closest-side, rgba(0,0,0,0.92) 58%, rgba(0,0,0,0) 100%)",
          }}
        >
          <div className={prefersReducedMotion ? "" : "orb-breathe"}>
            <div className="relative" style={{ width: coinSize, height: coinSize }}>
              <div
                key={haloKey}
                className="owz-landing-mark-halo absolute inset-0 rounded-full opacity-0"
                style={{
                  background:
                    "radial-gradient(closest-side, rgba(34,211,238,0.18) 0%, rgba(139,92,246,0.12) 38%, rgba(244,114,182,0.08) 62%, rgba(2,6,23,0) 100%)",
                }}
              />

              <CoinToss3D
                ref={coinRef}
                size={coinSize}
                durationMs={coinDurationMs}
                interactive={false}
                spins={tossProfile.spins}
                arcHeight={tossProfile.arcHeight}
                wobble={tossProfile.wobble}
                className="absolute inset-0 select-none opacity-30 blur-[0.25px] saturate-150 contrast-125 brightness-[0.98] dark:opacity-45 dark:brightness-110 mix-blend-multiply dark:mix-blend-screen drop-shadow-[0_0_70px_rgba(34,211,238,0.18)]"
                onComplete={scheduleNextToss}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
