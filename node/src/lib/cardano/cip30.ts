export interface Cip30SignDataResult {
  signature: string
  key: string
}

export interface Cip30Api {
  getChangeAddress(): Promise<string>
  signData(addressHex: string, payloadHex: string): Promise<Cip30SignDataResult>
  signTx(txCborHex: string, partialSign: boolean): Promise<string>
}

type Cip30WalletShim = {
  enable: () => Promise<Cip30Api>
}

function getWindowCardano(): any | null {
  if (typeof window === "undefined") return null
  const w = window as any
  return w && typeof w === "object" ? w.cardano : null
}

export function listInstalledCip30WalletKeys(): string[] {
  const cardano = getWindowCardano()
  if (!cardano || typeof cardano !== "object") return []

  return Object.keys(cardano).filter((key) => {
    const maybe = (cardano as any)[key] as Cip30WalletShim | undefined
    return Boolean(maybe && typeof maybe.enable === "function")
  })
}

export async function enableCip30Wallet(walletKey: string): Promise<Cip30Api> {
  const cardano = getWindowCardano()
  if (!cardano || typeof cardano !== "object") {
    throw new Error("No CIP-30 wallets detected (window.cardano is missing).")
  }

  const wallet = (cardano as any)[walletKey] as Cip30WalletShim | undefined
  if (!wallet || typeof wallet.enable !== "function") {
    throw new Error(`Wallet '${walletKey}' is not available.`)
  }

  const api = await wallet.enable()
  if (!api || typeof api.getChangeAddress !== "function" || typeof api.signData !== "function" || typeof api.signTx !== "function") {
    throw new Error(`Wallet '${walletKey}' does not expose the required CIP-30 APIs.`)
  }

  return api
}

