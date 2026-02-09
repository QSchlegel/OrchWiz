interface StatusPillProps {
  value: string
}

const styles: Record<string, string> = {
  running: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  completed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  failed: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
  thinking: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  pending: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30",
  active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  paused: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  planning: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  executing: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30",
  open: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  error: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
}

export function StatusPill({ value }: StatusPillProps) {
  const key = value.toLowerCase()
  const cls = styles[key] || styles.pending

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {value}
    </span>
  )
}
