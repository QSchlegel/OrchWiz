"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  KeyRound,
  Network,
  Rocket,
  WandSparkles,
  ArrowRight,
  ChevronRight,
  ChevronLeft,
} from "lucide-react"

const steps = [
  {
    title: "Create your account",
    summary: "Email verify + passkey",
    description:
      "Verify your email with a magic link and set up a passkey for fast, secure sign-in. Connect GitHub later from the dashboard when you need it.",
    bullets: ["Passwordless auth", "Instant access", "Secure by default"],
    icon: KeyRound,
    color: "text-violet-600 dark:text-violet-400",
    accent: "bg-violet-500",
    accentBg: "from-violet-500/25 to-violet-600/10 dark:from-violet-500/20 dark:to-violet-600/5",
  },
  {
    title: "Start a session",
    summary: "Plan or auto-accept",
    description:
      "Spin up an Agent Ops session in planning or auto-accept mode. Name your mission, track progress, and keep every prompt and output traceable.",
    bullets: ["Name the mission", "Track progress", "Review outputs"],
    icon: WandSparkles,
    color: "text-amber-600 dark:text-amber-400",
    accent: "bg-amber-500",
    accentBg: "from-amber-500/25 to-amber-600/10 dark:from-amber-500/20 dark:to-amber-600/5",
  },
  {
    title: "Connect the Bridge",
    summary: "Local + cloud nodes",
    description:
      "Link local and cloud nodes into a unified topology. Monitor workflows, commands, and live activity streams from one place.",
    bullets: ["Unify nodes", "Real-time monitoring", "Forward data"],
    icon: Network,
    color: "text-pink-600 dark:text-pink-400",
    accent: "bg-pink-500",
    accentBg: "from-pink-500/25 to-pink-600/10 dark:from-pink-500/20 dark:to-pink-600/5",
  },
  {
    title: "Deploy and automate",
    summary: "Commands + deployments",
    description:
      "Run commands on remote nodes, deploy subagents, and build automation pipelines with full audit trails and rollback controls.",
    bullets: ["Launch agents", "Ship apps", "Audit execution"],
    icon: Rocket,
    color: "text-emerald-600 dark:text-emerald-400",
    accent: "bg-emerald-500",
    accentBg: "from-emerald-500/25 to-emerald-600/10 dark:from-emerald-500/20 dark:to-emerald-600/5",
  },
]

export function OnboardingWizard() {
  const [activeStep, setActiveStep] = useState(0)
  const step = steps[activeStep]
  const StepIcon = step.icon

  const goBack = useCallback(() => setActiveStep((prev) => Math.max(prev - 1, 0)), [])
  const goForward = useCallback(() => setActiveStep((prev) => Math.min(prev + 1, steps.length - 1)), [])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goBack()
      if (e.key === "ArrowRight") goForward()
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [goBack, goForward])

  return (
    <section id="onboarding" className="w-full scroll-mt-12">
      <div className="flex flex-col gap-10">
        {/* Header */}
        <div>
          <p className="text-xs tracking-widest uppercase text-violet-600 dark:text-violet-400 mb-3" style={{ fontFamily: 'var(--font-mono)' }}>
            How it works
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tight">
            Guided onboarding
          </h2>
          <p className="text-slate-600 dark:text-gray-500 mt-3 max-w-xl">
            Four steps from sign-up to full orchestration.
          </p>
        </div>

        {/* Wizard body */}
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">
          {/* Step list */}
          <div className="space-y-2">
            {steps.map((item, index) => {
              return (
                <button
                  key={item.title}
                  onClick={() => setActiveStep(index)}
                  className={`w-full text-left rounded-xl p-3.5 border transition-all duration-300 ${
                    activeStep === index
                      ? "border-slate-300/80 dark:border-white/10 bg-white/80 dark:bg-white/[0.05] shadow-sm shadow-slate-900/5 dark:shadow-none"
                      : "border-transparent bg-transparent hover:bg-slate-900/[0.03] dark:hover:bg-white/[0.02]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex items-center justify-center w-8 h-8 rounded-lg text-xs font-semibold transition-colors duration-300 ${
                        activeStep === index
                          ? `${item.accent} text-white`
                          : "bg-slate-900/[0.05] text-slate-600 dark:bg-white/[0.05] dark:text-gray-500"
                      }`}
                    >
                      {index + 1}
                    </div>
                    <div className="min-w-0">
                      <div className={`text-sm font-medium truncate transition-colors duration-300 ${
                        activeStep === index ? "text-slate-900 dark:text-white" : "text-slate-600 dark:text-gray-400"
                      }`}>
                        {item.title}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-gray-600 truncate" style={{ fontFamily: 'var(--font-mono)' }}>
                        {item.summary}
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Step detail */}
          <div className="glass rounded-2xl p-6 md:p-8 min-h-[340px] relative overflow-hidden">
            {/* Accent gradient */}
            <div className={`absolute top-0 right-0 w-48 h-48 bg-gradient-to-br ${step.accentBg} rounded-full blur-3xl opacity-40 pointer-events-none`} />

            <div key={activeStep} className="onboarding-fade relative z-10">
              <div className="flex items-center gap-3 mb-5">
                <div className={`p-2.5 rounded-xl bg-gradient-to-br ${step.accentBg}`}>
                  <StepIcon className={`w-5 h-5 ${step.color}`} strokeWidth={1.5} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">
                    {step.title}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-gray-500" style={{ fontFamily: 'var(--font-mono)' }}>
                    {step.summary}
                  </p>
                </div>
              </div>

              <p className="text-slate-700 dark:text-gray-400 leading-relaxed mb-6">
                {step.description}
              </p>

              <div className="flex flex-wrap gap-2 mb-8">
                {step.bullets.map((bullet) => (
                  <span
                    key={bullet}
                    className="px-3 py-1 rounded-full text-[11px] font-medium bg-slate-900/[0.05] text-slate-700 border border-slate-300/70 dark:bg-white/[0.05] dark:text-gray-400 dark:border-white/[0.06]"
                  >
                    {bullet}
                  </span>
                ))}
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={goBack}
                    disabled={activeStep === 0}
                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-300/70 bg-white/70 text-slate-600 hover:text-slate-900 hover:bg-white dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-gray-500 dark:hover:text-white dark:hover:bg-white/[0.05] transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-500 dark:disabled:hover:text-gray-500"
                    aria-label="Previous step"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={goForward}
                    disabled={activeStep === steps.length - 1}
                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-300/70 bg-white/70 text-slate-600 hover:text-slate-900 hover:bg-white dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-gray-500 dark:hover:text-white dark:hover:bg-white/[0.05] transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-500 dark:disabled:hover:text-gray-500"
                    aria-label="Next step"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <span className="text-[11px] text-slate-500 dark:text-gray-600 ml-2" style={{ fontFamily: 'var(--font-mono)' }}>
                    {activeStep + 1} / {steps.length}
                  </span>
                </div>

                <Link
                  href="/login"
                  className="group inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 dark:text-gray-500 dark:hover:text-white transition-colors"
                >
                  Sign in
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
