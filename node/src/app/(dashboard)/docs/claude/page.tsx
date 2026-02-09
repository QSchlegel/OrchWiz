"use client"

import { useEffect, useState } from "react"
import { MarkdownEditor } from "@/components/docs/MarkdownEditor"
import { InlineNotice, PageLayout, SurfaceCard } from "@/components/dashboard/PageLayout"

interface ClaudeDocument {
  id: string
  title: string
  content: string
  version: number
  lastUpdated: string
  guidanceEntries: Array<{
    id: string
    content: string
    category: string | null
    status: string
  }>
}

export default function ClaudeDocPage() {
  const [document, setDocument] = useState<ClaudeDocument | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [content, setContent] = useState("")
  const [title, setTitle] = useState("")
  const [message, setMessage] = useState<{ type: "error" | "success" | "info"; text: string } | null>(null)

  useEffect(() => {
    fetchDocument()
  }, [])

  const fetchDocument = async () => {
    setIsLoading(true)
    setMessage(null)
    try {
      const response = await fetch("/api/docs/claude")
      if (response.ok) {
        const data = await response.json()
        setDocument(data)
        setContent(data.content)
        setTitle(data.title)
      } else if (response.status === 404) {
        setContent("# CLAUDE.md\n\nAdd your project documentation here...")
        setTitle("CLAUDE.md")
      } else {
        const payload = await response.json().catch(() => null)
        setMessage({ type: "error", text: payload?.error || "Unable to load document" })
      }
    } catch (error) {
      console.error("Error fetching document:", error)
      setMessage({ type: "error", text: "Unable to load document" })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    setMessage(null)
    try {
      const url = document ? `/api/docs/claude?id=${document.id}` : "/api/docs/claude"
      const method = document ? "PUT" : "POST"

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: document?.id,
          title: title || "CLAUDE.md",
          content,
        }),
      })

      const payload = await response.json()
      if (!response.ok) {
        setMessage({ type: "error", text: payload?.error || "Unable to save document" })
        return
      }

      setDocument(payload)
      setTitle(payload.title)
      setContent(payload.content)
      setMessage({ type: "success", text: "Document saved successfully." })
    } catch (error) {
      console.error("Error saving document:", error)
      setMessage({ type: "error", text: "Unable to save document" })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <PageLayout
      title="CLAUDE.md Editor"
      description="Edit, version, and review extracted guidance entries."
      actions={
        <button
          onClick={handleSave}
          disabled={isSaving || isLoading}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 dark:bg-white dark:text-slate-900"
        >
          {isSaving ? "Saving..." : "Save"}
        </button>
      }
    >
      <div className="space-y-4">
        {message && <InlineNotice variant={message.type}>{message.text}</InlineNotice>}

        {isLoading ? (
          <SurfaceCard>Loading document...</SurfaceCard>
        ) : (
          <>
            <SurfaceCard>
              <div className="flex items-center justify-between gap-3">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-lg font-semibold text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                  placeholder="Document Title"
                />
                {document && (
                  <span className="rounded-lg border border-slate-300 bg-white/80 px-2.5 py-1 text-xs text-slate-600 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-300">
                    Version {document.version}
                  </span>
                )}
              </div>
            </SurfaceCard>

            <MarkdownEditor content={content} onChange={setContent} />

            {document && document.guidanceEntries.length > 0 && (
              <SurfaceCard>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Guidance Rules</h2>
                <div className="mt-3 space-y-2">
                  {document.guidanceEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-lg border border-slate-200/80 bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.03]"
                    >
                      {entry.category && (
                        <span className="block text-xs font-medium text-blue-600 dark:text-blue-300">{entry.category}</span>
                      )}
                      <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{entry.content}</p>
                    </div>
                  ))}
                </div>
              </SurfaceCard>
            )}
          </>
        )}
      </div>
    </PageLayout>
  )
}
