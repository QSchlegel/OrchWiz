import Link from "next/link"
import { publicDocsTopics } from "@/lib/landing/public-docs"

const commandExamples = [
  "/help",
  "/go start",
  "/go pillars",
  "/docs passkey",
  "/docs cloud",
  "/newsletter",
  "/register",
]

export default function PublicDocsPage() {
  const topics = publicDocsTopics()

  return (
    <main className="min-h-screen gradient-orb noise-overlay relative text-slate-900 dark:text-slate-100 px-6 py-12 md:px-12">
      <div className="absolute inset-0 bridge-grid pointer-events-none opacity-20 dark:opacity-35" aria-hidden />

      <div className="relative z-10 max-w-5xl mx-auto space-y-10">
        <header className="glass rounded-2xl p-6 md:p-8">
          <p className="text-xs tracking-widest uppercase text-cyan-600 dark:text-cyan-300 mb-3" style={{ fontFamily: "var(--font-mono)" }}>
            Public docs
          </p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
            XO landing docs hub
          </h1>
          <p className="mt-3 text-sm md:text-base text-slate-600 dark:text-slate-300 max-w-3xl">
            Lightweight guidance for the landing XO chat, passkey guardrails, slash command navigation, and public-cloud deployment controls.
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
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Jump to topic</h2>
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

        <section id="slash-commands" className="glass rounded-2xl p-6 md:p-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">Slash command quick reference</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
            XO command parsing is intentionally narrow. It is tuned for tactical navigation, docs pointers, and conversion prompts.
          </p>
          <div className="flex flex-wrap gap-2">
            {commandExamples.map((command) => (
              <code
                key={command}
                className="rounded-md border border-slate-300/80 bg-slate-900/[0.03] px-2.5 py-1 text-xs text-slate-700 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-200"
              >
                {command}
              </code>
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
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">Deployment controls</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
            Public cloud operators can hard-disable landing XO without code changes by setting environment values.
          </p>
          <pre className="rounded-xl border border-slate-300/80 bg-slate-900/[0.03] p-4 text-xs text-slate-700 overflow-x-auto dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-200"><code>{`LANDING_XO_ENABLED=false
LANDING_XO_STAGE=public-preview`}</code></pre>
        </section>
      </div>
    </main>
  )
}
