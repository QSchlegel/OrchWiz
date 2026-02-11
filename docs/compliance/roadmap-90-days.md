# 90-Day Compliance Roadmap

- Owner: Platform Security (OrchWiz Maintainers)
- Last Updated: 2026-02-11
- Status: Draft baseline

This roadmap phases the ISO 27001 + SOC 2 (Security, Availability, and
Confidentiality) cert-ready baseline into three implementation windows.

## Days 1-30: Documentation and Non-blocking Checks

- Publish compliance structure, control map, and evidence checklist.
- Confirm control ownership and reviewer assignments.
- Run security, dependency, and posture checks in non-blocking mode.
- Record and prioritize remediation backlog with clear owners.
- Baseline evidence collection cadence and monthly review routine.

## Days 31-60: CI Security Controls and Dependency Governance

- Add and standardize CI checks for SAST, dependency risk, and IaC posture.
- Define gating thresholds and exception process for high-risk findings.
- Close or formally accept high-risk dependency items with expiry dates.
- Document change-management and deployment approval workflow.
- Capture repeatable evidence from CI and audit systems.

## Days 61-90: Enforcement and Readiness Pack

- Transition critical controls from warn mode to enforced gates.
- Complete remediation for must-fix findings or approved exceptions.
- Run readiness review across Security, Availability, and Confidentiality.
- Produce readiness pack:
  - control map snapshot
  - latest evidence checklist
  - open risks/exceptions register
  - management review summary
- Finalize handoff package for external assessor preparation.

