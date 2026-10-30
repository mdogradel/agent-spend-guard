import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { checkMismatches } from '../mismatch-checker'
import type { FxRateCache, PurchaseRequest, StructuredIntent } from '@/types'

const RUNS = 100

function purchase(overrides: Partial<PurchaseRequest>): PurchaseRequest {
  return {
    id: 'req',
    agentName: 'Agent',
    merchantName: 'Shop',
    category: 'Dining',
    amount: 10,
    currency: 'USD',
    intentText: null,
    structuredIntent: null,
    submittedAt: '2026-10-30T12:00:00.000Z',
    ...overrides,
  }
}

describe('mismatch checker properties', () => {
  it('property 8: no-intent purchases return an empty flag list', () => {
    // Feature: agent-spend-guard, Property 8: Mismatch checker returns empty list for no-intent purchases
    const blankIntent = fc.constantFrom<string | null>(null, '', '   ')
    const blankStructured = fc.constantFrom<StructuredIntent | null>(
      null,
      {},
      { travelDates: [], intendedCategory: '  ' },
    )

    fc.assert(
      fc.property(
        blankIntent,
        blankStructured,
        fc.integer({ min: 1, max: 50_000 }),
        fc.stringMatching(/^[A-Za-z][A-Za-z]{0,10}$/),
        fc.constantFrom('2026-11-12', '2027-03-01'),
        (intentText, structuredIntent, amountCents, category, date) => {
          const result = checkMismatches(
            structuredIntent,
            intentText,
            purchase({
              amount: amountCents / 100,
              category,
              currency: 'EUR',
              travelDates: [date],
            }),
            amountCents / 100,
            {},
          )
          expect(result.flags).toEqual([])
        },
      ),
      { numRuns: RUNS },
    )
  })

  it('property 9: price mismatch respects the 5% grace in the budget currency', () => {
    // Feature: agent-spend-guard, Property 9: Price mismatch flag respects 5% grace boundary
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100_000 }),
        fc.integer({ min: 1, max: 200_000 }),
        fc.constantFrom('USD', 'EUR', 'JPY'),
        (budgetCents, amountCents, currency) => {
          const budget = budgetCents / 100
          const amount = amountCents / 100
          const result = checkMismatches(
            {
              maxBudgetAmount: budget,
              budgetCurrency: currency,
              intendedCategory: 'Dining',
            },
            'stay in budget',
            purchase({ amount, currency, category: 'Dining' }),
            null,
            {},
          )
          const flagged = result.flags.some((flag) => flag.type === 'price_mismatch')
          expect(flagged).toBe(amount > budget * 1.05)
          expect(result.priceCheckSkipped).toBe(false)
        },
      ),
      { numRuns: RUNS },
    )
  })

  it('property 10: cross-currency price comparison uses the FX rate', () => {
    // Feature: agent-spend-guard, Property 10: Price comparison converts to budget currency
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 50_000 }),
        fc.integer({ min: 100, max: 50_000 }),
        fc.integer({ min: 50, max: 250 }),
        (amountCents, budgetCents, rateCents) => {
          const amount = amountCents / 100
          const budget = budgetCents / 100
          const rate = rateCents / 100
          const purchaseInBudget = amount / rate
          const convertedOver = purchaseInBudget > budget * 1.05
          const rawOver = amount > budget * 1.05
          fc.pre(convertedOver !== rawOver)

          const cache: FxRateCache = {
            EUR: {
              fromCurrency: 'EUR',
              toCurrency: 'USD',
              rate,
              fetchedAt: '2026-10-30T12:00:00.000Z',
              isStale: false,
            },
          }
          const result = checkMismatches(
            {
              maxBudgetAmount: budget,
              budgetCurrency: 'EUR',
              intendedCategory: 'Dining',
            },
            'budget is in EUR',
            purchase({ amount, currency: 'USD', category: 'Dining' }),
            amount,
            cache,
          )
          const flagged = result.flags.some((flag) => flag.type === 'price_mismatch')
          expect(flagged).toBe(convertedOver)
          expect(flagged).not.toBe(rawOver)
        },
      ),
      { numRuns: RUNS },
    )
  })
})
