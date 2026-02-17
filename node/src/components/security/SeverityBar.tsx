export interface SeverityCounts {
  critical: number
  high: number
  medium: number
  low: number
  info: number
}

export function SeverityBar({
  counts,
  label,
}: {
  counts: SeverityCounts
  label?: string
}) {
  const total = counts.critical + counts.high + counts.medium + counts.low + counts.info
  if (total === 0) {
    return (
      <div>
        {label ? <div className="mb-1.5 text-xs text-slate-500">{label}</div> : null}
        <div className="h-2.5 w-full rounded-full bg-emerald-500/20" />
      </div>
    )
  }

  const segments = [
    { key: "critical", value: counts.critical, color: "bg-rose-500" },
    { key: "high", value: counts.high, color: "bg-amber-500" },
    { key: "medium", value: counts.medium, color: "bg-yellow-400" },
    { key: "low", value: counts.low, color: "bg-blue-400" },
    { key: "info", value: counts.info, color: "bg-slate-400" },
  ].filter((s) => s.value > 0)

  return (
    <div>
      {label ? <div className="mb-1.5 text-xs text-slate-500">{label}</div> : null}
      <div className="flex gap-0.5 overflow-hidden rounded-full">
        {segments.map((segment) => (
          <div
            key={segment.key}
            className={`h-2.5 ${segment.color} transition-all`}
            style={{ width: `${(segment.value / total) * 100}%`, minWidth: "4px" }}
            title={`${segment.key}: ${segment.value}`}
          />
        ))}
      </div>
    </div>
  )
}
