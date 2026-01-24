"use client"

import { useEffect, useState } from "react"
import { SessionCard } from "@/components/shared/SessionCard"
import { useSession } from "@/lib/auth-client"
import Link from "next/link"
import { Session } from "@prisma/client"

type SessionWithCount = Session & {
  _count: {
    interactions: number
  }
}

export default function SessionsPage() {
  const { data: session } = useSession()
  const [sessions, setSessions] = useState<SessionWithCount[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<{
    status?: string
    mode?: string
  }>({})

  useEffect(() => {
    if (session) {
      fetchSessions()
    }
  }, [session, filter])

  const fetchSessions = async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (filter.status) params.append("status", filter.status)
      if (filter.mode) params.append("mode", filter.mode)

      const response = await fetch(`/api/sessions?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setSessions(data)
      }
    } catch (error) {
      console.error("Error fetching sessions:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateSession = async () => {
    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "New Session",
          mode: "plan",
          source: "web",
        }),
      })

      if (response.ok) {
        const newSession = await response.json()
        window.location.href = `/sessions/${newSession.id}`
      }
    } catch (error) {
      console.error("Error creating session:", error)
    }
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="mb-4">Please sign in to view your sessions.</p>
          <Link
            href="/login"
            className="text-blue-600 hover:text-blue-800 underline"
          >
            Sign In
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Sessions
          </h1>
          <button
            onClick={handleCreateSession}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            New Session
          </button>
        </div>

        <div className="mb-6 flex gap-4">
          <select
            value={filter.status || ""}
            onChange={(e) =>
              setFilter({ ...filter, status: e.target.value || undefined })
            }
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="">All Statuses</option>
            <option value="planning">Planning</option>
            <option value="executing">Executing</option>
            <option value="completed">Completed</option>
            <option value="paused">Paused</option>
            <option value="failed">Failed</option>
          </select>

          <select
            value={filter.mode || ""}
            onChange={(e) =>
              setFilter({ ...filter, mode: e.target.value || undefined })
            }
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="">All Modes</option>
            <option value="plan">Plan</option>
            <option value="auto_accept">Auto-accept</option>
          </select>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            Loading sessions...
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            No sessions found. Create your first session to get started!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sessions.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
