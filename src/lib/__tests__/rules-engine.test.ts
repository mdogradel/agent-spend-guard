import { describe, expect, it } from 'vitest'
import { evaluateRules } from '../rules-engine'
import type {
  CategoryLimit,
  CommittedSpend,
  EngineInput,
  MerchantLimit,
  PurchaseRequest,
  RuleSet,
} from '@/types'

const NOW = '2026-10-30T18:00:00.000Z'

function request(overrides: Partial<PurchaseRequest> = {}): PurchaseRequest {
  return {
    id: 'req-1',
    agentName: 'Agent',
    merchantName: 'Cafe',
    category: 'Dining',
    amount: 40,
    currency: 'USD',
    intentText: 'Lunch under $50',
    structuredIntent: {
      maxBudgetAmount: 50,
      budgetCurrency: 'USD',
      intendedCategory: 'Dining',
    },
    submittedAt: NOW,
    ...overrides,
  }
}

function emptyRules(overrides: Partial<RuleSet> = {}): RuleSet {
  return {
    categoryLimits: [],
    merchantLimits: [],
    approvalThreshold: null,
    blockedCategories: [],
    ...overrides,
  }
}

function noSpend(): CommittedSpend {
  return { byCategory: {}, byMerchant: {} }
}

function input(overrides: Partial<EngineInput> = {}): EngineInput {
  return {
    request: request(),
    usdAmount: 40,
    fxFailed: false,
    rules: emptyRules(),
    committedSpend: noSpend(),
    ...overrides,
  }
}

function categoryLimit(category: string, limitAmountUSD: number): CategoryLimit {
  return {
    id: `cat-${category}`,
    type: 'category_limit',
    category,
    limitAmountUSD,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function merchantLimit(merchant: string, limitAmountUSD: number): MerchantLimit {
  return {
    id: `mer-${merchant}`,
    type: 'merchant_limit',
    merchant,
    limitAmountUSD,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

describe('evaluateRules', () => {
  it('declines an amount of zero and does not evaluate later rules', () => {
    const decision = evaluateRules(
      input({
        request: request({ amount: 0, category: 'Gambling' }),
        usdAmount: 0,
        rules: emptyRules({
          blockedCategories: [
            { id: 'b1', type: 'blocked_category', category: 'Gambling', createdAt: NOW },
          ],
          approvalThreshold: {
            id: 't1',
            type: 'approval_threshold',
            thresholdAmountUSD: 1,
            updatedAt: NOW,
          },
        }),
      }),
      NOW,
    )

    expect(decision.outcome).toBe('declined')
    expect(decision.failures.map((f) => f.ruleType)).toEqual(['invalid_amount'])
    expect(decision.explanation).toMatch(/invalid/i)
  })

  it('declines a negative amount with only an invalid_amount failure', () => {
    const decision = evaluateRules(
      input({ request: request({ amount: -12 }), usdAmount: -12 }),
      NOW,
    )

    expect(decision.outcome).toBe('declined')
    expect(decision.failures).toEqual([
      { ruleType: 'invalid_amount', explanation: 'amount is invalid' },
    ])
  })

  it('routes a failed conversion to needs_approval and short-circuits', () => {
    const decision = evaluateRules(
      input({
        fxFailed: true,
        usdAmount: 0,
        request: request({ category: 'Gambling', amount: 80 }),
        rules: emptyRules({
          blockedCategories: [
            { id: 'b1', type: 'blocked_category', category: 'Gambling', createdAt: NOW },
          ],
        }),
      }),
      NOW,
    )

    expect(decision.outcome).toBe('needs_approval')
    expect(decision.failures.map((f) => f.ruleType)).toEqual(['fx_failed'])
    expect(decision.explanation).toMatch(/conversion could not be completed/i)
  })

  it('declines a blocked category and ignores threshold and limit rules', () => {
    const decision = evaluateRules(
      input({
        request: request({ category: 'Gambling', amount: 500 }),
        usdAmount: 500,
        rules: emptyRules({
          blockedCategories: [
            { id: 'b1', type: 'blocked_category', category: 'gambling', createdAt: NOW },
          ],
          approvalThreshold: {
            id: 't1',
            type: 'approval_threshold',
            thresholdAmountUSD: 50,
            updatedAt: NOW,
          },
          categoryLimits: [categoryLimit('Gambling', 10)],
        }),
        committedSpend: { byCategory: { Gambling: 100 }, byMerchant: {} },
      }),
      NOW,
    )

    expect(decision.outcome).toBe('declined')
    expect(decision.failures.map((f) => f.ruleType)).toEqual(['blocked_category'])
  })

  it('escalates when the USD amount is strictly over the approval threshold', () => {
    const decision = evaluateRules(
      input({
        usdAmount: 50.01,
        request: request({ amount: 50.01 }),
        rules: emptyRules({
          approvalThreshold: {
            id: 't1',
            type: 'approval_threshold',
            thresholdAmountUSD: 50,
            updatedAt: NOW,
          },
        }),
      }),
      NOW,
    )

    expect(decision.outcome).toBe('needs_approval')
    expect(decision.failures.map((f) => f.ruleType)).toEqual(['approval_threshold'])
    expect(decision.explanation).toBe('over your $50.00 threshold')
  })

  it('auto-approves an amount exactly equal to the threshold', () => {
    const decision = evaluateRules(
      input({
        usdAmount: 50,
        request: request({ amount: 50 }),
        rules: emptyRules({
          approvalThreshold: {
            id: 't1',
            type: 'approval_threshold',
            thresholdAmountUSD: 50,
            updatedAt: NOW,
          },
        }),
      }),
      NOW,
    )

    expect(decision.outcome).toBe('auto_approved')
    expect(decision.failures).toEqual([])
  })

  it('escalates a purchase with no intent', () => {
    const decision = evaluateRules(
      input({
        request: request({ intentText: null, structuredIntent: null }),
      }),
      NOW,
    )

    expect(decision.outcome).toBe('needs_approval')
    expect(decision.failures).toEqual([
      { ruleType: 'no_intent', explanation: 'no intent was provided' },
    ])
  })

  it('treats blank intent text and empty structured fields as no intent', () => {
    const decision = evaluateRules(
      input({
        request: request({
          intentText: '   ',
          structuredIntent: { travelDates: [], intendedCategory: '' },
        }),
      }),
      NOW,
    )

    expect(decision.failures.map((f) => f.ruleType)).toContain('no_intent')
  })

  it('auto-approves when committed spend plus the purchase exactly meets the category limit', () => {
    const decision = evaluateRules(
      input({
        usdAmount: 40,
        request: request({ amount: 40 }),
        rules: emptyRules({ categoryLimits: [categoryLimit('Dining', 100)] }),
        committedSpend: { byCategory: { Dining: 60 }, byMerchant: {} },
      }),
      NOW,
    )

    expect(decision.outcome).toBe('auto_approved')
    expect(decision.failures).toEqual([])
  })

  it('escalates when the category limit is exceeded by one cent', () => {
    const decision = evaluateRules(
      input({
        usdAmount: 40.01,
        request: request({ amount: 40.01 }),
        rules: emptyRules({ categoryLimits: [categoryLimit('Dining', 100)] }),
        committedSpend: { byCategory: { Dining: 60 }, byMerchant: {} },
      }),
      NOW,
    )

    expect(decision.outcome).toBe('needs_approval')
    expect(decision.failures.map((f) => f.ruleType)).toEqual(['category_limit'])
    expect(decision.explanation).toBe('puts Dining $0.01 over the $100.00 monthly limit')
  })

  it('collects every non-short-circuit failure and concatenates the explanations', () => {
    const decision = evaluateRules(
      input({
        usdAmount: 220,
        request: request({
          amount: 220,
          category: 'Travel',
          merchantName: 'Airline',
          intentText: null,
          structuredIntent: null,
        }),
        rules: emptyRules({
          approvalThreshold: {
            id: 't1',
            type: 'approval_threshold',
            thresholdAmountUSD: 50,
            updatedAt: NOW,
          },
          categoryLimits: [categoryLimit('Travel', 300)],
          merchantLimits: [merchantLimit('Airline', 100)],
        }),
        committedSpend: { byCategory: { Travel: 200 }, byMerchant: { Airline: 0 } },
      }),
      NOW,
    )

    expect(decision.outcome).toBe('needs_approval')
    expect(decision.failures.map((f) => f.ruleType)).toEqual([
      'approval_threshold',
      'no_intent',
      'category_limit',
      'merchant_limit',
    ])
    expect(decision.explanation).toBe(
      'over your $50.00 threshold and no intent was provided and puts Travel $120.00 over the $300.00 monthly limit and puts Airline $120.00 over the $100.00 monthly merchant limit',
    )
    for (const failure of decision.failures) {
      expect(decision.explanation).toContain(failure.explanation)
    }
  })

  it('auto-approves when every rule passes', () => {
    const decision = evaluateRules(
      input({
        usdAmount: 20,
        request: request({ amount: 20 }),
        rules: emptyRules({
          approvalThreshold: {
            id: 't1',
            type: 'approval_threshold',
            thresholdAmountUSD: 50,
            updatedAt: NOW,
          },
          categoryLimits: [categoryLimit('Dining', 300)],
          merchantLimits: [merchantLimit('Cafe', 100)],
        }),
        committedSpend: { byCategory: { Dining: 10 }, byMerchant: { Cafe: 10 } },
      }),
      NOW,
    )

    expect(decision.outcome).toBe('auto_approved')
    expect(decision.failures).toEqual([])
    expect(decision.explanation).toBe('')
    expect(decision.evaluatedAt).toBe(NOW)
  })
})
