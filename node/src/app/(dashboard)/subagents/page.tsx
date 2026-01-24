"use client"

import { useEffect, useState } from "react"

interface Subagent {
  id: string
  name: string
  description: string | null
  content: string
  path: string | null
  isShared: boolean
  createdAt: Date
}

export default function SubagentsPage() {
  const [subagents, setSubagents] = useState<Subagent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    content: "",
    path: "",
    isShared: false,
  })

  useEffect(() => {
    fetchSubagents()
  }, [])

  const fetchSubagents = async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/subagents")
      if (response.ok) {
        const data = await response.json()
        setSubagents(data)
      }
    } catch (error) {
      console.error("Error fetching subagents:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsCreating(true)

    try {
      const response = await fetch("/api/subagents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      })

      if (response.ok) {
        setShowCreateForm(false)
        setFormData({
          name: "",
          description: "",
          content: "",
          path: "",
          isShared: false,
        })
        fetchSubagents()
      }
    } catch (error) {
      console.error("Error creating subagent:", error)
    } finally {
      setIsCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this subagent?")) return

    try {
      const response = await fetch(`/api/subagents/${id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        fetchSubagents()
      }
    } catch (error) {
      console.error("Error deleting subagent:", error)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Subagents
          </h1>
          <button
            onClick={() => setShowCreateForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            New Subagent
          </button>
        </div>

        {showCreateForm && (
          <div className="mb-8 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Create New Subagent
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
                    placeholder="code-simplifier"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Content (Markdown)
                  </label>
                  <textarea
                    value={formData.content}
                    onChange={(e) =>
                      setFormData({ ...formData, content: e.target.value })
                    }
                    required
                    rows={12}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                    placeholder="# Code Simplifier Agent&#10;&#10;This agent helps simplify complex code..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Path (optional)
                  </label>
                  <input
                    type="text"
                    value={formData.path}
                    onChange={(e) =>
                      setFormData({ ...formData, path: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder=".claude/agents/code-simplifier.md"
                  />
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="isShared"
                    checked={formData.isShared}
                    onChange={(e) =>
                      setFormData({ ...formData, isShared: e.target.checked })
                    }
                    className="mr-2"
                  />
                  <label
                    htmlFor="isShared"
                    className="text-sm text-gray-700 dark:text-gray-300"
                  >
                    Share with team
                  </label>
                </div>
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
                    onClick={() => setShowCreateForm(false)}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            Loading subagents...
          </div>
        ) : subagents.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            No subagents found. Create your first subagent to get started!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {subagents.map((subagent) => (
              <div
                key={subagent.id}
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {subagent.name}
                  </h3>
                  {subagent.isShared && (
                    <span className="px-2 py-1 text-xs font-medium rounded bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                      Shared
                    </span>
                  )}
                </div>
                {subagent.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    {subagent.description}
                  </p>
                )}
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-4 line-clamp-3">
                  {subagent.content.substring(0, 150)}...
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      // TODO: Open edit modal or navigate to detail page
                      alert("Edit functionality coming soon")
                    }}
                    className="flex-1 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(subagent.id)}
                    className="px-3 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
