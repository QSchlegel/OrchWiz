import { resolveXoSlashCommand } from "@/lib/landing/xo-commands"

export interface XoWindowChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
}

const STARTER_MESSAGE: XoWindowChatMessage = {
  id: "xo-start",
  role: "assistant",
  content: "XO online. Tactical teaser mode active. Use /help for commands or /docs passkey for guardrails.",
}

const SEEDED_HELP_PROMPT: XoWindowChatMessage = {
  id: "xo-help-user",
  role: "user",
  content: "/help",
}

function seededHelpReply(): string {
  const resolved = resolveXoSlashCommand("/help")
  if (resolved?.reply) {
    return resolved.reply
  }

  return [
    "Bridge commands:",
    "/help",
    "/go <hero|risks|pillars|proof|crew|start>",
    "/docs <topic>",
    "/newsletter",
    "/register",
  ].join("\n")
}

export function buildInitialXoMessages(): XoWindowChatMessage[] {
  return [
    STARTER_MESSAGE,
    SEEDED_HELP_PROMPT,
    {
      id: "xo-help-assistant",
      role: "assistant",
      content: seededHelpReply(),
    },
  ]
}

export function buildPasskeySoftGateReply(): string {
  return "XO: Passkey lock engaged. Sign in with passkey or create a guest passkey to unlock the live channel."
}
