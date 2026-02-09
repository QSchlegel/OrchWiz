export type Chain = "cardano"

export interface SigningIntent {
  chain: Chain
  keyRef: string
  payload: string
  address?: string
  idempotencyKey?: string
}
