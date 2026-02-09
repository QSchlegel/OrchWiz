import crypto from "node:crypto"

export interface SignDataInput {
  keyRef: string
  payload: string
  address?: string
}

export interface SignDataOutput {
  address: string
  payloadHash: string
  key: string
  signature: string
  alg: "cip8-ed25519"
}

export interface AddressInput {
  keyRef: string
}

interface MeshWalletLike {
  getChangeAddress(): Promise<string>
  signData(address: string, payload: string): Promise<{ key: string; signature: string }>
}

function keyRefMnemonicEnvName(keyRef: string): string {
  const normalized = keyRef.trim().toUpperCase().replace(/[^A-Z0-9]/g, "_")
  return `CARDANO_MNEMONIC_${normalized}`
}

function resolveMnemonicForKeyRef(keyRef: string): string {
  const specific = process.env[keyRefMnemonicEnvName(keyRef)]
  const fallback = process.env.CARDANO_MNEMONIC
  const mnemonic = specific || fallback
  if (!mnemonic || !mnemonic.trim()) {
    throw new Error(`Missing mnemonic for keyRef '${keyRef}'. Set ${keyRefMnemonicEnvName(keyRef)} or CARDANO_MNEMONIC.`)
  }
  return mnemonic
}

function parseMnemonicWords(mnemonic: string): string[] {
  return mnemonic
    .trim()
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean)
}

function toNetworkId(value: string | undefined): number {
  const network = (value || "preview").toLowerCase()
  if (network === "mainnet") {
    return 1
  }
  return 0
}

function payloadToHex(payload: string): string {
  return Buffer.from(payload, "utf8").toString("hex")
}

async function buildMeshWallet(mnemonicWords: string[]): Promise<MeshWalletLike> {
  const meshModule = (await import("@meshsdk/core")) as Record<string, unknown>
  const MeshWallet = meshModule.MeshWallet as new (args: Record<string, unknown>) => MeshWalletLike
  const BlockfrostProvider = meshModule.BlockfrostProvider as
    | (new (apiKey: string) => unknown)
    | undefined

  const providerType = (process.env.CARDANO_PROVIDER_TYPE || "blockfrost").toLowerCase()
  const providerApiKey = process.env.CARDANO_PROVIDER_API_KEY

  let provider: unknown
  if (providerType === "blockfrost" && providerApiKey && BlockfrostProvider) {
    provider = new BlockfrostProvider(providerApiKey)
  }

  return new MeshWallet({
    networkId: toNetworkId(process.env.CARDANO_NETWORK),
    fetcher: provider,
    submitter: provider,
    key: {
      type: "mnemonic",
      words: mnemonicWords,
    },
  })
}

export class MeshCardanoAdapter {
  private walletByKeyRef = new Map<string, MeshWalletLike>()

  private async walletFor(keyRef: string): Promise<MeshWalletLike> {
    const existing = this.walletByKeyRef.get(keyRef)
    if (existing) {
      return existing
    }

    const mnemonic = resolveMnemonicForKeyRef(keyRef)
    const wallet = await buildMeshWallet(parseMnemonicWords(mnemonic))
    this.walletByKeyRef.set(keyRef, wallet)
    return wallet
  }

  async getAddress(input: AddressInput): Promise<string> {
    const wallet = await this.walletFor(input.keyRef)
    return wallet.getChangeAddress()
  }

  async signData(input: SignDataInput): Promise<SignDataOutput> {
    const wallet = await this.walletFor(input.keyRef)
    const address = input.address || (await wallet.getChangeAddress())
    const payloadHash = crypto.createHash("sha256").update(input.payload, "utf8").digest("hex")
    const signed = await wallet.signData(address, payloadToHex(input.payload))

    if (!signed?.key || !signed?.signature) {
      throw new Error("Mesh signData response missing key/signature")
    }

    return {
      address,
      payloadHash,
      key: signed.key,
      signature: signed.signature,
      alg: "cip8-ed25519",
    }
  }
}
