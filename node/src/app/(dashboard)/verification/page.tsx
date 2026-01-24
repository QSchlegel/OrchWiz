"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

interface VerificationRun {
  id: string
  sessionId: string
  type: string
  status: string | null
  result: any
  iterations: number | null
  feedback: string | null
  startedAt: Date
  completedAt: Date | null
  session: {
    id: string
    title: string | null
  }
}

export default function VerificationPage() {
  const [runs, setRuns] = useState<VerificationRun[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filters, setFilters] = useState({
    type: "",
    status: "",
  })

  useEffect(() => {
    fetchRuns()
  }, [filters])

  const fetchRuns = async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.type) params.append("type", filters.type)
      if (filters.status) params.append("status", filters.status)

      const response = await fetch(`/api/verification?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setRuns(data)
      }
    } catch (error) {
      console.error("Error fetching verification runs:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const typeColors = {
    browser: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    bash: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    test_suite: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    app_test: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  }

  const getStatusColor = (status: string | null) => {
    if (!status) return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200"
    if (status === "passed" || status === "success")
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
    if (status === "failed" || status === "error")
      return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
    return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-white">
          Verification Workflows
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
            <option value="browser">Browser</option>
            <option value="bash">Bash</option>
            <option value="test_suite">Test Suite</option>
            <option value="app_test">App Test</option>
          </select>

          <select
            value={filters.status}
            onChange={(e) =>
              setFilters({ ...filters, status: e.target.value })
            }
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="">All Statuses</option>
            <option value="passed">Passed</option>
            <option value="failed">Failed</option>
            <option value="running">Running</option>
          </select>
        </div>

        {/* Quality Metrics Summary */}
        {runs.length > 0 && (
          <div className="mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                Total Runs
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {runs.length}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                Passed
              </p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {
                  runs.filter(
                    (r) => r.status === "passed" || r.status === "success"
                  ).length
                }
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                Failed
              </p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                {
                  runs.filter(
                    (r) => r.status === "failed" || r.status === "error"
                  ).length
                }
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                Avg Iterations
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {runs.length > 0
                  ? Math.round(
                      (runs.reduce((sum, r) => sum + (r.iterations || 0), 0) /
                        runs.length) *
                        10
                    ) / 10
                  : 0}
              </p>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            Loading verification runs...
          </div>
        ) : runs.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            No verification runs found
          </div>
        ) : (
          <div className="space-y-4">
            {runs.map((run) => (
              <div
                key={run.id}
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded ${
                          typeColors[
                            run.type as keyof typeof typeColors
                          ] || typeColors.browser
                        }`}
                      >
                        {run.type.replace("_", " ")}
                      </span>
                      {run.status && (
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded ${getStatusColor(
                            run.status
                          )}`}
                        >
                          {run.status}
                        </span>
                      )}
                      {run.iterations !== null && (
                        <span className="px-2 py-1 text-xs font-medium rounded bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200">
                          {run.iterations} iterations
                        </span>
                      )}
                    </div>
                    <Link
                      href={`/sessions/${run.sessionId}`}
                      className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Session: {run.session.title || run.sessionId}
                    </Link>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Started: {new Date(run.startedAt).toLocaleString()}
                    </p>
                    {run.completedAt && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Completed:{" "}
                        {new Date(run.completedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>

                {run.feedback && (
                  <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Feedback:
                    </p>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {run.feedback}
                    </p>
                  </div>
                )}

                {run.result && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Result:
                    </p>
                    <pre className="text-xs bg-gray-50 dark:bg-gray-700 p-2 rounded overflow-x-auto">
                      {JSON.stringify(run.result, null, 2)}
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
