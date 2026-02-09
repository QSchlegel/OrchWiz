"use client"

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
        glass
        ${stackClass}
        rounded-2xl
        p-6
        transition-all
        duration-300
        hover:scale-[1.01]
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
          <div className="flex-shrink-0 p-3 rounded-xl bg-slate-900/[0.05] dark:bg-white/[0.05]">
            {icon}
          </div>
        )}
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1.5">{title}</h3>
          {description && (
            <p className="text-sm text-slate-600 dark:text-gray-500 leading-relaxed">
              {description}
            </p>
          )}
        </div>
      </div>
    </OrchestrationSurface>
  )
}
