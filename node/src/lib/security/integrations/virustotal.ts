function base64UrlUnpadded(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

export function buildVirusTotalUrlId(url: string): string {
  return base64UrlUnpadded(url)
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export class VirusTotalError extends Error {
  status: number
  code: string
  details?: unknown

  constructor(
    message: string,
    options: { status?: number; code?: string; details?: unknown } = {},
  ) {
    super(message)
    this.name = "VirusTotalError"
    this.status = options.status ?? 500
    this.code = options.code ?? "VIRUSTOTAL_ERROR"
    this.details = options.details
  }
}

async function vtFetch(args: {
  apiKey: string
  path: string
  method?: "GET" | "POST"
  body?: BodyInit | null
  contentType?: string
}): Promise<{ ok: boolean; status: number; payload: unknown }> {
  const apiKey = asNonEmptyString(args.apiKey)
  if (!apiKey) {
    throw new VirusTotalError("VirusTotal API key is missing.", { status: 400, code: "VIRUSTOTAL_API_KEY_MISSING" })
  }

  const url = `https://www.virustotal.com${args.path}`
  const response = await fetch(url, {
    method: args.method ?? "GET",
    headers: {
      "x-apikey": apiKey,
      ...(args.contentType ? { "Content-Type": args.contentType } : {}),
    },
    body: args.body ?? null,
  })

  const payload = await response.json().catch(() => ({}))
  return { ok: response.ok, status: response.status, payload }
}

export async function fetchVirusTotalFileInfo(args: {
  apiKey: string
  id: string
}): Promise<{ ok: boolean; status: number; payload: unknown }> {
  const id = asNonEmptyString(args.id)
  if (!id) {
    throw new VirusTotalError("File id/hash is required.", { status: 400, code: "VIRUSTOTAL_FILE_ID_MISSING" })
  }

  return vtFetch({ apiKey: args.apiKey, path: `/api/v3/files/${encodeURIComponent(id)}` })
}

export async function fetchVirusTotalDomainInfo(args: {
  apiKey: string
  domain: string
}): Promise<{ ok: boolean; status: number; payload: unknown }> {
  const domain = asNonEmptyString(args.domain)
  if (!domain) {
    throw new VirusTotalError("Domain is required.", { status: 400, code: "VIRUSTOTAL_DOMAIN_MISSING" })
  }

  return vtFetch({ apiKey: args.apiKey, path: `/api/v3/domains/${encodeURIComponent(domain)}` })
}

export async function fetchVirusTotalIpInfo(args: {
  apiKey: string
  ip: string
}): Promise<{ ok: boolean; status: number; payload: unknown }> {
  const ip = asNonEmptyString(args.ip)
  if (!ip) {
    throw new VirusTotalError("IP address is required.", { status: 400, code: "VIRUSTOTAL_IP_MISSING" })
  }

  return vtFetch({ apiKey: args.apiKey, path: `/api/v3/ip_addresses/${encodeURIComponent(ip)}` })
}

export async function fetchVirusTotalUrlInfo(args: {
  apiKey: string
  urlOrId: string
}): Promise<{ ok: boolean; status: number; payload: unknown; id: string }> {
  const urlOrId = asNonEmptyString(args.urlOrId)
  if (!urlOrId) {
    throw new VirusTotalError("URL or URL id is required.", { status: 400, code: "VIRUSTOTAL_URL_MISSING" })
  }

  const id = urlOrId.includes("://") ? buildVirusTotalUrlId(urlOrId) : urlOrId
  const result = await vtFetch({ apiKey: args.apiKey, path: `/api/v3/urls/${encodeURIComponent(id)}` })
  return { ...result, id }
}

export async function submitVirusTotalUrl(args: {
  apiKey: string
  url: string
}): Promise<{ ok: boolean; status: number; payload: unknown }> {
  const url = asNonEmptyString(args.url)
  if (!url) {
    throw new VirusTotalError("URL is required.", { status: 400, code: "VIRUSTOTAL_URL_MISSING" })
  }

  // VT expects application/x-www-form-urlencoded for /urls submissions.
  const body = new URLSearchParams({ url }).toString()
  return vtFetch({
    apiKey: args.apiKey,
    path: "/api/v3/urls",
    method: "POST",
    contentType: "application/x-www-form-urlencoded",
    body,
  })
}

export function extractVirusTotalMaliciousCount(payload: unknown): number | null {
  const stats =
    (payload as any)?.data?.attributes?.last_analysis_stats ||
    (payload as any)?.data?.attributes?.last_analysis_stats

  const malicious = (stats as any)?.malicious
  return typeof malicious === "number" && Number.isFinite(malicious) ? malicious : null
}

