import {
  publicDocsTopicBySlug,
  publicDocsTopicHref,
  publicDocsTopics,
} from "./public-docs"

export interface XoCommandAction {
  type: "navigate" | "open_docs" | "open_register" | "open_newsletter"
  href?: string
}

export interface XoCommandResult {
  command: string
  reply: string
  action?: XoCommandAction
}

const GO_TARGETS = new Map<string, { id: string; label: string }>([
  ["hero", { id: "hero", label: "Hero" }],
  ["risk", { id: "bridge-risks", label: "Risk scan" }],
  ["risks", { id: "bridge-risks", label: "Risk scan" }],
  ["pillars", { id: "vpc-pillars", label: "Pillars" }],
  ["proof", { id: "proof-strip", label: "Proof strip" }],
  ["crew", { id: "bridge-crew", label: "Bridge crew" }],
  ["start", { id: "start-path", label: "Start path" }],
  ["onboard", { id: "start-path", label: "Start path" }],
])

function docsTopicList(): string {
  return publicDocsTopics()
    .map((topic) => topic.slug)
    .join(", ")
}

function helpMessage(): string {
  return [
    "Bridge commands:",
    "/help",
    "/go <hero|risks|pillars|proof|crew|start>",
    "/docs <topic>",
    "/newsletter",
    "/register",
  ].join("\n")
}

function resolveGoCommand(argument: string): XoCommandResult {
  const normalized = argument.trim().toLowerCase()
  const target = GO_TARGETS.get(normalized)

  if (!target) {
    return {
      command: "/go",
      reply:
        "Unknown waypoint. Use /go hero, /go risks, /go pillars, /go proof, /go crew, or /go start.",
    }
  }

  return {
    command: "/go",
    reply: `Rerouting to ${target.label}. Keep your eyes on the tactical board.`,
    action: {
      type: "navigate",
      href: `#${target.id}`,
    },
  }
}

function resolveDocsCommand(argument: string): XoCommandResult {
  const topicToken = argument.trim()
  if (!topicToken) {
    return {
      command: "/docs",
      reply: `Choose a topic: ${docsTopicList()}. Full docs hub: /docs`,
      action: {
        type: "open_docs",
        href: "/docs",
      },
    }
  }

  const topic = publicDocsTopicBySlug(topicToken)
  if (!topic) {
    return {
      command: "/docs",
      reply: `No exact match for "${topicToken}". Try: ${docsTopicList()}.`,
      action: {
        type: "open_docs",
        href: "/docs",
      },
    }
  }

  return {
    command: "/docs",
    reply: `${topic.teaser} Read the full brief at ${publicDocsTopicHref(topic.slug)}.`,
    action: {
      type: "open_docs",
      href: publicDocsTopicHref(topic.slug),
    },
  }
}

export function resolveXoSlashCommand(input: string): XoCommandResult | null {
  const trimmed = input.trim()
  if (!trimmed.startsWith("/")) {
    return null
  }

  const [rawCommand, ...rest] = trimmed.split(/\s+/)
  const command = rawCommand.toLowerCase()
  const argument = rest.join(" ")

  if (command === "/help") {
    return {
      command,
      reply: helpMessage(),
    }
  }

  if (command === "/go") {
    return resolveGoCommand(argument)
  }

  if (command === "/docs") {
    return resolveDocsCommand(argument)
  }

  if (command === "/newsletter") {
    return {
      command,
      reply: "Newsletter panel primed. Drop your email and I will queue a welcome beacon.",
      action: {
        type: "open_newsletter",
      },
    }
  }

  if (command === "/register") {
    return {
      command,
      reply: "Registration panel open. Secure your passkey first, then optionally link email.",
      action: {
        type: "open_register",
      },
    }
  }

  return {
    command,
    reply: `Unknown command ${command}. Use /help for available controls.`,
  }
}
