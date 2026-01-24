"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ModeToggle } from "@/components/sessions/ModeToggle"
import { InteractionTimeline } from "@/components/sessions/InteractionTimeline"
import { Session, SessionInteraction, SessionMode } from "@prisma/client"

interface SessionDetail extends Session {
  interactions: SessionInteraction[]
  user: {
    id: string
    name: string | null
    email: string
    avatarUrl: string | null
  }
}

export default function SessionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [session, setSession] = useState<SessionDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [prompt, setPrompt] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (params.id) {
      fetchSession()
    }
  }, [params.id])

  const fetchSession = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/sessions/${params.id}`)
      if (response.ok) {
        const data = await response.json()
        setSession(data)
      } else if (response.status === 404) {
        router.push("/sessions")
      }
    } catch (error) {
      console.error("Error fetching session:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmitPrompt = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!prompt.trim() || !session) return

    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/sessions/${session.id}/prompt`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      })

      if (response.ok) {
        setPrompt("")
        fetchSession() // Refresh to get new interactions
      }
    } catch (error) {
      console.error("Error submitting prompt:", error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!session || !confirm("Are you sure you want to delete this session?"))
      return

    try {
      const response = await fetch(`/api/sessions/${session.id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        router.push("/sessions")
      }
    } catch (error) {
      console.error("Error deleting session:", error)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Loading session...</div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Session not found</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-6xl mx-auto p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              {session.title || "Untitled Session"}
            </h1>
            <button
              onClick={handleDelete}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Delete
            </button>
          </div>

          {session.description && (
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {session.description}
            </p>
          )}

          <div className="flex items-center gap-6 text-sm text-gray-500 dark:text-gray-400">
            <ModeToggle
              sessionId={session.id}
              currentMode={session.mode}
              onModeChange={(mode) => setSession({ ...session, mode })}
            />
            <span>Status: {session.status}</span>
            {session.projectName && (
              <span>Project: {session.projectName}</span>
            )}
            {session.branch && <span>Branch: {session.branch}</span>}
          </div>
        </div>

        {/* Prompt Input */}
        <form onSubmit={handleSubmitPrompt} className="mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter your prompt here..."
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex justify-end mt-4">
              <button
                type="submit"
                disabled={!prompt.trim() || isSubmitting}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
        </form>

        {/* Interactions Timeline */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            Interaction History
          </h2>
          <InteractionTimeline interactions={session.interactions} />
        </div>
      </div>
    </div>
  )
}
