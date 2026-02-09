import { useCallback, useRef } from "react"

interface UseSelectionHistoryReturn {
  push: (id: string) => void
  back: () => string | null
  forward: () => string | null
  canGoBack: boolean
  canGoForward: boolean
}

export function useSelectionHistory(): UseSelectionHistoryReturn {
  const stackRef = useRef<string[]>([])
  const indexRef = useRef(-1)

  const push = useCallback((id: string) => {
    const stack = stackRef.current
    const idx = indexRef.current

    // Don't push duplicates at the same position
    if (stack[idx] === id) return

    // Truncate any forward history
    stackRef.current = stack.slice(0, idx + 1)
    stackRef.current.push(id)
    indexRef.current = stackRef.current.length - 1
  }, [])

  const back = useCallback((): string | null => {
    if (indexRef.current <= 0) return null
    indexRef.current -= 1
    return stackRef.current[indexRef.current] ?? null
  }, [])

  const forward = useCallback((): string | null => {
    if (indexRef.current >= stackRef.current.length - 1) return null
    indexRef.current += 1
    return stackRef.current[indexRef.current] ?? null
  }, [])

  return {
    push,
    back,
    forward,
    get canGoBack() {
      return indexRef.current > 0
    },
    get canGoForward() {
      return indexRef.current < stackRef.current.length - 1
    },
  }
}
