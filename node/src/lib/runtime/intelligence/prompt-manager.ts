import { LangfuseClient } from "@langfuse/client"
import type { RuntimeIntelligenceConfig } from "@/lib/runtime/intelligence/config"

export const LOCAL_CLASSIFIER_PROMPT = [
  "You are a strict runtime intelligence router for autonomous AI tasks.",
  "Classify whether this task requires a higher-intelligence model tier.",
  "Return ONLY JSON with this exact shape:",
  '{"requiresBump": boolean, "confidence": number, "reason": string}',
  "Rules:",
  "- confidence must be between 0 and 1.",
  "- requiresBump=true if task has high ambiguity, multi-step synthesis, high impact, or risk-sensitive reasoning.",
  "- requiresBump=false for straightforward or repetitive tasks.",
  "",
  "Execution context:",
  "{{execution_context}}",
  "",
  "Autonomous task:",
  "{{task}}",
].join("\n")

export interface RuntimeClassifierPromptTemplate {
  template: string
  source: "langfuse" | "local"
  label: string | null
  version: number | null
}

interface CachedPrompt {
  key: string
  expiresAt: number
  value: RuntimeClassifierPromptTemplate
}

let promptCache: CachedPrompt | null = null
let langfuseClientSingleton: LangfuseClient | null | undefined

function hasLangfuseCredentials(): boolean {
  return Boolean(
    process.env.LANGFUSE_BASE_URL
    && process.env.LANGFUSE_PUBLIC_KEY
    && process.env.LANGFUSE_SECRET_KEY,
  )
}

function langfuseClient(): LangfuseClient | null {
  if (langfuseClientSingleton !== undefined) {
    return langfuseClientSingleton
  }

  if (!hasLangfuseCredentials()) {
    langfuseClientSingleton = null
    return langfuseClientSingleton
  }

  langfuseClientSingleton = new LangfuseClient({
    baseUrl: process.env.LANGFUSE_BASE_URL,
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
  })

  return langfuseClientSingleton
}

export function setRuntimeClassifierLangfuseClientForTests(
  client: LangfuseClient | null | undefined,
): void {
  langfuseClientSingleton = client
}

export function resetRuntimeClassifierPromptManagerForTests(): void {
  promptCache = null
  langfuseClientSingleton = undefined
}

function cacheKey(config: RuntimeIntelligenceConfig): string {
  return [
    config.langfusePromptName,
    config.langfusePromptLabel,
    config.langfusePromptVersion ?? "latest",
  ].join("::")
}

export async function getRuntimeClassifierPromptTemplate(
  config: RuntimeIntelligenceConfig,
): Promise<RuntimeClassifierPromptTemplate> {
  const key = cacheKey(config)
  const now = Date.now()

  if (promptCache && promptCache.key === key && promptCache.expiresAt > now) {
    return promptCache.value
  }

  const fallbackTemplate: RuntimeClassifierPromptTemplate = {
    template: LOCAL_CLASSIFIER_PROMPT,
    source: "local",
    label: null,
    version: null,
  }

  const client = langfuseClient()
  if (!client) {
    promptCache = {
      key,
      value: fallbackTemplate,
      expiresAt: now + config.langfusePromptCacheTtlSeconds * 1000,
    }
    return fallbackTemplate
  }

  try {
    const prompt = await client.prompt.get(config.langfusePromptName, {
      type: "text",
      label: config.langfusePromptLabel,
      ...(config.langfusePromptVersion ? { version: config.langfusePromptVersion } : {}),
      cacheTtlSeconds: config.langfusePromptCacheTtlSeconds,
      fallback: LOCAL_CLASSIFIER_PROMPT,
      maxRetries: 1,
      fetchTimeoutMs: 4_000,
    })

    const template = typeof prompt.prompt === "string" && prompt.prompt.trim()
      ? prompt.prompt
      : LOCAL_CLASSIFIER_PROMPT

    const result: RuntimeClassifierPromptTemplate = {
      template,
      source: prompt.isFallback ? "local" : "langfuse",
      label: Array.isArray(prompt.labels) && prompt.labels.length > 0
        ? String(prompt.labels[0])
        : (config.langfusePromptLabel || null),
      version: typeof prompt.version === "number" ? prompt.version : null,
    }

    promptCache = {
      key,
      value: result,
      expiresAt: now + config.langfusePromptCacheTtlSeconds * 1000,
    }

    return result
  } catch {
    promptCache = {
      key,
      value: fallbackTemplate,
      expiresAt: now + config.langfusePromptCacheTtlSeconds * 1000,
    }
    return fallbackTemplate
  }
}

function replaceTemplateVariables(template: string, variables: Record<string, string>): string {
  let output = template
  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`{{\\s*${key}\\s*}}`, "g")
    output = output.replace(pattern, value)
  }
  return output
}

export function renderRuntimeClassifierPrompt(args: {
  template: string
  task: string
  executionContext: string
}): string {
  return replaceTemplateVariables(args.template, {
    task: args.task,
    task_input: args.task,
    input: args.task,
    execution_context: args.executionContext,
  })
}
