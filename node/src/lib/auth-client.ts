import { createAuthClient } from "better-auth/react"
import { magicLinkClient } from "better-auth/client/plugins"
import { passkeyClient } from "@better-auth/passkey/client"

const baseURL =
  typeof window !== "undefined"
    ? window.location.origin
    : process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || "http://localhost:3000"

export const authClient = createAuthClient({
  baseURL,
  plugins: [magicLinkClient(), passkeyClient()],
})

export const { signIn, signOut, signUp, useSession } = authClient
