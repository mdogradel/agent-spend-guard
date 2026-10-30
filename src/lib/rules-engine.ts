import type { EngineDecision, EngineInput, PurchaseRequest, RuleFailure } from '@/types'

/**
 * USD formatting used in every rules-engine explanation.
 * Example: 50 → "$50.00".
 */
export function formatUSD(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function toCents(amount: number): number {
  return Math.round(amount * 100)
}

/** Case-insensitive, trimmed comparison for category and merchant names. */
export function namesMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/** Sum every map entry whose key matches `name`, ignoring case and surrounding space. */
export function spendFor(map: Record<string, number>, name: string): number {
  const target = name.trim().toLowerCase()
  let total = 0
  for (const [key, value] of Object.entries(map)) {
    if (key.trim().toLowerCase() === target) total += value
  }
  return total
}

/**
 * A purchase has no intent when the instruction is blank and every
 * structured field is absent. Empty strings and empty date lists count
 * as absent.
 */
export function hasNoIntent(request: PurchaseRequest): boolean {
  if (request.intentText?.trim()) return false
  const intent = request.structuredIntent
  if (!intent) return true
  if (intent.maxBudgetAmount != null && Number.isFinite(intent.maxBudgetAmount)) return false
  if (intent.budgetCurrency?.trim()) return false
  if (intent.travelDates && intent.travelDates.length > 0) return false
  if (intent.intendedCategory?.trim()) return false
  return true
}

function decide(
  outcome: EngineDecision['outcome'],
  failures: RuleFailure[],
  evaluatedAt: string,
): EngineDecision {
  return {
    outcome,
    failures,
    explanation: failures.map((failure) => failure.explanation).join(' and '),
    evaluatedAt,
  }
}

/**
 * Pure rules evaluation. No I/O, no clock reads unless the caller omits
 * `evaluatedAt`. Steps 1-3 short-circuit. Steps 4-7 collect every failure.
 * The outcome is `auto_approved` only when the failure list is empty.
 */
export function evaluateRules(
  input: EngineInput,
  evaluatedAt = new Date().toISOString(),
): EngineDecision {
  const { request, usdAmount, fxFailed, rules } = input

  // Step 1. Invalid amount. Runs before every other rule.
  if (!Number.isFinite(request.amount) || request.amount <= 0) {
    return decide(
      'declined',
      [{ ruleType: 'invalid_amount', explanation: 'amount is invalid' }],
      evaluatedAt,
    )
  }

  // Step 2. FX failure. Never auto-approve a purchase we could not price in USD.
  if (fxFailed) {
    return decide(
      'needs_approval',
      [
        {
          ruleType: 'fx_failed',
          explanation: 'currency conversion could not be completed',
        },
      ],
      evaluatedAt,
    )
  }

  // Step 3. Blocked category. Declined, with no override path.
  const blocked = rules.blockedCategories.find((entry) =>
    namesMatch(entry.category, request.category),
  )
  if (blocked) {
    return decide(
      'declined',
      [
        {
          ruleType: 'blocked_category',
          explanation: `category ${blocked.category} is blocked`,
        },
      ],
      evaluatedAt,
    )
  }

  const failures: RuleFailure[] = []

  // Step 4. Approval threshold is strictly greater-than.
  const threshold = rules.approvalThreshold
  if (
    threshold &&
    Number.isFinite(usdAmount) &&
    toCents(usdAmount) > toCents(threshold.thresholdAmountUSD)
  ) {
    failures.push({
      ruleType: 'approval_threshold',
      explanation: `over your ${formatUSD(threshold.thresholdAmountUSD)} threshold`,
    })
  }

  // Step 5. No intent always escalates, unless a short-circuit already fired.
  if (hasNoIntent(request)) {
    failures.push({
      ruleType: 'no_intent',
      explanation: 'no intent was provided',
    })
  }

  // Step 6. Category limits. Exact remaining headroom is still within limit.
  for (const limit of rules.categoryLimits) {
    if (!namesMatch(limit.category, request.category)) continue
    const committed = spendFor(input.committedSpend.byCategory, limit.category)
    const proposedCents = toCents(committed) + toCents(usdAmount)
    const limitCents = toCents(limit.limitAmountUSD)
    if (proposedCents > limitCents) {
      const over = (proposedCents - limitCents) / 100
      failures.push({
        ruleType: 'category_limit',
        explanation: `puts ${limit.category} ${formatUSD(over)} over the ${formatUSD(limit.limitAmountUSD)} monthly limit`,
      })
    }
  }

  // Step 7. Merchant limits. Same headroom rule as categories.
  for (const limit of rules.merchantLimits) {
    if (!namesMatch(limit.merchant, request.merchantName)) continue
    const committed = spendFor(input.committedSpend.byMerchant, limit.merchant)
    const proposedCents = toCents(committed) + toCents(usdAmount)
    const limitCents = toCents(limit.limitAmountUSD)
    if (proposedCents > limitCents) {
      const over = (proposedCents - limitCents) / 100
      failures.push({
        ruleType: 'merchant_limit',
        explanation: `puts ${limit.merchant} ${formatUSD(over)} over the ${formatUSD(limit.limitAmountUSD)} monthly merchant limit`,
      })
    }
  }

  return decide(
    failures.length > 0 ? 'needs_approval' : 'auto_approved',
    failures,
    evaluatedAt,
  )
}
