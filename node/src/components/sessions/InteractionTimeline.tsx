"use client"

import { SessionInteraction, InteractionType } from "@prisma/client"

interface InteractionTimelineProps {
  interactions: SessionInteraction[]
}

const typeColors = {
  user_input: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  ai_response: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  tool_use: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  error: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
}

const typeIcons = {
  user_input: "👤",
  ai_response: "🤖",
  tool_use: "🔧",
  error: "⚠️",
}

export function InteractionTimeline({ interactions }: InteractionTimelineProps) {
  if (interactions.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        No interactions yet. Start by submitting a prompt!
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {interactions.map((interaction) => (
        <div
          key={interaction.id}
          className="flex gap-4 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
        >
          <div className="shrink-0">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${
                typeColors[interaction.type]
              }`}
            >
              {typeIcons[interaction.type]}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`px-2 py-1 text-xs font-medium rounded ${
                  typeColors[interaction.type]
                }`}
              >
                {interaction.type.replace("_", " ")}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {new Date(interaction.timestamp).toLocaleString()}
              </span>
            </div>
            <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap wrap-break-word">
              {interaction.content}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
