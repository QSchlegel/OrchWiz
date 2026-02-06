# Orchwiz Overview

## What is Orchwiz?

Orchwiz (Orchestration Wizard) is a distributed orchestration platform for managing and visualizing AI coding assistant workflows. The platform consists of multiple nodes that can be deployed locally or in the cloud.

## Core Concept

Orchwiz has at least 1 deployed node. Each node can:
- **Visualize its state**: Display its own operational status and data
- **Forward data**: Send relevant data to another node for aggregate visualization

## Key Features

- **Session Management**: Create, view, and manage AI coding sessions with plan/auto-accept modes
- **Slash Commands**: Define and execute custom commands
- **Subagents**: Create and manage specialized AI subagents
- **CLAUDE.md Editor**: Edit and version control project documentation
- **GitHub Integration**: Track PRs with @claude tags and manage documentation updates
- **PostToolUse Hooks**: Automate actions after tool usage
- **Permissions Management**: Control command execution permissions
- **Agent Actions Tracking**: Monitor Slack, BigQuery, Sentry, and other integrations
- **Pluggable Agent Runtime**: Execute sessions via OpenClaw and future runtimes
- **Observability Harness**: Capture traces, tool calls, and metrics for runtime visibility
- **Long-Running Tasks**: Track and monitor background tasks
- **Verification Workflows**: Track browser, bash, and test suite verification runs

## Agent Runtime

Orchwiz uses a pluggable agent runtime layer to execute sessions and tool calls. OpenClaw is the initial runtime, chosen to keep the platform adaptable to rapid changes and future runtime integrations.

## Harness Controls & Observability

The runtime harness exposes a standard control surface for observability and governance:
- **Trace/span correlation** across session → agent run → tool calls
- **Tool-call capture** with input/output metadata
- **Sampling controls** (global and per-session)
- **Redaction/masking** for secrets and PII
- **Cost and latency metrics** per run/tool/model
- **Run metadata tags** (mode, node, runtime version, model)

[Langfuse](https://langfuse.com/docs/tracing/overview) serves as the trace store and observability backend, capturing runtime inputs/outputs, tool usage, latencies, and cost signals.

## Roadmap

Planned runtime integrations:
- **[OpenAI Agents SDK](https://platform.openai.com/docs/guides/agents-sdk)**: Agentic app SDK with tool use and tracing.
- **[LangGraph](https://docs.langchain.com/oss/python/concepts/products)**: Runtime for long-running, stateful agent orchestration.
- **[AutoGen](https://microsoft.github.io/autogen/0.7.2/user-guide/core-user-guide/framework/agent-and-agent-runtime.html)**: Multi-agent framework with explicit agent runtime concepts.
- **[CrewAI](https://docs.crewai.com/en/concepts/agents)**: Multi-agent framework with agent and task abstractions.
- **[Cursor CLI](https://cursor.com/cli)**: Terminal-first agent workflows via Cursor.
- **[Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview)**: Terminal-based coding agent runtime from Anthropic.

## Maintenance Automation

A scheduled dependency-upkeep agent periodically reviews npm updates in `node/`, refreshes lockfiles, and updates setup/docs if requirements change. Major updates are flagged for review.

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: Better Auth with GitHub OAuth
- **UI**: React with Tailwind CSS
- **Real-time**: Server-Sent Events ready (implementation pending)

## Project Structure

The main application is located in the `node/` directory, which contains:
- Next.js application code
- Prisma schema and database configuration
- API routes for all features
- React components and UI

## Related Notes

- [[Node-Concept]] - Understanding the node architecture
- [[Architecture]] - System architecture details
- [[Database-Schema]] - Database structure reference
