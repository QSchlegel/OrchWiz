"use client"

import { useSession } from "@/lib/auth-client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect } from "react"
import { WandSparkles } from "lucide-react"

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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <nav className="glass dark:glass-dark border-b border-white/20 dark:border-white/10 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <Link
                href="/sessions"
                className="flex items-center gap-2 px-2 py-2 text-sm font-medium text-gray-900 dark:text-white"
              >
                <WandSparkles className="w-5 h-5 text-purple-400" />
                <span>OrchWiz</span>
              </Link>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                <Link
                  href="/sessions"
                  className={`inline-flex items-center px-1 pt-1 text-sm font-medium ${
                    pathname?.startsWith("/sessions")
                      ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
                >
                  Sessions
                </Link>
                <Link
                  href="/bridge"
                  className={`inline-flex items-center px-1 pt-1 text-sm font-medium ${
                    pathname?.startsWith("/bridge")
                      ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
                >
                  Bridge
                </Link>
                <Link
                  href="/commands"
                  className={`inline-flex items-center px-1 pt-1 text-sm font-medium ${
                    pathname?.startsWith("/commands")
                      ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
                >
                  Commands
                </Link>
                <Link
                  href="/subagents"
                  className={`inline-flex items-center px-1 pt-1 text-sm font-medium ${
                    pathname?.startsWith("/subagents")
                      ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
                >
                  Subagents
                </Link>
                <Link
                  href="/deployments"
                  className={`inline-flex items-center px-1 pt-1 text-sm font-medium ${
                    pathname?.startsWith("/deployments")
                      ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
                >
                  Agents
                </Link>
                <Link
                  href="/applications"
                  className={`inline-flex items-center px-1 pt-1 text-sm font-medium ${
                    pathname?.startsWith("/applications")
                      ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
                >
                  Applications
                </Link>
                <Link
                  href="/docs/claude"
                  className={`inline-flex items-center px-1 pt-1 text-sm font-medium ${
                    pathname?.startsWith("/docs")
                      ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
                >
                  Docs
                </Link>
                <Link
                  href="/hooks"
                  className={`inline-flex items-center px-1 pt-1 text-sm font-medium ${
                    pathname?.startsWith("/hooks")
                      ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
                >
                  Hooks
                </Link>
                <Link
                  href="/permissions"
                  className={`inline-flex items-center px-1 pt-1 text-sm font-medium ${
                    pathname?.startsWith("/permissions")
                      ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
                >
                  Permissions
                </Link>
                <Link
                  href="/projects"
                  className={`inline-flex items-center px-1 pt-1 text-sm font-medium ${
                    pathname?.startsWith("/projects")
                      ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
                >
                  Projects
                </Link>
              </div>
            </div>
            <div className="flex items-center">
              <span className="text-sm text-gray-700 dark:text-gray-300 mr-4">
                {session.user.email}
              </span>
              <button
                onClick={async () => {
                  const { signOut } = await import("@/lib/auth-client")
                  signOut()
                }}
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </nav>
      {children}
    </div>
  )
}
