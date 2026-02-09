"use client"

import { useContext } from "react"
import { SidebarContext } from "./SidebarProvider"
import type { SidebarContextValue } from "./SidebarProvider"

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext)
  if (!ctx) {
    throw new Error("useSidebar must be used within a SidebarProvider")
  }
  return ctx
}
