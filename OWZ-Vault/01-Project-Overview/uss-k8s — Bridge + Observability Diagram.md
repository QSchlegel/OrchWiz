# uss-k8s — Bridge Crew + Observability / Analytics (Mermaid)

This diagram shows the split between:
- **State** (file-backed logs + vault notes) that UIs read
- **Actions** (OpenClaw tool calls / cron jobs) that change state
- **Observability** (Langfuse+ClickHouse, Loki, Prometheus/Grafana) feeding KPI + regression

```mermaid
flowchart TB
  %% =========================
  %% USS-K8S — Bridge + Observability
  %% =========================

  subgraph USERS["Humans / Operator Surfaces"]
    QS["CAP-QS (sir)\nTelegram / Operator"]
    UI["Cora UI\n(Next.js state reader)"]
  end

  subgraph BRIDGE["Bridge Crew (logical agents)"]
    XO["XO-CB01 / CBHB-01\n(bridge coordination)"]
    OPS["OPS-ARX\n(ops automation)"]
    ENG["ENG-GEO\n(incident queue + infra)"]
    SEC["SEC-KOR\n(security review)"]
    MED["MED-BEV\n(health checks)"]
    COU["COU-DEA\n(comms/outreach)"]
  end

  subgraph OPENCLAW["OpenClaw Runtime"]
    GW["OpenClaw Gateway\n(ws://127.0.0.1:18789)\nTools: exec/cron/message/etc"]
    CRON["Cron Scheduler\n(recurring + one-shot jobs)"]
    STATE["File-backed State\nlogs/*.jsonl\nOWZ-Vault/**\nmemory/*.json"]
  end

  subgraph OBS["Observability & Analytics (uss-k8s)"]
    LF["Langfuse\n(traces/spans/scores)"]
    CH["ClickHouse\n(Langfuse storage/analytics)"]
    LOKI["Grafana Loki\n(log aggregation)"]
    PROM["Prometheus\n(metrics)"]
    GRAF["Grafana\n(dashboards + alerts)"]
    EVT["kubernetes-event-exporter\n(K8s Events → Loki)"]
  end

  subgraph K8S["Kubernetes Cluster (uss-k8s)"]
    APP["Workloads\n(OpenClaw jobs, services, agents)"]
    NODES["Nodes\nkubelet/container runtime\nnode logs"]
  end

  %% Operator interactions
  QS -->|"requests / directives"| XO
  QS -->|"views state"| UI
  UI -->|"read-only"| STATE

  %% Bridge crew uses OpenClaw tools
  XO -->|tool calls| GW
  OPS -->|tool calls| GW
  ENG -->|tool calls| GW
  SEC -->|tool calls| GW
  MED -->|tool calls| GW
  COU -->|tool calls| GW

  %% Cron orchestrates jobs via gateway
  CRON -->|"trigger job runs"| GW
  GW -->|"writes results"| STATE

  %% Runtime telemetry
  APP -->|"pod logs"| LOKI
  NODES -->|"node logs"| LOKI
  K8S --> EVT
  EVT -->|"events"| LOKI

  APP -->|"metrics"| PROM
  PROM --> GRAF
  LOKI --> GRAF

  %% Langfuse tracing path
  GW -->|"LLM/tool traces"| LF
  LF --> CH
  CH -->|"SQL / cohorts / regressions"| GRAF

  %% Alerts / feedback loop
  GRAF -->|alerts| ENG
  ENG -->|"incident notes"| STATE
  ENG -->|"action requests"| XO
```
