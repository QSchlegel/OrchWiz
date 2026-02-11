import assert from "node:assert/strict"
import test from "node:test"
import type { CloudCatalog, CloudProviderConfig } from "@/lib/shipyard/cloud/types"
import {
  buildShipyardCloudLaunchQuote,
  ShipyardBillingQuoteError,
  withWalletBalance,
} from "@/lib/shipyard/billing/pricing"

const baseCloudProvider = {
  provider: "hetzner",
  cluster: {
    clusterName: "shipyard-test",
    location: "nbg1",
    networkCidr: "10.42.0.0/16",
    image: "ubuntu-24.04",
    controlPlane: {
      machineType: "cx22",
      count: 1,
    },
    workers: {
      machineType: "cx32",
      count: 2,
    },
  },
  stackMode: "full_support_systems",
  k3s: {
    channel: "stable",
    disableTraefik: true,
  },
  tunnelPolicy: {
    manage: true,
    target: "kubernetes_api",
    localPort: 16443,
  },
  sshKeyId: null,
} as const satisfies CloudProviderConfig

const baseCatalog: CloudCatalog = {
  fetchedAt: "2026-02-11T00:00:00.000Z",
  regions: [
    {
      id: "1",
      name: "nbg1",
      description: "Nuremberg",
      networkZone: "eu-central",
    },
  ],
  machineTypes: [
    {
      id: "10",
      name: "cx22",
      description: "cx22",
      cpu: 2,
      memoryGb: 4,
      diskGb: 40,
      architecture: "x86",
      locations: ["nbg1"],
      priceHourlyByLocationEur: {
        nbg1: 0.013,
      },
      priceHourlyEur: 0.013,
    },
    {
      id: "11",
      name: "cx32",
      description: "cx32",
      cpu: 4,
      memoryGb: 8,
      diskGb: 80,
      architecture: "x86",
      locations: ["nbg1", "fsn1"],
      priceHourlyByLocationEur: {
        nbg1: 0.024,
        fsn1: 0.026,
      },
      priceHourlyEur: 0.025,
    },
  ],
  images: [],
}

test("buildShipyardCloudLaunchQuote uses location-specific machine prices", () => {
  const quote = buildShipyardCloudLaunchQuote({
    cloudProvider: baseCloudProvider,
    catalog: baseCatalog,
  })

  assert.equal(quote.baseHourlyEur, 0.061)
  assert.equal(quote.baseCostCents, 4392)
  assert.equal(quote.convenienceFeeCents, 439)
  assert.equal(quote.totalCents, 4831)
  assert.equal(quote.controlPlane.source, "location")
  assert.equal(quote.workers.source, "location")
})

test("buildShipyardCloudLaunchQuote falls back to average machine price", () => {
  const quote = buildShipyardCloudLaunchQuote({
    cloudProvider: {
      ...baseCloudProvider,
      cluster: {
        ...baseCloudProvider.cluster,
        location: "hel1",
      },
    },
    catalog: baseCatalog,
  })

  assert.equal(quote.controlPlane.source, "average")
  assert.equal(quote.workers.source, "average")
  assert.equal(quote.baseHourlyEur, 0.063)
})

test("withWalletBalance computes launch shortfall and gate state", () => {
  const quote = buildShipyardCloudLaunchQuote({
    cloudProvider: baseCloudProvider,
    catalog: baseCatalog,
  })

  const blocked = withWalletBalance(quote, 100)
  assert.equal(blocked.canLaunch, false)
  assert.equal(blocked.shortfallCents, quote.totalCents - 100)

  const allowed = withWalletBalance(quote, quote.totalCents)
  assert.equal(allowed.canLaunch, true)
  assert.equal(allowed.shortfallCents, 0)
})

test("buildShipyardCloudLaunchQuote throws for unknown machine type", () => {
  assert.throws(
    () =>
      buildShipyardCloudLaunchQuote({
        cloudProvider: {
          ...baseCloudProvider,
          cluster: {
            ...baseCloudProvider.cluster,
            controlPlane: {
              ...baseCloudProvider.cluster.controlPlane,
              machineType: "unknown-machine",
            },
          },
        },
        catalog: baseCatalog,
      }),
    (error: unknown) => {
      assert.ok(error instanceof ShipyardBillingQuoteError)
      return true
    },
  )
})
