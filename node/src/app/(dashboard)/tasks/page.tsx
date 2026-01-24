"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

interface Task {
  id: string
  sessionId: string
  name: string
  status: string
  duration: number | null
  tokenCount: number | null
  strategy: string | null
  permissionMode: string | null
  metadata: any
  startedAt: Date
  completedAt: Date | null
  session: {
    id: string
    title: string | null
  }
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState("")

  useEffect(() => {
    fetchTasks()
  }, [statusFilter])

  const fetchTasks = async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.append("status", statusFilter)

      const response = await fetch(`/api/tasks?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setTasks(data)
      }
    } catch (error) {
      console.error("Error fetching tasks:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const statusColors = {
    running: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    thinking: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  }

  const formatDuration = (ms: number | null) => {
    if (!ms) return "N/A"
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) return `${hours}h ${minutes % 60}m`
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`
    return `${seconds}s`
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-white">
          Long-Running Tasks
        </h1>

        {/* Filter */}
        <div className="mb-6">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="">All Statuses</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="thinking">Thinking</option>
          </select>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            Loading tasks...
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            No tasks found
          </div>
        ) : (
          <div className="space-y-4">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {task.name}
                      </h3>
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded ${
                          statusColors[
                            task.status as keyof typeof statusColors
                          ] || statusColors.running
                        }`}
                      >
                        {task.status}
                      </span>
                    </div>
                    <Link
                      href={`/sessions/${task.sessionId}`}
                      className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Session: {task.session.title || task.sessionId}
                    </Link>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Started: {new Date(task.startedAt).toLocaleString()}
                    </p>
                    {task.completedAt && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Completed: {new Date(task.completedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Duration
                    </p>
                    <p className="text-sm text-gray-900 dark:text-white">
                      {formatDuration(task.duration)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Tokens
                    </p>
                    <p className="text-sm text-gray-900 dark:text-white">
                      {task.tokenCount?.toLocaleString() || "N/A"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Strategy
                    </p>
                    <p className="text-sm text-gray-900 dark:text-white">
                      {task.strategy || "N/A"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Permission Mode
                    </p>
                    <p className="text-sm text-gray-900 dark:text-white">
                      {task.permissionMode || "N/A"}
                    </p>
                  </div>
                </div>

                {task.metadata && Object.keys(task.metadata).length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Metadata:
                    </p>
                    <pre className="text-xs bg-gray-50 dark:bg-gray-700 p-2 rounded overflow-x-auto">
                      {JSON.stringify(task.metadata, null, 2)}
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
