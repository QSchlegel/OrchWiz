import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import { AccessControlError } from "@/lib/security/access-control"
import type { ShipyardRequestActor } from "@/lib/shipyard/request-actor"
import { handlePostShipyardLocalClusterReset } from "./route"

const actor: ShipyardRequestActor = {
  userId: "user-1",
  email: "captain@example.com",
  role: "captain",
  isAdmin: false,
  authType: "user_api_key",
  keyId: "kid-1",
}

function resetRequest(body: Record<string, unknown>): NextRequest {
  return new Request("http://localhost/api/ship-yard/local/cluster/reset", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

test("ship-yard local cluster reset returns unauthorized when actor resolution fails", async () => {
  const response = await handlePostShipyardLocalClusterReset(
    resetRequest({ confirm: "reset-cluster" }),
    {
      requireActor: async () => {
        throw new AccessControlError("Unauthorized", 401, "UNAUTHORIZED")
      },
      env: {
        ENABLE_LOCAL_COMMAND_EXECUTION: "true",
      } as NodeJS.ProcessEnv,
      commandExists: () => true,
      runCommand: async () => ({
        ok: true,
        stdout: "",
        stderr: "",
        exitCode: 0,
      }),
    },
  )

  assert.equal(response.status, 401)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.code, "UNAUTHORIZED")
})

test("ship-yard local cluster reset is blocked when local command execution is disabled", async () => {
  let runCalled = false
  const response = await handlePostShipyardLocalClusterReset(
    resetRequest({ confirm: "reset-cluster" }),
    {
      requireActor: async () => actor,
      env: {
        ENABLE_LOCAL_COMMAND_EXECUTION: "false",
      } as NodeJS.ProcessEnv,
      commandExists: () => true,
      runCommand: async () => {
        runCalled = true
        return {
          ok: true,
          stdout: "",
          stderr: "",
          exitCode: 0,
        }
      },
    },
  )

  assert.equal(response.status, 422)
  assert.equal(runCalled, false)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.code, "LOCAL_PROVISIONING_BLOCKED")
})

test("ship-yard local cluster reset recreates kind cluster and validates node readiness", async () => {
  const calls: Array<{ command: string; args: string[] }> = []

  const response = await handlePostShipyardLocalClusterReset(
    resetRequest({ confirm: "reset-cluster", clusterName: "orchwiz" }),
    {
      requireActor: async () => actor,
      env: {
        ENABLE_LOCAL_COMMAND_EXECUTION: "true",
      } as NodeJS.ProcessEnv,
      commandExists: (command) => command === "kind" || command === "kubectl",
      runCommand: async (command, args) => {
        calls.push({ command, args })
        return {
          ok: true,
          stdout: "",
          stderr: "",
          exitCode: 0,
        }
      },
    },
  )

  assert.equal(response.status, 200)
  const payload = (await response.json()) as {
    clusterName: string
    kubeContext: string
    deletedCluster: boolean
    createdCluster: boolean
    commands: string[]
    checks: {
      contextSelected: boolean
      nodesListed: boolean
    }
  }

  assert.equal(payload.clusterName, "orchwiz")
  assert.equal(payload.kubeContext, "kind-orchwiz")
  assert.equal(payload.deletedCluster, true)
  assert.equal(payload.createdCluster, true)
  assert.equal(payload.commands.length, 4)
  assert.equal(payload.checks.contextSelected, true)
  assert.equal(payload.checks.nodesListed, true)

  assert.deepEqual(calls, [
    {
      command: "kind",
      args: ["delete", "cluster", "--name", "orchwiz"],
    },
    {
      command: "kind",
      args: ["create", "cluster", "--name", "orchwiz"],
    },
    {
      command: "kubectl",
      args: ["config", "use-context", "kind-orchwiz"],
    },
    {
      command: "kubectl",
      args: ["--context", "kind-orchwiz", "get", "nodes"],
    },
  ])
})

