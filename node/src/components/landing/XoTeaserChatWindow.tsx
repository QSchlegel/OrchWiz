"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  ChevronDown,
  ChevronUp,
  KeyRound,
  MessageSquareText,
  SendHorizontal,
  UserRound,
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

const PASSKEY_SOFT_GATE_ERROR = "Passkey unlock is required before XO can dispatch live responses."

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

export function XoTeaserChatWindow() {
  const { data: session } = useSession()
  const [configLoading, setConfigLoading] = useState(true)
  const [featureEnabled, setFeatureEnabled] = useState(true)
  const [isOpen, setIsOpen] = useState(false)
  const [hasPasskey, setHasPasskey] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)
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
    if (!action) {
      return
    }

    if (action.type === "navigate" && action.href) {
      window.location.hash = action.href.startsWith("#") ? action.href.slice(1) : action.href
      return
    }

    if (action.type === "open_docs" && action.href) {
      window.location.href = action.href
      return
    }

    if (action.type === "open_register") {
      setIsOpen(true)
      setShowRegisterPanel(true)
      return
    }

    if (action.type === "open_newsletter") {
      setIsOpen(true)
      setShowNewsletterPanel(true)
    }
  }

  const handleSignInPasskey = async () => {
    setErrorMessage(null)
    setRegisterResult(null)
    try {
      const result = await signIn.passkey()
      if (result.error) {
        setErrorMessage(result.error.message || "Unable to sign in with passkey.")
        return
      }
      window.location.reload()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to sign in with passkey.")
    }
  }

  const handleCreateGuestPasskey = async () => {
    setErrorMessage(null)
    setRegisterResult(null)
    setPasskeyLoading(true)
    try {
      if (!session?.user?.id) {
        const anonymousSignIn = (signIn as unknown as { anonymous?: () => Promise<{ error?: { message?: string } }> }).anonymous
        if (!anonymousSignIn) {
          setErrorMessage("Anonymous passkey flow is unavailable in this deployment.")
          return
        }
        const anonymousResult = await anonymousSignIn()
        if (anonymousResult?.error) {
          setErrorMessage(anonymousResult.error.message || "Unable to create guest session.")
          return
        }
      }

      const passkeyResult = await authClient.passkey.addPasskey({
        name: "XO Bridge Passkey",
      })
      if (passkeyResult.error) {
        setErrorMessage(passkeyResult.error.message || "Unable to register passkey.")
        return
      }

      setRegisterResult("Passkey secured. XO channel unlocked.")
      window.location.reload()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to register passkey.")
    } finally {
      setPasskeyLoading(false)
    }
  }

  const handleSend = async (event: FormEvent) => {
    event.preventDefault()
    if (!input.trim() || chatLoading) {
      return
    }

    setErrorMessage(null)
    const prompt = input.trim()
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

    if (!unlocked) {
      pushAssistantMessage(buildPasskeySoftGateReply())
      setErrorMessage(PASSKEY_SOFT_GATE_ERROR)
      return
    }

    setChatLoading(true)

    try {
      const response = await fetch("/api/landing/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          history,
        }),
      })
      const payload = (await response.json().catch(() => ({}))) as ChatResponse
      if (!response.ok) {
        const errorText = payload.error || "XO channel is currently unavailable."
        pushAssistantMessage(`XO: ${errorText}`)
        setErrorMessage(errorText)
        return
      }

      pushAssistantMessage(payload.reply || "XO: No update available.")
      handleAction(payload.action)
    } catch {
      const fallbackError = "Network link unstable. Try again."
      pushAssistantMessage(`XO: ${fallbackError}`)
      setErrorMessage(fallbackError)
    } finally {
      setChatLoading(false)
    }
  }

  const handleRegister = async (event: FormEvent) => {
    event.preventDefault()
    if (registerLoading) {
      return
    }

    setRegisterLoading(true)
    setRegisterResult(null)
    setErrorMessage(null)
    try {
      const response = await fetch("/api/landing/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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

      if (payload.newsletter?.status === "requires_email") {
        setRegisterResult("Passkey registration complete. Add an email to enable newsletter delivery.")
      } else {
        setRegisterResult("Registration complete. XO profile updated.")
      }
    } catch {
      setErrorMessage("Unable to complete registration right now.")
    } finally {
      setRegisterLoading(false)
    }
  }

  const handleNewsletter = async (event: FormEvent) => {
    event.preventDefault()
    if (!newsletterEmail.trim() || newsletterLoading) {
      return
    }
    setNewsletterLoading(true)
    setNewsletterResult(null)
    setErrorMessage(null)
    try {
      const response = await fetch("/api/landing/newsletter", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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
      setNewsletterResult(`Subscribed ${payload.email || newsletterEmail.trim()} to XO briefings.`)
    } catch {
      setErrorMessage("Unable to subscribe right now.")
    } finally {
      setNewsletterLoading(false)
    }
  }

  if (configLoading) {
    return (
      <section id="xo-bridge" className="px-6 md:px-12 pb-24">
        <div className="max-w-6xl mx-auto">
          <div className="xo-teaser-dark xo-closed-card">
            <div>
              <p className="xo-readout">XO Window</p>
              <h2 className="xo-closed-title">Tactical teaser mode</h2>
              <p className="xo-closed-copy">XO bridge channel is syncing before tactical controls can be opened.</p>
            </div>
            <button type="button" className="xo-open-btn" disabled>
              Syncing...
            </button>
          </div>
        </div>
      </section>
    )
  }

  if (!featureEnabled) {
    return (
      <section id="xo-bridge" className="px-6 md:px-12 pb-24">
        <div className="max-w-6xl mx-auto">
          <div className="xo-teaser-dark xo-feature-off">
            <p className="xo-readout">XO unavailable</p>
            <h2 className="xo-closed-title">Landing XO is disabled on this deployment</h2>
            <p className="xo-closed-copy">Chat and unlock controls are intentionally off. Public docs remain available.</p>
            <Link href="/docs" className="xo-open-btn">
              Open docs
            </Link>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section id="xo-bridge" className="px-6 md:px-12 pb-24">
      <div className="max-w-6xl mx-auto">
        <div className="xo-teaser-dark">
          {!isOpen ? (
            <div className="xo-closed-card">
              <div>
                <p className="xo-readout">XO Window</p>
                <h2 className="xo-closed-title">Tactical teaser mode</h2>
                <p className="xo-closed-copy">
                  XO bridge is standing by. Open the deck to run slash commands, registration, and newsletter routing.
                </p>
              </div>
              <button type="button" onClick={() => setIsOpen(true)} className="xo-open-btn" aria-expanded="false">
                Open XO
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="xo-open-shell animate-slide-in">
              <div className="xo-layout">
                <div className="xo-panel xo-chat-panel">
                  <div className="xo-panel-header">
                    <div className="xo-panel-title-wrap">
                      <div className="xo-panel-title">
                        <MessageSquareText className="w-4 h-4" />
                        XO Window
                      </div>
                      <span className="xo-readout">tease-mode</span>
                    </div>
                    <button type="button" onClick={() => setIsOpen(false)} className="xo-close-btn" aria-expanded="true">
                      Close
                      <ChevronUp className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="xo-chat-log card-scroll">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`xo-msg ${message.role === "assistant" ? "xo-msg-assistant" : "xo-msg-user"}`}
                      >
                        {message.content}
                      </div>
                    ))}
                    {chatLoading && <div className="xo-msg xo-msg-assistant">XO is composing...</div>}
                  </div>

                  <form onSubmit={handleSend} className="xo-input-shell">
                    <div className="xo-input-row">
                      <input
                        type="text"
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        placeholder="Send XO a tactical prompt or slash command..."
                        disabled={chatLoading}
                        className="xo-input"
                      />
                      <button
                        type="submit"
                        disabled={!input.trim() || chatLoading}
                        className="xo-send-btn"
                        aria-label="Send"
                      >
                        <SendHorizontal className="w-4 h-4" />
                      </button>
                    </div>

                    {!unlocked && (
                      <div className="xo-softgate">
                        <span className="xo-softgate-copy">Passkey lock active. Live XO dispatch requires unlock.</span>
                        <button
                          type="button"
                          onClick={handleSignInPasskey}
                          disabled={passkeyLoading}
                          className="xo-softgate-btn"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          Sign in with passkey
                        </button>
                        <button
                          type="button"
                          onClick={handleCreateGuestPasskey}
                          disabled={passkeyLoading}
                          className="xo-softgate-btn xo-softgate-btn-secondary"
                        >
                          <UserRound className="w-3.5 h-3.5" />
                          Create guest passkey
                        </button>
                      </div>
                    )}
                  </form>
                </div>

                <aside className="xo-panel xo-side-panel">
                  <div>
                    <h3 className="xo-side-title">Command deck</h3>
                    <div className="xo-chip-wrap">
                      {["/help", "/go start", "/docs cloud", "/newsletter", "/register"].map((command) => (
                        <button key={command} type="button" onClick={() => setInput(command)} className="xo-chip">
                          {command}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="xo-side-section">
                    <div className="xo-side-row">
                      <h3 className="xo-side-title">Registration</h3>
                      <button
                        type="button"
                        onClick={() => setShowRegisterPanel((current) => !current)}
                        className="xo-link-btn"
                      >
                        {showRegisterPanel ? "Hide" : "Open"}
                      </button>
                    </div>
                    {showRegisterPanel && (
                      <form onSubmit={handleRegister} className="xo-side-form">
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
                          Opt into XO newsletter
                        </label>
                        <button type="submit" disabled={!unlocked || registerLoading} className="xo-submit-btn xo-submit-btn-violet">
                          {registerLoading ? "Saving..." : "Save registration"}
                        </button>
                      </form>
                    )}
                  </div>

                  <div className="xo-side-section">
                    <div className="xo-side-row">
                      <h3 className="xo-side-title">Newsletter</h3>
                      <button
                        type="button"
                        onClick={() => setShowNewsletterPanel((current) => !current)}
                        className="xo-link-btn"
                      >
                        {showNewsletterPanel ? "Hide" : "Open"}
                      </button>
                    </div>
                    {showNewsletterPanel && (
                      <form onSubmit={handleNewsletter} className="xo-side-form">
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
                      </form>
                    )}
                  </div>

                  <p className="xo-inline-note">
                    Need full references? Open{" "}
                    <Link href="/docs" className="xo-inline-link">
                      /docs
                    </Link>
                    .
                  </p>
                </aside>
              </div>
            </div>
          )}
        </div>

        {(errorMessage || registerResult || newsletterResult) && (
          <div className="mt-4 space-y-2">
            {errorMessage && <p className="xo-feedback xo-feedback-error">{errorMessage}</p>}
            {registerResult && <p className="xo-feedback xo-feedback-success">{registerResult}</p>}
            {newsletterResult && <p className="xo-feedback xo-feedback-success">{newsletterResult}</p>}
          </div>
        )}
      </div>
    </section>
  )
}
