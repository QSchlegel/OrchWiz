import { prisma } from "@/lib/prisma"
import type { RuntimeIntelligenceConfig } from "@/lib/runtime/intelligence/config"

export interface RuntimeIntelligencePolicySnapshot {
  threshold: number
  explorationRate: number
  learningRate: number
  targetReward: number
  emaReward: number
  sampleCount: number
  persisted: boolean
}

export interface RuntimeIntelligenceConsolidationSummary {
  checked: number
  updated: number
  failed: number
  executedAt: string
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function round(value: number, digits = 6): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function defaultSnapshot(config: RuntimeIntelligenceConfig): RuntimeIntelligencePolicySnapshot {
  return {
    threshold: config.thresholdDefault,
    explorationRate: config.explorationRate,
    learningRate: config.learningRate,
    targetReward: config.targetReward,
    emaReward: 0,
    sampleCount: 0,
    persisted: false,
  }
}

export async function loadRuntimeIntelligencePolicyState(
  userId: string | null | undefined,
  config: RuntimeIntelligenceConfig,
): Promise<RuntimeIntelligencePolicySnapshot> {
  if (!userId) {
    return defaultSnapshot(config)
  }

  try {
    const row = await prisma.runtimeIntelligencePolicyState.upsert({
      where: {
        userId,
      },
      create: {
        userId,
        threshold: config.thresholdDefault,
        explorationRate: config.explorationRate,
        learningRate: config.learningRate,
        targetReward: config.targetReward,
        emaReward: 0,
        sampleCount: 0,
      },
      update: {},
    })

    return {
      threshold: clamp(row.threshold, config.thresholdMin, config.thresholdMax),
      explorationRate: clamp(row.explorationRate, 0, 0.5),
      learningRate: clamp(row.learningRate, 0.001, 0.8),
      targetReward: clamp(row.targetReward, -2, 2),
      emaReward: row.emaReward,
      sampleCount: row.sampleCount,
      persisted: true,
    }
  } catch (error) {
    console.error("Runtime intelligence state load failed (fail-open):", error)
    return defaultSnapshot(config)
  }
}

export async function updateRuntimeIntelligencePolicyStateOnline(args: {
  userId: string | null | undefined
  rewardScore: number
  thresholdBefore: number | null
  config: RuntimeIntelligenceConfig
}): Promise<number | null> {
  if (!args.userId || args.thresholdBefore === null) {
    return args.thresholdBefore
  }

  try {
    const current = await prisma.runtimeIntelligencePolicyState.upsert({
      where: {
        userId: args.userId,
      },
      create: {
        userId: args.userId,
        threshold: args.config.thresholdDefault,
        explorationRate: args.config.explorationRate,
        learningRate: args.config.learningRate,
        targetReward: args.config.targetReward,
        emaReward: 0,
        sampleCount: 0,
      },
      update: {},
    })

    const rewardGap = args.rewardScore - current.targetReward
    const thresholdAfter = clamp(
      args.thresholdBefore + current.learningRate * rewardGap,
      args.config.thresholdMin,
      args.config.thresholdMax,
    )

    const emaReward = current.sampleCount === 0
      ? args.rewardScore
      : current.emaReward * 0.9 + args.rewardScore * 0.1

    await prisma.runtimeIntelligencePolicyState.update({
      where: {
        userId: args.userId,
      },
      data: {
        threshold: round(thresholdAfter),
        emaReward: round(emaReward),
        sampleCount: {
          increment: 1,
        },
      },
    })

    return round(thresholdAfter)
  } catch (error) {
    console.error("Runtime intelligence online update failed (fail-open):", error)
    return args.thresholdBefore
  }
}

export async function consolidateRuntimeIntelligencePolicyStates(
  config: RuntimeIntelligenceConfig,
  now = new Date(),
): Promise<RuntimeIntelligenceConsolidationSummary> {
  try {
    const rows = await prisma.runtimeIntelligencePolicyState.findMany({
      select: {
        userId: true,
        threshold: true,
        explorationRate: true,
        learningRate: true,
        targetReward: true,
        emaReward: true,
      },
    })

    let updated = 0
    let failed = 0

    for (const row of rows) {
      try {
        const rewardGap = row.emaReward - row.targetReward
        const threshold = clamp(
          row.threshold + row.learningRate * 0.35 * rewardGap,
          config.thresholdMin,
          config.thresholdMax,
        )
        const explorationRate = clamp(row.explorationRate * 0.97, 0.01, 0.5)
        const emaReward = row.emaReward * 0.97

        await prisma.runtimeIntelligencePolicyState.update({
          where: {
            userId: row.userId,
          },
          data: {
            threshold: round(threshold),
            explorationRate: round(explorationRate),
            emaReward: round(emaReward),
            lastConsolidatedAt: now,
          },
        })

        updated += 1
      } catch (error) {
        failed += 1
        console.error("Runtime intelligence consolidation update failed:", {
          userId: row.userId,
          error: error instanceof Error ? error.message : "Unknown error",
        })
      }
    }

    return {
      checked: rows.length,
      updated,
      failed,
      executedAt: now.toISOString(),
    }
  } catch (error) {
    console.error("Runtime intelligence consolidation failed:", error)
    return {
      checked: 0,
      updated: 0,
      failed: 1,
      executedAt: now.toISOString(),
    }
  }
}
