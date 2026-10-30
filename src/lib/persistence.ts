import type { RuleSet, IntentReceipt, FxRateCache, MonthlyResetState } from '@/types'

// ────────────────────────────────────────────────────────────
// Storage keys
// ────────────────────────────────────────────────────────────

export const STORAGE_KEYS = {
  rules:   'asg_rules',
  receipts: 'asg_receipts',
  fxCache:  'asg_fx_cache',
  monthly:  'asg_monthly',
} as const

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]

const corruptReads = new Set<string>()

/** Keys whose last read failed JSON parsing. Cleared when consumed. */
export function consumeCorruptReads(): string[] {
  const keys = [...corruptReads]
  corruptReads.clear()
  return keys
}

// ────────────────────────────────────────────────────────────
// localStorage availability guard
// ────────────────────────────────────────────────────────────

/**
 * Returns false in environments where localStorage is unavailable
 * (e.g. private browsing with strict settings, SSR context).
 */
export function isLocalStorageAvailable(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const probe = '__asg_probe__'
    localStorage.setItem(probe, '1')
    localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

// ────────────────────────────────────────────────────────────
// Safe read / write
// ────────────────────────────────────────────────────────────

/**
 * Read a value from localStorage and JSON-parse it.
 * Returns `fallback` if the key is missing, localStorage is unavailable,
 * or the stored value cannot be parsed (corrupt entry is discarded).
 * Corrupt entries are isolated — failure on one key does not affect others.
 */
export function safeRead<T>(key: string, fallback: T): T {
  if (!isLocalStorageAvailable()) return fallback
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    console.warn(`[asg] corrupt entry for key "${key}", resetting to fallback`)
    corruptReads.add(key)
    return fallback
  }
}

/**
 * JSON-serialize a value and write it to localStorage.
 * Returns true on success, false on any failure (QuotaExceededError,
 * SecurityError, localStorage unavailable).
 * Callers should treat a false return as a signal to show the storage warning.
 */
export function safeWrite<T>(key: string, value: T): boolean {
  if (!isLocalStorageAvailable()) return false
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    // QuotaExceededError or SecurityError
    return false
  }
}

// ────────────────────────────────────────────────────────────
// Typed convenience helpers
// ────────────────────────────────────────────────────────────

const DEFAULT_RULE_SET: RuleSet = {
  categoryLimits: [],
  merchantLimits: [],
  approvalThreshold: null,
  blockedCategories: [],
}

const DEFAULT_MONTHLY: MonthlyResetState = { lastSeenMonth: null }

export function readRules(): RuleSet {
  return safeRead<RuleSet>(STORAGE_KEYS.rules, DEFAULT_RULE_SET)
}

export function writeRules(rules: RuleSet): boolean {
  return safeWrite(STORAGE_KEYS.rules, rules)
}

export function readReceipts(): IntentReceipt[] {
  return safeRead<IntentReceipt[]>(STORAGE_KEYS.receipts, [])
}

export function writeReceipts(receipts: IntentReceipt[]): boolean {
  return safeWrite(STORAGE_KEYS.receipts, receipts)
}

export function readFxCache(): FxRateCache {
  return safeRead<FxRateCache>(STORAGE_KEYS.fxCache, {})
}

export function writeFxCache(cache: FxRateCache): boolean {
  return safeWrite(STORAGE_KEYS.fxCache, cache)
}

export function readMonthly(): MonthlyResetState {
  return safeRead<MonthlyResetState>(STORAGE_KEYS.monthly, DEFAULT_MONTHLY)
}

export function writeMonthly(state: MonthlyResetState): boolean {
  return safeWrite(STORAGE_KEYS.monthly, state)
}
