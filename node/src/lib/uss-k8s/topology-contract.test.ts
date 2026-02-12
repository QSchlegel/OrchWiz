import assert from "node:assert/strict"
import test from "node:test"
import { parseUssK8sTopologyResponse } from "./topology-contract"
import {
  GROUP_ORDER,
  SUBSYSTEM_GROUP_CONFIG,
  USS_K8S_COMMAND_HIERARCHY,
  USS_K8S_COMPONENTS,
  USS_K8S_EDGES,
} from "./topology"

test("parseUssK8sTopologyResponse parses a valid payload", () => {
  const parsed = parseUssK8sTopologyResponse({
    components: [
      {
        id: "xo",
        label: "XO",
        group: "bridge",
        componentType: "agent",
        sublabel: "coordination",
        status: "warning",
      },
    ],
    edges: [
      {
        source: "xo",
        target: "gw",
        edgeType: "control",
        label: "dispatch",
        animated: true,
      },
    ],
    groups: {
      users: {
        label: "Operator Surfaces",
        color: "text-cyan-500",
        bgColor: "bg-cyan-500/10",
        borderColor: "border-cyan-500/30",
      },
    },
    groupOrder: ["bridge", "users"],
    commandHierarchy: [
      {
        tier: 2,
        label: "Command",
        description: "Bridge command",
        nodeIds: ["xo"],
      },
    ],
    availableShips: [
      {
        id: "ship-1",
        name: "USS Test",
        status: "active",
        nodeId: "node-1",
        nodeType: "local",
        deploymentProfile: "local_starship_build",
      },
    ],
    kubeview: {
      enabled: true,
      ingressEnabled: false,
      url: null,
      source: "terraform_output",
      reason: "KubeView ingress is disabled for this ship.",
    },
    selectedShipDeploymentId: "ship-1",
    generatedAt: "2026-02-12T15:00:00.000Z",
  })

  assert.equal(parsed.components.length, 1)
  assert.equal(parsed.components[0].id, "xo")
  assert.equal(parsed.components[0].status, "warning")

  assert.equal(parsed.edges.length, 1)
  assert.equal(parsed.edges[0].edgeType, "control")

  assert.equal(parsed.groups.users.label, "Operator Surfaces")
  assert.deepEqual(parsed.groupOrder.slice(0, 2), ["bridge", "users"])
  assert.equal(parsed.commandHierarchy.length, 1)
  assert.equal(parsed.commandHierarchy[0].tier, 2)

  assert.equal(parsed.availableShips.length, 1)
  assert.equal(parsed.availableShips[0].name, "USS Test")
  assert.equal(parsed.kubeview.enabled, true)
  assert.equal(parsed.kubeview.ingressEnabled, false)
  assert.equal(parsed.kubeview.url, null)
  assert.equal(parsed.kubeview.source, "terraform_output")
  assert.equal(parsed.selectedShipDeploymentId, "ship-1")
  assert.equal(parsed.generatedAt, "2026-02-12T15:00:00.000Z")
})

test("parseUssK8sTopologyResponse sanitizes invalid entries", () => {
  const parsed = parseUssK8sTopologyResponse({
    components: [
      {
        id: "bad-component",
        label: "Bad",
        group: "not-a-group",
        componentType: "agent",
      },
      {
        id: "eng",
        label: "ENG",
        group: "bridge",
        componentType: "agent",
      },
    ],
    edges: [
      {
        source: "eng",
        target: "xo",
        edgeType: "invalid",
      },
      {
        source: "eng",
        target: "xo",
        edgeType: "control",
      },
    ],
    availableShips: [
      {
        id: "ship-invalid",
        name: "Broken",
        status: "unknown",
        nodeType: "local",
        deploymentProfile: "local_starship_build",
      },
      {
        id: "ship-valid",
        name: "USS Valid",
        status: "active",
        nodeId: "node-2",
        nodeType: "cloud",
        deploymentProfile: "cloud_shipyard",
      },
    ],
    kubeview: {
      enabled: "yes",
      ingressEnabled: "no",
      url: "  ",
      source: "bogus",
      reason: "",
    },
    generatedAt: "not-a-date",
  })

  assert.deepEqual(parsed.components.map((component) => component.id), ["eng"])
  assert.deepEqual(parsed.edges.map((edge) => `${edge.source}->${edge.target}`), ["eng->xo"])
  assert.deepEqual(parsed.availableShips.map((ship) => ship.id), ["ship-valid"])
  assert.equal(parsed.kubeview.url, null)
  assert.equal(parsed.kubeview.source, "unavailable")
  assert.equal(parsed.kubeview.reason, "KubeView data unavailable.")
  assert.equal(parsed.generatedAt, null)
})

test("parseUssK8sTopologyResponse falls back to defaults when optional fields are missing", () => {
  const parsed = parseUssK8sTopologyResponse({})

  assert.equal(parsed.components.length, USS_K8S_COMPONENTS.length)
  assert.equal(parsed.edges.length, USS_K8S_EDGES.length)
  assert.deepEqual(parsed.groupOrder, GROUP_ORDER)
  assert.equal(parsed.commandHierarchy.length, USS_K8S_COMMAND_HIERARCHY.length)

  assert.equal(parsed.groups.bridge.label, SUBSYSTEM_GROUP_CONFIG.bridge.label)
  assert.equal(parsed.availableShips.length, 0)
  assert.equal(parsed.kubeview.enabled, false)
  assert.equal(parsed.kubeview.ingressEnabled, false)
  assert.equal(parsed.kubeview.url, null)
  assert.equal(parsed.selectedShipDeploymentId, null)
  assert.equal(parsed.generatedAt, null)
})
