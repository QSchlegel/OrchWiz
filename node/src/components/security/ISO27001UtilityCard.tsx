"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { SurfaceCard } from "@/components/dashboard/PageLayout"

interface ISOChecklistItem {
  id: string
  title: string
  focus: string
  evidence: string
}

const CHECKLIST_STORAGE_KEY = "orchwiz.security.iso27001.checklist.v1"

const CHECKLIST_ITEMS: ISOChecklistItem[] = [
  {
    id: "scope",
    title: "Define ISMS scope and boundaries",
    focus: "Systems, data classes, vendors, and environments in certification scope.",
    evidence: "Scope statement and information asset inventory.",
  },
  {
    id: "gap-assessment",
    title: "Run ISO 27001:2022 gap assessment",
    focus: "Measure current posture against clauses and Annex A controls.",
    evidence: "Gap matrix with owners, due dates, and priorities.",
  },
  {
    id: "risk-and-soa",
    title: "Establish risk register and Statement of Applicability",
    focus: "Risk methodology, treatment plan, and control applicability decisions.",
    evidence: "Risk register, treatment plan, and signed SoA.",
  },
  {
    id: "control-implementation",
    title: "Implement and harden operational controls",
    focus: "IAM/MFA, logging, patching, secure SDLC, incident response, and backups.",
    evidence: "Control procedures and recurring control execution records.",
  },
  {
    id: "governance-cadence",
    title: "Operationalize governance cadence",
    focus: "Policies, training, internal audits, management reviews, corrective actions.",
    evidence: "Policy approvals, training logs, and review meeting minutes.",
  },
  {
    id: "evidence-automation",
    title: "Automate evidence collection",
    focus: "Continuously collect durable proof for each control owner and control run.",
    evidence: "Audit-ready evidence folder mapped to Annex A controls.",
  },
  {
    id: "certification-readiness",
    title: "Perform readiness review and book Stage 1/2 audit",
    focus: "Close top gaps, verify objective evidence, and run mock interviews.",
    evidence: "Readiness report and external certification audit plan.",
  },
]

interface ReadinessState {
  label: string
  badgeClass: string
  summary: string
}

function resolveReadiness(completed: number, total: number): ReadinessState {
  if (completed <= 0) {
    return {
      label: "Not Started",
      badgeClass: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300",
      summary: "Start with ISMS scope and a gap assessment to establish baseline.",
    }
  }

  if (completed < 3) {
    return {
      label: "Foundation",
      badgeClass: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300",
      summary: "Core governance is forming. Prioritize risk register and SoA completion.",
    }
  }

  if (completed < total) {
    return {
      label: "In Progress",
      badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
      summary: "Program controls are underway. Keep evidence collection continuous.",
    }
  }

  return {
    label: "Certification Ready",
    badgeClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300",
    summary: "Checklist complete. Keep controls operating and maintain audit evidence.",
  }
}

function normalizeStoredChecklist(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const allowedIds = new Set(CHECKLIST_ITEMS.map((item) => item.id))
  return value.filter((entry): entry is string => typeof entry === "string" && allowedIds.has(entry))
}

export function ISO27001UtilityCard() {
  const [completed, setCompleted] = useState<string[]>([])
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CHECKLIST_STORAGE_KEY)
      if (!raw) {
        setHydrated(true)
        return
      }

      const parsed = JSON.parse(raw) as unknown
      setCompleted(normalizeStoredChecklist(parsed))
    } catch {
      setCompleted([])
    } finally {
      setHydrated(true)
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    window.localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(completed))
  }, [completed, hydrated])

  const completedSet = useMemo(() => new Set(completed), [completed])
  const completedCount = completed.length
  const totalCount = CHECKLIST_ITEMS.length
  const progress = Math.round((completedCount / totalCount) * 100)
  const readiness = resolveReadiness(completedCount, totalCount)
  const nextStep = CHECKLIST_ITEMS.find((item) => !completedSet.has(item.id)) || null

  const toggle = (itemId: string) => {
    setCompleted((prev) => (prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]))
  }

  const resetChecklist = () => setCompleted([])

  return (
    <SurfaceCard>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">ISO 27001 Readiness Utility</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Baseline: ISO/IEC 27001:2022 + Amendment 1:2024. ISO/IEC 27001:2013 transition ended October 31, 2025.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${readiness.badgeClass}`}>{readiness.label}</span>
          <button
            type="button"
            onClick={resetChecklist}
            className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/[0.06]"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
          <span>
            Progress: {completedCount}/{totalCount}
          </span>
          <span>{progress}%</span>
        </div>
        <div className="mt-1 h-2 rounded-full bg-slate-200 dark:bg-white/10">
          <div
            className="h-2 rounded-full bg-slate-900 transition-all duration-300 dark:bg-slate-200"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{readiness.summary}</p>
      </div>

      {nextStep ? (
        <p className="mt-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
          Next focus: <span className="font-semibold">{nextStep.title}</span>
        </p>
      ) : (
        <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
          All readiness checkpoints are complete.
        </p>
      )}

      <ul className="mt-4 space-y-2">
        {CHECKLIST_ITEMS.map((item, index) => {
          const isChecked = completedSet.has(item.id)
          return (
            <li
              key={item.id}
              className={`rounded-lg border p-3 ${isChecked ? "border-emerald-300 bg-emerald-50/70 dark:border-emerald-500/40 dark:bg-emerald-500/10" : "border-slate-200 bg-white/60 dark:border-white/10 dark:bg-white/[0.02]"}`}
            >
              <label className="flex cursor-pointer gap-3">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggle(item.id)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500 dark:border-white/20 dark:bg-transparent dark:text-slate-200"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {index + 1}. {item.title}
                  </p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{item.focus}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Evidence: {item.evidence}</p>
                </div>
              </label>
            </li>
          )
        })}
      </ul>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <Link
          href="/docs#security-compliance"
          className="rounded-md border border-slate-300 px-2.5 py-1 text-slate-700 hover:bg-slate-100 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/[0.06]"
        >
          Open Security Docs
        </Link>
        <Link
          href="/security/incidents"
          className="rounded-md border border-slate-300 px-2.5 py-1 text-slate-700 hover:bg-slate-100 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/[0.06]"
        >
          Open Incidents
        </Link>
      </div>
    </SurfaceCard>
  )
}
