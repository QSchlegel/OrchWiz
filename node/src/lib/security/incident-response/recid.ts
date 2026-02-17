function toRecid(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const asInt = Math.trunc(value)
    return asInt > 0 ? asInt : null
  }

  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number.parseInt(trimmed, 10)
    if (!Number.isFinite(parsed)) return null
    return parsed > 0 ? parsed : null
  }

  return null
}

export function nextRecid(records: Array<{ recid?: unknown }> | null | undefined): number {
  if (!records || records.length < 1) {
    return 1
  }

  let highest = 1
  for (const record of records) {
    const recid = toRecid(record?.recid)
    if (recid !== null && recid > highest) {
      highest = recid
    }
  }

  return highest + 1
}

export function ensureRecids<T extends { recid?: unknown }>(records: T[]): T[] {
  const used = new Set<number>()
  let highest = 0

  for (const record of records) {
    const recid = toRecid(record.recid)
    if (recid === null || used.has(recid)) {
      // Mark invalid/duplicate ids for reassignment in the second pass.
      record.recid = null
      continue
    }

    used.add(recid)
    if (recid > highest) {
      highest = recid
    }

    record.recid = recid
  }

  let next = Math.max(highest, 0) + 1
  for (const record of records) {
    const recid = toRecid(record.recid)
    if (recid !== null) {
      continue
    }

    while (used.has(next)) {
      next += 1
    }
    record.recid = next
    used.add(next)
    next += 1
  }

  return records
}
