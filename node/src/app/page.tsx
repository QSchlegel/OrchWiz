"use client"

import { WandSparkles, Rocket, Network, Server, Cpu, Package } from "lucide-react"
import { OrchestrationSurface, OrchestrationCard } from "@/components/orchestration/OrchestrationSurface"
import Link from "next/link"
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard"

export default function Home() {
  return (
    <main className="min-h-screen gradient-orb perspective relative overflow-hidden">
      {/* Background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-pink-500/20 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse delay-2000" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col items-center p-8 md:p-24">
        {/* Hero Section */}
        <div className="w-full max-w-6xl mb-12 mt-8">
          <OrchestrationSurface level={5} className="text-center">
            <div className="flex flex-col items-center gap-6">
              <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20">
                <WandSparkles className="w-16 h-16 text-purple-400" strokeWidth={1.5} />
              </div>
              <div>
                <h1 className="text-6xl md:text-7xl font-bold mb-4 bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
                  OrchWiz
                </h1>
                <p className="text-2xl md:text-3xl text-gray-700 dark:text-gray-300 mb-4">
                  Orchestration Wizard
                </p>
                <p className="text-base md:text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                  Spin up orchestration sessions fast with passkeys or magic links, then deploy agents
                  across your nodes in minutes.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-medium hover:from-purple-700 hover:to-pink-700 transition-all"
                >
                  Sign up with passkey or magic link
                </Link>
                <a
                  href="#onboarding"
                  className="inline-flex items-center justify-center px-6 py-3 rounded-xl border border-white/20 bg-white/10 text-gray-900 dark:text-white hover:bg-white/20 transition-all"
                >
                  Take the tour
                </a>
              </div>
            </div>
          </OrchestrationSurface>
        </div>

        <div className="w-full max-w-6xl mb-16">
          <OnboardingWizard />
        </div>

        <div className="w-full max-w-6xl">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
                Capabilities
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                Everything you need to orchestrate sessions, commands, and deployments at scale.
              </p>
            </div>
            <Link
              href="/login"
              className="inline-flex items-center justify-center px-5 py-2 rounded-lg border border-white/20 bg-white/10 text-gray-900 dark:text-white hover:bg-white/20 transition-all"
            >
              Explore the dashboard
            </Link>
          </div>

          {/* Orchestration Surfaces Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <OrchestrationCard
              title="Agent Deployment"
              description="Deploy agents to local or cloud nodes"
              icon={<Rocket className="w-6 h-6 text-purple-400" />}
              level={3}
            />
            <OrchestrationCard
              title="Application Deployment"
              description="Deploy applications and services to nodes"
              icon={<Package className="w-6 h-6 text-blue-400" />}
              level={4}
            />
            <OrchestrationCard
              title="Node Management"
              description="Visualize and manage distributed nodes"
              icon={<Network className="w-6 h-6 text-pink-400" />}
              level={3}
            />
            <OrchestrationCard
              title="Session Control"
              description="Orchestrate AI coding sessions"
              icon={<WandSparkles className="w-6 h-6 text-cyan-400" />}
              level={2}
            />
            <OrchestrationCard
              title="Data Flow"
              description="Monitor and forward data streams"
              icon={<Server className="w-6 h-6 text-purple-400" />}
              level={3}
            />
            <OrchestrationCard
              title="Command Execution"
              description="Execute and track commands"
              icon={<Cpu className="w-6 h-6 text-pink-400" />}
              level={2}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
