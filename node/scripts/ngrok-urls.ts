import { pathToFileURL } from "node:url"

export interface NgrokTunnel {
  name?: string
  public_url?: string
  proto?: string
  config?: {
    addr?: string
  }
}

interface NgrokApiResponse {
  tunnels?: NgrokTunnel[]
}

export function normalizeNgrokAddr(value: string): string {
  return value.trim().replace(/^https?:\/\//iu, "")
}

export function tunnelTargetsPort(tunnel: NgrokTunnel, port: number): boolean {
  const addr = normalizeNgrokAddr(String(tunnel.config?.addr || ""))
  if (!addr) return false
  return addr.endsWith(`:${port}`) || addr === String(port)
}

export function pickPublicUrlForPort(tunnels: NgrokTunnel[], port: number): string | null {
  const candidates = tunnels.filter((tunnel) => tunnelTargetsPort(tunnel, port))
  if (candidates.length === 0) {
    return null
  }

  const httpsCandidate = candidates.find((tunnel) => String(tunnel.public_url || "").startsWith("https://"))
  return (httpsCandidate?.public_url || candidates[0]?.public_url || null) ?? null
}

export async function fetchNgrokTunnels(
  fetchFn: typeof fetch = fetch,
  apiBaseUrl = process.env.NGROK_API_BASE_URL?.trim() || "http://127.0.0.1:4040",
): Promise<NgrokTunnel[]> {
  const baseUrl = apiBaseUrl.replace(/\/+$/u, "")
  const response = await fetchFn(`${baseUrl}/api/tunnels`)
  if (!response.ok) {
    throw new Error(`ngrok API request failed (${response.status}).`)
  }

  const payload = (await response.json()) as NgrokApiResponse
  return Array.isArray(payload.tunnels) ? payload.tunnels : []
}

export function buildNgrokReport(tunnels: NgrokTunnel[]): string {
  const appUrl = pickPublicUrlForPort(tunnels, 3000)
  const webhookReceiverUrl = pickPublicUrlForPort(tunnels, 4000)

  const lines: string[] = []
  lines.push("ngrok tunnel summary")
  lines.push("")
  lines.push(`App tunnel (:3000): ${appUrl || "NOT FOUND"}`)
  lines.push(`Webhook receiver tunnel (:4000): ${webhookReceiverUrl || "NOT FOUND"}`)
  lines.push("")

  if (appUrl) {
    lines.push("Inbound webhook URLs")
    lines.push(`- GitHub callback: ${appUrl}/api/auth/callback/github`)
    lines.push(`- GitHub webhook:  ${appUrl}/api/github/webhook`)
    lines.push(`- Hook trigger:    ${appUrl}/api/hooks/trigger`)
    lines.push("")
  }

  if (webhookReceiverUrl) {
    lines.push("Outbound webhook target examples")
    lines.push(`- Deploy hook: ${webhookReceiverUrl}/hooks/deploy-status`)
    lines.push(`- Failure hook: ${webhookReceiverUrl}/hooks/command-failures`)
    lines.push("")
  }

  lines.push("Suggested .env values (print-only)")
  if (appUrl) {
    lines.push(`NEXT_PUBLIC_APP_URL=${appUrl}`)
  } else {
    lines.push("NEXT_PUBLIC_APP_URL=<paste app tunnel URL>")
  }
  lines.push("HOOK_WEBHOOK_ALLOW_NGROK=true")
  lines.push("# Alternative: keep flag false and allowlist explicit ngrok host(s)")
  lines.push("# HOOK_WEBHOOK_TARGET_ALLOWLIST=localhost,127.0.0.1,::1,<your-subdomain>.ngrok-free.app")

  return lines.join("\n")
}

export async function runNgrokUrlReport(): Promise<void> {
  try {
    const tunnels = await fetchNgrokTunnels()
    console.log(buildNgrokReport(tunnels))
  } catch (error) {
    console.error("Failed to read ngrok tunnels:", (error as Error).message)
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runNgrokUrlReport()
}

