"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Rocket, Network, WandSparkles, X, Github } from "lucide-react"

const STORAGE_KEY = "orchwiz:welcome-dismissed"

const quickStartItems = [
  {
    title: "Start your first session",
    description: "Create an Agent Ops session in plan or auto-accept mode.",
    href: "/sessions",
    icon: WandSparkles,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-100 dark:bg-amber-500/15",
  },
  {
    title: "Explore the Bridge",
    description: "See your node topology and live activity streams.",
    href: "/bridge",
    icon: Network,
    color: "text-pink-600 dark:text-pink-400",
    bg: "bg-pink-100 dark:bg-pink-500/15",
  },
  {
    title: "Deploy a subagent",
    description: "Push an AI agent to a local or cloud node.",
    href: "/subagents",
    icon: Rocket,
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-100 dark:bg-violet-500/15",
  },
  {
    title: "Connect GitHub",
    description: "Link your GitHub account for PR tracking.",
    href: "/github/prs",
    icon: Github,
    color: "text-slate-700 dark:text-slate-300",
    bg: "bg-slate-100 dark:bg-white/[0.06]",
  },
]

interface WelcomeModalProps {
  userName: string
}

export function WelcomeModal({ userName }: WelcomeModalProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY)
    if (!dismissed) {
      setVisible(true)
    }
  }, [])

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1")
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 dark:bg-black/60 welcome-modal-backdrop"
        onClick={dismiss}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-slate-900 welcome-modal-enter">
        <button
          type="button"
          onClick={dismiss}
          className="absolute top-4 right-4 inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-white/[0.06] transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight mb-1">
          Welcome{userName ? `, ${userName}` : ""}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          Here are a few things to get you started.
        </p>

        <div className="space-y-2">
          {quickStartItems.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={dismiss}
                className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3 transition-colors hover:border-slate-200 hover:bg-slate-100/70 dark:border-white/[0.06] dark:bg-white/[0.02] dark:hover:border-white/10 dark:hover:bg-white/[0.05]"
              >
                <div className={`flex items-center justify-center w-9 h-9 rounded-lg ${item.bg}`}>
                  <Icon className={`w-4 h-4 ${item.color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{item.title}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{item.description}</p>
                </div>
              </Link>
            )
          })}
        </div>

        <button
          type="button"
          onClick={dismiss}
          className="mt-5 w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300 dark:hover:bg-white/[0.06]"
        >
          Skip for now
        </button>
      </div>
    </div>
  )
}
