import type { ReactNode } from "react"

interface PageLayoutProps {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
}

export function PageLayout({ title, description, actions, children }: PageLayoutProps) {
  return (
    <div className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
              {title}
            </h1>
            {description && (
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{description}</p>
            )}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
        {children}
      </div>
    </div>
  )
}

interface SurfaceCardProps {
  children: ReactNode
  className?: string
}

export function SurfaceCard({ children, className = "" }: SurfaceCardProps) {
  return (
    <div
      className={`rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/[0.04] ${className}`.trim()}
    >
      {children}
    </div>
  )
}

interface FilterBarProps {
  children: ReactNode
}

export function FilterBar({ children }: FilterBarProps) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200/70 bg-white/70 p-3 dark:border-white/10 dark:bg-white/[0.03]">
      {children}
    </div>
  )
}

interface EmptyStateProps {
  title: string
  description?: string
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-10 text-center text-slate-600 dark:border-white/15 dark:bg-white/[0.03] dark:text-slate-400">
      <p className="text-base font-medium text-slate-800 dark:text-slate-200">{title}</p>
      {description ? <p className="mt-1 text-sm">{description}</p> : null}
    </div>
  )
}

interface InlineNoticeProps {
  variant?: "info" | "success" | "error"
  children: ReactNode
}

export function InlineNotice({ variant = "info", children }: InlineNoticeProps) {
  const variantClasses =
    variant === "success"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : variant === "error"
        ? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
        : "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300"

  return <div className={`rounded-lg border px-3 py-2 text-sm ${variantClasses}`}>{children}</div>
}
