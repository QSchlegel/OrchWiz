import { KoiosProvider, Transaction, serializeNativeScript } from "@meshsdk/core"
import type { NativeScript, UTxO, Network } from "@meshsdk/core"

export type TreasuryNetwork = "preview" | "preprod" | "mainnet"

function toNetworkId(network: TreasuryNetwork): 0 | 1 {
  return network === "mainnet" ? 1 : 0
}

function toKoiosNetwork(network: TreasuryNetwork): "preview" | "preprod" | "api" {
  if (network === "mainnet") return "api"
  return network
}

function lovelaceQuantity(utxo: UTxO): bigint {
  const lovelace = utxo.output.amount.find((a) => a.unit === "lovelace")?.quantity
  if (!lovelace) return 0n
  try {
    return BigInt(lovelace)
  } catch {
    return 0n
  }
}

function isAdaOnly(utxo: UTxO): boolean {
  return utxo.output.amount.length === 1 && utxo.output.amount[0]?.unit === "lovelace"
}

export async function buildTreasurySpendTx(args: {
  network: TreasuryNetwork
  nativeScript: NativeScript
  freeUtxos: UTxO[]
  recipientBech32: string
  lovelace: string
}): Promise<{
  unsignedTxCborHex: string
  txJson: string
  scriptAddress: string
}> {
  const network = args.network as Network
  const networkId = toNetworkId(args.network)

  const { address: scriptAddress } = serializeNativeScript(args.nativeScript, undefined, networkId)
  const koiosProvider = new KoiosProvider(toKoiosNetwork(args.network))

  const utxosSorted = [...args.freeUtxos].sort((a, b) => {
    const diff = lovelaceQuantity(b) - lovelaceQuantity(a)
    return diff > 0n ? 1 : diff < 0n ? -1 : 0
  })

  const preferred = utxosSorted.filter(isAdaOnly)
  const candidates = preferred.length > 0 ? preferred : utxosSorted

  let lastError: unknown = null

  for (let count = 1; count <= candidates.length; count++) {
    const selected = candidates.slice(0, count)

    try {
      const initiator = {
        getChangeAddress: () => scriptAddress,
        getCollateral: () => [],
        // Keep selection deterministic: add more inputs only by expanding `selected`.
        getUtxos: () => selected,
      }

      const tx = new Transaction({ fetcher: koiosProvider, initiator })
      tx.setNetwork(network)
      tx.setChangeAddress(scriptAddress)

      for (const utxo of selected) {
        tx.setNativeScriptInput(args.nativeScript, utxo)
      }

      tx.sendAssets(args.recipientBech32, args.lovelace)

      const unsignedTxCborHex = await tx.build()
      const txJson = JSON.stringify(tx.txBuilder.meshTxBuilderBody)

      return { unsignedTxCborHex, txJson, scriptAddress }
    } catch (error) {
      lastError = error
    }
  }

  const message =
    lastError instanceof Error ? lastError.message : lastError ? String(lastError) : "Failed to build transaction"
  throw new Error(`Unable to build transaction with available UTxOs. ${message}`)
}

