"use client"

import { useSession } from "@/lib/auth-client"
import { WandSparkles } from "lucide-react"
import { useEffect } from "react"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession()

  useEffect(() => {
    if (!isPending && session) {
      window.location.href = "/sessions"
    }
  }, [session, isPending])

  if (isPending) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-sm text-slate-500 dark:text-slate-400">Loading...</div>
      </main>
    )
  }

  if (session) {
    return null
  }

  return (
    <main className="min-h-screen flex flex-col lg:flex-row bg-slate-50 dark:bg-slate-950">
      {/* Brand panel — visible on desktop as left column, collapses to header on mobile */}
      <div className="auth-brand-panel relative hidden lg:flex lg:w-[44%] lg:max-w-[560px] flex-col justify-between overflow-hidden p-10">
        {/* Ambient gradient art */}
        <div className="absolute inset-0 bg-gradient-to-br from-violet-600/90 via-indigo-600/80 to-slate-900 dark:from-violet-900/80 dark:via-indigo-950/90 dark:to-slate-950" />
        <div className="absolute top-1/4 -left-20 w-80 h-80 bg-pink-500/20 rounded-full blur-[100px]" />
        <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-cyan-500/15 rounded-full blur-[100px]" />

        <div className="relative z-10">
          <div className="flex items-center gap-2.5 mb-16">
            <WandSparkles className="w-6 h-6 text-white/90" strokeWidth={1.5} />
            <span className="text-lg font-semibold text-white/90 tracking-tight">OrchWiz</span>
          </div>

          <h2 className="text-4xl font-bold text-white leading-tight tracking-tight mb-4">
            Orchestrate agents.
            <br />
            Ship with confidence.
          </h2>
          <p className="text-base text-white/60 max-w-sm leading-relaxed">
            Spin up sessions, deploy across distributed nodes, and keep every decision traceable.
          </p>
        </div>

        <p className="relative z-10 text-xs text-white/30" style={{ fontFamily: "var(--font-mono)" }}>
          Orchestration Wizard
        </p>
      </div>

      {/* Mobile brand header */}
      <div className="flex items-center gap-2.5 px-6 pt-8 pb-2 lg:hidden">
        <WandSparkles className="w-5 h-5 text-violet-500 dark:text-violet-400" strokeWidth={1.5} />
        <span className="text-base font-semibold text-slate-900 dark:text-white tracking-tight">OrchWiz</span>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center px-6 py-12 lg:py-0">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </main>
  )
}
