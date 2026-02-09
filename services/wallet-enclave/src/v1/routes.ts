import crypto from "node:crypto"
import type { Express, Request, Response } from "express"
import { appendAuditJsonl } from "../audit/audit_log.js"
import { decrypt, encrypt } from "../crypto/crypto.js"
import { lookupIdempotency, storeIdempotency } from "../idempotency/idempotency.js"
import { checkSignIntent, loadPolicy } from "../policy/policy.js"
import {
  AddrRequestSchema,
  DecryptRequestSchema,
  EncryptRequestSchema,
  SignDataRequestSchema,
} from "./schema.js"
import { MeshCardanoAdapter } from "../adapters/mesh_cardano.js"

function requestIdFrom(req: Request): string {
  const headerId = req.header("x-request-id")
  return headerId && headerId.trim().length > 0 ? headerId : crypto.randomUUID()
}

function dataDir(): string {
  return process.env.WALLET_ENCLAVE_DATA_DIR || "/tmp/wallet-enclave"
}

function authToken(): string | null {
  const token = process.env.WALLET_ENCLAVE_SHARED_SECRET
  return token && token.trim().length > 0 ? token : null
}

function isAuthorized(req: Request): boolean {
  const token = authToken()
  if (!token) {
    return true
  }

  const headerToken = req.header("x-wallet-enclave-token")
  return Boolean(headerToken && crypto.timingSafeEqual(Buffer.from(headerToken), Buffer.from(token)))
}

function sendError(
  res: Response,
  requestId: string,
  code: string,
  message: string,
  details?: unknown,
  status = 400,
): void {
  res.setHeader("x-request-id", requestId)
  res.status(status).json({
    error: {
      code,
      message,
      details,
      requestId,
    },
  })
}

export function registerV1(app: Express): void {
  const adapter = new MeshCardanoAdapter()

  app.use("/v1", (req, res, next) => {
    if (!isAuthorized(req)) {
      const requestId = requestIdFrom(req)
      appendAuditJsonl(dataDir(), {
        ts: new Date().toISOString(),
        requestId,
        endpoint: req.path,
        decision: "deny",
        reason: "UNAUTHORIZED_CLIENT",
      })
      sendError(res, requestId, "UNAUTHORIZED_CLIENT", "Missing or invalid enclave token", undefined, 401)
      return
    }
    next()
  })

  app.post("/v1/addr", async (req, res) => {
    const requestId = requestIdFrom(req)
    const parsed = AddrRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      return sendError(res, requestId, "BAD_REQUEST", "Invalid request body", parsed.error.flatten())
    }

    const policy = loadPolicy(dataDir())
    const decision = checkSignIntent(policy, parsed.data.keyRef)
    if (!decision.ok) {
      appendAuditJsonl(dataDir(), {
        ts: new Date().toISOString(),
        requestId,
        endpoint: "/v1/addr",
        decision: "deny",
        reason: decision.code,
      })
      return sendError(res, requestId, decision.code || "POLICY_DENY", decision.message || "Policy denied", undefined, 403)
    }

    try {
      const address = await adapter.getAddress({ keyRef: parsed.data.keyRef })
      appendAuditJsonl(dataDir(), {
        ts: new Date().toISOString(),
        requestId,
        endpoint: "/v1/addr",
        decision: "allow",
        meta: { keyRef: parsed.data.keyRef },
      })

      res.setHeader("x-request-id", requestId)
      res.json({
        chain: "cardano",
        keyRef: parsed.data.keyRef,
        address,
      })
    } catch (error) {
      appendAuditJsonl(dataDir(), {
        ts: new Date().toISOString(),
        requestId,
        endpoint: "/v1/addr",
        decision: "deny",
        error: { code: "ADDR_FAILED", message: String(error) },
      })
      return sendError(res, requestId, "ADDR_FAILED", "Failed to derive address")
    }
  })

  app.post("/v1/sign-data", async (req, res) => {
    const requestId = requestIdFrom(req)
    const parsed = SignDataRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      return sendError(res, requestId, "BAD_REQUEST", "Invalid request body", parsed.error.flatten())
    }

    const policy = loadPolicy(dataDir())
    const decision = checkSignIntent(policy, parsed.data.keyRef)
    if (!decision.ok) {
      appendAuditJsonl(dataDir(), {
        ts: new Date().toISOString(),
        requestId,
        endpoint: "/v1/sign-data",
        decision: "deny",
        reason: decision.code,
      })
      return sendError(res, requestId, decision.code || "POLICY_DENY", decision.message || "Policy denied", undefined, 403)
    }

    const scope = `sign-data:${parsed.data.keyRef}`
    if (parsed.data.idempotencyKey) {
      const existing = lookupIdempotency(dataDir(), scope, parsed.data.idempotencyKey)
      if (existing) {
        appendAuditJsonl(dataDir(), {
          ts: new Date().toISOString(),
          requestId,
          endpoint: "/v1/sign-data",
          decision: "allow",
          reason: "IDEMPOTENCY_HIT",
          meta: { keyRef: parsed.data.keyRef },
        })
        res.setHeader("x-request-id", requestId)
        return res.json(existing.response)
      }
    }

    try {
      const signed = await adapter.signData({
        keyRef: parsed.data.keyRef,
        payload: parsed.data.payload,
        address: parsed.data.address,
      })

      const responseBody = {
        chain: "cardano" as const,
        keyRef: parsed.data.keyRef,
        address: signed.address,
        payloadHash: signed.payloadHash,
        key: signed.key,
        signature: signed.signature,
        alg: signed.alg,
      }

      if (parsed.data.idempotencyKey) {
        storeIdempotency(dataDir(), {
          key: parsed.data.idempotencyKey,
          scope,
          createdAt: new Date().toISOString(),
          response: responseBody,
        })
      }

      appendAuditJsonl(dataDir(), {
        ts: new Date().toISOString(),
        requestId,
        endpoint: "/v1/sign-data",
        decision: "allow",
        meta: {
          keyRef: parsed.data.keyRef,
          payloadHash: signed.payloadHash,
        },
      })

      res.setHeader("x-request-id", requestId)
      res.json(responseBody)
    } catch (error) {
      appendAuditJsonl(dataDir(), {
        ts: new Date().toISOString(),
        requestId,
        endpoint: "/v1/sign-data",
        decision: "deny",
        error: { code: "SIGN_FAILED", message: String(error) },
      })
      return sendError(res, requestId, "SIGN_FAILED", "Failed to sign payload")
    }
  })

  app.post("/v1/crypto/encrypt", (req, res) => {
    const requestId = requestIdFrom(req)
    const parsed = EncryptRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      return sendError(res, requestId, "BAD_REQUEST", "Invalid request body", parsed.error.flatten())
    }

    try {
      const encrypted = encrypt(parsed.data.context, parsed.data.plaintextB64)
      appendAuditJsonl(dataDir(), {
        ts: new Date().toISOString(),
        requestId,
        endpoint: "/v1/crypto/encrypt",
        decision: "allow",
      })
      res.setHeader("x-request-id", requestId)
      res.json({
        context: parsed.data.context,
        ...encrypted,
      })
    } catch (error) {
      appendAuditJsonl(dataDir(), {
        ts: new Date().toISOString(),
        requestId,
        endpoint: "/v1/crypto/encrypt",
        decision: "deny",
        error: { code: "CRYPTO_DISABLED", message: String(error) },
      })
      return sendError(res, requestId, "CRYPTO_DISABLED", "Encrypt endpoint requires WALLET_ENCLAVE_MASTER_SECRET")
    }
  })

  app.post("/v1/crypto/decrypt", (req, res) => {
    const requestId = requestIdFrom(req)
    const parsed = DecryptRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      return sendError(res, requestId, "BAD_REQUEST", "Invalid request body", parsed.error.flatten())
    }

    try {
      const decrypted = decrypt(parsed.data.context, parsed.data.ciphertextB64, parsed.data.nonceB64)
      appendAuditJsonl(dataDir(), {
        ts: new Date().toISOString(),
        requestId,
        endpoint: "/v1/crypto/decrypt",
        decision: "allow",
      })
      res.setHeader("x-request-id", requestId)
      res.json({
        context: parsed.data.context,
        ...decrypted,
      })
    } catch (error) {
      appendAuditJsonl(dataDir(), {
        ts: new Date().toISOString(),
        requestId,
        endpoint: "/v1/crypto/decrypt",
        decision: "deny",
        error: { code: "CRYPTO_FAILED", message: String(error) },
      })
      return sendError(res, requestId, "CRYPTO_FAILED", "Decrypt failed")
    }
  })
}
