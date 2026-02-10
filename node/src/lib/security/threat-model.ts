export interface ThreatModelControl {
  id: string
  description: string
}

export interface ThreatModelThreat {
  id: string
  name: string
  noteMapping: string
  attackSurface: string
  plannedControls: ThreatModelControl[]
}

export const BRIDGE_CORE_THREAT_MODEL_VERSION = "2026-02-10"

export const BRIDGE_CORE_THREAT_MODEL: ThreatModelThreat[] = [
  {
    id: "TM-01",
    name: "Hijacking / Prompt Injection",
    noteMapping: "Agentic AI Risks, AI Firewall / Gateway",
    attackSurface: "Bridge runtime prompts and bridge-call directives",
    plannedControls: [
      { id: "CTRL-PROMPT-RISK", description: "Prompt-risk evaluator in audit pipeline" },
      { id: "CTRL-POLICY-ENFORCEMENT", description: "Permission and policy boundaries for execution" },
    ],
  },
  {
    id: "TM-02",
    name: "Shadow AI",
    noteMapping: "Shadow AI, AISPM",
    attackSurface: "Commands, subagents, permission policies",
    plannedControls: [
      { id: "CTRL-OWNER-BOUND", description: "Owner-scoped resources and route authorization" },
      { id: "CTRL-POSTURE-REPORTING", description: "Scheduled posture checks" },
    ],
  },
  {
    id: "TM-03",
    name: "Data Exfiltration",
    noteMapping: "AI Firewall, Data Loss Prevention",
    attackSurface: "SSE stream, forwarding test/dispatch, bridge outputs",
    plannedControls: [
      { id: "CTRL-EVENT-SCOPING", description: "Per-user realtime scoping" },
      { id: "CTRL-FWD-TARGET-ALLOWLIST", description: "Allowlisted forwarding test targets" },
    ],
  },
  {
    id: "TM-04",
    name: "Extraction / Secret Exposure",
    noteMapping: "NHI, dynamic secrets",
    attackSurface: "Forwarding source API keys and enclave token paths",
    plannedControls: [
      { id: "CTRL-NO-SECRET-ECHO", description: "No plaintext source key echo in API responses" },
      { id: "CTRL-ENCRYPTED-SECRET-STORAGE", description: "Wallet-enclave backed encryption for stored secrets" },
    ],
  },
  {
    id: "TM-05",
    name: "Evasion / Replay",
    noteMapping: "Zero Trust for AI Agents",
    attackSurface: "Forwarding ingest and source identity",
    plannedControls: [
      { id: "CTRL-OWNER-SOURCE-IDENTITY", description: "Owner-scoped source identities" },
      { id: "CTRL-NONCE-TIMESTAMP", description: "Replay and freshness checks" },
    ],
  },
  {
    id: "TM-06",
    name: "Governance vs Security Drift",
    noteMapping: "AI Governance vs Security",
    attackSurface: "Permissions and custom policy APIs",
    plannedControls: [
      { id: "CTRL-CENTRAL-AUTHZ", description: "Centralized access-control helper" },
      { id: "CTRL-OWNER-ENFORCEMENT", description: "Owner checks for all mutable policy resources" },
    ],
  },
  {
    id: "TM-07",
    name: "NHI / Zero Trust Identity Abuse",
    noteMapping: "Non-Human Identity (NHI), Zero Trust",
    attackSurface: "Bridge crew and Ship Yard token auth",
    plannedControls: [
      { id: "CTRL-TOKEN-SCOPING", description: "Token-auth impersonation restrictions" },
      { id: "CTRL-AUDIT-TRAIL", description: "Actor metadata in deployment records" },
    ],
  },
  {
    id: "TM-08",
    name: "AISPM / Misconfiguration",
    noteMapping: "AI Security Posture Management (AISPM)",
    attackSurface: "Enclave and forwarding runtime configuration",
    plannedControls: [
      { id: "CTRL-NIGHTLY-AUDITS", description: "Nightly and on-demand security audits" },
      { id: "CTRL-RISK-SCORE", description: "Report risk score and severity trend" },
    ],
  },
]
