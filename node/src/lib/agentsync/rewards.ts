import type { AgentSyncSignalSource } from "@prisma/client"

export interface AgentSyncRewardSignal {
  source: AgentSyncSignalSource
  reward: number
  occurredAt: Date
}

export interface AgentSyncAggregateOptions {
  minSignals: number
}

export interface AgentSyncRewardAggregate {
  signalCount: number
  totalReward: number
  meanReward: number
  trend: "positive" | "neutral" | "negative"
  shouldApply: boolean
  sourceBreakdown: Record<AgentSyncSignalSource, { count: number; totalReward: number; meanReward: number }>
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100
}

function sentimentScore(feedback: string | null | undefined): number {
  if (!feedback) {
    return 0
  }

  const normalized = feedback.toLowerCase()
  const positiveKeywords = ["pass", "passed", "success", "healthy", "stable", "improved", "resolved"]
  const negativeKeywords = ["fail", "failed", "error", "regress", "unstable", "incident", "outage", "unsafe", "broken"]

  let score = 0
  for (const keyword of positiveKeywords) {
    if (normalized.includes(keyword)) {
      score += 0.08
    }
  }
  for (const keyword of negativeKeywords) {
    if (normalized.includes(keyword)) {
      score -= 0.12
    }
  }

  return clamp(score, -0.4, 0.4)
}

export function mapCommandOutcomeToReward(args: {
  status: "completed" | "failed" | "blocked"
  durationMs?: number | null
}): number {
  let reward = 0

  if (args.status === "completed") {
    reward = 1
  } else if (args.status === "failed") {
    reward = -1
  } else {
    reward = -0.55
  }

  const duration = typeof args.durationMs === "number" ? args.durationMs : null
  if (duration !== null) {
    if (duration <= 8_000) {
      reward += 0.12
    } else if (duration >= 60_000) {
      reward -= 0.15
    }
  }

  return roundTwo(clamp(reward, -1.5, 1.5))
}

export function mapVerificationOutcomeToReward(args: {
  status: string | null | undefined
  feedback?: string | null
  iterations?: number | null
}): number {
  const status = (args.status || "").trim().toLowerCase()
  let reward = 0

  if (["success", "passed", "completed", "ok"].includes(status)) {
    reward = 1
  } else if (["failed", "error"].includes(status)) {
    reward = -1
  } else if (["running", "pending"].includes(status)) {
    reward = 0.2
  }

  reward += sentimentScore(args.feedback)

  const iterations = typeof args.iterations === "number" ? args.iterations : null
  if (iterations !== null && iterations > 3) {
    reward -= Math.min(0.3, (iterations - 3) * 0.05)
  }

  return roundTwo(clamp(reward, -1.5, 1.5))
}

export function mapBridgeCallOutcomeToReward(args: {
  status: "success" | "failed" | "offline"
  attemptCount?: number | null
  wasRetried?: boolean | null
  latencyMs?: number | null
}): number {
  let reward = 0

  if (args.status === "success") {
    reward = 0.9
  } else if (args.status === "failed") {
    reward = -1
  } else {
    reward = -0.2
  }

  const attempts = typeof args.attemptCount === "number" ? args.attemptCount : 1
  if (args.wasRetried || attempts > 1) {
    reward -= 0.2
  }

  const latency = typeof args.latencyMs === "number" ? args.latencyMs : null
  if (latency !== null) {
    if (latency <= 8_000) {
      reward += 0.1
    } else if (latency >= 30_000) {
      reward -= 0.2
    }
  }

  return roundTwo(clamp(reward, -1.5, 1.5))
}

function emptySourceBreakdown(): Record<AgentSyncSignalSource, { count: number; totalReward: number; meanReward: number }> {
  return {
    command: { count: 0, totalReward: 0, meanReward: 0 },
    verification: { count: 0, totalReward: 0, meanReward: 0 },
    bridge_call: { count: 0, totalReward: 0, meanReward: 0 },
  }
}

export function aggregateAgentSyncRewards(
  signals: AgentSyncRewardSignal[],
  options: AgentSyncAggregateOptions,
): AgentSyncRewardAggregate {
  if (signals.length === 0) {
    return {
      signalCount: 0,
      totalReward: 0,
      meanReward: 0,
      trend: "neutral",
      shouldApply: false,
      sourceBreakdown: emptySourceBreakdown(),
    }
  }

  const sourceBreakdown = emptySourceBreakdown()
  let totalReward = 0

  for (const signal of signals) {
    totalReward += signal.reward
    sourceBreakdown[signal.source].count += 1
    sourceBreakdown[signal.source].totalReward += signal.reward
  }

  const signalCount = signals.length
  const meanReward = signalCount > 0 ? totalReward / signalCount : 0

  for (const source of Object.keys(sourceBreakdown) as AgentSyncSignalSource[]) {
    const entry = sourceBreakdown[source]
    entry.totalReward = roundTwo(entry.totalReward)
    entry.meanReward = entry.count > 0 ? roundTwo(entry.totalReward / entry.count) : 0
  }

  const trend: "positive" | "neutral" | "negative" = meanReward >= 0.25
    ? "positive"
    : meanReward <= -0.25
      ? "negative"
      : "neutral"

  return {
    signalCount,
    totalReward: roundTwo(totalReward),
    meanReward: roundTwo(meanReward),
    trend,
    shouldApply: signalCount >= options.minSignals,
    sourceBreakdown,
  }
}
