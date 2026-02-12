import assert from "node:assert/strict"
import test from "node:test"
import {
  buildDefaultN8NDatabaseUrl,
  buildDefaultN8NPublicBaseUrl,
  buildLocalDefaultN8NDatabaseUrl,
  defaultN8NPublicBaseUrlFallback,
} from "./n8n-bootstrap-defaults"

test("buildLocalDefaultN8NDatabaseUrl derives local n8n url from namespace and postgres password", () => {
  const result = buildLocalDefaultN8NDatabaseUrl({
    deploymentProfile: "local_starship_build",
    namespace: "orchwiz-test",
    postgresPassword: "local-secret",
  })

  assert.equal(
    result,
    "postgresql://orchwiz:local-secret@orchwiz-postgres-postgresql.orchwiz-test.svc.cluster.local:5432/orchis?schema=public",
  )
})

test("buildLocalDefaultN8NDatabaseUrl returns null when postgres password is missing", () => {
  const result = buildLocalDefaultN8NDatabaseUrl({
    deploymentProfile: "local_starship_build",
    namespace: "orchwiz-starship",
    postgresPassword: "",
  })

  assert.equal(result, null)
})

test("buildLocalDefaultN8NDatabaseUrl does not auto-derive for cloud profile", () => {
  const result = buildLocalDefaultN8NDatabaseUrl({
    deploymentProfile: "cloud_shipyard",
    namespace: "orchwiz-shipyard",
    postgresPassword: "cloud-secret",
  })

  assert.equal(result, null)
})

test("buildDefaultN8NDatabaseUrl derives local url from namespace and postgres password", () => {
  const result = buildDefaultN8NDatabaseUrl({
    deploymentProfile: "local_starship_build",
    namespace: "orchwiz-test",
    postgresPassword: "local-secret",
    databaseUrl: "postgresql://ignored",
  })

  assert.equal(
    result,
    "postgresql://orchwiz:local-secret@orchwiz-postgres-postgresql.orchwiz-test.svc.cluster.local:5432/orchis?schema=public",
  )
})

test("buildDefaultN8NDatabaseUrl reuses cloud database_url when present", () => {
  const result = buildDefaultN8NDatabaseUrl({
    deploymentProfile: "cloud_shipyard",
    databaseUrl: "postgresql://cloud-user:cloud-pass@cloud-db:5432/orchwiz?schema=public",
  })

  assert.equal(result, "postgresql://cloud-user:cloud-pass@cloud-db:5432/orchwiz?schema=public")
})

test("buildDefaultN8NDatabaseUrl returns null for cloud when database_url is missing", () => {
  const result = buildDefaultN8NDatabaseUrl({
    deploymentProfile: "cloud_shipyard",
    databaseUrl: "   ",
  })

  assert.equal(result, null)
})

test("buildDefaultN8NPublicBaseUrl derives origin-based /n8n url when nodeUrl is valid", () => {
  const result = buildDefaultN8NPublicBaseUrl({
    deploymentProfile: "local_starship_build",
    nodeUrl: "https://ship.example.com/bridge/path",
  })

  assert.equal(result, "https://ship.example.com/n8n")
})

test("buildDefaultN8NPublicBaseUrl falls back per profile when nodeUrl is missing or invalid", () => {
  const localMissing = buildDefaultN8NPublicBaseUrl({
    deploymentProfile: "local_starship_build",
    nodeUrl: "",
  })
  assert.equal(localMissing, defaultN8NPublicBaseUrlFallback("local_starship_build"))

  const cloudInvalid = buildDefaultN8NPublicBaseUrl({
    deploymentProfile: "cloud_shipyard",
    nodeUrl: "not-a-url",
  })
  assert.equal(cloudInvalid, defaultN8NPublicBaseUrlFallback("cloud_shipyard"))
})
