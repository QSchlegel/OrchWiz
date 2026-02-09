import type { PermissionStatus, PermissionType } from "@prisma/client"

export interface PolicyPresetRule {
  commandPattern: string
  type: PermissionType
  status: PermissionStatus
  sortOrder: number
}

export interface PermissionPolicyPreset {
  slug: string
  name: string
  description: string
  rules: PolicyPresetRule[]
}

export const SYSTEM_PERMISSION_POLICY_PRESETS: PermissionPolicyPreset[] = [
  {
    slug: "safe-core",
    name: "Safe Core",
    description: "Read/build/test focused profile with strict safeguards and explicit approval fallback.",
    rules: [
      { commandPattern: "rm -rf *", type: "bash_command", status: "deny", sortOrder: 10 },
      { commandPattern: "sudo rm *", type: "bash_command", status: "deny", sortOrder: 20 },
      { commandPattern: "mkfs*", type: "bash_command", status: "deny", sortOrder: 30 },
      { commandPattern: "dd if=*", type: "bash_command", status: "deny", sortOrder: 40 },
      { commandPattern: "dd if=* of=/dev/*", type: "bash_command", status: "deny", sortOrder: 50 },
      { commandPattern: ":(){ :|:& };:", type: "bash_command", status: "deny", sortOrder: 60 },
      { commandPattern: "shutdown *", type: "bash_command", status: "deny", sortOrder: 70 },
      { commandPattern: "reboot *", type: "bash_command", status: "deny", sortOrder: 80 },
      { commandPattern: "poweroff *", type: "bash_command", status: "deny", sortOrder: 90 },
      { commandPattern: "ls*", type: "bash_command", status: "allow", sortOrder: 100 },
      { commandPattern: "cat *", type: "bash_command", status: "allow", sortOrder: 110 },
      { commandPattern: "pwd", type: "bash_command", status: "allow", sortOrder: 120 },
      { commandPattern: "git status*", type: "bash_command", status: "allow", sortOrder: 130 },
      { commandPattern: "npm run build*", type: "bash_command", status: "allow", sortOrder: 140 },
      { commandPattern: "npm test*", type: "bash_command", status: "allow", sortOrder: 150 },
      { commandPattern: "*", type: "bash_command", status: "ask", sortOrder: 1000 },
    ],
  },
  {
    slug: "balanced-devops",
    name: "Balanced DevOps",
    description: "Operationally broader profile for common delivery workflows with safety rails.",
    rules: [
      { commandPattern: "rm -rf *", type: "bash_command", status: "deny", sortOrder: 10 },
      { commandPattern: "sudo rm *", type: "bash_command", status: "deny", sortOrder: 20 },
      { commandPattern: "mkfs*", type: "bash_command", status: "deny", sortOrder: 30 },
      { commandPattern: "dd if=* of=/dev/*", type: "bash_command", status: "deny", sortOrder: 40 },
      { commandPattern: ":(){ :|:& };:", type: "bash_command", status: "deny", sortOrder: 50 },
      { commandPattern: "shutdown *", type: "bash_command", status: "deny", sortOrder: 60 },
      { commandPattern: "reboot *", type: "bash_command", status: "deny", sortOrder: 70 },
      { commandPattern: "poweroff *", type: "bash_command", status: "deny", sortOrder: 80 },
      { commandPattern: "npm *", type: "bash_command", status: "allow", sortOrder: 100 },
      { commandPattern: "pnpm *", type: "bash_command", status: "allow", sortOrder: 110 },
      { commandPattern: "yarn *", type: "bash_command", status: "allow", sortOrder: 120 },
      { commandPattern: "git *", type: "bash_command", status: "allow", sortOrder: 130 },
      { commandPattern: "docker *", type: "bash_command", status: "allow", sortOrder: 140 },
      { commandPattern: "kubectl *", type: "bash_command", status: "allow", sortOrder: 150 },
      { commandPattern: "terraform *", type: "bash_command", status: "allow", sortOrder: 160 },
      { commandPattern: "ansible-playbook *", type: "bash_command", status: "allow", sortOrder: 170 },
      { commandPattern: "*", type: "bash_command", status: "ask", sortOrder: 1000 },
    ],
  },
  {
    slug: "power-operator",
    name: "Power Operator",
    description: "High-trust profile for expert operators with minimal blocks on catastrophic commands.",
    rules: [
      { commandPattern: "rm -rf /", type: "bash_command", status: "deny", sortOrder: 10 },
      { commandPattern: "mkfs*", type: "bash_command", status: "deny", sortOrder: 20 },
      { commandPattern: "dd if=* of=/dev/*", type: "bash_command", status: "deny", sortOrder: 30 },
      { commandPattern: ":(){ :|:& };:", type: "bash_command", status: "deny", sortOrder: 40 },
      { commandPattern: "shutdown *", type: "bash_command", status: "deny", sortOrder: 50 },
      { commandPattern: "reboot *", type: "bash_command", status: "deny", sortOrder: 60 },
      { commandPattern: "poweroff *", type: "bash_command", status: "deny", sortOrder: 70 },
      { commandPattern: "*", type: "bash_command", status: "allow", sortOrder: 100 },
    ],
  },
]
