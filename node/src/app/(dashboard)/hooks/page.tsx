"use client"

import { useEffect, useState } from "react"

interface Hook {
  id: string
  name: string
  matcher: string
  type: string
  command: string
  isActive: boolean
  createdAt: Date
  _count: {
    executions: number
  }
}

interface HookExample {
  name: string
  matcher: string
  type: "webhook"
  webhookUrl: string
  description: string
}

interface HookFormData {
  name: string
  matcher: string
  type: "webhook" | "command" | "script"
  command: string
  webhookUrl: string
  isActive: boolean
}

const HOOK_EXAMPLES: HookExample[] = [
  {
    name: "Deploy Status Notifier",
    matcher: "deploy|ship-yard|release",
    type: "webhook",
    webhookUrl: "http://localhost:4000/hooks/deploy-status",
    description: "Send deployment-related tool events to your release notification service.",
  },
  {
    name: "Command Failure Alert",
    matcher: "build|test|lint",
    type: "webhook",
    webhookUrl: "http://localhost:4000/hooks/command-failures",
    description: "Capture failed build/test/lint tool events for on-call alerting.",
  },
  {
    name: "Audit Stream Collector",
    matcher: ".*",
    type: "webhook",
    webhookUrl: "http://localhost:4000/hooks/audit-stream",
    description: "Forward every PostToolUse event to your internal audit pipeline.",
  },
]

function defaultFormData(): HookFormData {
  return {
    name: "",
    matcher: "",
    type: "webhook",
    command: "",
    webhookUrl: "",
    isActive: true,
  }
}

function requestPayloadFromFormData(formData: HookFormData): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: formData.name.trim(),
    matcher: formData.matcher.trim(),
    type: formData.type,
    isActive: formData.isActive,
  }

  if (formData.type === "webhook") {
    const webhookUrl = formData.webhookUrl.trim()
    payload.webhookUrl = webhookUrl
    // Backward-compatible alias expected by legacy storage fields.
    payload.command = webhookUrl
  } else {
    payload.command = formData.command.trim()
  }

  return payload
}

export default function HooksPage() {
  const [hooks, setHooks] = useState<Hook[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [formData, setFormData] = useState<HookFormData>(defaultFormData)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)

  useEffect(() => {
    void fetchHooks()
  }, [])

  const fetchHooks = async () => {
    setIsLoading(true)
    setErrorMessage(null)
    try {
      const response = await fetch("/api/hooks")
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string }
        setErrorMessage(payload.error || "Failed to fetch hooks.")
        return
      }

      const data = (await response.json()) as Hook[]
      setHooks(data)
    } catch (error) {
      console.error("Error fetching hooks:", error)
      setErrorMessage("Failed to fetch hooks.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsCreating(true)
    setCreateError(null)

    try {
      const response = await fetch("/api/hooks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestPayloadFromFormData(formData)),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string }
        setCreateError(payload.error || "Failed to create hook.")
        return
      }

      setShowCreateForm(false)
      setFormData(defaultFormData())
      await fetchHooks()
    } catch (error) {
      console.error("Error creating hook:", error)
      setCreateError("Failed to create hook.")
    } finally {
      setIsCreating(false)
    }
  }

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      const response = await fetch(`/api/hooks/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isActive: !currentActive }),
      })

      if (response.ok) {
        await fetchHooks()
      }
    } catch (error) {
      console.error("Error toggling hook:", error)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this hook?")) return

    try {
      const response = await fetch(`/api/hooks/${id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        await fetchHooks()
      }
    } catch (error) {
      console.error("Error deleting hook:", error)
    }
  }

  const applyExample = (example: HookExample) => {
    setShowCreateForm(true)
    setCreateError(null)
    setFormData({
      name: example.name,
      matcher: example.matcher,
      type: example.type,
      command: "",
      webhookUrl: example.webhookUrl,
      isActive: true,
    })
  }

  const commandFieldLabel = formData.type === "webhook" ? "Webhook URL" : "Command/Script"
  const commandFieldPlaceholder =
    formData.type === "webhook" ? "https://hooks.example.com/post-tool-use" : "prettier --write"
  const commandFieldValue = formData.type === "webhook" ? formData.webhookUrl : formData.command

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            PostToolUse Hooks
          </h1>
          <button
            onClick={() => {
              setShowCreateForm(true)
              setCreateError(null)
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            New Hook
          </button>
        </div>

        <div className="mb-8 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Examples</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {HOOK_EXAMPLES.map((example) => (
              <div
                key={example.name}
                className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 p-4"
              >
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{example.name}</h3>
                <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">{example.description}</p>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Matcher: <code className="font-mono">{example.matcher}</code>
                </p>
                <button
                  onClick={() => applyExample(example)}
                  className="mt-3 px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                >
                  Use example
                </button>
              </div>
            ))}
          </div>
        </div>

        {showCreateForm && (
          <div className="mb-8 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Create New Hook
            </h2>
            <form onSubmit={handleCreate}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    required
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="Format Code Hook"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Matcher (Regex pattern)
                  </label>
                  <input
                    type="text"
                    value={formData.matcher}
                    onChange={(e) =>
                      setFormData({ ...formData, matcher: e.target.value })
                    }
                    required
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                    placeholder="Write|Edit"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Type
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) =>
                      setFormData({ ...formData, type: e.target.value as HookFormData["type"] })
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="webhook">Webhook</option>
                    <option value="command">Command</option>
                    <option value="script">Script</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {commandFieldLabel}
                  </label>
                  <textarea
                    value={commandFieldValue}
                    onChange={(e) =>
                      setFormData(
                        formData.type === "webhook"
                          ? { ...formData, webhookUrl: e.target.value }
                          : { ...formData, command: e.target.value },
                      )
                    }
                    required
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                    placeholder={commandFieldPlaceholder}
                  />
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={formData.isActive}
                    onChange={(e) =>
                      setFormData({ ...formData, isActive: e.target.checked })
                    }
                    className="mr-2"
                  />
                  <label
                    htmlFor="isActive"
                    className="text-sm text-gray-700 dark:text-gray-300"
                  >
                    Active
                  </label>
                </div>
                {createError && (
                  <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300">
                    {createError}
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={isCreating}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {isCreating ? "Creating..." : "Create"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateForm(false)
                      setCreateError(null)
                    }}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {errorMessage && (
          <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300">
            {errorMessage}
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            Loading hooks...
          </div>
        ) : hooks.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400 space-y-2">
            <p>No hooks found. Create your first hook to get started!</p>
            <p className="text-sm">Use one of the examples above to prefill a webhook hook.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {hooks.map((hook) => (
              <div
                key={hook.id}
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {hook.name}
                      </h3>
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded ${
                          hook.isActive
                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                            : "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200"
                        }`}
                      >
                        {hook.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                      <p>
                        <span className="font-medium">Matcher:</span>{" "}
                        <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">
                          {hook.matcher}
                        </code>
                      </p>
                      <p>
                        <span className="font-medium">Type:</span> {hook.type}
                      </p>
                      <p>
                        <span className="font-medium">{hook.type === "webhook" ? "Webhook URL" : "Command"}:</span>{" "}
                        <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">
                          {hook.command}
                        </code>
                      </p>
                      <p>
                        <span className="font-medium">Executions:</span>{" "}
                        {hook._count.executions}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleToggleActive(hook.id, hook.isActive)}
                      className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                        hook.isActive
                          ? "bg-yellow-600 text-white hover:bg-yellow-700"
                          : "bg-green-600 text-white hover:bg-green-700"
                      }`}
                    >
                      {hook.isActive ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      onClick={() => handleDelete(hook.id)}
                      className="px-3 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
