"use client"

import { useState } from "react"
import { PageLayout } from "@/components/dashboard/PageLayout"
import { SkillsPolicyAssignmentsTab } from "@/components/skills/SkillsPolicyAssignmentsTab"
import { SkillsCatalogTab } from "@/components/skills/SkillsCatalogTab"

type SkillsTab = "assignments" | "catalog"

export default function SkillsPage() {
  const [activeTab, setActiveTab] = useState<SkillsTab>("assignments")

  return (
    <PageLayout
      title="Skills"
      description="Manage permission-profile assignments and import Codex skills through a graph-based skill catalog."
    >
      <div className="space-y-4">
        <div className="inline-flex rounded-lg border border-slate-200/80 bg-white/80 p-1 dark:border-white/10 dark:bg-white/[0.03]">
          {([
            { id: "assignments", label: "Policy Assignments" },
            { id: "catalog", label: "Skill Catalog" },
          ] as Array<{ id: SkillsTab; label: string }>).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
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
        {activeTab === "catalog" ? <SkillsCatalogTab /> : null}
      </div>
    </PageLayout>
  )
}
