"use client"

import { useState } from "react"
import Link from "next/link"
import {
  KeyRound,
  Mail,
  Network,
  Rocket,
  Terminal,
  WandSparkles,
} from "lucide-react"
import { OrchestrationSurface } from "@/components/orchestration/OrchestrationSurface"

const steps = [
  {
    title: "Create your account",
    summary: "Passkey or magic link",
    description:
      "Choose a passkey for fast, secure sign-in or grab a one-time magic link by email.",
    bullets: ["No passwords", "Instant access", "Secure by default"],
    icon: KeyRound,
  },
  {
    title: "Start a session",
    summary: "Plan or auto-accept",
    description:
      "Spin up a session in planning or auto-accept mode and keep every decision traceable.",
    bullets: ["Name the mission", "Track progress", "Review outputs"],
    icon: WandSparkles,
  },
  {
    title: "Connect the Bridge",
    summary: "Local + cloud nodes",
    description:
      "Link local and cloud nodes to monitor workflows, commands, and live activity streams.",
    bullets: ["Unify nodes", "Watch in real time", "Forward data"],
    icon: Network,
  },
  {
    title: "Deploy and automate",
    summary: "Commands + deployments",
    description:
      "Run commands, deploy subagents, and keep orchestration on rails with clear controls.",
    bullets: ["Launch agents", "Ship apps", "Audit execution"],
    icon: Rocket,
  },
]

export function OnboardingWizard() {
  const [activeStep, setActiveStep] = useState(0)
  const step = steps[activeStep]
  const StepIcon = step.icon

  return (
    <section id="onboarding" className="w-full max-w-6xl">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white">
              Guided onboarding
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mt-2 max-w-xl">
              A fast tour of how OrchWiz helps you orchestrate sessions, nodes, and deployments.
            </p>
          </div>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-medium hover:from-purple-700 hover:to-pink-700 transition-all"
          >
            <Mail className="w-4 h-4" />
            Sign up with passkey or magic link
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-6">
          <div className="space-y-3">
            {steps.map((item, index) => (
              <button
                key={item.title}
                onClick={() => setActiveStep(index)}
                className={`w-full text-left rounded-2xl p-4 border transition-all duration-300 ${
                  activeStep === index
                    ? "border-purple-400/60 bg-purple-500/10"
                    : "border-white/20 bg-white/5 hover:bg-white/10"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex items-center justify-center w-9 h-9 rounded-full text-sm font-semibold ${
                      activeStep === index
                        ? "bg-purple-500 text-white"
                        : "bg-white/20 text-gray-700 dark:text-gray-200"
                    }`}
                  >
                    {index + 1}
                  </div>
                  <div>
                    <div className="text-base font-semibold text-gray-900 dark:text-white">
                      {item.title}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {item.summary}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <OrchestrationSurface level={4} className="min-h-[320px]">
            <div key={activeStep} className="onboarding-fade">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20">
                  <StepIcon className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-2xl font-semibold text-gray-900 dark:text-white">
                    {step.title}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {step.summary}
                  </p>
                </div>
              </div>

              <p className="text-gray-700 dark:text-gray-300 mb-6">
                {step.description}
              </p>

              <div className="flex flex-wrap gap-2 mb-8">
                {step.bullets.map((bullet) => (
                  <span
                    key={bullet}
                    className="px-3 py-1 rounded-full text-xs font-medium bg-white/10 text-gray-700 dark:text-gray-200"
                  >
                    {bullet}
                  </span>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-gray-900 dark:text-white transition-all"
                >
                  <Terminal className="w-4 h-4" />
                  Jump to sign-up
                </Link>
                <button
                  onClick={() => setActiveStep((prev) => Math.min(prev + 1, steps.length - 1))}
                  disabled={activeStep === steps.length - 1}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next step
                </button>
              </div>

              <div className="mt-6 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <button
                  onClick={() => setActiveStep((prev) => Math.max(prev - 1, 0))}
                  disabled={activeStep === 0}
                  className="text-left hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Back
                </button>
                <span>
                  Step {activeStep + 1} of {steps.length}
                </span>
                <span className="text-right">{step.summary}</span>
              </div>
            </div>
          </OrchestrationSurface>
        </div>
      </div>
    </section>
  )
}
