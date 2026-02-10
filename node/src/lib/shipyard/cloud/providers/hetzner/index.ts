import { commandExists } from "@/lib/shipyard/cloud/command-runtime"
import { fetchHetznerCatalog } from "@/lib/shipyard/cloud/providers/hetzner/catalog"
import type { CloudCatalog, CloudProviderReadiness } from "@/lib/shipyard/cloud/types"

export interface HetznerProviderCatalogArgs {
  token: string
  forceRefresh?: boolean
}

export function getHetznerProviderReadiness(): CloudProviderReadiness {
  const checks = [
    {
      key: "ssh-keygen",
      ok: commandExists("ssh-keygen"),
      message: "ssh-keygen command available",
    },
    {
      key: "ssh",
      ok: commandExists("ssh"),
      message: "ssh command available",
    },
    {
      key: "autossh",
      ok: commandExists("autossh"),
      message: "autossh command available",
    },
    {
      key: "terraform",
      ok: commandExists("terraform"),
      message: "terraform command available",
    },
    {
      key: "ansible-playbook",
      ok: commandExists("ansible-playbook"),
      message: "ansible-playbook command available",
    },
  ]

  return {
    provider: "hetzner",
    displayName: "Hetzner Cloud",
    enabled: true,
    ready: checks.every((check) => check.ok),
    checks,
  }
}

export async function getHetznerCatalog(args: HetznerProviderCatalogArgs): Promise<CloudCatalog> {
  return fetchHetznerCatalog({
    token: args.token,
    forceRefresh: args.forceRefresh,
  })
}
