"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { InlineNotice, PageLayout, SurfaceCard } from "@/components/dashboard/PageLayout"
import type { NativeScript, UTxO } from "@meshsdk/core"
import { BrowserWallet } from "@meshsdk/core"
import { enableCip30Wallet, listInstalledCip30WalletKeys, type Cip30Api } from "@/lib/cardano/cip30"
import { decodeFirstVkeyWitness } from "@/lib/cardano/witness"
import {
  addTransaction,
  authSigner,
  freeUtxos,
  getNonce,
  MeshMultisigApiError,
  nativeScript as fetchNativeScript,
  pendingTransactions,
  signTransaction,
  walletIds,
  type MeshWalletId,
  type PendingTx,
} from "@/lib/mesh-multisig/client"
import { buildTreasurySpendTx, type TreasuryNetwork } from "@/lib/treasury/buildTx"

type TreasuryConfigResponse = {
  exists: boolean
  config: {
    meshBaseUrl: string
    network: TreasuryNetwork
    meshWalletId: string
    updatedAt: string | null
  }
  canEdit: boolean
}

type Notice = { type: "info" | "success" | "error"; text: string }

const TOKEN_SESSION_KEY = "orchwiz_mesh_multisig_token"

function asErrorMessage(error: unknown): string {
  if (error instanceof MeshMultisigApiError) return `${error.message} (HTTP ${error.status})`
  if (error instanceof Error) return error.message
  return String(error)
}

function normalizeBaseUrl(value: string): string {
  try {
    const url = new URL(value.trim())
    return url.toString().replace(/\/$/u, "")
  } catch {
    return value.trim()
  }
}

function stripHexPrefix(hex: string): string {
  return hex.startsWith("0x") ? hex.slice(2) : hex
}

function isHexEvenLength(value: string): boolean {
  const normalized = stripHexPrefix(value.trim())
  return normalized.length > 0 && normalized.length % 2 === 0 && /^[0-9a-fA-F]+$/u.test(normalized)
}

function utf8ToHex(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let out = ""
  for (const b of bytes) {
    out += b.toString(16).padStart(2, "0")
  }
  return out
}

function nonceToPayloadHex(nonce: string): string {
  // Mesh's API typically returns a hex-encoded payload already; if it isn't hex,
  // fall back to signing the UTF-8 bytes of the nonce string.
  if (isHexEvenLength(nonce)) return stripHexPrefix(nonce.trim())
  return utf8ToHex(nonce)
}

function adaToLovelace(ada: string): string {
  const raw = ada.trim()
  if (!raw) throw new Error("Amount is required.")
  if (!/^[0-9]+(\\.[0-9]+)?$/u.test(raw)) throw new Error("Amount must be a valid ADA value (e.g. 1.5).")

  const [whole, frac = ""] = raw.split(".")
  const wholePart = BigInt(whole || "0")
  const fracPadded = (frac + "000000").slice(0, 6)
  if (frac.length > 6) throw new Error("ADA supports up to 6 decimal places.")
  const fracPart = BigInt(fracPadded || "0")
  return (wholePart * 1_000_000n + fracPart).toString()
}

function sumLovelace(utxos: UTxO[]): bigint {
  let total = 0n
  for (const utxo of utxos) {
    const lovelace = utxo.output.amount.find((a) => a.unit === "lovelace")?.quantity
    if (!lovelace) continue
    try {
      total += BigInt(lovelace)
    } catch {
      // ignore malformed quantity
    }
  }
  return total
}

function formatAda(lovelace: bigint): string {
  const sign = lovelace < 0n ? "-" : ""
  const abs = lovelace < 0n ? -lovelace : lovelace
  const whole = abs / 1_000_000n
  const frac = (abs % 1_000_000n).toString().padStart(6, "0").replace(/0+$/u, "")
  return frac.length > 0 ? `${sign}${whole}.${frac} ADA` : `${sign}${whole} ADA`
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // ignore
  }
}

export default function TreasuryPage() {
  const [notice, setNotice] = useState<Notice | null>(null)

  const [config, setConfig] = useState<TreasuryConfigResponse | null>(null)
  const [isLoadingConfig, setIsLoadingConfig] = useState(true)
  const [isSavingConfig, setIsSavingConfig] = useState(false)

  const [meshBaseUrl, setMeshBaseUrl] = useState("")
  const [network, setNetwork] = useState<TreasuryNetwork>("preprod")
  const [meshWalletId, setMeshWalletId] = useState("")

  const installedWalletKeys = useMemo(() => listInstalledCip30WalletKeys(), [])
  const [walletKey, setWalletKey] = useState(installedWalletKeys[0] || "")
  const [walletApi, setWalletApi] = useState<Cip30Api | null>(null)
  const [addressHex, setAddressHex] = useState<string>("")

  const [token, setToken] = useState<string>("")
  const [tokenRevealed, setTokenRevealed] = useState(false)
  const [isMintingToken, setIsMintingToken] = useState(false)

  const [discoveredWallets, setDiscoveredWallets] = useState<MeshWalletId[] | null>(null)
  const [isDiscoveringWallets, setIsDiscoveringWallets] = useState(false)

  const [nativeScript, setNativeScript] = useState<NativeScript | null>(null)
  const [scriptAddress, setScriptAddress] = useState<string>("")
  const [utxos, setUtxos] = useState<UTxO[] | null>(null)
  const [pending, setPending] = useState<PendingTx[] | null>(null)
  const [isLoadingTreasury, setIsLoadingTreasury] = useState(false)

  const [recipientBech32, setRecipientBech32] = useState("")
  const [amountAda, setAmountAda] = useState("")
  const [description, setDescription] = useState("")
  const [isProposing, setIsProposing] = useState(false)

  const loadConfig = useCallback(async () => {
    setIsLoadingConfig(true)
    setNotice(null)
    try {
      const response = await fetch("/api/treasury/config", { cache: "no-store" })
      const payload = (await response.json().catch(() => ({}))) as TreasuryConfigResponse | any
      if (!response.ok) {
        setConfig(null)
        setNotice({ type: "error", text: payload?.error || "Failed to load treasury config." })
        return
      }

      setConfig(payload as TreasuryConfigResponse)
      setMeshBaseUrl(typeof payload?.config?.meshBaseUrl === "string" ? payload.config.meshBaseUrl : "")
      setNetwork((payload?.config?.network as TreasuryNetwork) || "preprod")
      setMeshWalletId(typeof payload?.config?.meshWalletId === "string" ? payload.config.meshWalletId : "")
    } catch (error) {
      console.error("Failed to load treasury config:", error)
      setNotice({ type: "error", text: "Failed to load treasury config." })
      setConfig(null)
    } finally {
      setIsLoadingConfig(false)
    }
  }, [])

  useEffect(() => {
    void loadConfig()
  }, [loadConfig])

  useEffect(() => {
    if (typeof window === "undefined") return
    const existing = window.sessionStorage.getItem(TOKEN_SESSION_KEY)
    if (existing && existing.trim()) {
      setToken(existing.trim())
    }
  }, [])

  const saveConfig = async () => {
    if (!config?.canEdit) return
    setIsSavingConfig(true)
    setNotice(null)
    try {
      const response = await fetch("/api/treasury/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meshBaseUrl: normalizeBaseUrl(meshBaseUrl),
          network,
          meshWalletId: meshWalletId.trim(),
        }),
      })

      const payload = (await response.json().catch(() => ({}))) as any
      if (!response.ok) {
        setNotice({ type: "error", text: payload?.error || "Failed to save treasury config." })
        return
      }

      setNotice({ type: "success", text: "Treasury config saved." })
      setConfig(payload as TreasuryConfigResponse)
    } catch (error) {
      console.error("Failed to save treasury config:", error)
      setNotice({ type: "error", text: "Failed to save treasury config." })
    } finally {
      setIsSavingConfig(false)
    }
  }

  const connectWallet = async () => {
    setNotice(null)
    try {
      if (!walletKey) {
        setNotice({ type: "error", text: "Select a wallet first." })
        return
      }

      const api = await enableCip30Wallet(walletKey)
      const changeAddressHex = await api.getChangeAddress()
      setWalletApi(api)
      setAddressHex(stripHexPrefix(changeAddressHex))
      setNotice({ type: "success", text: `Connected to ${walletKey}.` })
    } catch (error) {
      console.error("Failed to connect wallet:", error)
      setNotice({ type: "error", text: asErrorMessage(error) })
    }
  }

  const disconnectWallet = () => {
    setWalletApi(null)
    setAddressHex("")
    setNotice({ type: "info", text: "Disconnected wallet." })
  }

  const mintToken = async () => {
    setNotice(null)
    if (!walletApi || !addressHex) {
      setNotice({ type: "error", text: "Connect a CIP-30 wallet first." })
      return
    }
    const baseUrl = config?.config?.meshBaseUrl || normalizeBaseUrl(meshBaseUrl) || "https://multisig.meshjs.dev"

    setIsMintingToken(true)
    try {
      const { nonce } = await getNonce({ baseUrl, addressHex })
      const signed = await walletApi.signData(addressHex, nonceToPayloadHex(nonce))
      const { token: nextToken } = await authSigner({
        baseUrl,
        addressHex,
        signatureCose: signed.signature,
        keyCose: signed.key,
      })

      setToken(nextToken)
      window.sessionStorage.setItem(TOKEN_SESSION_KEY, nextToken)
      setNotice({ type: "success", text: "Mesh Multisig token minted (stored for this browser session)." })
    } catch (error) {
      console.error("Failed to mint token:", error)
      setNotice({ type: "error", text: asErrorMessage(error) })
    } finally {
      setIsMintingToken(false)
    }
  }

  const discoverWalletIds = async () => {
    setNotice(null)
    if (!token || !addressHex) {
      setNotice({ type: "error", text: "Connect wallet + mint token first." })
      return
    }
    const baseUrl = config?.config?.meshBaseUrl || normalizeBaseUrl(meshBaseUrl) || "https://multisig.meshjs.dev"

    setIsDiscoveringWallets(true)
    try {
      const wallets = await walletIds({ baseUrl, token, addressHex })
      setDiscoveredWallets(wallets)
      if (wallets.length === 1) {
        setMeshWalletId(wallets[0].walletId)
      }
      setNotice({ type: "success", text: `Found ${wallets.length} wallet(s) for this signer.` })
    } catch (error) {
      console.error("Failed to discover wallets:", error)
      setNotice({ type: "error", text: asErrorMessage(error) })
    } finally {
      setIsDiscoveringWallets(false)
    }
  }

  const refreshTreasury = useCallback(async () => {
    setNotice(null)
    const baseUrl = config?.config?.meshBaseUrl || normalizeBaseUrl(meshBaseUrl) || "https://multisig.meshjs.dev"
    const walletId = (config?.config?.meshWalletId || meshWalletId || "").trim()
    if (!token || !addressHex || !walletId) return

    setIsLoadingTreasury(true)
    try {
      const script = await fetchNativeScript({ baseUrl, token, walletId, addressHex })
      setNativeScript(script)

      const { address } = (await import("@meshsdk/core")).serializeNativeScript(script, undefined, network === "mainnet" ? 1 : 0)
      setScriptAddress(address)

      const [nextUtxos, nextPending] = await Promise.all([
        freeUtxos({ baseUrl, token, walletId, addressHex }),
        pendingTransactions({ baseUrl, token, walletId, addressHex }),
      ])
      setUtxos(nextUtxos)
      setPending(nextPending)
    } catch (error) {
      console.error("Failed to refresh treasury:", error)
      setNotice({ type: "error", text: asErrorMessage(error) })
      setUtxos(null)
      setPending(null)
      setNativeScript(null)
      setScriptAddress("")
    } finally {
      setIsLoadingTreasury(false)
    }
  }, [addressHex, config?.config?.meshBaseUrl, config?.config?.meshWalletId, meshBaseUrl, meshWalletId, network, token])

  useEffect(() => {
    void refreshTreasury()
  }, [refreshTreasury])

  const signPending = async (tx: PendingTx) => {
    setNotice(null)
    if (!walletApi || !addressHex || !token) {
      setNotice({ type: "error", text: "Connect wallet + mint token first." })
      return
    }

    const baseUrl = config?.config?.meshBaseUrl || normalizeBaseUrl(meshBaseUrl) || "https://multisig.meshjs.dev"
    const walletId = (config?.config?.meshWalletId || meshWalletId || "").trim()
    if (!walletId) {
      setNotice({ type: "error", text: "Treasury walletId is not configured." })
      return
    }

    try {
      const witnessSet = await walletApi.signTx(tx.txCbor, true)
      const { vkeyHex, signatureHex } = decodeFirstVkeyWitness(witnessSet)
      const result = await signTransaction({
        baseUrl,
        token,
        walletId,
        transactionId: tx.id,
        addressHex,
        vkeyHex,
        signatureHex,
        broadcast: true,
      })

      if (result.submitted) {
        setNotice({ type: "success", text: `Signed + submitted. Tx hash: ${result.txHash || "(pending)"}` })
      } else {
        setNotice({ type: "success", text: "Signature recorded." })
      }

      await refreshTreasury()
    } catch (error) {
      console.error("Failed to sign pending tx:", error)
      setNotice({ type: "error", text: asErrorMessage(error) })
    }
  }

  const proposeSpend = async () => {
    setNotice(null)
    if (!walletApi || !addressHex || !token) {
      setNotice({ type: "error", text: "Connect wallet + mint token first." })
      return
    }

    const baseUrl = config?.config?.meshBaseUrl || normalizeBaseUrl(meshBaseUrl) || "https://multisig.meshjs.dev"
    const walletId = (config?.config?.meshWalletId || meshWalletId || "").trim()
    if (!walletId) {
      setNotice({ type: "error", text: "Treasury walletId is not configured." })
      return
    }
    if (!nativeScript || !utxos) {
      setNotice({ type: "error", text: "Treasury script/UTxOs not loaded yet. Click Refresh." })
      return
    }

    setIsProposing(true)
    try {
      const lovelace = adaToLovelace(amountAda)
      const built = await buildTreasurySpendTx({
        network,
        nativeScript,
        freeUtxos: utxos,
        recipientBech32: recipientBech32.trim(),
        lovelace,
      })

      const witnessSet = await walletApi.signTx(built.unsignedTxCborHex, true)
      const signedTxCbor = BrowserWallet.addBrowserWitnesses(built.unsignedTxCborHex, witnessSet)

      await addTransaction({
        baseUrl,
        token,
        walletId,
        addressHex,
        txCbor: signedTxCbor,
        txJson: built.txJson,
        description: description.trim(),
      })

      setNotice({ type: "success", text: "Spend proposed and partially signed. Added to pending transactions." })
      setRecipientBech32("")
      setAmountAda("")
      setDescription("")
      await refreshTreasury()
    } catch (error) {
      console.error("Failed to propose spend:", error)
      setNotice({ type: "error", text: asErrorMessage(error) })
    } finally {
      setIsProposing(false)
    }
  }

  const canLoadTreasury = Boolean(token && addressHex && (config?.config?.meshWalletId || meshWalletId).trim())

  return (
    <PageLayout
      title="Treasury"
      description="Operate a Cardano multisig treasury via the hosted MeshJS Multisig REST API (nonce + CIP-30 signData auth)."
      actions={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void refreshTreasury()}
            disabled={!canLoadTreasury || isLoadingTreasury}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/[0.06]"
          >
            {isLoadingTreasury ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {notice ? <InlineNotice variant={notice.type}>{notice.text}</InlineNotice> : null}

        <SurfaceCard>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Treasury Config (DB)</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Admins can configure the canonical <code>walletId</code>. All users can view it.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Mesh Base URL
              </label>
              <input
                value={meshBaseUrl}
                onChange={(e) => setMeshBaseUrl(e.target.value)}
                disabled={!config?.canEdit}
                placeholder="https://multisig.meshjs.dev"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100"
              />
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Network
              </label>
              <select
                value={network}
                onChange={(e) => setNetwork(e.target.value as TreasuryNetwork)}
                disabled={!config?.canEdit}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100"
              >
                <option value="preview">preview</option>
                <option value="preprod">preprod</option>
                <option value="mainnet">mainnet</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Mesh Wallet ID
              </label>
              <input
                value={meshWalletId}
                onChange={(e) => setMeshWalletId(e.target.value)}
                disabled={!config?.canEdit}
                placeholder="(required)"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100"
              />
            </div>
          </div>

          {discoveredWallets && discoveredWallets.length > 0 ? (
            <div className="mt-4">
              <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Discovered Wallet IDs
              </label>
              <select
                value={meshWalletId}
                onChange={(e) => setMeshWalletId(e.target.value)}
                disabled={!config?.canEdit}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100"
              >
                {discoveredWallets.map((w) => (
                  <option key={w.walletId} value={w.walletId}>
                    {w.walletName} ({w.walletId})
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void saveConfig()}
              disabled={!config?.canEdit || isSavingConfig || isLoadingConfig}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-black disabled:opacity-60 dark:bg-white dark:text-slate-900"
            >
              {isSavingConfig ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={() => void discoverWalletIds()}
              disabled={!config?.canEdit || isDiscoveringWallets || !token || !addressHex}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/[0.06]"
            >
              {isDiscoveringWallets ? "Discovering..." : "Discover My Wallets"}
            </button>
            {isLoadingConfig ? (
              <span className="self-center text-sm text-slate-600 dark:text-slate-400">Loading...</span>
            ) : null}
            {config?.config?.updatedAt ? (
              <span className="self-center text-sm text-slate-600 dark:text-slate-400">
                Updated: {new Date(config.config.updatedAt).toLocaleString()}
              </span>
            ) : null}
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Wallet Connection (CIP-30)</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Wallet
              </label>
              <select
                value={walletKey}
                onChange={(e) => setWalletKey(e.target.value)}
                disabled={Boolean(walletApi)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100"
              >
                <option value="">(select)</option>
                {installedWalletKeys.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                Detected: {installedWalletKeys.length > 0 ? installedWalletKeys.join(", ") : "none"}
              </p>
            </div>

            <div className="flex items-end gap-2">
              {!walletApi ? (
                <button
                  type="button"
                  onClick={() => void connectWallet()}
                  className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-black dark:bg-white dark:text-slate-900"
                >
                  Connect
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => disconnectWallet()}
                  className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/[0.06]"
                >
                  Disconnect
                </button>
              )}
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Change Address (hex)
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  value={addressHex || ""}
                  readOnly
                  placeholder="(connect wallet)"
                  className="w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => void copyText(addressHex)}
                  disabled={!addressHex}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/[0.06]"
                >
                  Copy
                </button>
              </div>
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Mesh Multisig JWT</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            This token is minted via nonce + <code>signData</code> and stored in <code>sessionStorage</code>.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void mintToken()}
              disabled={isMintingToken || !walletApi || !addressHex}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-black disabled:opacity-60 dark:bg-white dark:text-slate-900"
            >
              {isMintingToken ? "Minting..." : "Generate Token"}
            </button>
            <button
              type="button"
              onClick={() => setTokenRevealed((v) => !v)}
              disabled={!token}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/[0.06]"
            >
              {tokenRevealed ? "Hide" : "Reveal"}
            </button>
            <button
              type="button"
              onClick={() => void copyText(token)}
              disabled={!token || !tokenRevealed}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/[0.06]"
            >
              Copy Token
            </button>
          </div>

          <div className="mt-3">
            <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Token
            </label>
            <pre className="mt-1 overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
              <code>{token ? (tokenRevealed ? token : "(present, hidden)") : "(not set)"}</code>
            </pre>
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Treasury Overview</h2>

          <div className="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
            <p>
              <span className="font-medium">Wallet ID:</span>{" "}
              {(config?.config?.meshWalletId || meshWalletId || "").trim() || "(not set)"}
            </p>
            <p>
              <span className="font-medium">Backend:</span> Mesh Multisig REST
            </p>
            <p className="md:col-span-2">
              <span className="font-medium">Funding address:</span>{" "}
              {scriptAddress ? (
                <span className="break-all">
                  {scriptAddress}{" "}
                  <button
                    type="button"
                    onClick={() => void copyText(scriptAddress)}
                    className="ml-2 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/[0.06]"
                  >
                    Copy
                  </button>
                </span>
              ) : canLoadTreasury ? (
                isLoadingTreasury ? (
                  "loading..."
                ) : (
                  "(unavailable)"
                )
              ) : (
                "(connect wallet + token + walletId)"
              )}
            </p>
            <p>
              <span className="font-medium">Free UTxOs:</span>{" "}
              {utxos ? `${utxos.length} (${formatAda(sumLovelace(utxos))})` : canLoadTreasury ? "loading..." : "(n/a)"}
            </p>
            <p>
              <span className="font-medium">Pending transactions:</span>{" "}
              {pending ? `${pending.length}` : canLoadTreasury ? "loading..." : "(n/a)"}
            </p>
          </div>

          {utxos && utxos.length > 0 ? (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">UTxOs</h3>
              <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 dark:border-white/10">
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 dark:bg-white/[0.04] dark:text-slate-300">
                    <tr>
                      <th className="px-3 py-2">Input</th>
                      <th className="px-3 py-2">Lovelace</th>
                      <th className="px-3 py-2">Assets</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-white/10">
                    {utxos.map((u) => {
                      const lovelace = u.output.amount.find((a) => a.unit === "lovelace")?.quantity || "0"
                      const otherAssets = u.output.amount.filter((a) => a.unit !== "lovelace")
                      return (
                        <tr key={`${u.input.txHash}:${u.input.outputIndex}`} className="text-slate-700 dark:text-slate-200">
                          <td className="px-3 py-2 font-mono">
                            {u.input.txHash.slice(0, 12)}...:{u.input.outputIndex}
                          </td>
                          <td className="px-3 py-2 font-mono">{lovelace}</td>
                          <td className="px-3 py-2">
                            {otherAssets.length > 0
                              ? otherAssets.map((a) => `${a.unit.slice(0, 12)}...:${a.quantity}`).join(", ")
                              : "(ada-only)"}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {pending && pending.length > 0 ? (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Pending Transactions</h3>
              <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 dark:border-white/10">
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 dark:bg-white/[0.04] dark:text-slate-300">
                    <tr>
                      <th className="px-3 py-2">ID</th>
                      <th className="px-3 py-2">Description</th>
                      <th className="px-3 py-2">Signed</th>
                      <th className="px-3 py-2">State</th>
                      <th className="px-3 py-2">Created</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-white/10">
                    {pending.map((tx) => {
                      const alreadySigned = addressHex ? tx.signedAddresses.includes(addressHex) : false
                      return (
                        <tr key={tx.id} className="text-slate-700 dark:text-slate-200">
                          <td className="px-3 py-2 font-mono">{tx.id.slice(0, 12)}...</td>
                          <td className="px-3 py-2">{tx.description || "(no description)"}</td>
                          <td className="px-3 py-2">{tx.signedAddresses.length}</td>
                          <td className="px-3 py-2">{tx.state}</td>
                          <td className="px-3 py-2">{new Date(tx.createdAt).toLocaleString()}</td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => void signPending(tx)}
                              disabled={!walletApi || !token || alreadySigned}
                              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/[0.06]"
                            >
                              {alreadySigned ? "Signed" : "Sign"}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </SurfaceCard>

        <SurfaceCard>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Propose Spend</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Builds a native-script spend from the treasury address, partial-signs it in your wallet, and adds it as a pending transaction.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Recipient (bech32)
              </label>
              <input
                value={recipientBech32}
                onChange={(e) => setRecipientBech32(e.target.value)}
                placeholder="addr..."
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100"
              />
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Amount (ADA)
              </label>
              <input
                value={amountAda}
                onChange={(e) => setAmountAda(e.target.value)}
                placeholder="1.5"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100"
              />
            </div>

            <div className="md:col-span-3">
              <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Description (optional)
              </label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. validator payments"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100"
              />
            </div>

            <div className="flex items-end md:col-span-1">
              <button
                type="button"
                onClick={() => void proposeSpend()}
                disabled={isProposing || !walletApi || !token}
                className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-black disabled:opacity-60 dark:bg-white dark:text-slate-900"
              >
                {isProposing ? "Proposing..." : "Propose"}
              </button>
            </div>
          </div>
        </SurfaceCard>
      </div>
    </PageLayout>
  )
}
