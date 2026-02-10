import { getHetznerCatalog, getHetznerProviderReadiness } from "@/lib/shipyard/cloud/providers/hetzner"
import type { CloudCatalog, CloudProviderId, CloudProviderReadiness } from "@/lib/shipyard/cloud/types"

export interface CloudProviderHandler {
  id: CloudProviderId
  displayName: string
  readiness: () => CloudProviderReadiness
  catalog: (args: { token: string; forceRefresh?: boolean }) => Promise<CloudCatalog>
}

const hetznerProvider: CloudProviderHandler = {
  id: "hetzner",
  displayName: "Hetzner Cloud",
  readiness: getHetznerProviderReadiness,
  catalog: getHetznerCatalog,
}

const providerRegistry: Record<CloudProviderId, CloudProviderHandler> = {
  hetzner: hetznerProvider,
}

export function getCloudProviderHandler(provider: CloudProviderId): CloudProviderHandler {
  return providerRegistry[provider]
}

export function listCloudProviderHandlers(): CloudProviderHandler[] {
  return Object.values(providerRegistry)
}
