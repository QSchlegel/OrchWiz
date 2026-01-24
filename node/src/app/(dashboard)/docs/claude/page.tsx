"use client"

import { useEffect, useState } from "react"
import { MarkdownEditor } from "@/components/docs/MarkdownEditor"

interface ClaudeDocument {
  id: string
  title: string
  content: string
  version: number
  lastUpdated: Date
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

  useEffect(() => {
    fetchDocument()
  }, [])

  const fetchDocument = async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/docs/claude")
      if (response.ok) {
        const data = await response.json()
        setDocument(data)
        setContent(data.content)
        setTitle(data.title)
      } else if (response.status === 404) {
        // Create new document
        setContent("# CLAUDE.md\n\nAdd your project documentation here...")
        setTitle("CLAUDE.md")
      }
    } catch (error) {
      console.error("Error fetching document:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const url = document
        ? `/api/docs/claude?id=${document.id}`
        : "/api/docs/claude"
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

      if (response.ok) {
        const data = await response.json()
        setDocument(data)
        alert("Document saved successfully!")
      }
    } catch (error) {
      console.error("Error saving document:", error)
      alert("Error saving document")
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            CLAUDE.md Editor
          </h1>
          <div className="flex gap-2">
            {document && (
              <span className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                Version {document.version}
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>

        <div className="mb-4">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xl font-semibold"
            placeholder="Document Title"
          />
        </div>

        <MarkdownEditor content={content} onChange={setContent} />

        {document && document.guidanceEntries.length > 0 && (
          <div className="mt-8 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Guidance Rules
            </h2>
            <div className="space-y-3">
              {document.guidanceEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="p-3 bg-gray-50 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600"
                >
                  {entry.category && (
                    <span className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1 block">
                      {entry.category}
                    </span>
                  )}
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {entry.content}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
