"use client"

import { useSession } from "@/lib/auth-client"
import { usePathname } from "next/navigation"
import { useEffect, useMemo } from "react"
import { Menu } from "lucide-react"
import { WelcomeModal } from "@/components/onboarding/WelcomeModal"
import {
  SidebarProvider,
  Sidebar,
  useSidebar,
  allNavItems,
  matchesPath,
} from "@/components/sidebar"

function DashboardHeader() {
  const { setMobileOpen } = useSidebar()
  const { data: session } = useSession()
  const pathname = usePathname()

  const activeLabel = useMemo(() => {
    return (
      allNavItems.find((item) => matchesPath(pathname, item.href))?.label ||
      "Dashboard"
    )
  }, [pathname])

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200/80 bg-white/85 px-4 backdrop-blur sm:px-6 dark:border-white/10 dark:bg-slate-900/80">
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 md:hidden dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-200 dark:hover:bg-white/[0.08]"
        aria-label="Open navigation"
      >
        <Menu className="h-4 w-4" />
      </button>

      <span className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
        {activeLabel}
      </span>

      <div className="ml-auto flex items-center gap-3 text-sm">
        <span className="hidden text-slate-600 sm:inline dark:text-slate-300">
          {session?.user.email}
        </span>
        <button
          onClick={async () => {
            const { signOut } = await import("@/lib/auth-client")
            signOut()
          }}
          className="rounded-md border border-slate-300 px-2.5 py-1 text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/[0.08]"
        >
          Sign Out
        </button>
      </div>
    </header>
  )
}

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar()

  return (
    <div
      className={`flex min-h-screen flex-1 flex-col transition-[padding-left] duration-300 ease-in-out ${
        // Sidebar is `fixed`, so use padding to reserve space without increasing scroll width.
        collapsed ? "md:pl-16" : "md:pl-60"
      }`}
    >
      <DashboardHeader />
      <main className="relative flex-1">{children}</main>
    </div>
  )
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { data: session, isPending } = useSession()
  const pathname = usePathname()

  useEffect(() => {
    if (!isPending && !session && pathname !== "/login") {
      window.location.href = "/login"
    }
  }, [session, isPending, pathname])

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    )
  }

  if (!session) {
    return null
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <Sidebar />
        <DashboardContent>{children}</DashboardContent>
        <WelcomeModal userName={session.user.name?.split(" ")[0] || ""} />
      </div>
    </SidebarProvider>
  )
}
