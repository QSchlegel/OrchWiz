import { NextResponse } from "next/server"
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { walletEnclaveEnabled } from "@/lib/wallet-enclave/client"

export const dynamic = "force-dynamic"

async function isEnclaveReachable(url: string): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 2000)
    const response = await fetch(`${url.replace(/\/+$/u, "")}/health`, {
      signal: controller.signal,
    })
    clearTimeout(timer)
    return response.ok
  } catch {
    return false
  }
}

export async function POST() {
  const enclaveUrl = process.env.WALLET_ENCLAVE_URL || "http://127.0.0.1:3377"

  if (!walletEnclaveEnabled()) {
    return NextResponse.json(
      {
        error: "Wallet enclave is disabled. Set WALLET_ENCLAVE_ENABLED=true to enable.",
        code: "WALLET_ENCLAVE_DISABLED",
      },
      { status: 422 },
    )
  }

  const alreadyRunning = await isEnclaveReachable(enclaveUrl)
  if (alreadyRunning) {
    return NextResponse.json({
      ok: true,
      status: "already_running",
      url: enclaveUrl,
      message: "Wallet enclave is already running.",
    })
  }

  // Resolve the wallet-enclave service directory relative to the project root.
  // In a typical dev setup the Next.js app runs from `node/` so the enclave
  // source is at `../services/wallet-enclave`.
  const candidates = [
    resolve(process.cwd(), "../services/wallet-enclave"),
    resolve(process.cwd(), "services/wallet-enclave"),
    resolve(process.cwd(), "../../services/wallet-enclave"),
  ]
  const enclaveDir = candidates.find(
    (dir) => existsSync(resolve(dir, "package.json")),
  )

  if (!enclaveDir) {
    return NextResponse.json(
      {
        error:
          "Could not locate the wallet-enclave service directory. Ensure `services/wallet-enclave` exists in the project.",
        code: "WALLET_ENCLAVE_NOT_FOUND",
      },
      { status: 422 },
    )
  }

  const hasNodeModules = existsSync(resolve(enclaveDir, "node_modules"))
  if (!hasNodeModules) {
    return NextResponse.json(
      {
        error:
          "wallet-enclave dependencies are not installed. Run `npm install` in services/wallet-enclave first.",
        code: "WALLET_ENCLAVE_DEPS_MISSING",
      },
      { status: 422 },
    )
  }

  try {
    const child = spawn("npx", ["tsx", "src/server.ts"], {
      cwd: enclaveDir,
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        WALLET_ENCLAVE_HOST:
          process.env.WALLET_ENCLAVE_HOST || "127.0.0.1",
        WALLET_ENCLAVE_PORT:
          process.env.WALLET_ENCLAVE_PORT || "3377",
      },
    })
    child.unref()

    // Wait briefly for the process to start and become reachable.
    let reachable = false
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((r) => setTimeout(r, 500))
      reachable = await isEnclaveReachable(enclaveUrl)
      if (reachable) break
    }

    if (reachable) {
      return NextResponse.json({
        ok: true,
        status: "started",
        url: enclaveUrl,
        message: "Wallet enclave started successfully.",
      })
    }

    return NextResponse.json(
      {
        ok: false,
        status: "start_timeout",
        url: enclaveUrl,
        message:
          "Process spawned but enclave did not become reachable within 5 seconds. Check the terminal for errors.",
      },
      { status: 504 },
    )
  } catch (error) {
    return NextResponse.json(
      {
        error: `Failed to spawn wallet-enclave process: ${(error as Error).message}`,
        code: "WALLET_ENCLAVE_SPAWN_FAILED",
      },
      { status: 500 },
    )
  }
}
