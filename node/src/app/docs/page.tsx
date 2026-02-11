import Link from "next/link"
import { publicDocsTopics } from "@/lib/landing/public-docs"

const signalBriefPoints = [
  "Boundary: isolate agent runtimes across local and cloud nodes.",
  "Control: apply policy and permission checks before execution.",
  "Traceability: review prompts, tool calls, and outcomes end-to-end.",
  "Access: require passkey for protected landing chat actions.",
  "Operations: disable landing XO in public cloud when required.",
]

const commandRows = [
  { command: "/help", purpose: "List available commands." },
  { command: "/go start", purpose: "Open landing start path." },
  { command: "/go pillars", purpose: "Open platform pillars section." },
  { command: "/docs xo", purpose: "Open the primary brief." },
  { command: "/docs passkey", purpose: "Open passkey requirements." },
  { command: "/docs cloud", purpose: "Open cloud control guidance." },
  { command: "/newsletter", purpose: "Open newsletter signup." },
  { command: "/register", purpose: "Open registration panel." },
]

export default function PublicDocsPage() {
  const topics = publicDocsTopics()

  return (
    <main className="min-h-screen gradient-orb noise-overlay relative text-slate-900 dark:text-slate-100 px-6 py-12 md:px-12">
      <div className="absolute inset-0 bridge-grid pointer-events-none opacity-20 dark:opacity-35" aria-hidden />

      <div className="relative z-10 max-w-5xl mx-auto space-y-10">
        <header className="glass rounded-2xl p-6 md:p-8">
          <p className="mb-3 text-xs tracking-widest uppercase text-cyan-600 dark:text-cyan-300" style={{ fontFamily: "var(--font-mono)" }}>
            XO signal brief
          </p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
            Quick Brief from XO
          </h1>
          <p className="mt-3 text-sm md:text-base text-slate-600 dark:text-slate-300 max-w-3xl">
            Operational overview of OrchWiz controls, XO guidance, and deployment settings.
          </p>
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

        <section className="glass rounded-2xl p-6 md:p-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">Signal Brief</h2>
          <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
            {signalBriefPoints.map((point) => (
              <li key={point} className="rounded-lg border border-slate-300/80 bg-white/70 px-3 py-2 dark:border-white/15 dark:bg-white/[0.04]">
                {point}
              </li>
            ))}
          </ul>
        </section>

        <section className="glass rounded-2xl p-6 md:p-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">What XO Is</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">
            XO is OrchWiz's Executive Officer voice for concise operational guidance.
          </p>
          <p className="text-sm text-slate-700 dark:text-slate-200">
            XO complements runtime systems by directing operators to the right controls and docs.
          </p>
        </section>

        <section id="slash-commands" className="glass rounded-2xl p-6 md:p-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">Command Deck</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
            Compact commands for navigation and landing actions.
          </p>
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

        <section className="glass rounded-2xl p-6 md:p-8">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Topic Index</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
            Direct anchors for focused reading.
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
          .filter((topic) => topic.slug !== "slash-commands")
          .map((topic) => (
          <section key={topic.slug} id={topic.slug} className="glass rounded-2xl p-6 md:p-8">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">{topic.title}</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">{topic.summary}</p>
            <p className="text-sm text-slate-700 dark:text-slate-200">{topic.teaser}</p>
          </section>
          ))}

        <section id="cloud-config" className="glass rounded-2xl p-6 md:p-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">Deployment Control</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
            Disable landing XO in public cloud with these environment settings.
          </p>
          <pre className="rounded-xl border border-slate-300/80 bg-slate-900/[0.03] p-4 text-xs text-slate-700 overflow-x-auto dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-200"><code>{`LANDING_XO_ENABLED=false
LANDING_XO_STAGE=public-preview`}</code></pre>
        </section>
      </div>
    </main>
  )
}
