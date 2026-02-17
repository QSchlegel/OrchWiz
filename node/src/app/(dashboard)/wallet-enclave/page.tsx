"use client"

import { PageLayout, SurfaceCard } from "@/components/dashboard/PageLayout"

const localDevSteps = `cd services/wallet-enclave
npm install
export WALLET_ENCLAVE_MASTER_SECRET="$(openssl rand -base64 32)"
export WALLET_ENCLAVE_SHARED_SECRET="dev-wallet-token"
npm run dev`

const nodeEnvSnippet = `# node/.env
WALLET_ENCLAVE_ENABLED=true
WALLET_ENCLAVE_REQUIRE_PRIVATE_MEMORY_ENCRYPTION=true
WALLET_ENCLAVE_REQUIRE_BRIDGE_SIGNATURES=true
WALLET_ENCLAVE_URL=http://127.0.0.1:3377
WALLET_ENCLAVE_SHARED_SECRET=dev-wallet-token`

const disableSnippet = `# node/.env
WALLET_ENCLAVE_ENABLED=false
WALLET_ENCLAVE_REQUIRE_PRIVATE_MEMORY_ENCRYPTION=false
WALLET_ENCLAVE_REQUIRE_BRIDGE_SIGNATURES=false`

export default function WalletEnclavePage() {
  return (
    <PageLayout
      title="Wallet Enclave"
      description="Local-only sidecar for Cardano signing and private-memory encryption. Designed to keep mnemonic/key material out of the main app process."
    >
      <div className="space-y-4">
        <SurfaceCard>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">What It Does</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-300">
            <li>Derives Cardano addresses for a given <code>keyRef</code>.</li>
            <li>Signs message payloads using CIP-8 (used for bridge-agent signatures).</li>
            <li>Encrypts/decrypts sensitive payloads using context-derived AES-256-GCM (for private memory and secret storage envelopes).</li>
          </ul>
        </SurfaceCard>

        <SurfaceCard>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Security Boundary</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-300">
            <li>Binds to loopback by default (<code>127.0.0.1</code>) and is intended to run as a sidecar/daemon.</li>
            <li>Mnemonic/private key material never leaves enclave process memory via the API.</li>
            <li>Optional shared-secret request auth via <code>x-wallet-enclave-token</code> header (<code>WALLET_ENCLAVE_SHARED_SECRET</code>).</li>
            <li>Maintains an append-only audit log (<code>audit.jsonl</code>).</li>
          </ul>
        </SurfaceCard>

        <SurfaceCard>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Where OrchWiz Uses It</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Wallet-enclave is the crypto backstop for paths that should not handle secrets in-process.
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-300">
            <li>Bridge connections: signing and encrypted credential storage flows.</li>
            <li>Ship Yard: encrypted secret templates and cloud provider secret storage.</li>
            <li>Security integrations: per-user VirusTotal/MISP credentials (encrypted when required).</li>
            <li>Vault: private vault encryption/decryption when private-memory encryption is required.</li>
            <li>Observability: optional encrypted trace fields.</li>
          </ul>
        </SurfaceCard>

        <SurfaceCard>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Configuration</h2>
          <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Node app (client)</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-300">
                <li>
                  <code>WALLET_ENCLAVE_ENABLED</code>: enables client calls (when false, enclave calls fail fast).
                </li>
                <li>
                  <code>WALLET_ENCLAVE_URL</code>: base URL (default <code>http://127.0.0.1:3377</code>).
                </li>
                <li>
                  <code>WALLET_ENCLAVE_TIMEOUT_MS</code>: request timeout (default 4000ms).
                </li>
                <li>
                  <code>WALLET_ENCLAVE_REQUIRE_PRIVATE_MEMORY_ENCRYPTION</code>: fail-closed if encryption is required and enclave is missing.
                </li>
                <li>
                  <code>WALLET_ENCLAVE_REQUIRE_BRIDGE_SIGNATURES</code>: fail-closed if bridge signatures are required and enclave is missing.
                </li>
                <li>
                  <code>WALLET_ENCLAVE_SHARED_SECRET</code>: optional token sent as <code>x-wallet-enclave-token</code>.
                </li>
              </ul>
            </div>

            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Enclave process (server)</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-300">
                <li>
                  <code>WALLET_ENCLAVE_HOST</code>/<code>WALLET_ENCLAVE_PORT</code>: bind target (defaults to loopback + 3377).
                </li>
                <li>
                  <code>WALLET_ENCLAVE_MASTER_SECRET</code>: required for crypto endpoints (key derivation via HKDF).
                </li>
                <li>
                  <code>WALLET_ENCLAVE_SHARED_SECRET</code>: optional header auth token expected by the enclave.
                </li>
                <li>
                  <code>WALLET_ENCLAVE_DATA_DIR</code>: audit/idempotency/policy storage (default <code>/tmp/wallet-enclave</code>).
                </li>
              </ul>
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Local Dev Quick Start</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Run the enclave locally, then point the app at it. The shared secret must match on both sides if enabled.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
            <code>{localDevSteps}</code>
          </pre>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
            <code>{nodeEnvSnippet}</code>
          </pre>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
            If you are not running wallet-enclave locally, explicitly disable strict requirements:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
            <code>{disableSnippet}</code>
          </pre>
        </SurfaceCard>

        <SurfaceCard>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Troubleshooting</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-300">
            <li>
              <code>WALLET_ENCLAVE_DISABLED</code>: enable the client (<code>WALLET_ENCLAVE_ENABLED=true</code>) or disable
              enclave-required flags in local dev.
            </li>
            <li>
              <code>WALLET_ENCLAVE_UNREACHABLE</code>: start the enclave process/sidecar and verify <code>WALLET_ENCLAVE_URL</code>.
            </li>
            <li>
              <code>WALLET_ENCLAVE_REJECTED</code>: if using <code>WALLET_ENCLAVE_SHARED_SECRET</code>, confirm both sides match.
            </li>
          </ul>
        </SurfaceCard>
      </div>
    </PageLayout>
  )
}

