import type { ElementType } from "react"
import { notificationChannelsForSidebarHref } from "@/lib/notifications/channels"
import type { NotificationChannel } from "@/lib/types/notifications"
import {
  Crosshair,
  Rocket,
  Radio,
  ScanSearch,
  Globe,
  MonitorDot,
  ListChecks,
  Zap,
  Bot,
  Container,
  AppWindow,
  Network,
  Ship,
  ShieldCheck,
  Webhook,
  BadgeCheck,
  BookOpen,
  FolderKanban,
  Database,
  Video,
  Gauge,
  Wrench,
  Settings2,
} from "lucide-react"
// Github is imported from lucide-react as "Github"
import { Github } from "lucide-react"

export interface NavItem {
  href: string
  label: string
  icon: ElementType
  channels: NotificationChannel[]
}

export interface NavGroup {
  key: string
  label: string
  icon: ElementType
  items: NavItem[]
}

function navItem(href: string, label: string, icon: ElementType): NavItem {
  return {
    href,
    label,
    icon,
    channels: notificationChannelsForSidebarHref(href),
  }
}

export const sidebarNav: NavGroup[] = [
  {
    key: "mission-control",
    label: "Mission Control",
    icon: Crosshair,
    items: [
      navItem("/sessions", "Sessions", MonitorDot),
      navItem("/tasks", "Tasks", ListChecks),
      navItem("/actions", "Actions", Zap),
    ],
  },
  {
    key: "fleet",
    label: "Fleet",
    icon: Rocket,
    items: [
      navItem("/ship-yard", "Ship Yard", Ship),
      navItem("/ships", "Ships", Container),
      navItem("/applications", "Applications", AppWindow),
    ],
  },
  {
    key: "personal",
    label: "Personal",
    icon: Bot,
    items: [
      navItem("/personal", "Agents", Bot),
      navItem("/personal/tools", "Tools", Wrench),
      navItem("/skills", "Skills", ShieldCheck),
    ],
  },
  {
    key: "bridge-ops",
    label: "Bridge Ops",
    icon: Radio,
    items: [
      navItem("/bridge", "Bridge", Network),
      navItem("/bridge-call", "Bridge Call", Video),
      navItem("/bridge-chat", "Bridge Chat", Radio),
      navItem("/bridge-connections", "Connections", Webhook),
      navItem("/uss-k8s", "USS-K8S", Ship),
      navItem("/vault", "Vault", Database),
    ],
  },
  {
    key: "intel",
    label: "Ready Room",
    icon: ScanSearch,
    items: [
      navItem("/performance", "Performance", Gauge),
      navItem("/verification", "Verification", BadgeCheck),
      navItem("/security", "Security", ShieldCheck),
      navItem("/settings", "Settings", Settings2),
      navItem("/hooks", "Hooks", Webhook),
      navItem("/github/prs", "GitHub PRs", Github),
      navItem("/docs/claude", "Docs", BookOpen),
    ],
  },
  {
    key: "community",
    label: "Community",
    icon: Globe,
    items: [
      navItem("/projects", "Projects", FolderKanban),
    ],
  },
]

export const allNavItems: NavItem[] = sidebarNav.flatMap((g) => g.items)

export function matchesPath(pathname: string | null, href: string): boolean {
  if (!pathname) return false
  if (href === "/sessions") {
    return pathname === "/sessions" || pathname.startsWith("/sessions/")
  }
  if (href === "/personal") {
    return pathname === "/personal"
  }
  if (href === "/projects") {
    return pathname === "/projects" || pathname.startsWith("/projects/")
  }
  return pathname === href || pathname.startsWith(`${href}/`)
}
