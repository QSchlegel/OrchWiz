"use client"

import { useCallback, useEffect, useState } from "react"
import { PageLayout, SurfaceCard, InlineNotice } from "@/components/dashboard/PageLayout"

/* ---------- types ---------- */

type EnclaveStatus = "loading" | "running" | "stopped" | "unhealthy" | "disabled"

interface EndpointInfo {
  path: string
  reachable: boolean
  status?: number
}

interface EnclaveInfo {
  status: EnclaveStatus
  url: string
  health?: { ok?: boolean; service?: string; ts?: string }
  config?: {
    enabled: boolean
    requireBridgeSignatures: boolean
    requirePrivateMemoryEncryption: boolean
    sharedSecretConfigured: boolean
    masterSecretConfigured: boolean
    timeoutMs: number
  }
  auth?: "ok" | "unauthorized"
  endpoints?: Record<string, EndpointInfo>
  capabilities?: { signing: boolean; crypto: boolean }
}

type Tab = "overview" | "signing" | "crypto" | "transactions"

const TABS: { key: Tab; label: string; description: string }[] = [
  { key: "overview", label: "Overview", description: "Status, health & configuration" },
  { key: "signing", label: "Credentials & Signing", description: "Address derivation, CIP-8 sign & verify" },
  { key: "crypto", label: "Encrypt / Decrypt", description: "AES-256-GCM context-derived encryption" },
  { key: "transactions", label: "Transactions", description: "Send ADA & mint native tokens" },
]

/* ---------- snippets ---------- */

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

/* ---------- style constants ---------- */

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:placeholder:text-slate-500"
const textareaCls = `${inputCls} resize-none font-mono text-xs`
const btnCls =
  "rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400"
const btnSecondaryCls =
  "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
const btnDangerCls =
  "rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-amber-500 dark:hover:bg-amber-400"

/* ---------- small components ---------- */

function StatusDot({ status }: { status: EnclaveStatus }) {
  const color =
    status === "running"
      ? "bg-emerald-500"
      : status === "stopped"
        ? "bg-slate-400"
        : status === "unhealthy"
          ? "bg-amber-500"
          : status === "disabled"
            ? "bg-rose-400"
            : "bg-slate-300 animate-pulse"
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />
}

function statusLabel(status: EnclaveStatus): string {
  switch (status) {
    case "running": return "Running"
    case "stopped": return "Stopped"
    case "unhealthy": return "Unhealthy"
    case "disabled": return "Disabled"
    default: return "Checking..."
  }
}

function CapabilityBadge({ label, available }: { label: string; available: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        available
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "bg-slate-500/10 text-slate-500 dark:text-slate-400"
      }`}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${available ? "bg-emerald-500" : "bg-slate-400"}`} />
      {label}
    </span>
  )
}

function ConfigFlag({ label, value }: { label: string; value: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-slate-600 dark:text-slate-400">{label}</span>
      <span className={value ? "font-medium text-emerald-600 dark:text-emerald-400" : "text-slate-400 dark:text-slate-500"}>
        {value ? "Yes" : "No"}
      </span>
    </div>
  )
}

function EndpointRow({ name, info }: { name: string; info: EndpointInfo }) {
  const statusColor =
    !info.reachable
      ? "text-slate-400"
      : info.status === 401
        ? "text-rose-500"
        : info.status && info.status < 500
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-amber-500"

  const statusText =
    !info.reachable
      ? "unreachable"
      : info.status === 401
        ? "unauthorized"
        : info.status === 400
          ? "ready"
          : info.status === 403
            ? "policy denied"
            : `${info.status}`

  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <code className="text-slate-700 dark:text-slate-300">{info.path}</code>
      <span className={`font-medium ${statusColor}`}>{statusText}</span>
    </div>
  )
}

function ResultBlock({ json, label }: { json: unknown; label?: string }) {
  return (
    <div className="mt-3">
      {label && <p className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>}
      <pre className="overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100 select-all">
        <code>{typeof json === "string" ? json : JSON.stringify(json, null, 2)}</code>
      </pre>
    </div>
  )
}

function TxResultBlock({ result, label }: { result: { txHash: string; [k: string]: unknown }; label: string }) {
  return (
    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800/40 dark:bg-emerald-900/20">
      <p className="mb-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300">{label}</p>
      <div className="space-y-1.5">
        {Object.entries(result).map(([key, value]) => (
          <div key={key} className="flex items-start gap-2 text-xs">
            <span className="shrink-0 font-medium text-emerald-700 dark:text-emerald-400">{key}</span>
            <span className="break-all font-mono text-slate-800 select-all dark:text-slate-200">{String(value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------- proxy helper ---------- */

async function enclaveProxy(body: Record<string, unknown>): Promise<{ ok: boolean; data: any }> {
  const res = await fetch("/api/wallet-enclave/proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  return { ok: res.ok, data }
}

/* ---------- tab bar ---------- */

function TabBar({ active, onChange, disabled }: { active: Tab; onChange: (t: Tab) => void; disabled: boolean }) {
  return (
    <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-white/5">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          disabled={disabled}
          onClick={() => onChange(tab.key)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
            active === tab.key
              ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100"
              : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

/* ---------- Overview tab ---------- */

function OverviewTab({ info }: { info: EnclaveInfo }) {
  const isRunning = info.status === "running"

  return (
    <div className="space-y-4">
      {isRunning && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <SurfaceCard>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Health</h3>
            <div className="mt-3 space-y-2 text-xs text-slate-600 dark:text-slate-400">
              {info.health?.service && (
                <div className="flex justify-between">
                  <span>Service</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">{info.health.service}</span>
                </div>
              )}
              {info.health?.ts && (
                <div className="flex justify-between">
                  <span>Last heartbeat</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200">
                    {new Date(info.health.ts).toLocaleTimeString()}
                  </span>
                </div>
              )}
              {info.auth && (
                <div className="flex justify-between">
                  <span>Auth</span>
                  <span className={`font-medium ${info.auth === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`}>
                    {info.auth === "ok" ? "OK" : "Unauthorized"}
                  </span>
                </div>
              )}
            </div>
          </SurfaceCard>

          {info.endpoints && (
            <SurfaceCard>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Endpoints</h3>
              <div className="mt-3 space-y-2">
                {Object.entries(info.endpoints).map(([key, ep]) => (
                  <EndpointRow key={key} name={key} info={ep} />
                ))}
              </div>
            </SurfaceCard>
          )}

          {info.config && (
            <SurfaceCard>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Configuration</h3>
              <div className="mt-3 space-y-2">
                <ConfigFlag label="Enabled" value={info.config.enabled} />
                <ConfigFlag label="Bridge Signatures Required" value={info.config.requireBridgeSignatures} />
                <ConfigFlag label="Private Memory Encryption Required" value={info.config.requirePrivateMemoryEncryption} />
                <ConfigFlag label="Shared Secret Configured" value={info.config.sharedSecretConfigured} />
                <ConfigFlag label="Master Secret Configured" value={info.config.masterSecretConfigured} />
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-slate-600 dark:text-slate-400">Timeout</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200">{info.config.timeoutMs}ms</span>
                </div>
              </div>
            </SurfaceCard>
          )}
        </div>
      )}

      {!isRunning && info.config && (
        <SurfaceCard>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Current Configuration</h3>
          <div className="mt-3 grid max-w-md grid-cols-1 gap-2">
            <ConfigFlag label="Enabled" value={info.config.enabled} />
            <ConfigFlag label="Bridge Signatures Required" value={info.config.requireBridgeSignatures} />
            <ConfigFlag label="Private Memory Encryption Required" value={info.config.requirePrivateMemoryEncryption} />
            <ConfigFlag label="Shared Secret Configured" value={info.config.sharedSecretConfigured} />
            <ConfigFlag label="Master Secret Configured" value={info.config.masterSecretConfigured} />
          </div>
        </SurfaceCard>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SurfaceCard>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">What It Does</h3>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-700 dark:text-slate-300">
            <li>Derives Cardano addresses for a given <code>keyRef</code>.</li>
            <li>Signs message payloads using CIP-8 (bridge-agent signatures).</li>
            <li>Encrypts/decrypts sensitive payloads using context-derived AES-256-GCM.</li>
            <li>Sends ADA to recipient addresses on the Cardano network.</li>
            <li>Mints Cardano native tokens with a forge script policy.</li>
          </ul>
        </SurfaceCard>

        <SurfaceCard>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Security Boundary</h3>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-700 dark:text-slate-300">
            <li>Binds to loopback (<code>127.0.0.1</code>), intended as a sidecar/daemon.</li>
            <li>Mnemonic/private key material never leaves enclave process memory.</li>
            <li>Optional shared-secret auth via <code>x-wallet-enclave-token</code>.</li>
            <li>Append-only audit log (<code>audit.jsonl</code>).</li>
          </ul>
        </SurfaceCard>
      </div>

      <SurfaceCard>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Where OrchWiz Uses It</h3>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-700 dark:text-slate-300">
          <li>Bridge connections: signing and encrypted credential storage flows.</li>
          <li>Ship Yard: encrypted secret templates and cloud provider secret storage.</li>
          <li>Security integrations: per-user VirusTotal/MISP credentials.</li>
          <li>Vault: private vault encryption/decryption.</li>
          <li>Observability: optional encrypted trace fields.</li>
        </ul>
      </SurfaceCard>

      <SurfaceCard>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Local Dev Quick Start</h3>
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
          Run the enclave locally, then point the app at it. The shared secret must match on both sides.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
          <code>{localDevSteps}</code>
        </pre>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
          <code>{nodeEnvSnippet}</code>
        </pre>
        <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">
          If you are not running wallet-enclave locally, explicitly disable strict requirements:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
          <code>{disableSnippet}</code>
        </pre>
      </SurfaceCard>

      <SurfaceCard>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Troubleshooting</h3>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-700 dark:text-slate-300">
          <li>
            <code>WALLET_ENCLAVE_DISABLED</code>: enable the client (<code>WALLET_ENCLAVE_ENABLED=true</code>) or disable
            enclave-required flags.
          </li>
          <li>
            <code>WALLET_ENCLAVE_UNREACHABLE</code>: start the enclave process and verify <code>WALLET_ENCLAVE_URL</code>.
          </li>
          <li>
            <code>WALLET_ENCLAVE_REJECTED</code>: confirm <code>WALLET_ENCLAVE_SHARED_SECRET</code> matches both sides.
          </li>
        </ul>
      </SurfaceCard>
    </div>
  )
}

/* ---------- Signing tab ---------- */

function SigningTab() {
  return (
    <div className="space-y-4">
      <PublicCredentialsCard />
      <SignVerifyCard />
    </div>
  )
}

function PublicCredentialsCard() {
  const [keyRef, setKeyRef] = useState("default")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  async function derive() {
    setLoading(true); setError(null); setResult(null)
    const { ok, data } = await enclaveProxy({ action: "addr", keyRef })
    if (ok) setResult(data.result)
    else setError(data.error || "Failed to derive address.")
    setLoading(false)
  }

  return (
    <SurfaceCard>
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Public Credentials</h3>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Derive a Cardano address for a given key reference.
      </p>
      <div className="mt-3 flex items-end gap-2">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Key Reference</label>
          <input className={inputCls} value={keyRef} onChange={(e) => setKeyRef(e.target.value)} placeholder="default" />
        </div>
        <button type="button" className={btnCls} disabled={loading || !keyRef.trim()} onClick={derive}>
          {loading ? "Deriving..." : "Derive"}
        </button>
      </div>
      {error && <div className="mt-3"><InlineNotice variant="error">{error}</InlineNotice></div>}
      {result && (
        <div className="mt-3 space-y-1.5">
          <div className="flex items-start gap-2 text-xs">
            <span className="shrink-0 font-medium text-slate-600 dark:text-slate-400">Chain</span>
            <span className="font-mono text-slate-800 dark:text-slate-200">{result.chain}</span>
          </div>
          <div className="flex items-start gap-2 text-xs">
            <span className="shrink-0 font-medium text-slate-600 dark:text-slate-400">Key Ref</span>
            <span className="font-mono text-slate-800 dark:text-slate-200">{result.keyRef}</span>
          </div>
          <div className="text-xs">
            <span className="font-medium text-slate-600 dark:text-slate-400">Address</span>
            <p className="mt-0.5 break-all rounded-lg bg-slate-100 px-2 py-1.5 font-mono text-slate-800 select-all dark:bg-white/5 dark:text-slate-200">
              {result.address}
            </p>
          </div>
        </div>
      )}
    </SurfaceCard>
  )
}

function SignVerifyCard() {
  const [keyRef, setKeyRef] = useState("default")
  const [payload, setPayload] = useState("")
  const [loading, setLoading] = useState(false)
  const [signResult, setSignResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const [verifyKey, setVerifyKey] = useState("")
  const [verifySignature, setVerifySignature] = useState("")
  const [verifyPayload, setVerifyPayload] = useState("")
  const [verifyResult, setVerifyResult] = useState<"valid" | "invalid" | null>(null)
  const [verifying, setVerifying] = useState(false)

  async function sign() {
    setLoading(true); setError(null); setSignResult(null)
    const { ok, data } = await enclaveProxy({ action: "sign", keyRef, payload })
    if (ok) {
      setSignResult(data.result)
      setVerifyKey(data.result.key)
      setVerifySignature(data.result.signature)
      setVerifyPayload(payload)
    } else {
      setError(data.error || "Failed to sign payload.")
    }
    setLoading(false)
  }

  async function verify() {
    setVerifying(true); setVerifyResult(null)
    const { ok, data } = await enclaveProxy({ action: "sign", keyRef, payload: verifyPayload })
    if (ok) {
      const match = data.result.key === verifyKey && data.result.signature === verifySignature
      setVerifyResult(match ? "valid" : "invalid")
    } else {
      setVerifyResult("invalid")
    }
    setVerifying(false)
  }

  return (
    <SurfaceCard>
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Sign &amp; Verify</h3>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Sign a message payload with CIP-8, then verify it by re-signing.
      </p>

      <div className="mt-3 space-y-2">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Key Reference</label>
            <input className={inputCls} value={keyRef} onChange={(e) => setKeyRef(e.target.value)} placeholder="default" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Payload</label>
            <input className={inputCls} value={payload} onChange={(e) => setPayload(e.target.value)} placeholder="hello world" />
          </div>
        </div>
        <button type="button" className={btnCls} disabled={loading || !keyRef.trim() || !payload.trim()} onClick={sign}>
          {loading ? "Signing..." : "Sign Payload"}
        </button>
      </div>
      {error && <div className="mt-3"><InlineNotice variant="error">{error}</InlineNotice></div>}
      {signResult && <ResultBlock json={signResult} label="Signature Result" />}

      {signResult && (
        <div className="mt-4 border-t border-slate-200/70 pt-4 dark:border-white/10">
          <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">Verify Signature</h4>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Re-signs the payload with the same key and compares the output.
          </p>
          <div className="mt-2 space-y-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Payload to verify</label>
              <input className={inputCls} value={verifyPayload} onChange={(e) => { setVerifyPayload(e.target.value); setVerifyResult(null) }} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Public Key (hex)</label>
              <input className={inputCls} value={verifyKey} onChange={(e) => { setVerifyKey(e.target.value); setVerifyResult(null) }} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Signature (hex)</label>
              <input className={inputCls} value={verifySignature} onChange={(e) => { setVerifySignature(e.target.value); setVerifyResult(null) }} />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className={btnCls}
                disabled={verifying || !verifyPayload.trim() || !verifyKey.trim() || !verifySignature.trim()}
                onClick={verify}
              >
                {verifying ? "Verifying..." : "Verify"}
              </button>
              {verifyResult === "valid" && (
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Signature valid</span>
              )}
              {verifyResult === "invalid" && (
                <span className="text-xs font-semibold text-rose-500">Signature mismatch</span>
              )}
            </div>
          </div>
        </div>
      )}
    </SurfaceCard>
  )
}

/* ---------- Crypto tab ---------- */

function CryptoTab() {
  return (
    <div className="space-y-4">
      <EncryptDecryptCard />
    </div>
  )
}

function EncryptDecryptCard() {
  const [context, setContext] = useState("test-context")
  const [plaintext, setPlaintext] = useState("")
  const [encrypting, setEncrypting] = useState(false)
  const [encryptResult, setEncryptResult] = useState<any>(null)
  const [encryptError, setEncryptError] = useState<string | null>(null)

  const [decContext, setDecContext] = useState("")
  const [decCiphertext, setDecCiphertext] = useState("")
  const [decNonce, setDecNonce] = useState("")
  const [decrypting, setDecrypting] = useState(false)
  const [decryptResult, setDecryptResult] = useState<any>(null)
  const [decryptError, setDecryptError] = useState<string | null>(null)

  async function encrypt() {
    setEncrypting(true); setEncryptError(null); setEncryptResult(null)
    const { ok, data } = await enclaveProxy({ action: "encrypt", context, plaintext })
    if (ok) {
      setEncryptResult(data.result)
      setDecContext(data.result.context)
      setDecCiphertext(data.result.ciphertextB64)
      setDecNonce(data.result.nonceB64)
    } else {
      setEncryptError(data.error || "Encryption failed.")
    }
    setEncrypting(false)
  }

  async function decrypt() {
    setDecrypting(true); setDecryptError(null); setDecryptResult(null)
    const { ok, data } = await enclaveProxy({
      action: "decrypt",
      context: decContext,
      ciphertextB64: decCiphertext,
      nonceB64: decNonce,
    })
    if (ok) setDecryptResult(data.result)
    else setDecryptError(data.error || "Decryption failed.")
    setDecrypting(false)
  }

  return (
    <SurfaceCard>
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Encrypt &amp; Decrypt</h3>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        AES-256-GCM encryption using context-derived keys from the enclave master secret.
      </p>

      <div className="mt-3 space-y-2">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Context</label>
            <input className={inputCls} value={context} onChange={(e) => setContext(e.target.value)} placeholder="my-context" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Plaintext</label>
            <input className={inputCls} value={plaintext} onChange={(e) => setPlaintext(e.target.value)} placeholder="secret message" />
          </div>
        </div>
        <button type="button" className={btnCls} disabled={encrypting || !context.trim() || !plaintext.trim()} onClick={encrypt}>
          {encrypting ? "Encrypting..." : "Encrypt"}
        </button>
      </div>
      {encryptError && <div className="mt-3"><InlineNotice variant="error">{encryptError}</InlineNotice></div>}
      {encryptResult && <ResultBlock json={encryptResult} label="Ciphertext" />}

      <div className="mt-4 border-t border-slate-200/70 pt-4 dark:border-white/10">
        <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">Decrypt</h4>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Paste ciphertext and nonce from an encrypt result, or enter your own values.
        </p>
        <div className="mt-2 space-y-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Context</label>
            <input className={inputCls} value={decContext} onChange={(e) => setDecContext(e.target.value)} placeholder="my-context" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Ciphertext (base64)</label>
            <textarea className={textareaCls} rows={2} value={decCiphertext} onChange={(e) => setDecCiphertext(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Nonce (base64)</label>
            <input className={inputCls} value={decNonce} onChange={(e) => setDecNonce(e.target.value)} />
          </div>
          <button
            type="button"
            className={btnCls}
            disabled={decrypting || !decContext.trim() || !decCiphertext.trim() || !decNonce.trim()}
            onClick={decrypt}
          >
            {decrypting ? "Decrypting..." : "Decrypt"}
          </button>
        </div>
        {decryptError && <div className="mt-3"><InlineNotice variant="error">{decryptError}</InlineNotice></div>}
        {decryptResult && (
          <div className="mt-3 space-y-1.5">
            <div className="text-xs">
              <span className="font-medium text-slate-600 dark:text-slate-400">Decrypted Plaintext</span>
              <p className="mt-0.5 break-all rounded-lg bg-emerald-50 px-2 py-1.5 font-mono text-slate-800 select-all dark:bg-emerald-900/20 dark:text-emerald-200">
                {decryptResult.plaintextUtf8}
              </p>
            </div>
            <ResultBlock json={decryptResult} label="Full Response" />
          </div>
        )}
      </div>
    </SurfaceCard>
  )
}

/* ---------- Transactions tab ---------- */

function TransactionsTab() {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300">
        Transactions are submitted to the Cardano network and are irreversible. Double-check addresses and amounts before submitting. Requires <code className="font-mono">CARDANO_PROVIDER_API_KEY</code> (Blockfrost) to be configured in the enclave.
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SendAdaCard />
        <MintTokenCard />
      </div>
    </div>
  )
}

function SendAdaCard() {
  const [keyRef, setKeyRef] = useState("default")
  const [recipientAddress, setRecipientAddress] = useState("")
  const [adaAmount, setAdaAmount] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const lovelace = (() => {
    const parsed = parseFloat(adaAmount)
    if (isNaN(parsed) || parsed <= 0) return ""
    return Math.round(parsed * 1_000_000).toString()
  })()

  const canSubmit = keyRef.trim() && recipientAddress.trim() && lovelace

  function handleSubmitClick() {
    if (!canSubmit) return
    setConfirmOpen(true)
  }

  async function confirmSend() {
    setConfirmOpen(false)
    setLoading(true); setError(null); setResult(null)
    const { ok, data } = await enclaveProxy({
      action: "send-ada",
      keyRef,
      recipientAddress,
      lovelace,
    })
    if (ok) setResult(data.result)
    else setError(data.error || "Transaction failed.")
    setLoading(false)
  }

  return (
    <SurfaceCard>
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Send ADA</h3>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Send ADA from an enclave-managed wallet to a recipient address.
      </p>

      <div className="mt-3 space-y-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Key Reference</label>
          <input className={inputCls} value={keyRef} onChange={(e) => setKeyRef(e.target.value)} placeholder="default" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Recipient Address</label>
          <textarea
            className={textareaCls}
            rows={2}
            value={recipientAddress}
            onChange={(e) => setRecipientAddress(e.target.value)}
            placeholder="addr_test1q..."
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Amount (ADA)</label>
          <input
            className={inputCls}
            type="number"
            step="0.000001"
            min="0"
            value={adaAmount}
            onChange={(e) => setAdaAmount(e.target.value)}
            placeholder="1.5"
          />
          {lovelace && (
            <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">= {Number(lovelace).toLocaleString()} lovelace</p>
          )}
        </div>

        {!confirmOpen && (
          <button type="button" className={btnDangerCls} disabled={loading || !canSubmit} onClick={handleSubmitClick}>
            {loading ? "Sending..." : "Send ADA"}
          </button>
        )}

        {confirmOpen && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700/50 dark:bg-amber-900/20">
            <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
              Confirm: Send {adaAmount} ADA ({Number(lovelace).toLocaleString()} lovelace) to:
            </p>
            <p className="mt-1 break-all font-mono text-xs text-amber-700 dark:text-amber-400">{recipientAddress}</p>
            <div className="mt-2 flex gap-2">
              <button type="button" className={btnDangerCls} onClick={confirmSend}>
                Confirm &amp; Send
              </button>
              <button type="button" className={btnSecondaryCls} onClick={() => setConfirmOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {error && <div className="mt-3"><InlineNotice variant="error">{error}</InlineNotice></div>}
      {result && <TxResultBlock result={result} label="Transaction Submitted" />}
    </SurfaceCard>
  )
}

function MintTokenCard() {
  const [keyRef, setKeyRef] = useState("default")
  const [assetName, setAssetName] = useState("")
  const [quantity, setQuantity] = useState("1")
  const [recipientAddress, setRecipientAddress] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const validQuantity = /^\d+$/u.test(quantity) && parseInt(quantity, 10) > 0

  const canSubmit = keyRef.trim() && assetName.trim() && validQuantity

  function handleSubmitClick() {
    if (!canSubmit) return
    setConfirmOpen(true)
  }

  async function confirmMint() {
    setConfirmOpen(false)
    setLoading(true); setError(null); setResult(null)
    const { ok, data } = await enclaveProxy({
      action: "mint-token",
      keyRef,
      assetName,
      quantity,
      ...(recipientAddress.trim() ? { recipientAddress: recipientAddress.trim() } : {}),
    })
    if (ok) setResult(data.result)
    else setError(data.error || "Minting failed.")
    setLoading(false)
  }

  return (
    <SurfaceCard>
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Mint Native Token</h3>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Mint a Cardano native token using a forge script derived from the wallet address.
      </p>

      <div className="mt-3 space-y-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Key Reference</label>
          <input className={inputCls} value={keyRef} onChange={(e) => setKeyRef(e.target.value)} placeholder="default" />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Asset Name</label>
            <input
              className={inputCls}
              value={assetName}
              onChange={(e) => setAssetName(e.target.value)}
              placeholder="MyToken"
              maxLength={32}
            />
            {assetName && (
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{assetName.length}/32 chars</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Quantity</label>
            <input
              className={inputCls}
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="1"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            Recipient Address <span className="text-slate-400">(optional, defaults to own wallet)</span>
          </label>
          <textarea
            className={textareaCls}
            rows={2}
            value={recipientAddress}
            onChange={(e) => setRecipientAddress(e.target.value)}
            placeholder="addr_test1q... (leave empty for self)"
          />
        </div>

        {!confirmOpen && (
          <button type="button" className={btnDangerCls} disabled={loading || !canSubmit} onClick={handleSubmitClick}>
            {loading ? "Minting..." : "Mint Token"}
          </button>
        )}

        {confirmOpen && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700/50 dark:bg-amber-900/20">
            <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
              Confirm: Mint {quantity}x &quot;{assetName}&quot;
              {recipientAddress.trim() ? " to:" : " to own wallet"}
            </p>
            {recipientAddress.trim() && (
              <p className="mt-1 break-all font-mono text-xs text-amber-700 dark:text-amber-400">{recipientAddress}</p>
            )}
            <div className="mt-2 flex gap-2">
              <button type="button" className={btnDangerCls} onClick={confirmMint}>
                Confirm &amp; Mint
              </button>
              <button type="button" className={btnSecondaryCls} onClick={() => setConfirmOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {error && <div className="mt-3"><InlineNotice variant="error">{error}</InlineNotice></div>}
      {result && <TxResultBlock result={result} label="Token Minted" />}
    </SurfaceCard>
  )
}

/* ---------- main page ---------- */

export default function WalletEnclavePage() {
  const [info, setInfo] = useState<EnclaveInfo>({ status: "loading", url: "" })
  const [launching, setLaunching] = useState(false)
  const [launchMessage, setLaunchMessage] = useState<string | null>(null)
  const [launchError, setLaunchError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>("overview")

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/wallet-enclave/status")
      const data = await res.json()
      setInfo(data as EnclaveInfo)
    } catch {
      setInfo((prev) => ({ ...prev, status: "stopped" }))
    }
  }, [])

  useEffect(() => {
    checkStatus()
    const interval = setInterval(checkStatus, 10_000)
    return () => clearInterval(interval)
  }, [checkStatus])

  async function handleLaunch() {
    setLaunching(true)
    setLaunchMessage(null)
    setLaunchError(null)

    try {
      const res = await fetch("/api/wallet-enclave/launch", { method: "POST" })
      const data = await res.json()

      if (res.ok) {
        setLaunchMessage(data.message || "Wallet enclave started.")
        await checkStatus()
      } else {
        setLaunchError(data.error || "Failed to launch wallet enclave.")
      }
    } catch {
      setLaunchError("Network error: could not reach the launch endpoint.")
    } finally {
      setLaunching(false)
    }
  }

  const canLaunch = info.status === "stopped" || info.status === "unhealthy"
  const isRunning = info.status === "running"

  return (
    <PageLayout
      title="Wallet Enclave"
      description="Local-only sidecar for Cardano signing, encryption, transactions, and token minting. Keeps mnemonic/key material out of the main app process."
    >
      <div className="space-y-4">
        {/* Status bar */}
        <SurfaceCard>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <StatusDot status={info.status} />
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {statusLabel(info.status)}
                </p>
                {info.url && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">{info.url}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isRunning && info.capabilities && (
                <div className="mr-2 flex gap-1.5">
                  <CapabilityBadge label="Signing" available={info.capabilities.signing} />
                  <CapabilityBadge label="Crypto" available={info.capabilities.crypto} />
                </div>
              )}
              <button type="button" onClick={checkStatus} className={btnSecondaryCls}>
                Refresh
              </button>
              <button
                type="button"
                onClick={handleLaunch}
                disabled={!canLaunch || launching}
                className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-400"
              >
                {launching ? "Launching..." : "Launch Enclave"}
              </button>
            </div>
          </div>

          {isRunning && info.auth === "unauthorized" && (
            <div className="mt-3">
              <InlineNotice variant="error">
                Auth token mismatch. The enclave requires <code>x-wallet-enclave-token</code> but the configured
                <code> WALLET_ENCLAVE_SHARED_SECRET</code> was rejected. Check both sides match.
              </InlineNotice>
            </div>
          )}

          {launchMessage && (
            <div className="mt-3">
              <InlineNotice variant="success">{launchMessage}</InlineNotice>
            </div>
          )}
          {launchError && (
            <div className="mt-3">
              <InlineNotice variant="error">{launchError}</InlineNotice>
            </div>
          )}
        </SurfaceCard>

        {/* Tab bar */}
        <TabBar active={activeTab} onChange={setActiveTab} disabled={!isRunning && activeTab !== "overview"} />

        {/* Tab content */}
        {activeTab === "overview" && <OverviewTab info={info} />}
        {activeTab === "signing" && isRunning && <SigningTab />}
        {activeTab === "crypto" && isRunning && <CryptoTab />}
        {activeTab === "transactions" && isRunning && <TransactionsTab />}

        {!isRunning && activeTab !== "overview" && (
          <SurfaceCard>
            <div className="py-8 text-center">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                The wallet enclave must be running to use this feature.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab("overview")}
                className={`${btnSecondaryCls} mt-3`}
              >
                Go to Overview
              </button>
            </div>
          </SurfaceCard>
        )}
      </div>
    </PageLayout>
  )
}
