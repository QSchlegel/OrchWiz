import "dotenv/config"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import crypto from "node:crypto"

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error("DATABASE_URL is required to run the seed")
const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

const OPENCLAW_DEFAULT_COMMANDS: Array<{
  name: string
  description: string
  scriptContent: string
}> = [
  {
    name: "openclaw-gateway-health",
    description: "Check OpenClaw gateway health endpoint.",
    scriptContent: "curl -fsS ${OPENCLAW_GATEWAY_URL:-http://127.0.0.1:18789}/health",
  },
  {
    name: "openclaw-gateway-version",
    description: "Read OpenClaw gateway version metadata.",
    scriptContent: "curl -fsS ${OPENCLAW_GATEWAY_URL:-http://127.0.0.1:18789}/version",
  },
  {
    name: "openclaw-prompt-smoke",
    description: "Run a minimal OpenClaw prompt call against /v1/prompt.",
    scriptContent:
      "curl -fsS -X POST ${OPENCLAW_GATEWAY_URL:-http://127.0.0.1:18789}${OPENCLAW_PROMPT_PATH:-/v1/prompt} -H 'Content-Type: application/json' -d '{\"sessionId\":\"seed-smoke\",\"prompt\":\"Respond with OK\"}'",
  },
  {
    name: "openclaw-gateway-ready",
    description: "Wait until OpenClaw gateway responds successfully.",
    scriptContent:
      "until curl -fsS ${OPENCLAW_GATEWAY_URL:-http://127.0.0.1:18789}/health >/dev/null; do echo 'waiting for openclaw gateway...'; sleep 2; done; echo 'openclaw gateway ready'",
  },
  {
    name: "openclaw-context-keys",
    description: "Print OpenClaw bridge context environment keys.",
    scriptContent:
      "env | grep -E '^ORCHWIZ_BRIDGE_CONTEXT_(B64|SCHEMA|SOURCE|ENCODING)=' || echo 'No ORCHWIZ bridge context env keys set'",
  },
  {
    name: "openclaw-target-deployments",
    description: "Show configured OpenClaw context injection target deployments.",
    scriptContent: "echo ${OPENCLAW_TARGET_DEPLOYMENTS:-openclaw-gateway,openclaw-worker}",
  },
  {
    name: "openclaw-context-injection-status",
    description: "Show whether OpenClaw context injection is enabled.",
    scriptContent:
      "if [ \"${OPENCLAW_CONTEXT_INJECTION_ENABLED:-true}\" = \"false\" ]; then echo 'disabled'; else echo 'enabled'; fi",
  },
  {
    name: "openclaw-rollout-status-gateway",
    description: "Check rollout status for openclaw-gateway deployment.",
    scriptContent:
      "kubectl -n ${KUBE_NAMESPACE:-default} rollout status deployment/openclaw-gateway --timeout=120s",
  },
  {
    name: "openclaw-rollout-status-worker",
    description: "Check rollout status for openclaw-worker deployment.",
    scriptContent:
      "kubectl -n ${KUBE_NAMESPACE:-default} rollout status deployment/openclaw-worker --timeout=120s",
  },
  {
    name: "openclaw-deployments",
    description: "List OpenClaw deployments from Kubernetes.",
    scriptContent: "kubectl -n ${KUBE_NAMESPACE:-default} get deployments | grep openclaw || true",
  },
  {
    name: "openclaw-pods",
    description: "List OpenClaw pods from Kubernetes.",
    scriptContent: "kubectl -n ${KUBE_NAMESPACE:-default} get pods | grep openclaw || true",
  },
  {
    name: "openclaw-logs-gateway",
    description: "Tail recent logs from OpenClaw gateway.",
    scriptContent:
      "kubectl -n ${KUBE_NAMESPACE:-default} logs deployment/openclaw-gateway --tail=${TAIL_LINES:-200}",
  },
  {
    name: "openclaw-logs-worker",
    description: "Tail recent logs from OpenClaw worker.",
    scriptContent:
      "kubectl -n ${KUBE_NAMESPACE:-default} logs deployment/openclaw-worker --tail=${TAIL_LINES:-200}",
  },
  {
    name: "openclaw-restart-gateway",
    description: "Restart OpenClaw gateway deployment.",
    scriptContent:
      "kubectl -n ${KUBE_NAMESPACE:-default} rollout restart deployment/openclaw-gateway && kubectl -n ${KUBE_NAMESPACE:-default} rollout status deployment/openclaw-gateway --timeout=180s",
  },
  {
    name: "openclaw-restart-worker",
    description: "Restart OpenClaw worker deployment.",
    scriptContent:
      "kubectl -n ${KUBE_NAMESPACE:-default} rollout restart deployment/openclaw-worker && kubectl -n ${KUBE_NAMESPACE:-default} rollout status deployment/openclaw-worker --timeout=180s",
  },
  {
    name: "openclaw-state-list",
    description: "List file-backed OpenClaw state artifacts.",
    scriptContent: "find ${OPENCLAW_STATE_DIR:-OWZ-Vault} -maxdepth 3 -type f | head -n 100",
  },
  {
    name: "openclaw-state-audit-tail",
    description: "Tail local audit jsonl file from OpenClaw state path.",
    scriptContent: "tail -n ${TAIL_LINES:-100} ${OPENCLAW_AUDIT_FILE:-services/wallet-enclave/data/audit.jsonl}",
  },
  {
    name: "openclaw-context-schema",
    description: "Show OpenClaw context bundle schema version from runtime env.",
    scriptContent:
      "echo ${ORCHWIZ_BRIDGE_CONTEXT_SCHEMA:-orchwiz.openclaw.context.v1}",
  },
  {
    name: "openclaw-runtime-chain",
    description: "Display effective runtime chain configuration.",
    scriptContent:
      "echo OPENCLAW_GATEWAY_URL=${OPENCLAW_GATEWAY_URL:-unset}; echo ENABLE_OPENAI_RUNTIME_FALLBACK=${ENABLE_OPENAI_RUNTIME_FALLBACK:-true}; echo OPENAI_RUNTIME_FALLBACK_MODEL=${OPENAI_RUNTIME_FALLBACK_MODEL:-gpt-4.1-mini}",
  },
  {
    name: "openclaw-runtime-local-fallback-check",
    description: "Simulate local fallback preconditions by printing provider gate status.",
    scriptContent:
      "if [ -n \"${OPENCLAW_GATEWAY_URL:-}\" ]; then echo 'openclaw configured'; else echo 'openclaw not configured'; fi; if [ \"${ENABLE_OPENAI_RUNTIME_FALLBACK:-true}\" = \"true\" ] && [ -n \"${OPENAI_API_KEY:-}\" ]; then echo 'openai fallback configured'; else echo 'openai fallback not configured'; fi",
  },
]

async function main() {
  const defaultForwardingApiKey = process.env.DEFAULT_FORWARDING_API_KEY || "orchwiz-dev-forwarding-key"
  const defaultSourceNodeId = process.env.DEFAULT_SOURCE_NODE_ID || "local-node"
  const defaultSourceNodeName = process.env.DEFAULT_SOURCE_NODE_NAME || "Local Node"
  const apiKeyHash = crypto
    .createHash("sha256")
    .update(defaultForwardingApiKey)
    .digest("hex")

  const existingSourceNode = await prisma.nodeSource.findFirst({
    where: {
      ownerUserId: null,
      nodeId: defaultSourceNodeId,
    },
  })

  const sourceNode = existingSourceNode
    ? await prisma.nodeSource.update({
        where: { id: existingSourceNode.id },
        data: {
          name: defaultSourceNodeName,
          nodeType: "local",
          nodeUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
          apiKeyHash,
          isActive: true,
          lastSeenAt: new Date(),
        },
      })
    : await prisma.nodeSource.create({
        data: {
          ownerUserId: null,
          nodeId: defaultSourceNodeId,
          name: defaultSourceNodeName,
          nodeType: "local",
          nodeUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
          apiKeyHash,
          isActive: true,
          lastSeenAt: new Date(),
        },
      })

  console.log(`Seeded node source ${sourceNode.nodeId} (${sourceNode.id})`)
  let createdCommands = 0
  for (const command of OPENCLAW_DEFAULT_COMMANDS) {
    const existing = await prisma.command.findFirst({
      where: {
        name: command.name,
        teamId: null,
      },
    })

    if (existing) {
      continue
    }

    await prisma.command.create({
      data: {
        name: command.name,
        description: command.description,
        scriptContent: command.scriptContent,
        isShared: true,
        teamId: null,
      },
    })
    createdCommands += 1
  }

  console.log(`Seeded ${createdCommands} OpenClaw default commands`)
  console.log("Done.")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
