import { accessSync, constants, existsSync, statSync } from "node:fs"
import { delimiter, join } from "node:path"

export function commandExists(command: string, pathValue = process.env.PATH || ""): boolean {
  const candidates = pathValue
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)

  for (const basePath of candidates) {
    const candidate = join(basePath, command)
    if (!existsSync(candidate)) {
      continue
    }

    try {
      const stats = statSync(candidate)
      if (!stats.isFile()) {
        continue
      }
      accessSync(candidate, constants.X_OK)
      return true
    } catch {
      continue
    }
  }

  return false
}
