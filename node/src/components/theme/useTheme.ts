"use client"

import { useContext } from "react"
import { ThemeContext } from "@/components/theme/ThemeProvider"

export function useTheme() {
  const value = useContext(ThemeContext)
  if (!value) {
    throw new Error("useTheme must be used within ThemeProvider")
  }
  return value
}
