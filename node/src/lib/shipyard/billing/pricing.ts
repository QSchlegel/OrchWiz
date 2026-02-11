import type { CloudCatalog, CloudProviderConfig } from "@/lib/shipyard/cloud/types"
import {
  SHIPYARD_BILLING_CONVENIENCE_FEE_PERCENT,
  SHIPYARD_BILLING_CONVENIENCE_FEE_PERCENT_DISPLAY,
  SHIPYARD_BILLING_CURRENCY,
  SHIPYARD_BILLING_QUOTE_HOURS,
  type ShipyardBillingCurrencyCode,
} from "@/lib/shipyard/billing/constants"

export type ShipyardBillingQuoteErrorCode = "BILLING_QUOTE_UNAVAILABLE"

export class ShipyardBillingQuoteError extends Error {
  code: ShipyardBillingQuoteErrorCode
  status: number

  constructor(message: string, code: ShipyardBillingQuoteErrorCode = "BILLING_QUOTE_UNAVAILABLE", status = 422) {
    super(message)
    this.name = "ShipyardBillingQuoteError"
    this.code = code
    this.status = status
  }
}

export interface CloudMachineQuoteLine {
  machineType: string
  count: number
  unitPriceHourlyEur: number
  linePriceHourlyEur: number
  source: "location" | "average"
}

export interface ShipyardCloudLaunchQuote {
  provider: "hetzner"
  location: string
  currency: ShipyardBillingCurrencyCode
  hours: number
  convenienceFeePercent: number
  controlPlane: CloudMachineQuoteLine
  workers: CloudMachineQuoteLine
  baseHourlyEur: number
  baseCostCents: number
  convenienceFeeCents: number
  totalCents: number
}

export interface ShipyardCloudLaunchQuoteWithBalance extends ShipyardCloudLaunchQuote {
  walletBalanceCents: number
  shortfallCents: number
  canLaunch: boolean
}

function eurosToCents(value: number): number {
  return Math.round(value * 100)
}

function findMachineType(catalog: CloudCatalog, machineTypeName: string) {
  const normalized = machineTypeName.trim().toLowerCase()
  return catalog.machineTypes.find((machineType) => machineType.name.trim().toLowerCase() === normalized) || null
}

function resolveLocationPrice(args: {
  catalog: CloudCatalog
  machineTypeName: string
  location: string
}): { unitPriceHourlyEur: number; source: "location" | "average" } {
  const machineType = findMachineType(args.catalog, args.machineTypeName)
  if (!machineType) {
    throw new ShipyardBillingQuoteError(`Machine type '${args.machineTypeName}' was not found in the provider catalog.`)
  }

  const locationCandidates = [args.location, args.location.toLowerCase(), args.location.toUpperCase()]
  for (const candidate of locationCandidates) {
    const found = machineType.priceHourlyByLocationEur[candidate]
    if (typeof found === "number" && Number.isFinite(found) && found >= 0) {
      return {
        unitPriceHourlyEur: found,
        source: "location",
      }
    }
  }

  if (typeof machineType.priceHourlyEur === "number" && Number.isFinite(machineType.priceHourlyEur) && machineType.priceHourlyEur >= 0) {
    return {
      unitPriceHourlyEur: machineType.priceHourlyEur,
      source: "average",
    }
  }

  throw new ShipyardBillingQuoteError(`No hourly price is available for machine type '${args.machineTypeName}'.`)
}

function validateCount(count: number, fieldLabel: string): number {
  if (!Number.isFinite(count) || count <= 0) {
    throw new ShipyardBillingQuoteError(`${fieldLabel} count must be greater than zero.`)
  }
  return Math.floor(count)
}

export function buildShipyardCloudLaunchQuote(args: {
  cloudProvider: CloudProviderConfig
  catalog: CloudCatalog
}): ShipyardCloudLaunchQuote {
  const { cloudProvider, catalog } = args
  if (cloudProvider.provider !== "hetzner") {
    throw new ShipyardBillingQuoteError("Only Hetzner cloud pricing is supported for Ship Yard billing.")
  }

  const location = cloudProvider.cluster.location.trim()
  if (!location) {
    throw new ShipyardBillingQuoteError("Cloud cluster location is required to estimate launch cost.")
  }

  const controlPlaneCount = validateCount(cloudProvider.cluster.controlPlane.count, "Control plane")
  const workerCount = validateCount(cloudProvider.cluster.workers.count, "Worker")

  const controlPlanePrice = resolveLocationPrice({
    catalog,
    machineTypeName: cloudProvider.cluster.controlPlane.machineType,
    location,
  })
  const workerPrice = resolveLocationPrice({
    catalog,
    machineTypeName: cloudProvider.cluster.workers.machineType,
    location,
  })

  const controlPlaneLinePrice = controlPlanePrice.unitPriceHourlyEur * controlPlaneCount
  const workerLinePrice = workerPrice.unitPriceHourlyEur * workerCount
  const baseHourlyEur = controlPlaneLinePrice + workerLinePrice
  const baseCostCents = eurosToCents(baseHourlyEur * SHIPYARD_BILLING_QUOTE_HOURS)
  const convenienceFeeCents = Math.round(baseCostCents * SHIPYARD_BILLING_CONVENIENCE_FEE_PERCENT)
  const totalCents = baseCostCents + convenienceFeeCents

  return {
    provider: "hetzner",
    location,
    currency: SHIPYARD_BILLING_CURRENCY,
    hours: SHIPYARD_BILLING_QUOTE_HOURS,
    convenienceFeePercent: SHIPYARD_BILLING_CONVENIENCE_FEE_PERCENT_DISPLAY,
    controlPlane: {
      machineType: cloudProvider.cluster.controlPlane.machineType,
      count: controlPlaneCount,
      unitPriceHourlyEur: controlPlanePrice.unitPriceHourlyEur,
      linePriceHourlyEur: controlPlaneLinePrice,
      source: controlPlanePrice.source,
    },
    workers: {
      machineType: cloudProvider.cluster.workers.machineType,
      count: workerCount,
      unitPriceHourlyEur: workerPrice.unitPriceHourlyEur,
      linePriceHourlyEur: workerLinePrice,
      source: workerPrice.source,
    },
    baseHourlyEur,
    baseCostCents,
    convenienceFeeCents,
    totalCents,
  }
}

export function withWalletBalance(
  quote: ShipyardCloudLaunchQuote,
  walletBalanceCents: number,
): ShipyardCloudLaunchQuoteWithBalance {
  const normalizedBalance = Number.isFinite(walletBalanceCents)
    ? Math.max(0, Math.floor(walletBalanceCents))
    : 0
  const shortfallCents = Math.max(0, quote.totalCents - normalizedBalance)

  return {
    ...quote,
    walletBalanceCents: normalizedBalance,
    shortfallCents,
    canLaunch: shortfallCents === 0,
  }
}
