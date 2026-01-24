"use client"

import { WandSparkles } from "lucide-react"
import { ReactNode } from "react"

interface OrchestrationSurfaceProps {
  children: ReactNode
  level?: 1 | 2 | 3 | 4 | 5
  className?: string
  onClick?: () => void
}

export function OrchestrationSurface({ 
  children, 
  level = 2,
  className = "",
  onClick
}: OrchestrationSurfaceProps) {
  const stackClass = `stack-${level}`
  
  return (
    <div 
      className={`
        glass dark:glass-dark 
        ${stackClass}
        rounded-2xl 
        p-6 
        transition-all 
        duration-300 
        hover:scale-[1.02]
        ${onClick ? "cursor-pointer" : ""}
        ${className}
      `}
      style={{ transformStyle: 'preserve-3d' }}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

interface OrchestrationCardProps {
  title: string
  description?: string
  icon?: ReactNode
  level?: 1 | 2 | 3 | 4 | 5
  onClick?: () => void
}

export function OrchestrationCard({
  title,
  description,
  icon,
  level = 2,
  onClick
}: OrchestrationCardProps) {
  return (
    <OrchestrationSurface 
      level={level}
      className={onClick ? "cursor-pointer" : ""}
      onClick={onClick}
    >
      <div className="flex items-start gap-4">
        {icon && (
          <div className="flex-shrink-0 p-3 rounded-xl bg-white/10 dark:bg-white/5">
            {icon}
          </div>
        )}
        <div className="flex-1">
          <h3 className="text-xl font-semibold mb-2">{title}</h3>
          {description && (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {description}
            </p>
          )}
        </div>
      </div>
    </OrchestrationSurface>
  )
}
