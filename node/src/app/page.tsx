"use client"

import { useEffect, useState } from "react"
import {
  ArrowRight,
  ChevronDown,
  Cpu,
  Github,
  Network,
  Rocket,
  Server,
  ShieldCheck,
  WandSparkles,
} from "lucide-react"
import Link from "next/link"
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard"
import { XoTeaserChatWindow } from "@/components/landing/XoTeaserChatWindow"

const links = {
  startLocal: "/login?ref=landing_start_local_15m",
  contribute:
    "https://github.com/QSchlegel/OrchWiz/issues?utm_source=orchwiz_app&utm_medium=landing&utm_campaign=agent_vpc_positioning&utm_content=contribute_adapter",
  github:
    "https://github.com/QSchlegel/OrchWiz?utm_source=orchwiz_app&utm_medium=landing&utm_campaign=agent_vpc_positioning&utm_content=repo_visit",
}

const dynamicHeroClaims = [
  "shielded runtime boundaries",
  "captain-grade policy control",
  "captain's-log decision trails",
]

const painPoints = [
  {
    title: "Context leaks across environments",
    description:
      "Teams ship agents quickly, then lose runtime boundaries between local and cloud systems.",
    icon: Network,
    color: "text-rose-600 dark:text-rose-400",
    accent: "from-rose-500/25 to-rose-600/10 dark:from-rose-500/20 dark:to-rose-600/5",
  },
  {
    title: "Policy controls break under pressure",
    description:
      "Ad-hoc tooling makes it hard to enforce who can run what, where, and with which permissions.",
    icon: Cpu,
    color: "text-amber-600 dark:text-amber-400",
    accent: "from-amber-500/25 to-amber-600/10 dark:from-amber-500/20 dark:to-amber-600/5",
  },
  {
    title: "No trustworthy audit path",
    description:
      "Prompts, tool calls, and decisions get fragmented, so reviews become slow and uncertain.",
    icon: Server,
    color: "text-blue-600 dark:text-blue-400",
    accent: "from-blue-500/25 to-blue-600/10 dark:from-blue-500/20 dark:to-blue-600/5",
  },
]

const pillars = [
  {
    title: "Boundary",
    description:
      "Private-by-default runtime boundaries across local and cloud nodes, with explicit forwarding controls.",
    icon: Network,
    color: "text-violet-600 dark:text-violet-400",
    accent: "from-violet-500/25 to-violet-600/10 dark:from-violet-500/20 dark:to-violet-600/5",
  },
  {
    title: "Control",
    description:
      "Policy gates, permission matching, and deployment/session controls designed for operator-grade workflows.",
    icon: WandSparkles,
    color: "text-emerald-600 dark:text-emerald-400",
    accent: "from-emerald-500/25 to-emerald-600/10 dark:from-emerald-500/20 dark:to-emerald-600/5",
  },
  {
    title: "Traceability",
    description:
      "Auditable prompts, actions, tool calls, and security scoring so every decision has a review path.",
    icon: ShieldCheck,
    color: "text-cyan-600 dark:text-cyan-400",
    accent: "from-cyan-500/25 to-cyan-600/10 dark:from-cyan-500/20 dark:to-cyan-600/5",
  },
]

const proofPoints = [
  "Passkey + magic-link authentication",
  "Role-based access controls",
  "Command execution safety gating",
  "Permission matching before execution",
  "Signed forwarding with replay/rate guardrails",
  "Timestamp + nonce + signature forwarding validation",
  "Owner-scoped forwarding tests with allowlist enforcement",
  "Security audit engine + bridge-crew scorecards",
  "Nightly and on-demand security audit routes",
  "Strict resource ownership controls",
  "Encrypted traces with scoped decryption endpoint",
  "Wallet-enclave encryption/decryption for private vault memory",
  "Typed SSE event stream for operational updates",
  "60+ focused unit test files across runtime and enclave modules",
]

const contributorTracks = [
  {
    title: "Runtime Adapters",
    description:
      "Extend provider chains and execution adapters without coupling runtime choices to the UI layer.",
    icon: Server,
    color: "text-emerald-600 dark:text-emerald-400",
    accent: "from-emerald-500/25 to-emerald-600/10 dark:from-emerald-500/20 dark:to-emerald-600/5",
  },
  {
    title: "Security + Governance",
    description:
      "Contribute policy presets, audit checks, and ownership controls that improve safety by default.",
    icon: ShieldCheck,
    color: "text-amber-600 dark:text-amber-400",
    accent: "from-amber-500/25 to-amber-600/10 dark:from-amber-500/20 dark:to-amber-600/5",
  },
  {
    title: "Topology + Operations",
    description:
      "Improve node orchestration, forwarding, and Ship Yard workflows for local/cloud agent operations.",
    icon: Rocket,
    color: "text-pink-600 dark:text-pink-400",
    accent: "from-pink-500/25 to-pink-600/10 dark:from-pink-500/20 dark:to-pink-600/5",
  },
]

export default function Home() {
  const [activeHeroClaim, setActiveHeroClaim] = useState(0)

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveHeroClaim((current) => (current + 1) % dynamicHeroClaims.length)
    }, 2400)
    return () => window.clearInterval(interval)
  }, [])

  const currentHeroClaim = dynamicHeroClaims[activeHeroClaim]

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
        <section id="hero" className="flex flex-col items-center justify-center min-h-[90vh] px-6 md:px-12 text-center">
          <div className="animate-fade-up max-w-3xl">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-slate-300/80 dark:border-white/10 bg-white/75 dark:bg-white/[0.03] text-xs tracking-widest uppercase text-slate-600 dark:text-gray-400 mb-8 shadow-sm shadow-slate-900/5 dark:shadow-none" style={{ fontFamily: 'var(--font-mono)' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Starfleet-grade Agent VPC for AI infra engineers
            </div>

            {/* Title */}
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight leading-[0.95] mb-6">
              <span className="bg-gradient-to-br from-violet-600 via-fuchsia-500 to-orange-500 dark:from-violet-400 dark:via-pink-400 dark:to-amber-300 bg-clip-text text-transparent">
                OrchWiz
              </span>
              <br />
              <span className="bg-gradient-to-br from-slate-900 via-slate-700 to-slate-500 dark:from-white dark:via-gray-200 dark:to-gray-500 bg-clip-text text-transparent drop-shadow-[0_2px_8px_rgba(15,23,42,0.16)] dark:drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)]">
                Your Agent VPC for
              </span>
              <br />
              <span className="bg-gradient-to-br from-cyan-600 via-blue-500 to-violet-500 dark:from-cyan-300 dark:via-blue-300 dark:to-violet-300 bg-clip-text text-transparent">
                production AI systems
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-lg md:text-xl text-slate-700 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed mb-10 text-balance">
              OrchWiz runs agents across local and cloud nodes with{" "}
              <span
                key={currentHeroClaim}
                className="inline-block font-semibold text-violet-700 dark:text-violet-300 animate-fade-up"
              >
                {currentHeroClaim}
              </span>
              .
            </p>

            <div className="flex items-center justify-center gap-2 mb-10">
              {dynamicHeroClaims.map((claim, index) => (
                <span
                  key={claim}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    activeHeroClaim === index
                      ? "w-6 bg-violet-500 dark:bg-violet-300"
                      : "w-1.5 bg-slate-400/60 dark:bg-slate-500/70"
                  }`}
                  aria-hidden
                />
              ))}
            </div>

            {/* CTA buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
              <Link
                href={links.startLocal}
                className="group inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 text-white font-semibold text-sm tracking-wide hover:from-violet-500 hover:to-pink-500 transition-all duration-300 shadow-lg shadow-violet-900/30"
              >
                Beam me up to get started
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <a
                href={links.contribute}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl border border-slate-300/80 dark:border-white/10 bg-white/80 dark:bg-white/[0.03] text-slate-700 dark:text-gray-300 font-medium text-sm tracking-wide hover:bg-white dark:hover:bg-white/[0.06] hover:border-slate-400/70 dark:hover:border-white/20 transition-all duration-300 shadow-sm shadow-slate-900/5 dark:shadow-none"
              >
                Join the bridge crew
              </a>
              <a
                href={links.github}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl border border-slate-300/80 dark:border-white/10 bg-white/80 dark:bg-white/[0.03] text-slate-700 dark:text-gray-300 font-medium text-sm tracking-wide hover:bg-white dark:hover:bg-white/[0.06] hover:border-slate-400/70 dark:hover:border-white/20 transition-all duration-300 shadow-sm shadow-slate-900/5 dark:shadow-none"
              >
                <Github className="w-4 h-4" />
                GitHub
              </a>
            </div>

            <p className="text-xs text-slate-500 dark:text-gray-500" style={{ fontFamily: 'var(--font-mono)' }}>
              Boundary &middot; Control &middot; Traceability
            </p>
          </div>

          {/* Scroll hint */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-slate-500 dark:text-gray-500 animate-bounce">
            <ChevronDown className="w-5 h-5" />
          </div>
        </section>

        <XoTeaserChatWindow />

        {/* ── Pain Points ── */}
        <section id="bridge-risks" className="px-6 md:px-12 pb-24">
          <div className="max-w-6xl mx-auto">
            <div className="mb-10 animate-fade-up" style={{ animationDelay: '0.15s' }}>
              <p className="text-xs tracking-widest uppercase text-rose-600 dark:text-rose-400 mb-3" style={{ fontFamily: 'var(--font-mono)' }}>
                Red alert in Agent Ops
              </p>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tight">
                Scale breaks when boundaries, controls, and audit paths are unclear
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {painPoints.map((item, i) => {
                const Icon = item.icon
                return (
                  <div
                    key={item.title}
                    className="group glass rounded-2xl p-6 hover:bg-slate-900/[0.03] dark:hover:bg-white/[0.04] transition-all duration-300 animate-fade-up"
                    style={{ animationDelay: `${0.2 + i * 0.08}s` }}
                  >
                    <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${item.accent} mb-4`}>
                      <Icon className={`w-5 h-5 ${item.color}`} strokeWidth={1.5} />
                    </div>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-2 tracking-tight">
                      {item.title}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-gray-500 leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* ── Agent VPC Pillars ── */}
        <section id="vpc-pillars" className="px-6 md:px-12 pb-32">
          <div className="max-w-6xl mx-auto">
            {/* Section header */}
            <div className="mb-12 animate-fade-up" style={{ animationDelay: '0.25s' }}>
              <p className="text-xs tracking-widest uppercase text-violet-600 dark:text-violet-400 mb-3" style={{ fontFamily: 'var(--font-mono)' }}>
                What an Agent VPC gives you
              </p>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tight">
                Three pillars that keep the fleet stable
              </h2>
              <p className="text-slate-600 dark:text-gray-500 mt-3 max-w-lg">
                OrchWiz standardizes agent operations around boundary, control, and traceability.
              </p>
            </div>

            {/* Capabilities grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {pillars.map((pillar, i) => {
                const Icon = pillar.icon
                return (
                  <div
                    key={pillar.title}
                    className="group glass rounded-2xl p-6 hover:bg-slate-900/[0.03] dark:hover:bg-white/[0.04] transition-all duration-300 animate-fade-up"
                    style={{ animationDelay: `${0.3 + i * 0.08}s` }}
                  >
                    <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${pillar.accent} mb-4`}>
                      <Icon className={`w-5 h-5 ${pillar.color}`} strokeWidth={1.5} />
                    </div>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-2 tracking-tight">
                      {pillar.title}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-gray-500 leading-relaxed">
                      {pillar.description}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* ── Proof Strip ── */}
        <section id="proof-strip" className="px-6 md:px-12 pb-24">
          <div className="max-w-6xl mx-auto glass rounded-2xl p-6 md:p-8 animate-fade-up">
            <p className="text-xs tracking-widest uppercase text-emerald-600 dark:text-emerald-400 mb-3" style={{ fontFamily: 'var(--font-mono)' }}>
              Ship's log: proof from the product
            </p>
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white tracking-tight mb-6">
              Evidence-backed security and governance signals from live systems
            </h2>
            <div className="flex flex-wrap gap-2">
              {proofPoints.map((proof) => (
                <span
                  key={proof}
                  className="px-3 py-1.5 rounded-full text-[11px] font-medium bg-slate-900/[0.05] text-slate-700 border border-slate-300/70 dark:bg-white/[0.05] dark:text-gray-300 dark:border-white/[0.08]"
                >
                  {proof}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── Build With Us ── */}
        <section id="bridge-crew" className="px-6 md:px-12 pb-28">
          <div className="max-w-6xl mx-auto">
            <div className="mb-10 animate-fade-up">
              <p className="text-xs tracking-widest uppercase text-cyan-600 dark:text-cyan-400 mb-3" style={{ fontFamily: 'var(--font-mono)' }}>
                Join the bridge crew
              </p>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tight">
                Help OrchWiz level up the Agent VPC fleet
              </h2>
              <p className="text-slate-600 dark:text-gray-500 mt-3 max-w-2xl">
                We are prioritizing runtime adapters, security posture, and topology operations for open collaboration.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              {contributorTracks.map((track, i) => {
                const Icon = track.icon
                return (
                  <div
                    key={track.title}
                    className="group glass rounded-2xl p-6 hover:bg-slate-900/[0.03] dark:hover:bg-white/[0.04] transition-all duration-300 animate-fade-up"
                    style={{ animationDelay: `${0.12 + i * 0.08}s` }}
                  >
                    <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${track.accent} mb-4`}>
                      <Icon className={`w-5 h-5 ${track.color}`} strokeWidth={1.5} />
                    </div>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-2 tracking-tight">
                      {track.title}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-gray-500 leading-relaxed">
                      {track.description}
                    </p>
                  </div>
                )
              })}
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <a
                href={links.contribute}
                target="_blank"
                rel="noreferrer"
                className="group inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-semibold text-sm tracking-wide hover:from-cyan-500 hover:to-blue-500 transition-all duration-300 shadow-lg shadow-cyan-900/25"
              >
                Open mission board
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </a>
              <Link
                href={links.startLocal}
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl border border-slate-300/80 dark:border-white/10 bg-white/80 dark:bg-white/[0.03] text-slate-700 dark:text-gray-300 font-medium text-sm tracking-wide hover:bg-white dark:hover:bg-white/[0.06] hover:border-slate-400/70 dark:hover:border-white/20 transition-all duration-300 shadow-sm shadow-slate-900/5 dark:shadow-none"
              >
                Launch from the command deck
              </Link>
            </div>
          </div>
        </section>

        {/* ── Start Path ── */}
        <section id="start-path" className="px-6 md:px-12 pb-24">
          <div className="max-w-6xl mx-auto animate-fade-up" style={{ animationDelay: '0.15s' }}>
            <div className="mb-8">
              <p className="text-xs tracking-widest uppercase text-violet-600 dark:text-violet-400 mb-3" style={{ fontFamily: 'var(--font-mono)' }}>
                Flight path
              </p>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tight">
                Follow the guided onboarding and launch your first mission
              </h2>
              <p className="text-slate-600 dark:text-gray-500 mt-3 max-w-2xl">
                The same flow works for new users and new contributors: authenticate, start a session, connect topology, deploy safely.
              </p>
            </div>
            <OnboardingWizard />
          </div>
        </section>

        {/* ── Footer line ── */}
        <section className="px-6 md:px-12 pb-20">
          <div className="max-w-3xl mx-auto text-center">
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              Ready to take the helm?{" "}
              <Link href={links.startLocal} className="text-violet-600 dark:text-violet-400 font-medium hover:underline">
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
