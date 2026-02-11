import { runtimeIntelligenceConfig } from "@/lib/runtime/intelligence/config"
import {
  consolidateRuntimeIntelligencePolicyStates,
  type RuntimeIntelligenceConsolidationSummary,
} from "@/lib/runtime/intelligence/state"

export function runtimeIntelligenceNightlyCronToken(): string | null {
  return runtimeIntelligenceConfig().nightlyCronToken
}

export async function runRuntimeIntelligenceNightlyConsolidation(
  now = new Date(),
): Promise<RuntimeIntelligenceConsolidationSummary> {
  const config = runtimeIntelligenceConfig()
  return consolidateRuntimeIntelligencePolicyStates(config, now)
}
