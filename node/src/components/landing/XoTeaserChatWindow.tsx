"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { KeyRound, MessageSquareText, SendHorizontal, UserRound } from "lucide-react"
import { authClient, signIn, useSession } from "@/lib/auth-client"

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

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
}

const starterMessage: ChatMessage = {
  id: "xo-start",
  role: "assistant",
  content:
    "XO online. Tactical teaser mode active. Use /help for commands or /docs passkey for guardrails.",
}

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

export function XoTeaserChatWindow() {
  const { data: session } = useSession()
  const [configLoading, setConfigLoading] = useState(true)
  const [featureEnabled, setFeatureEnabled] = useState(true)
  const [hasPasskey, setHasPasskey] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>([starterMessage])
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
      setShowRegisterPanel(true)
      return
    }

    if (action.type === "open_newsletter") {
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
    const nextUserMessage: ChatMessage = {
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
        <div className="max-w-6xl mx-auto glass rounded-2xl p-6 text-sm text-slate-600 dark:text-slate-300">
          XO bridge channel is syncing...
        </div>
      </section>
    )
  }

  if (!featureEnabled) {
    return (
      <section id="xo-bridge" className="px-6 md:px-12 pb-24">
        <div className="max-w-6xl mx-auto glass rounded-2xl p-6 md:p-8">
          <p className="text-xs tracking-widest uppercase text-amber-600 dark:text-amber-300 mb-3" style={{ fontFamily: "var(--font-mono)" }}>
            XO unavailable
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white mb-3">
            Landing XO is disabled on this deployment
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-5">
            Chat and unlock controls are intentionally off. Public docs remain available.
          </p>
          <Link
            href="/docs"
            className="inline-flex items-center rounded-lg border border-slate-300/80 bg-white/80 px-4 py-2 text-sm text-slate-700 hover:bg-white dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08]"
          >
            Open docs
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section id="xo-bridge" className="px-6 md:px-12 pb-24">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <p className="text-xs tracking-widest uppercase text-violet-600 dark:text-violet-300 mb-3" style={{ fontFamily: "var(--font-mono)" }}>
            XO bridge teaser
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tight">
            Run a lightweight bridge roleplay before full onboarding
          </h2>
          <p className="text-slate-600 dark:text-slate-300 mt-3 max-w-3xl">
            XO is intentionally constrained: short tactical hints, slash-command navigation, and docs pointers that tease the path without replacing it.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4">
          <div className="glass rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-300/70 px-4 py-3 dark:border-white/10">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-100">
                <MessageSquareText className="w-4 h-4 text-cyan-600 dark:text-cyan-300" />
                XO Window
              </div>
              <span className="text-[10px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400" style={{ fontFamily: "var(--font-mono)" }}>
                tease-mode
              </span>
            </div>

            {!unlocked && (
              <div className="border-b border-slate-300/70 px-4 py-4 bg-slate-900/[0.03] dark:border-white/10 dark:bg-white/[0.03]">
                <p className="text-sm text-slate-700 dark:text-slate-200 mb-3">
                  Passkey unlock is required before XO accepts chat.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleSignInPasskey}
                    disabled={passkeyLoading}
                    className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    Sign in with passkey
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateGuestPasskey}
                    disabled={passkeyLoading}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300/80 bg-white/80 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-white disabled:opacity-50 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08]"
                  >
                    <UserRound className="w-3.5 h-3.5" />
                    Create guest passkey
                  </button>
                </div>
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  Email is optional now. You can register email later in the side panel and keep using the same passkey.
                </p>
              </div>
            )}

            <div className="h-[340px] overflow-y-auto p-4 space-y-3 card-scroll">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`max-w-[90%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                    message.role === "assistant"
                      ? "bg-cyan-500/10 border border-cyan-500/20 text-slate-800 dark:text-slate-100"
                      : "ml-auto bg-violet-600 text-white"
                  }`}
                >
                  {message.content}
                </div>
              ))}
              {chatLoading && (
                <div className="max-w-[90%] rounded-xl px-3 py-2 text-sm bg-cyan-500/10 border border-cyan-500/20 text-slate-700 dark:text-slate-200">
                  XO is composing...
                </div>
              )}
            </div>

            <form onSubmit={handleSend} className="border-t border-slate-300/70 p-3 dark:border-white/10">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder={unlocked ? "Send XO a tactical prompt or slash command..." : "Unlock with passkey to chat"}
                  disabled={!unlocked || chatLoading}
                  className="flex-1 rounded-lg border border-slate-300/80 bg-white/80 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 disabled:opacity-50 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-100 dark:placeholder:text-slate-500"
                />
                <button
                  type="submit"
                  disabled={!unlocked || !input.trim() || chatLoading}
                  className="inline-flex items-center justify-center rounded-lg bg-cyan-600 px-3 py-2 text-white hover:bg-cyan-500 disabled:opacity-50"
                  aria-label="Send"
                >
                  <SendHorizontal className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>

          <aside className="glass rounded-2xl p-4 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Command deck</h3>
              <div className="flex flex-wrap gap-2">
                {["/help", "/go start", "/docs cloud", "/newsletter", "/register"].map((command) => (
                  <button
                    key={command}
                    type="button"
                    onClick={() => setInput(command)}
                    className="rounded-full border border-slate-300/80 bg-white/80 px-2.5 py-1 text-xs text-slate-700 hover:bg-white dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08]"
                  >
                    {command}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-300/70 pt-4 dark:border-white/10">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Registration</h3>
                <button
                  type="button"
                  onClick={() => setShowRegisterPanel((current) => !current)}
                  className="text-xs text-cyan-700 hover:underline dark:text-cyan-300"
                >
                  {showRegisterPanel ? "Hide" : "Open"}
                </button>
              </div>
              {showRegisterPanel && (
                <form onSubmit={handleRegister} className="space-y-2">
                  <input
                    type="email"
                    value={registerEmail}
                    onChange={(event) => setRegisterEmail(event.target.value)}
                    placeholder="Email (optional)"
                    className="w-full rounded-lg border border-slate-300/80 bg-white/80 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-100"
                  />
                  <input
                    type="text"
                    value={registerName}
                    onChange={(event) => setRegisterName(event.target.value)}
                    placeholder="Display name (optional)"
                    className="w-full rounded-lg border border-slate-300/80 bg-white/80 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-100"
                  />
                  <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={newsletterOptIn}
                      onChange={(event) => setNewsletterOptIn(event.target.checked)}
                      className="rounded border-slate-300"
                    />
                    Opt into XO newsletter
                  </label>
                  <button
                    type="submit"
                    disabled={!unlocked || registerLoading}
                    className="w-full rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
                  >
                    {registerLoading ? "Saving..." : "Save registration"}
                  </button>
                </form>
              )}
            </div>

            <div className="border-t border-slate-300/70 pt-4 dark:border-white/10">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Newsletter</h3>
                <button
                  type="button"
                  onClick={() => setShowNewsletterPanel((current) => !current)}
                  className="text-xs text-cyan-700 hover:underline dark:text-cyan-300"
                >
                  {showNewsletterPanel ? "Hide" : "Open"}
                </button>
              </div>
              {showNewsletterPanel && (
                <form onSubmit={handleNewsletter} className="space-y-2">
                  <input
                    type="email"
                    value={newsletterEmail}
                    onChange={(event) => setNewsletterEmail(event.target.value)}
                    placeholder="you@company.com"
                    className="w-full rounded-lg border border-slate-300/80 bg-white/80 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-100"
                  />
                  <button
                    type="submit"
                    disabled={!newsletterEmail.trim() || newsletterLoading}
                    className="w-full rounded-lg bg-cyan-600 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-500 disabled:opacity-50"
                  >
                    {newsletterLoading ? "Subscribing..." : "Subscribe"}
                  </button>
                </form>
              )}
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Need full references? Open{" "}
              <Link href="/docs" className="underline hover:text-slate-700 dark:hover:text-slate-200">
                /docs
              </Link>
              .
            </p>
          </aside>
        </div>

        {(errorMessage || registerResult || newsletterResult) && (
          <div className="mt-4 space-y-2">
            {errorMessage && (
              <p className="rounded-lg border border-red-300/70 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                {errorMessage}
              </p>
            )}
            {registerResult && (
              <p className="rounded-lg border border-emerald-300/70 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                {registerResult}
              </p>
            )}
            {newsletterResult && (
              <p className="rounded-lg border border-emerald-300/70 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                {newsletterResult}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
