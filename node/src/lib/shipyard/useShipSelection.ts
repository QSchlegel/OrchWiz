"use client"

import { useCallback, useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

const SHIP_DEPLOYMENT_QUERY_KEY = "shipDeploymentId"
const SHIP_DEPLOYMENT_STORAGE_KEY = "orchwiz:selected-ship-deployment"

function sanitizeId(value: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function useShipSelection() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [selectedShipDeploymentId, setSelectedShipDeploymentIdState] = useState<string | null>(null)

  useEffect(() => {
    const queryValue = sanitizeId(searchParams.get(SHIP_DEPLOYMENT_QUERY_KEY))
    if (queryValue) {
      setSelectedShipDeploymentIdState(queryValue)
      window.localStorage.setItem(SHIP_DEPLOYMENT_STORAGE_KEY, queryValue)
      return
    }

    const storedValue = sanitizeId(window.localStorage.getItem(SHIP_DEPLOYMENT_STORAGE_KEY))
    setSelectedShipDeploymentIdState(storedValue)
  }, [searchParams])

  const setSelectedShipDeploymentId = useCallback(
    (nextId: string | null) => {
      const sanitizedId = sanitizeId(nextId)
      setSelectedShipDeploymentIdState(sanitizedId)

      if (sanitizedId) {
        window.localStorage.setItem(SHIP_DEPLOYMENT_STORAGE_KEY, sanitizedId)
      } else {
        window.localStorage.removeItem(SHIP_DEPLOYMENT_STORAGE_KEY)
      }

      const params = new URLSearchParams(window.location.search)
      if (sanitizedId) {
        params.set(SHIP_DEPLOYMENT_QUERY_KEY, sanitizedId)
      } else {
        params.delete(SHIP_DEPLOYMENT_QUERY_KEY)
      }

      const query = params.toString()
      const nextUrl = query ? `${pathname}?${query}` : pathname
      router.replace(nextUrl, { scroll: false })
    },
    [pathname, router],
  )

  return {
    selectedShipDeploymentId,
    setSelectedShipDeploymentId,
  }
}
