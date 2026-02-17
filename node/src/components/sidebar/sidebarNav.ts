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
  FolderKanban,
  Gauge,
  Eye,
  Wrench,
  KeyRound,
  Landmark,
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
      navItem("/mission-control", "Overview", Crosshair),
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
      navItem("/uss-k8s", "USS-K8S", Ship),
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
      navItem("/wallet-enclave", "Wallet Enclave", KeyRound),
      navItem("/treasury", "Treasury", Landmark),
      navItem("/settings", "Settings", Settings2),
      navItem("/hooks", "Hooks", Webhook),
      navItem("/github/prs", "GitHub PRs", Github),
    ],
  },
  {
    key: "community",
    label: "Community",
    icon: Globe,
    items: [
      navItem("/projects", "Projects", FolderKanban),
      navItem("/views", "Views", Eye),
    ],
  },
]

export const allNavItems: NavItem[] = sidebarNav.flatMap((g) => g.items)

export function matchesPath(pathname: string | null, href: string): boolean {
  if (!pathname) return false
  if (href === "/mission-control") {
    return pathname === "/mission-control"
  }
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
