export type CoinTossPose = {
  position: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number }
  shadow: { scale: number; opacity: number }
}

export function computeCoinPose(
  progress: number,
  opts?: {
    spins?: number
    arcHeight?: number
    wobble?: number
  },
): CoinTossPose {
  const t = clamp01(progress)
  const spins = opts?.spins ?? 4.75
  const arcHeight = opts?.arcHeight ?? 1.35
  const wobble = opts?.wobble ?? 0.35

  const y = Math.sin(Math.PI * t) * arcHeight
  const rotX = t * spins * Math.PI * 2

  let rotZ = Math.sin(Math.PI * 2 * t) * wobble * (1 - t)

  // Short settle in the final 15%: smoothly damp toward 0.
  const settleStart = 0.85
  if (t > settleStart) {
    const u = (t - settleStart) / (1 - settleStart)
    const s = smoothstep(u)
    rotZ *= 1 - s
  }

  const heightNorm = arcHeight > 0 ? y / arcHeight : 0
  const shadowScale = clamp(1.05 - heightNorm * 0.38, 0.6, 1.15)
  const shadowOpacity = clamp(0.22 * (1 - heightNorm * 0.85), 0, 0.25)

  return {
    position: { x: 0, y, z: 0 },
    rotation: { x: rotX, y: 0, z: rotZ },
    shadow: { scale: shadowScale, opacity: shadowOpacity },
  }
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0
  }
  return value < 0 ? 0 : value > 1 ? 1 : value
}

function clamp(value: number, min: number, max: number) {
  return value < min ? min : value > max ? max : value
}

function smoothstep(t: number) {
  const x = clamp01(t)
  return x * x * (3 - 2 * x)
}
