import assert from "node:assert/strict"
import test from "node:test"
import {
  buildShipyardSetupSnippets,
  resolveShipyardSecretTemplateValues,
  ShipyardSecretVaultError,
  storeShipyardSecretTemplateEnvelope,
  summarizeStoredShipyardSecretTemplate,
  validateShipyardSecretTemplateValues,
} from "./secret-vault"

function withEnv<T>(patch: Record<string, string | undefined>, run: () => Promise<T>): Promise<T> {
  const original: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(patch)) {
    original[key] = process.env[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  return run().finally(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  })
}

test("validateShipyardSecretTemplateValues rejects invalid field types and profile-specific mismatches", () => {
  assert.throws(
    () =>
      validateShipyardSecretTemplateValues({
        deploymentProfile: "local_starship_build",
        values: {
          better_auth_secret: 123,
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof ShipyardSecretVaultError)
      assert.equal((error as ShipyardSecretVaultError).code, "SHIPYARD_SECRET_FIELD_INVALID")
      return true
    },
  )

  assert.throws(
    () =>
      validateShipyardSecretTemplateValues({
        deploymentProfile: "local_starship_build",
        values: {
          database_url: "postgresql://example",
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof ShipyardSecretVaultError)
      assert.equal((error as ShipyardSecretVaultError).code, "SHIPYARD_SECRET_FIELD_PROFILE_MISMATCH")
      return true
    },
  )
})

test("validateShipyardSecretTemplateValues allows n8n fields for both deployment profiles", () => {
  const local = validateShipyardSecretTemplateValues({
    deploymentProfile: "local_starship_build",
    values: {
      n8n_database_url: "postgresql://n8n:secret@localhost:5432/n8n?schema=public",
      n8n_basic_auth_user: "captain",
      n8n_basic_auth_password: "secret-pass",
      n8n_encryption_key: "12345678901234567890123456789012",
      n8n_public_base_url: "https://n8n.local",
    },
  })
  assert.equal(local.n8n_basic_auth_user, "captain")
  assert.equal(local.n8n_public_base_url, "https://n8n.local")

  const cloud = validateShipyardSecretTemplateValues({
    deploymentProfile: "cloud_shipyard",
    values: {
      n8n_database_url: "postgresql://n8n:secret@cloud-db:5432/n8n?schema=public",
      n8n_basic_auth_user: "ops",
      n8n_basic_auth_password: "secret-pass-2",
      n8n_encryption_key: "abcdefghijklmnopqrstuvxyz012345",
      n8n_public_base_url: "https://n8n.example.com",
    },
  })
  assert.equal(cloud.n8n_basic_auth_user, "ops")
  assert.equal(cloud.n8n_public_base_url, "https://n8n.example.com")
})

test("storeShipyardSecretTemplateEnvelope falls back to plaintext envelope when encryption is optional", async () => {
  await withEnv(
    {
      WALLET_ENCLAVE_ENABLED: "false",
      WALLET_ENCLAVE_REQUIRE_PRIVATE_MEMORY_ENCRYPTION: "false",
    },
    async () => {
      const stored = await storeShipyardSecretTemplateEnvelope({
        userId: "usr_1",
        deploymentProfile: "local_starship_build",
        values: {
          better_auth_secret: "secret-one",
          github_client_id: "gh-client-id",
          github_client_secret: "gh-client-secret",
          openai_api_key: "openai-key",
          openclaw_api_key: "openclaw-key",
          postgres_password: "postgres-pass",
        },
      })

      assert.equal(stored.storageMode, "plaintext-fallback")

      const resolved = await resolveShipyardSecretTemplateValues({
        userId: "usr_1",
        deploymentProfile: "local_starship_build",
        stored,
      })

      assert.equal(resolved.better_auth_secret, "secret-one")
      assert.equal(resolved.postgres_password, "postgres-pass")

      const summary = summarizeStoredShipyardSecretTemplate({
        deploymentProfile: "local_starship_build",
        stored,
        resolvedValues: resolved,
      })
      assert.equal(summary.storageMode, "plaintext-fallback")
      assert.equal(summary.hasValue, true)
      assert.equal(summary.fields.better_auth_secret.hasValue, true)
      assert.equal(summary.fields.better_auth_secret.maskedValue, "********-one")
    },
  )
})

test("storeShipyardSecretTemplateEnvelope returns encrypted envelope and resolve decrypts through wallet enclave", async () => {
  const originalFetch = globalThis.fetch

  await withEnv(
    {
      WALLET_ENCLAVE_ENABLED: "true",
      WALLET_ENCLAVE_REQUIRE_PRIVATE_MEMORY_ENCRYPTION: "true",
      WALLET_ENCLAVE_URL: "http://127.0.0.1:3377",
    },
    async () => {
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const body = JSON.parse(String(init?.body || "{}")) as Record<string, string>

        if (url.endsWith("/v1/crypto/encrypt")) {
          return new Response(
            JSON.stringify({
              context: body.context,
              ciphertextB64: Buffer.from("ciphertext", "utf8").toString("base64"),
              nonceB64: Buffer.from("nonce", "utf8").toString("base64"),
              alg: "AES-256-GCM",
            }),
            { status: 200 },
          )
        }

        if (url.endsWith("/v1/crypto/decrypt")) {
          return new Response(
            JSON.stringify({
              context: body.context,
              plaintextB64: Buffer.from(
                JSON.stringify({
                  better_auth_secret: "enc-secret",
                  github_client_id: "enc-gh-id",
                  github_client_secret: "enc-gh-secret",
                  openai_api_key: "enc-openai",
                  openclaw_api_key: "enc-openclaw",
                  database_url: "postgresql://enc-db",
                }),
                "utf8",
              ).toString("base64"),
              alg: "AES-256-GCM",
            }),
            { status: 200 },
          )
        }

        return new Response(JSON.stringify({ error: { message: "missing" } }), { status: 404 })
      }) as typeof globalThis.fetch

      const stored = await storeShipyardSecretTemplateEnvelope({
        userId: "usr_2",
        deploymentProfile: "cloud_shipyard",
        values: {
          better_auth_secret: "enc-secret",
          github_client_id: "enc-gh-id",
          github_client_secret: "enc-gh-secret",
          openai_api_key: "enc-openai",
          openclaw_api_key: "enc-openclaw",
          database_url: "postgresql://enc-db",
        },
      })

      assert.equal(stored.storageMode, "encrypted")

      const resolved = await resolveShipyardSecretTemplateValues({
        userId: "usr_2",
        deploymentProfile: "cloud_shipyard",
        stored,
      })

      assert.equal(resolved.database_url, "postgresql://enc-db")
      assert.equal(resolved.better_auth_secret, "enc-secret")

      const summary = summarizeStoredShipyardSecretTemplate({
        deploymentProfile: "cloud_shipyard",
        stored,
        resolvedValues: resolved,
      })
      assert.equal(summary.storageMode, "encrypted")
      assert.equal(summary.fields.database_url.hasValue, true)
      assert.equal(summary.fields.database_url.maskedValue, "********c-db")
    },
  ).finally(() => {
    globalThis.fetch = originalFetch
  })
})

test("storeShipyardSecretTemplateEnvelope fails closed when encryption is required and wallet enclave is disabled", async () => {
  await withEnv(
    {
      WALLET_ENCLAVE_ENABLED: "false",
      WALLET_ENCLAVE_REQUIRE_PRIVATE_MEMORY_ENCRYPTION: "true",
    },
    async () => {
      await assert.rejects(
        () =>
          storeShipyardSecretTemplateEnvelope({
            userId: "usr_3",
            deploymentProfile: "cloud_shipyard",
            values: {
              better_auth_secret: "fail-secret",
            },
          }),
        (error: unknown) => {
          assert.ok(error instanceof ShipyardSecretVaultError)
          assert.equal((error as ShipyardSecretVaultError).code, "WALLET_ENCLAVE_DISABLED")
          return true
        },
      )
    },
  )
})

test("buildShipyardSetupSnippets produces profile-specific tfvars and deterministic output", async () => {
  const localSnippets = buildShipyardSetupSnippets({
    deploymentProfile: "local_starship_build",
    values: {
      better_auth_secret: "local-auth",
      github_client_id: "local-gh-id",
      github_client_secret: "local-gh-secret",
      openai_api_key: "local-openai",
      openclaw_api_key: "local-openclaw",
      n8n_database_url: "postgresql://n8n:secret@localhost:5432/n8n?schema=public",
      n8n_basic_auth_user: "captain",
      n8n_basic_auth_password: "secret-pass",
      n8n_encryption_key: "12345678901234567890123456789012",
      n8n_public_base_url: "https://n8n.local",
      postgres_password: "local-postgres",
    },
  })

  assert.match(localSnippets.envSnippet, /BETTER_AUTH_SECRET=/)
  assert.match(localSnippets.envSnippet, /OPENAI_API_KEY=/)
  assert.match(localSnippets.envSnippet, /N8N_DATABASE_URL=/)
  assert.match(localSnippets.envSnippet, /N8N_BASIC_AUTH_USER=/)
  assert.doesNotMatch(localSnippets.envSnippet, /(^|\n)DATABASE_URL=/)
  assert.match(localSnippets.terraformTfvarsSnippet, /postgres_password =/)
  assert.doesNotMatch(localSnippets.terraformTfvarsSnippet, /database_url =/)
  assert.doesNotMatch(localSnippets.terraformTfvarsSnippet, /N8N_DATABASE_URL/)
  assert.match(localSnippets.terraformTfvarsSnippet, /app_env = \{/)

  const cloudSnippets = buildShipyardSetupSnippets({
    deploymentProfile: "cloud_shipyard",
    values: {
      better_auth_secret: "cloud-auth",
      github_client_id: "cloud-gh-id",
      github_client_secret: "cloud-gh-secret",
      openai_api_key: "cloud-openai",
      openclaw_api_key: "cloud-openclaw",
      n8n_database_url: "postgresql://n8n:secret@cloud-db:5432/n8n?schema=public",
      n8n_basic_auth_user: "ops",
      n8n_basic_auth_password: "secret-pass-2",
      n8n_encryption_key: "abcdefghijklmnopqrstuvxyz012345",
      n8n_public_base_url: "https://n8n.example.com",
      database_url: "postgresql://cloud-db",
    },
  })

  assert.match(cloudSnippets.envSnippet, /DATABASE_URL=/)
  assert.match(cloudSnippets.envSnippet, /N8N_PUBLIC_BASE_URL=/)
  assert.match(cloudSnippets.terraformTfvarsSnippet, /database_url =/)
  assert.doesNotMatch(cloudSnippets.terraformTfvarsSnippet, /postgres_password =/)
})
