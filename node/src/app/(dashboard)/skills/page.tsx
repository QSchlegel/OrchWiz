"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { PageLayout } from "@/components/dashboard/PageLayout"
import { SkillsPolicyLibraryTab } from "@/components/skills/SkillsPolicyLibraryTab"
import { SkillsPolicyAssignmentsTab } from "@/components/skills/SkillsPolicyAssignmentsTab"
import { SkillsCatalogTab } from "@/components/skills/SkillsCatalogTab"

type SkillsTab = "assignments" | "library" | "catalog"

function parseSkillsTab(raw: string | null): SkillsTab {
  if (raw === "assignments" || raw === "library" || raw === "catalog") {
    return raw
  }

  return "catalog"
}

export default function SkillsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const parsedTab = parseSkillsTab(searchParams.get("tab"))
  const [activeTab, setActiveTab] = useState<SkillsTab>(parsedTab)

  useEffect(() => {
    setActiveTab(parsedTab)
  }, [parsedTab])

  const setTab = (tab: SkillsTab) => {
    setActiveTab(tab)
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", tab)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  const tabs = useMemo(
    () =>
      ([
        { id: "catalog", label: "Skill Catalog" },
        { id: "assignments", label: "Policy Assignments" },
        { id: "library", label: "Policy Library" },
      ] as Array<{ id: SkillsTab; label: string }>),
    [],
  )

  return (
    <PageLayout
      title="Skills"
      description="Manage permission-profile assignments and import Codex skills through a graph-based skill catalog."
    >
      <div className="space-y-4">
        <div className="inline-flex rounded-lg border border-slate-200/80 bg-white/80 p-1 dark:border-white/10 dark:bg-white/[0.03]">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setTab(tab.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                activeTab === tab.id
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.08]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "assignments" ? <SkillsPolicyAssignmentsTab /> : null}
        {activeTab === "library" ? <SkillsPolicyLibraryTab /> : null}
        {activeTab === "catalog" ? <SkillsCatalogTab /> : null}
      </div>
    </PageLayout>
  )
}
