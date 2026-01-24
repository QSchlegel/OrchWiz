"use client"

import { ReactNode, useState } from "react"
import { OrchestrationSurface } from "./OrchestrationSurface"

interface FlipCardProps {
  front: ReactNode
  back: ReactNode
  level?: 1 | 2 | 3 | 4 | 5
  className?: string
  minHeight?: number
  disableFlip?: boolean
}

export function FlipCard({
  front,
  back,
  level = 2,
  className = "",
  minHeight = 340,
  disableFlip = false
}: FlipCardProps) {
  const [isFlipped, setIsFlipped] = useState(false)

  return (
    <div
      className={`flip-card ${className}`}
      style={{ minHeight: `${minHeight}px` }}
      onMouseEnter={() => !disableFlip && setIsFlipped(true)}
      onMouseLeave={() => !disableFlip && setIsFlipped(false)}
    >
      <div
        className="flip-card-inner"
        style={{
          transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
          minHeight: `${minHeight}px`
        }}
      >
        <div className="flip-card-front" style={{ minHeight: `${minHeight}px` }}>
          <OrchestrationSurface level={level} className="h-full flex flex-col overflow-hidden">
            {front}
          </OrchestrationSurface>
        </div>
        <div className="flip-card-back" style={{ minHeight: `${minHeight}px` }}>
          <OrchestrationSurface level={level} className="h-full flex flex-col overflow-hidden">
            {back}
          </OrchestrationSurface>
        </div>
      </div>
    </div>
  )
}
