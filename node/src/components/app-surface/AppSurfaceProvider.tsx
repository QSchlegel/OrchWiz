"use client"

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

export type AppSurface = "public" | "dashboard"

interface AppSurfaceContextValue {
  surface: AppSurface
  setSurface: (surface: AppSurface) => void
}

const AppSurfaceContext = createContext<AppSurfaceContextValue | null>(null)

export function AppSurfaceProvider({ children }: { children: ReactNode }) {
  const [surface, setSurface] = useState<AppSurface>("public")

  const value = useMemo<AppSurfaceContextValue>(() => ({ surface, setSurface }), [surface])

  return <AppSurfaceContext.Provider value={value}>{children}</AppSurfaceContext.Provider>
}

export function useAppSurface(): AppSurfaceContextValue {
  const value = useContext(AppSurfaceContext)
  if (!value) {
    throw new Error("useAppSurface must be used within AppSurfaceProvider")
  }
  return value
}

export function useSetAppSurface(surface: AppSurface) {
  const { setSurface } = useAppSurface()

  useEffect(() => {
    setSurface(surface)

    return () => {
      setSurface("public")
    }
  }, [setSurface, surface])
}

