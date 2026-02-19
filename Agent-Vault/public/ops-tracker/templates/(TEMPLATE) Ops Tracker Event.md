<%*
const shipDeploymentId = (await tp.system.prompt("shipDeploymentId (required)")) || ""
const agentId = ((await tp.system.prompt("agentId (required, e.g. xo-cb01, qtm-lgr)")) || "").toLowerCase()
const eventKind = await tp.system.suggester(
  (item) => item,
  [
    "bridge-operation",
    "quartermaster-action",
    "verification-step",
    "security-action",
    "deployment-action"
  ],
  false,
  "Choose event kind"
)
const notes = (await tp.system.prompt("Short notes")) || ""
const pointsRaw = (await tp.system.prompt("points", "1")) || "1"
const parsedPoints = Number.parseInt(pointsRaw, 10)
const points = Number.isFinite(parsedPoints) && parsedPoints > 0 ? parsedPoints : 1
const eventId = `manual-${tp.date.now("YYYYMMDD-HHmmss")}-${Math.random().toString(16).slice(2, 8)}`
_%>
---
type: ops-tracker-event
trackerVersion: 1
eventId: <% eventId %>
eventDate: <% tp.date.now("YYYY-MM-DD") %>
occurredAt: <% tp.date.now("YYYY-MM-DDTHH:mm:ssZ") %>
shipDeploymentId: <% shipDeploymentId %>
agentId: <% agentId %>
agentRole: <% eventKind %>
source: manual
points: <% points %>
isForwarded: false
visibility: public
title: Manual Ops Event
summary: <% notes %>
tags:
  - ops-tracker/event
  - ops-tracker/source/manual
---
# Manual Ops Tracker Event

<% notes %>

## Context
- Ship: `<% shipDeploymentId %>`
- Agent: `<% agentId %>`
- Event kind: `<% eventKind %>`
- Points: `<% points %>`

