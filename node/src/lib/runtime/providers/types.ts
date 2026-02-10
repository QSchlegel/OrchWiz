import type { RuntimeProvider, RuntimeRequest, RuntimeResult } from "@/lib/types/runtime"
import type { RuntimeProfileName } from "@/lib/runtime/profiles"

export interface RuntimeProviderContext {
  profile: RuntimeProfileName
  previousErrors: string[]
}

export interface RuntimeProviderDefinition {
  id: RuntimeProvider
  run: (request: RuntimeRequest, context: RuntimeProviderContext) => Promise<RuntimeResult>
}
