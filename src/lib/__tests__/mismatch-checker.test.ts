import { describe, expect, it } from 'vitest'
import { checkMismatches } from '../mismatch-checker'
import type { FxRateCache, PurchaseRequest, StructuredIntent } from '@/types'

function purchase(overrides: Partial<PurchaseRequest> = {}): PurchaseRequest {
  return {
    id: 'req-1',
    agentName: 'Agent',
    merchantName: 'Hotel Lisbon',
    category: 'Travel',
    amount: 100,
    currency: 'USD',
    intentText: 'book it',
    structuredIntent: null,
    submittedAt: '2026-10-30T12:00:00.000Z',
    ...overrides,
  }
}

function intent(overrides: Partial<StructuredIntent> = {}): StructuredIntent {
  return {
    maxBudgetAmount: 100,
    budgetCurrency: 'USD',
    intendedCategory: 'Travel',
    ...overrides,
  }
}

function eurRate(rate: number): FxRateCache {
  return {
    EUR: {
      fromCurrency: 'EUR',
      toCurrency: 'USD',
      rate,
      fetchedAt: '2026-10-30T12:00:00.000Z',
      isStale: false,
    },
  }
}

describe('checkMismatches price', () => {
  it('does not flag a USD price inside the 5% grace', () => {
    const result = checkMismatches(
      intent({ maxBudgetAmount: 100, budgetCurrency: 'USD' }),
      'under 100',
      purchase({ amount: 104, currency: 'USD' }),
      104,
      {},
    )
    expect(result.flags).toEqual([])
    expect(result.priceCheckSkipped).toBe(false)
  })

  it('does not flag a USD price sitting exactly on the 5% boundary', () => {
    const result = checkMismatches(
      intent({ maxBudgetAmount: 100, budgetCurrency: 'USD' }),
      'under 100',
      purchase({ amount: 105, currency: 'USD' }),
      105,
      {},
    )
    expect(result.flags.some((flag) => flag.type === 'price_mismatch')).toBe(false)
  })

  it('flags a USD price over the 5% grace', () => {
    const result = checkMismatches(
      intent({ maxBudgetAmount: 100, budgetCurrency: 'USD' }),
      'under 100',
      purchase({ amount: 105.01, currency: 'USD' }),
      105.01,
      {},
    )
    expect(result.flags.map((flag) => flag.type)).toEqual(['price_mismatch'])
  })

  it('compares directly when the purchase currency matches the budget currency', () => {
    const result = checkMismatches(
      intent({ maxBudgetAmount: 500, budgetCurrency: 'EUR' }),
      'hotel under 500 EUR',
      purchase({ amount: 480, currency: 'EUR' }),
      null,
      {},
    )
    expect(result.flags.some((flag) => flag.type === 'price_mismatch')).toBe(false)
    expect(result.priceCheckSkipped).toBe(false)
  })

  it('converts a foreign purchase into the budget currency before comparing', () => {
    // 100 USD / 1.10 = 90.91 EUR, which is over a 80 EUR budget plus 5%.
    const result = checkMismatches(
      intent({ maxBudgetAmount: 80, budgetCurrency: 'EUR' }),
      'keep it under 80 EUR',
      purchase({ amount: 100, currency: 'USD' }),
      100,
      eurRate(1.1),
    )
    expect(result.priceCheckSkipped).toBe(false)
    expect(result.flags.map((flag) => flag.type)).toContain('price_mismatch')
  })

  it('skips the price check when the budget currency rate is missing', () => {
    const result = checkMismatches(
      intent({ maxBudgetAmount: 100, budgetCurrency: 'EUR' }),
      'under 100 EUR',
      purchase({ amount: 100, currency: 'USD' }),
      100,
      {},
    )
    expect(result.flags.some((flag) => flag.type === 'price_mismatch')).toBe(false)
    expect(result.priceCheckSkipped).toBe(true)
    expect(result.priceCheckSkipReason).toMatch(/no rate for EUR/)
  })

  it('skips the price check when the USD equivalent is null', () => {
    const result = checkMismatches(
      intent({ maxBudgetAmount: 100, budgetCurrency: 'USD' }),
      'under 100 USD',
      purchase({ amount: 90, currency: 'EUR' }),
      null,
      {},
    )
    expect(result.flags.some((flag) => flag.type === 'price_mismatch')).toBe(false)
    expect(result.priceCheckSkipped).toBe(true)
    expect(result.priceCheckSkipReason).toMatch(/no rate/)
  })

  it('does not raise a price flag when maxBudgetAmount is absent', () => {
    const result = checkMismatches(
      intent({ maxBudgetAmount: undefined, budgetCurrency: 'USD' }),
      'no budget given',
      purchase({ amount: 999, currency: 'USD' }),
      999,
      {},
    )
    expect(result.flags.some((flag) => flag.type === 'price_mismatch')).toBe(false)
    expect(result.priceCheckSkipped).toBe(false)
  })
})

describe('checkMismatches dates and category', () => {
  it('does not flag an exact date match', () => {
    const dates = ['2026-11-12', '2026-11-14']
    const result = checkMismatches(
      intent({ travelDates: dates }),
      'those dates',
      purchase({ travelDates: [...dates], amount: 100 }),
      100,
      {},
    )
    expect(result.flags.some((flag) => flag.type === 'date_mismatch')).toBe(false)
  })

  it('flags a checkout date that is off by one day', () => {
    const result = checkMismatches(
      intent({ travelDates: ['2026-11-12', '2026-11-14'] }),
      'Nov 12-14',
      purchase({ travelDates: ['2026-11-12', '2026-11-15'], amount: 100 }),
      100,
      {},
    )
    expect(result.flags.map((flag) => flag.type)).toContain('date_mismatch')
  })

  it('does not flag dates when travelDates is absent', () => {
    const result = checkMismatches(
      intent({ travelDates: undefined }),
      'no dates',
      purchase({ travelDates: ['2026-11-15'], amount: 100 }),
      100,
      {},
    )
    expect(result.flags.some((flag) => flag.type === 'date_mismatch')).toBe(false)
  })

  it('does not flag a category that matches after case and trim', () => {
    const result = checkMismatches(
      intent({ intendedCategory: ' travel ' }),
      'travel',
      purchase({ category: 'Travel', amount: 100 }),
      100,
      {},
    )
    expect(result.flags.some((flag) => flag.type === 'category_mismatch')).toBe(false)
  })

  it('flags a category mismatch', () => {
    const result = checkMismatches(
      intent({ intendedCategory: 'Travel' }),
      'travel',
      purchase({ category: 'Dining', amount: 100 }),
      100,
      {},
    )
    expect(result.flags.map((flag) => flag.type)).toContain('category_mismatch')
  })

  it('does not flag a category when intendedCategory is absent', () => {
    const result = checkMismatches(
      intent({ intendedCategory: undefined }),
      'no category',
      purchase({ category: 'Dining', amount: 100 }),
      100,
      {},
    )
    expect(result.flags.some((flag) => flag.type === 'category_mismatch')).toBe(false)
  })
})

describe('checkMismatches no intent', () => {
  it('returns an empty flag list when every structured field and the intent text are absent', () => {
    const result = checkMismatches(
      null,
      null,
      purchase({
        intentText: null,
        structuredIntent: null,
        category: 'Dining',
        amount: 500,
        travelDates: ['2026-11-12'],
      }),
      500,
      {},
    )
    expect(result.flags).toEqual([])
    expect(result.priceCheckSkipped).toBe(false)
  })
})
