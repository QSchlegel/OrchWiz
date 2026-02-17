import assert from "node:assert/strict"
import test from "node:test"
import {
  applyN8NBootstrapDefaults,
  buildDefaultN8NDatabaseUrl,
  buildDefaultN8NPublicBaseUrl,
  buildLocalDefaultN8NDatabaseUrl,
  defaultN8NPublicBaseUrlFallback,
  listMissingRequiredN8NSecrets,
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

test("buildDefaultN8NDatabaseUrl uses databaseUrl for local when provided (e.g. from cluster)", () => {
  const fromCluster = "postgresql://orchwiz:secret@orchwiz-postgres-postgresql.orchwiz-test.svc.cluster.local:5432/orchis?schema=public"
  const result = buildDefaultN8NDatabaseUrl({
    deploymentProfile: "local_starship_build",
    namespace: "orchwiz-test",
    postgresPassword: "local-secret",
    databaseUrl: fromCluster,
  })

  assert.equal(result, fromCluster)
})

test("buildDefaultN8NDatabaseUrl derives local url from namespace and postgres password when databaseUrl absent", () => {
  const result = buildDefaultN8NDatabaseUrl({
    deploymentProfile: "local_starship_build",
    namespace: "orchwiz-test",
    postgresPassword: "local-secret",
    databaseUrl: null,
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

test("applyN8NBootstrapDefaults fills empty n8n fields with defaults when generateRandomSecret provided", () => {
  const context = {
    deploymentProfile: "local_starship_build" as const,
    namespace: "orchwiz-test",
    nodeUrl: "https://ship.example.com",
    postgresPassword: "pg-secret",
    databaseUrl: null as string | null,
  }
  const merged = applyN8NBootstrapDefaults(
    {},
    context,
    { generateRandomSecret: (len) => "a".repeat(len * 2) },
  )

  assert.equal(merged.n8n_basic_auth_user, "captain")
  assert.equal(merged.n8n_basic_auth_password, "a".repeat(64))
  assert.equal(merged.n8n_encryption_key, "a".repeat(64))
  assert.ok(
    merged.n8n_database_url?.includes("postgresql://orchwiz:pg-secret@orchwiz-postgres-postgresql.orchwiz-test"),
  )
  assert.equal(merged.n8n_public_base_url, "https://ship.example.com/n8n")
  assert.equal(listMissingRequiredN8NSecrets(merged).length, 0)
})

test("applyN8NBootstrapDefaults does not overwrite provided values", () => {
  const context = {
    deploymentProfile: "local_starship_build" as const,
    namespace: "orchwiz-test",
    nodeUrl: "https://ship.example.com",
    postgresPassword: "pg-secret",
    databaseUrl: null as string | null,
  }
  const merged = applyN8NBootstrapDefaults(
    {
      n8n_basic_auth_user: "custom-user",
      n8n_public_base_url: "https://custom.n8n.example.com",
    },
    context,
    { generateRandomSecret: (len) => "b".repeat(len * 2) },
  )

  assert.equal(merged.n8n_basic_auth_user, "custom-user")
  assert.equal(merged.n8n_public_base_url, "https://custom.n8n.example.com")
  assert.equal(merged.n8n_basic_auth_password, "b".repeat(64))
  assert.ok(merged.n8n_database_url?.includes("orchwiz-test"))
})

test("applyN8NBootstrapDefaults leaves n8n_database_url missing for local when postgres_password absent", () => {
  const context = {
    deploymentProfile: "local_starship_build" as const,
    namespace: "orchwiz-test",
    nodeUrl: "https://ship.example.com",
    postgresPassword: null as string | null,
    databaseUrl: null as string | null,
  }
  const merged = applyN8NBootstrapDefaults(
    {},
    context,
    { generateRandomSecret: (len) => "c".repeat(len * 2) },
  )

  assert.equal(merged.n8n_database_url, undefined)
  assert.deepEqual(listMissingRequiredN8NSecrets(merged), ["n8n_database_url"])
})

test("applyN8NBootstrapDefaults without generateRandomSecret does not fill password or encryption_key", () => {
  const context = {
    deploymentProfile: "local_starship_build" as const,
    namespace: "orchwiz-test",
    nodeUrl: "https://ship.example.com",
    postgresPassword: "pg-secret",
    databaseUrl: null as string | null,
  }
  const merged = applyN8NBootstrapDefaults({}, context, {})

  assert.equal(merged.n8n_basic_auth_user, "captain")
  assert.equal(merged.n8n_basic_auth_password, undefined)
  assert.equal(merged.n8n_encryption_key, undefined)
  assert.ok(merged.n8n_database_url?.includes("pg-secret"))
  assert.equal(merged.n8n_public_base_url, "https://ship.example.com/n8n")
  assert.ok(listMissingRequiredN8NSecrets(merged).includes("n8n_basic_auth_password"))
  assert.ok(listMissingRequiredN8NSecrets(merged).includes("n8n_encryption_key"))
})
