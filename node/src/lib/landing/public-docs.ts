export interface PublicDocsTopic {
  slug: string
  title: string
  summary: string
  teaser: string
}

const TOPICS: PublicDocsTopic[] = [
  {
    slug: "what-is-orchwiz",
    title: "What is OrchWiz",
    summary: "OrchWiz is the Agent VPC for AI infra engineers: private, policy-controlled runtime network with full decision traceability.",
    teaser: "Three pillars: Boundary, Control, Traceability.",
  },
  {
    slug: "architecture",
    title: "Architecture at a glance",
    summary: "Control plane, sessions/tasks/actions, Ship Yard and ships, wallet-enclave, optional data-core.",
    teaser: "High-level view of how the platform is structured.",
  },
  {
    slug: "product-areas",
    title: "Product areas",
    summary: "Mission Control, Fleet, Personal, Bridge Ops, Ready Room, Community—mapped to the dashboard sidebar.",
    teaser: "Where to find each surface in the app.",
  },
  {
    slug: "key-concepts",
    title: "Key concepts",
    summary: "Sessions and runtime, Ship Yard and ships, bridge crew and quartermaster, vault and memory, wallet enclave, security and audits.",
    teaser: "Core concepts that underpin the platform.",
  },
  {
    slug: "getting-started",
    title: "Getting started",
    summary: "Run OrchWiz locally in 15 minutes; link to full Getting Started guide in the repo.",
    teaser: "Clone, dev-local compose, node env, db, dev.",
  },
  {
    slug: "security-compliance",
    title: "Security and compliance",
    summary: "Passkey and magic-link auth, role-based access, audit trail, encrypted traces; ISO 27001 and SOC 2 baseline.",
    teaser: "Link to compliance overview in the repo.",
  },
  {
    slug: "xo-and-landing",
    title: "XO and landing",
    summary: "XO is the Executive Officer voice for operational guidance; Command Deck lists slash commands.",
    teaser: "Use /help and /docs <topic> for navigation.",
  },
  {
    slug: "deployment",
    title: "Deployment and operations",
    summary: "Disable landing XO in public cloud; link to Current features in the repo.",
    teaser: "LANDING_XO_ENABLED and LANDING_XO_STAGE.",
  },
]

const TOPIC_ALIASES = new Map<string, string>([
  ["overview", "what-is-orchwiz"],
  ["intro", "what-is-orchwiz"],
  ["orchwiz", "what-is-orchwiz"],
  ["arch", "architecture"],
  ["architecture", "architecture"],
  ["areas", "product-areas"],
  ["products", "product-areas"],
  ["fleet", "product-areas"],
  ["mission", "product-areas"],
  ["bridge", "product-areas"],
  ["personal", "product-areas"],
  ["ready-room", "product-areas"],
  ["concepts", "key-concepts"],
  ["key-concepts", "key-concepts"],
  ["start", "getting-started"],
  ["getting-started", "getting-started"],
  ["setup", "getting-started"],
  ["security", "security-compliance"],
  ["compliance", "security-compliance"],
  ["xo", "xo-and-landing"],
  ["landing", "xo-and-landing"],
  ["commands", "xo-and-landing"],
  ["slash-commands", "xo-and-landing"],
  ["command-deck", "xo-and-landing"],
  ["deploy", "deployment"],
  ["deployment", "deployment"],
  ["operations", "deployment"],
  ["cloud", "deployment"],
  ["cloud-toggle", "deployment"],
  ["passkey", "security-compliance"],
  ["passkey-guard", "security-compliance"],
  ["auth", "security-compliance"],
  ["newsletter", "xo-and-landing"],
  ["mail", "xo-and-landing"],
  ["langfuse", "key-concepts"],
  ["tracing", "key-concepts"],
  ["telemetry", "key-concepts"],
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
