# Contributing to OrchWiz

Thanks for contributing to OrchWiz.

OrchWiz is positioned as an **Agent VPC**. Contributions should strengthen at least one of these pillars:

- **Boundary**: private-by-default runtime boundaries across nodes.
- **Control**: policy gates, permissions, and deployment/session governance.
- **Traceability**: auditable prompts, actions, and security evidence.

## Before You Start

- Read the project overview in [README.md](README.md).
- Prefer issues labeled `good first issue`, `help wanted`, or `enhancement`.
- If no issue exists, open one before large changes.

## Local Setup

```bash
git clone git@github.com:QSchlegel/OrchWiz.git
cd OrchWiz

cd dev-local
docker compose up -d

cd ../node
cp .env.example .env
npm install
npm run db:generate
npm run db:push
npm run dev
```

## Primary Contributor Tracks

1. Runtime adapters and provider-chain reliability
2. Security audits, policy coverage, and ownership controls
3. Topology operations and forwarding workflows
4. Developer docs and examples tied to real flows

## Contribution Workflow

1. Pick an issue and comment with your implementation plan.
2. Branch from `main`.
3. Keep changes scoped to one issue.
4. Add or update tests for behavior changes.
5. Run quality gates before opening the PR.
6. Open a PR with the template and link the issue.

## Quality Gates

Run from `/node`:

```bash
npm run lint
npm run test
npm run build
```

If your change touches `services/wallet-enclave`, also run:

```bash
cd services/wallet-enclave
npm test
```

## PR Expectations

- Explain what changed and why.
- Include validation evidence (test output, screenshots, logs, or API samples).
- Flag any security or migration impact.
- Keep claims in docs/marketing text evidence-backed.

## Coding and Review Guidelines

- Prefer small, reviewable PRs.
- Avoid unrelated refactors in the same PR.
- Do not commit secrets, tokens, or private data.
- Keep backward compatibility for public APIs unless the issue explicitly approves a breaking change.

## Need Help?

- Open a discussion: <https://github.com/QSchlegel/OrchWiz/discussions>
- Open an issue: <https://github.com/QSchlegel/OrchWiz/issues>
