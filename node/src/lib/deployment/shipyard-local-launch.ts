import type { DeploymentAdapterResult } from "./adapter"
import type { OpenClawContextBundle } from "./openclaw-context"
import type { InfrastructureConfig, ProvisioningMode } from "./profile"
import { runLocalBootstrap } from "./local-bootstrap"
import type {
  LocalBootstrapErrorCode,
  LocalBootstrapFailureDetails,
  LocalBootstrapResult,
} from "./local-bootstrap.types"

interface ShipyardLocalLaunchInput {
  provisioningMode: ProvisioningMode
  infrastructure: InfrastructureConfig
  saneBootstrap: boolean
  openClawContextBundle?: OpenClawContextBundle
}

interface ShipyardLocalLaunchSuccess {
  ok: true
  adapterResult: DeploymentAdapterResult
}

interface ShipyardLocalLaunchFailure {
  ok: false
  httpStatus: number
  code: LocalBootstrapErrorCode
  error: string
  details?: LocalBootstrapFailureDetails
  metadata?: Record<string, unknown>
}

export type ShipyardLocalLaunchResult = ShipyardLocalLaunchSuccess | ShipyardLocalLaunchFailure

interface ShipyardLocalLaunchDependencies {
  localBootstrapRunner?: (input: ShipyardLocalLaunchInput) => Promise<LocalBootstrapResult>
}

export async function runShipyardLocalLaunch(
  input: ShipyardLocalLaunchInput,
  dependencies: ShipyardLocalLaunchDependencies = {},
): Promise<ShipyardLocalLaunchResult> {
  const localBootstrapRunner = dependencies.localBootstrapRunner || runLocalBootstrap

  const bootstrapResult = await localBootstrapRunner(input)
  if (!bootstrapResult.ok) {
    return {
      ok: false,
      httpStatus: bootstrapResult.expected ? 422 : 500,
      code: bootstrapResult.code,
      error: bootstrapResult.error,
      ...(bootstrapResult.details ? { details: bootstrapResult.details } : {}),
      ...(bootstrapResult.metadata ? { metadata: bootstrapResult.metadata } : {}),
    }
  }

  return {
    ok: true,
    adapterResult: {
      status: "active",
      deployedAt: new Date(),
      lastHealthCheck: new Date(),
      healthStatus: "healthy",
      metadata: {
        mode: "shipyard_local",
        ...(bootstrapResult.metadata || {}),
      },
    },
  }
}
