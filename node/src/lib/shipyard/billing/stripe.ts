import Stripe from "stripe"

let stripeClient: Stripe | null | undefined

export class ShipyardBillingProviderError extends Error {
  code: string
  status: number

  constructor(message: string, code = "BILLING_PROVIDER_UNAVAILABLE", status = 503) {
    super(message)
    this.name = "ShipyardBillingProviderError"
    this.code = code
    this.status = status
  }
}

function asNonEmptyString(value: string | undefined | null): string | null {
  if (!value) {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function getStripeSecretKey(env: NodeJS.ProcessEnv = process.env): string | null {
  return asNonEmptyString(env.STRIPE_SECRET_KEY)
}

export function getStripeWebhookSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  return asNonEmptyString(env.STRIPE_WEBHOOK_SECRET)
}

export function getStripeClient(env: NodeJS.ProcessEnv = process.env): Stripe | null {
  const secretKey = getStripeSecretKey(env)
  if (!secretKey) {
    return null
  }

  if (stripeClient) {
    return stripeClient
  }

  stripeClient = new Stripe(secretKey)
  return stripeClient
}

export function requireStripeClient(env: NodeJS.ProcessEnv = process.env): Stripe {
  const stripe = getStripeClient(env)
  if (!stripe) {
    throw new ShipyardBillingProviderError("Stripe billing is not configured.")
  }
  return stripe
}

export function requireStripeWebhookSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = getStripeWebhookSecret(env)
  if (!secret) {
    throw new ShipyardBillingProviderError("Stripe webhook signing secret is not configured.")
  }
  return secret
}

export function resolveShipyardBillingReturnUrls(args: {
  requestOrigin: string
  env?: NodeJS.ProcessEnv
}): { successUrl: string; cancelUrl: string } {
  const env = args.env || process.env
  const configuredBase = asNonEmptyString(env.NEXT_PUBLIC_APP_URL) || asNonEmptyString(env.BETTER_AUTH_URL)
  const baseUrl = configuredBase || args.requestOrigin

  const successPath = asNonEmptyString(env.STRIPE_BILLING_SUCCESS_PATH) || "/ship-yard?billing=success"
  const cancelPath = asNonEmptyString(env.STRIPE_BILLING_CANCEL_PATH) || "/ship-yard?billing=cancel"

  return {
    successUrl: new URL(successPath, baseUrl).toString(),
    cancelUrl: new URL(cancelPath, baseUrl).toString(),
  }
}

export function resetStripeClientForTests(): void {
  stripeClient = undefined
}
