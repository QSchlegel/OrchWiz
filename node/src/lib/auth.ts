import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { anonymous, magicLink } from "better-auth/plugins"
import { github } from "better-auth/social-providers"
import { passkey } from "@better-auth/passkey"
import { prisma } from "./prisma"

const appUrlFromEnv = process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL
const githubClientId = process.env.GITHUB_CLIENT_ID
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET
const githubProvider =
  githubClientId && githubClientSecret
    ? (github({
        clientId: githubClientId,
        clientSecret: githubClientSecret,
      }) as any)
    : undefined

const socialProviders = githubProvider ? { github: githubProvider } : undefined

function getPasskeyConfig(appUrl?: string) {
  if (!appUrl) {
    return {}
  }

  try {
    const parsedUrl = new URL(appUrl)
    return {
      origin: parsedUrl.origin,
      rpID: parsedUrl.hostname,
    }
  } catch (error) {
    console.warn("Invalid app URL for passkey config:", error)
    return {}
  }
}

export function createAuth(resolvedAppUrl?: string) {
  const appUrl = resolvedAppUrl || appUrlFromEnv
  const passkeyConfig = getPasskeyConfig(appUrl)

  return betterAuth({
    database: prismaAdapter(prisma, {
      provider: "postgresql"
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    account: {
      accountLinking: {
        disableImplicitLinking: true,
      },
    },
    ...(socialProviders ? { socialProviders } : {}),
    plugins: [
      anonymous(),
      passkey({
        ...passkeyConfig,
        rpName: "OrchWiz",
      }),
      magicLink({
        expiresIn: 60 * 15,
        sendMagicLink: async ({ email, url }) => {
          const apiKey = process.env.RESEND_API_KEY
          const fromEmail = process.env.RESEND_FROM_EMAIL

          if (!apiKey || !fromEmail) {
            if (process.env.NODE_ENV !== "production") {
              console.warn("Magic link email provider not configured. Generated link:", url)
              return
            }
            throw new Error("Missing RESEND_API_KEY or RESEND_FROM_EMAIL")
          }

          const subject = "Your OrchWiz sign-in link"
          const html = `
          <div style="font-family: Arial, sans-serif; line-height: 1.6;">
            <h2 style="margin: 0 0 12px;">Welcome to OrchWiz</h2>
            <p>Use the secure link below to finish signing in:</p>
            <p style="margin: 24px 0;">
              <a href="${url}" style="background: #7c3aed; color: #fff; padding: 12px 20px; border-radius: 8px; text-decoration: none;">
                Sign in to OrchWiz
              </a>
            </p>
            <p style="color: #6b7280; font-size: 14px;">
              If you didn’t request this, you can safely ignore this email.
            </p>
          </div>
        `
          const text = `Sign in to OrchWiz: ${url}`

          const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: fromEmail,
              to: [email],
              subject,
              html,
              text,
            }),
          })

          if (!response.ok) {
            const errorText = await response.text()
            throw new Error(`Failed to send magic link email: ${errorText}`)
          }
        },
      }),
    ],
    user: {
      fields: {
        image: "avatarUrl",
      },
    },
    session: {
      modelName: "authSession",
    },
    secret: process.env.BETTER_AUTH_SECRET!,
    baseURL: appUrl,
  })
}

export const auth = createAuth()

export type Session = typeof auth.$Infer.Session
