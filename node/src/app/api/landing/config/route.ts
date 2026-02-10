import { isLandingXoEnabled } from "@/lib/landing/feature"
import { landingJson } from "../http"

export const dynamic = "force-dynamic"

export interface LandingConfigRouteDeps {
  env: NodeJS.ProcessEnv
}

const defaultDeps: LandingConfigRouteDeps = {
  env: process.env,
}

export async function handleGetConfig(
  deps: LandingConfigRouteDeps = defaultDeps,
) {
  return landingJson(
    {
      enabled: isLandingXoEnabled(deps.env),
    },
    200,
    deps.env,
  )
}

export async function GET() {
  return handleGetConfig()
}
