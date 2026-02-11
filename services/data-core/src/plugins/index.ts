import type { DataCoreConfig } from "../config.js"
import type { DataCoreDb } from "../db.js"
import { EdgeQuakePlugin } from "./edgequake.js"
import type { DataCorePlugin } from "./types.js"

export function createDataCorePlugin(args: {
  db: DataCoreDb
  config: DataCoreConfig
}): DataCorePlugin | null {
  if (!args.config.edgequake.enabled) {
    return null
  }
  return new EdgeQuakePlugin(args.db, args.config)
}
