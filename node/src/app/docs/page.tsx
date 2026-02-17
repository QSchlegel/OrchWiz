import Link from "next/link"
import { publicDocsTopics } from "@/lib/landing/public-docs"

const TOC_ITEMS = [
  { href: "#what-is-orchwiz", label: "What is OrchWiz" },
  { href: "#architecture", label: "Architecture at a glance" },
  { href: "#product-areas", label: "Product areas" },
  { href: "#key-concepts", label: "Key concepts" },
  { href: "#getting-started", label: "Getting started" },
  { href: "#security-compliance", label: "Security and compliance" },
  { href: "#xo-and-landing", label: "XO and landing" },
  { href: "#deployment", label: "Deployment and operations" },
]

const commandRows = [
  { command: "/help", purpose: "List available commands." },
  { command: "/go start", purpose: "Open landing start path." },
  { command: "/go pillars", purpose: "Open platform pillars section." },
  { command: "/docs <topic>", purpose: "Jump to a docs section (e.g. /docs key-concepts)." },
  { command: "/newsletter", purpose: "Open newsletter signup." },
  { command: "/register", purpose: "Open registration panel." },
]

const REPO_DOCS_BASE = "https://github.com/QSchlegel/OrchWiz/blob/main"

export default function PublicDocsPage() {
  const topics = publicDocsTopics()

  return (
    <main className="min-h-screen gradient-orb noise-overlay relative text-slate-900 dark:text-slate-100 px-6 py-12 md:px-12">
      <div className="absolute inset-0 bridge-grid pointer-events-none opacity-20 dark:opacity-35" aria-hidden />

      <div className="relative z-10 max-w-5xl mx-auto space-y-10">
        <header className="glass rounded-2xl p-6 md:p-8">
          <p className="mb-3 text-xs tracking-widest uppercase text-cyan-600 dark:text-cyan-300" style={{ fontFamily: "var(--font-mono)" }}>
            Documentation
          </p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
            OrchWiz overview
          </h1>
          <p className="mt-3 text-sm md:text-base text-slate-600 dark:text-slate-300 max-w-3xl">
            A comprehensive guide to the platform: what it is, how it’s structured, and how to use it.
          </p>
          <nav className="mt-6" aria-label="Table of contents">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">On this page</p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {TOC_ITEMS.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="text-violet-600 dark:text-violet-400 hover:underline"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-6 flex flex-wrap gap-3 text-xs">
            <Link
              href="/"
              className="inline-flex items-center rounded-lg border border-slate-300/80 bg-white/70 px-3 py-1.5 text-slate-700 hover:bg-white dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08]"
            >
              Back to landing
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center rounded-lg border border-slate-300/80 bg-white/70 px-3 py-1.5 text-slate-700 hover:bg-white dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08]"
            >
              Sign in
            </Link>
          </div>
        </header>

        <section id="what-is-orchwiz" className="glass rounded-2xl p-6 md:p-8 scroll-mt-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">What is OrchWiz</h2>
          <p className="text-sm text-slate-700 dark:text-slate-200 mb-3">
            OrchWiz is the <strong>Agent VPC for AI infra engineers</strong>: a private, policy-controlled runtime network that runs agents across local and cloud nodes with full decision traceability.
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
            It addresses context leaks across environments, policy control under pressure, and the need for a trustworthy audit path by design.
          </p>
          <h3 className="text-base font-medium text-slate-800 dark:text-slate-100 mb-2">Three pillars</h3>
          <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
            <li className="rounded-lg border border-slate-300/80 bg-white/70 px-3 py-2 dark:border-white/15 dark:bg-white/[0.04]">
              <strong>Boundary</strong> — Private-by-default runtime boundaries across local and cloud nodes with explicit forwarding controls.
            </li>
            <li className="rounded-lg border border-slate-300/80 bg-white/70 px-3 py-2 dark:border-white/15 dark:bg-white/[0.04]">
              <strong>Control</strong> — Policy gates, permissions, and deployment/session controls for operator-grade Agent Ops.
            </li>
            <li className="rounded-lg border border-slate-300/80 bg-white/70 px-3 py-2 dark:border-white/15 dark:bg-white/[0.04]">
              <strong>Traceability</strong> — Auditable prompts, tool calls, actions, and risk scoring for every run.
            </li>
          </ul>
        </section>

        <section id="architecture" className="glass rounded-2xl p-6 md:p-8 scroll-mt-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">Architecture at a glance</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
            The control plane (Next.js app in <code className="rounded bg-slate-200/80 dark:bg-white/10 px-1">node/</code>) manages sessions, tasks, and actions; coordinates Ship Yard launches and fleet state; and exposes the Bridge, Vault, and Ready Room surfaces. Runtimes are pluggable (e.g. OpenClaw, OpenAI fallback, Codex CLI for quartermaster). The wallet-enclave service handles secrets and CIP-8 signing for forwarding, bridge connections, ship-yard secrets, and private vault flows. An optional data-core service provides non-private memory and sync; private memory stays local with encrypted storage and local vector index.
          </p>
          <ul className="space-y-1 text-sm text-slate-700 dark:text-slate-200 list-disc list-inside">
            <li>Control plane: auth, policy gates, session runtime, signed forwarding with replay/rate guardrails</li>
            <li>Ship Yard: local starship and cloud shipyard deployment profiles, provisioning (Terraform/Ansible), bridge crew bootstrap</li>
            <li>Runtime + evidence: security audits, scorecards, encrypted trace storage with scoped decrypt</li>
            <li>Topology: local nodes and cloud nodes, explicit forwarding controls</li>
          </ul>
        </section>

        <section id="product-areas" className="glass rounded-2xl p-6 md:p-8 scroll-mt-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">Product areas</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
            The dashboard is organized into areas that map to the sidebar. Each area groups related surfaces and APIs.
          </p>
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-300/80 bg-white/70 p-4 dark:border-white/15 dark:bg-white/[0.04]">
              <h3 className="font-medium text-slate-900 dark:text-white mb-1">Mission Control</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">
                Orchestration session lifecycle, task management for long-running jobs with forwarded events, and the action audit stream.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                In the app: <Link href="/login" className="text-violet-600 dark:text-violet-400 hover:underline">/mission-control</Link>, <Link href="/login" className="text-violet-600 dark:text-violet-400 hover:underline">/sessions</Link>, <Link href="/login" className="text-violet-600 dark:text-violet-400 hover:underline">/tasks</Link>, <Link href="/login" className="text-violet-600 dark:text-violet-400 hover:underline">/actions</Link>
              </p>
            </div>
            <div className="rounded-lg border border-slate-300/80 bg-white/70 p-4 dark:border-white/15 dark:bg-white/[0.04]">
              <h3 className="font-medium text-slate-900 dark:text-white mb-1">Fleet</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">
                Ship Yard launch wizard (local and cloud profiles, provisioning modes, bridge crew bootstrap), ships runtime and deployment status, and application CRUD with topology and n8n/Patch integration.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                In the app: <Link href="/login" className="text-violet-600 dark:text-violet-400 hover:underline">/ship-yard</Link>, <Link href="/login" className="text-violet-600 dark:text-violet-400 hover:underline">/ships</Link>, <Link href="/login" className="text-violet-600 dark:text-violet-400 hover:underline">/applications</Link>
              </p>
            </div>
            <div className="rounded-lg border border-slate-300/80 bg-white/70 p-4 dark:border-white/15 dark:bg-white/[0.04]">
              <h3 className="font-medium text-slate-900 dark:text-white mb-1">Personal</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">
                Personal agents (subagents) with context files and permission policy bindings, tools, and the skills catalog with graph-based skill tree and AgentSync flows.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                In the app: <Link href="/login" className="text-violet-600 dark:text-violet-400 hover:underline">/personal</Link>, <Link href="/login" className="text-violet-600 dark:text-violet-400 hover:underline">/personal/tools</Link>, <Link href="/login" className="text-violet-600 dark:text-violet-400 hover:underline">/skills</Link>
              </p>
            </div>
            <div className="rounded-lg border border-slate-300/80 bg-white/70 p-4 dark:border-white/15 dark:bg-white/[0.04]">
              <h3 className="font-medium text-slate-900 dark:text-white mb-1">Bridge Ops</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">
                Bridge state and commands, Bridge Call (station rounds, TTS), Bridge Chat, external connections (Telegram, Discord, WhatsApp), USS-K8S topology board, and Vault workspace with topology, explorer, and graph.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                In the app: <Link href="/login" className="text-violet-600 dark:text-violet-400 hover:underline">/bridge</Link>, <Link href="/login" className="text-violet-600 dark:text-violet-400 hover:underline">/bridge-call</Link>, <Link href="/login" className="text-violet-600 dark:text-violet-400 hover:underline">/bridge-chat</Link>, <Link href="/login" className="text-violet-600 dark:text-violet-400 hover:underline">/bridge-connections</Link>, <Link href="/login" className="text-violet-600 dark:text-violet-400 hover:underline">/uss-k8s</Link>, <Link href="/login" className="text-violet-600 dark:text-violet-400 hover:underline">/vault</Link>
              </p>
            </div>
            <div className="rounded-lg border border-slate-300/80 bg-white/70 p-4 dark:border-white/15 dark:bg-white/[0.04]">
              <h3 className="font-medium text-slate-900 dark:text-white mb-1">Ready Room (Intel)</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">
                Performance metrics, verification runs, security dashboard (on-demand and nightly audits, risk scoring, bridge-crew scorecards), Wallet Enclave UI, Treasury, Settings, Hooks, GitHub PRs, and the CLAUDE.md docs editor.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                In the app: <Link href="/login" className="text-violet-600 dark:text-violet-400 hover:underline">/performance</Link>, <Link href="/login" className="text-violet-600 dark:text-violet-400 hover:underline">/verification</Link>, <Link href="/login" className="text-violet-600 dark:text-violet-400 hover:underline">/security</Link>, <Link href="/login" className="text-violet-600 dark:text-violet-400 hover:underline">/wallet-enclave</Link>, <Link href="/login" className="text-violet-600 dark:text-violet-400 hover:underline">/treasury</Link>, <Link href="/login" className="text-violet-600 dark:text-violet-400 hover:underline">/settings</Link>, <Link href="/login" className="text-violet-600 dark:text-violet-400 hover:underline">/hooks</Link>, <Link href="/login" className="text-violet-600 dark:text-violet-400 hover:underline">/github/prs</Link>, <Link href="/login" className="text-violet-600 dark:text-violet-400 hover:underline">/docs/claude</Link>
              </p>
            </div>
            <div className="rounded-lg border border-slate-300/80 bg-white/70 p-4 dark:border-white/15 dark:bg-white/[0.04]">
              <h3 className="font-medium text-slate-900 dark:text-white mb-1">Community</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">
                Projects list and project detail with star flows; Views.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                In the app: <Link href="/login" className="text-violet-600 dark:text-violet-400 hover:underline">/projects</Link>, <Link href="/login" className="text-violet-600 dark:text-violet-400 hover:underline">/views</Link>
              </p>
            </div>
          </div>
        </section>

        <section id="key-concepts" className="glass rounded-2xl p-6 md:p-8 scroll-mt-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">Key concepts</h2>
          <div className="space-y-4 text-sm text-slate-700 dark:text-slate-200">
            <div>
              <h3 className="font-medium text-slate-900 dark:text-white mb-1">Sessions and runtime</h3>
              <p className="text-slate-600 dark:text-slate-300">
                Orchestration sessions drive the task lifecycle; tasks support forwarded events. The action audit stream records execution with filters. Runtime provider chains are profile-aware (e.g. OpenClaw, OpenAI fallback, Codex CLI for quartermaster).
              </p>
            </div>
            <div>
              <h3 className="font-medium text-slate-900 dark:text-white mb-1">Ship Yard and ships</h3>
              <p className="text-slate-600 dark:text-slate-300">
                Launch flow supports <code className="rounded bg-slate-200/80 dark:bg-white/10 px-1">local_starship_build</code> and <code className="rounded bg-slate-200/80 dark:bg-white/10 px-1">cloud_shipyard</code> profiles with Terraform/Ansible provisioning. Bridge crew roles and quartermaster quick-launch are part of bootstrap. Ship versioning and in-place upgrades are available; cloud launches can use the Treasury billing flow.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-slate-900 dark:text-white mb-1">Bridge crew and quartermaster</h3>
              <p className="text-slate-600 dark:text-slate-300">
                Bridge crew roles define station assignments; Bridge Call provides station rounds and TTS; ship-scoped chat supports DM/group messaging. The quartermaster integrates with Codex/OpenClaw for runtime prompts and context.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-slate-900 dark:text-white mb-1">Vault and memory</h3>
              <p className="text-slate-600 dark:text-slate-300">
                Multi-vault tree with file CRUD, hybrid/lexical search, and graph endpoint for note/link topology. When data-core is enabled, non-private memory syncs via signed envelopes; private markdown and vectors stay local and encrypted.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-slate-900 dark:text-white mb-1">Wallet enclave</h3>
              <p className="text-slate-600 dark:text-slate-300">
                Standalone service for Cardano address derivation, CIP-8 signing, and context-derived encrypt/decrypt. Used for forwarding, bridge connections, ship-yard secrets, and private vault flows; supports idempotency and policy gates.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-slate-900 dark:text-white mb-1">Security and audits</h3>
              <p className="text-slate-600 dark:text-slate-300">
                On-demand and nightly security audits, risk scoring, and bridge-crew stress scorecards. Encrypted observability traces with scoped decrypt endpoint. Local command execution safety gates and permission matching before execution.
              </p>
            </div>
          </div>
        </section>

        <section id="getting-started" className="glass rounded-2xl p-6 md:p-8 scroll-mt-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">Getting started</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
            Shortest path to run OrchWiz locally:
          </p>
          <pre className="rounded-xl border border-slate-300/80 bg-slate-900/[0.03] p-4 text-xs text-slate-700 overflow-x-auto dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-200 mb-4"><code>{`git clone git@github.com:QSchlegel/OrchWiz.git
cd OrchWiz
cd dev-local && docker compose up -d
cd ../node && cp .env.example .env
npm install && npm run db:generate && npm run db:push && npm run db:seed && npm run dev`}</code></pre>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
            Open <a href="http://localhost:3000" className="text-violet-600 dark:text-violet-400 hover:underline">http://localhost:3000</a>. For full setup (env vars, wallet-enclave, troubleshooting), see the{" "}
            <a href={`${REPO_DOCS_BASE}/docs/GETTING_STARTED.md`} target="_blank" rel="noopener noreferrer" className="text-violet-600 dark:text-violet-400 hover:underline">Getting Started guide</a> in the repo.
          </p>
          <p className="text-sm text-slate-700 dark:text-slate-200">
            <Link href="/login" className="inline-flex items-center rounded-lg border border-slate-300/80 bg-white/70 px-3 py-1.5 text-slate-700 hover:bg-white dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08]">
              Sign in
            </Link> to reach the dashboard after the app is running.
          </p>
        </section>

        <section id="security-compliance" className="glass rounded-2xl p-6 md:p-8 scroll-mt-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">Security and compliance</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
            OrchWiz uses passkey and magic-link authentication; role-based access controls apply across the control plane. Execution is gated by policy and permission matching; forwarding uses signed requests with replay and rate guardrails. Observability traces are encrypted with a scoped decrypt endpoint for authorized review.
          </p>
          <p className="text-sm text-slate-700 dark:text-slate-200">
            The repository maintains an ISO 27001 and SOC 2 (Security, Availability, Confidentiality) cert-ready baseline. See the{" "}
            <a href={`${REPO_DOCS_BASE}/docs/compliance/README.md`} target="_blank" rel="noopener noreferrer" className="text-violet-600 dark:text-violet-400 hover:underline">Compliance overview</a> for control domains, evidence model, and linked artifacts (control map, evidence checklist, roadmap). This repo does not claim completed certification; it documents the implementation baseline for external assessment.
          </p>
        </section>

        <section id="xo-and-landing" className="glass rounded-2xl p-6 md:p-8 scroll-mt-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">XO and landing</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">
            XO is OrchWiz’s Executive Officer voice for concise operational guidance on the landing page. XO directs visitors to the right controls and docs.
          </p>
          <p className="text-sm text-slate-700 dark:text-slate-200 mb-4">
            Protected landing chat actions can require passkey registration. Use the Command Deck below for navigation and landing actions.
          </p>
          <h3 className="text-base font-medium text-slate-800 dark:text-slate-100 mb-2">Command Deck</h3>
          <div className="overflow-hidden rounded-xl border border-slate-300/80 dark:border-white/15">
            {commandRows.map((item, index) => (
              <div
                key={item.command}
                className={`grid grid-cols-[auto,1fr] gap-3 px-4 py-3 bg-white/70 dark:bg-white/[0.04] ${
                  index < commandRows.length - 1 ? "border-b border-slate-300/80 dark:border-white/15" : ""
                }`}
              >
                <code className="inline-flex rounded-md border border-slate-300/80 bg-slate-900/[0.03] px-2 py-1 text-xs text-slate-700 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-200">
                  {item.command}
                </code>
                <p className="text-sm text-slate-600 dark:text-slate-300">{item.purpose}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="deployment" className="glass rounded-2xl p-6 md:p-8 scroll-mt-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">Deployment and operations</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
            In public cloud deployments you can disable the landing XO teaser and control its stage:
          </p>
          <pre className="rounded-xl border border-slate-300/80 bg-slate-900/[0.03] p-4 text-xs text-slate-700 overflow-x-auto dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-200 mb-4"><code>{`LANDING_XO_ENABLED=false
LANDING_XO_STAGE=public-preview`}</code></pre>
          <p className="text-sm text-slate-700 dark:text-slate-200">
            For a full feature map and API surface snapshot, see{" "}
            <a href={`${REPO_DOCS_BASE}/docs/CURRENT_FEATURES.md`} target="_blank" rel="noopener noreferrer" className="text-violet-600 dark:text-violet-400 hover:underline">Current features</a> in the repo.
          </p>
        </section>

        <section className="glass rounded-2xl p-6 md:p-8">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Topic index</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
            Direct anchors for focused reading. Use <code className="rounded bg-slate-200/80 dark:bg-white/10 px-1">/docs &lt;topic&gt;</code> in XO to jump here.
          </p>
          <div className="flex flex-wrap gap-2">
            {topics.map((topic) => (
              <a
                key={topic.slug}
                href={`#${topic.slug}`}
                className="rounded-full border border-slate-300/80 bg-white/70 px-3 py-1 text-xs text-slate-700 hover:bg-white dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08]"
              >
                {topic.title}
              </a>
            ))}
          </div>
        </section>

        {topics
          .filter((topic) => !["what-is-orchwiz", "architecture", "product-areas", "key-concepts", "getting-started", "security-compliance", "xo-and-landing", "deployment"].includes(topic.slug))
          .map((topic) => (
            <section key={topic.slug} id={topic.slug} className="glass rounded-2xl p-6 md:p-8 scroll-mt-8">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">{topic.title}</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">{topic.summary}</p>
              <p className="text-sm text-slate-700 dark:text-slate-200">{topic.teaser}</p>
            </section>
          ))}
      </div>
    </main>
  )
}
