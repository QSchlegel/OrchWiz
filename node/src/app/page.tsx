"use client"

import {
  WandSparkles,
  Rocket,
  Network,
  Server,
  Cpu,
  Package,
  ArrowRight,
  ChevronDown,
} from "lucide-react"
import Link from "next/link"
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard"

const capabilities = [
  {
    title: "Agent Deployment",
    description: "Push AI agents to local or cloud nodes with one command. Track status, roll back, and scale across your fleet.",
    icon: Rocket,
    color: "text-violet-600 dark:text-violet-400",
    accent: "from-violet-500/25 to-violet-600/10 dark:from-violet-500/20 dark:to-violet-600/5",
  },
  {
    title: "Application Delivery",
    description: "Ship applications and services to any node in your topology. Manage versions and routing from the Bridge.",
    icon: Package,
    color: "text-blue-600 dark:text-blue-400",
    accent: "from-blue-500/25 to-blue-600/10 dark:from-blue-500/20 dark:to-blue-600/5",
  },
  {
    title: "Node Management",
    description: "Visualize distributed nodes on an interactive topology map. Monitor health, latency, and connectivity in real time.",
    icon: Network,
    color: "text-pink-600 dark:text-pink-400",
    accent: "from-pink-500/25 to-pink-600/10 dark:from-pink-500/20 dark:to-pink-600/5",
  },
  {
    title: "Session Control",
    description: "Run Agent Ops sessions in plan or auto-accept mode. Every prompt, output, and decision stays traceable.",
    icon: WandSparkles,
    color: "text-amber-600 dark:text-amber-400",
    accent: "from-amber-500/25 to-amber-600/10 dark:from-amber-500/20 dark:to-amber-600/5",
  },
  {
    title: "Data Flow",
    description: "Stream data between nodes, forward logs to observability stacks, and monitor throughput from a single pane.",
    icon: Server,
    color: "text-emerald-600 dark:text-emerald-400",
    accent: "from-emerald-500/25 to-emerald-600/10 dark:from-emerald-500/20 dark:to-emerald-600/5",
  },
  {
    title: "Command Execution",
    description: "Run commands on remote nodes, capture output, and build repeatable automation pipelines with audit trails.",
    icon: Cpu,
    color: "text-rose-600 dark:text-rose-400",
    accent: "from-rose-500/25 to-rose-600/10 dark:from-rose-500/20 dark:to-rose-600/5",
  },
]

export default function Home() {
  return (
    <main className="min-h-screen gradient-orb relative overflow-hidden noise-overlay text-slate-900 dark:text-slate-100">
      {/* Ambient glow orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] bg-violet-500/10 dark:bg-violet-600/15 rounded-full blur-[120px] animate-glow" />
        <div className="absolute top-1/3 -right-20 w-[400px] h-[400px] bg-pink-500/8 dark:bg-pink-600/10 rounded-full blur-[100px] animate-glow delay-2000" />
        <div className="absolute -bottom-40 left-1/3 w-[450px] h-[450px] bg-blue-500/8 dark:bg-blue-600/10 rounded-full blur-[110px] animate-glow delay-3000" />
      </div>

      {/* Grid overlay */}
      <div className="absolute inset-0 bridge-grid pointer-events-none opacity-25 dark:opacity-40" aria-hidden />

      <div className="relative z-10">
        {/* ── Hero ── */}
        <section className="flex flex-col items-center justify-center min-h-[90vh] px-6 md:px-12 text-center">
          <div className="animate-fade-up max-w-3xl">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-slate-300/80 dark:border-white/10 bg-white/75 dark:bg-white/[0.03] text-xs tracking-widest uppercase text-slate-600 dark:text-gray-400 mb-8 shadow-sm shadow-slate-900/5 dark:shadow-none" style={{ fontFamily: 'var(--font-mono)' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Orchestration Wizard
            </div>

            {/* Title */}
            <h1 className="text-6xl sm:text-7xl md:text-8xl font-extrabold tracking-tight leading-[0.9] mb-6">
              <span className="bg-gradient-to-br from-slate-900 via-slate-700 to-slate-500 dark:from-white dark:via-gray-200 dark:to-gray-500 bg-clip-text text-transparent drop-shadow-[0_2px_8px_rgba(15,23,42,0.16)] dark:drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)]">
                Orch
              </span>
              <span className="bg-gradient-to-br from-violet-600 via-fuchsia-500 to-orange-500 dark:from-violet-400 dark:via-pink-400 dark:to-amber-300 bg-clip-text text-transparent">
                Wiz
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-lg md:text-xl text-slate-700 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed mb-10 text-balance">
              A command deck for Agent Ops. Spin up orchestration sessions with passkeys,
              deploy agents across distributed nodes, and keep every decision traceable.
            </p>

            {/* CTA buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
              <Link
                href="/login"
                className="group inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 text-white font-semibold text-sm tracking-wide hover:from-violet-500 hover:to-pink-500 transition-all duration-300 shadow-lg shadow-violet-900/30"
              >
                Get started
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <a
                href="#onboarding"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl border border-slate-300/80 dark:border-white/10 bg-white/80 dark:bg-white/[0.03] text-slate-700 dark:text-gray-300 font-medium text-sm tracking-wide hover:bg-white dark:hover:bg-white/[0.06] hover:border-slate-400/70 dark:hover:border-white/20 transition-all duration-300 shadow-sm shadow-slate-900/5 dark:shadow-none"
              >
                Take the tour
                <ChevronDown className="w-4 h-4" />
              </a>
            </div>

            <p className="text-xs text-slate-500 dark:text-gray-500" style={{ fontFamily: 'var(--font-mono)' }}>
              Email verification &middot; Passkey &middot; GitHub connect after login
            </p>
          </div>

          {/* Scroll hint */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-slate-500 dark:text-gray-500 animate-bounce">
            <ChevronDown className="w-5 h-5" />
          </div>
        </section>

        {/* ── Onboarding ── */}
        <section className="px-6 md:px-12 pb-24">
          <div className="max-w-6xl mx-auto animate-fade-up" style={{ animationDelay: '0.15s' }}>
            <OnboardingWizard />
          </div>
        </section>

        {/* ── Capabilities ── */}
        <section className="px-6 md:px-12 pb-32">
          <div className="max-w-6xl mx-auto">
            {/* Section header */}
            <div className="mb-12 animate-fade-up" style={{ animationDelay: '0.25s' }}>
              <p className="text-xs tracking-widest uppercase text-violet-600 dark:text-violet-400 mb-3" style={{ fontFamily: 'var(--font-mono)' }}>
                What you can do
              </p>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tight">
                Capabilities
              </h2>
              <p className="text-slate-600 dark:text-gray-500 mt-3 max-w-lg">
                Everything you need for Agent Ops: orchestrate sessions, deploy agents, and manage infrastructure from a single pane.
              </p>
            </div>

            {/* Capabilities grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {capabilities.map((cap, i) => {
                const Icon = cap.icon
                return (
                  <div
                    key={cap.title}
                    className="group glass rounded-2xl p-6 hover:bg-slate-900/[0.03] dark:hover:bg-white/[0.04] transition-all duration-300 animate-fade-up"
                    style={{ animationDelay: `${0.3 + i * 0.08}s` }}
                  >
                    <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${cap.accent} mb-4`}>
                      <Icon className={`w-5 h-5 ${cap.color}`} strokeWidth={1.5} />
                    </div>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-2 tracking-tight">
                      {cap.title}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-gray-500 leading-relaxed">
                      {cap.description}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* ── Footer line ── */}
        <section className="px-6 md:px-12 pb-20">
          <div className="max-w-3xl mx-auto text-center">
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              Ready to take the helm?{" "}
              <Link href="/login" className="text-violet-600 dark:text-violet-400 font-medium hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer className="px-6 md:px-12 pb-8">
          <div className="max-w-6xl mx-auto flex items-center justify-between text-xs text-slate-500 dark:text-gray-500" style={{ fontFamily: 'var(--font-mono)' }}>
            <span>OrchWiz</span>
            <span>Orchestration Wizard</span>
          </div>
        </footer>
      </div>
    </main>
  )
}
