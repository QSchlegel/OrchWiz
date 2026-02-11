import { resolveXoSlashCommand } from "./xo-commands"

export interface XoWindowChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
}

export function buildInitialXoMessages(): XoWindowChatMessage[] {
  const seededHelpReply =
    resolveXoSlashCommand("/help")?.reply
    || "Bridge commands:\n/help\n/go <hero|risks|pillars|proof|crew|start>\n/docs <topic>\n/newsletter\n/register"

  return [
    {
      id: "xo-start",
      role: "assistant",
      content: "XO online. Try /help to see what I can do.",
    },
    {
      id: "xo-help-user",
      role: "user",
      content: "/help",
    },
    {
      id: "xo-help-assistant",
      role: "assistant",
      content: seededHelpReply,
    },
  ]
}

export function buildPasskeySoftGateReply(): string {
  return "Passkey required for live responses. Tap the fingerprint button to unlock."
}
