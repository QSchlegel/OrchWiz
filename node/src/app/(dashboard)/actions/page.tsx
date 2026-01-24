"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

interface AgentAction {
  id: string
  sessionId: string
  type: string
  action: string
  details: any
  status: string | null
  result: any
  timestamp: Date
  session: {
    id: string
    title: string | null
  }
}

export default function ActionsPage() {
  const [actions, setActions] = useState<AgentAction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filters, setFilters] = useState({
    type: "",
    status: "",
  })

  useEffect(() => {
    fetchActions()
  }, [filters])

  const fetchActions = async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.type) params.append("type", filters.type)
      if (filters.status) params.append("status", filters.status)

      const response = await fetch(`/api/actions?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setActions(data)
      }
    } catch (error) {
      console.error("Error fetching actions:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const typeColors = {
    slack: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    bigquery: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    sentry: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    other: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-white">
          Agent Actions
        </h1>

        {/* Filters */}
        <div className="mb-6 flex gap-4">
          <select
            value={filters.type}
            onChange={(e) =>
              setFilters({ ...filters, type: e.target.value })
            }
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="">All Types</option>
            <option value="slack">Slack</option>
            <option value="bigquery">BigQuery</option>
            <option value="sentry">Sentry</option>
            <option value="other">Other</option>
          </select>

          <select
            value={filters.status}
            onChange={(e) =>
              setFilters({ ...filters, status: e.target.value })
            }
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="">All Statuses</option>
            <option value="success">Success</option>
            <option value="error">Error</option>
            <option value="pending">Pending</option>
          </select>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            Loading actions...
          </div>
        ) : actions.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            No actions found
          </div>
        ) : (
          <div className="space-y-4">
            {actions.map((action) => (
              <div
                key={action.id}
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded ${
                          typeColors[
                            action.type as keyof typeof typeColors
                          ] || typeColors.other
                        }`}
                      >
                        {action.type}
                      </span>
                      <span className="text-lg font-semibold text-gray-900 dark:text-white">
                        {action.action}
                      </span>
                      {action.status && (
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded ${
                            action.status === "success"
                              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                              : action.status === "error"
                              ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                              : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                          }`}
                        >
                          {action.status}
                        </span>
                      )}
                    </div>
                    <Link
                      href={`/sessions/${action.sessionId}`}
                      className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Session: {action.session.title || action.sessionId}
                    </Link>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {new Date(action.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
                {action.details && (
                  <div className="mb-2">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Details:
                    </p>
                    <pre className="text-xs bg-gray-50 dark:bg-gray-700 p-2 rounded overflow-x-auto">
                      {JSON.stringify(action.details, null, 2)}
                    </pre>
                  </div>
                )}
                {action.result && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Result:
                    </p>
                    <pre className="text-xs bg-gray-50 dark:bg-gray-700 p-2 rounded overflow-x-auto">
                      {JSON.stringify(action.result, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
