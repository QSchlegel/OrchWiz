import { cosineSimilarity, welfordUpdate, type WelfordState } from "./stats"

export interface EmbeddingBaselineState {
  centroid: number[] | null
  sim: WelfordState | null
}

export function updateEmbeddingBaseline(args: {
  state: EmbeddingBaselineState
  vector: number[]
}): {
  state: EmbeddingBaselineState
  similarity: number | null
} {
  const prevCentroid = args.state.centroid
  const prevSim = args.state.sim

  if (!prevCentroid || prevCentroid.length === 0) {
    return {
      state: {
        centroid: args.vector,
        sim: prevSim,
      },
      similarity: null,
    }
  }

  if (prevCentroid.length !== args.vector.length) {
    // Keep the existing centroid; treat as unavailable update.
    return {
      state: args.state,
      similarity: null,
    }
  }

  const similarity = cosineSimilarity(args.vector, prevCentroid)
  const nextSim = similarity === null ? prevSim : welfordUpdate(prevSim, similarity)

  // When centroid exists, we assume it is the mean of prior vectors.
  const simCount = prevSim?.count ?? 0
  const vectorCount = simCount + 1
  const nextCentroid = prevCentroid.map(
    (entry, idx) => (entry * vectorCount + args.vector[idx]) / (vectorCount + 1),
  )

  return {
    state: {
      centroid: nextCentroid,
      sim: nextSim,
    },
    similarity,
  }
}

