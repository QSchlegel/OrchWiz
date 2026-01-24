"use client"

import { signIn } from "@/lib/auth-client"
import { useState } from "react"
import { WandSparkles } from "lucide-react"

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false)

  const handleGitHubLogin = async () => {
    setIsLoading(true)
    try {
      await signIn.social({
        provider: "github",
        callbackURL: "/sessions",
      })
    } catch (error) {
      console.error("Login error:", error)
    } finally {
      setIsLoading(false)
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
          <p className="text-lg text-gray-600 dark:text-gray-400">Orchestration Wizard</p>
        </div>
        
        <div className="glass dark:glass-dark stack-3 p-8 rounded-2xl">
          <h2 className="text-2xl font-semibold mb-6 text-center">Sign In</h2>
          <button
            onClick={handleGitHubLogin}
            disabled={isLoading}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-medium py-3 px-4 rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed stack-2 transform hover:scale-105"
          >
            {isLoading ? "Signing in..." : "Sign in with GitHub"}
          </button>
        </div>
      </div>
    </main>
  )
}
