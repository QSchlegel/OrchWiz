import test from "node:test"
import assert from "node:assert/strict"
import {
  estimateShipBaseRequirements,
  readBaseRequirementsEstimate,
} from "./resource-estimation"

test("estimateShipBaseRequirements computes local profile totals with all bridge crew roles", () => {
  const estimate = estimateShipBaseRequirements({
    deploymentProfile: "local_starship_build",
    crewRoles: ["xo", "ops", "eng", "sec", "med", "cou"],
  })

  assert.equal(estimate.totals.cpuMillicores, 1450)
  assert.equal(estimate.totals.memoryMiB, 1920)
})

test("estimateShipBaseRequirements computes cloud profile totals for xo/ops/eng", () => {
  const estimate = estimateShipBaseRequirements({
    deploymentProfile: "cloud_shipyard",
    crewRoles: ["xo", "ops", "eng"],
  })

  assert.equal(estimate.totals.cpuMillicores, 1400)
  assert.equal(estimate.totals.memoryMiB, 2048)
})

test("estimateShipBaseRequirements de-dupes duplicate bridge crew roles", () => {
  const estimate = estimateShipBaseRequirements({
    deploymentProfile: "local_starship_build",
    crewRoles: ["xo", "xo", "ops", "ops"],
  })

  assert.equal(estimate.crew.roles.length, 2)
  assert.deepEqual(
    estimate.crew.roles.map((role) => role.role),
    ["xo", "ops"],
  )
  assert.equal(estimate.totals.cpuMillicores, 1000)
  assert.equal(estimate.totals.memoryMiB, 1344)
})

test("estimateShipBaseRequirements falls back to baseline for empty or invalid role input", () => {
  const invalidEstimate = estimateShipBaseRequirements({
    deploymentProfile: "cloud_shipyard",
    crewRoles: ["invalid-role", 123, null],
  })
  assert.equal(invalidEstimate.crew.roles.length, 0)
  assert.equal(invalidEstimate.totals.cpuMillicores, 1000)
  assert.equal(invalidEstimate.totals.memoryMiB, 1536)

  const emptyEstimate = estimateShipBaseRequirements({
    deploymentProfile: "local_starship_build",
    crewRoles: [],
  })
  assert.equal(emptyEstimate.crew.roles.length, 0)
  assert.equal(emptyEstimate.totals.cpuMillicores, 750)
  assert.equal(emptyEstimate.totals.memoryMiB, 1024)
})

test("readBaseRequirementsEstimate returns null for malformed metadata", () => {
  const validEstimate = estimateShipBaseRequirements({
    deploymentProfile: "local_starship_build",
    crewRoles: ["xo", "ops"],
  })

  assert.equal(readBaseRequirementsEstimate(null), null)
  assert.equal(readBaseRequirementsEstimate({}), null)
  assert.equal(
    readBaseRequirementsEstimate({
      baseRequirementsEstimate: {
        ...validEstimate,
        version: "shipyard_base_v2",
      },
    }),
    null,
  )
  assert.equal(
    readBaseRequirementsEstimate({
      baseRequirementsEstimate: {
        ...validEstimate,
        totals: {
          cpuMillicores: "1000",
          memoryMiB: 1024,
        },
      },
    }),
    null,
  )
})
