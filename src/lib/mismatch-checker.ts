import type {
  FxRateCache,
  MismatchFlag,
  PurchaseRequest,
  StructuredIntent,
} from '@/types'
import { hasNoIntent } from '@/lib/rules-engine'

export interface MismatchResult {
  flags: MismatchFlag[]
  priceCheckSkipped: boolean
  priceCheckSkipReason?: string
}

function currenciesMatch(left: string, right: string): boolean {
  return left.trim().toUpperCase() === right.trim().toUpperCase()
}

function rateToUsd(cache: FxRateCache, currency: string): number | null {
  const code = currency.trim().toUpperCase()
  const entry = cache[code] ?? cache[currency]
  if (!entry || !Number.isFinite(entry.rate) || entry.rate <= 0) return null
  return entry.rate
}

/**
 * Convert the purchase into the intent's budget currency.
 * Same currency: use the purchase amount directly.
 * Otherwise convert the USD equivalent back into the budget currency
 * with the cached USD rate. Returns null when the rate is missing.
 */
function purchaseInBudgetCurrency(
  purchase: PurchaseRequest,
  budgetCurrency: string,
  usdEquivalentAmount: number | null,
  fxCache: FxRateCache,
): { amount: number } | { skipped: string } {
  if (currenciesMatch(purchase.currency, budgetCurrency)) {
    return { amount: purchase.amount }
  }

  if (usdEquivalentAmount == null || !Number.isFinite(usdEquivalentAmount)) {
    return { skipped: 'price check skipped, no rate' }
  }

  if (currenciesMatch(budgetCurrency, 'USD')) {
    return { amount: usdEquivalentAmount }
  }

  const rate = rateToUsd(fxCache, budgetCurrency)
  if (rate == null) {
    return { skipped: `price check skipped, no rate for ${budgetCurrency.trim().toUpperCase()}` }
  }

  return { amount: usdEquivalentAmount / rate }
}

function priceFlag(
  purchase: PurchaseRequest,
  budget: number,
  budgetCurrency: string,
  comparedAmount: number,
): MismatchFlag {
  return {
    type: 'price_mismatch',
    detail: `Purchase of ${purchase.amount} ${purchase.currency.trim().toUpperCase()} compares as ${comparedAmount} ${budgetCurrency.trim().toUpperCase()}, more than 5% over the ${budget} ${budgetCurrency.trim().toUpperCase()} budget`,
  }
}

function checkPrice(
  intent: StructuredIntent | null,
  purchase: PurchaseRequest,
  usdEquivalentAmount: number | null,
  fxCache: FxRateCache,
): { flag: MismatchFlag | null; skipped: boolean; reason?: string } {
  if (
    !intent ||
    intent.maxBudgetAmount == null ||
    !Number.isFinite(intent.maxBudgetAmount) ||
    !intent.budgetCurrency?.trim()
  ) {
    return { flag: null, skipped: false }
  }

  const budget = intent.maxBudgetAmount
  const budgetCurrency = intent.budgetCurrency
  const converted = purchaseInBudgetCurrency(
    purchase,
    budgetCurrency,
    usdEquivalentAmount,
    fxCache,
  )

  if ('skipped' in converted) {
    return { flag: null, skipped: true, reason: converted.skipped }
  }

  if (converted.amount > budget * 1.05) {
    return {
      flag: priceFlag(purchase, budget, budgetCurrency, converted.amount),
      skipped: false,
    }
  }

  return { flag: null, skipped: false }
}

function checkDates(
  intent: StructuredIntent | null,
  purchase: PurchaseRequest,
): MismatchFlag | null {
  const intended = intent?.travelDates
  if (!intended || intended.length === 0) return null
  if (!purchase.travelDates) return null

  const actual = new Set(purchase.travelDates)
  const missing = intended.filter((date) => !actual.has(date))
  if (missing.length === 0) return null

  return {
    type: 'date_mismatch',
    detail: `Intent dates ${intended.join(', ')} do not match purchase dates ${purchase.travelDates.join(', ')}`,
  }
}

function checkCategory(
  intent: StructuredIntent | null,
  purchase: PurchaseRequest,
): MismatchFlag | null {
  const intended = intent?.intendedCategory?.trim()
  if (!intended) return null
  if (purchase.category.trim().toLowerCase() === intended.toLowerCase()) return null

  return {
    type: 'category_mismatch',
    detail: `Intended category ${intended} does not match purchase category ${purchase.category.trim()}`,
  }
}

/**
 * Compare structured intent to the purchase. Returns no flags when the
 * purchase has no intent at all. Price uses a 5% grace in the budget
 * currency. Dates must match exactly. A missing FX rate skips only the
 * price check.
 */
export function checkMismatches(
  structuredIntent: StructuredIntent | null,
  intentText: string | null,
  purchase: PurchaseRequest,
  usdEquivalentAmount: number | null,
  fxCache: FxRateCache,
): MismatchResult {
  const probe: PurchaseRequest = {
    ...purchase,
    intentText,
    structuredIntent,
  }

  if (hasNoIntent(probe)) {
    return { flags: [], priceCheckSkipped: false }
  }

  const price = checkPrice(structuredIntent, purchase, usdEquivalentAmount, fxCache)
  const flags: MismatchFlag[] = []
  if (price.flag) flags.push(price.flag)

  const dateFlag = checkDates(structuredIntent, purchase)
  if (dateFlag) flags.push(dateFlag)

  const categoryFlag = checkCategory(structuredIntent, purchase)
  if (categoryFlag) flags.push(categoryFlag)

  const result: MismatchResult = {
    flags,
    priceCheckSkipped: price.skipped,
  }
  if (price.reason) result.priceCheckSkipReason = price.reason
  return result
}
