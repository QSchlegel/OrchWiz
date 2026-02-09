import type { ElementType } from "react"
import {
  Crosshair,
  Rocket,
  Radio,
  Wrench,
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
  Terminal,
  ShieldCheck,
  Webhook,
  BadgeCheck,
  BookOpen,
  FolderKanban,
  Database,
} from "lucide-react"
// Github is imported from lucide-react as "Github"
import { Github } from "lucide-react"

export interface NavItem {
  href: string
  label: string
  icon: ElementType
}

export interface NavGroup {
  key: string
  label: string
  icon: ElementType
  items: NavItem[]
}

export const sidebarNav: NavGroup[] = [
  {
    key: "mission-control",
    label: "Mission Control",
    icon: Crosshair,
    items: [
      { href: "/sessions", label: "Sessions", icon: MonitorDot },
      { href: "/tasks", label: "Tasks", icon: ListChecks },
      { href: "/actions", label: "Actions", icon: Zap },
    ],
  },
  {
    key: "fleet",
    label: "Fleet",
    icon: Rocket,
    items: [
      { href: "/personal", label: "Personal", icon: Bot },
      { href: "/ship-yard", label: "Ship Yard", icon: Ship },
      { href: "/ships", label: "Ships", icon: Container },
      { href: "/applications", label: "Applications", icon: AppWindow },
    ],
  },
  {
    key: "bridge-ops",
    label: "Bridge Ops",
    icon: Radio,
    items: [
      { href: "/bridge", label: "Bridge", icon: Network },
      { href: "/bridge-chat", label: "Bridge Chat", icon: Radio },
      { href: "/uss-k8s", label: "USS-K8S", icon: Ship },
      { href: "/vault", label: "Vault", icon: Database },
    ],
  },
  {
    key: "arsenal",
    label: "Arsenal",
    icon: Wrench,
    items: [
      { href: "/commands", label: "Commands", icon: Terminal },
      { href: "/permissions", label: "Permissions", icon: ShieldCheck },
      { href: "/hooks", label: "Hooks", icon: Webhook },
    ],
  },
  {
    key: "intel",
    label: "Intel",
    icon: ScanSearch,
    items: [
      { href: "/verification", label: "Verification", icon: BadgeCheck },
      { href: "/github/prs", label: "GitHub PRs", icon: Github },
      { href: "/docs/claude", label: "Docs", icon: BookOpen },
    ],
  },
  {
    key: "community",
    label: "Community",
    icon: Globe,
    items: [
      { href: "/projects", label: "Projects", icon: FolderKanban },
    ],
  },
]

export const allNavItems: NavItem[] = sidebarNav.flatMap((g) => g.items)

export function matchesPath(pathname: string | null, href: string): boolean {
  if (!pathname) return false
  if (href === "/sessions") {
    return pathname === "/sessions" || pathname.startsWith("/sessions/")
  }
  if (href === "/projects") {
    return pathname === "/projects" || pathname.startsWith("/projects/")
  }
  return pathname === href || pathname.startsWith(`${href}/`)
}
