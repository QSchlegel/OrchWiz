"use client"

import { FormEvent, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  ChevronUp,
  FingerprintPattern,
  MessageSquareText,
  SendHorizontal,
} from "lucide-react"
import { authClient, signIn, useSession } from "@/lib/auth-client"
import {
  buildInitialXoMessages,
  buildPasskeySoftGateReply,
  type XoWindowChatMessage,
} from "@/lib/landing/xo-window-state"

interface LandingConfigResponse {
  enabled: boolean
}

interface XoAction {
  type: "navigate" | "open_docs" | "open_register" | "open_newsletter"
  href?: string
}

interface ChatResponse {
  reply?: string
  action?: XoAction | null
  error?: string
}

const SLASH_HINTS = [
  { cmd: "/help", hint: "List commands" },
  { cmd: "/go", hint: "Navigate to section" },
  { cmd: "/docs", hint: "Browse docs" },
  { cmd: "/register", hint: "Create profile" },
  { cmd: "/newsletter", hint: "Subscribe" },
]

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

export function XoTeaserChatWindow() {
  const { data: session, refetch: refetchSession } = useSession()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [configLoading, setConfigLoading] = useState(true)
  const [featureEnabled, setFeatureEnabled] = useState(true)
  const [isOpen, setIsOpen] = useState(false)
  const [hasPasskey, setHasPasskey] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const [passkeyError, setPasskeyError] = useState<string | null>(null)
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<XoWindowChatMessage[]>(() => buildInitialXoMessages())
  const [chatLoading, setChatLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [registerEmail, setRegisterEmail] = useState("")
  const [registerName, setRegisterName] = useState("")
  const [newsletterOptIn, setNewsletterOptIn] = useState(true)
  const [newsletterEmail, setNewsletterEmail] = useState("")
  const [newsletterLoading, setNewsletterLoading] = useState(false)
  const [registerLoading, setRegisterLoading] = useState(false)
  const [registerResult, setRegisterResult] = useState<string | null>(null)
  const [newsletterResult, setNewsletterResult] = useState<string | null>(null)
  const [showRegisterPanel, setShowRegisterPanel] = useState(false)
  const [showNewsletterPanel, setShowNewsletterPanel] = useState(false)

  const unlocked = useMemo(() => Boolean(session?.user?.id) && hasPasskey, [session?.user?.id, hasPasskey])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const response = await fetch("/api/landing/config", { cache: "no-store" })
        const payload = (await response.json().catch(() => ({}))) as LandingConfigResponse
        if (!cancelled) {
          setFeatureEnabled(Boolean(payload.enabled))
        }
      } catch {
        if (!cancelled) {
          setFeatureEnabled(true)
        }
      } finally {
        if (!cancelled) {
          setConfigLoading(false)
        }
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const checkPasskey = async () => {
      if (!session?.user?.id) {
        setHasPasskey(false)
        return
      }
      setPasskeyLoading(true)
      try {
        const { data, error } = await authClient.passkey.listUserPasskeys()
        if (!cancelled && !error) {
          setHasPasskey(Array.isArray(data) && data.length > 0)
        }
      } catch {
        if (!cancelled) {
          setHasPasskey(false)
        }
      } finally {
        if (!cancelled) {
          setPasskeyLoading(false)
        }
      }
    }

    void checkPasskey()
    return () => {
      cancelled = true
    }
  }, [session?.user?.id])

  useEffect(() => {
    if (session?.user?.email) {
      setNewsletterEmail((current) => current || session.user.email || "")
      setRegisterEmail((current) => current || session.user.email || "")
    }
    if (session?.user?.name) {
      setRegisterName((current) => current || session.user.name || "")
    }
  }, [session?.user?.email, session?.user?.name])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, chatLoading])

  useEffect(() => {
    if (!registerResult) return
    const timer = setTimeout(() => setRegisterResult(null), 4000)
    return () => clearTimeout(timer)
  }, [registerResult])

  useEffect(() => {
    if (!newsletterResult) return
    const timer = setTimeout(() => setNewsletterResult(null), 4000)
    return () => clearTimeout(timer)
  }, [newsletterResult])

  const pushAssistantMessage = (content: string) => {
    setMessages((current) => [
      ...current,
      {
        id: randomId("assistant"),
        role: "assistant",
        content,
      },
    ])
  }

  const handleAction = (action?: XoAction | null) => {
    if (!action) return
    if (action.type === "navigate" && action.href) {
      window.location.hash = action.href.startsWith("#") ? action.href.slice(1) : action.href
      return
    }
    if (action.type === "open_docs" && action.href) {
      window.location.href = action.href
      return
    }
    if (action.type === "open_register") {
      setShowRegisterPanel(true)
      setShowNewsletterPanel(false)
      return
    }
    if (action.type === "open_newsletter") {
      setShowNewsletterPanel(true)
      setShowRegisterPanel(false)
    }
  }

  const handleCreateGuestPasskey = async () => {
    if (!session?.user?.id) {
      const anonymousSignIn = (signIn as unknown as { anonymous?: () => Promise<{ error?: { message?: string } }> }).anonymous
      if (!anonymousSignIn) {
        setPasskeyError("Anonymous passkey flow is unavailable in this deployment.")
        return
      }
      const anonymousResult = await anonymousSignIn()
      if (anonymousResult?.error) {
        setPasskeyError(anonymousResult.error.message || "Unable to create guest session.")
        return
      }
      await refetchSession()
    }

    const passkeyResult = await authClient.passkey.addPasskey({
      name: "XO Bridge Passkey",
    })
    if (passkeyResult.error) {
      setPasskeyError(passkeyResult.error.message || "Unable to register passkey.")
      return
    }

    setHasPasskey(true)
    await refetchSession()
  }

  const handlePasskeyUnlock = async () => {
    setPasskeyError(null)
    setPasskeyLoading(true)
    try {
      const result = await signIn.passkey()
      if (!result.error) {
        await refetchSession()
        const { data, error } = await authClient.passkey.listUserPasskeys()
        if (!error && Array.isArray(data) && data.length > 0) {
          setHasPasskey(true)
        }
        return
      }
    } catch {
      // signIn.passkey() threw (user cancelled) — fall through to guest creation
    }

    try {
      await handleCreateGuestPasskey()
    } catch (error) {
      setPasskeyError(error instanceof Error ? error.message : "Unable to register passkey.")
    } finally {
      setPasskeyLoading(false)
    }
  }

  const handleSend = async (event?: FormEvent, overridePrompt?: string) => {
    if (event) event.preventDefault()
    const prompt = (overridePrompt || input).trim()
    if (!prompt || chatLoading) return

    setErrorMessage(null)
    const nextUserMessage: XoWindowChatMessage = {
      id: randomId("user"),
      role: "user",
      content: prompt,
    }
    const history = messages.map((message) => ({
      role: message.role,
      content: message.content,
    }))

    setMessages((current) => [...current, nextUserMessage])
    setInput("")
    setIsOpen(true)

    if (!unlocked) {
      pushAssistantMessage(buildPasskeySoftGateReply())
      return
    }

    setChatLoading(true)

    try {
      const response = await fetch("/api/landing/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, history }),
      })
      const payload = (await response.json().catch(() => ({}))) as ChatResponse
      if (!response.ok) {
        pushAssistantMessage(payload.error || "XO channel is currently unavailable.")
        return
      }

      pushAssistantMessage(payload.reply || "No update available.")
      handleAction(payload.action)
    } catch {
      pushAssistantMessage("Network link unstable. Try again.")
    } finally {
      setChatLoading(false)
    }
  }

  const handleRegister = async (event: FormEvent) => {
    event.preventDefault()
    if (registerLoading) return

    setRegisterLoading(true)
    setRegisterResult(null)
    setErrorMessage(null)
    try {
      const response = await fetch("/api/landing/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: registerEmail.trim() || undefined,
          name: registerName.trim() || undefined,
          newsletterOptIn,
        }),
      })

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string
        user?: { email?: string | null }
        newsletter?: { status?: string }
      }
      if (!response.ok) {
        setErrorMessage(payload.error || "Unable to complete registration.")
        return
      }

      if (payload.user?.email) {
        setNewsletterEmail(payload.user.email)
      }

      setRegisterResult(
        payload.newsletter?.status === "requires_email"
          ? "Registered. Add an email to enable newsletter."
          : "Registration complete.",
      )
    } catch {
      setErrorMessage("Unable to complete registration right now.")
    } finally {
      setRegisterLoading(false)
    }
  }

  const handleNewsletter = async (event: FormEvent) => {
    event.preventDefault()
    if (!newsletterEmail.trim() || newsletterLoading) return
    setNewsletterLoading(true)
    setNewsletterResult(null)
    setErrorMessage(null)
    try {
      const response = await fetch("/api/landing/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newsletterEmail.trim(),
          name: registerName.trim() || undefined,
        }),
      })
      const payload = (await response.json().catch(() => ({}))) as { error?: string; email?: string }
      if (!response.ok) {
        setErrorMessage(payload.error || "Unable to subscribe right now.")
        return
      }
      setNewsletterResult(`Subscribed ${payload.email || newsletterEmail.trim()}.`)
    } catch {
      setErrorMessage("Unable to subscribe right now.")
    } finally {
      setNewsletterLoading(false)
    }
  }

  const slashHints = useMemo(() => {
    const trimmed = input.trimStart()
    if (!trimmed.startsWith("/")) return []
    const typed = trimmed.toLowerCase()
    return SLASH_HINTS.filter((h) => h.cmd.startsWith(typed) || typed === "/")
  }, [input])

  const renderMessageContent = (content: string) => {
    const parts = content.split(/((?:^|\s)\/\w+(?:\s\w+)?)/g)
    return parts.map((part, i) => {
      if (/(?:^|\s)\/\w+/.test(part)) {
        const trimmed = part.trimStart()
        const leading = part.slice(0, part.length - trimmed.length)
        return (
          <span key={i}>
            {leading}
            <code className="xo-cmd-token">{trimmed}</code>
          </span>
        )
      }
      return <span key={i}>{part}</span>
    })
  }

  if (configLoading) {
    return (
      <section id="xo-bridge" className="px-6 md:px-12 pb-24">
        <div className="max-w-3xl mx-auto">
          <div className="xo-teaser-dark xo-open-shell">
            <div className="xo-input-shell">
              <div className="xo-input-row">
                <input type="text" disabled placeholder="syncing..." className="xo-input" />
              </div>
            </div>
          </div>
        </div>
      </section>
    )
  }

  if (!featureEnabled) {
    return (
      <section id="xo-bridge" className="px-6 md:px-12 pb-24">
        <div className="max-w-3xl mx-auto">
          <div className="xo-teaser-dark xo-open-shell">
            <div className="xo-input-shell">
              <div className="xo-input-row">
                <input type="text" disabled placeholder="XO offline" className="xo-input" />
                <Link href="/docs" className="xo-send-btn" aria-label="Open docs">
                  <MessageSquareText className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section id="xo-bridge" className="px-6 md:px-12 pb-24">
      <div className="max-w-3xl mx-auto">
        <div className="xo-teaser-dark xo-open-shell">
          {isOpen && (
            <>
              <div className="xo-panel-header">
                <div className="xo-panel-title">
                  <MessageSquareText className="w-4 h-4" />
                  XO
                </div>
                <button type="button" onClick={() => setIsOpen(false)} className="xo-close-btn" aria-expanded="true">
                  Close
                  <ChevronUp className="w-4 h-4" />
                </button>
              </div>

              <div className="xo-chat-log card-scroll animate-slide-in">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`xo-msg xo-msg-enter ${message.role === "assistant" ? "xo-msg-assistant" : "xo-msg-user"}`}
                  >
                    {renderMessageContent(message.content)}
                  </div>
                ))}
                {chatLoading && (
                  <div className="xo-msg xo-msg-enter xo-msg-assistant">
                    <div className="xo-typing-dots">
                      <span className="xo-typing-dot" style={{ animationDelay: "0ms" }} />
                      <span className="xo-typing-dot" style={{ animationDelay: "160ms" }} />
                      <span className="xo-typing-dot" style={{ animationDelay: "320ms" }} />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </>
          )}

          <div className="xo-input-shell">
            {(errorMessage || passkeyError) && (
              <p className="xo-inline-feedback xo-inline-feedback-error">
                {passkeyError || errorMessage}
              </p>
            )}

            {slashHints.length > 0 && (
              <div className="xo-slash-hints animate-slide-in">
                {slashHints.map((h) => (
                  <button
                    key={h.cmd}
                    type="button"
                    className="xo-slash-hint"
                    onClick={() => {
                      if (h.cmd === "/go" || h.cmd === "/docs") {
                        setInput(h.cmd + " ")
                      } else {
                        void handleSend(undefined, h.cmd)
                      }
                    }}
                  >
                    <span className="xo-slash-hint-cmd">{h.cmd}</span>
                    <span className="xo-slash-hint-label">{h.hint}</span>
                  </button>
                ))}
              </div>
            )}

            <form onSubmit={handleSend} className="xo-input-row">
              <input
                type="text"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={unlocked ? "Type a message or /help..." : "Tap fingerprint to unlock..."}
                disabled={chatLoading}
                className="xo-input"
              />
              {unlocked ? (
                <button
                  type="submit"
                  disabled={!input.trim() || chatLoading}
                  className="xo-send-btn"
                  aria-label="Send"
                >
                  <SendHorizontal className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handlePasskeyUnlock()}
                  disabled={passkeyLoading}
                  className="xo-send-btn xo-send-btn-locked"
                  aria-label="Unlock with passkey"
                >
                  {passkeyLoading ? (
                    <span className="xo-spinner" />
                  ) : (
                    <FingerprintPattern className="w-4 h-4 xo-fingerprint-pulse" />
                  )}
                </button>
              )}
            </form>

            {showRegisterPanel && (
              <div className="xo-drawer animate-slide-in">
                <div className="xo-drawer-header">
                  <span className="xo-drawer-title">Register</span>
                  <button type="button" onClick={() => setShowRegisterPanel(false)} className="xo-link-btn">
                    Close
                  </button>
                </div>
                <form onSubmit={handleRegister} className="xo-drawer-form">
                  <input
                    type="email"
                    value={registerEmail}
                    onChange={(event) => setRegisterEmail(event.target.value)}
                    placeholder="Email (optional)"
                    className="xo-field"
                  />
                  <input
                    type="text"
                    value={registerName}
                    onChange={(event) => setRegisterName(event.target.value)}
                    placeholder="Display name (optional)"
                    className="xo-field"
                  />
                  <label className="xo-checkbox-row">
                    <input
                      type="checkbox"
                      checked={newsletterOptIn}
                      onChange={(event) => setNewsletterOptIn(event.target.checked)}
                      className="xo-checkbox"
                    />
                    Opt into newsletter
                  </label>
                  <button type="submit" disabled={!unlocked || registerLoading} className="xo-submit-btn xo-submit-btn-violet">
                    {registerLoading ? "Saving..." : "Save"}
                  </button>
                  {registerResult && (
                    <p className="xo-inline-feedback xo-inline-feedback-success">{registerResult}</p>
                  )}
                </form>
              </div>
            )}

            {showNewsletterPanel && (
              <div className="xo-drawer animate-slide-in">
                <div className="xo-drawer-header">
                  <span className="xo-drawer-title">Newsletter</span>
                  <button type="button" onClick={() => setShowNewsletterPanel(false)} className="xo-link-btn">
                    Close
                  </button>
                </div>
                <form onSubmit={handleNewsletter} className="xo-drawer-form">
                  <input
                    type="email"
                    value={newsletterEmail}
                    onChange={(event) => setNewsletterEmail(event.target.value)}
                    placeholder="you@company.com"
                    className="xo-field"
                  />
                  <button
                    type="submit"
                    disabled={!newsletterEmail.trim() || newsletterLoading}
                    className="xo-submit-btn xo-submit-btn-cyan"
                  >
                    {newsletterLoading ? "Subscribing..." : "Subscribe"}
                  </button>
                  {newsletterResult && (
                    <p className="xo-inline-feedback xo-inline-feedback-success">{newsletterResult}</p>
                  )}
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
