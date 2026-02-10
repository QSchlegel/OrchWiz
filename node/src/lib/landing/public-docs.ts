export interface PublicDocsTopic {
  slug: string
  title: string
  summary: string
  teaser: string
}

const TOPICS: PublicDocsTopic[] = [
  {
    slug: "bridge-roleplay",
    title: "Bridge Roleplay",
    summary: "How XO answers in short bridge-style teasers instead of full deep dives.",
    teaser:
      "XO keeps answers tactical and short. You get a mission nudge, then a docs route for the full brief.",
  },
  {
    slug: "slash-commands",
    title: "Slash Commands",
    summary: "Available commands to navigate sections and jump to docs topics.",
    teaser:
      "Use /go <section>, /docs <topic>, /newsletter, /register, and /help to steer XO quickly.",
  },
  {
    slug: "passkey-guard",
    title: "Passkey Guard",
    summary: "Why XO chat is passkey-gated and how to unlock it with optional email.",
    teaser:
      "Passkey is required before chat unlock. Email is optional at first and can be linked later.",
  },
  {
    slug: "newsletter",
    title: "Newsletter",
    summary: "How teaser updates are subscribed, confirmed, and managed.",
    teaser:
      "Newsletter opt-in is available in XO and landing forms; welcome mail is sent when provider keys exist.",
  },
  {
    slug: "cloud-toggle",
    title: "Cloud Toggle",
    summary: "Deployment kill switch for public cloud operators.",
    teaser:
      "Set LANDING_XO_ENABLED=false to disable XO UI and APIs without a code change.",
  },
  {
    slug: "langfuse-tracing",
    title: "Langfuse Tracing",
    summary: "Telemetry emitted for chat, register, and newsletter flows.",
    teaser:
      "Landing traces are emitted through the existing observability pipeline with full request/response payloads.",
  },
]

const TOPIC_ALIASES = new Map<string, string>([
  ["bridge", "bridge-roleplay"],
  ["roleplay", "bridge-roleplay"],
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
