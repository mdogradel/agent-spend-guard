import { create } from 'zustand'
import { checkMismatches } from '@/lib/mismatch-checker'
import { applyMonthlyReset, getMonthKey } from '@/lib/monthly-reset'
import {
  consumeCorruptReads,
  isLocalStorageAvailable,
  readFxCache,
  readMonthly,
  readReceipts,
  readRules,
  writeFxCache,
  writeMonthly,
  writeReceipts,
  writeRules,
} from '@/lib/persistence'
import { convertToUSD } from '@/lib/fx-service'
import { evaluateRules, formatUSD, namesMatch, spendFor } from '@/lib/rules-engine'
import type {
  CommittedSpend,
  FxRateCache,
  IntentReceipt,
  PurchaseRequest,
  PurchaseStatus,
  RuleSet,
  SpendingRule,
} from '@/types'

export const STORAGE_WARNING_UNAVAILABLE =
  'Browser storage is unavailable. Changes in this session may not be saved.'

export const STORAGE_WARNING_WRITE =
  'A change could not be saved to browser storage. It will last for this session only.'

export const STORAGE_WARNING_CORRUPT =
  'Some saved data could not be read and was reset. Other saved data was kept.'

const COUNTED_STATUSES = new Set<PurchaseStatus>([
  'auto_approved',
  'approved',
  'needs_approval',
])

export function emptyRuleSet(): RuleSet {
  return {
    categoryLimits: [],
    merchantLimits: [],
    approvalThreshold: null,
    blockedCategories: [],
  }
}

function toCents(amount: number): number {
  return Math.round(amount * 100)
}

export function computeCommittedSpend(
  receipts: IntentReceipt[],
  month: string,
  excludeReceiptId?: string,
): CommittedSpend {
  const byCategory: Record<string, number> = {}
  const byMerchant: Record<string, number> = {}

  for (const receipt of receipts) {
    if (excludeReceiptId && receipt.id === excludeReceiptId) continue
    if (!COUNTED_STATUSES.has(receipt.status)) continue
    const submittedAt = receipt.purchaseRequest.submittedAt
    if (getMonthKey(new Date(submittedAt)) !== month) continue

    const usd = receipt.usdEquivalentAmount ?? 0
    const category = receipt.purchaseRequest.category
    const merchant = receipt.purchaseRequest.merchantName
    byCategory[category] = (byCategory[category] ?? 0) + usd
    byMerchant[merchant] = (byMerchant[merchant] ?? 0) + usd
  }

  return { byCategory, byMerchant }
}

/** Overage text for the approval modal. Null means the purchase still fits. */
export function describeOverage(
  receipt: IntentReceipt,
  rules: RuleSet,
  spend: CommittedSpend,
): string | null {
  const usd = receipt.usdEquivalentAmount ?? 0
  const parts: string[] = []

  for (const limit of rules.categoryLimits) {
    if (!namesMatch(limit.category, receipt.purchaseRequest.category)) continue
    const committed = spendFor(spend.byCategory, limit.category)
    const proposed = toCents(committed) + toCents(usd)
    const cap = toCents(limit.limitAmountUSD)
    if (proposed > cap) {
      parts.push(
        `Approving this puts ${limit.category} ${formatUSD((proposed - cap) / 100)} over the ${formatUSD(limit.limitAmountUSD)} monthly limit`,
      )
    }
  }

  for (const limit of rules.merchantLimits) {
    if (!namesMatch(limit.merchant, receipt.purchaseRequest.merchantName)) continue
    const committed = spendFor(spend.byMerchant, limit.merchant)
    const proposed = toCents(committed) + toCents(usd)
    const cap = toCents(limit.limitAmountUSD)
    if (proposed > cap) {
      parts.push(
        `Approving this puts ${limit.merchant} ${formatUSD((proposed - cap) / 100)} over the ${formatUSD(limit.limitAmountUSD)} monthly merchant limit`,
      )
    }
  }

  return parts.length > 0 ? parts.join(' and ') : null
}

function duplicateMessage(rules: RuleSet, rule: SpendingRule, ignoreId: string | null): string | null {
  if (rule.type === 'category_limit') {
    const clash = rules.categoryLimits.some(
      (entry) => entry.id !== ignoreId && entry.category === rule.category,
    )
    if (clash) return `A rule for ${rule.category} already exists`
  }
  if (rule.type === 'merchant_limit') {
    const clash = rules.merchantLimits.some(
      (entry) => entry.id !== ignoreId && entry.merchant === rule.merchant,
    )
    if (clash) return `A rule for ${rule.merchant} already exists`
  }
  if (rule.type === 'blocked_category') {
    const clash = rules.blockedCategories.some(
      (entry) => entry.id !== ignoreId && entry.category === rule.category,
    )
    if (clash) return `A rule for ${rule.category} already exists`
  }
  return null
}

function withRule(rules: RuleSet, rule: SpendingRule): RuleSet {
  switch (rule.type) {
    case 'category_limit':
      return { ...rules, categoryLimits: [...rules.categoryLimits, rule] }
    case 'merchant_limit':
      return { ...rules, merchantLimits: [...rules.merchantLimits, rule] }
    case 'blocked_category':
      return { ...rules, blockedCategories: [...rules.blockedCategories, rule] }
    case 'approval_threshold':
      return { ...rules, approvalThreshold: rule }
  }
}

function replacingRule(rules: RuleSet, rule: SpendingRule): RuleSet {
  switch (rule.type) {
    case 'category_limit':
      return {
        ...rules,
        categoryLimits: rules.categoryLimits.map((entry) => (entry.id === rule.id ? rule : entry)),
      }
    case 'merchant_limit':
      return {
        ...rules,
        merchantLimits: rules.merchantLimits.map((entry) => (entry.id === rule.id ? rule : entry)),
      }
    case 'blocked_category':
      return {
        ...rules,
        blockedCategories: rules.blockedCategories.map((entry) =>
          entry.id === rule.id ? rule : entry,
        ),
      }
    case 'approval_threshold':
      return { ...rules, approvalThreshold: rule }
  }
}

export interface SpendGuardState {
  rules: RuleSet
  receipts: IntentReceipt[]
  fxCache: FxRateCache
  lastSeenMonth: string | null
  storageWarning: boolean
  storageWarningMessage: string | null
  hydrated: boolean

  pendingCount: () => number
  committedSpend: () => CommittedSpend
  committedSpendExcluding: (receiptId: string) => CommittedSpend

  hydrate: () => void
  addRule: (rule: SpendingRule) => string | null
  updateRule: (rule: SpendingRule) => string | null
  deleteRule: (id: string) => void
  submitPurchase: (request: PurchaseRequest) => Promise<IntentReceipt>
  approvePurchase: (receiptId: string) => string | null
  declinePurchase: (receiptId: string) => void
  overridePurchase: (receiptId: string, overageDetail: string) => void
  runMonthlyResetIfNeeded: (asOf?: Date) => void
  dismissStorageWarning: () => void
}

function blankState(): Pick<
  SpendGuardState,
  | 'rules'
  | 'receipts'
  | 'fxCache'
  | 'lastSeenMonth'
  | 'storageWarning'
  | 'storageWarningMessage'
  | 'hydrated'
> {
  return {
    rules: emptyRuleSet(),
    receipts: [],
    fxCache: {},
    lastSeenMonth: null,
    storageWarning: false,
    storageWarningMessage: null,
    hydrated: false,
  }
}

export const useSpendGuardStore = create<SpendGuardState>((set, get) => {
  function commit(ok: boolean, partial: Partial<SpendGuardState>) {
    if (ok) {
      set(partial)
      return
    }
    set({
      ...partial,
      storageWarning: true,
      storageWarningMessage: STORAGE_WARNING_WRITE,
    })
  }

  return {
    ...blankState(),

    pendingCount: () => get().receipts.filter((receipt) => receipt.status === 'needs_approval').length,

    committedSpend: () =>
      computeCommittedSpend(get().receipts, getMonthKey(new Date())),

    committedSpendExcluding: (receiptId: string) =>
      computeCommittedSpend(get().receipts, getMonthKey(new Date()), receiptId),

    hydrate: () => {
      if (get().hydrated) return
      const available = isLocalStorageAvailable()
      const rules = readRules()
      const receipts = readReceipts()
      const fxCache = readFxCache()
      const monthly = readMonthly()
      const corrupt = consumeCorruptReads()

      let storageWarning = false
      let storageWarningMessage: string | null = null
      if (!available) {
        storageWarning = true
        storageWarningMessage = STORAGE_WARNING_UNAVAILABLE
      } else if (corrupt.length > 0) {
        storageWarning = true
        storageWarningMessage = STORAGE_WARNING_CORRUPT
      }

      set({
        rules,
        receipts,
        fxCache,
        lastSeenMonth: monthly.lastSeenMonth,
        hydrated: true,
        storageWarning,
        storageWarningMessage,
      })
    },

    addRule: (rule) => {
      const message = duplicateMessage(get().rules, rule, null)
      if (message) return message
      const rules = withRule(get().rules, rule)
      commit(writeRules(rules), { rules })
      return null
    },

    updateRule: (rule) => {
      const message = duplicateMessage(get().rules, rule, rule.id)
      if (message) return message
      const rules = replacingRule(get().rules, rule)
      commit(writeRules(rules), { rules })
      return null
    },

    deleteRule: (id) => {
      const current = get().rules
      const rules: RuleSet = {
        categoryLimits: current.categoryLimits.filter((rule) => rule.id !== id),
        merchantLimits: current.merchantLimits.filter((rule) => rule.id !== id),
        blockedCategories: current.blockedCategories.filter((rule) => rule.id !== id),
        approvalThreshold: current.approvalThreshold?.id === id ? null : current.approvalThreshold,
      }
      commit(writeRules(rules), { rules })
    },

    submitPurchase: async (request) => {
      const { result, updatedCache } = await convertToUSD(
        request.amount,
        request.currency,
        get().fxCache,
      )
      const fxSaved = writeFxCache(updatedCache)

      const decision = evaluateRules({
        request,
        usdAmount: result.failed ? 0 : result.usdAmount,
        fxFailed: result.failed,
        rules: get().rules,
        committedSpend: get().committedSpend(),
      })

      const mismatch = checkMismatches(
        request.structuredIntent,
        request.intentText,
        request,
        result.failed ? null : result.usdAmount,
        updatedCache,
      )

      const now = new Date().toISOString()
      const status: PurchaseStatus =
        decision.outcome === 'auto_approved'
          ? 'auto_approved'
          : decision.outcome === 'declined'
            ? 'declined'
            : 'needs_approval'

      const currency = request.currency.trim().toUpperCase()
      const cached = updatedCache[currency]
      const fxRate =
        result.failed || currency === 'USD'
          ? null
          : {
              fromCurrency: currency,
              toCurrency: 'USD' as const,
              rate: result.rate,
              fetchedAt: cached?.fetchedAt ?? now,
              isStale: result.isStale,
            }

      const receipt: IntentReceipt = {
        id: request.id,
        purchaseRequest: request,
        usdEquivalentAmount: result.failed ? null : result.usdAmount,
        fxRate,
        decision,
        status,
        mismatches: mismatch.flags,
        priceCheckSkipped: mismatch.priceCheckSkipped,
        ...(mismatch.priceCheckSkipReason
          ? { priceCheckSkipReason: mismatch.priceCheckSkipReason }
          : {}),
        approvedAt: status === 'auto_approved' ? now : null,
        declinedAt: status === 'declined' ? now : null,
        overrideLog: null,
        createdAt: now,
        updatedAt: now,
      }

      const receipts = [receipt, ...get().receipts]
      const receiptsSaved = writeReceipts(receipts)
      commit(fxSaved && receiptsSaved, { fxCache: updatedCache, receipts })
      return receipt
    },

    approvePurchase: (receiptId) => {
      const receipt = get().receipts.find((entry) => entry.id === receiptId)
      if (!receipt || receipt.status !== 'needs_approval') return null

      const overage = describeOverage(
        receipt,
        get().rules,
        get().committedSpendExcluding(receiptId),
      )
      if (overage) return overage

      const now = new Date().toISOString()
      const receipts = get().receipts.map((entry) =>
        entry.id === receiptId
          ? { ...entry, status: 'approved' as const, approvedAt: now, updatedAt: now }
          : entry,
      )
      commit(writeReceipts(receipts), { receipts })
      return null
    },

    declinePurchase: (receiptId) => {
      const now = new Date().toISOString()
      const receipts = get().receipts.map((entry) =>
        entry.id === receiptId && entry.status === 'needs_approval'
          ? { ...entry, status: 'declined' as const, declinedAt: now, updatedAt: now }
          : entry,
      )
      commit(writeReceipts(receipts), { receipts })
    },

    overridePurchase: (receiptId, overageDetail) => {
      const now = new Date().toISOString()
      const receipts = get().receipts.map((entry) =>
        entry.id === receiptId && entry.status === 'needs_approval'
          ? {
              ...entry,
              status: 'approved' as const,
              approvedAt: now,
              updatedAt: now,
              overrideLog: { overriddenAt: now, overageDetail },
            }
          : entry,
      )
      commit(writeReceipts(receipts), { receipts })
    },

    runMonthlyResetIfNeeded: (asOf) => {
      const currentMonth = getMonthKey(asOf ?? new Date())
      const result = applyMonthlyReset(get().receipts, get().lastSeenMonth, currentMonth)
      if (!result.changed) return
      const receiptsSaved = writeReceipts(result.receipts)
      const monthSaved = writeMonthly({ lastSeenMonth: result.lastSeenMonth })
      commit(receiptsSaved && monthSaved, {
        receipts: result.receipts,
        lastSeenMonth: result.lastSeenMonth,
      })
    },

    dismissStorageWarning: () => {
      set({ storageWarning: false, storageWarningMessage: null })
    },
  }
})

export function resetSpendGuardStore() {
  useSpendGuardStore.setState(blankState())
}
