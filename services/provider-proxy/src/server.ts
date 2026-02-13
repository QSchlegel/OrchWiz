import express from "express"
import type { Request, Response } from "express"
import { z } from "zod"
import { requireBearerApiKey } from "./auth.js"
import {
  connectCodexCliWithApiKey,
  inspectCodexCliConnector,
  logoutCodexCliAccount,
  startCodexCliDeviceAuth,
} from "./codex-cli-connector.js"
import { CodexExecError, runCodexExec, type RuntimeRequest, type RuntimeResult } from "./codex-exec.js"
import { extractChatCompletionsPrompt, extractResponsesInputPrompt, makeResponseId } from "./openai-compat.js"

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function envProxyApiKey(): string | null {
  return asNonEmptyString(process.env.PROVIDER_PROXY_API_KEY)
}

export function createApp(deps: {
  runCodex?: typeof runCodexExec
} = {}) {
  const app = express()
  app.use(express.json({ limit: "4mb" }))

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      service: "provider-proxy",
      version: process.env.npm_package_version || "0.0.0",
      ts: new Date().toISOString(),
    })
  })

  app.use("/v1", (req, res, next) => {
    if (!requireBearerApiKey(req, res, envProxyApiKey())) {
      return
    }
    next()
  })

  app.get("/v1/codex-cli/connector", async (_req, res) => {
    try {
      const connector = await inspectCodexCliConnector()
      return res.json({ connector })
    } catch (error) {
      console.error("provider-proxy connector inspect failed:", error)
      return res.status(500).json({ error: "Failed to inspect Codex CLI connector." })
    }
  })

  const connectorActionSchema = z.object({
    action: z.enum(["connect_api_key", "start_device_auth", "logout"]),
    apiKey: z.string().optional(),
  })

  app.post("/v1/codex-cli/connector", async (req, res) => {
    const parsed = connectorActionSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid connector action payload." })
    }

    try {
      const { action, apiKey } = parsed.data
      let actionResult: unknown

      if (action === "connect_api_key") {
        actionResult = await connectCodexCliWithApiKey(apiKey || "")
      } else if (action === "start_device_auth") {
        actionResult = await startCodexCliDeviceAuth()
      } else {
        actionResult = await logoutCodexCliAccount()
      }

      const connector = await inspectCodexCliConnector()
      return res.json({ actionResult, connector })
    } catch (error) {
      console.error("provider-proxy connector action failed:", error)
      return res.status(500).json({ error: "Failed to update Codex CLI connector." })
    }
  })

  const runtimeRequestSchema = z.object({
    sessionId: z.string().min(1),
    prompt: z.string().min(1),
    userId: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
  })

  app.post("/v1/orchwiz/runtime/codex-cli", async (req: Request, res: Response) => {
    const parsed = runtimeRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid runtime request payload." })
    }

    const request = parsed.data as RuntimeRequest

    try {
      const run = deps.runCodex || runCodexExec
      const result = await run({ request })
      const runtimeResult: RuntimeResult = {
        provider: "codex-cli",
        output: result.output,
        fallbackUsed: false,
        metadata: {
          cliPath: result.cliPath,
          workspace: result.workspace,
          timeoutMs: result.timeoutMs,
          durationMs: result.durationMs,
          model: result.modelUsed,
        },
      }
      return res.json(runtimeResult)
    } catch (error) {
      const normalized = error instanceof CodexExecError
        ? { status: error.status, code: error.code, message: error.message, details: error.details }
        : { status: 500, code: "CODEX_PROXY_FAILED", message: (error as Error)?.message || "Unknown error" }
      return res.status(normalized.status).json({
        error: normalized.message,
        code: normalized.code,
        details: normalized.details,
      })
    }
  })

  app.post("/v1/responses", async (req, res) => {
    const body = req.body as Record<string, unknown>
    const input = body?.input
    const model = asNonEmptyString(body?.model)
    const prompt = extractResponsesInputPrompt(input)
    const metadataRecord =
      body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : {}
    const sessionId = asNonEmptyString(metadataRecord.sessionId) || "proxy-response"

    try {
      const run = deps.runCodex || runCodexExec
      const execResult = await run({
        request: {
          sessionId,
          prompt,
          metadata: {
            runtime: {
              intelligence: {
                selectedModel: model,
              },
            },
          },
        },
        modelOverride: model,
      })

      const id = makeResponseId("resp")
      const created = Math.floor(Date.now() / 1000)

      return res.json({
        id,
        object: "response",
        created_at: created,
        model: execResult.modelUsed || model || null,
        output_text: execResult.output,
        output: [
          {
            id: makeResponseId("msg"),
            type: "message",
            role: "assistant",
            content: [
              {
                type: "output_text",
                text: execResult.output,
              },
            ],
          },
        ],
      })
    } catch (error) {
      const normalized = error instanceof CodexExecError
        ? { status: error.status, code: error.code, message: error.message, details: error.details }
        : { status: 500, code: "CODEX_PROXY_FAILED", message: (error as Error)?.message || "Unknown error" }
      return res.status(normalized.status).json({
        error: normalized.message,
        code: normalized.code,
        details: normalized.details,
      })
    }
  })

  app.post("/v1/chat/completions", async (req, res) => {
    const body = req.body as Record<string, unknown>
    const model = asNonEmptyString(body?.model)
    const messages = body?.messages
    const stream = body?.stream === true
    const prompt = extractChatCompletionsPrompt(messages)

    try {
      const run = deps.runCodex || runCodexExec
      const execResult = await run({
        request: {
          sessionId: "proxy-chat-completions",
          prompt,
          metadata: {
            runtime: {
              intelligence: {
                selectedModel: model,
              },
            },
          },
        },
        modelOverride: model,
      })

      const id = makeResponseId("chatcmpl")
      const created = Math.floor(Date.now() / 1000)
      const modelUsed = execResult.modelUsed || model || null

      if (!stream) {
        return res.json({
          id,
          object: "chat.completion",
          created,
          model: modelUsed,
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: execResult.output,
              },
              finish_reason: "stop",
            },
          ],
        })
      }

      res.status(200)
      res.setHeader("Content-Type", "text/event-stream")
      res.setHeader("Cache-Control", "no-cache, no-transform")
      res.setHeader("Connection", "keep-alive")
      res.flushHeaders?.()

      const chunk = {
        id,
        object: "chat.completion.chunk",
        created,
        model: modelUsed,
        choices: [
          {
            index: 0,
            delta: {
              content: execResult.output,
            },
            finish_reason: "stop",
          },
        ],
      }

      res.write(`data: ${JSON.stringify(chunk)}\n\n`)
      res.write("data: [DONE]\n\n")
      res.end()
    } catch (error) {
      const normalized = error instanceof CodexExecError
        ? { status: error.status, code: error.code, message: error.message, details: error.details }
        : { status: 500, code: "CODEX_PROXY_FAILED", message: (error as Error)?.message || "Unknown error" }
      return res.status(normalized.status).json({
        error: normalized.message,
        code: normalized.code,
        details: normalized.details,
      })
    }
  })

  return app
}

async function main(): Promise<void> {
  const app = createApp()
  const host = process.env.PROVIDER_PROXY_HOST || "0.0.0.0"
  const port = Number(process.env.PROVIDER_PROXY_PORT || "4000")

  app.listen(port, host, () => {
    // eslint-disable-next-line no-console
    console.log(`provider-proxy listening on http://${host}:${port}`)
  })
}

if (process.argv[1] && process.argv[1].endsWith("server.ts")) {
  // tsx entrypoint
  void main()
}

if (process.argv[1] && process.argv[1].endsWith("server.js")) {
  void main()
}
