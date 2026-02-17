import { z } from "zod"
import type { NativeScript, UTxO } from "@meshsdk/core"

export class MeshMultisigApiError extends Error {
  status: number
  code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = "MeshMultisigApiError"
    this.status = status
    this.code = code
  }
}

export type MeshWalletId = { walletId: string; walletName: string }

export type PendingTx = {
  id: string
  walletId: string
  txJson: string
  txCbor: string
  signedAddresses: string[]
  rejectedAddresses: string[]
  description: string
  state: number
  createdAt: string
  updatedAt: string
}

const meshWalletIdSchema = z.object({
  walletId: z.string(),
  walletName: z.string(),
})

const nonceResponseSchema = z.object({
  nonce: z.string(),
})

const authSignerResponseSchema = z.object({
  token: z.string(),
})

const assetSchema = z
  .object({
    unit: z.string(),
    quantity: z.string(),
  })
  .passthrough()

const utxoSchema: z.ZodType<UTxO> = z
  .object({
    input: z
      .object({
        txHash: z.string(),
        outputIndex: z.number(),
      })
      .passthrough(),
    output: z
      .object({
        address: z.string(),
        amount: z.array(assetSchema),
        dataHash: z.string().optional(),
        plutusData: z.string().optional(),
        scriptRef: z.string().optional(),
        scriptHash: z.string().optional(),
      })
      .passthrough(),
  })
  .passthrough() as any

const pendingTxSchema = z.object({
  id: z.string(),
  walletId: z.string(),
  txJson: z.string(),
  txCbor: z.string(),
  signedAddresses: z.array(z.string()),
  rejectedAddresses: z.array(z.string()),
  description: z.string(),
  state: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const signTransactionResponseSchema = z.object({
  transaction: pendingTxSchema,
  submitted: z.boolean(),
  txHash: z.string().nullable().optional(),
})

const nativeScriptSchema: z.ZodType<NativeScript> = z.lazy(() =>
  z.union([
    z.object({
      type: z.enum(["after", "before"]),
      slot: z.string(),
    }),
    z.object({
      type: z.enum(["all", "any"]),
      scripts: z.array(nativeScriptSchema),
    }),
    z.object({
      type: z.literal("atLeast"),
      required: z.number(),
      scripts: z.array(nativeScriptSchema),
    }),
    z.object({
      type: z.literal("sig"),
      keyHash: z.string(),
    }),
  ]),
) as any

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/u, "")
}

async function parseErrorPayload(response: Response): Promise<{ message: string; code?: string }> {
  const payload = await response.json().catch(() => null as any)
  if (payload && typeof payload === "object") {
    const message = typeof payload.error === "string" ? payload.error : null
    const code = typeof payload.code === "string" ? payload.code : undefined
    if (message) return { message, code }
  }
  return { message: response.statusText || `Request failed with status ${response.status}` }
}

async function requestJson<T>(args: {
  url: string
  method: "GET" | "POST"
  token?: string
  body?: unknown
  schema: z.ZodType<T>
}): Promise<T> {
  const headers: Record<string, string> = {}
  if (args.token) {
    headers.authorization = `Bearer ${args.token}`
  }
  if (args.method === "POST") {
    headers["content-type"] = "application/json"
  }

  const response = await fetch(args.url, {
    method: args.method,
    headers,
    body: args.method === "POST" ? JSON.stringify(args.body ?? {}) : undefined,
  })

  if (!response.ok) {
    const { message, code } = await parseErrorPayload(response)
    throw new MeshMultisigApiError(message, response.status, code)
  }

  const payload = await response.json().catch(() => null)
  const parsed = args.schema.safeParse(payload)
  if (!parsed.success) {
    throw new MeshMultisigApiError("Unexpected API response shape.", 502, "BAD_UPSTREAM_RESPONSE")
  }
  return parsed.data
}

export async function getNonce(args: { baseUrl: string; addressHex: string }): Promise<{ nonce: string }> {
  const url = new URL(`${normalizeBaseUrl(args.baseUrl)}/api/v1/getNonce`)
  url.searchParams.set("address", args.addressHex)
  return await requestJson({ url: url.toString(), method: "GET", schema: nonceResponseSchema })
}

export async function authSigner(args: {
  baseUrl: string
  addressHex: string
  signatureCose: string
  keyCose: string
}): Promise<{ token: string }> {
  const url = `${normalizeBaseUrl(args.baseUrl)}/api/v1/authSigner`
  return await requestJson({
    url,
    method: "POST",
    body: {
      address: args.addressHex,
      signature: args.signatureCose,
      key: args.keyCose,
    },
    schema: authSignerResponseSchema,
  })
}

export async function walletIds(args: {
  baseUrl: string
  token: string
  addressHex: string
}): Promise<MeshWalletId[]> {
  const url = new URL(`${normalizeBaseUrl(args.baseUrl)}/api/v1/walletIds`)
  url.searchParams.set("address", args.addressHex)
  return await requestJson({ url: url.toString(), method: "GET", token: args.token, schema: z.array(meshWalletIdSchema) })
}

export async function nativeScript(args: {
  baseUrl: string
  token: string
  walletId: string
  addressHex: string
}): Promise<NativeScript> {
  const url = new URL(`${normalizeBaseUrl(args.baseUrl)}/api/v1/nativeScript`)
  url.searchParams.set("walletId", args.walletId)
  url.searchParams.set("address", args.addressHex)

  // API schema is loosely typed; accept both a direct script object or a 1-item array.
  const payload = await requestJson({ url: url.toString(), method: "GET", token: args.token, schema: z.unknown() })

  const direct = nativeScriptSchema.safeParse(payload)
  if (direct.success) return direct.data

  const arrayMaybe = z.array(nativeScriptSchema).safeParse(payload)
  if (arrayMaybe.success && arrayMaybe.data.length === 1) {
    return arrayMaybe.data[0]
  }

  throw new MeshMultisigApiError("Unexpected nativeScript response shape.", 502, "BAD_UPSTREAM_RESPONSE")
}

export async function freeUtxos(args: {
  baseUrl: string
  token: string
  walletId: string
  addressHex: string
}): Promise<UTxO[]> {
  const url = new URL(`${normalizeBaseUrl(args.baseUrl)}/api/v1/freeUtxos`)
  url.searchParams.set("walletId", args.walletId)
  url.searchParams.set("address", args.addressHex)
  return await requestJson({ url: url.toString(), method: "GET", token: args.token, schema: z.array(utxoSchema) })
}

export async function pendingTransactions(args: {
  baseUrl: string
  token: string
  walletId: string
  addressHex: string
}): Promise<PendingTx[]> {
  const url = new URL(`${normalizeBaseUrl(args.baseUrl)}/api/v1/pendingTransactions`)
  url.searchParams.set("walletId", args.walletId)
  url.searchParams.set("address", args.addressHex)
  return await requestJson({ url: url.toString(), method: "GET", token: args.token, schema: z.array(pendingTxSchema) })
}

export async function addTransaction(args: {
  baseUrl: string
  token: string
  walletId: string
  addressHex: string
  txCbor: string
  txJson: string
  description?: string
}): Promise<PendingTx> {
  const url = `${normalizeBaseUrl(args.baseUrl)}/api/v1/addTransaction`
  return await requestJson({
    url,
    method: "POST",
    token: args.token,
    body: {
      walletId: args.walletId,
      txCbor: args.txCbor,
      txJson: args.txJson,
      description: args.description ?? "",
      address: args.addressHex,
    },
    schema: pendingTxSchema,
  })
}

export async function signTransaction(args: {
  baseUrl: string
  token: string
  walletId: string
  transactionId: string
  addressHex: string
  vkeyHex: string
  signatureHex: string
  broadcast: boolean
}): Promise<{ submitted: boolean; txHash?: string | null; transaction: PendingTx }> {
  const url = `${normalizeBaseUrl(args.baseUrl)}/api/v1/signTransaction`
  return await requestJson({
    url,
    method: "POST",
    token: args.token,
    body: {
      walletId: args.walletId,
      transactionId: args.transactionId,
      address: args.addressHex,
      key: args.vkeyHex,
      signature: args.signatureHex,
      broadcast: args.broadcast,
    },
    schema: signTransactionResponseSchema,
  })
}

