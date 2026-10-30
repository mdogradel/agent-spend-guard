import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { evaluateRules } from '../rules-engine'
import type {
  BlockedCategory,
  CategoryLimit,
  CommittedSpend,
  EngineInput,
  MerchantLimit,
  PurchaseRequest,
  RuleSet,
} from '@/types'

const NOW = '2026-10-30T18:10:00.000Z'
const RUNS = 100

const label = fc.stringMatching(/^[A-Za-z][A-Za-z0-9]{0,12}$/)
const cents = (min: number, max: number) =>
  fc.integer({ min, max }).map((value) => value / 100)

function purchase(partial: Partial<PurchaseRequest> & Pick<PurchaseRequest, 'amount' | 'category'>): PurchaseRequest {
  return {
    id: 'req',
    agentName: 'Agent',
    merchantName: 'Cafe',
    currency: 'USD',
    intentText: 'stated intent',
    structuredIntent: { intendedCategory: partial.category, budgetCurrency: 'USD' },
    submittedAt: NOW,
    ...partial,
  }
}

function rules(partial: Partial<RuleSet> = {}): RuleSet {
  return {
    categoryLimits: [],
    merchantLimits: [],
    approvalThreshold: null,
    blockedCategories: [],
    ...partial,
  }
}

function blocked(category: string): BlockedCategory {
  return { id: 'b', type: 'blocked_category', category, createdAt: NOW }
}

function categoryLimit(category: string, limitAmountUSD: number): CategoryLimit {
  return {
    id: 'c',
    type: 'category_limit',
    category,
    limitAmountUSD,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function merchantLimit(merchant: string, limitAmountUSD: number): MerchantLimit {
  return {
    id: 'm',
    type: 'merchant_limit',
    merchant,
    limitAmountUSD,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

describe('rules engine properties', () => {
  it('property 1: blocked category always produces declined', () => {
    // Feature: agent-spend-guard, Property 1: Blocked category always produces declined
    fc.assert(
      fc.property(
        cents(-10_000, 100_000),
        label,
        cents(1, 50_000),
        (amount, category, limit) => {
          const decision = evaluateRules(
            {
              request: purchase({
                amount,
                category,
                merchantName: 'Shop',
                intentText: amount > 0 ? 'intent' : null,
                structuredIntent: amount > 0 ? { intendedCategory: category } : null,
              }),
              usdAmount: Math.max(amount, 0),
              fxFailed: false,
              rules: rules({
                blockedCategories: [blocked(category.toLowerCase())],
                approvalThreshold: {
                  id: 't',
                  type: 'approval_threshold',
                  thresholdAmountUSD: 0.01,
                  updatedAt: NOW,
                },
                categoryLimits: [categoryLimit(category, Math.min(limit, Math.max(amount, 0.01) / 2 || 0.01))],
              }),
              committedSpend: { byCategory: { [category]: limit }, byMerchant: {} },
            },
            NOW,
          )

          expect(decision.outcome).toBe('declined')
          if (amount <= 0) {
            expect(decision.failures.map((failure) => failure.ruleType)).toEqual(['invalid_amount'])
          } else {
            expect(decision.failures.map((failure) => failure.ruleType)).toEqual(['blocked_category'])
          }
        },
      ),
      { numRuns: RUNS },
    )
  })

  it('property 2: rules engine is deterministic', () => {
    // Feature: agent-spend-guard, Property 2: Rules engine is deterministic
    const inputArb: fc.Arbitrary<EngineInput> = fc.record({
      amount: cents(-100, 20_000),
      usdAmount: cents(0, 20_000),
      fxFailed: fc.boolean(),
      category: label,
      merchant: label,
      intentText: fc.option(fc.string({ minLength: 1, maxLength: 24 }), { nil: null }),
      threshold: fc.option(cents(1, 10_000), { nil: null }),
      categoryLimitAmount: fc.option(cents(1, 20_000), { nil: null }),
      committed: cents(0, 20_000),
    }).map((value) => ({
      request: purchase({
        amount: value.amount,
        category: value.category,
        merchantName: value.merchant,
        intentText: value.intentText,
        structuredIntent: value.intentText ? { intendedCategory: value.category } : null,
      }),
      usdAmount: value.usdAmount,
      fxFailed: value.fxFailed,
      rules: rules({
        approvalThreshold: value.threshold == null
          ? null
          : {
              id: 't',
              type: 'approval_threshold',
              thresholdAmountUSD: value.threshold,
              updatedAt: NOW,
            },
        categoryLimits: value.categoryLimitAmount == null
          ? []
          : [categoryLimit(value.category, value.categoryLimitAmount)],
        merchantLimits: [merchantLimit(value.merchant, value.categoryLimitAmount ?? 100)],
      }),
      committedSpend: {
        byCategory: { [value.category]: value.committed },
        byMerchant: { [value.merchant]: value.committed },
      },
    }))

    fc.assert(
      fc.property(inputArb, (input) => {
        expect(evaluateRules(input, NOW)).toEqual(evaluateRules(input, NOW))
      }),
      { numRuns: RUNS },
    )
  })

  it('property 3: auto-approval iff the failure list is empty', () => {
    // Feature: agent-spend-guard, Property 3: Auto-approval iff failure list is empty
    const inputArb: fc.Arbitrary<EngineInput> = fc.record({
      amount: cents(-50, 5_000),
      fxFailed: fc.boolean(),
      category: label,
      blocked: fc.boolean(),
      overThreshold: fc.boolean(),
      noIntent: fc.boolean(),
    }).map((value) => ({
      request: purchase({
        amount: value.amount,
        category: value.category,
        intentText: value.noIntent ? null : 'intent',
        structuredIntent: value.noIntent ? null : { intendedCategory: value.category },
      }),
      usdAmount: value.amount > 0 ? value.amount : 0,
      fxFailed: value.fxFailed,
      rules: rules({
        blockedCategories: value.blocked ? [blocked(value.category)] : [],
        approvalThreshold: {
          id: 't',
          type: 'approval_threshold',
          thresholdAmountUSD: value.overThreshold ? 0.01 : 1_000_000,
          updatedAt: NOW,
        },
      }),
      committedSpend: { byCategory: {}, byMerchant: {} },
    }))

    fc.assert(
      fc.property(inputArb, (input) => {
        const decision = evaluateRules(input, NOW)
        if (decision.failures.length === 0) {
          expect(decision.outcome).toBe('auto_approved')
        } else {
          expect(decision.outcome === 'needs_approval' || decision.outcome === 'declined').toBe(true)
          expect(decision.outcome).not.toBe('auto_approved')
        }
      }),
      { numRuns: RUNS },
    )
  })

  it('property 4: exact headroom is not escalated', () => {
    // Feature: agent-spend-guard, Property 4: Exact headroom is not escalated
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 1_000_000 }).chain((limitCents) =>
          fc.integer({ min: 0, max: limitCents - 1 }).map((committedCents) => ({
            limit: limitCents / 100,
            committed: committedCents / 100,
            amount: (limitCents - committedCents) / 100,
          })),
        ),
        label,
        label,
        ({ limit, committed, amount }, category, merchant) => {
          const spend: CommittedSpend = {
            byCategory: { [category]: committed },
            byMerchant: { [merchant]: committed },
          }
          const decision = evaluateRules(
            {
              request: purchase({
                amount,
                category,
                merchantName: merchant,
                intentText: 'within budget',
                structuredIntent: { intendedCategory: category, budgetCurrency: 'USD' },
              }),
              usdAmount: amount,
              fxFailed: false,
              rules: rules({
                approvalThreshold: {
                  id: 't',
                  type: 'approval_threshold',
                  thresholdAmountUSD: amount + 1,
                  updatedAt: NOW,
                },
                categoryLimits: [categoryLimit(category, limit)],
                merchantLimits: [merchantLimit(merchant, limit)],
              }),
              committedSpend: spend,
            },
            NOW,
          )

          expect(decision.failures.some((failure) => failure.ruleType === 'category_limit')).toBe(false)
          expect(decision.failures.some((failure) => failure.ruleType === 'merchant_limit')).toBe(false)
          expect(decision.outcome).toBe('auto_approved')
        },
      ),
      { numRuns: RUNS },
    )
  })

  it('property 5: invalid amount always produces declined', () => {
    // Feature: agent-spend-guard, Property 5: Invalid amount always produces declined
    fc.assert(
      fc.property(
        cents(-100_000, 0),
        label,
        fc.boolean(),
        fc.boolean(),
        (amount, category, fxFailed, blockedToo) => {
          const decision = evaluateRules(
            {
              request: purchase({
                amount,
                category,
                intentText: null,
                structuredIntent: null,
              }),
              usdAmount: 0,
              fxFailed,
              rules: rules({
                blockedCategories: blockedToo ? [blocked(category)] : [],
                approvalThreshold: {
                  id: 't',
                  type: 'approval_threshold',
                  thresholdAmountUSD: 1,
                  updatedAt: NOW,
                },
                categoryLimits: [categoryLimit(category, 1)],
              }),
              committedSpend: { byCategory: { [category]: 100 }, byMerchant: {} },
            },
            NOW,
          )

          expect(decision.outcome).toBe('declined')
          expect(decision.failures.map((failure) => failure.ruleType)).toEqual(['invalid_amount'])
        },
      ),
      { numRuns: RUNS },
    )
  })

  it('property 6: no-intent purchase is always escalated', () => {
    // Feature: agent-spend-guard, Property 6: No-intent purchase is always escalated
    fc.assert(
      fc.property(cents(1, 10_000), label, label, (amount, category, merchant) => {
        const decision = evaluateRules(
          {
            request: purchase({
              amount,
              category,
              merchantName: merchant,
              intentText: null,
              structuredIntent: null,
            }),
            usdAmount: amount,
            fxFailed: false,
            rules: rules({
              blockedCategories: [blocked(`not-${category}`)],
              categoryLimits: [categoryLimit(category, amount + 100)],
            }),
            committedSpend: { byCategory: {}, byMerchant: {} },
          },
          NOW,
        )

        expect(decision.failures.some((failure) => failure.ruleType === 'no_intent')).toBe(true)
        expect(decision.outcome).not.toBe('auto_approved')
      }),
      { numRuns: RUNS },
    )
  })

  it('property 7: explanation string contains all failure clauses', () => {
    // Feature: agent-spend-guard, Property 7: Explanation string contains all failure clauses
    fc.assert(
      fc.property(
        fc.integer({ min: 200, max: 100_000 }).map((value) => value / 100),
        label,
        label,
        (amount, category, merchant) => {
          const decision = evaluateRules(
            {
              request: purchase({
                amount,
                category,
                merchantName: merchant,
                intentText: '   ',
                structuredIntent: { travelDates: [] },
              }),
              usdAmount: amount,
              fxFailed: false,
              rules: rules({
                approvalThreshold: {
                  id: 't',
                  type: 'approval_threshold',
                  thresholdAmountUSD: 1,
                  updatedAt: NOW,
                },
                categoryLimits: [categoryLimit(category, 1)],
                merchantLimits: [merchantLimit(merchant, 1)],
              }),
              committedSpend: { byCategory: {}, byMerchant: {} },
            },
            NOW,
          )

          expect(decision.failures.length).toBeGreaterThanOrEqual(2)
          for (const failure of decision.failures) {
            expect(decision.explanation).toContain(failure.explanation)
          }
        },
      ),
      { numRuns: RUNS },
    )
  })
})
