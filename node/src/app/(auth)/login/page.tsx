"use client"

import { authClient, signIn, signUp } from "@/lib/auth-client"
import {
  generateBootstrapPassword,
  generateDisplayName,
  getPasskeySignInErrorMessage,
} from "@/lib/auth-utils"
import { KeyRound, Mail, Sparkles, UserRound } from "lucide-react"
import { FormEvent, useState } from "react"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isPasskeySignInLoading, setIsPasskeySignInLoading] = useState(false)
  const [isPasskeySetupLoading, setIsPasskeySetupLoading] = useState(false)
  const [isMagicLinkLoading, setIsMagicLinkLoading] = useState(false)

  const normalizedEmail = email.trim().toLowerCase()
  const normalizedName = displayName.trim()
  const hasEmail = normalizedEmail.length > 0

  const clearNotices = () => {
    setErrorMessage(null)
    setSuccessMessage(null)
  }

  const handleEmailChange = (value: string) => {
    setEmail(value)
    if (!displayName || displayName === generateDisplayName(email)) {
      setDisplayName(value.trim() ? generateDisplayName(value) : "")
    }
  }

  const handlePasskeySignIn = async () => {
    setIsPasskeySignInLoading(true)
    clearNotices()
    try {
      const result = await signIn.passkey()
      if (result.error) {
        setErrorMessage(getPasskeySignInErrorMessage(result.error))
        return
      }
      window.location.href = "/sessions"
    } catch (error) {
      console.error("Passkey sign-in error:", error)
      const message = error instanceof Error ? error.message : "Unknown passkey sign-in error"
      setErrorMessage(getPasskeySignInErrorMessage({ message }))
    } finally {
      setIsPasskeySignInLoading(false)
    }
  }

  const handlePasskeySetup = async (event: FormEvent) => {
    event.preventDefault()
    if (!normalizedEmail) {
      setErrorMessage("Enter your email to create an account with passkey.")
      return
    }
    if (!normalizedName) {
      setErrorMessage("Enter a display name to continue.")
      return
    }

    setIsPasskeySetupLoading(true)
    clearNotices()
    try {
      const signUpResult = await signUp.email({
        email: normalizedEmail,
        name: normalizedName,
        password: generateBootstrapPassword(),
      })

      if (signUpResult?.error) {
        const msg = signUpResult.error.message || "Unable to create your account right now."
        if (msg.toLowerCase().includes("already exists")) {
          setErrorMessage("That email already has an account. Use passkey sign-in or request a magic link.")
        } else {
          setErrorMessage(msg)
        }
        return
      }

      const { error } = await authClient.passkey.addPasskey({
        name: `${normalizedEmail} Passkey`,
      })
      if (error) {
        setErrorMessage("Account created, but passkey registration failed. Try again or use a magic link.")
        return
      }

      window.location.href = "/sessions"
    } catch (error) {
      console.error("Passkey setup error:", error)
      const msg =
        error && typeof error === "object" && "message" in error ? String(error.message) : ""
      if (msg.toLowerCase().includes("already exists")) {
        setErrorMessage("That email already has an account. Use passkey sign-in or request a magic link.")
      } else {
        setErrorMessage("Unable to register your passkey right now. Try again or use a magic link.")
      }
    } finally {
      setIsPasskeySetupLoading(false)
    }
  }

  const handleMagicLink = async () => {
    if (!normalizedEmail) {
      setErrorMessage("Enter your email to receive a magic link.")
      return
    }
    if (!normalizedName) {
      setErrorMessage("Enter a display name to continue.")
      return
    }

    setIsMagicLinkLoading(true)
    clearNotices()
    try {
      await signIn.magicLink({
        email: normalizedEmail,
        name: normalizedName,
        callbackURL: "/sessions",
        newUserCallbackURL: "/sessions",
      })
      setSuccessMessage("Check your email for a sign-in link.")
    } catch (error) {
      console.error("Magic link error:", error)
      setErrorMessage("Unable to send the email right now. Please try again.")
    } finally {
      setIsMagicLinkLoading(false)
    }
  }

  const anyLoading = isPasskeySignInLoading || isPasskeySetupLoading || isMagicLinkLoading

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight mb-1">
        Sign in
      </h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">
        Use a passkey for instant access, or enter your email.
      </p>

      {/* Passkey sign-in for returning users */}
      <button
        type="button"
        onClick={handlePasskeySignIn}
        disabled={anyLoading}
        className="w-full flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-left transition-colors hover:border-violet-300 hover:bg-violet-50/50 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-violet-500/30 dark:hover:bg-violet-500/[0.06]"
      >
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-violet-100 dark:bg-violet-500/15">
          <KeyRound className="w-4 h-4 text-violet-600 dark:text-violet-400" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900 dark:text-white">
            {isPasskeySignInLoading ? "Waiting for passkey..." : "Sign in with passkey"}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Returning users — no email needed</p>
        </div>
      </button>

      {/* Divider */}
      <div className="flex items-center gap-3 my-6">
        <div className="flex-1 h-px bg-slate-200 dark:bg-white/10" />
        <span className="text-xs text-slate-400 dark:text-slate-500">or use email</span>
        <div className="flex-1 h-px bg-slate-200 dark:bg-white/10" />
      </div>

      {/* Email form */}
      <form onSubmit={handlePasskeySetup} className="space-y-3">
        <div>
          <label htmlFor="auth-email" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
            Email
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => handleEmailChange(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email webauthn"
              className="w-full rounded-lg border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 dark:border-white/10 dark:bg-white/[0.03] dark:text-white dark:placeholder:text-slate-500 dark:focus:ring-violet-500/20 dark:focus:border-violet-500/40"
            />
          </div>
        </div>

        {/* Display name — appears when email is entered */}
        {hasEmail && (
          <div className="auth-field-reveal">
            <label htmlFor="auth-name" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              Display name
            </label>
            <div className="relative">
              <UserRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                id="auth-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                className="w-full rounded-lg border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 dark:border-white/10 dark:bg-white/[0.03] dark:text-white dark:placeholder:text-slate-500 dark:focus:ring-violet-500/20 dark:focus:border-violet-500/40"
              />
            </div>
          </div>
        )}

        {/* Action buttons — appear when email is entered */}
        {hasEmail && (
          <div className="space-y-2 pt-1 auth-field-reveal">
            <button
              type="submit"
              disabled={anyLoading || !normalizedName}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-50 dark:bg-violet-600 dark:hover:bg-violet-500"
            >
              <KeyRound className="w-3.5 h-3.5" />
              {isPasskeySetupLoading ? "Creating account..." : "Create account with passkey"}
            </button>

            <button
              type="button"
              onClick={handleMagicLink}
              disabled={anyLoading || !normalizedName}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300 dark:hover:bg-white/[0.06]"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {isMagicLinkLoading ? "Sending link..." : "Send magic link instead"}
            </button>
          </div>
        )}
      </form>

      {/* Notices */}
      {errorMessage && (
        <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
          {errorMessage}
        </div>
      )}
      {successMessage && (
        <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
          {successMessage}
        </div>
      )}
    </div>
  )
}
