import { beforeEach, describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { shouldShowDisputeButton } from '@/lib/dispute-generator'
import { applyMonthlyReset } from '@/lib/monthly-reset'
import { STORAGE_KEYS, readFxCache, readMonthly, readReceipts, readRules } from '@/lib/persistence'
import { spendVisualState } from '@/lib/spend-status'
import { resetSpendGuardStore, useSpendGuardStore } from '@/store/useSpendGuardStore'
import type { FxRateCache, IntentReceipt, RuleSet } from '@/types'

const RUNS = 100
const NOW = '2026-10-15T12:00:00.000Z'

function receipt(partial: Partial<IntentReceipt> & Pick<IntentReceipt, 'id' | 'status'>): IntentReceipt {
  const amount = partial.usdEquivalentAmount ?? 10
  return {
    purchaseRequest: {
      id: partial.id,
      agentName: 'Agent',
      merchantName: 'Cafe',
      category: 'Dining',
      amount,
      currency: 'USD',
      intentText: 'lunch',
      structuredIntent: { intendedCategory: 'Dining', budgetCurrency: 'USD' },
      submittedAt: NOW,
    },
    usdEquivalentAmount: amount,
    fxRate: null,
    decision: {
      outcome: 'needs_approval',
      failures: [],
      explanation: 'held',
      evaluatedAt: NOW,
    },
    mismatches: [],
    priceCheckSkipped: false,
    approvedAt: null,
    declinedAt: null,
    overrideLog: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...partial,
  }
}

beforeEach(() => {
  localStorage.clear()
  resetSpendGuardStore()
})

describe('store properties', () => {
  it('property 12: dispute visibility matches mismatch presence', () => {
    // Feature: agent-spend-guard, Property 12: Dispute button visibility matches mismatch presence
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            type: fc.constantFrom(
              'price_mismatch' as const,
              'date_mismatch' as const,
              'category_mismatch' as const,
            ),
            detail: fc.string({ minLength: 1, maxLength: 20 }),
          }),
          { maxLength: 4 },
        ),
        (mismatches) => {
          const stored = receipt({ id: 'r1', status: 'needs_approval', mismatches })
          useSpendGuardStore.setState({ receipts: [stored] })
          const fromStore = useSpendGuardStore.getState().receipts[0]
          expect(shouldShowDisputeButton(fromStore)).toBe(fromStore.mismatches.length > 0)
          expect(shouldShowDisputeButton(fromStore)).toBe(mismatches.length > 0)
        },
      ),
      { numRuns: RUNS },
    )
  })

  it('property 13: dashboard warning and exceeded states are exclusive', () => {
    // Feature: agent-spend-guard, Property 13: Dashboard visual state thresholds are correct
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 200_000 }),
        fc.integer({ min: 1, max: 100_000 }),
        (committedCents, limitCents) => {
          const committed = committedCents / 100
          const limit = limitCents / 100
          const state = spendVisualState(committed, limit)
          const warning = state === 'warning'
          const exceeded = state === 'exceeded'
          expect(warning && exceeded).toBe(false)
          expect(exceeded).toBe(committed >= limit)
          expect(warning).toBe(committed / limit >= 0.8 && committed < limit)
        },
      ),
      { numRuns: RUNS },
    )
  })

  it('property 14: committed spend includes pending purchases', () => {
    // Feature: agent-spend-guard, Property 14: Committed spend includes pending purchases
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5_000 }),
        fc.integer({ min: 0, max: 5_000 }),
        fc.integer({ min: 0, max: 5_000 }),
        fc.integer({ min: 1, max: 5_000 }),
        (approvedCents, pendingCents, declinedCents, extraPendingCents) => {
          const month = new Date()
          const submittedAt = new Date(month.getFullYear(), month.getMonth(), 15, 12, 0, 0).toISOString()
          const approved = approvedCents / 100
          const pending = pendingCents / 100
          const declined = declinedCents / 100
          const extra = extraPendingCents / 100
          const receipts = [
            receipt({
              id: 'approved',
              status: 'approved',
              usdEquivalentAmount: approved,
              purchaseRequest: {
                ...receipt({ id: 'approved', status: 'approved' }).purchaseRequest,
                amount: approved,
                submittedAt,
              },
            }),
            receipt({
              id: 'pending',
              status: 'needs_approval',
              usdEquivalentAmount: pending,
              purchaseRequest: {
                ...receipt({ id: 'pending', status: 'needs_approval' }).purchaseRequest,
                amount: pending,
                submittedAt,
              },
            }),
            receipt({
              id: 'extra',
              status: 'needs_approval',
              usdEquivalentAmount: extra,
              purchaseRequest: {
                ...receipt({ id: 'extra', status: 'needs_approval' }).purchaseRequest,
                amount: extra,
                submittedAt,
              },
            }),
            receipt({
              id: 'declined',
              status: 'declined',
              usdEquivalentAmount: declined,
              purchaseRequest: {
                ...receipt({ id: 'declined', status: 'declined' }).purchaseRequest,
                amount: declined,
                submittedAt,
              },
            }),
          ]
          useSpendGuardStore.setState({ receipts })
          const spend = useSpendGuardStore.getState().committedSpend()
          expect(spend.byCategory.Dining).toBeCloseTo(approved + pending + extra, 2)
          const withoutPending = useSpendGuardStore.getState().committedSpendExcluding('pending')
          expect(withoutPending.byCategory.Dining ?? 0).toBeCloseTo(approved + extra, 2)
        },
      ),
      { numRuns: RUNS },
    )
  })

  it('property 15: JSON round-trip preserves persisted values', () => {
    // Feature: agent-spend-guard, Property 15: Serialization round-trip preserves all persisted types
    const label = fc.stringMatching(/^[A-Za-z][A-Za-z0-9]{0,8}$/)
    const money = fc.integer({ min: 1, max: 100_000 }).map((cents) => cents / 100)
    const ruleSetArb: fc.Arbitrary<RuleSet> = fc.record({
      categoryLimits: fc.array(
        fc.record({
          id: fc.uuid(),
          type: fc.constant('category_limit' as const),
          category: label,
          limitAmountUSD: money,
          createdAt: fc.constant(NOW),
          updatedAt: fc.constant(NOW),
        }),
        { maxLength: 3 },
      ),
      merchantLimits: fc.array(
        fc.record({
          id: fc.uuid(),
          type: fc.constant('merchant_limit' as const),
          merchant: label,
          limitAmountUSD: money,
          createdAt: fc.constant(NOW),
          updatedAt: fc.constant(NOW),
        }),
        { maxLength: 3 },
      ),
      approvalThreshold: fc.option(
        fc.record({
          id: fc.uuid(),
          type: fc.constant('approval_threshold' as const),
          thresholdAmountUSD: money,
          updatedAt: fc.constant(NOW),
        }),
        { nil: null },
      ),
      blockedCategories: fc.array(
        fc.record({
          id: fc.uuid(),
          type: fc.constant('blocked_category' as const),
          category: label,
          createdAt: fc.constant(NOW),
        }),
        { maxLength: 3 },
      ),
    })

    const receiptArb: fc.Arbitrary<IntentReceipt> = fc.record({
      id: fc.uuid(),
      amount: money,
      category: label,
      merchant: label,
      status: fc.constantFrom(
        'auto_approved' as const,
        'needs_approval' as const,
        'approved' as const,
        'declined' as const,
        'expired' as const,
      ),
    }).map((value) =>
      receipt({
        id: value.id,
        status: value.status,
        usdEquivalentAmount: value.amount,
        purchaseRequest: {
          id: value.id,
          agentName: 'Agent',
          merchantName: value.merchant,
          category: value.category,
          amount: value.amount,
          currency: 'USD',
          intentText: 'intent',
          structuredIntent: { intendedCategory: value.category },
          submittedAt: NOW,
        },
      }),
    )

    const cacheArb: fc.Arbitrary<FxRateCache> = fc
      .array(
        fc.record({
          code: fc.stringMatching(/^[A-Z]{3}$/),
          rate: fc.integer({ min: 1, max: 1_000_000 }).map((value) => value / 1_000_000),
          isStale: fc.boolean(),
        }),
        { maxLength: 3 },
      )
      .map((entries) => {
        const cache: FxRateCache = {}
        for (const entry of entries) {
          cache[entry.code] = {
            fromCurrency: entry.code,
            toCurrency: 'USD',
            rate: entry.rate,
            fetchedAt: NOW,
            isStale: entry.isStale,
          }
        }
        return cache
      })

    fc.assert(
      fc.property(ruleSetArb, fc.array(receiptArb, { maxLength: 4 }), cacheArb, (rules, receipts, cache) => {
        expect(JSON.parse(JSON.stringify(rules))).toEqual(rules)
        expect(JSON.parse(JSON.stringify(receipts))).toEqual(receipts)
        expect(JSON.parse(JSON.stringify(cache))).toEqual(cache)
      }),
      { numRuns: RUNS },
    )
  })

  it('property 16: monthly reset expires only older pending purchases', () => {
    // Feature: agent-spend-guard, Property 16: Monthly reset expires only prior-month pending purchases
    fc.assert(
      fc.property(
        fc.integer({ min: 2026, max: 2030 }),
        fc.integer({ min: 2, max: 11 }),
        (year, month) => {
          const earlier = new Date(year, month - 2, 15, 12, 0, 0).toISOString()
          const origin = new Date(year, month - 1, 15, 12, 0, 0).toISOString()
          const current = new Date(year, month, 15, 12, 0, 0).toISOString()
          const lastSeen = `${year}-${String(month).padStart(2, '0')}`
          const receipts = [
            receipt({
              id: 'old',
              status: 'needs_approval',
              purchaseRequest: {
                ...receipt({ id: 'old', status: 'needs_approval' }).purchaseRequest,
                submittedAt: earlier,
              },
            }),
            receipt({
              id: 'previous',
              status: 'needs_approval',
              purchaseRequest: {
                ...receipt({ id: 'previous', status: 'needs_approval' }).purchaseRequest,
                submittedAt: origin,
              },
            }),
            receipt({
              id: 'current',
              status: 'needs_approval',
              purchaseRequest: {
                ...receipt({ id: 'current', status: 'needs_approval' }).purchaseRequest,
                submittedAt: current,
              },
            }),
            receipt({
              id: 'kept',
              status: 'approved',
              purchaseRequest: {
                ...receipt({ id: 'kept', status: 'approved' }).purchaseRequest,
                submittedAt: origin,
              },
            }),
          ]

          useSpendGuardStore.setState({ receipts, lastSeenMonth: lastSeen, hydrated: true })
          useSpendGuardStore.getState().runMonthlyResetIfNeeded(new Date(year, month, 15, 12, 0, 0))
          const after = useSpendGuardStore.getState().receipts
          expect(after.find((entry) => entry.id === 'old')?.status).toBe('expired')
          expect(after.find((entry) => entry.id === 'previous')?.status).toBe('expired')
          expect(after.find((entry) => entry.id === 'current')?.status).toBe('needs_approval')
          expect(after.find((entry) => entry.id === 'kept')?.status).toBe('approved')

          const pure = applyMonthlyReset(receipts, lastSeen, `${year}-${String(month + 1).padStart(2, '0')}`)
          expect(pure.receipts.find((entry) => entry.id === 'current')?.status).toBe('needs_approval')
          expect(pure.receipts.find((entry) => entry.id === 'previous')?.status).toBe('expired')
        },
      ),
      { numRuns: RUNS },
    )
  })

  it('property 17: corrupt storage entries do not wipe the valid ones', () => {
    // Feature: agent-spend-guard, Property 17: Corruption isolation preserves valid entries
    const rules: RuleSet = {
      categoryLimits: [],
      merchantLimits: [],
      approvalThreshold: {
        id: 't',
        type: 'approval_threshold',
        thresholdAmountUSD: 50,
        updatedAt: NOW,
      },
      blockedCategories: [],
    }
    const cache: FxRateCache = {
      EUR: {
        fromCurrency: 'EUR',
        toCurrency: 'USD',
        rate: 1.1,
        fetchedAt: NOW,
        isStale: false,
      },
    }
    const monthly = { lastSeenMonth: '2026-10' }
    const savedReceipt = receipt({ id: 'saved', status: 'approved' })

    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (rulesCorrupt, receiptsCorrupt, fxCorrupt, monthlyCorrupt) => {
          localStorage.clear()
          localStorage.setItem(STORAGE_KEYS.rules, rulesCorrupt ? '{' : JSON.stringify(rules))
          localStorage.setItem(
            STORAGE_KEYS.receipts,
            receiptsCorrupt ? '{' : JSON.stringify([savedReceipt]),
          )
          localStorage.setItem(STORAGE_KEYS.fxCache, fxCorrupt ? '{' : JSON.stringify(cache))
          localStorage.setItem(STORAGE_KEYS.monthly, monthlyCorrupt ? '{' : JSON.stringify(monthly))

          expect(readRules()).toEqual(rulesCorrupt ? {
            categoryLimits: [],
            merchantLimits: [],
            approvalThreshold: null,
            blockedCategories: [],
          } : rules)
          expect(readReceipts()).toEqual(receiptsCorrupt ? [] : [savedReceipt])
          expect(readFxCache()).toEqual(fxCorrupt ? {} : cache)
          expect(readMonthly()).toEqual(monthlyCorrupt ? { lastSeenMonth: null } : monthly)
        },
      ),
      { numRuns: RUNS },
    )
  })
})
