"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Apple,
  Download,
  ExternalLink,
  Monitor,
  Terminal,
} from "lucide-react"
import { detectDesktopOS, type DesktopOS } from "@/lib/platform/os-detect"

type DownloadOption = {
  key: Exclude<DesktopOS, "unknown">
  label: string
  href: string
  Icon: typeof Apple
  sublabel: string
}

const DOWNLOAD_OPTIONS: DownloadOption[] = [
  { key: "mac", label: "macOS", href: "/downloads/orchwiz-mac.dmg", Icon: Apple, sublabel: "DMG installer" },
  { key: "windows", label: "Windows", href: "/downloads/orchwiz-win.exe", Icon: Monitor, sublabel: "EXE installer" },
  { key: "linux", label: "Linux", href: "/downloads/orchwiz-linux.tar.gz", Icon: Terminal, sublabel: "tar.gz bundle" },
]

const RELEASES_LATEST_URL = "https://github.com/QSchlegel/OrchWiz/releases/latest"

function titleForDetectedOS(os: DesktopOS): string {
  switch (os) {
    case "mac":
      return "Download for macOS"
    case "windows":
      return "Download for Windows"
    case "linux":
      return "Download for Linux"
    default:
      return "Download the Desktop App"
  }
}

function primaryOptionForOS(os: DesktopOS): DownloadOption | null {
  if (os === "unknown") return null
  return DOWNLOAD_OPTIONS.find((opt) => opt.key === os) ?? null
}

export function DownloadSection() {
  const [detectedOS, setDetectedOS] = useState<DesktopOS>("unknown")

  useEffect(() => {
    const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : ""
    const platform = typeof navigator !== "undefined" ? (navigator.platform || "") : ""
    setDetectedOS(detectDesktopOS({ userAgent, platform }))
  }, [])

  const primary = useMemo(() => primaryOptionForOS(detectedOS), [detectedOS])
  const primaryTitle = titleForDetectedOS(detectedOS)
  const primaryHref = primary?.href || RELEASES_LATEST_URL
  const primaryTarget = primary ? undefined : "_blank"
  const primaryRel = primary ? undefined : "noreferrer"

  return (
    <section id="download" className="px-6 md:px-12 pb-24">
      <div className="max-w-6xl mx-auto">
        <div className="mb-10 animate-fade-up">
          <p
            className="text-xs tracking-widest uppercase text-emerald-600 dark:text-emerald-400 mb-3"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Launch Bay
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tight">
            Bring OrchWiz to your desktop
          </h2>
          <p className="text-slate-600 dark:text-gray-500 mt-3 max-w-3xl">
            The desktop build runs OrchWiz locally and opens the command deck in a dedicated app window.
            <span className="block mt-2 text-sm text-slate-500 dark:text-gray-500">
              Requires Docker Desktop / Docker Engine to run OrchWiz locally.
            </span>
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.15fr,0.85fr] gap-4">
          <div className="glass rounded-2xl p-6 md:p-8 animate-fade-up">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p
                  className="text-xs tracking-widest uppercase text-violet-600 dark:text-violet-400 mb-2"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  Desktop installer
                </p>
                <h3 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                  {primaryTitle}
                </h3>
                <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 max-w-xl">
                  {primary
                    ? `Detected: ${primary.label}. Use the primary link below, or choose a different build if you’re downloading for another machine.`
                    : "Choose your OS below. If detection fails (privacy tools / unusual browsers), the links still work."}
                </p>
              </div>
              <div className="hidden md:flex flex-col items-end gap-2">
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-300/80 dark:border-white/10 bg-white/70 dark:bg-white/[0.04] text-xs text-slate-700 dark:text-gray-300">
                  <Download className="w-4 h-4" />
                  Stable /downloads aliases
                </span>
                <a
                  href={RELEASES_LATEST_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-xs text-slate-500 dark:text-gray-500 hover:text-slate-700 dark:hover:text-gray-300 transition-colors"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  View all releases
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row items-center gap-3">
              <a
                href={primaryHref}
                target={primaryTarget}
                rel={primaryRel}
                className="group w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 text-white font-semibold text-sm tracking-wide hover:from-emerald-500 hover:to-cyan-500 transition-all duration-300 shadow-lg shadow-emerald-900/20"
              >
                <Download className="w-4 h-4" />
                {primary ? `Download for ${primary.label}` : "View desktop downloads"}
              </a>
              <Link
                href="/docs"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl border border-slate-300/80 dark:border-white/10 bg-white/80 dark:bg-white/[0.03] text-slate-700 dark:text-gray-300 font-medium text-sm tracking-wide hover:bg-white dark:hover:bg-white/[0.06] hover:border-slate-400/70 dark:hover:border-white/20 transition-all duration-300 shadow-sm shadow-slate-900/5 dark:shadow-none"
              >
                Quick brief
              </Link>
              <a
                href={RELEASES_LATEST_URL}
                target="_blank"
                rel="noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl border border-slate-300/80 dark:border-white/10 bg-white/80 dark:bg-white/[0.03] text-slate-700 dark:text-gray-300 font-medium text-sm tracking-wide hover:bg-white dark:hover:bg-white/[0.06] hover:border-slate-400/70 dark:hover:border-white/20 transition-all duration-300 shadow-sm shadow-slate-900/5 dark:shadow-none md:hidden"
              >
                View releases
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {DOWNLOAD_OPTIONS.map((opt) => {
                const isPrimary = primary?.key === opt.key
                return (
                  <a
                    key={opt.key}
                    href={opt.href}
                    className={`group rounded-2xl border p-4 transition-all duration-300 ${
                      isPrimary
                        ? "border-emerald-300/70 dark:border-emerald-300/30 bg-emerald-500/10 dark:bg-emerald-500/10"
                        : "border-slate-300/80 dark:border-white/10 bg-white/70 dark:bg-white/[0.04] hover:bg-white dark:hover:bg-white/[0.06]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span
                          className={`inline-flex p-2 rounded-xl ${
                            isPrimary
                              ? "bg-emerald-500/15"
                              : "bg-slate-900/[0.03] dark:bg-white/[0.06]"
                          }`}
                        >
                          <opt.Icon
                            className={`w-5 h-5 ${
                              isPrimary ? "text-emerald-700 dark:text-emerald-200" : "text-slate-700 dark:text-slate-200"
                            }`}
                            strokeWidth={1.6}
                          />
                        </span>
                        <div>
                          <div className="text-sm font-semibold text-slate-900 dark:text-white">
                            {opt.label}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-gray-500" style={{ fontFamily: "var(--font-mono)" }}>
                            {opt.sublabel}
                          </div>
                        </div>
                      </div>
                      <span className="text-xs text-slate-500 dark:text-gray-500 group-hover:text-slate-700 dark:group-hover:text-gray-300 transition-colors">
                        {isPrimary ? "Primary" : "Download"}
                      </span>
                    </div>
                  </a>
                )
              })}
            </div>

            <p className="mt-5 text-xs text-slate-500 dark:text-gray-500" style={{ fontFamily: "var(--font-mono)" }}>
              Tip: `/downloads/manifest.json` contains SHA-256 checksums for the latest mirrored artifacts.
            </p>
          </div>

          <div className="glass rounded-2xl p-6 md:p-8 animate-fade-up" style={{ animationDelay: "0.1s" }}>
            <p
              className="text-xs tracking-widest uppercase text-cyan-600 dark:text-cyan-300 mb-3"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              What you’re installing
            </p>
            <h3 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mb-3">
              Local-first command deck
            </h3>
            <ul className="space-y-3 text-sm text-slate-700 dark:text-slate-200">
              <li className="rounded-xl border border-slate-300/80 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]">
                Runs the OrchWiz server locally and opens the UI in a dedicated window.
              </li>
              <li className="rounded-xl border border-slate-300/80 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]">
                Uses Docker-managed Postgres for a consistent local runtime baseline.
              </li>
              <li className="rounded-xl border border-slate-300/80 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]">
                Desktop v1 ships without extra sidecars by default (wallet-enclave, trace encryption, agent-lightning).
              </li>
            </ul>

            <div className="mt-6 flex flex-col gap-3">
              <a
                href={RELEASES_LATEST_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-between rounded-xl border border-slate-300/80 bg-white/70 px-4 py-3 text-sm text-slate-700 hover:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.06] transition-all"
              >
                <span>Release notes + version history</span>
                <ExternalLink className="w-4 h-4 text-slate-500" />
              </a>
              <a
                href="/downloads/manifest.json"
                className="inline-flex items-center justify-between rounded-xl border border-slate-300/80 bg-white/70 px-4 py-3 text-sm text-slate-700 hover:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.06] transition-all"
              >
                <span>Checksums manifest (JSON)</span>
                <Download className="w-4 h-4 text-slate-500" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
