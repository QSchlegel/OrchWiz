import { readFile } from "node:fs/promises"

export async function fileContains(path: string, pattern: string): Promise<boolean> {
  try {
    const raw = await readFile(path, "utf8")
    return raw.includes(pattern)
  } catch {
    return false
  }
}

export async function readFileSafe(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8")
  } catch {
    return ""
  }
}
