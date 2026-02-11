# Compliance Program (ISO 27001 + SOC 2)

- Owner: Platform Security (OrchWiz Maintainers)
- Last Updated: 2026-02-11
- Status: Draft baseline

## Purpose

This section defines OrchWiz's compliance baseline for ISO 27001:2022 and SOC 2
(Security, Availability, and Confidentiality) in cert-ready form. The goal is
to make controls, ownership, and evidence requirements explicit and repeatable.

This repository does not claim completed certification or attestation. It
documents the implementation baseline and evidence process required for formal
external assessment.

## Scope

The baseline scope includes all services and integrations in this repository:

- `node/` control plane and APIs
- `services/wallet-enclave/`
- `services/data-core/`
- `infra/` Terraform and Ansible deployment paths
- External integrations that are enabled by configuration (for example GitHub,
  Stripe, Cloudflare, ngrok, and runtime providers)

## Control Domains

- Governance and policy management
- Identity, access control, and ownership enforcement
- Secure SDLC and change management
- Infrastructure and runtime hardening
- Logging, monitoring, and security operations
- Incident response and escalation
- Business continuity and disaster recovery
- Third-party and vendor risk management

## Evidence Model

- Location: compliance artifacts live under `docs/compliance/`.
- Operational evidence sources remain in their system of record, with links
  recorded in `docs/compliance/evidence-checklist.md`.
- Cadence: monthly evidence review and sign-off.
- Ownership: each control has a named owner and reviewer.
- Exceptions: risk acceptances must be documented with expiry and owner.

## Linked Artifacts

- [Control map](./control-map.md)
- [Evidence checklist](./evidence-checklist.md)
- [90-day roadmap](./roadmap-90-days.md)

