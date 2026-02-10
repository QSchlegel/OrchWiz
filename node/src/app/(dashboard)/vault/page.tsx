"use client"

import { useEffect } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  ArrowDown,
  Bot,
  Database,
  Globe,
  Lock,
  Network,
  ShieldCheck,
  Ship,
} from "lucide-react"
import { PageLayout, SurfaceCard } from "@/components/dashboard/PageLayout"
import { useNotifications } from "@/components/notifications"
import { VAULT_TAB_NOTIFICATION_CHANNEL } from "@/lib/notifications/channels"
import { formatUnreadBadgeCount } from "@/lib/notifications/store"
import { VaultExplorer } from "@/components/vault/VaultExplorer"
import { VaultGraphView } from "@/components/vault/VaultGraphView"

type VaultTab = "topology" | "explorer" | "graph"

function VaultNode({
  icon: Icon,
  title,
  subtitle,
  tone,
  children,
}: {
  icon: React.ElementType
  title: string
  subtitle: string
  tone: string
  children?: React.ReactNode
}) {
  return (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <div className="flex items-start gap-3">
        <div className="rounded-xl border border-current/20 bg-white/60 p-2 dark:bg-white/[0.04]">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-tight">{title}</p>
          <p className="mt-1 text-xs opacity-80">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

function VaultTopologyView() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SurfaceCard>
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Vault Domains</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">3</p>
        </SurfaceCard>
        <SurfaceCard>
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Agent Segments</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">Public + Private</p>
        </SurfaceCard>
        <SurfaceCard>
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Integration Lane</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">Joined</p>
        </SurfaceCard>
      </div>

      <SurfaceCard className="overflow-hidden">
        <div className="rounded-xl border border-slate-200/70 bg-slate-50/70 p-3 text-xs text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300">
          <div className="inline-flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            <span>Private Agent Vault is encrypted through the wallet-enclave boundary.</span>
          </div>
        </div>

        <div className="mt-5 hidden md:block">
          <div className="grid grid-cols-2 gap-4">
            <VaultNode
              icon={Database}
              title="OrchWiz Vault"
              subtitle="Core orchestration memory and runtime context"
              tone="border-cyan-300/60 bg-cyan-100/60 text-cyan-900 dark:border-cyan-400/30 dark:bg-cyan-500/10 dark:text-cyan-100"
            />
            <VaultNode
              icon={Ship}
              title="Ship Vault"
              subtitle="Ship-level operational state and logs"
              tone="border-indigo-300/60 bg-indigo-100/60 text-indigo-900 dark:border-indigo-400/30 dark:bg-indigo-500/10 dark:text-indigo-100"
            />
          </div>

          <div className="mt-2 grid grid-cols-2">
            <div className="flex justify-center text-slate-400">
              <ArrowDown className="h-5 w-5" />
            </div>
            <div className="flex justify-center text-slate-400">
              <ArrowDown className="h-5 w-5" />
            </div>
          </div>

          <div className="mx-auto mt-2 max-w-3xl">
            <VaultNode
              icon={Bot}
              title="Agent Vault"
              subtitle="Partitioned by visibility with explicit security boundaries"
              tone="border-violet-300/60 bg-violet-100/60 text-violet-900 dark:border-violet-400/30 dark:bg-violet-500/10 dark:text-violet-100"
            >
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-300/70 bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.04]">
                  <div className="inline-flex items-center gap-1.5 text-xs font-medium">
                    <Globe className="h-3.5 w-3.5 text-sky-500" />
                    Public Vault
                  </div>
                  <p className="mt-1 text-[11px] opacity-80">
                    Shareable run notes, tool summaries, and non-sensitive context.
                  </p>
                </div>
                <div className="rounded-xl border border-slate-300/70 bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.04]">
                  <div className="inline-flex items-center gap-1.5 text-xs font-medium">
                    <Lock className="h-3.5 w-3.5 text-emerald-500" />
                    Private Encrypted Vault
                  </div>
                  <p className="mt-1 text-[11px] opacity-80">
                    Secrets, internal directives, and sensitive artifacts handled with restricted access.
                  </p>
                </div>
              </div>
            </VaultNode>
          </div>

          <div className="mt-2 flex justify-center text-slate-400">
            <ArrowDown className="h-5 w-5" />
          </div>

          <div className="mx-auto mt-2 max-w-2xl">
            <VaultNode
              icon={Network}
              title="Joined Vault"
              subtitle="Composed read model for cross-vault analytics and orchestration insight"
              tone="border-emerald-300/60 bg-emerald-100/60 text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-100"
            />
          </div>
        </div>

        <div className="mt-5 space-y-3 md:hidden">
          <VaultNode
            icon={Database}
            title="OrchWiz Vault"
            subtitle="Core orchestration memory and runtime context"
            tone="border-cyan-300/60 bg-cyan-100/60 text-cyan-900 dark:border-cyan-400/30 dark:bg-cyan-500/10 dark:text-cyan-100"
          />
          <div className="flex justify-center text-slate-400">
            <ArrowDown className="h-5 w-5" />
          </div>
          <VaultNode
            icon={Ship}
            title="Ship Vault"
            subtitle="Ship-level operational state and logs"
            tone="border-indigo-300/60 bg-indigo-100/60 text-indigo-900 dark:border-indigo-400/30 dark:bg-indigo-500/10 dark:text-indigo-100"
          />
          <div className="flex justify-center text-slate-400">
            <ArrowDown className="h-5 w-5" />
          </div>
          <VaultNode
            icon={Bot}
            title="Agent Vault"
            subtitle="Public and private encrypted partitions"
            tone="border-violet-300/60 bg-violet-100/60 text-violet-900 dark:border-violet-400/30 dark:bg-violet-500/10 dark:text-violet-100"
          >
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium">
              <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-1">
                <Globe className="h-3 w-3" />
                Public
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1">
                <Lock className="h-3 w-3" />
                Private Encrypted
              </span>
            </div>
          </VaultNode>
          <div className="flex justify-center text-slate-400">
            <ArrowDown className="h-5 w-5" />
          </div>
          <VaultNode
            icon={Network}
            title="Joined Vault"
            subtitle="Unified read path across all vault domains"
            tone="border-emerald-300/60 bg-emerald-100/60 text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-100"
          />
        </div>
      </SurfaceCard>
    </div>
  )
}

export default function VaultPage() {
  const { getUnread, registerActiveChannels } = useNotifications()
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const tabParam = searchParams.get("tab")
  const activeTab: VaultTab = tabParam === "explorer" || tabParam === "graph" ? tabParam : "topology"

  useEffect(() => {
    return registerActiveChannels([VAULT_TAB_NOTIFICATION_CHANNEL[activeTab]])
  }, [activeTab, registerActiveChannels])

  const setActiveTab = (tab: VaultTab) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", tab)
    const nextUrl = `${pathname}?${params.toString()}`
    router.replace(nextUrl, { scroll: false })
  }

  return (
    <PageLayout
      title="Vault"
      description="Obsidian-style explorer for OrchWiz, Ship, and Agent vaults with a joined read path."
    >
      <div className="space-y-4">
        <div className="inline-flex rounded-lg border border-slate-200/80 bg-white/80 p-1 dark:border-white/10 dark:bg-white/[0.03]">
          {([
            { id: "topology", label: "Topology" },
            { id: "explorer", label: "Explorer" },
            { id: "graph", label: "Graph" },
          ] as Array<{ id: VaultTab; label: string }>).map((tab) => {
            const badgeLabel = formatUnreadBadgeCount(getUnread([VAULT_TAB_NOTIFICATION_CHANNEL[tab.id]]))
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium ${
                  activeTab === tab.id
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.08]"
                }`}
              >
                <span>{tab.label}</span>
                {badgeLabel && (
                  <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                    {badgeLabel}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {activeTab === "topology" ? <VaultTopologyView /> : null}
        {activeTab === "explorer" ? <VaultExplorer /> : null}
        {activeTab === "graph" ? <VaultGraphView /> : null}
      </div>
    </PageLayout>
  )
}
