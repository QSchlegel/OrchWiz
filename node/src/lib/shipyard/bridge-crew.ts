export type BridgeCrewRole = "xo" | "ops" | "eng" | "sec" | "med" | "cou"

export interface BridgeCrewTemplate {
  role: BridgeCrewRole
  callsign: string
  name: string
  description: string
  content: string
}

export const BRIDGE_CREW_ROLE_ORDER: BridgeCrewRole[] = ["xo", "ops", "eng", "sec", "med", "cou"]

const BRIDGE_CREW_DEFAULTS: Record<BridgeCrewRole, Omit<BridgeCrewTemplate, "role">> = {
  xo: {
    callsign: "XO-CB01",
    name: "Executive Officer",
    description: "Mission command and delegation.",
    content:
      "You are XO-CB01. Direct mission priorities, delegate to OPS/ENG/SEC/MED/COU, and keep execution aligned with intent and risk.",
  },
  ops: {
    callsign: "OPS-ARX",
    name: "Operations",
    description: "Deployment flow and scaling.",
    content:
      "You are OPS-ARX. Run deployments, routing, scaling, and queues. Escalate infrastructure instability to ENG.",
  },
  eng: {
    callsign: "ENG-GEO",
    name: "Engineering",
    description: "Reliability and incident response.",
    content:
      "You are ENG-GEO. Own incident triage, safe remediation, rollout checks, and post-incident notes.",
  },
  sec: {
    callsign: "SEC-KOR",
    name: "Security",
    description: "Policy and secret controls.",
    content:
      "You are SEC-KOR. Enforce permissions, secret handling, and policy. Stop unsafe actions and offer safer options.",
  },
  med: {
    callsign: "MED-BEV",
    name: "Medical",
    description: "Runtime health and diagnostics.",
    content:
      "You are MED-BEV. Monitor service health, detect degradation, and drive diagnostics, stabilization, and readiness gates.",
  },
  cou: {
    callsign: "COU-DEA",
    name: "Communications",
    description: "Status relay and escalations.",
    content:
      "You are COU-DEA. Deliver concise status updates, notifications, and escalation messages with clear next steps.",
  },
}

export function isBridgeCrewRole(value: unknown): value is BridgeCrewRole {
  return typeof value === "string" && BRIDGE_CREW_ROLE_ORDER.includes(value as BridgeCrewRole)
}

export function bridgeCrewTemplateForRole(role: BridgeCrewRole): BridgeCrewTemplate {
  return {
    role,
    ...BRIDGE_CREW_DEFAULTS[role],
  }
}

export function listBridgeCrewTemplates(): BridgeCrewTemplate[] {
  return BRIDGE_CREW_ROLE_ORDER.map((role) => bridgeCrewTemplateForRole(role))
}
