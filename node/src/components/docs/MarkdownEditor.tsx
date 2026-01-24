"use client"

import { useState } from "react"

interface MarkdownEditorProps {
  content: string
  onChange: (content: string) => void
  placeholder?: string
}

export function MarkdownEditor({
  content,
  onChange,
  placeholder = "Enter markdown content...",
}: MarkdownEditorProps) {
  const [showPreview, setShowPreview] = useState(false)

  return (
    <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
      <div className="flex border-b border-gray-300 dark:border-gray-600">
        <button
          onClick={() => setShowPreview(false)}
          className={`px-4 py-2 text-sm font-medium ${
            !showPreview
              ? "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          Edit
        </button>
        <button
          onClick={() => setShowPreview(true)}
          className={`px-4 py-2 text-sm font-medium ${
            showPreview
              ? "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          Preview
        </button>
      </div>
      {showPreview ? (
        <div className="p-4 bg-white dark:bg-gray-800 min-h-[400px] prose dark:prose-invert max-w-none">
          <div
            dangerouslySetInnerHTML={{
              __html: content
                .replace(/\n/g, "<br />")
                .replace(/### (.*)/g, "<h3>$1</h3>")
                .replace(/## (.*)/g, "<h2>$1</h2>")
                .replace(/# (.*)/g, "<h1>$1</h1>")
                .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                .replace(/\*(.*?)\*/g, "<em>$1</em>")
                .replace(/`(.*?)`/g, "<code>$1</code>"),
            }}
          />
        </div>
      ) : (
        <textarea
          value={content}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full p-4 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono text-sm min-h-[400px] focus:outline-none resize-none"
        />
      )}
    </div>
  )
}
