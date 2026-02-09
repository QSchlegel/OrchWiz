"use client"

import { OrchestrationSurface } from "@/components/orchestration/OrchestrationSurface"

function SkeletonBar({ className = "" }: { className?: string }) {
  return <div className={`skeleton-shimmer rounded-md ${className}`} />
}

function SkeletonRowCard() {
  return (
    <div className="relative overflow-hidden rounded-lg border border-slate-300/75 bg-white/75 px-4 py-2.5 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="absolute bottom-1.5 left-0 top-1.5 w-[3px] rounded-r-sm bg-slate-300/80 dark:bg-white/[0.2]" />
      <div className="flex items-center gap-3 pl-1">
        <SkeletonBar className="h-7 w-7 shrink-0 rounded-md" />
        <div className="flex-1 space-y-2">
          <SkeletonBar className="h-3 w-24" />
          <SkeletonBar className="h-2 w-16" />
        </div>
        <SkeletonBar className="h-2 w-2 shrink-0 rounded-full" />
      </div>
    </div>
  )
}

const floatingPanelClass =
  "rounded-xl border border-slate-300/75 bg-white/88 shadow-[0_10px_28px_rgba(15,23,42,0.18)] backdrop-blur-lg dark:border-white/12 dark:bg-slate-950/78"

export function LoadingSkeleton() {
  return (
    <main className="uss-k8s-page relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="uss-orb-cyan orb-breathe absolute -left-16 -top-24 h-80 w-80 rounded-full blur-[100px]" />
        <div className="uss-orb-violet orb-breathe-alt absolute -right-24 top-1/2 h-96 w-96 rounded-full blur-[120px]" />
        <div className="uss-orb-rose orb-breathe-slow absolute bottom-0 left-1/3 h-72 w-72 rounded-full blur-[80px]" />
      </div>

      <div className="pointer-events-none absolute inset-0 bridge-grid opacity-15" />
      <div className="pointer-events-none absolute inset-0 bridge-scanlines opacity-[0.1]" />
      <div className="pointer-events-none absolute inset-0 bridge-vignette" />

      <div className="relative z-10 px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <div className="mx-auto w-full max-w-[1760px]">
          <div className="hidden xl:block">
            <div className="relative h-[calc(100dvh-10.5rem)] min-h-[780px] max-h-[1000px]">
              <div className="absolute inset-0 overflow-hidden rounded-2xl border border-slate-300/70 bg-white/72 dark:border-white/12 dark:bg-slate-950/72">
                <div className="h-full w-full skeleton-shimmer" />
              </div>

              <div className="pointer-events-none absolute inset-0">
                <div className={`pointer-events-auto absolute left-4 right-[376px] top-4 p-4 ${floatingPanelClass}`}>
                  <SkeletonBar className="h-4 w-52" />
                  <div className="mt-3 space-y-2.5">
                    <SkeletonBar className="h-10 w-full" />
                    <SkeletonBar className="h-16 w-full" />
                  </div>
                </div>

                <div className={`pointer-events-auto absolute right-4 top-4 w-[360px] p-4 ${floatingPanelClass}`}>
                  <SkeletonBar className="h-4 w-28" />
                  <SkeletonBar className="mt-2 h-4 w-52" />
                  <div className="bridge-divider my-3" />
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <SkeletonBar key={index} className="h-8 w-full" />
                    ))}
                  </div>
                </div>

                <div className={`pointer-events-auto absolute bottom-4 left-4 top-[250px] w-[332px] p-4 ${floatingPanelClass}`}>
                  <SkeletonBar className="h-4 w-40" />
                  <div className="mt-3 h-[calc(100%-1.5rem)] space-y-2.5 overflow-hidden">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <SkeletonRowCard key={index} />
                    ))}
                  </div>
                </div>

                <div className={`pointer-events-auto absolute bottom-4 right-4 top-[250px] w-[360px] p-4 ${floatingPanelClass}`}>
                  <SkeletonBar className="h-4 w-44" />
                  <div className="mt-3 space-y-2.5">
                    <SkeletonBar className="h-28 w-full" />
                    <SkeletonBar className="h-5 w-36" />
                    <SkeletonBar className="h-20 w-full" />
                    <SkeletonBar className="h-16 w-full" />
                  </div>
                </div>

                <div className={`pointer-events-auto absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 ${floatingPanelClass}`}>
                  <SkeletonBar className="h-5 w-[460px]" />
                </div>
              </div>
            </div>
          </div>

          <div className="xl:hidden flex flex-col gap-4">
            <OrchestrationSurface
              level={4}
              className="border border-slate-300/60 bg-white/82 dark:border-white/12 dark:bg-white/[0.02]"
            >
              <div className="space-y-2.5">
                <SkeletonBar className="h-3 w-32" />
                <SkeletonBar className="h-7 w-80 max-w-full" />
                <SkeletonBar className="h-10 w-full" />
              </div>
            </OrchestrationSurface>

            <OrchestrationSurface
              level={4}
              className="border border-slate-300/60 bg-white/82 dark:border-white/12 dark:bg-white/[0.02]"
            >
              <SkeletonBar className="h-4 w-32" />
              <div className="mt-3 space-y-2.5">
                <SkeletonBar className="h-9 w-full" />
                <SkeletonBar className="h-16 w-full" />
                <div className="h-[clamp(380px,62vh,800px)] min-h-[380px] rounded-xl border border-slate-300/75 skeleton-shimmer dark:border-white/12" />
              </div>
            </OrchestrationSurface>

            <OrchestrationSurface
              level={4}
              className="border border-slate-300/60 bg-white/82 dark:border-white/12 dark:bg-white/[0.02]"
            >
              <SkeletonBar className="h-4 w-44" />
              <div className="mt-4 space-y-2.5">
                <SkeletonBar className="h-24 w-full" />
                <SkeletonBar className="h-20 w-full" />
              </div>
            </OrchestrationSurface>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <OrchestrationSurface
                level={3}
                className="border border-slate-300/60 bg-white/82 dark:border-white/12 dark:bg-white/[0.02]"
              >
                <SkeletonBar className="h-4 w-36" />
                <div className="mt-3 space-y-2.5">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <SkeletonRowCard key={index} />
                  ))}
                </div>
              </OrchestrationSurface>

              <OrchestrationSurface
                level={3}
                className="border border-slate-300/60 bg-white/82 dark:border-white/12 dark:bg-white/[0.02]"
              >
                <SkeletonBar className="h-4 w-36" />
                <div className="mt-3 space-y-2.5">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <SkeletonRowCard key={index} />
                  ))}
                </div>
              </OrchestrationSurface>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
