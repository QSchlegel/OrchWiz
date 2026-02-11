import type { VaultSeedPackDefinition } from "./types"
import { VAULT_SEED_PACK_CREATED_DATE_TOKEN } from "./types"

export const POPEBOT_VAULT_SEED_PACK: VaultSeedPackDefinition = {
  id: "popebot",
  label: "PopeBot Notes",
  description: "Install a linked PopeBot notes pack in OrchWiz Vault.",
  vaultId: "orchwiz",
  targetRoot: "00-Inbox/PopeBot",
  tags: ["ai-agents", "open-source", "security", "gitops"],
  files: [
    {
      fileName: "Video - I Built My Own Clawdbot.md",
      content: `---
created: ${VAULT_SEED_PACK_CREATED_DATE_TOKEN}
type: video-notes
url: https://www.youtube.com/watch?v=zeJ4whgLELE
channel: Stephen G. Pope
publish_date: 2026-02-10
tags:
  - ai-agents
  - open-source
  - security
  - gitops
---

# Video: I Built My Own Clawdbot (It's ACTUALLY Safe)

## Summary
Stephen Pope introduces **[[PopeBot]]**, a secure, open-source personal AI agent framework. Unlike cloud agents that are "black boxes," this bot uses **[[GitHub Actions as Infrastructure]]** to run tasks in ephemeral containers. It leverages **[[Git-Based Agent Memory]]** to store logs/code and uses **[[Agents via Pull Requests]]** to ensure human oversight before the agent changes its own behavior.

## Core Concepts
- [[PopeBot]] - The architecture of the agent (Telegram -> GitHub Actions -> Git).
- [[Git-Based Agent Memory]] - Using the repo history as the agent's long-term memory.
- [[Agents via Pull Requests]] - The "Human-in-the-Loop" security model.
- [[Ephemeral Agent Runtime]] - Security via short-lived Docker containers.
- [[Cron-Based Agentic Tasks]] - Scheduling autonomous recurring research.

## Key Quotes
> "Cloudbot has proven to be very unsafe for your data... that's why I decided to build my own secure bot."
> "We have a lot more transparency about what the bot is doing... because it uses Pull Requests."
`,
    },
    {
      fileName: "PopeBot.md",
      content: `---
created: ${VAULT_SEED_PACK_CREATED_DATE_TOKEN}
tags:
  - tools
  - ai-agents
  - github
---

# PopeBot

## Context
An open-source personal agent framework designed by Stephen Pope as a secure alternative to proprietary cloud agents.

## Architecture
1. **Interface:** Users interact via **Telegram**.
2. **Runtime:** Tasks run as **GitHub Actions** (ephemeral Docker containers).
3. **Storage:** The **Git Repository** acts as the file system and memory.
4. **Tools:** Access to **Brave Search**, file manipulation, and self-modification.

## Key Features
- **Self-Improving:** The agent can modify its own "Operating System" (codebase) based on past logs.
- **Secure:** Credentials are stored in GitHub Secrets, not the code.
- **Transparent:** All actions result in commits or Pull Requests.

## Related
- [[Git-Based Agent Memory]]
- [[Agents via Pull Requests]]
`,
    },
    {
      fileName: "Git-Based Agent Memory.md",
      content: `---
created: ${VAULT_SEED_PACK_CREATED_DATE_TOKEN}
tags:
  - memory
  - version-control
  - ai-learning
---

# Git-Based Agent Memory

## Context
A method for giving AI agents persistent memory without using complex vector databases.

## How it Works
1. **Logs as Commits:** Every time the agent runs, it commits its "thought process" (logs) and output (files) to the repository.
2. **Reflection:** Future agent runs can read these files to understand past context.
3. **Auditability:** Since "memory" is just file history, a human can browse the Git history to see exactly *why* an agent made a decision.

## Advantages
- **Simplicity:** No need for a separate database.
- **Versioned:** You can roll back the agent's "memory" if it learns something incorrect.

## Related
- [[Software 2.0]]
- [[Reflexion]]
`,
    },
    {
      fileName: "Agents via Pull Requests.md",
      content: `---
created: ${VAULT_SEED_PACK_CREATED_DATE_TOKEN}
tags:
  - security
  - governance
  - gitops
---

# Agents via Pull Requests

## Context
A governance model for autonomous agents that prevents them from going "rogue."

## The Workflow
Instead of an agent silently updating a database or system:
1. The agent proposes a change via a **Pull Request (PR)**.
2. The human owner receives a notification.
3. The human reviews the \`diff\` (what lines of code/text changed).
4. The human approves/merges or rejects the change.

## Security Benefit
This acts as a "kill switch" for behavior modification. An agent cannot permanently change its core instructions or install malware-like persistence without explicit human approval.

## Related
- [[Human-in-the-Loop]]
- [[GitOps]]
`,
    },
    {
      fileName: "Ephemeral Agent Runtime.md",
      content: `---
created: ${VAULT_SEED_PACK_CREATED_DATE_TOKEN}
tags:
  - security
  - infrastructure
  - docker
---

# Ephemeral Agent Runtime

## Context
The security principle of running AI agents in short-lived, isolated environments.

## Implementation in PopeBot
- The agent runs inside a **GitHub Action** runner (a Docker container).
- **Lifecycle:**
  1. Container spins up.
  2. Secrets are injected (Just-in-Time).
  3. Task executes.
  4. Container is destroyed.
- **Benefit:** If the agent is tricked into downloading malicious code or "hallucinating" a dangerous state, that state is wiped as soon as the job finishes. It does not persist unless explicitly committed to the repo (which requires PR approval).

## Related
- [[Zero Trust]]
- [[Container Security]]
`,
    },
  ],
}

