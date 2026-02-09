"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { PageLayout, SurfaceCard, InlineNotice, EmptyState } from "@/components/dashboard/PageLayout"
import { StatusPill } from "@/components/dashboard/StatusPill"

interface CommandExecution {
  id: string
  status: string
  output: string | null
  error: string | null
  duration: number | null
  startedAt: string
  completedAt: string | null
}

interface CommandDetail {
  id: string
  name: string
  description: string | null
  scriptContent: string
  path: string | null
  isShared: boolean
  createdAt: string
  executions: CommandExecution[]
}

export default function CommandDetailPage() {
  const params = useParams<{ id: string }>()
  const [command, setCommand] = useState<CommandDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isExecuting, setIsExecuting] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null)

  const loadCommand = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/commands/${params.id}`)
      const payload = await response.json()
      if (!response.ok) {
        setCommand(null)
        setMessage({ type: "error", text: payload?.error || "Unable to load command" })
        return
      }

      setCommand(payload)
    } catch (error) {
      console.error("Failed to load command:", error)
      setCommand(null)
      setMessage({ type: "error", text: "Unable to load command" })
    } finally {
      setIsLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    loadCommand()
  }, [loadCommand])

  const runCommand = async () => {
    if (!command) {
      return
    }

    setIsExecuting(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/commands/${command.id}/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      })

      const payload = await response.json()
      if (!response.ok) {
        setMessage({ type: "error", text: payload?.error || "Execution failed" })
        return
      }

      if (payload.blocked) {
        setMessage({ type: "info", text: payload?.error || "Execution blocked by policy" })
      } else {
        setMessage({ type: "success", text: "Execution completed" })
      }

      await loadCommand()
    } catch (error) {
      console.error("Command execution failed:", error)
      setMessage({ type: "error", text: "Execution failed" })
    } finally {
      setIsExecuting(false)
    }
  }

  return (
    <PageLayout
      title={command ? `/${command.name}` : "Command"}
      description={command?.description || "Command details and recent executions"}
      actions={
        <button
          type="button"
          onClick={runCommand}
          disabled={isExecuting || !command}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 dark:bg-white dark:text-slate-900"
        >
          {isExecuting ? "Running..." : "Run command"}
        </button>
      }
    >
      <div className="space-y-4">
        {message && <InlineNotice variant={message.type}>{message.text}</InlineNotice>}

        {isLoading && <SurfaceCard>Loading command...</SurfaceCard>}

        {!isLoading && !command && <EmptyState title="Command not found" />}

        {command && (
          <>
            <SurfaceCard>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Command path</p>
                  <p className="mt-1 text-sm text-slate-800 dark:text-slate-200">{command.path || "Inline script"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Shared</p>
                  <p className="mt-1 text-sm text-slate-800 dark:text-slate-200">{command.isShared ? "Yes" : "No"}</p>
                </div>
              </div>
              <div className="mt-4">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Script</p>
                <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{command.scriptContent}</pre>
              </div>
            </SurfaceCard>

            <SurfaceCard>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Recent executions</h2>
                <span className="text-xs text-slate-500 dark:text-slate-400">{command.executions.length} entries</span>
              </div>

              {command.executions.length === 0 ? (
                <EmptyState title="No executions yet" description="Run this command to create the first execution log." />
              ) : (
                <div className="space-y-3">
                  {command.executions.map((execution) => (
                    <div
                      key={execution.id}
                      className="rounded-lg border border-slate-200/80 bg-white/90 p-3 dark:border-white/10 dark:bg-white/[0.02]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <StatusPill value={execution.status} />
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {new Date(execution.startedAt).toLocaleString()}
                        </span>
                      </div>
                      {execution.error && (
                        <p className="mt-2 text-sm text-rose-600 dark:text-rose-300">{execution.error}</p>
                      )}
                      {execution.output && (
                        <pre className="mt-2 max-h-56 overflow-auto rounded-md bg-slate-950 p-2 text-xs text-slate-100">
                          {execution.output}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </SurfaceCard>
          </>
        )}
      </div>
    </PageLayout>
  )
}
