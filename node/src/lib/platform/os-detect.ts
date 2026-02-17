export type DesktopOS = "mac" | "windows" | "linux" | "unknown"

export function detectDesktopOS(args: { userAgent: string; platform?: string }): DesktopOS {
  const ua = args.userAgent || ""
  const platform = args.platform || ""
  const haystack = `${ua} ${platform}`.toLowerCase()

  if (haystack.includes("windows")) {
    return "windows"
  }

  if (haystack.includes("macintosh") || haystack.includes("mac os x") || haystack.includes("macos")) {
    return "mac"
  }

  // Android UAs include "Linux"; avoid mapping phones/tablets to the desktop Linux build.
  if (haystack.includes("linux") && !haystack.includes("android")) {
    return "linux"
  }

  return "unknown"
}

