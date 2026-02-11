import { Prisma, type ShipyardBillingCurrency } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { SHIPYARD_BILLING_CURRENCY } from "@/lib/shipyard/billing/constants"

const SHIP_LAUNCH_REFERENCE_TYPE = "ship_launch"
const STRIPE_CHECKOUT_REFERENCE_TYPE = "stripe_checkout_session"

type WalletDbClient = Pick<
  typeof prisma,
  "$transaction" | "shipyardBillingWallet" | "shipyardBillingTopup"
>

interface WalletServiceDeps {
  db: WalletDbClient
}

const defaultDeps: WalletServiceDeps = {
  db: prisma,
}

export class ShipyardInsufficientCreditsError extends Error {
  code: string
  status: number
  requiredCents: number
  balanceCents: number
  shortfallCents: number

  constructor(args: { requiredCents: number; balanceCents: number }) {
    const shortfallCents = Math.max(0, args.requiredCents - args.balanceCents)
    super("Insufficient credits")
    this.name = "ShipyardInsufficientCreditsError"
    this.code = "INSUFFICIENT_CREDITS"
    this.status = 402
    this.requiredCents = args.requiredCents
    this.balanceCents = args.balanceCents
    this.shortfallCents = shortfallCents
  }
}

export interface WalletMutationResult {
  walletId: string
  balanceAfterCents: number
  ledgerEntryId: string
  idempotent: boolean
}

export type CompleteTopupResult =
  | {
      status: "completed" | "already_completed"
      topupId: string
      walletId: string
      balanceAfterCents: number
    }
  | {
      status: "not_found" | "not_pending" | "amount_mismatch"
      topupId?: string
      walletId?: string
    }

function asPositiveAmountCents(value: number): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new Error("Amount must be a positive integer amount of cents.")
  }
  return value
}

function isUniqueConstraintError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false
  }

  return "code" in error && (error as { code?: string }).code === "P2002"
}

async function upsertWallet(tx: Prisma.TransactionClient, userId: string) {
  return tx.shipyardBillingWallet.upsert({
    where: {
      userId,
    },
    update: {},
    create: {
      userId,
      currency: SHIPYARD_BILLING_CURRENCY,
      balanceCents: 0,
    },
  })
}

async function incrementWalletBalance(
  tx: Prisma.TransactionClient,
  walletId: string,
  deltaCents: number,
): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ balanceCents: number }>>`
    UPDATE "ShipyardBillingWallet"
    SET "balanceCents" = "balanceCents" + ${deltaCents}, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${walletId}
    RETURNING "balanceCents"
  `

  if (!rows[0]) {
    throw new Error("Wallet not found while applying balance update.")
  }

  return Number(rows[0].balanceCents)
}

async function decrementWalletBalance(
  tx: Prisma.TransactionClient,
  args: {
    walletId: string
    amountCents: number
  },
): Promise<number | null> {
  const rows = await tx.$queryRaw<Array<{ balanceCents: number }>>`
    UPDATE "ShipyardBillingWallet"
    SET "balanceCents" = "balanceCents" - ${args.amountCents}, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${args.walletId}
      AND "balanceCents" >= ${args.amountCents}
    RETURNING "balanceCents"
  `

  if (!rows[0]) {
    return null
  }

  return Number(rows[0].balanceCents)
}

export async function getOrCreateWallet(args: {
  userId: string
}, deps: WalletServiceDeps = defaultDeps) {
  return deps.db.shipyardBillingWallet.upsert({
    where: {
      userId: args.userId,
    },
    update: {},
    create: {
      userId: args.userId,
      currency: SHIPYARD_BILLING_CURRENCY,
      balanceCents: 0,
    },
  })
}

export async function debitForLaunch(args: {
  userId: string
  amountCents: number
  launchReferenceId: string
  currency?: ShipyardBillingCurrency
  metadata?: Record<string, unknown>
}, deps: WalletServiceDeps = defaultDeps): Promise<WalletMutationResult> {
  const amountCents = asPositiveAmountCents(args.amountCents)

  return deps.db.$transaction(async (tx) => {
    const wallet = await upsertWallet(tx, args.userId)

    const existing = await tx.shipyardBillingLedgerEntry.findFirst({
      where: {
        walletId: wallet.id,
        type: "launch_debit",
        referenceType: SHIP_LAUNCH_REFERENCE_TYPE,
        referenceId: args.launchReferenceId,
      },
      select: {
        id: true,
        balanceAfterCents: true,
      },
    })

    if (existing) {
      return {
        walletId: wallet.id,
        balanceAfterCents: existing.balanceAfterCents,
        ledgerEntryId: existing.id,
        idempotent: true,
      }
    }

    let ledgerEntryId: string
    try {
      const createdLedger = await tx.shipyardBillingLedgerEntry.create({
        data: {
          walletId: wallet.id,
          userId: args.userId,
          type: "launch_debit",
          deltaCents: -amountCents,
          balanceAfterCents: wallet.balanceCents,
          currency: args.currency || SHIPYARD_BILLING_CURRENCY,
          referenceType: SHIP_LAUNCH_REFERENCE_TYPE,
          referenceId: args.launchReferenceId,
          metadata: {
            pending: true,
            ...(args.metadata || {}),
          } as Prisma.InputJsonValue,
        },
        select: {
          id: true,
        },
      })
      ledgerEntryId = createdLedger.id
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const duplicate = await tx.shipyardBillingLedgerEntry.findFirst({
          where: {
            walletId: wallet.id,
            type: "launch_debit",
            referenceType: SHIP_LAUNCH_REFERENCE_TYPE,
            referenceId: args.launchReferenceId,
          },
          select: {
            id: true,
            balanceAfterCents: true,
          },
        })
        if (duplicate) {
          return {
            walletId: wallet.id,
            balanceAfterCents: duplicate.balanceAfterCents,
            ledgerEntryId: duplicate.id,
            idempotent: true,
          }
        }
      }
      throw error
    }

    const balanceAfter = await decrementWalletBalance(tx, {
      walletId: wallet.id,
      amountCents,
    })

    if (balanceAfter === null) {
      throw new ShipyardInsufficientCreditsError({
        requiredCents: amountCents,
        balanceCents: wallet.balanceCents,
      })
    }

    await tx.shipyardBillingLedgerEntry.update({
      where: {
        id: ledgerEntryId,
      },
      data: {
        balanceAfterCents: balanceAfter,
        ...(args.metadata
          ? {
              metadata: args.metadata as Prisma.InputJsonValue,
            }
          : {}),
      },
    })

    return {
      walletId: wallet.id,
      balanceAfterCents: balanceAfter,
      ledgerEntryId,
      idempotent: false,
    }
  })
}

export async function refundLaunchDebit(args: {
  userId: string
  amountCents: number
  launchReferenceId: string
  currency?: ShipyardBillingCurrency
  metadata?: Record<string, unknown>
}, deps: WalletServiceDeps = defaultDeps): Promise<WalletMutationResult> {
  const amountCents = asPositiveAmountCents(args.amountCents)

  return deps.db.$transaction(async (tx) => {
    const wallet = await upsertWallet(tx, args.userId)

    const existing = await tx.shipyardBillingLedgerEntry.findFirst({
      where: {
        walletId: wallet.id,
        type: "launch_refund",
        referenceType: SHIP_LAUNCH_REFERENCE_TYPE,
        referenceId: args.launchReferenceId,
      },
      select: {
        id: true,
        balanceAfterCents: true,
      },
    })

    if (existing) {
      return {
        walletId: wallet.id,
        balanceAfterCents: existing.balanceAfterCents,
        ledgerEntryId: existing.id,
        idempotent: true,
      }
    }

    let ledgerEntryId: string
    try {
      const createdLedger = await tx.shipyardBillingLedgerEntry.create({
        data: {
          walletId: wallet.id,
          userId: args.userId,
          type: "launch_refund",
          deltaCents: amountCents,
          balanceAfterCents: wallet.balanceCents,
          currency: args.currency || SHIPYARD_BILLING_CURRENCY,
          referenceType: SHIP_LAUNCH_REFERENCE_TYPE,
          referenceId: args.launchReferenceId,
          metadata: {
            pending: true,
            ...(args.metadata || {}),
          } as Prisma.InputJsonValue,
        },
        select: {
          id: true,
        },
      })
      ledgerEntryId = createdLedger.id
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const duplicate = await tx.shipyardBillingLedgerEntry.findFirst({
          where: {
            walletId: wallet.id,
            type: "launch_refund",
            referenceType: SHIP_LAUNCH_REFERENCE_TYPE,
            referenceId: args.launchReferenceId,
          },
          select: {
            id: true,
            balanceAfterCents: true,
          },
        })
        if (duplicate) {
          return {
            walletId: wallet.id,
            balanceAfterCents: duplicate.balanceAfterCents,
            ledgerEntryId: duplicate.id,
            idempotent: true,
          }
        }
      }
      throw error
    }

    const balanceAfter = await incrementWalletBalance(tx, wallet.id, amountCents)

    await tx.shipyardBillingLedgerEntry.update({
      where: {
        id: ledgerEntryId,
      },
      data: {
        balanceAfterCents: balanceAfter,
        ...(args.metadata
          ? {
              metadata: args.metadata as Prisma.InputJsonValue,
            }
          : {}),
      },
    })

    return {
      walletId: wallet.id,
      balanceAfterCents: balanceAfter,
      ledgerEntryId,
      idempotent: false,
    }
  })
}

export async function completeTopupFromStripeSession(args: {
  stripeCheckoutSessionId: string
  amountCents: number
  currency: ShipyardBillingCurrency
  stripePaymentIntentId?: string | null
  metadata?: Record<string, unknown>
}, deps: WalletServiceDeps = defaultDeps): Promise<CompleteTopupResult> {
  const amountCents = asPositiveAmountCents(args.amountCents)

  return deps.db.$transaction(async (tx) => {
    const topup = await tx.shipyardBillingTopup.findUnique({
      where: {
        stripeCheckoutSessionId: args.stripeCheckoutSessionId,
      },
    })

    if (!topup) {
      return {
        status: "not_found",
      }
    }

    if (topup.currency !== args.currency || topup.amountCents !== amountCents) {
      return {
        status: "amount_mismatch",
        topupId: topup.id,
        walletId: topup.walletId,
      }
    }

    const wallet = await tx.shipyardBillingWallet.findUnique({
      where: {
        id: topup.walletId,
      },
    })

    if (!wallet) {
      throw new Error("Top-up wallet is missing.")
    }

    if (topup.status === "completed") {
      return {
        status: "already_completed",
        topupId: topup.id,
        walletId: wallet.id,
        balanceAfterCents: wallet.balanceCents,
      }
    }

    if (topup.status !== "pending") {
      return {
        status: "not_pending",
        topupId: topup.id,
        walletId: wallet.id,
      }
    }

    let ledgerEntryId: string
    try {
      const ledger = await tx.shipyardBillingLedgerEntry.create({
        data: {
          walletId: wallet.id,
          userId: topup.userId,
          type: "topup_credit",
          deltaCents: amountCents,
          balanceAfterCents: wallet.balanceCents,
          currency: topup.currency,
          referenceType: STRIPE_CHECKOUT_REFERENCE_TYPE,
          referenceId: topup.stripeCheckoutSessionId,
          metadata: {
            pending: true,
            topupId: topup.id,
            ...(args.metadata || {}),
          } as Prisma.InputJsonValue,
        },
        select: {
          id: true,
        },
      })
      ledgerEntryId = ledger.id
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const latestWallet = await tx.shipyardBillingWallet.findUnique({
          where: {
            id: topup.walletId,
          },
        })
        return {
          status: "already_completed",
          topupId: topup.id,
          walletId: topup.walletId,
          balanceAfterCents: latestWallet?.balanceCents || 0,
        }
      }
      throw error
    }

    const balanceAfter = await incrementWalletBalance(tx, wallet.id, amountCents)

    await tx.shipyardBillingLedgerEntry.update({
      where: {
        id: ledgerEntryId,
      },
      data: {
        balanceAfterCents: balanceAfter,
        metadata: {
          topupId: topup.id,
          ...(args.metadata || {}),
        } as Prisma.InputJsonValue,
      },
    })

    await tx.shipyardBillingTopup.update({
      where: {
        id: topup.id,
      },
      data: {
        status: "completed",
        stripePaymentIntentId: args.stripePaymentIntentId || topup.stripePaymentIntentId,
        completedAt: new Date(),
        metadata: {
          ...(topup.metadata && typeof topup.metadata === "object" ? (topup.metadata as Record<string, unknown>) : {}),
          checkoutSessionId: args.stripeCheckoutSessionId,
          ...(args.metadata || {}),
        } as Prisma.InputJsonValue,
      },
    })

    return {
      status: "completed",
      topupId: topup.id,
      walletId: wallet.id,
      balanceAfterCents: balanceAfter,
    }
  })
}

export async function markTopupExpiredByStripeSession(args: {
  stripeCheckoutSessionId: string
}, deps: WalletServiceDeps = defaultDeps): Promise<{ updatedCount: number }> {
  const updateResult = await deps.db.shipyardBillingTopup.updateMany({
    where: {
      stripeCheckoutSessionId: args.stripeCheckoutSessionId,
      status: "pending",
    },
    data: {
      status: "expired",
    },
  })

  return {
    updatedCount: updateResult.count,
  }
}

export async function markTopupFailedById(args: {
  topupId: string
  metadata?: Record<string, unknown>
}, deps: WalletServiceDeps = defaultDeps): Promise<void> {
  await deps.db.shipyardBillingTopup.updateMany({
    where: {
      id: args.topupId,
      status: "pending",
    },
    data: {
      status: "failed",
      ...(args.metadata
        ? {
            metadata: args.metadata as Prisma.InputJsonValue,
          }
        : {}),
    },
  })
}
