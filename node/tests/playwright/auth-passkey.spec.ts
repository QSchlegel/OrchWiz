import { expect, test, type CDPSession, type Page } from "@playwright/test"
import { buildBotAuthEmail, resolveBotAuthIdentity } from "./_bot-shared"

type RegistrationOutcome = "registered_and_signed_in" | "already_exists"

async function addVirtualAuthenticator(page: Page): Promise<{ session: CDPSession; authenticatorId: string }> {
  const session = await page.context().newCDPSession(page)
  await session.send("WebAuthn.enable")

  const response = await session.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })

  return {
    session,
    authenticatorId: String(response.authenticatorId),
  }
}

async function removeVirtualAuthenticator(session: CDPSession | null, authenticatorId: string | null): Promise<void> {
  if (!session || !authenticatorId) {
    return
  }

  try {
    await session.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId })
  } catch {
    // Best effort cleanup.
  }

  try {
    await session.send("WebAuthn.disable")
  } catch {
    // Best effort cleanup.
  }
}

async function waitForRegistrationOutcome(page: Page): Promise<RegistrationOutcome> {
  const alreadyExistsNotice = page.getByText("That email already has an account. Use passkey sign-in or request a magic link.")
  const passkeyCreationFailedNotice = page.getByText("Account created, but passkey registration failed. Try again or use a magic link.")
  const passkeyGenericFailedNotice = page.getByText("Unable to register your passkey right now. Try again or use a magic link.")
  const deadline = Date.now() + 45_000

  while (Date.now() < deadline) {
    const pathname = new URL(page.url()).pathname
    if (pathname === "/sessions" || pathname.startsWith("/sessions/")) {
      return "registered_and_signed_in"
    }

    if (await alreadyExistsNotice.isVisible().catch(() => false)) {
      return "already_exists"
    }

    if (await passkeyCreationFailedNotice.isVisible().catch(() => false)) {
      throw new Error("Passkey registration failed after account creation.")
    }

    if (await passkeyGenericFailedNotice.isVisible().catch(() => false)) {
      throw new Error("Unable to register passkey for login flow.")
    }

    await page.waitForTimeout(250)
  }

  throw new Error("Timed out waiting for passkey registration outcome.")
}

async function assertSignedIn(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/sessions(?:\/.*)?$/, { timeout: 30_000 })
  await expect(page.getByRole("button", { name: "Sign Out" })).toBeVisible({ timeout: 30_000 })
}

async function dismissWelcomeModalIfPresent(page: Page): Promise<void> {
  const skipButton = page.getByRole("button", { name: "Skip for now" })
  if (await skipButton.isVisible().catch(() => false)) {
    await skipButton.click()
    await expect(skipButton).toBeHidden()
  }
}

async function signInWithPasskey(page: Page, session: CDPSession, authenticatorId: string): Promise<void> {
  const passkeySignInButton = page.getByRole("button", { name: "Sign in with passkey" })
  const cancelledNotice = page.getByText("Passkey sign-in was cancelled.")
  const notFoundNotice = page.getByText("No passkey found for this account on this device.")
  const mismatchNotice = page.getByText("Passkey sign-in domain mismatch.")
  const failedNotice = page.getByText("Passkey sign-in failed. Try again or use a magic link instead.")

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await session.send("WebAuthn.setUserVerified", { authenticatorId, isUserVerified: true })
    } catch {
      // Best effort: this command is not available in all Chromium versions.
    }

    await passkeySignInButton.click()

    const deadline = Date.now() + 20_000
    while (Date.now() < deadline) {
      const pathname = new URL(page.url()).pathname
      if (pathname === "/sessions" || pathname.startsWith("/sessions/")) {
        return
      }

      if (await notFoundNotice.isVisible().catch(() => false)) {
        throw new Error("No passkey found for this account on this device.")
      }

      if (await mismatchNotice.isVisible().catch(() => false)) {
        throw new Error("Passkey sign-in domain mismatch.")
      }

      if (await failedNotice.isVisible().catch(() => false)) {
        throw new Error("Passkey sign-in failed.")
      }

      if (await cancelledNotice.isVisible().catch(() => false)) {
        break
      }

      await page.waitForTimeout(200)
    }

    if (attempt < 3) {
      await page.reload({ waitUntil: "domcontentloaded" })
      await expect(passkeySignInButton).toBeVisible()
    }
  }

  throw new Error("Passkey sign-in was cancelled repeatedly.")
}

test.describe("Playwright bot passkey auth e2e", () => {
  test("can register with passkey, sign out, and sign in again with passkey", async ({ page }, testInfo) => {
    test.slow()

    const identity = resolveBotAuthIdentity()
    const email = buildBotAuthEmail(identity, {
      tag: "auth",
      workerIndex: testInfo.workerIndex,
      retry: testInfo.retry,
    })

    let cdpSession: CDPSession | null = null
    let authenticatorId: string | null = null

    try {
      await page.goto("/login", { waitUntil: "domcontentloaded" })
      await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible()

      const authenticator = await addVirtualAuthenticator(page)
      cdpSession = authenticator.session
      authenticatorId = authenticator.authenticatorId
      if (!cdpSession || !authenticatorId) {
        throw new Error("Virtual authenticator was not initialized.")
      }

      await page.getByLabel("Email").fill(email)
      await expect(page.getByLabel("Display name")).toBeVisible()
      await page.getByLabel("Display name").fill(identity.displayName)

      await page.getByRole("button", { name: "Create account with passkey" }).click()
      const outcome = await waitForRegistrationOutcome(page)

      if (outcome === "already_exists") {
        await signInWithPasskey(page, cdpSession, authenticatorId)
      }

      await assertSignedIn(page)
      await dismissWelcomeModalIfPresent(page)

      await page.getByRole("button", { name: "Sign Out" }).click()
      await expect(page).toHaveURL(/\/login$/, { timeout: 30_000 })
      await page.waitForTimeout(200)

      await signInWithPasskey(page, cdpSession, authenticatorId)
      await assertSignedIn(page)
    } finally {
      await removeVirtualAuthenticator(cdpSession, authenticatorId)
    }
  })
})
