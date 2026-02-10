"use client"

import { useEffect, useState } from "react"
import { useNotifications } from "@/components/notifications"
import { PERMISSIONS_TAB_NOTIFICATION_CHANNEL } from "@/lib/notifications/channels"
import { formatUnreadBadgeCount } from "@/lib/notifications/store"

interface Permission {
  id: string
  commandPattern: string
  type: string
  status: string
  scope: string
  sourceFile: string | null
  isShared: boolean
  createdAt: Date
}

type TabType = "allow" | "ask" | "deny" | "workspace"

export default function PermissionsPage() {
  const { getUnread, registerActiveChannels } = useNotifications()
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>("allow")
  const [searchQuery, setSearchQuery] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [formData, setFormData] = useState({
    commandPattern: "",
    type: "bash_command",
    status: "allow",
    scope: "workspace",
    sourceFile: "",
    isShared: false,
  })

  useEffect(() => {
    fetchPermissions()
  }, [activeTab])

  useEffect(() => {
    const channel = PERMISSIONS_TAB_NOTIFICATION_CHANNEL[activeTab]
    return registerActiveChannels([channel])
  }, [activeTab, registerActiveChannels])

  const fetchPermissions = async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (activeTab !== "workspace") {
        params.append("status", activeTab)
      } else {
        params.append("scope", "workspace")
      }

      const response = await fetch(`/api/permissions?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setPermissions(data)
      }
    } catch (error) {
      console.error("Error fetching permissions:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsCreating(true)

    try {
      const response = await fetch("/api/permissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...formData,
          status: activeTab === "workspace" ? "allow" : activeTab,
        }),
      })

      if (response.ok) {
        setShowCreateForm(false)
        setFormData({
          commandPattern: "",
          type: "bash_command",
          status: "allow",
          scope: "workspace",
          sourceFile: "",
          isShared: false,
        })
        fetchPermissions()
      }
    } catch (error) {
      console.error("Error creating permission:", error)
    } finally {
      setIsCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this permission?")) return

    try {
      const response = await fetch(`/api/permissions/${id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        fetchPermissions()
      }
    } catch (error) {
      console.error("Error deleting permission:", error)
    }
  }

  const filteredPermissions = permissions.filter((p) =>
    p.commandPattern.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Permissions
          </h1>
          <button
            onClick={() => setShowCreateForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            New Permission
          </button>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-200 dark:border-gray-700">
          <nav className="flex space-x-8">
            {(["allow", "ask", "deny", "workspace"] as TabType[]).map((tab) => {
              const channel = PERMISSIONS_TAB_NOTIFICATION_CHANNEL[tab]
              const badgeLabel = formatUnreadBadgeCount(getUnread([channel]))
              return (
                <button
                  key={tab}
                  onClick={() => {
                    setActiveTab(tab)
                    setSearchQuery("")
                  }}
                  className={`inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm capitalize ${
                    activeTab === tab
                      ? "border-blue-500 text-blue-600 dark:text-blue-400"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
                  }`}
                >
                  <span>{tab}</span>
                  {badgeLabel && (
                    <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                      {badgeLabel}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Search */}
        <div className="mb-6">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search permissions..."
            className="w-full max-w-md px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
        </div>

        {/* Create Form */}
        {showCreateForm && (
          <div className="mb-8 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Create New Permission
            </h2>
            <form onSubmit={handleCreate}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Command Pattern
                  </label>
                  <input
                    type="text"
                    value={formData.commandPattern}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        commandPattern: e.target.value,
                      })
                    }
                    required
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                    placeholder="bun run build:*"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Type
                    </label>
                    <select
                      value={formData.type}
                      onChange={(e) =>
                        setFormData({ ...formData, type: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="bash_command">Bash Command</option>
                      <option value="tool_command">Tool Command</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Scope
                    </label>
                    <select
                      value={formData.scope}
                      onChange={(e) =>
                        setFormData({ ...formData, scope: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="global">Global</option>
                      <option value="workspace">Workspace</option>
                      <option value="user">User</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Source File (optional)
                  </label>
                  <input
                    type="text"
                    value={formData.sourceFile}
                    onChange={(e) =>
                      setFormData({ ...formData, sourceFile: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder=".claude/settings.json"
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

        {/* Permissions List */}
        {isLoading ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            Loading permissions...
          </div>
        ) : filteredPermissions.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            No permissions found. Create your first permission to get started!
          </div>
        ) : (
          <div className="space-y-4">
            {filteredPermissions.map((permission) => (
              <div
                key={permission.id}
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <code className="text-lg font-mono text-gray-900 dark:text-white">
                        {permission.commandPattern}
                      </code>
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded ${
                          permission.status === "allow"
                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                            : permission.status === "ask"
                            ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                            : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                        }`}
                      >
                        {permission.status}
                      </span>
                      <span className="px-2 py-1 text-xs font-medium rounded bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                        {permission.scope}
                      </span>
                      <span className="px-2 py-1 text-xs font-medium rounded bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200">
                        {permission.type}
                      </span>
                    </div>
                    {permission.sourceFile && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Source: {permission.sourceFile}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDelete(permission.id)}
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
