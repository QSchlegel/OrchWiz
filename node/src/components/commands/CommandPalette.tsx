"use client"

import { useEffect, useState } from "react"

interface Command {
  id: string
  name: string
  description: string | null
}

interface CommandPaletteProps {
  onSelect?: (command: Command) => void
  sessionId?: string
}

export function CommandPalette({ onSelect, sessionId }: CommandPaletteProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [commands, setCommands] = useState<Command[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)

  useEffect(() => {
    fetchCommands()
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setIsOpen(true)
      }
      if (e.key === "Escape") {
        setIsOpen(false)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const fetchCommands = async () => {
    try {
      const response = await fetch("/api/commands")
      if (response.ok) {
        const data = await response.json()
        setCommands(data)
      }
    } catch (error) {
      console.error("Error fetching commands:", error)
    }
  }

  const filteredCommands = commands.filter(
    (cmd) =>
      cmd.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cmd.description?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleSelect = async (command: Command) => {
    if (sessionId) {
      try {
        await fetch(`/api/commands/${command.id}/execute`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ sessionId }),
        })
      } catch (error) {
        console.error("Error executing command:", error)
      }
    }
    onSelect?.(command)
    setIsOpen(false)
    setSearchQuery("")
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-start justify-center pt-32">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl mx-4">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setSelectedIndex(0)
            }}
            placeholder="Search commands..."
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        </div>
        <div className="max-h-96 overflow-y-auto">
          {filteredCommands.length === 0 ? (
            <div className="p-4 text-center text-gray-500 dark:text-gray-400">
              No commands found
            </div>
          ) : (
            <ul>
              {filteredCommands.map((command, index) => (
                <li
                  key={command.id}
                  onClick={() => handleSelect(command)}
                  className={`px-4 py-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${
                    index === selectedIndex
                      ? "bg-gray-100 dark:bg-gray-700"
                      : ""
                  }`}
                >
                  <div className="font-medium text-gray-900 dark:text-white">
                    /{command.name}
                  </div>
                  {command.description && (
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {command.description}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
          Press <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">Esc</kbd> to close
        </div>
      </div>
    </div>
  )
}
