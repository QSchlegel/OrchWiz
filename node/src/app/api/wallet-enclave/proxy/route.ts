import { NextRequest, NextResponse } from "next/server"
import {
  walletEnclaveEnabled,
  getWalletAddress,
  signMessagePayload,
  encryptWithWalletEnclave,
  decryptWithWalletEnclave,
  sendAdaViaEnclave,
  mintTokenViaEnclave,
  WalletEnclaveError,
} from "@/lib/wallet-enclave/client"

export const dynamic = "force-dynamic"

type Action = "addr" | "sign" | "encrypt" | "decrypt" | "send-ada" | "mint-token"

const VALID_ACTIONS = new Set<Action>(["addr", "sign", "encrypt", "decrypt", "send-ada", "mint-token"])

export async function POST(request: NextRequest) {
  if (!walletEnclaveEnabled()) {
    return NextResponse.json(
      { error: "Wallet enclave is disabled.", code: "WALLET_ENCLAVE_DISABLED" },
      { status: 422 },
    )
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  const action = body.action as string
  if (!action || !VALID_ACTIONS.has(action as Action)) {
    return NextResponse.json(
      { error: `Invalid action. Must be one of: ${[...VALID_ACTIONS].join(", ")}` },
      { status: 400 },
    )
  }

  try {
    switch (action as Action) {
      case "addr": {
        const keyRef = String(body.keyRef ?? "").trim()
        if (!keyRef) {
          return NextResponse.json({ error: "keyRef is required." }, { status: 400 })
        }
        const result = await getWalletAddress({ keyRef })
        return NextResponse.json({ ok: true, action: "addr", result })
      }

      case "sign": {
        const keyRef = String(body.keyRef ?? "").trim()
        const payload = String(body.payload ?? "").trim()
        if (!keyRef) {
          return NextResponse.json({ error: "keyRef is required." }, { status: 400 })
        }
        if (!payload) {
          return NextResponse.json({ error: "payload is required." }, { status: 400 })
        }
        const result = await signMessagePayload({ keyRef, payload })
        return NextResponse.json({ ok: true, action: "sign", result })
      }

      case "encrypt": {
        const context = String(body.context ?? "").trim()
        const plaintext = String(body.plaintext ?? "").trim()
        if (!context) {
          return NextResponse.json({ error: "context is required." }, { status: 400 })
        }
        if (!plaintext) {
          return NextResponse.json({ error: "plaintext is required." }, { status: 400 })
        }
        const plaintextB64 = Buffer.from(plaintext, "utf-8").toString("base64")
        const result = await encryptWithWalletEnclave({ context, plaintextB64 })
        return NextResponse.json({ ok: true, action: "encrypt", result })
      }

      case "decrypt": {
        const context = String(body.context ?? "").trim()
        const ciphertextB64 = String(body.ciphertextB64 ?? "").trim()
        const nonceB64 = String(body.nonceB64 ?? "").trim()
        if (!context || !ciphertextB64 || !nonceB64) {
          return NextResponse.json(
            { error: "context, ciphertextB64, and nonceB64 are all required." },
            { status: 400 },
          )
        }
        const result = await decryptWithWalletEnclave({ context, ciphertextB64, nonceB64 })
        const plaintextUtf8 = Buffer.from(result.plaintextB64, "base64").toString("utf-8")
        return NextResponse.json({
          ok: true,
          action: "decrypt",
          result: { ...result, plaintextUtf8 },
        })
      }

      case "send-ada": {
        const keyRef = String(body.keyRef ?? "").trim()
        const recipientAddress = String(body.recipientAddress ?? "").trim()
        const lovelace = String(body.lovelace ?? "").trim()
        if (!keyRef) return NextResponse.json({ error: "keyRef is required." }, { status: 400 })
        if (!recipientAddress) return NextResponse.json({ error: "recipientAddress is required." }, { status: 400 })
        if (!lovelace || !/^\d+$/u.test(lovelace)) return NextResponse.json({ error: "lovelace must be a positive integer string." }, { status: 400 })
        const result = await sendAdaViaEnclave({ keyRef, recipientAddress, lovelace })
        return NextResponse.json({ ok: true, action: "send-ada", result })
      }

      case "mint-token": {
        const keyRef = String(body.keyRef ?? "").trim()
        const assetName = String(body.assetName ?? "").trim()
        const quantity = String(body.quantity ?? "").trim()
        const recipientAddress = body.recipientAddress ? String(body.recipientAddress).trim() : undefined
        if (!keyRef) return NextResponse.json({ error: "keyRef is required." }, { status: 400 })
        if (!assetName) return NextResponse.json({ error: "assetName is required." }, { status: 400 })
        if (!quantity || !/^\d+$/u.test(quantity)) return NextResponse.json({ error: "quantity must be a positive integer string." }, { status: 400 })
        const result = await mintTokenViaEnclave({ keyRef, assetName, quantity, recipientAddress })
        return NextResponse.json({ ok: true, action: "mint-token", result })
      }

      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 })
    }
  } catch (error) {
    if (error instanceof WalletEnclaveError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.status },
      )
    }
    console.error("Wallet enclave proxy error:", error)
    return NextResponse.json({ error: "Internal server error." }, { status: 500 })
  }
}
