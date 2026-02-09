"use client"

import { authClient } from "@/lib/auth-client"
import { Github, Link2, Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import { PageLayout, SurfaceCard, FilterBar, EmptyState, InlineNotice } from "@/components/dashboard/PageLayout"
import { StatusPill } from "@/components/dashboard/StatusPill"

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
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isConnectionLoading, setIsConnectionLoading] = useState(true)
  const [isConnectActionLoading, setIsConnectActionLoading] = useState(false)
  const [isGitHubConnected, setIsGitHubConnected] = useState(false)

  const refreshConnectionState = async () => {
    setIsConnectionLoading(true)
    setErrorMessage(null)
    try {
      const { data, error } = await authClient.listAccounts()
      if (error) {
        setIsGitHubConnected(false)
        setErrorMessage("Unable to verify GitHub connection right now.")
        return
      }

      const isConnected = (data ?? []).some((account) => account.providerId === "github")
      setIsGitHubConnected(isConnected)
    } catch (error) {
      console.error("Error loading linked accounts:", error)
      setIsGitHubConnected(false)
      setErrorMessage("Unable to verify GitHub connection right now.")
    } finally {
      setIsConnectionLoading(false)
    }
  }

  useEffect(() => {
    refreshConnectionState()
  }, [])

  const handleConnectGitHub = async () => {
    setIsConnectActionLoading(true)
    setErrorMessage(null)
    try {
      const { data, error } = await authClient.linkSocial({
        provider: "github",
        callbackURL: "/github/prs",
        disableRedirect: true,
      })

      if (error) {
        setErrorMessage("Unable to start GitHub connection. Please try again.")
        return
      }

      if (data?.url) {
        window.location.href = data.url
        return
      }

      await refreshConnectionState()
    } catch (error) {
      console.error("Error connecting GitHub:", error)
      setErrorMessage("Unable to start GitHub connection. Please try again.")
    } finally {
      setIsConnectActionLoading(false)
    }
  }

  const fetchPRs = async () => {
    if (!owner || !repo || !isGitHubConnected) {
      return
    }

    setIsLoading(true)
    setErrorMessage(null)
    try {
      const params = new URLSearchParams({ owner, repo })
      const response = await fetch(`/api/github/prs?${params.toString()}`)
      const payload = await response.json()
      if (!response.ok) {
        setPRs([])
        setErrorMessage(payload?.error || "Unable to fetch pull requests.")
        return
      }

      setPRs(payload)
    } catch (error) {
      console.error("Error fetching PRs:", error)
      setErrorMessage("Unable to fetch pull requests.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <PageLayout
      title="GitHub PRs with @claude"
      description="Fetch and review pull requests from your GitHub repositories."
    >
      <div className="space-y-4">
        <SurfaceCard>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-lg border border-slate-300 bg-slate-900 p-2 text-white dark:border-white/15">
                <Github className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-slate-900 dark:text-slate-100">GitHub account</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Connect GitHub once to fetch private and public repository PRs securely.
                </p>
              </div>
            </div>
            {isConnectionLoading ? (
              <div className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking connection...
              </div>
            ) : isGitHubConnected ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-700 dark:text-emerald-300">
                <Link2 className="h-4 w-4" />
                GitHub connected
              </div>
            ) : (
              <button
                onClick={handleConnectGitHub}
                disabled={isConnectActionLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 dark:bg-white dark:text-slate-900"
              >
                {isConnectActionLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Github className="h-4 w-4" />
                    Connect GitHub
                  </>
                )}
              </button>
            )}
          </div>
        </SurfaceCard>

        {errorMessage && <InlineNotice variant="error">{errorMessage}</InlineNotice>}

        <FilterBar>
          <input
            type="text"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder="Owner (e.g., octocat)"
            disabled={!isGitHubConnected}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:opacity-60 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
          />
          <input
            type="text"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder="Repo (e.g., Hello-World)"
            disabled={!isGitHubConnected}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:opacity-60 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
          />
          <button
            onClick={fetchPRs}
            disabled={isLoading || !owner || !repo || !isGitHubConnected}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 dark:bg-white dark:text-slate-900"
          >
            {isLoading ? "Loading..." : "Fetch PRs"}
          </button>
        </FilterBar>

        {prs.length === 0 && !isLoading ? (
          <EmptyState
            title={isGitHubConnected ? "No pull requests loaded" : "Connect GitHub first"}
            description={
              isGitHubConnected
                ? "Enter owner and repo to fetch PRs with @claude tags."
                : "Connect your GitHub account, then fetch PRs."
            }
          />
        ) : (
          <div className="space-y-3">
            {prs.map((pr) => (
              <SurfaceCard key={pr.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <a
                      href={pr.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-base font-semibold text-blue-600 hover:underline dark:text-blue-400"
                    >
                      #{pr.number}: {pr.title}
                    </a>
                    <div className="mt-1 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                      <img
                        src={pr.user.avatar_url}
                        alt={pr.user.login}
                        className="h-5 w-5 rounded-full"
                      />
                      <span>{pr.user.login}</span>
                      <span className="text-slate-400 dark:text-slate-500">&middot;</span>
                      <span>{new Date(pr.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <StatusPill value={pr.state} />
                </div>
                {pr.body && (
                  <p className="mt-2 text-sm text-slate-600 line-clamp-3 dark:text-slate-400">
                    {pr.body}
                  </p>
                )}
              </SurfaceCard>
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  )
}
