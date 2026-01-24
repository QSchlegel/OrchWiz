"use client"

import { WandSparkles, Rocket, Network, Server, Cpu, Cloud, HardDrive, Package } from "lucide-react"
import { OrchestrationSurface, OrchestrationCard } from "@/components/orchestration/OrchestrationSurface"

export default function Home() {
  return (
    <main className="min-h-screen gradient-orb perspective relative overflow-hidden">
      {/* Background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-pink-500/20 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse delay-2000" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center p-8 md:p-24">
        {/* Hero Section */}
        <div className="w-full max-w-6xl mb-16">
          <OrchestrationSurface level={5} className="text-center">
            <div className="flex flex-col items-center gap-6">
              <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20">
                <WandSparkles className="w-16 h-16 text-purple-400" strokeWidth={1.5} />
              </div>
              <div>
                <h1 className="text-6xl md:text-7xl font-bold mb-4 bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
                  OrchWiz
                </h1>
                <p className="text-2xl md:text-3xl text-gray-700 dark:text-gray-300">
                  Orchestration Wizard
                </p>
              </div>
            </div>
          </OrchestrationSurface>
        </div>

        {/* Orchestration Surfaces Grid */}
        <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
    </main>
  );
}
