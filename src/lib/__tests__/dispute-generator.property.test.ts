import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { generateDisputeSummary } from '../dispute-generator'
import type { IntentReceipt, MismatchFlag, MismatchFlagType } from '@/types'

const RUNS = 100
const text = fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9 .,]{0,40}$/)

function receipt(partial: {
  intentText: string | null
  mismatches: MismatchFlag[]
  outcome: IntentReceipt['decision']['outcome']
  explanation: string
}): IntentReceipt {
  return {
    id: 'receipt-1',
    purchaseRequest: {
      id: 'receipt-1',
      agentName: 'Agent',
      merchantName: 'Hotel Lisbon',
      category: 'Travel',
      amount: 480,
      currency: 'EUR',
      intentText: partial.intentText,
      structuredIntent: {
        maxBudgetAmount: 500,
        budgetCurrency: 'EUR',
        travelDates: ['2026-11-12', '2026-11-14'],
        intendedCategory: 'Travel',
      },
      travelDates: ['2026-11-12', '2026-11-15'],
      submittedAt: '2026-11-01T10:00:00.000Z',
    },
    usdEquivalentAmount: 528,
    fxRate: {
      fromCurrency: 'EUR',
      toCurrency: 'USD',
      rate: 1.1,
      fetchedAt: '2026-11-01T09:00:00.000Z',
      isStale: false,
    },
    decision: {
      outcome: partial.outcome,
      failures: [],
      explanation: partial.explanation,
      evaluatedAt: '2026-11-01T10:00:00.000Z',
    },
    status: 'needs_approval',
    mismatches: partial.mismatches,
    priceCheckSkipped: false,
    approvedAt: null,
    declinedAt: null,
    overrideLog: null,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
  }
}

describe('dispute generator properties', () => {
  it('property 11: dispute summary contains every required field and no HTML', () => {
    // Feature: agent-spend-guard, Property 11: Dispute summary contains all required fields
    const mismatchType: fc.Arbitrary<MismatchFlagType> = fc.constantFrom(
      'price_mismatch',
      'date_mismatch',
      'category_mismatch',
    )

    fc.assert(
      fc.property(
        fc.option(text, { nil: null }),
        fc.uniqueArray(mismatchType, { minLength: 1, maxLength: 3 }),
        text,
        fc.constantFrom('auto_approved' as const, 'needs_approval' as const, 'declined' as const),
        text,
        (intentText, types, detail, outcome, explanation) => {
          const mismatches = types.map((type) => ({ type, detail: `${type} ${detail}` }))
          const summary = generateDisputeSummary(
            receipt({ intentText, mismatches, outcome, explanation }),
            '2026-11-01T10:00:01.000Z',
          )

          if (intentText && intentText.trim()) {
            expect(summary).toContain(intentText.trim())
          } else {
            expect(summary).toContain('No instruction provided')
          }

          for (const mismatch of mismatches) {
            expect(summary).toContain(mismatch.type)
            expect(summary).toContain(mismatch.detail)
          }

          expect(summary).toContain(outcome)
          expect(summary).toContain(explanation)
          expect(summary).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
          expect(summary).not.toMatch(/<\/?[a-z][^>]*>/i)
        },
      ),
      { numRuns: RUNS },
    )
  })
})
