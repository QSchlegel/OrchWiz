export interface PublicDocsTopic {
  slug: string
  title: string
  summary: string
  teaser: string
}

const TOPICS: PublicDocsTopic[] = [
  {
    slug: "bridge-roleplay",
    title: "Quick Brief",
    summary: "Platform overview covering boundary, control, and traceability.",
    teaser:
      "Start here, then move to trust and cloud controls.",
  },
  {
    slug: "slash-commands",
    title: "Command Deck",
    summary: "Command reference for navigation and landing actions.",
    teaser:
      "Use /docs <topic> for deep links and /help for the full list.",
  },
  {
    slug: "passkey-guard",
    title: "Trust Gate",
    summary: "Passkey requirements for protected XO chat access.",
    teaser:
      "Register a passkey before using authenticated landing chat.",
  },
  {
    slug: "newsletter",
    title: "Updates",
    summary: "Subscription flow for product and release updates.",
    teaser:
      "Use /newsletter or the landing form to subscribe.",
  },
  {
    slug: "cloud-toggle",
    title: "Cloud Control",
    summary: "Environment controls for enabling or disabling landing XO.",
    teaser:
      "Set LANDING_XO_ENABLED=false to disable XO in public cloud.",
  },
  {
    slug: "langfuse-tracing",
    title: "Trace Ledger",
    summary: "Tracing coverage for landing chat and conversion endpoints.",
    teaser:
      "Review traces for diagnostics, behavior checks, and audit support.",
  },
]

const TOPIC_ALIASES = new Map<string, string>([
  ["bridge", "bridge-roleplay"],
  ["roleplay", "bridge-roleplay"],
  ["xo", "bridge-roleplay"],
  ["brief", "bridge-roleplay"],
  ["quick-brief", "bridge-roleplay"],
  ["commands", "slash-commands"],
  ["command", "slash-commands"],
  ["passkey", "passkey-guard"],
  ["auth", "passkey-guard"],
  ["registration", "passkey-guard"],
  ["mail", "newsletter"],
  ["cloud", "cloud-toggle"],
  ["toggle", "cloud-toggle"],
  ["langfuse", "langfuse-tracing"],
  ["tracing", "langfuse-tracing"],
  ["telemetry", "langfuse-tracing"],
])

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_]+/g, "-")
}

export function publicDocsTopics(): PublicDocsTopic[] {
  return [...TOPICS]
}

export function publicDocsTopicBySlug(slug: string): PublicDocsTopic | null {
  const normalized = normalizeToken(slug)
  const aliased = TOPIC_ALIASES.get(normalized) || normalized
  return TOPICS.find((topic) => topic.slug === aliased) || null
}

export function publicDocsTopicHref(slug: string): string {
  const topic = publicDocsTopicBySlug(slug)
  if (!topic) {
    return "/docs"
  }
  return `/docs#${topic.slug}`
}
