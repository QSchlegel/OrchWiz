"use client"

import { useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { CoinToss3D, type CoinToss3DHandle } from "@/components/brand/coin-toss/CoinToss3D"

export default function CoinTossDevPageClient() {
  const searchParams = useSearchParams()
  const capture = searchParams.get("capture") === "1"

  const coinRef = useRef<CoinToss3DHandle | null>(null)
  const [loop, setLoop] = useState(false)
  const [size, setSize] = useState(240)

  const codeSample = useMemo(
    () => `import { CoinToss3D } from "@/components/brand/coin-toss/CoinToss3D"

export function Example() {
  return <CoinToss3D size={240} />
}`,
    [],
  )

  if (capture) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: "#07070e" }}>
        <CoinToss3D capture />
      </main>
    )
  }

  return (
    <main className="min-h-screen gradient-orb noise-overlay relative text-slate-900 dark:text-slate-100 px-6 py-12 md:px-12">
      <div className="absolute inset-0 bridge-grid pointer-events-none opacity-20 dark:opacity-35" aria-hidden />

      <div className="relative z-10 max-w-4xl mx-auto space-y-8">
        <header className="glass rounded-2xl p-6 md:p-8">
          <p
            className="mb-3 text-xs tracking-widest uppercase text-cyan-600 dark:text-cyan-300"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Dev surface
          </p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
            Coin Toss 3D
          </h1>
          <p className="mt-3 text-sm md:text-base text-slate-600 dark:text-slate-300 max-w-2xl">
            Three.js “challenge coin” toss animation using the pixel-decoded OrchWiz mark.
          </p>
        </header>

        <section className="glass rounded-2xl p-6 md:p-8">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-[auto,1fr] md:items-center">
            <div className="flex flex-col items-center gap-3">
              <div className="rounded-2xl border border-slate-300/70 bg-white/70 p-4 dark:border-white/15 dark:bg-white/[0.04]">
                <CoinToss3D ref={coinRef} size={size} loop={loop} className="cursor-pointer" />
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Click the coin, or use the controls.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => coinRef.current?.toss()}
                  className="inline-flex items-center justify-center rounded-lg border border-slate-300/80 bg-white/75 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-white dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-100 dark:hover:bg-white/[0.08]"
                >
                  Toss
                </button>
                <button
                  type="button"
                  onClick={() => setLoop((current) => !current)}
                  className="inline-flex items-center justify-center rounded-lg border border-slate-300/80 bg-white/75 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-white dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-100 dark:hover:bg-white/[0.08]"
                >
                  Loop: {loop ? "On" : "Off"}
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Size: {size}px
                </label>
                <input
                  type="range"
                  min={160}
                  max={360}
                  step={10}
                  value={size}
                  onChange={(event) => setSize(Number(event.target.value))}
                  className="mt-2 w-full"
                />
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                  Usage
                </p>
                <pre className="rounded-xl border border-slate-300/80 bg-slate-900/[0.03] p-4 text-xs text-slate-700 overflow-x-auto dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-200">
                  <code>{codeSample}</code>
                </pre>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

