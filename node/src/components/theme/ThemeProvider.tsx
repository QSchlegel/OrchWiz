"use client"

import { createContext, useEffect, useMemo, useState } from "react"

export type ThemeMode = "light" | "dark" | "system"
export type ResolvedTheme = "light" | "dark"

export const THEME_STORAGE_KEY = "orchwiz:theme-mode"

interface ThemeContextValue {
  mode: ThemeMode
  resolvedTheme: ResolvedTheme
  setMode: (mode: ThemeMode) => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

const FALLBACK_MODE: ThemeMode = "system"

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system"
}

function readStoredMode(): ThemeMode {
  if (typeof window === "undefined") return FALLBACK_MODE
  const value = window.localStorage.getItem(THEME_STORAGE_KEY)
  return isThemeMode(value) ? value : FALLBACK_MODE
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode !== "system") return mode
  if (typeof window === "undefined") return "dark"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function applyResolvedTheme(theme: ResolvedTheme) {
  const root = document.documentElement
  root.classList.toggle("dark", theme === "dark")
  root.dataset.theme = theme
  root.style.colorScheme = theme
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(FALLBACK_MODE)
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("dark")

  useEffect(() => {
    const initialMode = readStoredMode()
    setMode(initialMode)
    const initialResolved = resolveTheme(initialMode)
    setResolvedTheme(initialResolved)
    applyResolvedTheme(initialResolved)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return

    window.localStorage.setItem(THEME_STORAGE_KEY, mode)
    const media = window.matchMedia("(prefers-color-scheme: dark)")

    const apply = () => {
      const next = resolveTheme(mode)
      setResolvedTheme(next)
      applyResolvedTheme(next)
    }

    apply()

    if (mode !== "system") return

    media.addEventListener("change", apply)
    return () => {
      media.removeEventListener("change", apply)
    }
  }, [mode])

  const value = useMemo<ThemeContextValue>(() => ({ mode, resolvedTheme, setMode }), [mode, resolvedTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
