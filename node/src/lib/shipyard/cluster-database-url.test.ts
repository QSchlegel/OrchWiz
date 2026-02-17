import assert from "node:assert/strict"
import test from "node:test"
import { getDatabaseUrlFromCluster } from "./cluster-database-url"

test("getDatabaseUrlFromCluster returns decoded DATABASE_URL when kubectl returns base64", async () => {
  const url = "postgresql://orchwiz:secret@orchwiz-postgres-postgresql.orchwiz-starship.svc.cluster.local:5432/orchis?schema=public"
  const b64 = Buffer.from(url, "utf8").toString("base64")

  const runCommand = async () => ({ code: 0, stdout: b64 })
  const result = await getDatabaseUrlFromCluster(
    { kubeContext: "kind-orchwiz", namespace: "orchwiz-starship" },
    runCommand,
  )

  assert.equal(result, url)
})

test("getDatabaseUrlFromCluster returns null when kubectl exits non-zero", async () => {
  const runCommand = async () => ({ code: 1, stderr: "secret not found" })
  const result = await getDatabaseUrlFromCluster(
    { kubeContext: "kind-orchwiz", namespace: "orchwiz-starship" },
    runCommand,
  )

  assert.equal(result, null)
})

test("getDatabaseUrlFromCluster returns null when stdout is empty", async () => {
  const runCommand = async () => ({ code: 0, stdout: "" })
  const result = await getDatabaseUrlFromCluster(
    { kubeContext: "kind-orchwiz", namespace: "orchwiz-starship" },
    runCommand,
  )

  assert.equal(result, null)
})

test("getDatabaseUrlFromCluster returns null when decoded value is not postgres URL", async () => {
  const b64 = Buffer.from("mysql://localhost", "utf8").toString("base64")
  const runCommand = async () => ({ code: 0, stdout: b64 })
  const result = await getDatabaseUrlFromCluster(
    { kubeContext: "kind-orchwiz", namespace: "orchwiz-starship" },
    runCommand,
  )

  assert.equal(result, null)
})

test("getDatabaseUrlFromCluster returns null when runCommand throws", async () => {
  const runCommand = async () => {
    throw new Error("kubectl not found")
  }
  const result = await getDatabaseUrlFromCluster(
    { kubeContext: "kind-orchwiz", namespace: "orchwiz-starship" },
    runCommand,
  )

  assert.equal(result, null)
})

test("getDatabaseUrlFromCluster uses custom appName for secret name", async () => {
  const url = "postgresql://custom:pass@custom-env.ns.svc:5432/db"
  const b64 = Buffer.from(url, "utf8").toString("base64")
  let capturedArgs: string[] = []
  const runCommand = async (_cmd: string, args: string[]) => {
    capturedArgs = args
    return { code: 0, stdout: b64 }
  }

  await getDatabaseUrlFromCluster(
    { kubeContext: "ctx", namespace: "ns", appName: "custom-app" },
    runCommand,
  )

  assert.ok(capturedArgs.includes("custom-app-env"), "secret name should be custom-app-env")
})
