"use client"

import Link from "next/link"
import { Session } from "@prisma/client"

interface SessionCardProps {
  session: Session & {
    _count: {
      interactions: number
    }
  }
  isSelected?: boolean
  className?: string
  anchorId?: string
}

const statusColors = {
  planning: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  executing: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  paused: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
}

const modeLabels = {
  plan: "Plan",
  auto_accept: "Auto-accept",
}

export function SessionCard({
  session,
  isSelected = false,
  className = "",
  anchorId,
}: SessionCardProps) {
  return (
    <Link
      href={`/sessions/${session.id}`}
      id={anchorId}
      className={`block p-6 bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-lg transition-shadow border border-gray-200 dark:border-gray-700 ${
        isSelected ? "ring-2 ring-cyan-400/60 shadow-[0_0_20px_rgba(34,211,238,0.25)]" : ""
      } ${className}`}
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {session.title || "Untitled Session"}
        </h3>
        <span
          className={`px-2 py-1 text-xs font-medium rounded-full ${
            statusColors[session.status]
          }`}
        >
          {session.status}
        </span>
      </div>

      {session.description && (
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
          {session.description}
        </p>
      )}

      <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1">
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          {modeLabels[session.mode]}
        </span>
        <span className="flex items-center gap-1">
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
          {session._count.interactions} interactions
        </span>
        <span className="ml-auto">
          {new Date(session.updatedAt).toLocaleDateString()}
        </span>
      </div>
    </Link>
  )
}
