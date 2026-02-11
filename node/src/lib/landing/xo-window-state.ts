export interface XoWindowChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
}

export function buildInitialXoMessages(): XoWindowChatMessage[] {
  return [
    {
      id: "xo-start",
      role: "assistant",
      content: "XO online. Try /help to see what I can do.",
    },
  ]
}

export function buildPasskeySoftGateReply(): string {
  return "Passkey required for live responses. Tap the fingerprint button to unlock."
}
