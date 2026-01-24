"use client"

import { useEffect, useState } from "react"

interface PR {
  id: number
  number: number
  title: string
  body: string | null
  state: string
  html_url: string
  user: {
    login: string
    avatar_url: string
  }
  created_at: string
}

export default function GitHubPRsPage() {
  const [prs, setPRs] = useState<PR[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [owner, setOwner] = useState("")
  const [repo, setRepo] = useState("")

  const fetchPRs = async () => {
    if (!owner || !repo) return

    setIsLoading(true)
    try {
      const params = new URLSearchParams({ owner, repo })
      const response = await fetch(`/api/github/prs?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setPRs(data)
      }
    } catch (error) {
      console.error("Error fetching PRs:", error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-white">
          GitHub PRs with @claude
        </h1>

        <div className="mb-6 flex gap-4">
          <input
            type="text"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder="Owner (e.g., octocat)"
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
          <input
            type="text"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder="Repo (e.g., Hello-World)"
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
          <button
            onClick={fetchPRs}
            disabled={isLoading || !owner || !repo}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isLoading ? "Loading..." : "Fetch PRs"}
          </button>
        </div>

        {prs.length === 0 && !isLoading ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            Enter owner and repo to fetch PRs with @claude tags
          </div>
        ) : (
          <div className="space-y-4">
            {prs.map((pr) => (
              <div
                key={pr.id}
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <a
                      href={pr.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-lg font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      #{pr.number}: {pr.title}
                    </a>
                    <div className="flex items-center gap-2 mt-1 text-sm text-gray-500 dark:text-gray-400">
                      <img
                        src={pr.user.avatar_url}
                        alt={pr.user.login}
                        className="w-5 h-5 rounded-full"
                      />
                      <span>{pr.user.login}</span>
                      <span>•</span>
                      <span>{new Date(pr.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded ${
                      pr.state === "open"
                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                        : "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200"
                    }`}
                  >
                    {pr.state}
                  </span>
                </div>
                {pr.body && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 line-clamp-3">
                    {pr.body}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
