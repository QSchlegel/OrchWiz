import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import { AccessControlError } from "@/lib/security/access-control"
import type { DeploymentProfile } from "@/lib/deployment/profile"
import {
  handleDeleteShipyardGhostShips,
  handleGetShipyardGhostShips,
} from "./route"

const actor = {
  userId: "user-1",
  email: "captain@example.com",
  role: "captain",
  isAdmin: false,
  authType: "user_api_key",
  keyId: "kid-1",
}

function getRequest(url: string, method: string): NextRequest {
  return new Request(url, { method }) as unknown as NextRequest
}

function kubeNamespaceListResponse(namespaces: Array<{ name: string; profile: DeploymentProfile }>): string {
  return JSON.stringify({
    items: namespaces.map(({ name, profile }) => ({
      metadata: {
        name,
        labels: {
          "app.kubernetes.io/part-of": "orchwiz",
          "orchwiz/profile": profile,
        },
      },
    })),
  })
}

test("ship-yard ghost ships GET blocks when command execution is disabled", async () => {
  const response = await handleGetShipyardGhostShips(
    getRequest("http://localhost/api/ship-yard/ships/ghosts", "GET"),
    {
      requireActor: async () => actor,
      listActiveShipInfra: async () => [],
      env: {} as NodeJS.ProcessEnv,
      commandExists: () => true,
      runCommand: async () => {
        throw new Error("must not run")
      },
    },
  )

  assert.equal(response.status, 422)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.code, "SHIP_GHOST_CLEANUP_BLOCKED")
})

test("ship-yard ghost ships GET finds namespace ghosts", async () => {
  const calls: string[] = []

  const response = await handleGetShipyardGhostShips(
    getRequest("http://localhost/api/ship-yard/ships/ghosts?deploymentProfile=local_starship_build", "GET"),
    {
      requireActor: async () => actor,
      listActiveShipInfra: async () => [],
      env: { ENABLE_LOCAL_COMMAND_EXECUTION: "true" } as NodeJS.ProcessEnv,
      commandExists: () => true,
      runCommand: async (_command, args) => {
        calls.push(args.join(" "))
        if (args.includes("kind-orchwiz")) {
          return {
            ok: true,
            stdout: kubeNamespaceListResponse([
              { name: "orchwiz-starship", profile: "local_starship_build" },
              { name: "orchwiz-shipyard", profile: "cloud_shipyard" },
            ]),
            stderr: "",
            exitCode: 0,
          }
        }

        return {
          ok: false,
          stdout: "",
          stderr: "unexpected context",
          exitCode: 1,
        }
      },
    },
  )

  assert.equal(response.status, 200)
  const payload = (await response.json()) as {
    ghostCount: number
    ghosts: Array<{ namespace: string; deploymentProfile: DeploymentProfile; kubeContext: string; reason: string }>
  }

  assert.equal(payload.ghostCount, 1)
  assert.equal(payload.ghosts.length, 1)
  assert.equal(payload.ghosts[0]?.namespace, "orchwiz-starship")
  assert.equal(payload.ghosts[0]?.deploymentProfile, "local_starship_build")
  assert.equal(payload.ghosts[0]?.kubeContext, "kind-orchwiz")
  assert.equal(calls.includes("get namespaces -l app.kubernetes.io/part-of=orchwiz --context kind-orchwiz -o json"), true)
})

test("ship-yard ghost ships GET ignores active ship namespaces", async () => {
  const response = await handleGetShipyardGhostShips(
    getRequest("http://localhost/api/ship-yard/ships/ghosts", "GET"),
    {
      requireActor: async () => actor,
      listActiveShipInfra: async () => [
        {
          deploymentProfile: "cloud_shipyard",
          namespace: "orchwiz-shipyard",
          kubeContext: "existing-cluster",
        },
      ],
      env: { ENABLE_LOCAL_COMMAND_EXECUTION: "true" } as NodeJS.ProcessEnv,
      commandExists: () => true,
      runCommand: async (_command, args) => {
        if (args.includes("kind-orchwiz")) {
          return {
            ok: true,
            stdout: kubeNamespaceListResponse([
              { name: "orchwiz-starship", profile: "local_starship_build" },
            ]),
            stderr: "",
            exitCode: 0,
          }
        }

        if (args.includes("existing-cluster")) {
          return {
            ok: true,
            stdout: kubeNamespaceListResponse([
              { name: "orchwiz-shipyard", profile: "cloud_shipyard" },
            ]),
            stderr: "",
            exitCode: 0,
          }
        }

        return {
          ok: false,
          stdout: "",
          stderr: "unexpected context",
          exitCode: 1,
        }
      },
    },
  )

  assert.equal(response.status, 200)
  const payload = (await response.json()) as { ghostCount: number; ghosts: Array<{ namespace: string }>; profiles: DeploymentProfile[] }

  assert.equal(payload.ghostCount, 1)
  assert.equal(payload.profiles.length, 3)
  assert.equal(payload.ghosts.some((ghost) => ghost.namespace === "orchwiz-starship"), true)
  assert.equal(payload.ghosts.some((ghost) => ghost.namespace === "orchwiz-shipyard"), false)
})

test("ship-yard ghost ships DELETE requires explicit confirmation", async () => {
  const response = await handleDeleteShipyardGhostShips(
    getRequest("http://localhost/api/ship-yard/ships/ghosts", "DELETE"),
    {
      requireActor: async () => actor,
      listActiveShipInfra: async () => [],
      env: { ENABLE_LOCAL_COMMAND_EXECUTION: "true" } as NodeJS.ProcessEnv,
      commandExists: () => true,
      runCommand: async () => {
        throw new Error("must not run")
      },
    },
  )

  assert.equal(response.status, 400)
  const payload = (await response.json()) as Record<string, unknown>
  assert.match(
    String(payload.error),
    /Cleanup requires `confirm=delete-ghost-ships`/,
  )
})

test("ship-yard ghost ships DELETE removes orphaned namespace when no active record exists", async () => {
  const deleteCalls: Array<{ namespace: string; context: string }> = []

  const response = await handleDeleteShipyardGhostShips(
    getRequest("http://localhost/api/ship-yard/ships/ghosts?confirm=delete-ghost-ships", "DELETE"),
    {
      requireActor: async () => actor,
      listActiveShipInfra: async () => [
        {
          deploymentProfile: "cloud_shipyard",
          namespace: "orchwiz-shipyard",
          kubeContext: "existing-cluster",
        },
      ],
      env: { ENABLE_LOCAL_COMMAND_EXECUTION: "true" } as NodeJS.ProcessEnv,
      commandExists: () => true,
      runCommand: async (_command, args) => {
        if (args[0] === "delete") {
          const contextFlagIndex = args.indexOf("--context")
          deleteCalls.push({
            namespace: args[2] || "",
            context: contextFlagIndex >= 0 ? args[contextFlagIndex + 1] || "" : "",
          })
          return { ok: true, stdout: "", stderr: "", exitCode: 0 }
        }

        if (args.includes("kind-orchwiz")) {
          return {
            ok: true,
            stdout: kubeNamespaceListResponse([
              { name: "orchwiz-starship", profile: "local_starship_build" },
            ]),
            stderr: "",
            exitCode: 0,
          }
        }

        return {
          ok: true,
          stdout: kubeNamespaceListResponse([
            { name: "orchwiz-shipyard", profile: "cloud_shipyard" },
          ]),
          stderr: "",
          exitCode: 0,
        }
      },
    },
  )

  assert.equal(response.status, 200)
  const payload = (await response.json()) as {
    ghostCount: number
    deletedCount: number
    deletedNamespaces: Array<{ namespace: string; kubeContext: string }>
    failedDeletions: unknown[]
  }

  assert.equal(payload.ghostCount, 1)
  assert.equal(payload.deletedCount, 1)
  assert.equal(payload.deletedNamespaces.length, 1)
  assert.equal(payload.deletedNamespaces[0]?.namespace, "orchwiz-starship")
  assert.equal(payload.failedDeletions.length, 0)
  assert.equal(deleteCalls.length, 1)
  assert.equal(deleteCalls[0]?.namespace, "orchwiz-starship")
  assert.equal(deleteCalls[0]?.context, "kind-orchwiz")
})

test("ship-yard ghost ships GET requires valid deploymentProfile", async () => {
  const response = await handleGetShipyardGhostShips(
    getRequest("http://localhost/api/ship-yard/ships/ghosts?deploymentProfile=bad_profile", "GET"),
    {
      requireActor: async () => actor,
      listActiveShipInfra: async () => [],
      env: { ENABLE_LOCAL_COMMAND_EXECUTION: "true" } as NodeJS.ProcessEnv,
      commandExists: () => true,
      runCommand: async () => ({ ok: true, stdout: "", stderr: "", exitCode: 0 }),
    },
  )

  assert.equal(response.status, 400)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(
    payload.error,
    "deploymentProfile must be one of: local_starship_build, lightweight_shuttle, cloud_shipyard",
  )
})

test("ship-yard ghost ships DELETE blocks unauthorized users", async () => {
  const response = await handleDeleteShipyardGhostShips(
    getRequest("http://localhost/api/ship-yard/ships/ghosts?confirm=delete-ghost-ships", "DELETE"),
    {
      requireActor: async () => {
        throw new AccessControlError("Unauthorized", 401, "UNAUTHORIZED")
      },
      listActiveShipInfra: async () => [],
      env: { ENABLE_LOCAL_COMMAND_EXECUTION: "true" } as NodeJS.ProcessEnv,
      commandExists: () => true,
      runCommand: async () => ({ ok: true, stdout: "", stderr: "", exitCode: 0 }),
    },
  )

  assert.equal(response.status, 401)
  const payload = (await response.json()) as { code: string }
  assert.equal(payload.code, "UNAUTHORIZED")
})
