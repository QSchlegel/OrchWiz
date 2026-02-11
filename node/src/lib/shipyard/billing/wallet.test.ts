import assert from "node:assert/strict"
import test from "node:test"
import {
  debitForLaunch,
  refundLaunchDebit,
  ShipyardInsufficientCreditsError,
} from "@/lib/shipyard/billing/wallet"

interface LedgerState {
  id: string
  walletId: string
  userId: string
  type: "launch_debit" | "launch_refund" | "topup_credit"
  referenceType: string | null
  referenceId: string | null
  balanceAfterCents: number
}

function buildWalletTestDeps(initialBalanceCents: number) {
  let walletBalanceCents = initialBalanceCents
  const walletId = "wallet-1"
  const userId = "user-1"
  const ledgers: LedgerState[] = []

  const tx = {
    shipyardBillingWallet: {
      upsert: async () => ({
        id: walletId,
        userId,
        balanceCents: walletBalanceCents,
      }),
    },
    shipyardBillingLedgerEntry: {
      findFirst: async (args: {
        where: {
          walletId: string
          type: LedgerState["type"]
          referenceType: string
          referenceId: string
        }
      }) => {
        const match = ledgers.find(
          (ledger) =>
            ledger.walletId === args.where.walletId
            && ledger.type === args.where.type
            && ledger.referenceType === args.where.referenceType
            && ledger.referenceId === args.where.referenceId,
        )
        if (!match) {
          return null
        }
        return {
          id: match.id,
          balanceAfterCents: match.balanceAfterCents,
        }
      },
      create: async (args: {
        data: {
          walletId: string
          userId: string
          type: LedgerState["type"]
          referenceType: string
          referenceId: string
          balanceAfterCents: number
        }
      }) => {
        const duplicate = ledgers.find(
          (ledger) =>
            ledger.type === args.data.type
            && ledger.referenceType === args.data.referenceType
            && ledger.referenceId === args.data.referenceId,
        )
        if (duplicate) {
          const error = new Error("Unique constraint failed") as Error & { code: string }
          error.code = "P2002"
          throw error
        }

        const ledger: LedgerState = {
          id: `ledger-${ledgers.length + 1}`,
          walletId: args.data.walletId,
          userId: args.data.userId,
          type: args.data.type,
          referenceType: args.data.referenceType,
          referenceId: args.data.referenceId,
          balanceAfterCents: args.data.balanceAfterCents,
        }
        ledgers.push(ledger)
        return { id: ledger.id }
      },
      update: async (args: { where: { id: string }; data: { balanceAfterCents: number } }) => {
        const match = ledgers.find((ledger) => ledger.id === args.where.id)
        if (!match) {
          throw new Error("Missing ledger")
        }
        match.balanceAfterCents = args.data.balanceAfterCents
      },
    },
    $queryRaw: async (template: TemplateStringsArray, ...values: unknown[]) => {
      const sql = template.join(" ")
      if (sql.includes("\"balanceCents\" -") && sql.includes("AND \"balanceCents\" >=")) {
        const amount = Number(values[0])
        if (walletBalanceCents < amount) {
          return []
        }
        walletBalanceCents -= amount
        return [{ balanceCents: walletBalanceCents }]
      }

      if (sql.includes("\"balanceCents\" +")) {
        const amount = Number(values[0])
        walletBalanceCents += amount
        return [{ balanceCents: walletBalanceCents }]
      }

      throw new Error(`Unexpected SQL in test double: ${sql}`)
    },
  }

  return {
    deps: {
      db: {
        $transaction: async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx),
        shipyardBillingWallet: {
          upsert: async () => ({
            id: walletId,
            userId,
            balanceCents: walletBalanceCents,
            currency: "eur",
          }),
        },
        shipyardBillingTopup: {
          updateMany: async () => ({ count: 0 }),
        },
      },
    },
    ledgers,
    getBalance: () => walletBalanceCents,
  }
}

test("debitForLaunch atomically deducts launch credits", async () => {
  const mock = buildWalletTestDeps(1200)

  const result = await debitForLaunch(
    {
      userId: "user-1",
      amountCents: 500,
      launchReferenceId: "ship-123",
    },
    mock.deps as any,
  )

  assert.equal(result.idempotent, false)
  assert.equal(result.balanceAfterCents, 700)
  assert.equal(mock.getBalance(), 700)
  assert.equal(mock.ledgers.length, 1)
})

test("debitForLaunch throws when wallet balance is insufficient", async () => {
  const mock = buildWalletTestDeps(200)

  await assert.rejects(
    () =>
      debitForLaunch(
        {
          userId: "user-1",
          amountCents: 500,
          launchReferenceId: "ship-124",
        },
        mock.deps as any,
      ),
    (error: unknown) => {
      assert.ok(error instanceof ShipyardInsufficientCreditsError)
      assert.equal((error as ShipyardInsufficientCreditsError).shortfallCents, 300)
      return true
    },
  )

  assert.equal(mock.getBalance(), 200)
})

test("refundLaunchDebit is idempotent for the same launch reference", async () => {
  const mock = buildWalletTestDeps(100)

  const first = await refundLaunchDebit(
    {
      userId: "user-1",
      amountCents: 250,
      launchReferenceId: "ship-125",
    },
    mock.deps as any,
  )
  assert.equal(first.idempotent, false)
  assert.equal(first.balanceAfterCents, 350)

  const second = await refundLaunchDebit(
    {
      userId: "user-1",
      amountCents: 250,
      launchReferenceId: "ship-125",
    },
    mock.deps as any,
  )
  assert.equal(second.idempotent, true)
  assert.equal(mock.getBalance(), 350)
  assert.equal(mock.ledgers.length, 1)
})
