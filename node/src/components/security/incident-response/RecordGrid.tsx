"use client"

import type { ReactNode } from "react"
import { useMemo } from "react"

type ColumnKind = "text" | "textarea" | "date" | "datetime" | "number" | "checkbox"

export interface GridColumn {
  key: string
  label: string
  kind?: ColumnKind
  placeholder?: string
  options?: string[]
  minWidthClass?: string
}

function asDisplayString(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (typeof value === "object" && !Array.isArray(value)) {
    const maybeText = (value as { text?: unknown }).text
    if (typeof maybeText === "string") return maybeText
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function RecordGrid(args: {
  title: string
  description?: string
  columns: GridColumn[]
  records: Array<Record<string, unknown>>
  onChange: (next: Array<Record<string, unknown>>) => void
  createRecord: () => Record<string, unknown>
  rowActions?: (record: Record<string, unknown>, index: number) => ReactNode
}) {
  const datalistId = useMemo(
    () => `datalist_${args.title.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${Math.random().toString(16).slice(2)}`,
    [args.title],
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{args.title}</h2>
          {args.description ? (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{args.description}</p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => args.onChange([...args.records, args.createRecord()])}
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-black dark:bg-white dark:text-slate-900"
        >
          Add row
        </button>
      </div>

      {args.columns.some((c) => Array.isArray(c.options) && c.options.length > 0) ? (
        <datalist id={datalistId}>
          {args.columns
            .flatMap((c) => c.options || [])
            .filter((v, i, all) => all.indexOf(v) === i)
            .map((value) => (
              <option key={value} value={value} />
            ))}
        </datalist>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/60 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
        <table className="min-w-full divide-y divide-slate-200/70 dark:divide-white/10">
          <thead className="bg-white/70 dark:bg-white/[0.03]">
            <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              <th className="px-3 py-3">recid</th>
              {args.columns.map((col) => (
                <th key={col.key} className={`px-3 py-3 ${col.minWidthClass || ""}`.trim()}>
                  {col.label}
                </th>
              ))}
              <th className="px-3 py-3"> </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/60 text-sm dark:divide-white/10">
            {args.records.length === 0 ? (
              <tr>
                <td colSpan={args.columns.length + 2} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                  No rows yet.
                </td>
              </tr>
            ) : (
              args.records.map((record, index) => (
                <tr key={String(record.recid ?? index)} className="align-top hover:bg-slate-50/70 dark:hover:bg-white/[0.04]">
                  <td className="px-3 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">
                    {asDisplayString(record.recid)}
                  </td>
                  {args.columns.map((col) => {
                    const kind = col.kind ?? "text"
                    const raw = record[col.key]

                    const update = (value: unknown) => {
                      const next = [...args.records]
                      next[index] = { ...next[index], [col.key]: value }
                      args.onChange(next)
                    }

                    if (kind === "checkbox") {
                      return (
                        <td key={col.key} className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={raw === true}
                            onChange={(e) => update(e.target.checked)}
                          />
                        </td>
                      )
                    }

                    if (kind === "textarea") {
                      return (
                        <td key={col.key} className="px-3 py-3">
                          <textarea
                            value={asDisplayString(raw)}
                            onChange={(e) => update(e.target.value)}
                            placeholder={col.placeholder}
                            className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white/70 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100"
                          />
                        </td>
                      )
                    }

                    const inputType = kind === "number" ? "number" : kind === "date" ? "date" : kind === "datetime" ? "datetime-local" : "text"
                    const hasOptions = Array.isArray(col.options) && col.options.length > 0

                    return (
                      <td key={col.key} className="px-3 py-3">
                        <input
                          type={inputType}
                          value={asDisplayString(raw)}
                          onChange={(e) => update(inputType === "number" ? e.target.value : e.target.value)}
                          placeholder={col.placeholder}
                          list={hasOptions ? datalistId : undefined}
                          className="w-full rounded-lg border border-slate-200 bg-white/70 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100"
                        />
                      </td>
                    )
                  })}
                  <td className="px-3 py-3">
                    {args.rowActions ? (
                      <div className="mb-2 flex flex-wrap gap-2">{args.rowActions(record, index)}</div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => args.onChange(args.records.filter((_, i) => i !== index))}
                      className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/[0.06]"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
