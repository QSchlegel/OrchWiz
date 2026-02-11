import { createKnowledgeIngestProvider } from "@/lib/knowledge-ingest/provider-registry"
import { runKnowledgeIngest } from "@/lib/knowledge-ingest/orchestrator"

interface CliArgs {
  dryRun: boolean
  force: boolean
  providerId: string | null
  help: boolean
}

function parseCliArgs(argv: string[]): CliArgs {
  let dryRun = false
  let force = false
  let providerId: string | null = null
  let help = false

  for (let idx = 0; idx < argv.length; idx += 1) {
    const arg = argv[idx]
    if (arg === "--dry-run") {
      dryRun = true
      continue
    }

    if (arg === "--force") {
      force = true
      continue
    }

    if (arg === "--help" || arg === "-h") {
      help = true
      continue
    }

    if (arg.startsWith("--provider=")) {
      providerId = arg.slice("--provider=".length).trim() || null
      continue
    }

    if (arg === "--provider") {
      const next = argv[idx + 1]
      providerId = next?.trim() || null
      idx += 1
      continue
    }
  }

  return {
    dryRun,
    force,
    providerId,
    help,
  }
}

function printHelp(): void {
  console.log("Usage: npm run knowledge:ingest -- [--dry-run] [--force] [--provider=<id>]")
  console.log("")
  console.log("Options:")
  console.log("  --dry-run            Compute ingest plan without mutating external provider")
  console.log("  --force              Reingest all scanned documents for the selected provider")
  console.log("  --provider=<id>      Override KNOWLEDGE_INGEST_PROVIDER for this run")
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }

  const provider = createKnowledgeIngestProvider(args.providerId)

  const summary = await runKnowledgeIngest({
    provider,
    dryRun: args.dryRun,
    force: args.force,
    log: (line) => console.log(line),
  })

  console.log(
    JSON.stringify(
      {
        provider: summary.providerId,
        providerVersion: summary.providerVersion,
        manifestPath: summary.manifestPath,
        dryRun: summary.dryRun,
        force: summary.force,
        counts: summary.counts,
        failures: summary.failures,
      },
      null,
      2,
    ),
  )

  if (summary.counts.failed > 0) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error("[knowledge-ingest] fatal:", error)
  process.exit(1)
})
