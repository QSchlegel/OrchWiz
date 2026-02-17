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
  getUtxos(): Promise<unknown[]>
  // MeshWallet.signData signature is (payload, address?) and expects payload as hex string
  // (it forwards to EmbeddedWallet.signData(address, payloadHex, ...)).
  signData(payload: string, address?: string): Promise<{ key: string; signature: string }>
  signTx(unsignedTx: string, partialSign?: boolean): Promise<string>
}

interface MeshProviderLike {
  submitTx(signedTx: string): Promise<string>
}

interface TransactionLike {
  setNetwork(network: string): void
  sendLovelace(recipient: string, lovelace: string): TransactionLike
  mintAsset(forgeScript: unknown, asset: unknown): TransactionLike
  build(): Promise<string>
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

async function buildMeshWallet(mnemonicWords: string[]): Promise<{ wallet: MeshWalletLike; provider: MeshProviderLike | null }> {
  const meshModule = (await import("@meshsdk/core")) as Record<string, unknown>
  const MeshWallet = meshModule.MeshWallet as new (args: Record<string, unknown>) => MeshWalletLike
  const BlockfrostProvider = meshModule.BlockfrostProvider as
    | (new (apiKey: string) => unknown)
    | undefined

  const providerType = (process.env.CARDANO_PROVIDER_TYPE || "blockfrost").toLowerCase()
  const providerApiKey = process.env.CARDANO_PROVIDER_API_KEY

  let provider: MeshProviderLike | null = null
  if (providerType === "blockfrost" && providerApiKey && BlockfrostProvider) {
    provider = new BlockfrostProvider(providerApiKey) as MeshProviderLike
  }

  const wallet = new MeshWallet({
    networkId: toNetworkId(process.env.CARDANO_NETWORK),
    fetcher: provider,
    submitter: provider,
    key: {
      type: "mnemonic",
      words: mnemonicWords,
    },
  })

  return { wallet, provider }
}

export interface SendAdaInput {
  keyRef: string
  recipientAddress: string
  lovelace: string
}

export interface SendAdaOutput {
  txHash: string
  fromAddress: string
  recipientAddress: string
  lovelace: string
}

export interface MintTokenInput {
  keyRef: string
  assetName: string
  quantity: string
  recipientAddress?: string
}

export interface MintTokenOutput {
  txHash: string
  policyId: string
  assetName: string
  quantity: string
  recipientAddress: string
}

export class MeshCardanoAdapter {
  private walletCache = new Map<string, { wallet: MeshWalletLike; provider: MeshProviderLike | null }>()

  private async resolve(keyRef: string): Promise<{ wallet: MeshWalletLike; provider: MeshProviderLike | null }> {
    const existing = this.walletCache.get(keyRef)
    if (existing) {
      return existing
    }

    const mnemonic = resolveMnemonicForKeyRef(keyRef)
    const result = await buildMeshWallet(parseMnemonicWords(mnemonic))
    this.walletCache.set(keyRef, result)
    return result
  }

  async getAddress(input: AddressInput): Promise<string> {
    const { wallet } = await this.resolve(input.keyRef)
    return wallet.getChangeAddress()
  }

  async signData(input: SignDataInput): Promise<SignDataOutput> {
    const { wallet } = await this.resolve(input.keyRef)
    const address = input.address || (await wallet.getChangeAddress())
    const payloadHash = crypto.createHash("sha256").update(input.payload, "utf8").digest("hex")
    const signed = await wallet.signData(payloadToHex(input.payload), address)

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

  async sendAda(input: SendAdaInput): Promise<SendAdaOutput> {
    const { wallet, provider } = await this.resolve(input.keyRef)
    if (!provider) {
      throw new Error("Blockchain provider not configured. Set CARDANO_PROVIDER_API_KEY.")
    }

    const meshModule = (await import("@meshsdk/core")) as Record<string, unknown>
    const Transaction = meshModule.Transaction as new (args: Record<string, unknown>) => TransactionLike
    const network = (process.env.CARDANO_NETWORK || "preview").toLowerCase()
    const fromAddress = await wallet.getChangeAddress()

    const tx = new Transaction({ initiator: wallet })
    tx.setNetwork(network)
    tx.sendLovelace(input.recipientAddress, input.lovelace)

    const unsignedTx = await tx.build()
    const signedTx = await wallet.signTx(unsignedTx)
    const txHash = await provider.submitTx(signedTx)

    return {
      txHash,
      fromAddress,
      recipientAddress: input.recipientAddress,
      lovelace: input.lovelace,
    }
  }

  async mintToken(input: MintTokenInput): Promise<MintTokenOutput> {
    const { wallet, provider } = await this.resolve(input.keyRef)
    if (!provider) {
      throw new Error("Blockchain provider not configured. Set CARDANO_PROVIDER_API_KEY.")
    }

    const meshModule = (await import("@meshsdk/core")) as Record<string, unknown>
    const Transaction = meshModule.Transaction as new (args: Record<string, unknown>) => TransactionLike
    const ForgeScript = meshModule.ForgeScript as { withOneSignature(address: string): unknown }
    const network = (process.env.CARDANO_NETWORK || "preview").toLowerCase()
    const fromAddress = await wallet.getChangeAddress()
    const recipientAddress = input.recipientAddress || fromAddress

    const forgeScript = ForgeScript.withOneSignature(fromAddress)

    const tx = new Transaction({ initiator: wallet })
    tx.setNetwork(network)
    tx.mintAsset(forgeScript, {
      assetName: input.assetName,
      assetQuantity: input.quantity,
      recipient: recipientAddress,
      metadata: {
        name: input.assetName,
        description: `Minted via OrchWiz Wallet Enclave`,
      },
    })

    const unsignedTx = await tx.build()
    const signedTx = await wallet.signTx(unsignedTx)
    const txHash = await provider.submitTx(signedTx)

    // Derive policyId from the forge script
    const resolveFingerprint = meshModule.resolveFingerprint as ((policyId: string, assetName: string) => string) | undefined
    const resolveScriptHash = meshModule.resolveScriptHash as ((script: unknown) => string) | undefined
    const policyId = resolveScriptHash ? resolveScriptHash(forgeScript) : "unknown"

    return {
      txHash,
      policyId,
      assetName: input.assetName,
      quantity: input.quantity,
      recipientAddress,
    }
  }
}
