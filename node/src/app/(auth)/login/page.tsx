"use client"

import { signIn } from "@/lib/auth-client"
import { useState } from "react"
import { Github, KeyRound, Mail, WandSparkles } from "lucide-react"

export default function LoginPage() {
  const githubEnabled = process.env.NEXT_PUBLIC_GITHUB_AUTH_ENABLED === "true"
  const [email, setEmail] = useState("")
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isGitHubLoading, setIsGitHubLoading] = useState(false)
  const [isMagicLinkLoading, setIsMagicLinkLoading] = useState(false)
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false)

  const handleGitHubLogin = async () => {
    setIsGitHubLoading(true)
    setErrorMessage(null)
    try {
      await signIn.social({
        provider: "github",
        callbackURL: "/sessions",
      })
    } catch (error) {
      console.error("Login error:", error)
      setErrorMessage("GitHub sign-in failed. Please try again.")
    } finally {
      setIsGitHubLoading(false)
    }
  }

  const handleMagicLink = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!email) return
    setIsMagicLinkLoading(true)
    setErrorMessage(null)
    setMagicLinkSent(false)

    try {
      await signIn.magicLink({
        email,
        callbackURL: "/sessions",
        newUserCallbackURL: "/sessions",
      })
      setMagicLinkSent(true)
    } catch (error) {
      console.error("Magic link error:", error)
      setErrorMessage("Unable to send magic link. Please try again.")
    } finally {
      setIsMagicLinkLoading(false)
    }
  }

  const handlePasskeyLogin = async () => {
    setIsPasskeyLoading(true)
    setErrorMessage(null)
    try {
      await signIn.passkey({
        fetchOptions: {
          onSuccess() {
            window.location.href = "/sessions"
          },
        },
      })
    } catch (error) {
      console.error("Passkey error:", error)
      setErrorMessage("Passkey sign-in failed. Please try again.")
    } finally {
      setIsPasskeyLoading(false)
    }
  }

  return (
    <main className="min-h-screen gradient-orb perspective relative overflow-hidden flex items-center justify-center p-8">
      {/* Background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-pink-500/20 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      <div className="relative z-10 max-w-md w-full">
        <div className="text-center mb-8">
          <div className="inline-flex p-4 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 mb-4">
            <WandSparkles className="w-12 h-12 text-purple-400" strokeWidth={1.5} />
          </div>
          <h1 className="text-5xl font-bold mb-2 bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
            OrchWiz
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Sign up or sign in to start orchestrating
          </p>
        </div>

        <div className="glass dark:glass-dark stack-3 p-8 rounded-2xl space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-semibold">Access OrchWiz</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              Use a passkey, magic link, or GitHub to continue.
            </p>
          </div>

          {errorMessage && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
              {errorMessage}
            </div>
          )}

          <button
            onClick={handlePasskeyLogin}
            disabled={isPasskeyLoading}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-medium py-3 px-4 rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed stack-2 transform hover:scale-105"
          >
            <KeyRound className="w-5 h-5" />
            {isPasskeyLoading ? "Waiting for passkey..." : "Sign in with passkey"}
          </button>

          <form onSubmit={handleMagicLink} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Work email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  autoComplete="email webauthn"
                  required
                  className="w-full pl-10 pr-4 py-3 rounded-lg border border-white/20 bg-white/70 dark:bg-black/20 focus:outline-none focus:ring-2 focus:ring-purple-400/50"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={isMagicLinkLoading}
              className="w-full flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-gray-900 dark:text-white font-medium py-3 px-4 rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed border border-white/20"
            >
              <Mail className="w-4 h-4" />
              {isMagicLinkLoading ? "Sending magic link..." : "Email me a magic link"}
            </button>
            {magicLinkSent && (
              <p className="text-sm text-emerald-500 text-center">
                Magic link sent. Check your inbox to continue.
              </p>
            )}
          </form>

          {githubEnabled && (
            <>
              <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                <div className="flex-1 h-px bg-white/20" />
                <span>or continue with</span>
                <div className="flex-1 h-px bg-white/20" />
              </div>
              <button
                onClick={handleGitHubLogin}
                disabled={isGitHubLoading}
                className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white font-medium py-3 px-4 rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-black"
              >
                <Github className="w-5 h-5" />
                {isGitHubLoading ? "Signing in..." : "Sign in with GitHub"}
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
